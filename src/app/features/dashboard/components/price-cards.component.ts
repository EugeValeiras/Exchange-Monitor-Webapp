import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { PriceSocketService } from '../../../core/services/price-socket.service';
import { SettingsService } from '../../../core/services/settings.service';
import { ConsolidatedBalanceService } from '../../../core/services/consolidated-balance.service';

@Component({
  selector: 'app-price-cards',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, MatTooltipModule],
  template: `
    <div class="price-cards-container">
      <div class="section-header">
        @if (loading()) {
          <span class="skeleton-text skeleton-pulse" style="width: 180px; height: 20px;"></span>
        } @else {
          <h3>Precios en Tiempo Real</h3>
        }
        <a routerLink="/prices" class="view-all" [class.hidden]="loading()">
          Ver todos
          <mat-icon>arrow_forward</mat-icon>
        </a>
      </div>
      <div class="price-cards">
        @if (loading()) {
          @for (i of [1, 2, 3, 4, 5, 6]; track i) {
            <div class="price-card skeleton-card">
              <div class="card-header">
                <div class="skeleton-logo skeleton-pulse"></div>
                <div class="crypto-info">
                  <span class="skeleton-text skeleton-pulse" style="width: 50px; height: 16px;"></span>
                </div>
              </div>
              <div class="card-price">
                <span class="skeleton-text skeleton-pulse" style="width: 100px; height: 24px;"></span>
                <span class="skeleton-text skeleton-pulse" style="width: 70px; height: 16px; margin-top: 4px;"></span>
              </div>
            </div>
          }
        } @else {
          @for (asset of configuredAssets(); track asset) {
            <div class="price-card" [routerLink]="'/prices'">
              <div class="card-header">
                <img [src]="'/' + asset.toLowerCase() + '.svg'" [alt]="asset" class="crypto-logo" (error)="onLogoError($event, asset)">
                <div class="crypto-info">
                  <span class="crypto-symbol">{{ asset }}</span>
                </div>
              </div>
              <div class="card-price">
                @if (getPrice(asset); as price) {
                  <span class="price-value">{{ price | currency:'USD':'symbol':'1.2-4' }}</span>
                  @if (getChange24h(asset); as change) {
                    <span class="price-change" [class.positive]="change >= 0" [class.negative]="change < 0">
                      <mat-icon>{{ change >= 0 ? 'trending_up' : 'trending_down' }}</mat-icon>
                      {{ change >= 0 ? '+' : '' }}{{ change | number:'1.2-2' }}%
                    </span>
                  }
                } @else {
                  <span class="price-loading">
                    <span class="skeleton-pulse"></span>
                  </span>
                }
              </div>
            </div>
          }
        }
      </div>
    </div>
  `,
  styles: [`
    .price-cards-container {
      margin-bottom: 24px;
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .section-header h3 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .view-all {
      display: flex;
      align-items: center;
      gap: 4px;
      color: var(--text-secondary);
      text-decoration: none;
      font-size: 14px;
      transition: color 0.2s ease;

      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }

      &:hover {
        color: var(--brand-primary);
      }
    }

    .price-cards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 16px;
    }

    .price-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 16px;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        border-color: var(--brand-primary);
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      }
    }

    .card-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }

    .crypto-logo {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      object-fit: contain;
    }

    .crypto-fallback {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: var(--brand-primary);
      color: #1e2026;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 14px;
    }

    .crypto-info {
      display: flex;
      flex-direction: column;
    }

    .crypto-symbol {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary);
    }


    .card-price {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .price-value {
      font-size: 20px;
      font-weight: 700;
      color: var(--text-primary);
      font-family: 'SF Mono', monospace;
    }

    .price-change {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 13px;
      font-weight: 500;

      mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }

      &.positive {
        color: var(--color-success);
      }

      &.negative {
        color: var(--color-error);
      }
    }

    .price-loading {
      .skeleton-pulse {
        display: block;
        width: 100px;
        height: 24px;
        border-radius: 4px;
        background: linear-gradient(90deg, var(--bg-tertiary) 0%, var(--bg-elevated) 50%, var(--bg-tertiary) 100%);
        background-size: 200% 100%;
        animation: skeleton-shimmer 1.5s infinite;
      }
    }

    @keyframes skeleton-shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    .hidden {
      visibility: hidden;
    }

    .skeleton-card {
      pointer-events: none;
    }

    .skeleton-logo {
      width: 36px;
      height: 36px;
      border-radius: 50%;
    }

    .skeleton-text {
      display: block;
      border-radius: 4px;
    }

    .skeleton-pulse {
      background: linear-gradient(90deg, var(--bg-tertiary) 0%, var(--bg-elevated) 50%, var(--bg-tertiary) 100%);
      background-size: 200% 100%;
      animation: skeleton-shimmer 1.5s infinite;
    }

    @keyframes skeleton-shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    @media (max-width: 600px) {
      .price-cards {
        grid-template-columns: repeat(2, 1fr);
      }
    }
  `]
})
export class PriceCardsComponent implements OnInit {
  // Configured assets from settings (unique, excluding stablecoins)
  configuredAssets = signal<string[]>([]);
  private internalLoading = signal(true);

  private balanceService = inject(ConsolidatedBalanceService);

  // Combined loading state: show skeleton while either internal or dashboard is loading
  loading = computed(() => this.internalLoading() || this.balanceService.loading());

  constructor(
    private settingsService: SettingsService,
    private priceService: PriceSocketService
  ) {}

  ngOnInit(): void {
    this.loadConfiguredSymbols();
  }

  private loadConfiguredSymbols(): void {
    this.settingsService.loadAllSymbols().subscribe({
      next: (response) => {
        const allSymbols: string[] = [];
        Object.values(response.symbolsByExchange || {}).forEach(symbols => {
          allSymbols.push(...symbols);
        });

        // Extract unique assets and filter out stablecoins
        const stablecoins = ['USDT', 'USDC', 'BUSD', 'DAI', 'TUSD', 'USD', 'ARS'];
        const uniqueAssets = [...new Set(allSymbols.map(s => s.split('/')[0]))]
          .filter(asset => !stablecoins.includes(asset.toUpperCase()))
          .sort();

        this.configuredAssets.set(uniqueAssets);
        this.priceService.subscribe(allSymbols);
        this.internalLoading.set(false);
      },
      error: () => {
        this.internalLoading.set(false);
      }
    });
  }

  getPrice(asset: string): number | undefined {
    return this.priceService.getPriceByAsset(asset);
  }

  getChange24h(asset: string): number | undefined {
    const result = this.priceService.getMultiExchangePrice(asset);
    return result?.change24h;
  }

  onLogoError(event: Event, symbol: string): void {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
    const parent = img.parentElement;
    if (parent && !parent.querySelector('.crypto-fallback')) {
      const fallback = document.createElement('div');
      fallback.className = 'crypto-fallback';
      fallback.textContent = symbol.substring(0, 2);
      parent.insertBefore(fallback, img);
    }
  }
}
