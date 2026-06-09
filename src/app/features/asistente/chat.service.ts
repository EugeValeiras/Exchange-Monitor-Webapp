import { Injectable, Signal, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  AgentChatService,
  AgentEvent,
} from '../../core/services/agent-chat.service';
import {
  AgentThreadsService,
  PersistedMessage,
  ThreadDetail,
  ThreadSummary as PersistedThreadSummary,
} from '../../core/services/agent-threads.service';

// ============================================================================
// MODEL INTERFACES (UI-facing shapes consumed by the asistente components)
// ============================================================================

export type AgentModel = 'sonnet' | 'opus' | 'haiku';

export interface ImageAttachment {
  /** base64, NO `data:` prefix. */
  data: string;
  /** e.g. 'image/jpeg' | 'image/png'. */
  mediaType: string;
  /** object URL for instant local display in the user bubble. */
  previewUrl: string;
}

export interface ToolRecord {
  id: string;
  name: string;
  input?: unknown;
  /** undefined while pending. */
  result?: string;
  isError?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  tools: ToolRecord[];
  /** user: local object URLs (preview). */
  imageUrls?: string[];
  error?: string;
  /** true on the assistant msg during the in-flight turn. */
  streaming?: boolean;
}

export interface ThreadSummary {
  id: string;
  title: string;
  model: AgentModel;
  claudeSessionId?: string;
  messageCount: number;
  lastMessagePreview?: string;
  costUsd?: number;
  updatedAt: string;
  createdAt: string;
}

export interface UsageInfo {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  costUsd?: number;
}

// ============================================================================
// SERVICE
//
// Thin reactive state store on top of the existing AgentChatService (SSE) and
// AgentThreadsService (CRUD). Owns the open-conversation signals plus the
// thread list, and drives the streaming turn loop.
// ============================================================================

@Injectable({ providedIn: 'root' })
export class ChatService {
  private agent = inject(AgentChatService);
  private threadsApi = inject(AgentThreadsService);

  // --- Open conversation ---
  private _messages = signal<ChatMessage[]>([]);
  readonly messages: Signal<ChatMessage[]> = this._messages.asReadonly();

  private _streaming = signal(false);
  readonly streaming: Signal<boolean> = this._streaming.asReadonly();

  private _loadingThread = signal(false);
  readonly loadingThread: Signal<boolean> = this._loadingThread.asReadonly();

  private _currentThreadId = signal<string | null>(null);
  readonly currentThreadId: Signal<string | null> = this._currentThreadId.asReadonly();

  private _model = signal<AgentModel>('sonnet');
  readonly model: Signal<AgentModel> = this._model.asReadonly();

  private _lastUsage = signal<UsageInfo | null>(null);
  readonly lastUsage: Signal<UsageInfo | null> = this._lastUsage.asReadonly();

  /** Cumulative usage for the open thread (seeded from the thread detail and
   *  kept in sync via the per-turn `usage` events). */
  private _threadTotals = signal<UsageInfo>({ inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0 });
  readonly threadTotals: Signal<UsageInfo> = this._threadTotals.asReadonly();

  // --- Thread list ---
  private _threads = signal<ThreadSummary[]>([]);
  readonly threads: Signal<ThreadSummary[]> = this._threads.asReadonly();

  private _loadingThreads = signal(false);
  readonly loadingThreads: Signal<boolean> = this._loadingThreads.asReadonly();

  // --- Internal stream state ---
  private _abort: AbortController | null = null;
  private _claudeSessionId: string | null = null;

  // ==========================================================================
  // Mutations
  // ==========================================================================

  setModel(model: AgentModel): void {
    this._model.set(model);
  }

  /**
   * Fetch the authoritative cumulative usage for the open thread straight from
   * the API (the backend accumulates it via $inc). Keeps `/usage` correct even
   * if the in-memory accumulator is stale or the page was just reloaded.
   */
  async refreshThreadTotals(): Promise<void> {
    const id = this._currentThreadId();
    if (!id) return;
    try {
      const detail = await firstValueFrom(this.threadsApi.get(id));
      this._threadTotals.set({
        inputTokens: detail.inputTokens ?? 0,
        outputTokens: detail.outputTokens ?? 0,
        cachedTokens: detail.cachedTokens ?? 0,
        costUsd: detail.costUsd ?? 0,
      });
    } catch {
      /* keep the in-memory accumulator on error */
    }
  }

  /** GET /agent/threads -> _threads. Fire-and-forget. */
  loadThreads(): void {
    this._loadingThreads.set(true);
    firstValueFrom(this.threadsApi.list())
      .then((list) =>
        this._threads.set(Array.isArray(list) ? list.map((t) => this.mapSummary(t)) : []),
      )
      .catch(() => {
        /* leave the previous list in place on error */
      })
      .finally(() => this._loadingThreads.set(false));
  }

  /** Clear the open conversation and start fresh. */
  newConversation(): void {
    if (this._streaming()) {
      this.stop();
    }
    this.revokeLocalImageUrls();
    this._messages.set([]);
    this._currentThreadId.set(null);
    this._claudeSessionId = null;
    this._lastUsage.set(null);
    this._threadTotals.set({ inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0 });
  }

  /** GET /agent/threads/:id; map entries -> ChatMessage; set model/session. */
  async openThread(id: string): Promise<void> {
    if (this._streaming()) {
      this.stop();
    }
    this.revokeLocalImageUrls();
    this._loadingThread.set(true);
    this._messages.set([]);
    this._lastUsage.set(null);
    try {
      const detail: ThreadDetail = await firstValueFrom(this.threadsApi.get(id));
      this._currentThreadId.set(detail.id);
      this._claudeSessionId = detail.claudeSessionId ?? null;
      this._threadTotals.set({
        inputTokens: detail.inputTokens ?? 0,
        outputTokens: detail.outputTokens ?? 0,
        cachedTokens: detail.cachedTokens ?? 0,
        costUsd: detail.costUsd ?? 0,
      });
      if (detail.model) {
        this._model.set(detail.model);
      }
      const messages: ChatMessage[] = (detail.messages ?? []).map((entry) =>
        this.mapEntry(entry),
      );
      this._messages.set(messages);
    } catch {
      this._currentThreadId.set(null);
    } finally {
      this._loadingThread.set(false);
    }
  }

  /** PATCH /agent/threads/:id then refresh the thread list. */
  async renameThread(id: string, title: string): Promise<void> {
    await firstValueFrom(this.threadsApi.rename(id, title));
    this.loadThreads();
  }

  /** DELETE /agent/threads/:id; if current -> newConversation(); refresh list. */
  async deleteThread(id: string): Promise<void> {
    await firstValueFrom(this.threadsApi.delete(id));
    if (this._currentThreadId() === id) {
      this.newConversation();
    }
    this.loadThreads();
  }

  /**
   * Pushes a user message + a streaming assistant message, opens the SSE
   * stream via AgentChatService (which handles its own sync fallback),
   * dispatches events into the assistant message, and refreshes the thread
   * list when the turn completes. No-op if already streaming or input empty.
   *
   * NOTE: the backend streaming contract does not transport image payloads,
   * so attachments are shown locally in the user bubble but not uploaded.
   */
  async sendMessage(text: string, images?: ImageAttachment[]): Promise<void> {
    const trimmed = (text ?? '').trim();
    if (this._streaming()) {
      return;
    }
    if (!trimmed && (!images || images.length === 0)) {
      return;
    }

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: trimmed,
      tools: [],
      imageUrls: images && images.length ? images.map((i) => i.previewUrl) : undefined,
    };

    const assistantId = crypto.randomUUID();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      text: '',
      tools: [],
      streaming: true,
    };

    this._messages.update((msgs) => [...msgs, userMsg, assistantMsg]);
    this._streaming.set(true);

    const ctrl = new AbortController();
    this._abort = ctrl;

    let sawText = false;
    try {
      for await (const ev of this.agent.stream({
        message: trimmed,
        sessionId: this._claudeSessionId ?? undefined,
        threadId: this._currentThreadId() ?? undefined,
        model: this._model(),
        signal: ctrl.signal,
      })) {
        if (ev.type === 'text') {
          sawText = true;
        }
        this.applyEvent(ev, assistantId);
      }
    } catch (e) {
      if (ctrl.signal.aborted) {
        // User pressed Stop -> keep partial text, no error.
      } else if (sawText) {
        this.setAssistantError(assistantId, 'Se interrumpió la respuesta del agente.');
      } else {
        this.setAssistantError(assistantId, 'No se pudo contactar al agente.');
      }
    } finally {
      this.markNotStreaming(assistantId);
      this._streaming.set(false);
      this._abort = null;
      this.loadThreads();
    }
  }

  /** Abort the in-flight turn; keep partial text. */
  stop(): void {
    this._abort?.abort();
  }

  // ==========================================================================
  // Event application
  // ==========================================================================

  private applyEvent(ev: AgentEvent, assistantId: string): void {
    switch (ev.type) {
      case 'thread':
        if (this._currentThreadId() === null) {
          this._currentThreadId.set(ev.threadId);
        }
        break;

      case 'session':
        this._claudeSessionId = ev.sessionId;
        break;

      case 'text':
        this.patchAssistant(assistantId, (m) => ({ ...m, text: m.text + ev.text }));
        break;

      case 'tool_use':
        this.patchAssistant(assistantId, (m) => ({
          ...m,
          tools: [
            ...m.tools,
            { id: ev.id, name: ev.name, input: ev.input } as ToolRecord,
          ],
        }));
        break;

      case 'tool_result':
        this.patchAssistant(assistantId, (m) => ({
          ...m,
          tools: m.tools.map((t) =>
            t.id === ev.toolUseId
              ? { ...t, result: ev.content, isError: ev.isError }
              : t,
          ),
        }));
        break;

      case 'usage':
        this._lastUsage.set({
          inputTokens: ev.inputTokens,
          outputTokens: ev.outputTokens,
          cachedTokens: ev.cachedTokens,
          costUsd: ev.costUsd,
        });
        // Mirror the backend's $inc so the cumulative view stays in sync.
        this._threadTotals.update((t) => ({
          inputTokens: t.inputTokens + (ev.inputTokens ?? 0),
          outputTokens: t.outputTokens + (ev.outputTokens ?? 0),
          cachedTokens: t.cachedTokens + (ev.cachedTokens ?? 0),
          costUsd: (t.costUsd ?? 0) + (ev.costUsd ?? 0),
        }));
        break;

      case 'done':
        if (ev.sessionId) {
          this._claudeSessionId = ev.sessionId;
        }
        break;

      case 'error':
        this.patchAssistant(assistantId, (m) => ({ ...m, error: ev.message }));
        break;
    }
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private patchAssistant(
    assistantId: string,
    fn: (m: ChatMessage) => ChatMessage,
  ): void {
    this._messages.update((msgs) =>
      msgs.map((m) => (m.id === assistantId ? fn(m) : m)),
    );
  }

  private setAssistantError(assistantId: string, error: string): void {
    this.patchAssistant(assistantId, (m) => ({ ...m, error }));
  }

  private markNotStreaming(assistantId: string): void {
    this.patchAssistant(assistantId, (m) =>
      m.streaming ? { ...m, streaming: false } : m,
    );
  }

  private mapEntry(entry: PersistedMessage): ChatMessage {
    return {
      id: entry.id,
      role: entry.role,
      text: entry.text ?? '',
      tools: (entry.tools ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        input: t.input,
        result: t.result,
        isError: t.isError,
      })),
      error: entry.error,
      streaming: false,
    };
  }

  private mapSummary(t: PersistedThreadSummary): ThreadSummary {
    return {
      id: t.id,
      title: t.title,
      model: t.model,
      claudeSessionId: t.claudeSessionId ?? undefined,
      messageCount: t.messageCount,
      lastMessagePreview: t.lastMessagePreview || undefined,
      costUsd: t.costUsd,
      updatedAt: t.updatedAt,
      createdAt: t.createdAt,
    };
  }

  private revokeLocalImageUrls(): void {
    for (const m of this._messages()) {
      if (m.role === 'user' && m.imageUrls) {
        for (const url of m.imageUrls) {
          if (url.startsWith('blob:')) {
            URL.revokeObjectURL(url);
          }
        }
      }
    }
  }
}
