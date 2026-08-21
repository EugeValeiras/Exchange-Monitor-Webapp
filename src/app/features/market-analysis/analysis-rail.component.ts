import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  ViewChild,
  computed,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { AgentChatComponent, ChartAction } from './agent-chat.component';
import { PairPosition, PairTrades } from '../../core/services/transactions.service';
import { EmMoneyPipe, EmPctPipe, EmQtyPipe, EmSignedPipe, toneOf } from '../../shared/pipes/format.pipes';
import { groupTrades, MonthGroup, TradeOrder } from './lib/trade-grouping';

export type RailFacet = 'position' | 'trades' | 'agent';

export interface RailPosition extends PairPosition {
  unrealizedPnl: number | null;
  unrealizedPct: number | null;
  currentValue: number | null;
}

type SideFilter = 'all' | 'buy' | 'sell';

/**
 * The margin of the screen: three mutually exclusive answers at the exact
 * height of the chart, each with its own scroll.
 *
 * It is also the answer to "where does the assistant live": the chat stops
 * being a 420px fixed panel charging rent on the main surface whether or not
 * it is in use.
 */
@Component({
  selector: 'app-analysis-rail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule, RouterLink, AgentChatComponent, EmMoneyPipe, EmPctPipe, EmQtyPipe, EmSignedPipe],
  template: `
    <aside class="rail">
      <div class="facets">
        <div class="segmented" role="tablist">
          @for (f of facets; track f.id) {
            <button
              type="button"
              role="tab"
              [attr.aria-selected]="facet === f.id"
              [class.active]="facet === f.id"
              [title]="f.hint"
              (click)="facetChange.emit(f.id)">
              {{ f.label }}
              @if (f.id === 'agent' && annotationCount) {
                <span class="dot"></span>
              }
            </button>
          }
        </div>
      </div>

      @switch (facet) {
        @case ('position') {
          @if (position; as p) {
            <div class="facet position">
              <div class="headline">
                <span class="tag">No realizado</span>
                <div class="values">
                  <span class="big num" [class]="tone(p.unrealizedPnl)">{{ p.unrealizedPnl | emSigned }}</span>
                  <span class="pct num" [class]="tone(p.unrealizedPnl)">{{ p.unrealizedPct | emPct }}</span>
                </div>
                <span class="note">contra el precio spot, no contra el cierre del timeframe</span>
              </div>

              <dl class="metrics">
                <div><dt>Tenencia</dt><dd class="num">{{ p.netAmount | emQty: baseAsset }}</dd></div>
                <div><dt>PPC</dt><dd class="num em-mine">{{ p.avgEntryPrice | emMoney }}</dd></div>
                <div><dt>Invertido</dt><dd class="num">{{ p.costBasis | emMoney }}</dd></div>
                <div><dt>Valor hoy</dt><dd class="num">{{ p.currentValue | emMoney }}</dd></div>
              </dl>

              <dl class="metrics">
                <div>
                  <dt>Realizado</dt>
                  <dd class="num" [class]="tone(p.realizedPnl)">{{ p.realizedPnl | emSigned }}</dd>
                </div>
                <div><dt>Comprado</dt><dd class="num">{{ p.totalBought | emQty }}</dd></div>
                <div><dt>Vendido</dt><dd class="num">{{ p.totalSold | emQty }}</dd></div>
              </dl>

              <div class="foot">
                <span>{{ p.tradeCount }} movimientos</span>
                <a
                  routerLink="/transactions"
                  [queryParams]="{ pair: symbol, types: 'trade' }">
                  Ver todos<mat-icon>chevron_right</mat-icon>
                </a>
              </div>
            </div>
          } @else {
            <div class="empty">
              <mat-icon>account_balance_wallet</mat-icon>
              <p>No tenés posición abierta en {{ symbol ?? 'este par' }}.</p>
            </div>
          }
        }

        @case ('trades') {
          <div class="facet trades">
            <div class="trades-head">
              <span class="summary">
                {{ data?.position?.tradeCount ?? 0 }} trades
                @if (grouped().orderCount !== (data?.position?.tradeCount ?? 0)) {
                  <span class="muted">· {{ grouped().orderCount }} órdenes</span>
                }
              </span>
              <div class="filters">
                @for (f of sideFilters; track f.value) {
                  <button
                    type="button"
                    class="chip"
                    [class.active]="sideFilter() === f.value"
                    (click)="sideFilter.set(f.value)">
                    {{ f.label }}
                  </button>
                }
                @if (grouped().dustCount) {
                  <button
                    type="button"
                    class="chip"
                    [class.active]="showDust()"
                    [title]="'Movimientos por debajo del umbral de materialidad'"
                    (click)="showDust.set(!showDust())">
                    Polvo: {{ showDust() ? 'on' : 'off' }}
                  </button>
                }
              </div>
            </div>

            <div class="months">
              @for (month of visibleMonths(); track month.key) {
                <div class="month">
                  <div class="month-head">
                    <span class="label">{{ month.label }}</span>
                    <span class="detail">{{ monthSummary(month) }}</span>
                  </div>

                  @for (order of month.orders; track order.id) {
                    <div
                      class="order"
                      [class.buy]="order.side === 'buy'"
                      [class.sell]="order.side === 'sell'"
                      [class.highlighted]="order.id === highlightedId"
                      (mouseenter)="hover.emit(order.id)"
                      (mouseleave)="hover.emit(null)">
                      <span class="side">{{ order.side === 'buy' ? 'B' : 'S' }}</span>
                      <div class="main">
                        <span class="amount num">
                          {{ order.side === 'buy' ? '+' : '−' }}{{ order.amount | emQty }}
                          <span class="asset">{{ baseAsset }}</span>
                        </span>
                        <span class="meta num">
                          &#64; {{ order.price | emMoney }}
                          @if (order.fills.length > 1) {
                            <span class="fills">· {{ order.fills.length }} fills</span>
                          }
                        </span>
                      </div>
                      <div class="side-info">
                        <span class="total num">{{ order.total | emMoney }}</span>
                        <span class="date">{{ order.timestamp | date: 'dd MMM' }}</span>
                      </div>
                    </div>
                  }

                  @if (month.dust && !showDust()) {
                    <button type="button" class="dust" (click)="showDust.set(true)">
                      <mat-icon>chevron_right</mat-icon>
                      <span>
                        {{ month.dust.count }} {{ month.dust.count === 1 ? 'menor' : 'menores' }}
                        · <span class="num">{{ month.dust.amount | emQty }}</span> {{ baseAsset }}
                        · <span class="num">{{ month.dust.total | emMoney }}</span>
                      </span>
                    </button>
                  }
                </div>
              } @empty {
                <div class="empty">
                  <mat-icon>filter_alt</mat-icon>
                  <p>Sin movimientos para este filtro.</p>
                </div>
              }
            </div>

            @if (grouped().relativeToLargest) {
              <div class="foot-note">
                Umbral relativo al mayor movimiento del período: la posición está cerrada.
              </div>
            }
            @if (data?.outsideRange) {
              <div class="foot">
                <span>Fuera del rango visible</span>
                <span class="count">{{ data!.outsideRange }}</span>
              </div>
            }
          </div>
        }

        @case ('agent') {
          <div class="facet agent">
            <app-agent-chat
              (chartAction)="chartAction.emit($event)"
              (toggleFullscreen)="openFullscreen.emit()"></app-agent-chat>
          </div>
        }
      }
    </aside>
  `,
  styles: [
    `
      .rail {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        min-height: 0;
        border: 1px solid var(--border-color);
        border-radius: var(--r-4);
        background: var(--bg-elevated);
        overflow: hidden;
      }

      .facets {
        display: flex;
        align-items: center;
        padding: var(--sp-4) var(--sp-4) var(--sp-3);
        border-bottom: 1px solid var(--border-color);
        flex: none;
      }

      .segmented {
        display: inline-flex;
        gap: 2px;
        padding: 2px;
        border-radius: var(--r-2);
        background: var(--bg-tertiary);
      }

      .segmented button {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        height: 22px;
        padding: 0 10px;
        border: none;
        border-radius: 5px;
        background: transparent;
        color: var(--text-secondary);
        font-family: inherit;
        font-size: 11.5px;
        font-weight: 500;
        cursor: pointer;
      }

      .segmented button.active {
        background: #2f363f;
        color: var(--text-primary);
        font-weight: 600;
      }

      .segmented .dot {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: var(--chart-agent);
      }

      .facet {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        overflow-y: auto;
      }

      .facet.agent {
        overflow: hidden;
      }

      /* Position */
      .position {
        gap: var(--sp-5);
        padding: var(--sp-4);
      }

      .headline {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }

      .tag {
        font-size: var(--fs-10);
        font-weight: 700;
        letter-spacing: 0.09em;
        text-transform: uppercase;
        color: var(--text-tertiary);
      }

      .values {
        display: flex;
        align-items: baseline;
        gap: var(--sp-3);
      }

      .big {
        font-size: 22px;
        font-weight: 600;
        letter-spacing: -0.01em;
      }

      .pct {
        font-size: var(--fs-13);
        font-weight: 600;
      }

      .note {
        font-size: 10.5px;
        color: var(--text-tertiary);
      }

      .metrics {
        display: flex;
        flex-direction: column;
        gap: var(--sp-3);
        margin: 0;
        padding-top: var(--sp-4);
        border-top: 1px solid var(--border-color);
      }

      .metrics > div {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--sp-4);
      }

      .metrics dt {
        font-size: var(--fs-11);
        color: var(--text-tertiary);
      }

      .metrics dd {
        margin: 0;
        font-size: 12.5px;
        font-weight: 500;
        color: var(--text-primary);
      }

      .foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--sp-3);
        padding: var(--sp-4) var(--sp-4);
        border-top: 1px solid var(--border-color);
        font-size: var(--fs-11);
        color: var(--text-tertiary);
        flex: none;
      }

      .foot a {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        color: var(--brand-accent);
        text-decoration: none;
        font-size: 11.5px;
      }

      .foot a mat-icon,
      .dust mat-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
      }

      .foot .count {
        font-weight: 600;
        color: var(--text-secondary);
      }

      .foot-note {
        padding: var(--sp-3) var(--sp-4);
        border-top: 1px solid var(--border-color);
        font-size: 10.5px;
        line-height: 1.45;
        color: var(--text-tertiary);
        flex: none;
      }

      /* Trades */
      .trades-head {
        display: flex;
        flex-direction: column;
        gap: var(--sp-3);
        padding: var(--sp-4) var(--sp-4) var(--sp-3);
        border-bottom: 1px solid var(--border-color);
        flex: none;
      }

      .summary {
        font-size: var(--fs-11);
        color: var(--text-tertiary);
      }

      .summary .muted {
        color: var(--text-disabled);
      }

      .filters {
        display: flex;
        flex-wrap: wrap;
        gap: var(--sp-2);
      }

      .chip {
        height: 22px;
        padding: 0 8px;
        border: 1px solid var(--border-light);
        border-radius: 5px;
        background: transparent;
        color: var(--text-secondary);
        font-family: inherit;
        font-size: 10.5px;
        cursor: pointer;
      }

      .chip.active {
        border-color: transparent;
        background: var(--bg-tertiary);
        color: var(--text-primary);
        font-weight: 500;
      }

      .months {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding-bottom: var(--sp-3);
      }

      .month-head {
        position: sticky;
        top: 0;
        z-index: 1;
        display: flex;
        align-items: baseline;
        gap: 7px;
        padding: var(--sp-3) var(--sp-4) 5px;
        background: var(--bg-elevated);
      }

      .month-head .label {
        font-size: var(--fs-10);
        font-weight: 700;
        letter-spacing: 0.08em;
        color: var(--text-secondary);
      }

      .month-head .detail {
        font-size: var(--fs-10);
        color: var(--text-tertiary);
      }

      .order {
        display: flex;
        align-items: center;
        gap: var(--sp-3);
        margin: 0 var(--sp-3);
        padding: 7px 10px;
        border: 1px solid transparent;
        border-radius: var(--r-2);
      }

      .order:hover,
      .order.highlighted {
        border-color: rgba(0, 188, 212, 0.45);
        background: rgba(0, 188, 212, 0.08);
      }

      .side {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 19px;
        height: 19px;
        flex: none;
        border-radius: 50%;
        color: #0b0e11;
        font-size: var(--fs-10);
        font-weight: 700;
      }

      .buy .side {
        background: var(--chart-up);
      }

      .sell .side {
        background: var(--chart-down);
      }

      .main {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
        min-width: 0;
      }

      .amount {
        font-size: 12.5px;
        font-weight: 600;
        color: var(--text-primary);
      }

      .amount .asset,
      .meta {
        font-size: 10.5px;
        font-weight: 400;
        color: var(--text-tertiary);
      }

      .side-info {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 2px;
      }

      .total {
        font-size: var(--fs-12);
        color: var(--text-primary);
      }

      .date {
        font-size: var(--fs-10);
        color: var(--text-tertiary);
      }

      .dust {
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 2px var(--sp-3) 0;
        padding: 6px 10px;
        border: none;
        border-radius: var(--r-2);
        background: rgba(255, 255, 255, 0.022);
        color: var(--text-tertiary);
        font-family: inherit;
        font-size: var(--fs-11);
        text-align: left;
        cursor: pointer;
      }

      .dust:hover {
        color: var(--text-secondary);
      }

      .empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--sp-3);
        padding: 40px var(--sp-5);
        color: var(--text-tertiary);
        font-size: 12.5px;
        text-align: center;
      }

      .empty mat-icon {
        opacity: 0.5;
      }

      .empty p {
        margin: 0;
      }
    `,
  ],
})
export class AnalysisRailComponent {
  @ViewChild(AgentChatComponent) private chat?: AgentChatComponent;

  @Input() facet: RailFacet = 'position';
  @Input() symbol: string | null = null;
  @Input() position: RailPosition | null = null;
  @Input() highlightedId: string | null = null;
  @Input() annotationCount = 0;

  @Input() set data(value: PairTrades | null) {
    this.dataSignal.set(value);
  }
  get data(): PairTrades | null {
    return this.dataSignal();
  }

  @Input() set candleSpanMs(value: number) {
    this.spanSignal.set(value);
  }

  @Output() facetChange = new EventEmitter<RailFacet>();
  @Output() hover = new EventEmitter<string | null>();
  @Output() chartAction = new EventEmitter<ChartAction>();
  @Output() openFullscreen = new EventEmitter<void>();

  readonly facets: Array<{ id: RailFacet; label: string; hint: string }> = [
    { id: 'position', label: 'Posición', hint: 'Atajo: P' },
    { id: 'trades', label: 'Trades', hint: 'Atajo: M' },
    { id: 'agent', label: 'Agente', hint: 'Atajo: A' },
  ];

  readonly sideFilters: Array<{ value: SideFilter; label: string }> = [
    { value: 'all', label: 'Todos' },
    { value: 'buy', label: 'Compras' },
    { value: 'sell', label: 'Ventas' },
  ];

  readonly sideFilter = signal<SideFilter>('all');
  readonly showDust = signal(false);

  private readonly dataSignal = signal<PairTrades | null>(null);
  private readonly spanSignal = signal(60 * 60 * 1000);

  readonly tone = toneOf;

  get baseAsset(): string {
    return (this.symbol ?? '').split('/')[0] ?? '';
  }

  readonly grouped = computed(() => {
    const data = this.dataSignal();
    return groupTrades(data?.trades ?? [], data?.position ?? null, this.spanSignal());
  });

  readonly visibleMonths = computed<MonthGroup[]>(() => {
    const side = this.sideFilter();
    const dust = this.showDust();

    return this.grouped()
      .months.map((month) => {
        const orders = month.orders.filter((o) => side === 'all' || o.side === side);
        // showing dust means listing it, not hiding the summary row
        const withDust = dust && month.dust ? orders : orders;
        return { ...month, orders: withDust };
      })
      .filter((month) => month.orders.length > 0 || (!!month.dust && !dust));
  });

  monthSummary(month: MonthGroup): string {
    const parts: string[] = [];
    if (month.buys) parts.push(`${month.buys} ${month.buys === 1 ? 'compra' : 'compras'}`);
    if (month.sells) parts.push(`${month.sells} ${month.sells === 1 ? 'venta' : 'ventas'}`);
    const net = month.netAmount;
    const sign = net > 0 ? '+' : net < 0 ? '−' : '';
    const amount = Math.abs(net).toLocaleString('es-AR', { maximumFractionDigits: 6 });
    return `${parts.join(' · ')} · neto ${sign}${amount} ${this.baseAsset}`;
  }

  trackOrder(order: TradeOrder): string {
    return order.id;
  }

  /**
   * Sends a question straight into the chat. The agent facet has to be
   * mounted first, so the caller switches to it and this runs on the next
   * tick, once the child exists.
   */
  askAgent(text: string): void {
    this.chat?.quickSend(text);
  }
}
