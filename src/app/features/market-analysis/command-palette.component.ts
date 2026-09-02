import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
  computed,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ExchangeLogoComponent } from '../../shared/components/exchange-logo/exchange-logo.component';
import { EmMoneyPipe, EmPctPipe, toneOf } from '../../shared/pipes/format.pipes';
import { MarketExchange } from '../../core/services/market-analysis.service';

export interface PaletteRow {
  symbol: string;
  exchange: MarketExchange;
  price: number | null;
  /** My P&L on this pair, when I hold it */
  minePct: number | null;
  pct1h: number | null;
  pct24h: number | null;
  pct7d: number | null;
  /** Current value of my position, what the list is sorted by */
  exposure: number;
}

/**
 * One overlay for two jobs: switching pairs and talking to the agent.
 *
 * It replaces the multi-timeframe table, and improves on it: the table sorted
 * by configuration, this sorts by MY money, and carries my P&L per pair —
 * which the table never showed.
 *
 * When the text matches no pair, the first row becomes "ask the agent", and
 * the question travels with the context of what is on screen.
 */
@Component({
  selector: 'app-command-palette',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, MatIconModule, ExchangeLogoComponent, EmMoneyPipe, EmPctPipe],
  template: `
    <div class="backdrop" (click)="close.emit()">
      <div class="palette" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
        <div class="search">
          <mat-icon [class.agent]="asksAgent()">{{ asksAgent() ? 'smart_toy' : 'search' }}</mat-icon>
          <input
            #input
            type="text"
            [ngModel]="query()"
            (ngModelChange)="query.set($event)"
            (keydown)="onKeydown($event)"
            [placeholder]="'Buscar par o pedirle algo al agente…'"
            aria-label="Buscar par o preguntar" />
          <span class="kbd">esc</span>
        </div>

        @if (asksAgent()) {
          <div class="section">
            <div class="section-title agent">Preguntarle al agente</div>
            <button type="button" class="ask" (click)="ask()">
              <mat-icon>smart_toy</mat-icon>
              <span class="text">“{{ query() }}”</span>
              <span class="kbd">⏎</span>
            </button>
            <div class="context">
              <span>va con tu contexto:</span>
              <span class="pill">
                <app-exchange-logo [exchange]="exchange" [size]="13"></app-exchange-logo>
                {{ symbol }}
              </span>
              <span class="pill">{{ timeframe }}</span>
              <span class="pill">rango visible</span>
              @if (hasPosition) {
                <span class="pill mine">tu posición</span>
              }
            </div>
          </div>
        }

        <div class="section list">
          @if (withPosition().length) {
            <div class="section-title">Con posición</div>
            @for (row of withPosition(); track row.symbol) {
              <ng-container *ngTemplateOutlet="rowTpl; context: { $implicit: row }"></ng-container>
            }
          }
          @if (withoutPosition().length) {
            <div class="section-title">Otros pares</div>
            @for (row of withoutPosition(); track row.symbol) {
              <ng-container *ngTemplateOutlet="rowTpl; context: { $implicit: row, dim: true }"></ng-container>
            }
          }
          @if (!withPosition().length && !withoutPosition().length && !asksAgent()) {
            <div class="none">Ningún par coincide con “{{ query() }}”.</div>
          }
        </div>

        <div class="foot">
          <span>Ordenado por tu exposición</span>
          <span>↑↓ moverse · ⏎ abrir</span>
        </div>
      </div>
    </div>

    <ng-template #rowTpl let-row let-dim="dim">
      <button
        type="button"
        class="row"
        [class.dim]="dim"
        [class.current]="row.symbol === symbol"
        (click)="pick.emit(row)">
        <app-exchange-logo [exchange]="row.exchange" [size]="16"></app-exchange-logo>
        <span class="symbol">{{ row.symbol }}</span>
        <span class="price num">{{ row.price | emMoney }}</span>
        <span class="mine num" [class]="tone(row.minePct)">
          {{ row.minePct !== null ? (row.minePct | emPct) : '—' }}
        </span>
        <span class="pct num" [class]="tone(row.pct1h)">{{ row.pct1h | emPct }}</span>
        <span class="pct num" [class]="tone(row.pct24h)">{{ row.pct24h | emPct }}</span>
        <span class="pct num" [class]="tone(row.pct7d)">{{ row.pct7d | emPct }}</span>
      </button>
    </ng-template>
  `,
  styles: [
    `
      .backdrop {
        position: fixed;
        inset: 0;
        z-index: var(--z-modal);
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding-top: 12vh;
        background: rgba(12, 13, 15, 0.72);
      }

      .palette {
        width: min(640px, calc(100vw - 32px));
        max-height: 70vh;
        display: flex;
        flex-direction: column;
        border: 1px solid var(--border-light);
        border-radius: var(--r-4);
        background: var(--bg-elevated);
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6);
        overflow: hidden;
      }

      .search {
        display: flex;
        align-items: center;
        gap: var(--sp-3);
        padding: var(--sp-4) var(--sp-5);
        border-bottom: 1px solid var(--border-color);
        flex: none;
      }

      .search mat-icon {
        color: var(--text-tertiary);
      }

      .search mat-icon.agent {
        color: var(--chart-agent);
      }

      .search input {
        flex: 1;
        border: none;
        background: transparent;
        color: var(--text-primary);
        font-family: inherit;
        font-size: var(--fs-16);
        outline: none;
      }

      .search input::placeholder {
        color: var(--text-tertiary);
      }

      .kbd {
        padding: 2px 4px;
        border: 1px solid var(--border-light);
        border-radius: var(--r-1);
        font-size: var(--fs-10);
        font-weight: 600;
        color: var(--text-tertiary);
      }

      .section {
        padding: var(--sp-3) var(--sp-3) var(--sp-2);
      }

      .section.list {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
      }

      .section-title {
        padding: var(--sp-2) var(--sp-3) 8px;
        font-size: 9.5px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--text-tertiary);
      }

      .section-title.agent {
        color: var(--chart-agent);
      }

      .ask {
        display: flex;
        align-items: center;
        gap: var(--sp-3);
        width: 100%;
        padding: 8px 8px;
        border: 1px solid rgba(217, 160, 91, 0.3);
        border-radius: 7px;
        background: rgba(217, 160, 91, 0.09);
        color: var(--text-primary);
        font-family: inherit;
        font-size: 12.5px;
        text-align: left;
        cursor: pointer;
      }

      .ask mat-icon {
        color: var(--chart-agent);
        font-size: 16px;
        width: 16px;
        height: 16px;
      }

      .ask .text {
        flex: 1;
      }

      .context {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        padding: var(--sp-3) 8px var(--sp-2);
        font-size: 10.5px;
        color: var(--text-tertiary);
      }

      .pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 8px;
        border-radius: var(--r-1);
        background: var(--bg-tertiary);
        color: var(--text-secondary);
      }

      .pill.mine {
        color: var(--text-primary);
      }

      .row {
        display: flex;
        align-items: center;
        gap: var(--sp-3);
        width: 100%;
        height: 34px;
        padding: 0 var(--sp-4);
        border: none;
        border-radius: var(--r-2);
        background: transparent;
        color: var(--text-primary);
        font-family: inherit;
        cursor: pointer;
      }

      .row:hover,
      .row.current {
        background: rgba(255, 255, 255, 0.05);
      }

      .row.dim {
        color: var(--text-secondary);
      }

      .row .symbol {
        width: 96px;
        text-align: left;
        font-size: 12.5px;
        font-weight: 600;
      }

      .row.dim .symbol {
        font-weight: 400;
      }

      .row .price {
        width: 84px;
        text-align: right;
        font-size: 12.5px;
      }

      .row .mine {
        width: 68px;
        text-align: right;
        font-size: var(--fs-12);
        font-weight: 600;
      }

      .row .pct {
        width: 60px;
        text-align: right;
        font-size: 11.5px;
      }

      .none {
        padding: var(--sp-5);
        font-size: 12.5px;
        color: var(--text-tertiary);
        text-align: center;
      }

      .foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px var(--sp-5);
        border-top: 1px solid var(--border-color);
        font-size: 10.5px;
        color: var(--text-tertiary);
        flex: none;
      }
    `,
  ],
})
export class CommandPaletteComponent {
  @ViewChild('input') private input?: ElementRef<HTMLInputElement>;

  @Input() rows: PaletteRow[] = [];
  @Input() symbol: string | null = null;
  @Input() exchange: MarketExchange = 'binance';
  @Input() timeframe = '1h';
  @Input() hasPosition = false;

  @Output() pick = new EventEmitter<PaletteRow>();
  @Output() askAgent = new EventEmitter<string>();
  @Output() close = new EventEmitter<void>();

  readonly query = signal('');
  readonly tone = toneOf;

  private readonly matches = computed(() => {
    const q = this.query().trim().toUpperCase();
    const rows = [...this.rows].sort((a, b) => b.exposure - a.exposure);
    if (!q) return rows;
    return rows.filter((r) => r.symbol.toUpperCase().includes(q));
  });

  readonly withPosition = computed(() => this.matches().filter((r) => r.exposure > 0));
  readonly withoutPosition = computed(() => this.matches().filter((r) => r.exposure <= 0));

  /**
   * A phrase is a question, a fragment is a filter. Two words or a space
   * after something that matches no pair is a good enough signal, and the
   * agent row never replaces the pair list — it sits above it.
   */
  readonly asksAgent = computed(() => {
    const q = this.query().trim();
    if (q.length < 3) return false;
    if (this.matches().length > 0) return false;
    return q.includes(' ') || q.length > 12;
  });

  ngAfterViewInit(): void {
    this.input?.nativeElement.focus();
  }

  ask(): void {
    const q = this.query().trim();
    if (q) this.askAgent.emit(q);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.close.emit();
      return;
    }
    if (event.key !== 'Enter') return;

    if (this.asksAgent()) {
      this.ask();
      return;
    }
    const first = this.withPosition()[0] ?? this.withoutPosition()[0];
    if (first) this.pick.emit(first);
  }
}
