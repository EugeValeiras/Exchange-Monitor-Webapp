import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  computed,
  signal,
} from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { PairTrade, PairTrades } from '../../core/services/transactions.service';

type SideFilter = 'all' | 'buy' | 'sell';

/**
 * List of the user's own trades on the selected pair, next to the chart.
 * Hovering a row lifts the matching marker on the candles.
 */
@Component({
  selector: 'app-trades-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, DecimalPipe, MatIconModule, RouterLink],
  template: `
    <div class="trades-panel">
      <div class="panel-header">
        <mat-icon class="header-icon">layers</mat-icon>
        <span class="header-title">Mis trades</span>
        <a class="header-link" routerLink="/transactions">
          Ver todas
          <mat-icon>chevron_right</mat-icon>
        </a>
      </div>

      <div class="side-filters">
        @for (option of sideOptions; track option.value) {
          <button
            type="button"
            class="side-chip"
            [class.active]="sideFilter() === option.value"
            (click)="sideFilter.set(option.value)">
            {{ option.label }}
          </button>
        }
      </div>

      <div class="trade-list">
        @for (trade of visibleTrades(); track trade.id) {
          <div
            class="trade-row"
            [class.buy]="trade.side === 'buy'"
            [class.sell]="trade.side === 'sell'"
            [class.highlighted]="trade.id === highlightedId"
            (mouseenter)="hover.emit(trade.id)"
            (mouseleave)="hover.emit(null)">
            <span class="side-badge">{{ trade.side === 'buy' ? 'B' : 'S' }}</span>
            <div class="trade-main">
              <div class="trade-amount">
                <span class="amount">
                  {{ trade.side === 'buy' ? '+' : '-' }}{{ trade.amount | number: '1.2-8' }}
                </span>
                <span class="asset">{{ baseAsset() }}</span>
              </div>
              <span class="trade-meta">
                &#64; {{ trade.price | number: '1.2-2' }} &middot; {{ trade.exchange | titlecase }}
              </span>
            </div>
            <div class="trade-side">
              <span class="trade-total">{{ trade.total | number: '1.2-2' }}</span>
              <span class="trade-date">{{ trade.timestamp | date: 'dd MMM yyyy' }}</span>
            </div>
          </div>
        } @empty {
          <div class="panel-empty">
            <mat-icon>filter_alt</mat-icon>
            <span>Sin {{ sideFilter() === 'buy' ? 'compras' : 'ventas' }} en el rango visible.</span>
          </div>
        }
      </div>

      @if (data?.outsideRange) {
        <div class="panel-footer">
          <span>Fuera del rango visible</span>
          <span class="footer-count">
            {{ data?.outsideRange }} {{ data?.outsideRange === 1 ? 'trade' : 'trades' }}
          </span>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .trades-panel {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        border: 1px solid var(--border-color);
        border-radius: 8px;
        background: var(--bg-elevated);
      }

      .panel-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 14px;
        border-bottom: 1px solid var(--border-color);
      }

      .header-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
        color: var(--brand-accent);
      }

      .header-title {
        flex: 1;
        font-size: 13.5px;
        font-weight: 600;
        color: var(--text-primary);
      }

      .header-link {
        display: flex;
        align-items: center;
        gap: 2px;
        font-size: 12px;
        color: var(--brand-accent);
        text-decoration: none;
      }

      .header-link:hover {
        color: var(--brand-accent-light);
      }

      .header-link mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }

      .side-filters {
        display: flex;
        gap: 6px;
        padding: 10px 12px 8px;
      }

      .side-chip {
        height: 26px;
        padding: 0 10px;
        border: 1px solid var(--border-light);
        border-radius: 6px;
        background: transparent;
        color: var(--text-secondary);
        font-family: inherit;
        font-size: 12px;
        cursor: pointer;
      }

      .side-chip:hover {
        color: var(--text-primary);
      }

      .side-chip.active {
        border-color: transparent;
        background: var(--bg-tertiary);
        color: var(--text-primary);
        font-weight: 500;
      }

      .trade-list {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
        min-height: 0;
        padding: 0 8px 10px;
        overflow-y: auto;
      }

      .trade-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        border: 1px solid transparent;
        border-radius: 6px;
        cursor: default;
      }

      .trade-row:hover,
      .trade-row.highlighted {
        border-color: rgba(0, 188, 212, 0.45);
        background: rgba(0, 188, 212, 0.08);
      }

      .side-badge {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        flex: none;
        border-radius: 50%;
        color: #0b0e11;
        font-size: 11px;
        font-weight: 700;
      }

      .buy .side-badge {
        background: var(--color-success);
      }

      .sell .side-badge {
        background: var(--color-error);
      }

      .trade-main {
        display: flex;
        flex-direction: column;
        gap: 3px;
        flex: 1;
        min-width: 0;
      }

      .trade-amount {
        display: flex;
        align-items: baseline;
        gap: 6px;
      }

      .amount {
        font-size: 13px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        color: var(--text-primary);
      }

      .asset,
      .trade-meta {
        font-size: 11.5px;
        color: var(--text-secondary);
      }

      .trade-meta {
        font-variant-numeric: tabular-nums;
      }

      .trade-side {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 3px;
      }

      .trade-total {
        font-size: 12.5px;
        font-variant-numeric: tabular-nums;
        color: var(--text-primary);
      }

      .trade-date {
        font-size: 11px;
        color: var(--text-tertiary);
      }

      .panel-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 32px 16px;
        color: var(--text-tertiary);
        font-size: 12.5px;
        text-align: center;
      }

      .panel-empty mat-icon {
        opacity: 0.5;
      }

      .panel-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px;
        border-top: 1px solid var(--border-color);
        font-size: 11.5px;
        color: var(--text-secondary);
      }

      .footer-count {
        font-weight: 600;
      }
    `,
  ],
})
export class TradesPanelComponent {
  private readonly dataSignal = signal<PairTrades | null>(null);

  @Input() set data(value: PairTrades | null) {
    this.dataSignal.set(value);
  }

  get data(): PairTrades | null {
    return this.dataSignal();
  }

  /** Trade currently hovered on the chart side, highlighted here too */
  @Input() highlightedId: string | null = null;
  @Output() hover = new EventEmitter<string | null>();

  readonly sideOptions: Array<{ value: SideFilter; label: string }> = [
    { value: 'all', label: 'Todos' },
    { value: 'buy', label: 'Compras' },
    { value: 'sell', label: 'Ventas' },
  ];

  readonly sideFilter = signal<SideFilter>('all');

  readonly visibleTrades = computed<PairTrade[]>(() => {
    const trades = this.dataSignal()?.trades ?? [];
    const side = this.sideFilter();
    const filtered = side === 'all' ? trades : trades.filter((t) => t.side === side);
    return [...filtered].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  });

  readonly baseAsset = computed(() => {
    const pair = this.dataSignal()?.pair ?? '';
    return pair.split('/')[0] || '';
  });
}
