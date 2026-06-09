import {
  Component, computed, inject, input, output, ChangeDetectionStrategy,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ChatMessage } from './chat.service';
import { MarkdownService } from './markdown.service';
import { ToolCardComponent } from './tool-card.component';

@Component({
  selector: 'app-chat-message',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ToolCardComponent, MatIconModule],
  template: `
    @if (msg().role === 'user') {
      <div class="msg user">
        <div class="bubble">
          @if (msg().imageUrls?.length) {
            <div class="thumbs">
              @for (url of msg().imageUrls; track url) {
                <img class="thumb" [src]="url" alt="adjunto" />
              }
            </div>
          }
          @if (msg().text) {
            <div class="user-text">{{ msg().text }}</div>
          }
        </div>
      </div>
    } @else {
      <div class="msg assistant">
        <div class="avatar"><mat-icon aria-hidden="true">auto_awesome</mat-icon></div>
        <div class="body">
          @for (tool of msg().tools; track tool.id) {
            <app-tool-card [tool]="tool" />
          }

          @if (showThinking()) {
            <div class="thinking" aria-live="polite">
              <span class="dots">
                <span class="dot"></span><span class="dot"></span><span class="dot"></span>
              </span>
              <span class="thinking-label">Pensando…</span>
            </div>
          } @else if (msg().text) {
            <div class="md" [innerHTML]="renderedHtml()"></div>
            @if (msg().streaming) { <span class="caret" aria-hidden="true"></span> }
          } @else if (msg().streaming && msg().tools.length) {
            <span class="caret" aria-hidden="true"></span>
          }

          @if (msg().error) {
            <div class="error-callout" role="alert">
              <mat-icon aria-hidden="true">error_outline</mat-icon>
              <span class="error-text">{{ msg().error }}</span>
              <button class="retry-btn" type="button" (click)="retry.emit()">Reintentar</button>
            </div>
          }

          @if (!msg().streaming && (msg().text || msg().tools.length)) {
            <div class="footer">
              <button class="ghost-act" type="button" title="Copiar" aria-label="Copiar"
                (click)="copy.emit(msg().text)">
                <mat-icon aria-hidden="true">content_copy</mat-icon>
              </button>
              <button class="ghost-act" type="button" title="Regenerar" aria-label="Regenerar"
                (click)="regenerate.emit()">
                <mat-icon aria-hidden="true">refresh</mat-icon>
              </button>
              @if (cost(); as c) {
                <span class="cost">· {{ c }}</span>
              }
            </div>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    /* ===== USER ===== */
    .msg.user {
      display: flex; justify-content: flex-end;
      padding: 20px 0;
    }
    .msg.user .bubble {
      margin-left: auto; max-width: 75%;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 16px 16px 4px 16px;
      padding: 10px 14px;
      color: var(--text-primary);
      font-size: .95rem; line-height: 1.55;
      box-shadow: var(--shadow-sm);
    }
    .user-text { white-space: pre-wrap; word-break: break-word; }
    .thumbs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
    .thumb {
      width: 120px; height: 120px; border-radius: 10px;
      object-fit: cover; display: block;
    }

    /* ===== ASSISTANT ===== */
    .msg.assistant {
      position: relative;
      padding: 20px 0;
      border-top: 1px solid var(--border-light);
    }
    :host(.first) .msg.assistant { border-top: none; }
    .avatar {
      position: absolute; top: 20px; left: 0;
      width: 28px; height: 28px; border-radius: 50%;
      background: var(--brand-accent); color: var(--bg-primary);
      display: flex; align-items: center; justify-content: center;
    }
    .avatar mat-icon { font-size: 16px; width: 16px; height: 16px; line-height: 16px; }
    .body { padding-left: 40px; }

    .md {
      color: var(--text-primary);
      line-height: 1.65; font-size: 0.95rem;
      display: inline;
    }
    .caret {
      display: inline-block; width: 8px; height: 1.05em;
      transform: translateY(2px); margin-left: 2px;
      background: var(--brand-accent); border-radius: 1px;
      animation: caret-blink 1s steps(1) infinite;
      vertical-align: baseline;
    }

    .thinking { display: flex; align-items: center; gap: 10px; padding: 4px 0; }
    .dots { display: inline-flex; gap: 4px; }
    .dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: var(--text-tertiary);
      animation: dotPulse 1.2s ease-in-out infinite;
    }
    .dot:nth-child(2) { animation-delay: .16s; }
    .dot:nth-child(3) { animation-delay: .32s; }
    .thinking-label { color: var(--text-tertiary); font-size: .85rem; }

    .error-callout {
      display: flex; align-items: center; gap: 8px;
      margin-top: 10px;
      background: color-mix(in srgb, var(--color-error) 14%, transparent);
      border: 1px solid var(--color-error);
      border-radius: 8px;
      padding: 10px 12px;
      color: var(--color-error); font-size: .85rem;
    }
    .error-callout mat-icon { font-size: 18px; width: 18px; height: 18px; line-height: 18px; flex-shrink: 0; }
    .error-text { flex: 1; }
    .retry-btn {
      background: transparent; border: none; cursor: pointer;
      color: var(--color-error); font-weight: 700; font-size: .8rem;
      text-decoration: underline; padding: 0; flex-shrink: 0;
    }

    .footer {
      display: flex; align-items: center; gap: 4px;
      margin-top: 8px; opacity: 0; transition: opacity .15s;
    }
    .msg.assistant:hover .footer { opacity: 1; }
    .ghost-act {
      width: 28px; height: 28px; border-radius: 6px;
      border: none; background: transparent; cursor: pointer;
      color: var(--text-tertiary);
      display: flex; align-items: center; justify-content: center;
      transition: background .15s, color .15s;
    }
    .ghost-act:hover { background: var(--bg-hover); color: var(--text-primary); }
    .ghost-act mat-icon { font-size: 15px; width: 15px; height: 15px; line-height: 15px; }
    .cost { color: var(--text-tertiary); font-size: .72rem; margin-left: 4px; }

    @keyframes caret-blink { 0%,49%{opacity:1} 50%,100%{opacity:0} }
    @keyframes dotPulse {
      0%,80%,100%{opacity:.3;transform:translateY(0)}
      40%{opacity:1;transform:translateY(-3px)}
    }
    @media (prefers-reduced-motion: reduce) {
      .caret { animation: none; opacity: 1; }
      .dot { animation: none; opacity: .6; transform: none; }
    }

    /* ===== MARKDOWN TYPOGRAPHY ===== */
    .md :first-child { margin-top: 0; }
    .md :last-child { margin-bottom: 0; }
    .md p { margin: .5em 0; }
    .md h1 { font-size: 1.3rem; font-weight: 600; color: var(--text-primary); margin: 1.2em 0 .5em; }
    .md h2 { font-size: 1.15rem; font-weight: 600; color: var(--text-primary); margin: 1.2em 0 .5em; }
    .md h3 { font-size: 1.02rem; font-weight: 600; color: var(--text-primary); margin: 1.2em 0 .5em; }
    .md ul, .md ol { padding-left: 1.4em; margin: .5em 0; }
    .md li { margin: .25em 0; }
    .md li::marker { color: var(--text-secondary); }
    .md code {
      background: var(--bg-tertiary); border: 1px solid var(--border-light);
      border-radius: 5px; padding: 1px 5px; font-size: .85em;
      font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
      color: var(--brand-accent);
    }
    .md pre {
      background: var(--bg-tertiary); border: 1px solid var(--border-color);
      border-radius: 10px; padding: 14px 16px; overflow-x: auto;
      font-size: .82rem; line-height: 1.55; margin: .7em 0;
    }
    .md pre code {
      background: transparent; border: none; padding: 0;
      color: var(--text-primary); font-size: inherit;
    }
    .md blockquote {
      border-left: 3px solid var(--brand-accent);
      padding: 2px 0 2px 14px; margin: .6em 0;
      color: var(--text-secondary);
    }
    .md table {
      width: auto; border-collapse: collapse;
      border: 1px solid var(--border-color);
      border-radius: 8px; overflow: hidden; margin: .7em 0;
      display: block; overflow-x: auto;
    }
    .md th {
      background: var(--bg-tertiary); font-weight: 600; text-align: left;
      padding: 7px 12px; border-bottom: 1px solid var(--border-light); font-size: .88rem;
    }
    .md td {
      padding: 7px 12px; border-bottom: 1px solid var(--border-light); font-size: .88rem;
      color: var(--text-primary);
    }
    .md a { color: var(--brand-accent); text-decoration: none; }
    .md a:hover { text-decoration: underline; }
    .md hr { border: 0; border-top: 1px solid var(--border-light); margin: 1em 0; }
    .md img { max-width: 100%; border-radius: 8px; }
  `],
})
export class ChatMessageComponent {
  private md = inject(MarkdownService);

  readonly msg = input.required<ChatMessage>();
  readonly costUsd = input<number | undefined>(undefined);

  readonly copy = output<string>();
  readonly regenerate = output<void>();
  readonly retry = output<void>();

  readonly renderedHtml = computed(() => this.md.render(this.msg().text));

  readonly showThinking = computed(() => {
    const m = this.msg();
    return !!m.streaming && !m.text && m.tools.length === 0;
  });

  readonly cost = computed(() => {
    const c = this.costUsd();
    if (c === undefined || c === null) return null;
    return `$${c.toFixed(4)}`;
  });
}
