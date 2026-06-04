import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

export type AgentEvent =
  | { type: 'session'; sessionId: string }
  | { type: 'thread'; threadId: string }
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; toolUseId: string; content: string; isError?: boolean }
  | {
      type: 'usage';
      inputTokens: number;
      outputTokens: number;
      cachedTokens: number;
      costUsd?: number;
    }
  | { type: 'done'; result?: string; sessionId?: string }
  | { type: 'error'; message: string };

export interface ChatStreamOptions {
  message: string;
  sessionId?: string;
  threadId?: string;
  model?: 'sonnet' | 'opus' | 'haiku';
  signal?: AbortSignal;
}

@Injectable({ providedIn: 'root' })
export class AgentChatService {
  constructor(private auth: AuthService) {}

  /**
   * Non-streaming fallback for browsers that buffer fetch responses
   * (notably iOS Safari over HTTP). Calls /agent/chat/sync and yields
   * all events at once.
   */
  private async *streamSync(opts: ChatStreamOptions): AsyncIterable<AgentEvent> {
    const token = this.auth.getToken();
    if (!token) throw new Error('No hay token de autenticación. Hacé login.');

    const url = `${environment.apiUrl}/agent/chat/sync`;
    console.log('[AgentChat] sync POST', url);

    const resp = await fetch(url, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        message: opts.message,
        sessionId: opts.sessionId,
        threadId: opts.threadId,
        model: opts.model,
      }),
      signal: opts.signal,
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`HTTP ${resp.status}: ${text || resp.statusText}`);
    }

    const data = (await resp.json()) as { events: AgentEvent[] };
    for (const event of data.events ?? []) {
      yield event;
    }
  }

  async *stream(opts: ChatStreamOptions): AsyncIterable<AgentEvent> {
    const token = this.auth.getToken();
    if (!token) throw new Error('No hay token de autenticación. Hacé login.');

    const url = `${environment.apiUrl}/agent/chat`;
    console.log('[AgentChat] POST', url);

    let resp: Response;
    try {
      resp = await fetch(url, {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: opts.message,
          sessionId: opts.sessionId,
          model: opts.model,
        }),
        signal: opts.signal,
      });
    } catch (err) {
      console.error('[AgentChat] fetch streaming failed, trying sync fallback', err);
      // Fallback to sync endpoint
      yield* this.streamSync(opts);
      return;
    }

    console.log('[AgentChat] response', resp.status, resp.headers.get('content-type'));

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`HTTP ${resp.status}: ${text || resp.statusText}`);
    }
    if (!resp.body || typeof resp.body.getReader !== 'function') {
      console.warn('[AgentChat] no streaming body — using sync fallback');
      yield* this.streamSync(opts);
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let receivedAny = false;
    let watchdogTriggered = false;

    // Watchdog: if no chunk arrives in 12s, assume the browser is buffering
    // (iOS Safari over HTTP). Cancel the reader so we fall back to sync.
    const watchdogTimer = setTimeout(() => {
      if (!receivedAny) {
        watchdogTriggered = true;
        console.warn('[AgentChat] no chunk in 12s, aborting stream for fallback');
        reader.cancel().catch(() => {});
      }
    }, 12_000);

    try {
      while (true) {
        let chunk: ReadableStreamReadResult<Uint8Array>;
        try {
          chunk = await reader.read();
        } catch (err) {
          if (watchdogTriggered) break;
          throw err;
        }
        if (chunk.done) break;
        if (!receivedAny) {
          receivedAny = true;
          clearTimeout(watchdogTimer);
        }
        buffer += decoder.decode(chunk.value, { stream: true });

        let sepIdx: number;
        while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, sepIdx);
          buffer = buffer.slice(sepIdx + 2);
          for (const line of block.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            const payload = line.slice(6).trim();
            if (!payload) continue;
            try {
              yield JSON.parse(payload) as AgentEvent;
            } catch {
              // skip malformed
            }
          }
        }
      }
    } finally {
      clearTimeout(watchdogTimer);
      try {
        reader.releaseLock();
      } catch {
        /* noop */
      }
    }

    if (watchdogTriggered && !receivedAny) {
      console.log('[AgentChat] falling back to sync after watchdog');
      yield* this.streamSync(opts);
    }
  }
}
