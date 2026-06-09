import {
  Component, ElementRef, Injector, OnInit, TemplateRef, afterNextRender, computed, effect, inject,
  signal, viewChild, ChangeDetectionStrategy,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { AgentModel, ChatService, ImageAttachment } from './chat.service';
import { ChatMessageComponent } from './chat-message.component';
import { ThreadSidebarComponent } from './thread-sidebar.component';
import { ComposerComponent, CommandEvent } from './composer.component';

interface Suggestion { icon: string; text: string; }

@Component({
  selector: 'app-asistente',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, MatSnackBarModule, MatDialogModule, ChatMessageComponent, ThreadSidebarComponent, ComposerComponent],
  template: `
    <div class="chat-shell">
      @if (sidebarOpen()) {
        <div class="sidebar-overlay" (click)="sidebarOpen.set(false)"></div>
      }

      <aside class="thread-sidebar" [class.open]="sidebarOpen()">
        <app-thread-sidebar
          (newChat)="onNewChat()"
          (openThread)="onOpenThread($event)"
        />
      </aside>

      <div class="chat-main">
        <div class="chat-topbar">
          <button class="hamburger" type="button" aria-label="Menú"
            (click)="sidebarOpen.set(!sidebarOpen())">
            <mat-icon aria-hidden="true">menu</mat-icon>
          </button>
          <span class="topbar-title">{{ topbarTitle() }}</span>
          <div class="topbar-actions">
            <div class="model-selector">
              <span class="model-label">Modelo</span>
              <div class="model-chips">
                @for (m of models; track m) {
                  <button
                    class="model-chip"
                    type="button"
                    [class.active]="chat.model() === m"
                    (click)="chat.setModel(m)"
                  >{{ m }}</button>
                }
              </div>
            </div>
            <button class="ghost-icon" type="button" title="Nueva conversación"
              aria-label="Nueva conversación" (click)="onNewChat()">
              <mat-icon aria-hidden="true">edit_note</mat-icon>
            </button>
          </div>
        </div>

        <div class="chat-scroll" #scroll (scroll)="onScroll()">
          @if (chat.loadingThread()) {
            <div class="col center"><span class="spinner" aria-hidden="true"></span></div>
          } @else if (chat.messages().length === 0) {
            <div class="col empty-state">
              <div class="hero-icon"><mat-icon aria-hidden="true">auto_awesome</mat-icon></div>
              <h2 class="empty-title">Tu asistente de mercado</h2>
              <p class="empty-sub">
                Consultá precios, balances, P&amp;L y análisis técnico en lenguaje natural.
              </p>
              <div class="chips">
                @for (s of suggestions; track s.text) {
                  <button class="chip" type="button" (click)="onSuggestion(s.text)">
                    <mat-icon aria-hidden="true">{{ s.icon }}</mat-icon>
                    {{ s.text }}
                  </button>
                }
              </div>
            </div>
          } @else {
            <div class="col">
              @for (m of chat.messages(); track m.id; let first = $first) {
                <app-chat-message
                  [class.first]="first"
                  [msg]="m"
                  [costUsd]="m.role === 'assistant' && !m.streaming ? threadCost() : undefined"
                  (copy)="onCopy($event)"
                  (regenerate)="onRegenerate()"
                  (retry)="onRegenerate()"
                />
              }
              <div class="scroll-pad"></div>
            </div>
          }

          @if (!stickToBottom() && chat.messages().length > 0) {
            <button class="to-bottom" type="button" aria-label="Ir al final"
              (click)="scrollToBottom('smooth'); stickToBottom.set(true)">
              <mat-icon aria-hidden="true">arrow_downward</mat-icon>
            </button>
          }
        </div>

        <div class="composer-dock">
          <div class="col">
            <app-composer
              [streaming]="chat.streaming()"
              (send)="onSend($event)"
              (command)="onCommand($event)"
              (stop)="chat.stop()"
            />
          </div>
        </div>
      </div>
    </div>

    <ng-template #usageDialog>
      <div class="usage-dialog">
        <div class="usage-head">
          <mat-icon aria-hidden="true">monitoring</mat-icon>
          <h3>Uso de Claude</h3>
        </div>
        <p class="usage-model">Modelo actual: <strong>{{ chat.model() }}</strong></p>

        @if (hasUsage()) {
          <table class="usage-table">
            <thead>
              <tr><th></th><th>Último turno</th><th>Total del hilo</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>Tokens entrada</td>
                <td>{{ fmtTokens(chat.lastUsage()?.inputTokens) }}</td>
                <td>{{ fmtTokens(chat.threadTotals().inputTokens) }}</td>
              </tr>
              <tr>
                <td>Tokens salida</td>
                <td>{{ fmtTokens(chat.lastUsage()?.outputTokens) }}</td>
                <td>{{ fmtTokens(chat.threadTotals().outputTokens) }}</td>
              </tr>
              <tr>
                <td>Caché (lectura)</td>
                <td>{{ fmtTokens(chat.lastUsage()?.cachedTokens) }}</td>
                <td>{{ fmtTokens(chat.threadTotals().cachedTokens) }}</td>
              </tr>
              <tr class="usage-cost">
                <td>Costo</td>
                <td>{{ fmtCost(chat.lastUsage()?.costUsd) }}</td>
                <td>{{ fmtCost(chat.threadTotals().costUsd) }}</td>
              </tr>
            </tbody>
          </table>
        } @else {
          <p class="usage-empty">
            Todavía no hay uso en esta conversación. Mandá un mensaje, o abrí una conversación previa desde la barra lateral.
          </p>
        }

        <div class="usage-historic">
          <span>Histórico · {{ chat.threads().length }} conversaciones</span>
          <strong>{{ fmtCost(totalHistoricCost()) }}</strong>
        </div>

        <p class="usage-note">Uso de tu chat reportado por el agente. No incluye el uso a nivel de cuenta/plan de Claude.</p>
        <div class="usage-actions">
          <button class="usage-close" type="button" (click)="closeUsage()">Cerrar</button>
        </div>
      </div>
    </ng-template>
  `,
  styles: [`
    :host { display: block; height: 100%; min-height: 0; }

    .chat-shell {
      display: grid;
      grid-template-columns: 280px 1fr;
      height: 100%;
      background: var(--bg-primary);
      overflow: hidden;
    }

    .thread-sidebar { height: 100%; min-height: 0; overflow: hidden; }

    .chat-main {
      display: flex; flex-direction: column;
      min-width: 0; min-height: 0; height: 100%;
      overflow: hidden;
    }

    /* Topbar */
    .chat-topbar {
      display: flex; align-items: center; gap: 10px;
      height: 52px; flex-shrink: 0;
      padding: 0 16px;
      border-bottom: 1px solid var(--border-color);
      background: var(--bg-card);
    }
    .hamburger {
      display: none;
      width: 36px; height: 36px; border-radius: 8px;
      border: none; background: transparent; cursor: pointer;
      color: var(--text-secondary);
      align-items: center; justify-content: center;
    }
    .hamburger:hover { background: var(--bg-hover); }
    .hamburger mat-icon { font-size: 22px; width: 22px; height: 22px; line-height: 22px; }
    .topbar-title {
      flex: 1; min-width: 0;
      font-weight: 600; color: var(--text-primary);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .topbar-actions { display: flex; align-items: center; gap: 12px; }

    .model-selector { display: flex; align-items: center; gap: 8px; }
    .model-label {
      font-size: .7rem; font-weight: 700; letter-spacing: .06em;
      text-transform: uppercase; color: var(--text-tertiary);
    }
    .model-chips {
      display: flex; gap: 2px;
      background: var(--bg-tertiary); border: 1px solid var(--border-color);
      border-radius: 10px; padding: 2px;
    }
    .model-chip {
      border: none; background: transparent; cursor: pointer;
      padding: 4px 10px; border-radius: 8px;
      font-size: .75rem; font-weight: 600; text-transform: capitalize;
      color: var(--text-secondary); transition: all .15s;
    }
    .model-chip:hover { color: var(--text-primary); }
    .model-chip.active { background: var(--brand-accent); color: var(--bg-primary); }

    .ghost-icon {
      width: 36px; height: 36px; border-radius: 8px;
      border: none; background: transparent; cursor: pointer;
      color: var(--text-secondary);
      display: flex; align-items: center; justify-content: center;
      transition: background .15s;
    }
    .ghost-icon:hover { background: var(--bg-hover); color: var(--text-primary); }
    .ghost-icon mat-icon { font-size: 20px; width: 20px; height: 20px; line-height: 20px; }

    /* Scroll region */
    .chat-scroll {
      flex: 1; min-height: 0;
      overflow-y: auto; position: relative;
    }

    .col {
      max-width: 768px; margin: 0 auto; width: 100%;
      padding-inline: 24px;
    }
    .col.center { display: flex; justify-content: center; padding-top: 60px; }
    .scroll-pad { height: 24px; }

    .spinner {
      width: 26px; height: 26px;
      border: 3px solid var(--border-color);
      border-top-color: var(--brand-accent);
      border-radius: 50%; animation: spin .7s linear infinite;
    }

    /* Empty state */
    .empty-state {
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      min-height: 100%; text-align: center; gap: 14px;
      padding-bottom: 40px;
    }
    .hero-icon {
      width: 56px; height: 56px; border-radius: 50%;
      background: color-mix(in srgb, var(--brand-accent) 14%, transparent);
      color: var(--brand-accent);
      display: flex; align-items: center; justify-content: center;
    }
    .hero-icon mat-icon { font-size: 30px; width: 30px; height: 30px; line-height: 30px; }
    .empty-title { font-size: 1.25rem; font-weight: 600; color: var(--text-primary); margin: 0; }
    .empty-sub {
      color: var(--text-secondary); line-height: 1.5;
      max-width: 420px; margin: 0;
    }
    .chips {
      display: flex; flex-wrap: wrap; justify-content: center;
      gap: 8px; max-width: 560px; margin-top: 6px;
    }
    .chip {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 9px 14px; border: 1px solid var(--border-color);
      border-radius: 18px; background: var(--bg-card);
      color: var(--text-primary); font-size: .82rem; cursor: pointer;
      transition: all .15s;
    }
    .chip:hover {
      border-color: var(--brand-accent); background: var(--bg-hover);
      transform: translateY(-1px);
    }
    .chip mat-icon { font-size: 16px; width: 16px; height: 16px; line-height: 16px; color: var(--brand-accent); }

    /* To-bottom pill */
    .to-bottom {
      position: absolute; right: 24px; bottom: 16px; z-index: 5;
      width: 36px; height: 36px; border-radius: 50%;
      background: var(--bg-card); border: 1px solid var(--border-color);
      box-shadow: var(--shadow-md); cursor: pointer;
      color: var(--text-secondary);
      display: flex; align-items: center; justify-content: center;
    }
    .to-bottom:hover { color: var(--text-primary); }
    .to-bottom mat-icon { font-size: 20px; width: 20px; height: 20px; line-height: 20px; }

    /* Composer dock */
    .composer-dock {
      position: relative; flex-shrink: 0;
      background: var(--bg-primary);
      padding: 10px 0 16px;
    }
    .composer-dock::before {
      content: ''; position: absolute; left: 0; right: 0; top: -24px;
      height: 24px; pointer-events: none;
      background: linear-gradient(to top, var(--bg-primary), transparent);
    }

    /* Off-canvas overlay */
    .sidebar-overlay {
      position: fixed; inset: 0; z-index: 100;
      background: rgba(0,0,0,.5);
    }

    /* ===== Responsive ===== */
    @media (max-width: 900px) {
      .chat-shell { grid-template-columns: 1fr; }
      .thread-sidebar {
        position: fixed; top: 0; left: 0; bottom: 0; z-index: 101;
        width: 280px; max-width: 85vw;
        transform: translateX(-100%);
        transition: transform .3s ease;
        box-shadow: var(--shadow-lg);
      }
      .thread-sidebar.open { transform: translateX(0); }
      .hamburger { display: flex; }
      .col { padding-inline: 14px; max-width: 100%; }
      .model-label { display: none; }
    }

    @keyframes spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) {
      .spinner { animation: none; }
      .chip:hover { transform: none; }
      .thread-sidebar { transition: none; }
    }

    /* ===== Usage dialog ===== */
    .usage-dialog {
      padding: 20px 22px;
      min-width: 320px; max-width: 420px;
      color: var(--text-primary);
    }
    .usage-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
    .usage-head mat-icon { color: var(--brand-accent); }
    .usage-head h3 { margin: 0; font-size: 1.05rem; font-weight: 600; }
    .usage-model { margin: 0 0 14px; color: var(--text-secondary); font-size: .85rem; text-transform: capitalize; }
    .usage-table {
      width: 100%; border-collapse: collapse; font-size: .85rem;
      font-variant-numeric: tabular-nums;
    }
    .usage-table th {
      text-align: right; font-weight: 600; color: var(--text-tertiary);
      font-size: .72rem; text-transform: uppercase; letter-spacing: .04em;
      padding: 0 0 8px; border-bottom: 1px solid var(--border-color);
    }
    .usage-table th:first-child { text-align: left; }
    .usage-table td { padding: 9px 0; text-align: right; color: var(--text-primary); }
    .usage-table td:first-child { text-align: left; color: var(--text-secondary); }
    .usage-table tbody tr:not(:last-child) td { border-bottom: 1px solid color-mix(in srgb, var(--border-color) 55%, transparent); }
    .usage-table .usage-cost td { font-weight: 700; color: var(--brand-accent); }
    .usage-table .usage-cost td:first-child { color: var(--text-primary); font-weight: 600; }
    .usage-empty {
      margin: 4px 0 0; padding: 16px; border-radius: 10px;
      background: var(--bg-secondary); border: 1px dashed var(--border-light);
      color: var(--text-secondary); font-size: .85rem; line-height: 1.5; text-align: center;
    }
    .usage-historic {
      display: flex; align-items: center; justify-content: space-between;
      margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border-color);
      font-size: .82rem; color: var(--text-secondary);
      font-variant-numeric: tabular-nums;
    }
    .usage-historic strong { color: var(--text-primary); font-size: .95rem; }
    .usage-note { margin: 14px 0 0; font-size: .72rem; color: var(--text-tertiary); line-height: 1.4; }
    .usage-actions { display: flex; justify-content: flex-end; margin-top: 16px; }
    .usage-close {
      border: none; cursor: pointer; padding: 8px 18px; border-radius: 8px;
      background: var(--brand-accent); color: var(--bg-primary);
      font-weight: 600; font-size: .85rem; transition: filter .15s;
    }
    .usage-close:hover { filter: brightness(1.1); }
  `],
})
export class AsistenteComponent implements OnInit {
  readonly chat = inject(ChatService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  private readonly scrollEl = viewChild.required<ElementRef<HTMLDivElement>>('scroll');
  private readonly usageDialog = viewChild.required<TemplateRef<unknown>>('usageDialog');

  readonly models: AgentModel[] = ['sonnet', 'opus', 'haiku'];
  readonly sidebarOpen = signal(false);
  readonly stickToBottom = signal(true);

  readonly suggestions: Suggestion[] = [
    { icon: 'show_chart', text: '¿Cómo viene BTC?' },
    { icon: 'account_balance_wallet', text: 'Mostrame mi balance' },
    { icon: 'trending_up', text: 'RSI de ETH' },
    { icon: 'analytics', text: '¿Cómo va mi P&L?' },
    { icon: 'insights', text: 'Resumen del mercado' },
    { icon: 'swap_horiz', text: 'Mis últimas transacciones' },
  ];

  readonly topbarTitle = computed(() => {
    const id = this.chat.currentThreadId();
    if (!id) return 'Nueva conversación';
    const t = this.chat.threads().find((x) => x.id === id);
    return t?.title || 'Conversación';
  });

  readonly threadCost = computed(() => {
    const id = this.chat.currentThreadId();
    const fromThread = id ? this.chat.threads().find((x) => x.id === id)?.costUsd : undefined;
    return fromThread ?? this.chat.lastUsage()?.costUsd;
  });

  /** ¿La conversación abierta tiene uso para mostrar? */
  readonly hasUsage = computed(() => {
    const t = this.chat.threadTotals();
    return this.chat.lastUsage() != null || t.outputTokens > 0 || (t.costUsd ?? 0) > 0;
  });

  /** Costo acumulado de todas las conversaciones del usuario. */
  readonly totalHistoricCost = computed(() =>
    this.chat.threads().reduce((sum, t) => sum + (t.costUsd ?? 0), 0),
  );

  private injector = inject(Injector);
  private lastLen = 0;
  private lastTextLen = 0;

  constructor() {
    // Auto-scroll on new content while streaming, if pinned to bottom.
    effect(() => {
      const msgs = this.chat.messages();
      const len = msgs.length;
      const lastText = len ? msgs[len - 1].text.length : 0;
      const grew = len !== this.lastLen || lastText !== this.lastTextLen;
      this.lastLen = len;
      this.lastTextLen = lastText;
      if (!grew) return;
      if (this.stickToBottom()) {
        afterNextRender(() => this.scrollToBottom('auto'), { injector: this.injector });
      }
    });
  }

  ngOnInit(): void {
    this.chat.loadThreads();
  }

  onNewChat(): void {
    this.chat.newConversation();
    this.sidebarOpen.set(false);
    this.stickToBottom.set(true);
  }

  async onOpenThread(id: string): Promise<void> {
    this.sidebarOpen.set(false);
    this.stickToBottom.set(true);
    await this.chat.openThread(id);
    this.scrollToBottom('auto');
  }

  onSuggestion(text: string): void {
    this.stickToBottom.set(true);
    void this.chat.sendMessage(text);
    this.scrollToBottom('smooth');
  }

  onSend(payload: { text: string; images: ImageAttachment[] }): void {
    this.stickToBottom.set(true);
    void this.chat.sendMessage(payload.text, payload.images);
    this.scrollToBottom('smooth');
  }

  /** Slash commands de acción (los de UI). Los de dominio llegan por (send). */
  onCommand(e: CommandEvent): void {
    switch (e.name) {
      case 'clear':
      case 'new':
        this.onNewChat();
        this.toast('Conversación nueva');
        break;
      case 'model': {
        const m = e.args.trim().toLowerCase();
        if ((this.models as string[]).includes(m)) {
          this.chat.setModel(m as AgentModel);
          this.toast(`Modelo: ${m}`);
        } else {
          this.toast('Modelo inválido. Usá sonnet, opus o haiku.');
        }
        break;
      }
      case 'cost': {
        const c = this.threadCost();
        this.toast(c != null ? `Costo del hilo: $${c.toFixed(4)}` : 'Todavía no hay costo registrado.');
        break;
      }
      case 'copy': {
        const last = [...this.chat.messages()].reverse().find((m) => m.role === 'assistant' && m.text.trim());
        if (last) {
          this.onCopy(last.text);
          this.toast('Respuesta copiada');
        } else {
          this.toast('No hay respuesta para copiar.');
        }
        break;
      }
      case 'usage':
        this.openUsage();
        break;
    }
  }

  async openUsage(): Promise<void> {
    // Traer los totales reales del hilo abierto antes de mostrar el panel.
    await this.chat.refreshThreadTotals();
    this.dialog.open(this.usageDialog(), { panelClass: 'usage-dialog-panel', autoFocus: false });
  }

  closeUsage(): void {
    this.dialog.closeAll();
  }

  fmtTokens(n: number | undefined): string {
    if (n == null) return '—';
    return n.toLocaleString('en-US');
  }

  fmtCost(n: number | undefined): string {
    if (n == null) return '—';
    return '$' + n.toFixed(4);
  }

  private toast(msg: string): void {
    this.snack.open(msg, '', { duration: 2500, horizontalPosition: 'center', verticalPosition: 'bottom' });
  }

  onRegenerate(): void {
    const msgs = this.chat.messages();
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') {
        this.stickToBottom.set(true);
        void this.chat.sendMessage(msgs[i].text);
        this.scrollToBottom('smooth');
        return;
      }
    }
  }

  onCopy(text: string): void {
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(text);
    }
  }

  onScroll(): void {
    const el = this.scrollEl().nativeElement;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    this.stickToBottom.set(distance < 80);
  }

  scrollToBottom(behavior: ScrollBehavior): void {
    const el = this.scrollEl().nativeElement;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }
}
