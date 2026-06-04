import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatRippleModule } from '@angular/material/core';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { HttpErrorResponse } from '@angular/common/http';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import {
  CredentialsService,
  ExchangeType,
} from '../../core/services/credentials.service';
import {
  RawExchange,
  RawOrderbook,
  RawPricesService,
  RawTicker,
} from '../../core/services/raw-prices.service';
import { SettingsService } from '../../core/services/settings.service';
import { ExchangeLogoComponent } from '../../shared/components/exchange-logo/exchange-logo.component';

const SUPPORTED: RawExchange[] = ['binance', 'kraken', 'coinbase'];
const DEPTH_OPTIONS = [10, 20, 50, 100] as const;
const REFRESH_OPTIONS: { label: string; ms: number }[] = [
  { label: 'Off', ms: 0 },
  { label: '5s', ms: 5_000 },
  { label: '10s', ms: 10_000 },
  { label: '30s', ms: 30_000 },
];

const FALLBACK_PAIRS_BY_EXCHANGE: Record<RawExchange, string[]> = {
  binance: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT', 'BNB/USDT'],
  kraken: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT', 'ADA/USDT'],
  coinbase: ['BTC/USD', 'ETH/USD', 'SOL/USD', 'XRP/USD', 'BTC/USDT'],
};

const MAX_POPULAR_CHIPS = 8;

const DEFAULT_SYMBOL_BY_EXCHANGE: Record<RawExchange, string> = {
  binance: 'BTC/USDT',
  kraken: 'BTC/USDT',
  coinbase: 'BTC/USD',
};

@Component({
  selector: 'app-raw-prices',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    DecimalPipe,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    MatChipsModule,
    MatTooltipModule,
    MatRippleModule,
    ExchangeLogoComponent,
  ],
  template: `
    <div class="raw-content">
      <!-- Header -->
      <header class="raw-header">
        <div class="title-block">
          <h1>
            <mat-icon>bolt</mat-icon>
            Precios Raw
          </h1>
          <p class="subtitle">
            Ticker y order book tomados directamente del exchange vía CCXT — sin cache.
          </p>
        </div>
        <div class="mode-switch" role="tablist" aria-label="Modo de consulta">
          <button
            type="button"
            role="tab"
            [attr.aria-selected]="!asMe()"
            [class.active]="!asMe()"
            (click)="setAsMe(false)"
            class="mode-option">
            <mat-icon>public</mat-icon>
            <span>Público</span>
          </button>
          <button
            type="button"
            role="tab"
            [attr.aria-selected]="asMe()"
            [class.active]="asMe()"
            [class.authenticated]="asMe()"
            [disabled]="!hasCredentialForSelected()"
            (click)="setAsMe(true)"
            [matTooltip]="
              hasCredentialForSelected()
                ? 'Usa tu API key de ' + selectedExchange()
                : 'Necesitás una credencial activa de ' + selectedExchange()
            "
            class="mode-option">
            <mat-icon>vpn_key</mat-icon>
            <span>Con mis credenciales</span>
          </button>
        </div>
      </header>

      <!-- Controls -->
      <mat-card class="controls-card">
        <div class="controls-row primary-row">
          <div class="control-group">
            <span class="control-label">Exchange</span>
            <mat-chip-set>
              @for (ex of exchanges; track ex) {
                <mat-chip
                  (click)="selectExchange(ex)"
                  [class.selected]="selectedExchange() === ex"
                  class="exchange-chip"
                  matRipple>
                  <app-exchange-logo [exchange]="ex" [size]="20"></app-exchange-logo>
                  <span class="chip-label">{{ ex }}</span>
                </mat-chip>
              }
            </mat-chip-set>
          </div>

          <div class="control-group symbol-group">
            <mat-form-field appearance="outline" class="symbol-field" subscriptSizing="dynamic">
              <mat-label>Símbolo</mat-label>
              <input
                matInput
                [formControl]="symbolControl"
                [matAutocomplete]="symbolAuto"
                (keydown.enter)="onSymbolEnter()"
                placeholder="BTC/USDT"
                spellcheck="false"
                autocapitalize="characters" />
              @if (loadingSymbols()) {
                <mat-spinner matSuffix diameter="16"></mat-spinner>
              } @else if (symbolControl.value) {
                <button
                  matSuffix
                  mat-icon-button
                  type="button"
                  aria-label="Clear"
                  (click)="clearSymbol()">
                  <mat-icon>close</mat-icon>
                </button>
              }
              <mat-autocomplete
                #symbolAuto="matAutocomplete"
                (optionSelected)="onSymbolPicked($event.option.value)"
                class="symbol-autocomplete">
                @for (s of filteredSymbols(); track s) {
                  <mat-option [value]="s">
                    <span class="option-symbol">{{ s }}</span>
                  </mat-option>
                }
                @if (filteredSymbols().length === 0 && !loadingSymbols() && availableSymbols().length > 0) {
                  <mat-option [disabled]="true">
                    <span class="option-empty">Sin resultados</span>
                  </mat-option>
                }
              </mat-autocomplete>
            </mat-form-field>
          </div>

          <div class="control-group">
            <span class="control-label">Auto-refresh</span>
            <mat-chip-set>
              @for (r of refreshOptions; track r.ms) {
                <mat-chip
                  (click)="setRefresh(r.ms)"
                  [class.selected]="refreshMs() === r.ms"
                  class="refresh-chip"
                  matRipple>
                  {{ r.label }}
                </mat-chip>
              }
            </mat-chip-set>
          </div>

          <div class="controls-spacer"></div>

          <button
            mat-flat-button
            color="primary"
            (click)="refresh()"
            [disabled]="loading()"
            class="refresh-btn"
            aria-label="Refrescar">
            @if (loading()) {
              <mat-spinner diameter="18" class="btn-spinner"></mat-spinner>
            } @else {
              <mat-icon>refresh</mat-icon>
              <span>Refrescar</span>
            }
          </button>
        </div>

        <div class="popular-row">
          <span class="popular-label">{{ popularLabel() }}</span>
          <mat-chip-set>
            @for (p of popularPairs(); track p) {
              <mat-chip
                (click)="quickPick(p)"
                [class.selected]="symbol() === p"
                class="popular-chip"
                matRipple>
                {{ p }}
              </mat-chip>
            }
          </mat-chip-set>
        </div>
      </mat-card>

      <!-- Two-column cards -->
      <div class="data-grid">
        <!-- Ticker -->
        <mat-card class="ticker-card">
          <div class="card-header">
            <div class="card-title">
              <mat-icon>query_stats</mat-icon>
              Ticker
            </div>
            @if (tickerAge() !== null) {
              <span class="card-updated" [matTooltip]="ticker()?.datetime || ''">
                hace {{ tickerAge() }}s
              </span>
            }
          </div>

          @if (tickerError()) {
            <div class="error-state">
              <mat-icon>error_outline</mat-icon>
              <span>{{ tickerError() }}</span>
            </div>
          } @else if (!ticker() && loading()) {
            <div class="loading-state">
              <mat-spinner diameter="32"></mat-spinner>
            </div>
          } @else if (ticker()) {
            <div class="ticker-body">
              <div class="last-price-block">
                <div class="last-price">
                  {{ ticker()!.last | number : '1.2-8' }}
                </div>
                <div class="symbol-label">{{ ticker()!.symbol }}</div>
                @if (ticker()!.percentage !== null) {
                  <div
                    class="change-pill"
                    [class.up]="(ticker()!.percentage ?? 0) >= 0"
                    [class.down]="(ticker()!.percentage ?? 0) < 0">
                    <mat-icon>{{
                      (ticker()!.percentage ?? 0) >= 0 ? 'trending_up' : 'trending_down'
                    }}</mat-icon>
                    <span>{{ (ticker()!.percentage ?? 0) | number : '1.2-2' }}%</span>
                    @if (ticker()!.change !== null) {
                      <span class="change-abs">
                        ({{ (ticker()!.change ?? 0) | number : '1.2-2' }})
                      </span>
                    }
                  </div>
                }
              </div>

              <div class="metrics-grid">
                <div class="metric">
                  <span class="metric-label">Bid</span>
                  <span class="metric-value bid">
                    {{ ticker()!.bid | number : '1.2-8' }}
                  </span>
                </div>
                <div class="metric">
                  <span class="metric-label">Ask</span>
                  <span class="metric-value ask">
                    {{ ticker()!.ask | number : '1.2-8' }}
                  </span>
                </div>
                <div class="metric">
                  <span class="metric-label">Spread</span>
                  <span class="metric-value">
                    @if (tickerSpread() !== null) {
                      {{ tickerSpread()! | number : '1.2-8' }}
                      <span class="metric-sub">
                        ({{ tickerSpreadPct() | number : '1.3-3' }}%)
                      </span>
                    } @else {
                      —
                    }
                  </span>
                </div>
                <div class="metric">
                  <span class="metric-label">24h High</span>
                  <span class="metric-value">
                    {{ ticker()!.high | number : '1.2-8' }}
                  </span>
                </div>
                <div class="metric">
                  <span class="metric-label">24h Low</span>
                  <span class="metric-value">
                    {{ ticker()!.low | number : '1.2-8' }}
                  </span>
                </div>
                <div class="metric">
                  <span class="metric-label">Open</span>
                  <span class="metric-value">
                    {{ ticker()!.open | number : '1.2-8' }}
                  </span>
                </div>
                <div class="metric">
                  <span class="metric-label">VWAP</span>
                  <span class="metric-value">
                    @if (ticker()!.vwap !== null) {
                      {{ ticker()!.vwap | number : '1.2-8' }}
                    } @else {
                      —
                    }
                  </span>
                </div>
                <div class="metric">
                  <span class="metric-label">Volume</span>
                  <span class="metric-value">
                    {{ ticker()!.baseVolume | number : '1.2-4' }}
                  </span>
                </div>
              </div>
            </div>
          }
        </mat-card>

        <!-- Order Book -->
        <mat-card class="orderbook-card">
          <div class="card-header">
            <div class="card-title">
              <mat-icon>book_online</mat-icon>
              Order Book
            </div>
            <div class="depth-chips">
              <mat-chip-set>
                @for (d of depthOptions; track d) {
                  <mat-chip
                    (click)="setDepth(d)"
                    [class.selected]="depth() === d"
                    class="depth-chip"
                    matRipple>
                    {{ d }}
                  </mat-chip>
                }
              </mat-chip-set>
            </div>
          </div>

          @if (orderbookError()) {
            <div class="error-state">
              <mat-icon>error_outline</mat-icon>
              <span>{{ orderbookError() }}</span>
            </div>
          } @else if (!orderbook() && loading()) {
            <div class="loading-state">
              <mat-spinner diameter="32"></mat-spinner>
            </div>
          } @else if (orderbook()) {
            <div class="book-body">
              @if (bookSpread() !== null) {
                <div class="book-spread">
                  Spread <strong>{{ bookSpread()! | number : '1.2-8' }}</strong>
                  <span class="book-spread-pct">
                    ({{ bookSpreadPct() | number : '1.3-3' }}%)
                  </span>
                </div>
              }

              <div class="book-grid">
                <div class="book-col bids-col">
                  <div class="book-col-header">
                    <span>Price</span>
                    <span>Amount</span>
                  </div>
                  @for (row of bidsView(); track $index) {
                    <div class="book-row bid">
                      <div class="depth-bar" [style.width.%]="row.pct"></div>
                      <span class="price">{{ row.price | number : '1.2-8' }}</span>
                      <span class="amount">{{ row.amount | number : '1.2-6' }}</span>
                    </div>
                  }
                </div>
                <div class="book-col asks-col">
                  <div class="book-col-header">
                    <span>Price</span>
                    <span>Amount</span>
                  </div>
                  @for (row of asksView(); track $index) {
                    <div class="book-row ask">
                      <div class="depth-bar" [style.width.%]="row.pct"></div>
                      <span class="price">{{ row.price | number : '1.2-8' }}</span>
                      <span class="amount">{{ row.amount | number : '1.2-6' }}</span>
                    </div>
                  }
                </div>
              </div>
            </div>
          }
        </mat-card>
      </div>

      <!-- Raw JSON -->
      @if (ticker()) {
        <mat-card class="raw-json-card">
          <div class="raw-json-header" (click)="toggleRaw()" matRipple>
            <div class="card-title">
              <mat-icon>data_object</mat-icon>
              Respuesta raw del exchange ({{ selectedExchange() }})
            </div>
            <mat-icon>{{ showRaw() ? 'expand_less' : 'expand_more' }}</mat-icon>
          </div>
          @if (showRaw()) {
            <pre class="raw-json">{{ prettyInfo() }}</pre>
          }
        </mat-card>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .raw-content {
        max-width: 1400px;
        margin: 0 auto;
        padding: 24px;
        display: flex;
        flex-direction: column;
        gap: 20px;
      }

      @media (max-width: 900px) {
        .raw-content {
          padding: 12px;
          gap: 12px;
        }

        .title-block h1 {
          font-size: 22px !important;
        }

        .title-block h1 mat-icon {
          font-size: 24px !important;
          width: 24px !important;
          height: 24px !important;
        }
      }

      .raw-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        flex-wrap: wrap;
      }

      .title-block h1 {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 28px;
        font-weight: 600;
        margin: 0;
        color: var(--text-primary);
      }
      .title-block h1 mat-icon {
        color: var(--brand-accent, #00bcd4);
        font-size: 32px;
        width: 32px;
        height: 32px;
      }
      .subtitle {
        margin: 4px 0 0;
        color: var(--text-secondary);
        font-size: 14px;
      }

      /* ── Mode switch (header) ─────────────────────────── */
      .mode-switch {
        display: inline-flex;
        align-items: center;
        padding: 3px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
      }
      .mode-option {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 7px 14px;
        border-radius: 999px;
        background: transparent;
        border: none;
        color: var(--text-secondary);
        font-size: 13px;
        font-weight: 500;
        font-family: inherit;
        cursor: pointer;
        transition: background 0.15s ease, color 0.15s ease;
        white-space: nowrap;
      }
      .mode-option mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        line-height: 16px;
      }
      .mode-option:not(:disabled):hover {
        color: var(--text-primary);
      }
      .mode-option:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .mode-option.active {
        background: rgba(255, 255, 255, 0.08);
        color: var(--text-primary);
      }
      .mode-option.active.authenticated {
        background: rgba(0, 188, 212, 0.18);
        color: var(--brand-accent, #00bcd4);
      }

      .controls-card {
        padding: 18px 22px;
        background: var(--bg-secondary, #12161e);
      }
      .controls-row {
        display: flex;
        flex-wrap: wrap;
        gap: 14px 22px;
      }
      .controls-row.primary-row {
        align-items: center;
      }
      .controls-spacer {
        flex: 1 1 auto;
        min-width: 12px;
      }
      .control-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-height: 48px;
        justify-content: flex-end;
      }
      .control-label {
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--text-secondary);
        line-height: 1;
      }

      /* Chip sets — consistent 32px height across all */
      .control-group mat-chip-set {
        display: inline-flex;
      }
      .control-group ::ng-deep .mdc-evolution-chip-set__chips {
        gap: 6px;
      }
      .control-group ::ng-deep .mat-mdc-chip {
        height: 32px;
        padding: 0 10px;
      }

      .exchange-chip,
      .refresh-chip,
      .depth-chip,
      .popular-chip {
        cursor: pointer;
        transition: background-color 0.15s ease, color 0.15s ease;
      }

      /* Force the inner MDC chip cells to center their content vertically */
      .exchange-chip ::ng-deep .mdc-evolution-chip__cell--primary,
      .exchange-chip ::ng-deep .mdc-evolution-chip__action--primary,
      .exchange-chip ::ng-deep .mat-mdc-chip-action-label,
      .exchange-chip ::ng-deep .mdc-evolution-chip__text-label {
        display: inline-flex !important;
        align-items: center;
        gap: 8px;
        line-height: 1;
      }
      .exchange-chip ::ng-deep app-exchange-logo {
        display: inline-flex;
        align-items: center;
        line-height: 0;
      }
      .exchange-chip ::ng-deep .exchange-img,
      .exchange-chip ::ng-deep img {
        display: block;
        vertical-align: middle;
      }
      .exchange-chip .chip-label {
        display: inline-flex;
        align-items: center;
        line-height: 1;
        text-transform: capitalize;
      }

      .exchange-chip.selected,
      .refresh-chip.selected,
      .depth-chip.selected,
      .popular-chip.selected {
        background: var(--brand-accent, #00bcd4) !important;
        color: #001319 !important;
        font-weight: 600;
      }

      .symbol-group {
        gap: 0;
        min-width: 220px;
      }
      .symbol-field {
        width: 240px;
      }
      .symbol-field input {
        font-variant-numeric: tabular-nums;
        letter-spacing: 0.02em;
      }
      .symbol-field ::ng-deep .mdc-text-field--outlined {
        --mdc-outlined-text-field-container-shape: 8px;
      }
      .symbol-field ::ng-deep mat-spinner {
        margin-right: 8px;
      }

      /* ── Mis pares / Sugeridos row ───────────────────── */
      .popular-row {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-top: 14px;
        padding-top: 14px;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
        flex-wrap: wrap;
      }
      .popular-label {
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--text-secondary);
        flex-shrink: 0;
      }
      .popular-chip {
        font-variant-numeric: tabular-nums;
        font-size: 12.5px;
      }

      .option-symbol {
        font-variant-numeric: tabular-nums;
      }
      .option-empty {
        color: var(--text-secondary);
        font-style: italic;
      }

      .refresh-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 40px;
        min-width: 128px;
        align-self: center;
      }
      .refresh-btn ::ng-deep .mdc-button__label {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        line-height: 1;
        width: 100%;
      }
      .refresh-btn mat-icon {
        margin: 0;
        width: 18px;
        height: 18px;
        font-size: 18px;
        line-height: 18px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .refresh-btn .btn-spinner {
        display: inline-flex;
      }
      .refresh-btn .btn-spinner ::ng-deep circle {
        stroke: rgba(255, 255, 255, 0.95) !important;
      }

      /* ── Data grid ────────────────────────────────────── */
      .data-grid {
        display: grid;
        grid-template-columns: minmax(360px, 1fr) minmax(360px, 1.4fr);
        gap: 20px;
      }
      @media (max-width: 900px) {
        .data-grid {
          grid-template-columns: 1fr;
        }
      }

      mat-card {
        background: var(--bg-secondary, #12161e);
        color: var(--text-primary);
        padding: 16px 20px;
        border: 1px solid rgba(255, 255, 255, 0.05);
      }

      .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-bottom: 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        margin-bottom: 16px;
      }
      .card-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
        color: var(--text-primary);
      }
      .card-title mat-icon {
        color: var(--brand-accent, #00bcd4);
      }
      .card-updated {
        font-size: 12px;
        color: var(--text-secondary);
      }

      .loading-state,
      .error-state {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 40px 16px;
        color: var(--text-secondary);
      }
      .error-state {
        color: var(--color-error, #ff5454);
      }

      /* ── Ticker card ──────────────────────────────────── */
      .last-price-block {
        text-align: center;
        padding: 8px 0 20px;
      }
      .last-price {
        font-size: 44px;
        font-weight: 700;
        color: var(--text-primary);
        font-variant-numeric: tabular-nums;
        letter-spacing: -0.02em;
      }
      .symbol-label {
        font-size: 13px;
        color: var(--text-secondary);
        margin-top: 2px;
        letter-spacing: 0.05em;
      }
      .change-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        margin-top: 10px;
        padding: 6px 12px;
        border-radius: 999px;
        font-weight: 600;
        font-size: 13px;
      }
      .change-pill.up {
        background: rgba(30, 205, 151, 0.12);
        color: #1ecd97;
      }
      .change-pill.down {
        background: rgba(255, 84, 84, 0.14);
        color: #ff5454;
      }
      .change-pill mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
      .change-abs {
        opacity: 0.7;
        font-weight: 400;
        margin-left: 4px;
      }

      .metrics-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 10px 20px;
        padding-top: 14px;
        border-top: 1px solid rgba(255, 255, 255, 0.05);
      }
      .metric {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .metric-label {
        font-size: 11px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--text-secondary);
      }
      .metric-value {
        font-size: 15px;
        font-weight: 500;
        color: var(--text-primary);
        font-variant-numeric: tabular-nums;
      }
      .metric-value.bid {
        color: #1ecd97;
      }
      .metric-value.ask {
        color: #ff5454;
      }
      .metric-sub {
        font-size: 11px;
        color: var(--text-secondary);
        font-weight: 400;
        margin-left: 4px;
      }

      /* ── Order book ───────────────────────────────────── */
      .book-spread {
        text-align: center;
        padding: 8px;
        margin-bottom: 8px;
        font-size: 13px;
        color: var(--text-secondary);
        background: rgba(255, 255, 255, 0.03);
        border-radius: 6px;
      }
      .book-spread strong {
        color: var(--text-primary);
        margin: 0 4px;
        font-variant-numeric: tabular-nums;
      }
      .book-spread-pct {
        opacity: 0.7;
      }

      .book-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      .book-col-header {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--text-secondary);
        padding: 0 8px 6px;
      }
      .bids-col .book-col-header span:last-child,
      .asks-col .book-col-header span:last-child {
        text-align: right;
      }

      .book-row {
        position: relative;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        padding: 4px 8px;
        font-size: 13px;
        font-variant-numeric: tabular-nums;
        border-radius: 3px;
        overflow: hidden;
      }
      .book-row .price,
      .book-row .amount {
        position: relative;
        z-index: 1;
      }
      .book-row .amount {
        text-align: right;
        color: var(--text-secondary);
      }
      .book-row.bid .price {
        color: #1ecd97;
      }
      .book-row.ask .price {
        color: #ff5454;
      }
      .depth-bar {
        position: absolute;
        top: 0;
        bottom: 0;
        right: 0;
        z-index: 0;
        opacity: 0.18;
        border-radius: 3px;
      }
      .book-row.bid .depth-bar {
        background: #1ecd97;
        left: auto;
      }
      .book-row.ask .depth-bar {
        background: #ff5454;
        left: 0;
        right: auto;
      }

      /* ── Raw JSON ─────────────────────────────────────── */
      .raw-json-card {
        padding: 0;
        overflow: hidden;
      }
      .raw-json-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 14px 20px;
        cursor: pointer;
        user-select: none;
      }
      .raw-json-header:hover {
        background: rgba(255, 255, 255, 0.02);
      }
      .raw-json {
        margin: 0;
        padding: 12px 20px 20px;
        font-family: 'Fira Code', 'Menlo', 'Monaco', monospace;
        font-size: 12px;
        line-height: 1.5;
        color: var(--text-secondary);
        background: rgba(0, 0, 0, 0.2);
        max-height: 400px;
        overflow: auto;
        white-space: pre;
      }
    `,
  ],
})
export class RawPricesComponent implements OnInit, OnDestroy {
  private rawPrices = inject(RawPricesService);
  private credentialsService = inject(CredentialsService);
  private settingsService = inject(SettingsService);

  exchanges = SUPPORTED;
  depthOptions = DEPTH_OPTIONS;
  refreshOptions = REFRESH_OPTIONS;

  selectedExchange = signal<RawExchange>('binance');
  symbol = signal('BTC/USDT');
  asMe = signal(false);
  depth = signal(20);
  refreshMs = signal(0);

  ticker = signal<RawTicker | null>(null);
  orderbook = signal<RawOrderbook | null>(null);
  tickerError = signal<string | null>(null);
  orderbookError = signal<string | null>(null);
  loading = signal(false);
  showRaw = signal(false);

  symbolControl = new FormControl('BTC/USDT', { nonNullable: true });
  availableSymbols = signal<string[]>([]);
  filteredSymbols = signal<string[]>([]);
  loadingSymbols = signal(false);

  configuredByExchange = signal<Record<string, string[]>>({});

  popularPairs = computed<string[]>(() => {
    const ex = this.selectedExchange();
    const configured = this.configuredByExchange()[ex] ?? [];
    if (configured.length > 0) return configured.slice(0, MAX_POPULAR_CHIPS);
    return FALLBACK_PAIRS_BY_EXCHANGE[ex];
  });

  popularLabel = computed(() => {
    const ex = this.selectedExchange();
    const configured = this.configuredByExchange()[ex] ?? [];
    return configured.length > 0 ? 'Mis pares' : 'Sugeridos';
  });

  private nowTick = signal(Date.now());
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private agingTimer: ReturnType<typeof setInterval> | null = null;

  credentials = this.credentialsService.credentials;

  hasCredentialForSelected = computed(() => {
    const ex = this.selectedExchange();
    return this.credentials().some(
      (c) =>
        c.isActive &&
        (c.exchange === (ex as unknown as ExchangeType) ||
          c.exchange.toString() === ex),
    );
  });

  tickerAge = computed(() => {
    const t = this.ticker();
    if (!t?.timestamp) return null;
    const ms = this.nowTick() - new Date(t.timestamp).getTime();
    return Math.max(0, Math.round(ms / 1000));
  });

  tickerSpread = computed(() => {
    const t = this.ticker();
    if (!t || t.ask === null || t.bid === null) return null;
    return t.ask - t.bid;
  });

  tickerSpreadPct = computed(() => {
    const t = this.ticker();
    const spread = this.tickerSpread();
    if (!t || spread === null || !t.last) return 0;
    return (spread / t.last) * 100;
  });

  bookSpread = computed(() => {
    const b = this.orderbook();
    if (!b || !b.bids.length || !b.asks.length) return null;
    return b.asks[0][0] - b.bids[0][0];
  });

  bookSpreadPct = computed(() => {
    const b = this.orderbook();
    const spread = this.bookSpread();
    if (!b || spread === null || !b.bids.length) return 0;
    const mid = (b.asks[0][0] + b.bids[0][0]) / 2;
    return (spread / mid) * 100;
  });

  private maxBookAmount = computed(() => {
    const b = this.orderbook();
    if (!b) return 0;
    let max = 0;
    for (const [, amt] of [...b.bids, ...b.asks]) {
      if (amt > max) max = amt;
    }
    return max;
  });

  bidsView = computed(() => {
    const b = this.orderbook();
    const max = this.maxBookAmount();
    if (!b) return [];
    return b.bids.map(([price, amount]) => ({
      price,
      amount,
      pct: max > 0 ? (amount / max) * 100 : 0,
    }));
  });

  asksView = computed(() => {
    const b = this.orderbook();
    const max = this.maxBookAmount();
    if (!b) return [];
    return b.asks.map(([price, amount]) => ({
      price,
      amount,
      pct: max > 0 ? (amount / max) * 100 : 0,
    }));
  });

  prettyInfo = computed(() => {
    const info = this.ticker()?.info;
    if (info === null || info === undefined) return '(no raw info)';
    try {
      return JSON.stringify(info, null, 2);
    } catch {
      return String(info);
    }
  });

  ngOnInit(): void {
    this.credentialsService.loadCredentials().subscribe({ error: () => {} });
    this.settingsService.loadAllSymbols().subscribe({
      next: (res) => this.configuredByExchange.set(res.symbolsByExchange || {}),
      error: () => {},
    });
    this.loadAvailableSymbols(this.selectedExchange());
    this.symbolControl.valueChanges
      .pipe(debounceTime(120), distinctUntilChanged())
      .subscribe((value) => this.filterSymbols(value));
    this.refresh();
    this.agingTimer = setInterval(() => this.nowTick.set(Date.now()), 1000);
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if (this.agingTimer) clearInterval(this.agingTimer);
  }

  selectExchange(ex: RawExchange): void {
    if (this.selectedExchange() === ex) return;
    this.selectedExchange.set(ex);
    if (!this.hasCredentialForSelected()) this.asMe.set(false);
    this.loadAvailableSymbols(ex);
    // If the current symbol isn't available on the new exchange, reset to the default
    const defaultSym = DEFAULT_SYMBOL_BY_EXCHANGE[ex];
    const current = this.symbol();
    if (!this.availableSymbols().includes(current)) {
      this.setSymbol(defaultSym);
    }
    this.refresh();
  }

  private loadAvailableSymbols(ex: RawExchange): void {
    this.loadingSymbols.set(true);
    this.credentialsService
      .getAvailableSymbols(ex as unknown as ExchangeType)
      .subscribe({
        next: (res) => {
          const syms = res.symbols.map((s) => s.symbol).sort();
          this.availableSymbols.set(syms);
          this.filterSymbols(this.symbolControl.value);
          this.loadingSymbols.set(false);
        },
        error: () => {
          this.availableSymbols.set([]);
          this.filteredSymbols.set([]);
          this.loadingSymbols.set(false);
        },
      });
  }

  private filterSymbols(query: string | null | undefined): void {
    const q = (query || '').toUpperCase().trim();
    const all = this.availableSymbols();
    if (!q) {
      this.filteredSymbols.set(all.slice(0, 50));
      return;
    }
    const starts: string[] = [];
    const contains: string[] = [];
    for (const s of all) {
      if (s.startsWith(q)) starts.push(s);
      else if (s.includes(q)) contains.push(s);
      if (starts.length >= 50) break;
    }
    this.filteredSymbols.set([...starts, ...contains].slice(0, 50));
  }

  onSymbolPicked(value: string): void {
    this.setSymbol(value);
    this.refresh();
  }

  onSymbolEnter(): void {
    const v = (this.symbolControl.value || '').trim().toUpperCase();
    if (v) this.setSymbol(v);
    this.refresh();
  }

  clearSymbol(): void {
    this.symbolControl.setValue('', { emitEvent: true });
  }

  quickPick(pair: string): void {
    this.setSymbol(pair);
    this.refresh();
  }

  private setSymbol(value: string): void {
    const normalized = value.trim().toUpperCase();
    this.symbol.set(normalized);
    if (this.symbolControl.value !== normalized) {
      this.symbolControl.setValue(normalized, { emitEvent: false });
    }
  }

  setAsMe(checked: boolean): void {
    this.asMe.set(checked);
    this.refresh();
  }

  setDepth(d: number): void {
    this.depth.set(d);
    this.fetchOrderbook();
  }

  setRefresh(ms: number): void {
    this.refreshMs.set(ms);
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (ms > 0) {
      this.refreshTimer = setInterval(() => this.refresh(), ms);
    }
  }

  toggleRaw(): void {
    this.showRaw.update((v) => !v);
  }

  refresh(): void {
    this.fetchTicker();
    this.fetchOrderbook();
  }

  private fetchTicker(): void {
    const ex = this.selectedExchange();
    const sym = this.symbol();
    if (!sym) {
      this.tickerError.set('Ingresá un símbolo');
      return;
    }
    this.loading.set(true);
    this.tickerError.set(null);
    this.rawPrices.getTicker(ex, sym, this.asMe()).subscribe({
      next: (t) => {
        this.ticker.set(t);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.ticker.set(null);
        this.tickerError.set(this.extractError(err));
        this.loading.set(false);
      },
    });
  }

  private fetchOrderbook(): void {
    const ex = this.selectedExchange();
    const sym = this.symbol();
    if (!sym) return;
    this.orderbookError.set(null);
    this.rawPrices.getOrderbook(ex, sym, this.depth(), this.asMe()).subscribe({
      next: (b) => this.orderbook.set(b),
      error: (err: HttpErrorResponse) => {
        this.orderbook.set(null);
        this.orderbookError.set(this.extractError(err));
      },
    });
  }

  private extractError(err: HttpErrorResponse): string {
    const msg = err?.error?.message;
    if (typeof msg === 'string') return msg;
    if (Array.isArray(msg)) return msg.join('; ');
    return err?.message || 'Error desconocido';
  }
}
