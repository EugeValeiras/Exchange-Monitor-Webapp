import { Component, OnInit, OnDestroy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatRippleModule } from '@angular/material/core';
import { SettingsService } from '../../../core/services/settings.service';
import { PriceSocketService } from '../../../core/services/price-socket.service';

interface SymbolOption {
  symbol: string;
  base: string;
  quote: string;
  price?: number;
  change24h?: number;
}

@Component({
  selector: 'app-symbol-selector-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    MatRippleModule,
  ],
  template: `
    <div class="dialog-container">
      <div class="dialog-header">
        <h2>Seleccionar Simbolo</h2>
        <button mat-icon-button (click)="close()">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <div class="search-container">
        <mat-form-field appearance="outline" class="search-field">
          <mat-icon matPrefix>search</mat-icon>
          <input
            matInput
            [(ngModel)]="searchQuery"
            placeholder="Buscar simbolo..."
            (input)="onSearch()"
            autocomplete="off"
            #searchInput>
          @if (searchQuery) {
            <button mat-icon-button matSuffix (click)="clearSearch()">
              <mat-icon>close</mat-icon>
            </button>
          }
        </mat-form-field>
      </div>

      <div class="symbols-list">
        @if (filteredSymbols().length === 0) {
          <div class="empty-state">
            <mat-icon>search_off</mat-icon>
            <p>No se encontraron simbolos</p>
          </div>
        } @else {
          @for (option of filteredSymbols(); track option.symbol) {
            <div
              class="symbol-item"
              matRipple
              (click)="selectSymbol(option.symbol)"
              [class.has-price]="option.price">
              <div class="symbol-info">
                <img
                  [src]="getAssetLogo(option.base)"
                  [alt]="option.base"
                  class="symbol-logo"
                  (error)="onLogoError($event, option.base)">
                <div class="symbol-details">
                  <span class="symbol-name">{{ option.symbol }}</span>
                  <span class="symbol-base">{{ option.base }}</span>
                </div>
              </div>
              <div class="price-info">
                @if (option.price) {
                  <span class="price">{{ formatPrice(option.price) }}</span>
                  @if (option.change24h !== undefined) {
                    <span class="change" [class.positive]="option.change24h >= 0" [class.negative]="option.change24h < 0">
                      {{ option.change24h >= 0 ? '+' : '' }}{{ option.change24h | number:'1.2-2' }}%
                    </span>
                  }
                } @else {
                  <span class="no-price">--</span>
                }
              </div>
            </div>
          }
        }
      </div>
    </div>
  `,
  styles: [`
    .dialog-container {
      width: 420px;
      max-width: 100vw;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      background: var(--bg-card);
    }

    .dialog-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 24px 16px;
      border-bottom: 1px solid var(--border-color);

      h2 {
        margin: 0;
        font-size: 20px;
        font-weight: 600;
        color: var(--text-primary);
      }
    }

    .search-container {
      padding: 16px 24px 8px;
    }

    .search-field {
      width: 100%;

      ::ng-deep .mat-mdc-form-field-subscript-wrapper {
        display: none;
      }

      ::ng-deep .mat-mdc-text-field-wrapper {
        background: var(--bg-elevated);
      }

      mat-icon[matPrefix] {
        color: var(--text-tertiary);
        margin-right: 8px;
      }
    }

    .symbols-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px 12px 16px;
      max-height: 400px;
    }

    .symbol-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 16px;
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.15s ease;
      margin-bottom: 4px;

      &:hover {
        background: var(--bg-elevated);
      }

      &:active {
        transform: scale(0.99);
      }
    }

    .symbol-info {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .symbol-logo {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--bg-tertiary);
      object-fit: cover;
    }

    .symbol-fallback {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--bg-tertiary);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 600;
      color: var(--text-secondary);
    }

    .symbol-details {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .symbol-name {
      font-size: 15px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .symbol-base {
      font-size: 13px;
      color: var(--text-tertiary);
    }

    .price-info {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 2px;
    }

    .price {
      font-size: 15px;
      font-weight: 600;
      color: var(--text-primary);
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
    }

    .change {
      font-size: 13px;
      font-weight: 500;

      &.positive {
        color: var(--color-success);
      }

      &.negative {
        color: var(--color-error);
      }
    }

    .no-price {
      font-size: 14px;
      color: var(--text-tertiary);
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px 24px;
      color: var(--text-secondary);

      mat-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
        margin-bottom: 16px;
        opacity: 0.5;
      }

      p {
        margin: 0;
        font-size: 14px;
      }
    }

    /* Scrollbar styling */
    .symbols-list::-webkit-scrollbar {
      width: 6px;
    }

    .symbols-list::-webkit-scrollbar-track {
      background: transparent;
    }

    .symbols-list::-webkit-scrollbar-thumb {
      background: var(--bg-tertiary);
      border-radius: 3px;
    }

    .symbols-list::-webkit-scrollbar-thumb:hover {
      background: var(--text-tertiary);
    }
  `],
})
export class SymbolSelectorDialogComponent implements OnInit, OnDestroy {
  private dialogRef = inject(MatDialogRef<SymbolSelectorDialogComponent>);
  private settingsService = inject(SettingsService);
  private priceSocketService = inject(PriceSocketService);

  searchQuery = '';
  private allSymbols = signal<SymbolOption[]>([]);
  private logoErrors = new Set<string>();
  private updateInterval: ReturnType<typeof setInterval> | null = null;

  filteredSymbols = computed(() => {
    const query = this.searchQuery.toLowerCase().trim();
    const symbols = this.allSymbols();

    if (!query) {
      return symbols;
    }

    return symbols.filter(s =>
      s.symbol.toLowerCase().includes(query) ||
      s.base.toLowerCase().includes(query)
    );
  });

  ngOnInit(): void {
    this.loadSymbols();
    this.priceSocketService.connect();
  }

  ngOnDestroy(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
  }

  private loadSymbols(): void {
    this.settingsService.loadAllSymbols().subscribe(() => {
      this.updateSymbolsList();
    });

    // Update prices periodically
    this.updateSymbolsList();
    this.updateInterval = setInterval(() => this.updateSymbolsList(), 1000);
  }

  private updateSymbolsList(): void {
    const binance = this.settingsService.binanceSymbols();
    const kraken = this.settingsService.krakenSymbols();
    const combined = new Set([...binance, ...kraken]);
    const prices = this.priceSocketService.prices();

    const options: SymbolOption[] = Array.from(combined).map(symbol => {
      const [base, quote] = symbol.split('/');
      const priceData = prices.get(symbol);

      return {
        symbol,
        base,
        quote,
        price: priceData?.price,
        change24h: priceData?.change24h,
      };
    });

    // Sort: symbols with prices first, then alphabetically
    options.sort((a, b) => {
      if (a.price && !b.price) return -1;
      if (!a.price && b.price) return 1;
      return a.symbol.localeCompare(b.symbol);
    });

    this.allSymbols.set(options);
  }

  onSearch(): void {
    // Filtering is handled by the computed signal
  }

  clearSearch(): void {
    this.searchQuery = '';
  }

  selectSymbol(symbol: string): void {
    this.dialogRef.close(symbol);
  }

  close(): void {
    this.dialogRef.close();
  }

  formatPrice(price: number): string {
    if (price >= 1000) {
      return '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } else if (price >= 1) {
      return '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    } else {
      return '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 });
    }
  }

  getAssetLogo(asset: string): string {
    if (!asset) return '';
    return `/${asset.toLowerCase()}.svg`;
  }

  onLogoError(event: Event, asset: string): void {
    if (this.logoErrors.has(asset)) return;
    this.logoErrors.add(asset);

    const img = event.target as HTMLImageElement;
    const parent = img.parentElement;

    if (parent) {
      const fallback = document.createElement('div');
      fallback.className = 'symbol-fallback';
      fallback.textContent = asset.substring(0, 2).toUpperCase();
      parent.replaceChild(fallback, img);
    }
  }
}
