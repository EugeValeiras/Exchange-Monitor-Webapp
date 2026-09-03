import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  ViewChild,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ExchangeLogoComponent } from '../../shared/components/exchange-logo/exchange-logo.component';
import { SeriesMenuComponent } from './series-menu.component';
import { DEFAULT_SERIES, SeriesConfig } from './lib/series';
import { EmCompactPipe, EmMoneyPipe, EmPctPipe, EmQtyPipe, EmSignedPipe, toneOf } from '../../shared/pipes/format.pipes';
import { MarketExchange, MarketTimeframe } from '../../core/services/market-analysis.service';

export interface HeaderPosition {
  unrealizedPnl: number | null;
  unrealizedPct: number | null;
  /** Sobre cuánto se calcula: sin esto el número no dice de qué habla. */
  amount: number | null;
}

export interface HeaderContext {
  candleCount: number;
  high: number | null;
  low: number | null;
  volume24h: number | null;
  /** Seconds since the price was last refreshed */
  ageSeconds: number | null;
}

/**
 * What the screen answers in the first half second: which pair, what it is
 * worth, how much it moved, how I am doing, and how fresh the number is.
 *
 * It replaces a card title that said "BTC/USDT" and a subtitle that said
 * "Velas + indicadores (1w)" — text explaining what the user was already
 * looking at.
 */
@Component({
  selector: 'app-instrument-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatIconModule,
    MatTooltipModule,
    ExchangeLogoComponent,
    SeriesMenuComponent,
    EmMoneyPipe,
    EmPctPipe,
    EmSignedPipe,
    EmCompactPipe,
    EmQtyPipe,
  ],
  template: `
    <header class="instrument">
      <div class="identity">
        <div class="line-1">
          <button type="button" class="pair" (click)="openSwitcher.emit()">
            <app-exchange-logo [exchange]="exchange" [size]="18"></app-exchange-logo>
            <span class="symbol">{{ symbol ?? '—' }}</span>
            <mat-icon>expand_more</mat-icon>
            <span class="hint">⌘K</span>
          </button>

          @if (price !== null) {
            <span class="price num">{{ price | emMoney }}</span>
          } @else {
            <span class="price skeleton">&nbsp;</span>
          }

          @if (change !== null) {
            <div class="delta" [class]="tone(change)">
              <span class="num">{{ change | emSigned }}</span>
              <span class="num">{{ changePct | emPct }}</span>
            </div>
          }

          @if (position?.unrealizedPnl !== null && position?.unrealizedPnl !== undefined) {
            <div class="divider"></div>
            <div class="mine">
              <span class="tag">No realizado</span>
              <span class="value num" [class]="tone(position!.unrealizedPnl)">
                {{ position!.unrealizedPnl | emSigned }}
              </span>
              <span class="pct num" [class]="tone(position!.unrealizedPnl)">
                {{ position!.unrealizedPct | emPct }}
              </span>
              @if (position!.amount) {
                <span
                  class="on num"
                  [title]="'Sobre lo que compraste en ' + symbol + '. Tu ' + baseAsset +
                    ' de otros pares se cuenta aparte, en el panel de Lotes.'">
                  de {{ position!.amount | emQty: baseAsset }}
                </span>
              }
            </div>
          }
        </div>

        <div class="line-2">
          <span>{{ timeframe }}</span>
          @if (context?.candleCount) {
            <span>· {{ context!.candleCount }} velas</span>
          }
          @if (context?.high !== null && context?.high !== undefined) {
            <span>· máx <b class="num">{{ context!.high | emMoney }}</b></span>
            <span>· mín <b class="num">{{ context!.low | emMoney }}</b></span>
          }
          @if (position?.unrealizedPct !== null && position?.unrealizedPct !== undefined) {
            <span>· vs PPC <b class="num" [class]="tone(position!.unrealizedPct)">{{ position!.unrealizedPct | emPct }}</b></span>
          } @else if (context?.volume24h) {
            <span>· vol 24h <b class="num">{{ context!.volume24h | emCompact }}</b></span>
          }
          <span class="sep">|</span>
          <span class="freshness" [class.stale]="isStale" [class.offline]="!socketConnected">
            <span class="dot"></span>{{ freshnessLabel }}
          </span>
        </div>
      </div>

      <div class="controls">
        <div class="segmented" role="radiogroup" aria-label="Timeframe">
          @for (tf of timeframes; track tf; let i = $index) {
            <button
              type="button"
              role="radio"
              [attr.aria-checked]="tf === timeframe"
              [class.active]="tf === timeframe"
              [title]="'Atajo: ' + (i + 1)"
              (click)="timeframeChange.emit(tf)">
              {{ tf }}
            </button>
          }
        </div>

        <div class="toggles">
          <button
            type="button"
            class="toggle"
            [class.active]="log"
            title="Escala logarítmica · L"
            [attr.aria-pressed]="log"
            (click)="logChange.emit(!log)">
            LOG
          </button>
          <button
            type="button"
            class="toggle"
            [class.active]="tradesLayer && hasTrades"
            [disabled]="!hasTrades"
            [matTooltip]="hasTrades ? 'Mis trades sobre las velas · T' : 'No tenés trades en ' + (symbol ?? 'este par')"
            [attr.aria-pressed]="tradesLayer && hasTrades"
            (click)="tradesLayerChange.emit(!tradesLayer)">
            <mat-icon>layers</mat-icon>
            <span>Mis trades</span>
            @if (hasTrades) {
              <span class="count">{{ tradeCount }}</span>
            }
          </button>
          <button
            type="button"
            class="toggle"
            [class.active]="lotsLayer && hasLots"
            [disabled]="!hasLots"
            [matTooltip]="hasLots
              ? 'Tus lotes abiertos como escalones, al costo de cada uno · L'
              : 'No tenés lotes abiertos de ' + baseAsset"
            [attr.aria-pressed]="lotsLayer && hasLots"
            (click)="lotsLayerChange.emit(!lotsLayer)">
            <mat-icon>inventory_2</mat-icon>
            <span>Lotes</span>
            @if (hasLots) {
              <span class="count">{{ lotCount }}</span>
            }
          </button>
          <div class="anchor" #anchor>
            <button
              type="button"
              class="toggle"
              [class.active]="seriesMenuOpen()"
              title="Series e indicadores · S"
              [attr.aria-expanded]="seriesMenuOpen()"
              aria-haspopup="menu"
              (click)="toggleSeriesMenu()">
              <span>Series</span>
              @if (activeSeries > 0) {
                <span class="count">{{ activeSeries }}</span>
              }
              <mat-icon>{{ seriesMenuOpen() ? 'expand_less' : 'expand_more' }}</mat-icon>
            </button>
            @if (seriesMenuOpen()) {
              <app-series-menu
                [series]="series"
                (seriesChange)="seriesChange.emit($event)"
                (reset)="seriesChange.emit(defaults)"></app-series-menu>
            }
          </div>
          <button
            type="button"
            class="toggle rail"
            [class.active]="railOpen"
            [matTooltip]="railHint"
            [attr.aria-pressed]="railOpen"
            [attr.aria-label]="railLabel"
            (click)="railOpenChange.emit(!railOpen)">
            <span>Panel</span>
            <mat-icon>{{ railOpen ? 'chevron_right' : 'chevron_left' }}</mat-icon>
          </button>
        </div>
      </div>
    </header>
  `,
  styles: [
    `
      .instrument {
        display: flex;
        align-items: flex-start;
        gap: var(--sp-6);
        padding: var(--sp-5) 24px;
        background: var(--bg-elevated);
        border-bottom: 1px solid var(--border-color);
        flex: none;
      }

      .identity {
        display: flex;
        flex-direction: column;
        gap: var(--sp-3);
        flex: 1;
        min-width: 0;
      }

      .line-1 {
        display: flex;
        align-items: baseline;
        gap: 12px;
        flex-wrap: wrap;
      }

      .pair {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        align-self: center;
        padding: 4px 8px 4px 8px;
        border: 1px solid var(--border-light);
        border-radius: 7px;
        background: transparent;
        color: var(--text-primary);
        font-family: inherit;
        cursor: pointer;
      }

      .pair:hover {
        background: rgba(255, 255, 255, 0.04);
      }

      .pair .symbol {
        font-size: 17px;
        font-weight: 600;
      }

      .pair mat-icon {
        font-size: 15px;
        width: 15px;
        height: 15px;
        color: var(--text-tertiary);
      }

      .hint {
        padding: 1px 4px;
        border: 1px solid var(--border-light);
        border-radius: var(--r-1);
        font-size: 9.5px;
        font-weight: 600;
        color: var(--text-tertiary);
      }

      .price {
        font-size: 32px;
        font-weight: 600;
        line-height: 1;
        letter-spacing: -0.02em;
        color: var(--text-primary);
      }

      .price.skeleton {
        display: inline-block;
        width: 190px;
        height: 34px;
        border-radius: var(--r-2);
        background: var(--bg-tertiary);
        opacity: 0.55;
      }

      .delta {
        display: flex;
        align-items: baseline;
        gap: var(--sp-2);
        font-size: 15px;
        font-weight: 600;
      }

      .divider {
        align-self: stretch;
        width: 1px;
        margin: 0 var(--sp-2);
        background: var(--border-color);
      }

      .mine {
        display: flex;
        align-items: baseline;
        gap: 8px;
      }

      .mine .tag {
        font-size: var(--fs-10);
        font-weight: 700;
        letter-spacing: 0.09em;
        text-transform: uppercase;
        color: var(--text-tertiary);
      }

      .mine .value {
        font-size: var(--fs-16);
        font-weight: 600;
      }

      /* De cuánto habla el número. Va apagado: es la nota al pie, no el dato. */
      .mine .on {
        font-size: var(--fs-11);
        color: var(--text-tertiary);
        cursor: help;
      }

      .mine .pct {
        font-size: var(--fs-13);
        font-weight: 500;
      }

      .line-2 {
        display: flex;
        align-items: center;
        gap: var(--sp-2);
        font-size: 11.5px;
        color: var(--text-tertiary);
        flex-wrap: wrap;
      }

      .line-2 b {
        font-weight: 500;
        color: var(--text-secondary);
      }

      .sep {
        color: var(--border-color);
      }

      .freshness {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }

      .freshness .dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--color-success);
      }

      .freshness.stale {
        color: var(--color-warning);
      }

      .freshness.stale .dot {
        background: var(--color-warning);
      }

      .freshness.offline {
        color: var(--text-tertiary);
      }

      .freshness.offline .dot {
        background: var(--text-disabled);
      }

      .controls {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 8px;
        flex: none;
      }

      .segmented {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        padding: 2px;
        border-radius: var(--r-2);
        background: var(--bg-tertiary);
      }

      .segmented button {
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
        box-shadow: 0 1px 0 rgba(0, 0, 0, 0.4);
      }

      .toggles {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
      }

      .toggle {
        display: inline-flex;
        align-items: center;
        gap: var(--sp-2);
        height: 26px;
        padding: 0 8px;
        border: 1px solid var(--border-light);
        border-radius: var(--r-2);
        background: transparent;
        color: var(--text-secondary);
        font-family: inherit;
        font-size: 11.5px;
        font-weight: 600;
        letter-spacing: 0.02em;
        cursor: pointer;
      }

      .toggle:hover:not(:disabled) {
        color: var(--text-primary);
      }

      .toggle:disabled {
        border-style: dashed;
        color: var(--text-disabled);
        cursor: default;
      }

      .toggle.active {
        border-color: var(--border-strong);
        background: rgba(217, 160, 91, 0.13);
        color: var(--text-primary);
      }

      .toggle mat-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
      }

      .anchor {
        position: relative;
      }

      .count {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 17px;
        height: 17px;
        padding: 0 4px;
        border-radius: 9px;
        background: var(--bg-tertiary);
        color: var(--text-secondary);
        font-size: var(--fs-10);
        font-weight: 700;
      }

      .toggle.active .count {
        background: var(--bg-selected);
        color: var(--text-primary);
      }

      @media (max-width: 900px) {
        .instrument {
          flex-direction: column;
          gap: var(--sp-4);
        }

        .price {
          font-size: 32px;
        }

        .controls {
          align-items: flex-start;
          width: 100%;
        }
      }
    `,
  ],
})
export class InstrumentHeaderComponent {
  @Input() symbol: string | null = null;
  @Input() exchange: MarketExchange = 'binance';
  @Input() timeframe: MarketTimeframe = '1h';
  @Input() timeframes: MarketTimeframe[] = [];
  @Input() price: number | null = null;
  @Input() change: number | null = null;
  @Input() changePct: number | null = null;
  @Input() position: HeaderPosition | null = null;
  @Input() context: HeaderContext | null = null;
  @Input() log = false;
  @Input() tradesLayer = true;
  @Input() lotsLayer = false;
  @Input() lotCount = 0;
  @Input() baseAsset = '';

  /** Los lotes ya se pidieron: hasta entonces no se sabe si hay o no. */
  @Input() lotsKnown = false;

  /**
   * Se deshabilita sólo cuando SABEMOS que no hay lotes. Si todavía no se
   * pidieron, el chip queda habilitado: pedirlos es justo lo que hace al
   * prenderlo, y deshabilitarlo antes lo dejaba muerto para siempre.
   */
  get hasLots(): boolean {
    return this.lotCount > 0 || !this.lotsKnown;
  }
  @Input() hasTrades = false;
  @Input() tradeCount = 0;
  /** Live price feed. Off means the numbers only move on the poll. */
  @Input() socketConnected = true;
  /** Whether the position/trades/agent rail is showing. */
  @Input() railOpen = true;
  /** Which indicator series the chart is drawing. */
  @Input() series: SeriesConfig = { ...DEFAULT_SERIES };

  @Output() timeframeChange = new EventEmitter<MarketTimeframe>();
  @Output() logChange = new EventEmitter<boolean>();
  @Output() tradesLayerChange = new EventEmitter<boolean>();
  @Output() lotsLayerChange = new EventEmitter<boolean>();
  @Output() openSwitcher = new EventEmitter<void>();
  @Output() seriesChange = new EventEmitter<SeriesConfig>();
  @Output() railOpenChange = new EventEmitter<boolean>();

  readonly tone = toneOf;
  readonly defaults = DEFAULT_SERIES;

  @ViewChild('anchor') private anchor?: ElementRef<HTMLElement>;

  readonly seriesMenuOpen = signal(false);

  /** How many series are on the chart right now, shown on the button. */
  get activeSeries(): number {
    return Object.values(this.series).filter(Boolean).length;
  }

  toggleSeriesMenu(): void {
    this.seriesMenuOpen.update((open) => !open);
  }

  closeSeriesMenu(): void {
    this.seriesMenuOpen.set(false);
  }

  /**
   * A click anywhere outside the button and its menu closes it — including
   * elsewhere in this header, which a host-wide check would have missed.
   */
  @HostListener('document:pointerdown', ['$event'])
  onDocumentDown(event: PointerEvent): void {
    if (!this.seriesMenuOpen()) return;
    const anchor = this.anchor?.nativeElement;
    if (anchor && !anchor.contains(event.target as Node)) this.closeSeriesMenu();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeSeriesMenu();
  }

  get railLabel(): string {
    return this.railOpen ? 'Ocultar el panel lateral' : 'Mostrar el panel lateral';
  }

  get railHint(): string {
    return `${this.railLabel} · B`;
  }

  get isStale(): boolean {
    const age = this.context?.ageSeconds;
    return age !== null && age !== undefined && age > 60;
  }

  /** A financial number without a timestamp is a number you cannot trust. */
  get freshnessLabel(): string {
    if (!this.socketConnected) return 'sin conexión en vivo';

    const age = this.context?.ageSeconds;
    if (age === null || age === undefined) return 'sin datos';
    if (age < 60) return `hace ${Math.max(1, Math.round(age))} s`;
    const minutes = Math.round(age / 60);
    if (minutes < 60) return `dato de hace ${minutes} min`;
    return `dato de hace ${Math.round(minutes / 60)} h`;
  }
}
