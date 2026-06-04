import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  OnDestroy,
  OnInit,
  Output,
  signal,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AgentChatService, AgentEvent } from '../../core/services/agent-chat.service';
import {
  AgentThreadsService,
  PersistedMessage,
  ThreadDetail,
  ThreadSummary,
} from '../../core/services/agent-threads.service';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  tools: ToolUseRecord[];
  streaming?: boolean;
  error?: string;
  emittedActions?: Set<string>;
}

interface ToolUseRecord {
  id: string;
  name: string;
  input: unknown;
  result?: string;
  isError?: boolean;
}

export type AnnotationChart = 'price' | 'rsi';

export interface AnnotationBase {
  id?: string;
  chart: AnnotationChart;
  label?: string;
  color?: string;
}

export interface HorizontalLineAnnotation extends AnnotationBase {
  type: 'horizontal-line';
  value: number;
}

export interface TrendLineAnnotation extends AnnotationBase {
  type: 'trend-line' | 'divergence';
  from: { t: number; y: number };
  to: { t: number; y: number };
  variant?: 'bullish' | 'bearish';
}

export interface MarkerAnnotation extends AnnotationBase {
  type: 'marker';
  t: number;
  y: number;
}

export type ChartAnnotation =
  | HorizontalLineAnnotation
  | TrendLineAnnotation
  | MarkerAnnotation;

export interface ChartAction {
  symbol?: string;
  timeframe?: '15m' | '1h' | '4h' | '1d';
  exchange?: 'binance' | 'kraken';
  annotations?: ChartAnnotation[];
  clearAnnotations?: boolean;
}

@Component({
  selector: 'app-agent-chat',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  template: `
    <div class="chat-root">
      <div class="chat-header">
        <div class="title">
          <mat-icon>smart_toy</mat-icon>
        </div>
        <div class="controls">
          <select [(ngModel)]="model" class="model-select" [disabled]="streaming()">
            <option value="sonnet">Sonnet</option>
            <option value="opus">Opus</option>
            <option value="haiku">Haiku</option>
          </select>
          <button
            mat-icon-button
            matTooltip="Historial"
            (click)="toggleHistory()">
            <mat-icon>{{ historyOpen() ? 'close' : 'history' }}</mat-icon>
          </button>
          <button
            mat-icon-button
            matTooltip="Nueva conversación"
            (click)="startNewThread()"
            [disabled]="streaming()">
            <mat-icon>add</mat-icon>
          </button>
          <button
            mat-icon-button
            [matTooltip]="fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'"
            (click)="toggleFullscreen.emit()">
            <mat-icon>{{ fullscreen ? 'fullscreen_exit' : 'fullscreen' }}</mat-icon>
          </button>
          <button
            mat-icon-button
            matTooltip="Colapsar panel"
            (click)="collapse.emit()">
            <mat-icon>chevron_right</mat-icon>
          </button>
        </div>
      </div>

      @if (historyOpen()) {
        <div class="history-panel">
          @if (historyLoading()) {
            <div class="history-loading">Cargando…</div>
          } @else if (!threads().length) {
            <div class="history-empty">Todavía no tenés conversaciones guardadas.</div>
          } @else {
            <ul class="thread-list">
              @for (t of threads(); track t.id) {
                <li class="thread-row" [class.active]="t.id === activeThreadId()">
                  <button class="thread-btn" (click)="loadThread(t.id)">
                    <div class="thread-title">{{ t.title || '(sin título)' }}</div>
                    <div class="thread-meta">
                      <span>{{ t.messageCount }} msg</span>
                      <span>·</span>
                      <span>{{ formatRelative(t.updatedAt) }}</span>
                      @if (t.costUsd) {
                        <span>·</span>
                        <span>\${{ t.costUsd.toFixed(3) }}</span>
                      }
                    </div>
                  </button>
                  <button class="thread-delete" matTooltip="Borrar"
                    (click)="deleteThread(t.id, $event)"
                    [disabled]="streaming()">
                    <mat-icon>delete_outline</mat-icon>
                  </button>
                </li>
              }
            </ul>
          }
        </div>
      }

      <div class="chat-messages" #scrollContainer [class.hidden]="historyOpen()">
        @if (!messages().length) {
          <div class="empty-state">
            <mat-icon>auto_awesome</mat-icon>
            <p>Hablá con el agente sobre tu portfolio o el mercado.</p>
            <p class="hint">Podés preguntarle cosas como:</p>
            <ul class="suggestions">
              <li (click)="quickSend('Dame un resumen de mi portfolio')">
                Dame un resumen de mi portfolio
              </li>
              <li (click)="quickSend('Analizá BTC en 4h (RSI, MACD, medias)')">
                Analizá BTC en 4h (RSI, MACD, medias)
              </li>
              <li (click)="quickSend('Qué par de Binance viene mejor en 7d?')">
                Qué par de Binance viene mejor en 7d?
              </li>
              <li (click)="quickSend('Si vendo 1000 NEXO, cuánto realizo?')">
                Si vendo 1000 NEXO, cuánto realizo?
              </li>
            </ul>
          </div>
        }

        @for (msg of messages(); track msg.id) {
          <div class="message" [class.user]="msg.role === 'user'" [class.assistant]="msg.role === 'assistant'">
            <div class="bubble">
              @if (msg.tools.length) {
                <div class="tools">
                  @for (t of msg.tools; track t.id) {
                    <div class="tool" [class.error]="t.isError">
                      <mat-icon>terminal</mat-icon>
                      <div class="tool-body">
                        <div class="tool-name">{{ t.name }}{{ toolCommand(t) }}</div>
                        @if (t.result) {
                          <details class="tool-result">
                            <summary>Ver resultado</summary>
                            <pre>{{ t.result }}</pre>
                          </details>
                        } @else {
                          <span class="tool-pending">corriendo…</span>
                        }
                      </div>
                    </div>
                  }
                </div>
              }
              @if (msg.text) {
                <div class="text" [innerHTML]="renderMarkdown(msg.text)"></div>
              }
              @if (msg.streaming && !msg.text) {
                <span class="thinking">pensando…</span>
              }
              @if (msg.error) {
                <div class="error">
                  <mat-icon>error_outline</mat-icon>
                  {{ msg.error }}
                </div>
              }
            </div>
          </div>
        }

        @if (lastUsage(); as u) {
          <div class="usage">
            <span>tokens in: {{ u.inputTokens }}</span>
            <span>out: {{ u.outputTokens }}</span>
            <span>cached: {{ u.cachedTokens }}</span>
            @if (u.costUsd) {
              <span>cost: \${{ u.costUsd.toFixed(4) }}</span>
            }
          </div>
        }
      </div>

      <div class="chat-input">
        <textarea
          [(ngModel)]="draft"
          (keydown.enter)="onEnter($event)"
          placeholder="Preguntale al agente..."
          rows="2"
          [disabled]="streaming()"></textarea>
        @if (streaming()) {
          <button mat-stroked-button color="warn" (click)="cancel()">
            <mat-icon>stop</mat-icon>
            Cancelar
          </button>
        } @else {
          <button
            mat-flat-button
            color="primary"
            (click)="send()"
            [disabled]="!draft.trim()">
            <mat-icon>send</mat-icon>
            Enviar
          </button>
        }
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex: 1;
        min-height: 0;
        width: 100%;
      }

      .chat-root {
        display: flex;
        flex-direction: column;
        flex: 1;
        height: 100%;
        min-height: 0;
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        overflow: hidden;
      }

      .chat-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px;
        border-bottom: 1px solid var(--border-color);
        background: var(--bg-elevated);
      }

      .title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
      }

      .controls {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .model-select {
        background: var(--bg-tertiary);
        color: var(--text-primary);
        border: 1px solid var(--border-color);
        border-radius: 4px;
        padding: 4px 8px;
        font-size: 12px;
      }

      .chat-messages {
        flex: 1;
        overflow-y: auto;
        padding: 14px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .empty-state {
        color: var(--text-secondary);
        text-align: center;
        margin: auto;
      }

      .empty-state mat-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
        opacity: 0.4;
        margin-bottom: 12px;
      }

      .suggestions {
        list-style: none;
        padding: 0;
        margin: 12px 0 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .suggestions li {
        padding: 8px 12px;
        background: var(--bg-elevated);
        border: 1px solid var(--border-color);
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        transition: background 0.15s;
      }

      .suggestions li:hover {
        background: var(--bg-tertiary);
      }

      .message {
        display: flex;
        max-width: 100%;
      }

      .message.user {
        justify-content: flex-end;
      }

      .message.user .bubble {
        background: var(--brand-primary, #0ecb81);
        color: #fff;
        max-width: 80%;
      }

      .message.assistant .bubble {
        background: var(--bg-elevated);
        border: 1px solid var(--border-color);
        max-width: 95%;
      }

      .bubble {
        padding: 10px 12px;
        border-radius: 10px;
        font-size: 14px;
        line-height: 1.45;
      }

      .tools {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-bottom: 8px;
      }

      .tool {
        display: flex;
        gap: 8px;
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        border-radius: 6px;
        padding: 6px 8px;
        font-size: 12px;
      }

      .tool.error {
        border-color: #f6465d;
        background: rgba(246, 70, 93, 0.08);
      }

      .tool mat-icon {
        color: var(--text-secondary);
        font-size: 18px;
        width: 18px;
        height: 18px;
      }

      .tool-body {
        flex: 1;
        min-width: 0;
      }

      .tool-name {
        font-family: ui-monospace, monospace;
        font-size: 12px;
        word-break: break-word;
      }

      .tool-pending {
        color: var(--text-secondary);
        font-style: italic;
      }

      .tool-result summary {
        cursor: pointer;
        color: var(--text-secondary);
        font-size: 11px;
        margin-top: 4px;
      }

      .tool-result pre {
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        border-radius: 4px;
        padding: 6px;
        font-size: 11px;
        max-height: 240px;
        overflow: auto;
        white-space: pre-wrap;
        word-break: break-word;
      }

      .text {
        word-break: break-word;
        line-height: 1.5;
      }

      .text :first-child { margin-top: 0; }
      .text :last-child { margin-bottom: 0; }

      .text p {
        margin: 6px 0;
      }

      .text h1, .text h2, .text h3, .text h4, .text h5, .text h6 {
        margin: 14px 0 6px;
        font-weight: 600;
        color: var(--text-primary);
        line-height: 1.25;
      }
      .text h1 { font-size: 18px; }
      .text h2 { font-size: 16px; }
      .text h3 { font-size: 15px; color: var(--brand-accent); }
      .text h4 { font-size: 14px; }

      .text hr {
        border: 0;
        border-top: 1px solid var(--border-color);
        margin: 12px 0;
      }

      .text blockquote {
        margin: 8px 0;
        padding: 8px 12px;
        border-left: 3px solid var(--brand-accent);
        background: rgba(0, 188, 212, 0.06);
        border-radius: 4px;
        color: var(--text-secondary);
        font-size: 13px;
      }

      .text ul, .text ol {
        margin: 6px 0;
        padding-left: 22px;
      }

      .text li {
        margin: 2px 0;
      }

      .text code {
        background: var(--bg-tertiary);
        padding: 1px 5px;
        border-radius: 3px;
        font-size: 12px;
        font-family: ui-monospace, monospace;
      }

      .text pre {
        background: var(--bg-card);
        border: 1px solid var(--border-color);
        border-radius: 6px;
        padding: 8px 10px;
        overflow-x: auto;
        margin: 8px 0;
        font-size: 12px;
      }

      .text pre code {
        background: transparent;
        padding: 0;
      }

      .text table {
        border-collapse: collapse;
        margin: 10px 0;
        width: 100%;
        font-variant-numeric: tabular-nums;
      }
      .text th {
        background: var(--bg-tertiary);
        font-weight: 600;
        color: var(--text-secondary);
      }
      .text th, .text td {
        border: 1px solid var(--border-color);
        padding: 6px 10px;
        font-size: 12px;
      }
      .text tbody tr:hover {
        background: rgba(255, 255, 255, 0.02);
      }

      .text a {
        color: var(--brand-accent);
        text-decoration: underline;
      }

      .thinking {
        font-style: italic;
        color: var(--text-secondary);
      }

      .error {
        display: flex;
        align-items: center;
        gap: 6px;
        color: #f6465d;
        font-size: 13px;
        margin-top: 6px;
      }

      .usage {
        display: flex;
        gap: 12px;
        justify-content: flex-end;
        font-size: 11px;
        color: var(--text-secondary);
        padding: 4px 0;
      }

      .chat-input {
        display: flex;
        gap: 8px;
        padding: 10px;
        padding-bottom: max(10px, env(safe-area-inset-bottom));
        border-top: 1px solid var(--border-color);
        background: var(--bg-elevated);
        flex-shrink: 0;
      }

      .chat-input textarea {
        flex: 1;
        min-width: 0;
        background: var(--bg-card);
        color: var(--text-primary);
        border: 1px solid var(--border-color);
        border-radius: 6px;
        padding: 8px 10px;
        font-family: inherit;
        font-size: 16px; /* >=16px evita que iOS Safari haga zoom al focusear */
        resize: vertical;
        min-height: 48px;
      }

      .chat-messages {
        flex: 1;
        min-height: 0;
      }

      .chat-messages.hidden {
        display: none;
      }

      /* History panel */
      .history-panel {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 10px 12px;
        background: var(--bg-card);
      }

      .history-loading,
      .history-empty {
        padding: 32px 16px;
        text-align: center;
        color: var(--text-secondary);
        font-size: 14px;
      }

      .thread-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .thread-row {
        display: flex;
        align-items: stretch;
        gap: 4px;
        background: var(--bg-elevated);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        overflow: hidden;
      }

      .thread-row.active {
        border-color: var(--brand-accent);
        background: rgba(0, 188, 212, 0.08);
      }

      .thread-btn {
        flex: 1;
        min-width: 0;
        background: transparent;
        border: none;
        color: var(--text-primary);
        padding: 10px 12px;
        text-align: left;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        gap: 3px;
      }

      .thread-btn:hover {
        background: rgba(255, 255, 255, 0.03);
      }

      .thread-title {
        font-size: 13px;
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .thread-meta {
        font-size: 11px;
        color: var(--text-tertiary);
        display: flex;
        gap: 6px;
      }

      .thread-delete {
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        color: var(--text-tertiary);
        padding: 0 12px;
        cursor: pointer;
      }

      .thread-delete:hover {
        color: var(--color-error, #f6465d);
        background: rgba(246, 70, 93, 0.08);
      }

      .thread-delete mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
    `,
  ],
})
export class AgentChatComponent implements OnDestroy, AfterViewChecked, OnInit {
  private readonly agent = inject(AgentChatService);
  private readonly threadsService = inject(AgentThreadsService);
  private readonly cd = inject(ChangeDetectorRef);

  @ViewChild('scrollContainer') scrollContainer?: ElementRef<HTMLDivElement>;
  @Output() collapse = new EventEmitter<void>();
  @Output() toggleFullscreen = new EventEmitter<void>();
  @Output() chartAction = new EventEmitter<ChartAction>();
  @Input() fullscreen = false;

  readonly messages = signal<ChatMessage[]>([]);
  readonly streaming = signal(false);
  readonly lastUsage = signal<{
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    costUsd?: number;
  } | null>(null);
  readonly threads = signal<ThreadSummary[]>([]);
  readonly historyOpen = signal(false);
  readonly historyLoading = signal(false);
  readonly activeThreadId = signal<string | null>(null);

  draft = '';
  model: 'sonnet' | 'opus' | 'haiku' = 'sonnet';

  private sessionId: string | null = null;
  private abortController: AbortController | null = null;
  private scrollPending = false;

  ngOnInit(): void {
    // Restore last active thread (if any)
    try {
      const saved = localStorage.getItem('agentActiveThreadId');
      if (saved) {
        this.loadThread(saved);
      }
    } catch {
      /* ignore */
    }
  }

  ngAfterViewChecked(): void {
    if (this.scrollPending && this.scrollContainer) {
      const el = this.scrollContainer.nativeElement;
      el.scrollTop = el.scrollHeight;
      this.scrollPending = false;
    }
  }

  ngOnDestroy(): void {
    this.abortController?.abort();
  }

  onEnter(ev: Event): void {
    const e = ev as KeyboardEvent;
    if (e.shiftKey) return;
    e.preventDefault();
    this.send();
  }

  quickSend(text: string): void {
    this.draft = text;
    this.send();
  }

  async send(): Promise<void> {
    const text = this.draft.trim();
    if (!text || this.streaming()) return;
    this.draft = '';

    const userMsg: ChatMessage = {
      id: randomId(),
      role: 'user',
      text,
      tools: [],
    };
    const assistantMsg: ChatMessage = {
      id: randomId(),
      role: 'assistant',
      text: 'Conectando con el agente…',
      tools: [],
      streaming: true,
    };
    this.messages.set([...this.messages(), userMsg, assistantMsg]);
    this.streaming.set(true);
    this.scheduleScroll();
    this.cd.markForCheck();

    this.abortController = new AbortController();
    let receivedAnyEvent = false;
    try {
      for await (const event of this.agent.stream({
        message: text,
        sessionId: this.sessionId ?? undefined,
        threadId: this.activeThreadId() ?? undefined,
        model: this.model,
        signal: this.abortController.signal,
      })) {
        if (!receivedAnyEvent) {
          // Clear placeholder on first real event
          assistantMsg.text = '';
          receivedAnyEvent = true;
        }
        this.handleEvent(event, assistantMsg);
      }
    } catch (err) {
      console.error('[AgentChat] stream error', err);
      if ((err as Error).name === 'AbortError') {
        assistantMsg.error = 'Cancelado';
      } else {
        assistantMsg.error = (err as Error).message ?? String(err);
      }
      assistantMsg.text = '';
      this.messages.set([...this.messages()]);
    } finally {
      assistantMsg.streaming = false;
      this.messages.set([...this.messages()]);
      this.streaming.set(false);
      this.abortController = null;
      this.scheduleScroll();
      this.cd.markForCheck();
    }
  }

  cancel(): void {
    this.abortController?.abort();
  }

  resetThread(): void {
    if (this.streaming()) return;
    this.sessionId = null;
    this.activeThreadId.set(null);
    this.persistActiveThread(null);
    this.messages.set([]);
    this.lastUsage.set(null);
  }

  startNewThread(): void {
    this.historyOpen.set(false);
    this.resetThread();
  }

  toggleHistory(): void {
    const next = !this.historyOpen();
    this.historyOpen.set(next);
    if (next) this.refreshThreads();
  }

  refreshThreads(): void {
    this.historyLoading.set(true);
    this.threadsService.list().subscribe({
      next: (list) => {
        this.threads.set(list);
        this.historyLoading.set(false);
        this.cd.markForCheck();
      },
      error: () => {
        this.historyLoading.set(false);
      },
    });
  }

  loadThread(id: string): void {
    if (this.streaming()) return;
    this.historyOpen.set(false);
    this.historyLoading.set(true);
    this.threadsService.get(id).subscribe({
      next: (detail) => {
        this.applyThreadDetail(detail);
        this.historyLoading.set(false);
      },
      error: () => {
        this.historyLoading.set(false);
      },
    });
  }

  deleteThread(id: string, ev: Event): void {
    ev.stopPropagation();
    if (this.streaming()) return;
    this.threadsService.delete(id).subscribe({
      next: () => {
        this.threads.update((list) => list.filter((t) => t.id !== id));
        if (this.activeThreadId() === id) this.resetThread();
      },
    });
  }

  private applyThreadDetail(detail: ThreadDetail): void {
    this.activeThreadId.set(detail.id);
    this.persistActiveThread(detail.id);
    this.sessionId = detail.claudeSessionId;
    if (detail.model) this.model = detail.model;
    const msgs: ChatMessage[] = detail.messages.map((m: PersistedMessage) => ({
      id: m.id,
      role: m.role,
      text: m.text,
      tools: m.tools.map((t) => ({
        id: t.id,
        name: t.name,
        input: t.input,
        result: t.result,
        isError: t.isError,
      })),
      error: m.error,
    }));
    this.messages.set(msgs);
    this.lastUsage.set(
      detail.inputTokens || detail.outputTokens
        ? {
            inputTokens: detail.inputTokens,
            outputTokens: detail.outputTokens,
            cachedTokens: detail.cachedTokens,
            costUsd: detail.costUsd,
          }
        : null,
    );
    this.scheduleScroll();
    this.cd.markForCheck();
  }

  private persistActiveThread(id: string | null): void {
    try {
      if (id) localStorage.setItem('agentActiveThreadId', id);
      else localStorage.removeItem('agentActiveThreadId');
    } catch {
      /* ignore */
    }
  }

  formatRelative(isoDate: string): string {
    const d = new Date(isoDate);
    const diffMs = Date.now() - d.getTime();
    const diffMin = Math.round(diffMs / 60000);
    if (diffMin < 1) return 'ahora';
    if (diffMin < 60) return `hace ${diffMin}m`;
    const diffH = Math.round(diffMin / 60);
    if (diffH < 24) return `hace ${diffH}h`;
    const diffD = Math.round(diffH / 24);
    if (diffD < 7) return `hace ${diffD}d`;
    return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  }

  toolCommand(tool: ToolUseRecord): string {
    const input = tool.input as any;
    if (!input) return '';
    if (tool.name === 'Bash' && typeof input.command === 'string') {
      return ` · ${input.command.slice(0, 120)}${input.command.length > 120 ? '…' : ''}`;
    }
    if (typeof input === 'object') {
      const keys = Object.keys(input);
      if (keys.length === 0) return '';
      return ` · ${keys.map((k) => `${k}=${JSON.stringify(input[k]).slice(0, 40)}`).join(' ')}`;
    }
    return '';
  }

  renderMarkdown(text: string): string {
    // Hide chart-action code blocks from rendered output (they are sidechannel
    // directives applied to the parent component, not user-visible content)
    const cleaned = text.replace(/```chart-action\b[\s\S]*?```/g, '').trimStart();
    return renderMarkdown(cleaned);
  }

  private processChartActions(msg: ChatMessage): void {
    const re = /```chart-action\b[\s\S]*?\n([\s\S]*?)\n?```/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(msg.text)) !== null) {
      const json = match[1].trim();
      if (!json) continue;
      msg.emittedActions ??= new Set();
      if (msg.emittedActions.has(json)) continue;
      try {
        const action = JSON.parse(json) as ChartAction;
        msg.emittedActions.add(json);
        this.chartAction.emit(action);
      } catch {
        // ignore malformed — agent might still be streaming the JSON
      }
    }
  }

  private handleEvent(event: AgentEvent, msg: ChatMessage): void {
    switch (event.type) {
      case 'session':
        this.sessionId = event.sessionId;
        break;
      case 'thread':
        if (event.threadId && event.threadId !== this.activeThreadId()) {
          this.activeThreadId.set(event.threadId);
          this.persistActiveThread(event.threadId);
          // Refresh list in the background so the new thread shows up
          this.refreshThreads();
        }
        break;
      case 'text':
        msg.text += event.text;
        this.processChartActions(msg);
        break;
      case 'tool_use':
        msg.tools.push({
          id: event.id,
          name: event.name,
          input: event.input,
        });
        break;
      case 'tool_result': {
        const tool = msg.tools.find((t) => t.id === event.toolUseId);
        if (tool) {
          tool.result = event.content;
          tool.isError = event.isError;
        }
        break;
      }
      case 'usage':
        this.lastUsage.set({
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          cachedTokens: event.cachedTokens,
          costUsd: event.costUsd,
        });
        break;
      case 'done':
        if (event.sessionId) this.sessionId = event.sessionId;
        break;
      case 'error':
        msg.error = event.message;
        break;
    }
    this.messages.set([...this.messages()]);
    this.scheduleScroll();
    this.cd.markForCheck();
  }

  private scheduleScroll(): void {
    this.scrollPending = true;
  }
}

/**
 * UUID-ish random ID that works in non-secure contexts (HTTP).
 * `crypto.randomUUID()` is only available over HTTPS/localhost, so on plain
 * HTTP (e.g. http://100.74.149.119:4200 from a phone) it is undefined.
 */
function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return (
    Date.now().toString(36) +
    '-' +
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10)
  );
}

/**
 * Minimal-but-functional markdown renderer for the agent chat.
 * Supports: headers (h1-h4), bold, italic, inline code, code blocks,
 * unordered/ordered lists, blockquotes, horizontal rules, pipe tables,
 * and links. Escapes HTML to prevent injection.
 */
function renderMarkdown(text: string): string {
  if (!text) return '';

  const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const inline = (s: string) =>
    s
      // links [text](url) — only http(s)
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      // bold
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      // italic — avoid matching ** by requiring non-* before
      .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
      // inline code
      .replace(/`([^`\n]+)`/g, '<code>$1</code>');

  // Pre-process: ensure headings start on their own line with a blank line
  // before them. The agent sometimes emits "frase.## Heading" without
  // a newline; we insert one so the parser recognizes the heading.
  // We exclude `-`, `*`, `_` from the lookbehind because those start HR / list
  // markers and we don't want to chop off their trailing chars.
  const normalized = text.replace(/([^\n\-*_])\n?(#{1,6}\s)/g, '$1\n\n$2');

  // Pre-escape the whole text once for safety
  const lines = escapeHtml(normalized).split('\n');
  const out: string[] = [];
  let i = 0;
  let inCodeBlock = false;
  let codeLang = '';
  let codeBuf: string[] = [];

  const flushList = (() => {
    let listType: 'ul' | 'ol' | null = null;
    let buf: string[] = [];
    return {
      push(type: 'ul' | 'ol', item: string) {
        if (listType && listType !== type) this.flush();
        listType = type;
        buf.push(`<li>${inline(item)}</li>`);
      },
      flush() {
        if (!listType) return;
        out.push(`<${listType}>${buf.join('')}</${listType}>`);
        listType = null;
        buf = [];
      },
    };
  })();

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Code blocks ```
    if (/^```/.test(trimmed)) {
      if (!inCodeBlock) {
        flushList.flush();
        inCodeBlock = true;
        codeLang = trimmed.slice(3).trim();
        codeBuf = [];
      } else {
        out.push(
          `<pre><code class="lang-${codeLang}">${codeBuf.join('\n')}</code></pre>`,
        );
        inCodeBlock = false;
        codeLang = '';
        codeBuf = [];
      }
      i++;
      continue;
    }
    if (inCodeBlock) {
      codeBuf.push(line);
      i++;
      continue;
    }

    // Pipe tables (header line + separator line)
    const sep = (lines[i + 1] ?? '').trim();
    if (/^\|.+\|$/.test(trimmed) && /^\|?\s*:?-+:?(\s*\|\s*:?-+:?)+\|?$/.test(sep)) {
      flushList.flush();
      const splitRow = (row: string) =>
        row
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((c) => inline(c.trim()));
      const aligns = sep
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((c) => {
          const t = c.trim();
          if (t.startsWith(':') && t.endsWith(':')) return 'center';
          if (t.endsWith(':')) return 'right';
          return 'left';
        });
      const header = splitRow(trimmed);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\|.+\|$/.test(lines[i].trim())) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      const ths = header.map((h, idx) => `<th style="text-align:${aligns[idx] ?? 'left'}">${h}</th>`).join('');
      const trs = rows
        .map(
          (r) =>
            `<tr>${r
              .map(
                (c, idx) => `<td style="text-align:${aligns[idx] ?? 'left'}">${c}</td>`,
              )
              .join('')}</tr>`,
        )
        .join('');
      out.push(`<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`);
      continue;
    }

    // Headers
    const h = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (h) {
      flushList.flush();
      const level = h[1].length;
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushList.flush();
      out.push('<hr>');
      i++;
      continue;
    }

    // Blockquote — match both raw `>` and the escaped `&gt;` (because we
    // escape HTML upfront).
    const QUOTE_RE = /^(?:&gt;|>)\s?/;
    if (QUOTE_RE.test(trimmed)) {
      flushList.flush();
      const quoteLines: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i].trim())) {
        quoteLines.push(lines[i].trim().replace(QUOTE_RE, ''));
        i++;
      }
      out.push(`<blockquote>${inline(quoteLines.join('<br>'))}</blockquote>`);
      continue;
    }

    // Unordered list
    const ul = /^[-*]\s+(.+)$/.exec(trimmed);
    if (ul) {
      flushList.push('ul', ul[1]);
      i++;
      continue;
    }

    // Ordered list
    const ol = /^\d+\.\s+(.+)$/.exec(trimmed);
    if (ol) {
      flushList.push('ol', ol[1]);
      i++;
      continue;
    }

    // Empty line
    if (trimmed === '') {
      flushList.flush();
      out.push('');
      i++;
      continue;
    }

    // Regular paragraph line
    flushList.flush();
    out.push(`<p>${inline(line)}</p>`);
    i++;
  }
  flushList.flush();

  return out.join('\n');
}
