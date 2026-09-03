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
import { CostBasisLot } from '../../core/services/pnl.service';
import { EmMoneyPipe, EmPctPipe, EmQtyPipe, EmSignedPipe, toneOf } from '../../shared/pipes/format.pipes';
import { groupTrades, MonthGroup, TradeOrder } from './lib/trade-grouping';

export type RailFacet = 'position' | 'trades' | 'lots' | 'agent';

export interface RailPosition extends PairPosition {
  unrealizedPnl: number | null;
  unrealizedPct: number | null;
  currentValue: number | null;
}

/**
 * The base asset across EVERY pair, as the P&L module keeps it: FIFO lots,
 * so a sale consumes the oldest buys, and NEXO sold for BTC counts as BTC.
 * This is the "Costo Prom." of the balances screen, shown here so the two
 * numbers sit side by side instead of contradicting each other from afar.
 */
export interface AssetPosition {
  amount: number;
  costBasis: number;
  avgCost: number;
  currentValue: number;
  unrealizedPnl: number;
  unrealizedPct: number;
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

        <button
          type="button"
          class="collapse"
          title="Ocultar el panel · B"
          aria-label="Ocultar el panel"
          (click)="close.emit()">
          <mat-icon>close</mat-icon>
        </button>
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
                <div>
                  <dt>PPC ({{ symbol }})</dt>
                  <dd class="num em-mine">{{ p.avgEntryPrice | emMoney }}</dd>
                </div>
                @if (assetPosition; as a) {
                  <div>
                    <dt>
                      PPC ({{ baseAsset }})
                      <mat-icon class="hint" [title]="assetHint()">info_outline</mat-icon>
                    </dt>
                    <dd class="num">{{ a.avgCost | emMoney }}</dd>
                  </div>
                }
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

              @if (assetPosition; as a) {
                <div class="asset">
                  <span class="tag">{{ baseAsset }} en todos los pares · FIFO</span>
                  <dl class="metrics">
                    <div><dt>Tenencia</dt><dd class="num">{{ a.amount | emQty: baseAsset }}</dd></div>
                    <div><dt>Invertido</dt><dd class="num">{{ a.costBasis | emMoney }}</dd></div>
                    <div>
                      <dt>No realizado</dt>
                      <dd class="num" [class]="tone(a.unrealizedPnl)">
                        {{ a.unrealizedPnl | emSigned }}
                        <span class="pct-inline">{{ a.unrealizedPct | emPct }}</span>
                      </dd>
                    </div>
                  </dl>
                  <p class="note">
                    Es el costo promedio de Balances. PPC ({{ symbol }}) promedia solo este par;
                    PPC ({{ baseAsset }}) lleva lotes FIFO de todos los pares
                    @if (data?.crossTradeCount) {
                      e incluye
                      <button type="button" class="link" (click)="facetChange.emit('trades')">
                        {{ data!.crossTradeCount }} movimientos vía {{ crossPairs() || 'otros pares' }}
                      </button>
                    }.
                  </p>
                </div>
              }

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
                @if (data?.crossTradeCount) {
                  <span class="muted">· {{ data!.crossTradeCount }} vía otros pares</span>
                }
                @if (grouped().orderCount !== (data?.position?.tradeCount ?? 0) + grouped().viaCount) {
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
                @if (data?.crossTradeCount) {
                  <button
                    type="button"
                    class="chip"
                    [class.active]="showCrossSignal()"
                    [title]="'Movimientos de ' + baseAsset + ' en otros pares, como los contabiliza el P&L'"
                    (click)="showCrossChange.emit(!showCrossSignal())">
                    Otros pares: {{ showCrossSignal() ? 'on' : 'off' }}
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
                      [class.cross]="!!order.via"
                      [class.highlighted]="order.id === highlightedId"
                      (mouseenter)="hover.emit(order.id)"
                      (mouseleave)="hover.emit(null)">
                      <span class="side">{{ order.side === 'buy' ? 'B' : 'S' }}</span>
                      <div class="main">
                        <span class="amount num">
                          {{ order.side === 'buy' ? '+' : '−' }}{{ order.amount | emQty }}
                          <span class="ticker">{{ baseAsset }}</span>
                        </span>
                        <span class="meta num">
                          @if (order.via && !order.via.booked) {
                            &#64; sin precio
                          } @else {
                            &#64; {{ order.price | emMoney }}
                          }
                          @if (order.via; as via) {
                            <span class="via">· vía {{ via.pair }}</span>
                          }
                          @if (order.fills.length > 1) {
                            <span class="fills">· {{ order.fills.length }} fills</span>
                          }
                        </span>
                        @if (order.via; as via) {
                          <span class="calc">
                            {{ viaWhat(order) }}
                            @if (via.booked) {
                              · {{ baseAsset }} a {{ order.price | emMoney }} ese día
                              ({{ via.source === 'lot' ? 'abre un lote' : 'consume lotes FIFO' }})
                            } @else {
                              · sin precio histórico: el P&L no lo contabilizó
                            }
                          </span>
                        }
                      </div>
                      <div class="side-info">
                        <span class="total num">
                          {{ order.via && !order.via.booked ? '—' : (order.total | emMoney) }}
                        </span>
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

        @case ('lots') {
          <div class="facet lots">
            <div class="trades-head">
              <span class="summary">
                @if (openLots().length) {
                  {{ openLots().length }} {{ openLots().length === 1 ? 'lote abierto' : 'lotes abiertos' }}
                  <span class="muted">· se consumen de arriba hacia abajo (FIFO)</span>
                } @else {
                  Lotes de {{ baseAsset }}
                }
              </span>
              @if (lotsTotals(); as tot) {
                <dl class="lots-metrics">
                  <div>
                    <dt>Queda</dt>
                    <dd class="num">{{ tot.amount | emQty: baseAsset }}</dd>
                  </div>
                  <div>
                    <dt>PPC ponderado</dt>
                    <dd class="num em-mine">{{ tot.avgCost | emMoney }}</dd>
                  </div>
                  @if (tot.unrealized !== null) {
                    <div>
                      <dt>No realizado</dt>
                      <dd class="num" [class.em-up]="tot.unrealized > 0" [class.em-down]="tot.unrealized < 0">
                        {{ tot.unrealized > 0 ? '+' : '' }}{{ tot.unrealized | emMoney }}
                      </dd>
                    </div>
                  }
                </dl>
              }
            </div>

            <div class="months">
              @if (lotsLoading && !openLots().length) {
                <div class="empty"><p>Cargando lotes…</p></div>
              } @else {
                @for (lot of openLots(); track lot.id) {
                  <div class="order lot">
                    <span class="side lot-source" [title]="sourceLabel(lot.source)">
                      {{ sourceInitial(lot.source) }}
                    </span>
                    <div class="main">
                      <span class="amount num">
                        {{ lot.remainingAmount | emQty }}
                        <span class="ticker">{{ baseAsset }}</span>
                        @if (lot.remainingAmount < lot.originalAmount) {
                          <span class="ticker">· de {{ lot.originalAmount | emQty }}</span>
                        }
                      </span>
                      <span class="meta num">
                        &#64; {{ lot.costPerUnit | emMoney }}
                        <span class="via">· {{ sourceLabel(lot.source) }} en {{ lot.exchange }}</span>
                      </span>
                    </div>
                    <div class="side-info">
                      @if (lotPnl(lot); as pnl) {
                        <span class="total num" [class.em-up]="pnl.value > 0" [class.em-down]="pnl.value < 0">
                          {{ pnl.value > 0 ? '+' : '' }}{{ pnl.value | emMoney }}
                        </span>
                      }
                      <span class="date">{{ lot.acquiredAt | date: 'dd MMM yy' }}</span>
                    </div>
                  </div>
                } @empty {
                  <div class="empty">
                    <mat-icon>inventory_2</mat-icon>
                    <p>Sin lotes abiertos de {{ baseAsset }}.</p>
                  </div>
                }
              }
            </div>

            @if (lotsMismatch(); as falta) {
              <div class="foot-note">
                Los lotes suman {{ falta.enLotes | emQty: baseAsset }} y la posición
                dice {{ falta.real | emQty: baseAsset }}: la contabilidad de este activo
                no reconcilia, así que tomá estos números con pinzas.
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
        gap: var(--sp-3);
        padding: var(--sp-4) var(--sp-4) var(--sp-3);
        border-bottom: 1px solid var(--border-color);
        flex: none;
      }

      .collapse {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        margin-left: auto;
        border: none;
        border-radius: var(--r-2);
        background: transparent;
        color: var(--text-tertiary);
        cursor: pointer;
      }

      .collapse:hover {
        background: var(--bg-tertiary);
        color: var(--text-primary);
      }

      .collapse mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
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
        gap: 4px;
        height: 22px;
        padding: 0 8px;
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
        background: var(--bg-tertiary);
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
        gap: 4px;
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
        font-size: 20px;
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

      .metrics dt .hint {
        font-size: 12px;
        width: 12px;
        height: 12px;
        vertical-align: -2px;
        margin-left: 2px;
        color: var(--text-tertiary);
        cursor: help;
      }

      .pct-inline {
        margin-left: 4px;
        font-size: var(--fs-11);
        font-weight: 500;
        opacity: 0.85;
      }

      /* La tarjeta del activo en Posición: el número de la pantalla de saldos.
         OJO: es un bloque con borde y padding. El ticker de una fila de trades
         se llama .ticker justo por esto — cuando los dos se llamaban .asset,
         cada fila mostraba "BTC" dentro de un recuadro punteado de ancho
         completo, como un campo de formulario vacío. */
      .asset {
        display: flex;
        flex-direction: column;
        gap: var(--sp-3);
        padding: var(--sp-3) var(--sp-3) var(--sp-3);
        border: 1px dashed var(--border-light);
        border-radius: var(--r-2);
        background: rgba(255, 255, 255, 0.022);
      }

      .asset .metrics {
        padding-top: 0;
        border-top: none;
      }

      .asset .note {
        margin: 0;
        font-size: 10.5px;
        line-height: 1.45;
        color: var(--text-tertiary);
      }

      .link {
        padding: 0;
        border: none;
        background: none;
        color: var(--text-primary);
        font: inherit;
        cursor: pointer;
      }

      .link:hover {
        text-decoration: underline;
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
        color: var(--text-primary);
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
        gap: 8px;
        padding: var(--sp-3) var(--sp-4) 4px;
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
        padding: 8px 8px;
        border: 1px solid transparent;
        border-radius: var(--r-2);
      }

      .order:hover,
      .order.highlighted {
        border-color: rgba(217, 160, 91, 0.45);
        background: rgba(217, 160, 91, 0.08);
      }

      .side {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 19px;
        height: 19px;
        flex: none;
        border-radius: 50%;
        color: var(--text-primary);
        font-size: var(--fs-10);
        font-weight: 700;
      }

      .buy .side {
        background: var(--chart-up);
      }

      .sell .side {
        background: var(--chart-down);
      }

      /* Came through another pair: hollow, like its marker on the chart */
      .order.cross {
        border-style: dashed;
        border-color: var(--border-light);
      }

      .order.cross .side {
        background: transparent;
        border: 1.5px dashed currentColor;
      }

      .buy.cross .side {
        color: var(--chart-up);
      }

      .sell.cross .side {
        color: var(--chart-down);
      }

      .via {
        color: var(--text-secondary);
      }

      .calc {
        font-size: 10px;
        line-height: 1.35;
        color: var(--text-tertiary);
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

      .amount .ticker,
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

      /* Lotes: la misma fila que un trade, con el origen en vez del lado. */
      .lots-metrics {
        display: flex;
        flex-wrap: wrap;
        gap: var(--sp-3) var(--sp-4);
        margin: 0;
      }

      .lots-metrics div {
        display: flex;
        flex-direction: column;
        gap: 1px;
      }

      .lots-metrics dt {
        font-size: var(--fs-10);
        color: var(--text-tertiary);
      }

      .lots-metrics dd {
        margin: 0;
        font-size: var(--fs-12);
        color: var(--text-primary);
      }

      .lot-source {
        background: var(--bg-tertiary);
        color: var(--text-secondary);
        font-weight: 600;
      }

      .dust {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 2px var(--sp-3) 0;
        padding: 8px 8px;
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
  @Input() assetPosition: AssetPosition | null = null;
  @Input() highlightedId: string | null = null;
  @Input() annotationCount = 0;

  @Input() set showCross(value: boolean) {
    this.showCrossSignal.set(value);
  }

  /** Lotes abiertos del activo base, del más viejo al más nuevo. */
  @Input() set lots(value: CostBasisLot[] | null) {
    this.lotsSignal.set(value ?? null);
  }
  get lots(): CostBasisLot[] | null {
    return this.lotsSignal();
  }

  /** Precio de la última vela, para valuar cada lote contra el mercado. */
  @Input() set lastPrice(value: number | null) {
    this.lastPriceSignal.set(value);
  }

  @Input() lotsLoading = false;

  @Input() set data(value: PairTrades | null) {
    this.dataSignal.set(value);
  }
  get data(): PairTrades | null {
    return this.dataSignal();
  }

  @Input() set candleSpanMs(value: number) {
    this.spanSignal.set(value);
  }

  private readonly lotsSignal = signal<CostBasisLot[] | null>(null);
  private readonly lastPriceSignal = signal<number | null>(null);

  /**
   * Los lotes que todavía tenés, del más viejo al más nuevo: FIFO consume de
   * arriba hacia abajo, así que ese orden dice cuál se va a ir primero.
   */
  readonly openLots = computed(() =>
    (this.lotsSignal() ?? [])
      .filter((l) => l.remainingAmount > 0)
      .sort((a, b) => new Date(a.acquiredAt).getTime() - new Date(b.acquiredAt).getTime()),
  );

  /** Lo que queda, su costo ponderado —el PPC de la línea punteada— y su P&L. */
  readonly lotsTotals = computed(() => {
    const lots = this.openLots();
    if (!lots.length) return null;
    const amount = lots.reduce((s, l) => s + l.remainingAmount, 0);
    const cost = lots.reduce((s, l) => s + l.remainingAmount * l.costPerUnit, 0);
    if (!(amount > 0)) return null;
    const price = this.lastPriceSignal();
    return {
      amount,
      avgCost: cost / amount,
      unrealized: price && price > 0 ? amount * price - cost : null,
    };
  });

  /**
   * Cuando lo que dicen los lotes no es lo que decís tener. Pasa cuando la
   * historia importada está incompleta, y hay que decirlo: un número que no
   * reconcilia y no lo avisa es peor que no mostrarlo.
   */
  lotsMismatch(): { enLotes: number; real: number } | null {
    // Método y no computed: `assetPosition` es un @Input plano, y un computed
    // sólo se entera de lo que cambia en signals. Acá el valor se recalcula en
    // cada render, que con OnPush ocurre justo cuando cambia el input.
    const tot = this.lotsTotals();
    const real = this.assetPosition?.amount;
    if (!tot || !real || real <= 0) return null;
    const dif = Math.abs(tot.amount - real);
    return dif > Math.max(real * 0.01, 1e-8) ? { enLotes: tot.amount, real } : null;
  }

  lotPnl(lot: CostBasisLot): { value: number } | null {
    const price = this.lastPriceSignal();
    if (!price || price <= 0) return null;
    return { value: lot.remainingAmount * (price - lot.costPerUnit) };
  }

  sourceLabel(source: string): string {
    switch (source) {
      case 'trade': return 'compra';
      case 'trade-counter': return 'compra vía otro par';
      case 'interest': return 'interés';
      case 'deposit': return 'depósito';
      default: return source;
    }
  }

  sourceInitial(source: string): string {
    switch (source) {
      case 'interest': return '%';
      case 'deposit': return '↓';
      case 'trade-counter': return '⇄';
      default: return 'C';
    }
  }

  @Output() facetChange = new EventEmitter<RailFacet>();
  @Output() showCrossChange = new EventEmitter<boolean>();
  @Output() hover = new EventEmitter<string | null>();
  @Output() chartAction = new EventEmitter<ChartAction>();
  @Output() openFullscreen = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();

  readonly facets: Array<{ id: RailFacet; label: string; hint: string }> = [
    { id: 'position', label: 'Posición', hint: 'Atajo: P' },
    { id: 'trades', label: 'Trades', hint: 'Atajo: M' },
    { id: 'lots', label: 'Lotes', hint: 'Atajo: L' },
    { id: 'agent', label: 'Agente', hint: 'Atajo: A' },
  ];

  readonly sideFilters: Array<{ value: SideFilter; label: string }> = [
    { value: 'all', label: 'Todos' },
    { value: 'buy', label: 'Compras' },
    { value: 'sell', label: 'Ventas' },
  ];

  readonly sideFilter = signal<SideFilter>('all');
  readonly showDust = signal(false);
  readonly showCrossSignal = signal(true);

  private readonly dataSignal = signal<PairTrades | null>(null);
  private readonly spanSignal = signal(60 * 60 * 1000);

  readonly tone = toneOf;

  get baseAsset(): string {
    return (this.symbol ?? '').split('/')[0] ?? '';
  }

  readonly grouped = computed(() => {
    const data = this.dataSignal();
    const cross = this.showCrossSignal() ? data?.crossTrades ?? [] : [];
    return groupTrades(data?.trades ?? [], data?.position ?? null, this.spanSignal(), cross);
  });

  /** `NEXO/BTC, BTC/ETH` — the other pairs the asset moved through, in range */
  readonly crossPairs = computed(() => {
    const pairs = new Set((this.dataSignal()?.crossTrades ?? []).map((c) => c.pair));
    return [...pairs].join(', ');
  });

  assetHint(): string {
    return (
      `Costo promedio de ${this.baseAsset} en todos los pares, como lo lleva el P&L ` +
      `(lotes FIFO: cada venta consume las compras más viejas). ` +
      `PPC (${this.symbol}) es el promedio ponderado de este par nada más.`
    );
  }

  /**
   * What the cross trade really was, in the user's words:
   * "Vendiste 915,2 NEXO por 0,0112 BTC". The USD side is rendered apart.
   */
  viaWhat(order: TradeOrder): string {
    const via = order.via;
    if (!via) return '';
    const qty = (v: number) => v.toLocaleString('es-AR', { maximumFractionDigits: 6 });
    const base = this.baseAsset;

    if (via.asset === base) {
      // BTC/ETH: the base asset is the one stored, the other leg is the quote
      const verb = via.side === 'buy' ? 'Compraste' : 'Vendiste';
      const link = via.side === 'buy' ? 'con' : 'por';
      return `${verb} ${qty(order.amount)} ${base} ${link} ${qty(via.amount * via.price)} ${via.priceAsset}`;
    }
    // NEXO/BTC: the base asset is the quote, so the trade reads inverted
    const verb = via.side === 'sell' ? 'Vendiste' : 'Compraste';
    const link = via.side === 'sell' ? 'por' : 'con';
    return `${verb} ${qty(via.amount)} ${via.asset} ${link} ${qty(order.amount)} ${base}`;
  }

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
    if (month.via) parts.push(`${month.via} vía otros pares`);
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
