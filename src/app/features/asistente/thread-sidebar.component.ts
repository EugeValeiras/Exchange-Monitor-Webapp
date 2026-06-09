import {
  Component, inject, output, signal, ChangeDetectionStrategy,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ChatService, ThreadSummary } from './chat.service';

@Component({
  selector: 'app-thread-sidebar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <div class="sidebar-inner">
      <div class="new-wrap">
        <button class="new-btn" type="button" (click)="newChat.emit()">
          <mat-icon aria-hidden="true">add_comment</mat-icon>
          Nueva conversación
        </button>
      </div>

      <div class="section-label">CONVERSACIONES</div>

      <div class="list">
        @if (chat.loadingThreads() && chat.threads().length === 0) {
          <div class="loading"><span class="spinner" aria-hidden="true"></span></div>
        } @else if (chat.threads().length === 0) {
          <p class="empty">Todavía no tenés conversaciones. Empezá una nueva.</p>
        } @else {
          @for (t of chat.threads(); track t.id) {
            <div
              class="thread-item"
              [class.active]="t.id === chat.currentThreadId()"
              (click)="renamingId() === t.id ? null : openThread.emit(t.id)"
            >
              <div class="thread-content">
                @if (renamingId() === t.id) {
                  <input
                    #renameInput
                    class="name-input"
                    [value]="t.title"
                    (click)="$event.stopPropagation()"
                    (keydown.enter)="commitRename(t, renameInput.value)"
                    (keydown.escape)="renamingId.set(null)"
                    (blur)="commitRename(t, renameInput.value)"
                  />
                } @else {
                  <span class="thread-title">{{ t.title || 'Conversación' }}</span>
                  @if (t.lastMessagePreview) {
                    <span class="thread-preview">{{ t.lastMessagePreview }}</span>
                  }
                }
              </div>

              @if (renamingId() !== t.id) {
                <button
                  class="kebab"
                  type="button"
                  aria-label="Opciones"
                  (click)="toggleMenu($event, t.id)"
                >
                  <mat-icon aria-hidden="true">more_vert</mat-icon>
                </button>
              }

              @if (menuId() === t.id) {
                <div class="menu" (click)="$event.stopPropagation()">
                  <button class="menu-item" type="button" (click)="startRename(t.id)">
                    <mat-icon aria-hidden="true">edit</mat-icon> Renombrar
                  </button>
                  <button class="menu-item danger" type="button" (click)="onDelete(t)">
                    <mat-icon aria-hidden="true">delete_outline</mat-icon> Eliminar
                  </button>
                </div>
              }
            </div>
          }
        }
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block; height: 100%;
      background: var(--bg-secondary);
      border-right: 1px solid var(--border-color);
    }
    .sidebar-inner {
      display: flex; flex-direction: column; height: 100%;
    }
    .new-wrap { padding: 12px; }
    .new-btn {
      display: flex; align-items: center; gap: 8px;
      width: 100%; padding: 10px 12px;
      border: 1px solid var(--border-color); border-radius: 10px;
      background: var(--bg-card); color: var(--text-primary);
      font-size: .85rem; font-weight: 600; cursor: pointer;
      transition: all .15s;
    }
    .new-btn:hover { border-color: var(--brand-accent); background: var(--bg-hover); }
    .new-btn mat-icon { color: var(--brand-accent); font-size: 18px; width: 18px; height: 18px; line-height: 18px; }

    .section-label {
      font-size: .7rem; font-weight: 700; letter-spacing: .08em;
      text-transform: uppercase; color: var(--text-tertiary);
      margin: 14px 14px 8px;
    }

    .list { flex: 1; overflow-y: auto; padding: 0 8px 8px; }

    .loading { display: flex; justify-content: center; padding: 24px; }
    .spinner {
      width: 20px; height: 20px;
      border: 2px solid var(--border-color);
      border-top-color: var(--brand-accent);
      border-radius: 50%; animation: spin .7s linear infinite;
    }
    .empty {
      text-align: center; color: var(--text-tertiary);
      font-size: .85rem; padding: 24px; line-height: 1.4;
    }

    .thread-item {
      position: relative;
      display: flex; align-items: center; gap: 8px;
      padding: 9px 10px; border-radius: 8px; cursor: pointer;
      transition: background .15s;
    }
    .thread-item:hover { background: var(--bg-hover); }
    .thread-item.active {
      background: color-mix(in srgb, var(--brand-accent) 12%, transparent);
      box-shadow: inset 3px 0 0 var(--brand-accent);
    }
    .thread-content {
      flex: 1; min-width: 0;
      display: flex; flex-direction: column; gap: 2px;
    }
    .thread-title {
      font-size: .85rem; font-weight: 500; color: var(--text-primary);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .thread-item.active .thread-title { font-weight: 700; }
    .thread-preview {
      font-size: .72rem; color: var(--text-tertiary);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }

    .name-input {
      width: 100%; font-size: .85rem; font-weight: 500;
      border: 1px solid var(--brand-accent); border-radius: 6px;
      padding: 3px 6px; background: var(--bg-card);
      color: var(--text-primary); outline: none;
    }

    .kebab {
      flex-shrink: 0;
      width: 26px; height: 26px; border-radius: 6px;
      border: none; background: transparent; cursor: pointer;
      color: var(--text-tertiary);
      display: flex; align-items: center; justify-content: center;
      opacity: 0; transition: opacity .15s, background .15s;
    }
    .kebab mat-icon { font-size: 18px; width: 18px; height: 18px; line-height: 18px; }
    .thread-item:hover .kebab, .thread-item.active .kebab { opacity: 1; }
    .kebab:hover { background: var(--bg-tertiary); color: var(--text-primary); }

    .menu {
      position: absolute; top: 36px; right: 8px; z-index: 10;
      background: var(--bg-card); border: 1px solid var(--border-color);
      border-radius: 8px; box-shadow: var(--shadow-md);
      padding: 4px; min-width: 150px;
    }
    .menu-item {
      display: flex; align-items: center; gap: 8px;
      width: 100%; padding: 7px 10px;
      border: none; background: transparent; cursor: pointer;
      color: var(--text-primary); font-size: .82rem;
      border-radius: 6px; text-align: left;
    }
    .menu-item:hover { background: var(--bg-hover); }
    .menu-item.danger { color: var(--color-error); }
    .menu-item mat-icon { font-size: 16px; width: 16px; height: 16px; line-height: 16px; }

    @keyframes spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
  `],
})
export class ThreadSidebarComponent {
  readonly chat = inject(ChatService);

  readonly newChat = output<void>();
  readonly openThread = output<string>();

  readonly menuId = signal<string | null>(null);
  readonly renamingId = signal<string | null>(null);

  toggleMenu(ev: Event, id: string): void {
    ev.stopPropagation();
    this.menuId.update((cur) => (cur === id ? null : id));
  }

  startRename(id: string): void {
    this.menuId.set(null);
    this.renamingId.set(id);
  }

  async commitRename(t: ThreadSummary, value: string): Promise<void> {
    const title = value.trim();
    this.renamingId.set(null);
    if (title && title !== t.title) {
      await this.chat.renameThread(t.id, title);
    }
  }

  async onDelete(t: ThreadSummary): Promise<void> {
    this.menuId.set(null);
    if (confirm(`¿Eliminar la conversación "${t.title || 'sin título'}"?`)) {
      await this.chat.deleteThread(t.id);
    }
  }
}
