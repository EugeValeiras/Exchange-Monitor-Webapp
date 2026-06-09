import { Component, computed, input, signal, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ToolRecord } from './chat.service';

type ToolState = 'pending' | 'success' | 'error';

@Component({
  selector: 'app-tool-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <div class="tool-card" [attr.data-state]="state()">
      <button
        class="tool-header"
        type="button"
        [attr.aria-expanded]="expanded()"
        (click)="expanded.set(!expanded())"
      >
        <span class="status-slot">
          @switch (state()) {
            @case ('pending') { <span class="spinner" aria-hidden="true"></span> }
            @case ('success') { <mat-icon class="status-ok" aria-hidden="true">check_circle</mat-icon> }
            @case ('error') { <mat-icon class="status-err" aria-hidden="true">error</mat-icon> }
          }
        </span>
        <span class="tool-name" [title]="tool().name">{{ friendlyName() }}</span>
        <span class="status-pill" [attr.data-state]="state()">{{ pillLabel() }}</span>
        <mat-icon class="chevron" [class.open]="expanded()" aria-hidden="true">expand_more</mat-icon>
      </button>

      @if (expanded()) {
        <div class="tool-body">
          <div class="section">
            <div class="section-label">ENTRADA</div>
            <pre class="code-panel">{{ inputJson() }}</pre>
          </div>
          @if (tool().result !== undefined) {
            <div class="section">
              <div class="section-label" [class.err-label]="tool().isError">
                {{ tool().isError ? 'ERROR' : 'RESULTADO' }}
              </div>
              <pre class="code-panel">{{ shownResult() }}</pre>
              @if (resultClipped()) {
                <button class="more-btn" type="button" (click)="showFull.set(!showFull())">
                  {{ showFull() ? 'ver menos' : 'ver más' }}
                </button>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .tool-card {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-left: 3px solid var(--border-color);
      border-radius: 10px;
      margin: 6px 0;
      overflow: hidden;
    }
    .tool-card[data-state='pending'] { border-left-color: var(--color-warning); }
    .tool-card[data-state='success'] { border-left-color: var(--color-success); }
    .tool-card[data-state='error'] { border-left-color: var(--color-error); }

    .tool-header {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 12px; cursor: pointer;
      background: transparent; border: none; width: 100%;
      text-align: left; font-size: .8rem; color: var(--text-primary);
      transition: background .15s;
    }
    .tool-header:hover { background: var(--bg-hover); }

    .status-slot {
      width: 18px; height: 18px;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .status-slot mat-icon {
      font-size: 18px; width: 18px; height: 18px; line-height: 18px;
    }
    .status-ok { color: var(--color-success); }
    .status-err { color: var(--color-error); }

    .spinner {
      width: 14px; height: 14px;
      border: 2px solid var(--border-color);
      border-top-color: var(--color-warning);
      border-radius: 50%;
      animation: spin .7s linear infinite;
    }

    .tool-name {
      font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
      font-weight: 600; color: var(--text-primary);
      flex: 1; min-width: 0;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }

    .status-pill {
      flex-shrink: 0;
      font-size: .62rem; font-weight: 700; letter-spacing: .04em;
      padding: 2px 7px; border-radius: 10px;
      text-transform: uppercase;
    }
    .status-pill[data-state='pending'] {
      background: color-mix(in srgb, var(--color-warning) 18%, transparent);
      color: var(--color-warning);
    }
    .status-pill[data-state='success'] {
      background: color-mix(in srgb, var(--color-success) 18%, transparent);
      color: var(--color-success);
    }
    .status-pill[data-state='error'] {
      background: color-mix(in srgb, var(--color-error) 18%, transparent);
      color: var(--color-error);
    }

    .chevron {
      flex-shrink: 0;
      color: var(--text-tertiary); font-size: 20px;
      width: 20px; height: 20px; line-height: 20px;
      transition: transform .2s;
    }
    .chevron.open { transform: rotate(180deg); }

    .tool-body {
      border-top: 1px solid var(--border-light);
      padding: 10px 12px;
      display: flex; flex-direction: column; gap: 8px;
    }
    .section-label {
      font-size: .62rem; font-weight: 700; letter-spacing: .5px;
      text-transform: uppercase; color: var(--text-tertiary);
      margin-bottom: 4px;
    }
    .section-label.err-label { color: var(--color-error); }

    .code-panel {
      background: var(--bg-secondary);
      border: 1px solid var(--border-light);
      border-radius: 6px;
      padding: 8px 10px; margin: 0;
      font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
      font-size: .72rem; line-height: 1.45; color: var(--text-secondary);
      white-space: pre-wrap; word-break: break-word;
      max-height: 280px; overflow: auto;
    }
    .more-btn {
      align-self: flex-start; margin-top: 4px;
      background: transparent; border: none; cursor: pointer;
      color: var(--brand-accent); font-size: .72rem; font-weight: 600;
      padding: 0;
    }
    .more-btn:hover { text-decoration: underline; }

    @keyframes spin { to { transform: rotate(360deg); } }

    @media (prefers-reduced-motion: reduce) {
      .spinner { animation: none; }
      .chevron { transition: none; }
    }
  `],
})
export class ToolCardComponent {
  readonly tool = input.required<ToolRecord>();
  readonly expanded = signal(false);
  readonly showFull = signal(false);

  private readonly CLIP = 3000;

  readonly state = computed<ToolState>(() => {
    const t = this.tool();
    if (t.result === undefined) return 'pending';
    return t.isError ? 'error' : 'success';
  });

  readonly pillLabel = computed(() => {
    switch (this.state()) {
      case 'pending': return 'Ejecutando…';
      case 'success': return 'Listo';
      case 'error': return 'Error';
    }
  });

  readonly friendlyName = computed(() => {
    const raw = this.tool().name;
    const verbs: Record<string, string> = {
      get: 'Consultando',
      list: 'Listando',
      set: 'Aplicando',
      turn: 'Cambiando',
      toggle: 'Alternando',
      create: 'Creando',
      delete: 'Eliminando',
      update: 'Actualizando',
      search: 'Buscando',
    };
    const lower = raw.toLowerCase();
    for (const key of Object.keys(verbs)) {
      if (lower.startsWith(key)) return `${verbs[key]} · ${raw}`;
    }
    return raw;
  });

  readonly inputJson = computed(() => {
    const input = this.tool().input;
    if (input === undefined || input === null) return '—';
    try {
      return JSON.stringify(input, null, 2);
    } catch {
      return String(input);
    }
  });

  readonly resultClipped = computed(() => {
    const r = this.tool().result ?? '';
    return r.length > this.CLIP;
  });

  readonly shownResult = computed(() => {
    const r = this.tool().result ?? '';
    if (this.showFull() || r.length <= this.CLIP) return r;
    return r.slice(0, this.CLIP) + '…';
  });
}
