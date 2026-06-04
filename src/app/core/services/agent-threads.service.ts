import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface ThreadSummary {
  id: string;
  title: string;
  model: 'sonnet' | 'opus' | 'haiku';
  claudeSessionId: string | null;
  messageCount: number;
  lastMessagePreview: string;
  costUsd: number;
  updatedAt: string;
  createdAt: string;
}

export interface PersistedToolRecord {
  id: string;
  name: string;
  input?: unknown;
  result?: string;
  isError?: boolean;
}

export interface PersistedMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  tools: PersistedToolRecord[];
  error?: string;
  createdAt: string;
}

export interface ThreadDetail {
  id: string;
  title: string;
  model: 'sonnet' | 'opus' | 'haiku';
  claudeSessionId: string | null;
  messages: PersistedMessage[];
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  updatedAt: string;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class AgentThreadsService {
  constructor(private api: ApiService) {}

  list(): Observable<ThreadSummary[]> {
    return this.api.get<ThreadSummary[]>('/agent/threads');
  }

  get(id: string): Observable<ThreadDetail> {
    return this.api.get<ThreadDetail>(`/agent/threads/${id}`);
  }

  create(body?: { title?: string; model?: 'sonnet' | 'opus' | 'haiku' }): Observable<{ id: string }> {
    return this.api.post<{ id: string }>('/agent/threads', body ?? {});
  }

  rename(id: string, title: string): Observable<{ id: string; title: string }> {
    return this.api.patch<{ id: string; title: string }>(`/agent/threads/${id}`, { title });
  }

  delete(id: string): Observable<{ ok: true }> {
    return this.api.delete<{ ok: true }>(`/agent/threads/${id}`);
  }
}
