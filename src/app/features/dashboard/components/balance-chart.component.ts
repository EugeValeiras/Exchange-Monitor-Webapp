import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule, MatChipListboxChange } from '@angular/material/chips';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData, ChartOptions, ChartDataset } from 'chart.js';
import { ConsolidatedBalanceService } from '../../../core/services/consolidated-balance.service';
import {
  Chart,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

// Register Chart.js components
Chart.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  Title,
  Tooltip,
  Legend,
  Filler,
);
import {
  ChartService,
  ChartTimeframe,
  ChartDataResponse,
  ChartDataByAssetResponse,
} from '../../../core/services/chart.service';

// Color palette for multi-asset chart
const ASSET_COLORS = [
  '#00bcd4', // cyan
  '#f0b90b', // yellow (binance)
  '#0ecb81', // green
  '#f6465d', // red
  '#9c27b0', // purple
  '#ff9800', // orange
  '#2196f3', // blue
  '#e91e63', // pink
  '#4caf50', // light green
  '#ff5722', // deep orange
];

@Component({
  selector: 'app-balance-chart',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonToggleModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatChipsModule,
    BaseChartDirective,
  ],
  template: `
    <mat-card class="chart-card">
      <mat-card-header>
        @if (isInitialLoading()) {
          <mat-card-title>
            <span class="skeleton-text skeleton-pulse" style="width: 140px; height: 20px;"></span>
          </mat-card-title>
          <div class="header-actions">
            <div class="timeframe-toggle-skeleton">
              @for (i of [1, 2, 3, 4]; track i) {
                <span class="skeleton-toggle skeleton-pulse"></span>
              }
            </div>
          </div>
        } @else {
          @if (!supportsMultiAsset()) {
            <mat-card-title>Balance History</mat-card-title>
          }
          <div class="header-actions">
            <mat-button-toggle-group
              [value]="selectedTimeframe()"
              (change)="onTimeframeChange($event.value)"
              class="timeframe-toggle">
              <mat-button-toggle value="24h">24H</mat-button-toggle>
              <mat-button-toggle value="7d">7D</mat-button-toggle>
              <mat-button-toggle value="1m">1M</mat-button-toggle>
              <mat-button-toggle value="1y">1Y</mat-button-toggle>
            </mat-button-toggle-group>
          </div>
        }
      </mat-card-header>

      @if (isInitialLoading()) {
        <div class="asset-filter-section">
          <div class="asset-chips-container">
            <div class="asset-chips-skeleton">
              @for (i of [1, 2, 3, 4, 5, 6]; track i) {
                <span class="skeleton-chip skeleton-pulse"></span>
              }
            </div>
          </div>
        </div>
      } @else if (supportsMultiAsset()) {
        <div class="asset-filter-section">
          <span class="filter-label">Balance History</span>
          <div class="asset-chips-wrapper">
            <mat-chip-listbox multiple (change)="onAssetFilterChange($event)" class="asset-chips">
              @for (asset of visibleAssets(); track asset) {
                <mat-chip-option
                  [value]="asset"
                  [selected]="selectedAssets().has(asset)"
                  class="asset-chip"
                  [style.--chip-color]="getAssetColor(asset)">
                  <span class="asset-chip-logo-wrapper">
                    <img [src]="getAssetLogo(asset)" [alt]="asset" class="asset-chip-logo" (error)="onAssetLogoError($event, asset)">
                  </span>
                  {{ asset }}
                  <span class="asset-value">{{ getAssetValue(asset) }}</span>
                </mat-chip-option>
              }
            </mat-chip-listbox>
            @if (hiddenAssetsCount() > 0) {
              <button class="show-more-btn" (click)="toggleSmallAssets()">
                @if (showSmallAssets()) {
                  <mat-icon>expand_less</mat-icon>
                  Menos
                } @else {
                  +{{ hiddenAssetsCount() }}
                }
              </button>
            }
          </div>
        </div>
      }

      <mat-card-content>
        @if (loading()) {
          <div class="chart-skeleton">
            <div class="chart-skeleton-area skeleton-pulse"></div>
          </div>
        } @else if (hasData()) {
          <div class="chart-container">
            <canvas
              baseChart
              [data]="chartData()"
              [options]="chartOptions()"
              [type]="'line'">
            </canvas>
          </div>
        } @else {
          <div class="empty-container">
            <mat-icon>show_chart</mat-icon>
            <p>No hay datos de balance para este período</p>
            <p class="hint">Los datos se generan cada hora automáticamente</p>
          </div>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: [
    `
    .chart-card {
      margin-bottom: 24px;
    }

    mat-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;

      ::ng-deep .mat-mdc-card-header-text {
        flex: 1;
      }
    }

    mat-card-title {
      font-size: 18px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .header-actions {
      margin-left: auto;
    }

    .timeframe-toggle-skeleton {
      display: flex;
      gap: 4px;
      background: var(--bg-elevated);
      border-radius: 10px;
      border: 1px solid var(--border-color);
      padding: 3px;
    }

    .skeleton-toggle {
      width: 42px;
      height: 32px;
      border-radius: 7px;
    }

    .asset-chips-skeleton {
      display: flex;
      gap: 6px;
    }

    .skeleton-chip {
      width: 70px;
      height: 32px;
      border-radius: 16px;
    }

    .timeframe-toggle {
      background: var(--bg-elevated);
      border-radius: 10px;
      border: 1px solid var(--border-color);
      padding: 3px;

      ::ng-deep .mat-button-toggle-group {
        border: none;
      }

      ::ng-deep .mat-button-toggle {
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.02em;
        border: none !important;
        background: transparent;
        border-radius: 7px;
        transition: all 0.2s ease;
      }

      ::ng-deep .mat-button-toggle-appearance-standard {
        background: transparent;
        color: var(--text-tertiary);
      }

      ::ng-deep .mat-button-toggle + .mat-button-toggle {
        border-left: none !important;
      }

      ::ng-deep .mat-button-toggle:hover:not(.mat-button-toggle-checked) {
        background: var(--bg-tertiary);
        color: var(--text-primary);
      }

      ::ng-deep .mat-button-toggle-checked {
        background: var(--brand-accent) !important;
        color: var(--bg-primary) !important;
        border-radius: 7px;
        box-shadow: 0 2px 8px rgba(0, 188, 212, 0.3);
      }

      ::ng-deep .mat-button-toggle-checked .mat-button-toggle-label-content {
        color: var(--bg-primary) !important;
      }

      ::ng-deep .mat-button-toggle-focus-overlay {
        display: none !important;
      }

      ::ng-deep .mat-pseudo-checkbox {
        display: none !important;
        width: 0 !important;
        margin: 0 !important;
      }

      ::ng-deep .mat-button-toggle-checked .mat-pseudo-checkbox {
        display: none !important;
        width: 0 !important;
        margin: 0 !important;
      }

      ::ng-deep .mat-button-toggle-label-content {
        margin-left: 0 !important;
        padding-left: 0 !important;
      }

      ::ng-deep .mat-button-toggle-button {
        padding: 0 14px;
        height: 32px;
      }

      ::ng-deep .mat-button-toggle-label-content {
        line-height: 32px;
      }
    }

    .asset-filter-section {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 0 16px 12px 16px;
    }

    .filter-label {
      font-size: 18px;
      font-weight: 600;
      color: var(--text-primary);
      white-space: nowrap;
      flex-shrink: 0;
    }

    .asset-chips-container {
      overflow-x: auto;
      flex: 1;

      &::-webkit-scrollbar {
        height: 4px;
      }

      &::-webkit-scrollbar-track {
        background: transparent;
      }

      &::-webkit-scrollbar-thumb {
        background: var(--bg-tertiary);
        border-radius: 2px;
      }
    }

    .asset-chips-wrapper {
      display: flex;
      align-items: center;
      flex: 1;
      overflow-x: auto;

      &::-webkit-scrollbar {
        height: 4px;
      }

      &::-webkit-scrollbar-track {
        background: transparent;
      }

      &::-webkit-scrollbar-thumb {
        background: var(--bg-tertiary);
        border-radius: 2px;
      }
    }

    .asset-chips {
      display: flex;
      flex-wrap: nowrap;
      gap: 6px;
      align-items: center;

      ::ng-deep .mdc-evolution-chip-set__chips {
        display: flex;
        align-items: center;
        flex-wrap: nowrap;
      }
    }

    .asset-chip {
      flex-shrink: 0;

      ::ng-deep .mdc-evolution-chip__cell--primary,
      ::ng-deep .mdc-evolution-chip__action--primary {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      ::ng-deep .mat-mdc-chip-action-label {
        display: flex;
        align-items: center;
        gap: 6px;
      }
    }

    .asset-chip-logo-wrapper {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      flex-shrink: 0;
      vertical-align: middle;
      margin-left: 4px;
    }

    .asset-chip-logo {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      object-fit: contain;
    }

    .asset-fallback {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--brand-primary);
      color: #1e2026;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 9px;
    }

    .asset-value {
      font-size: 11px;
      color: var(--brand-accent);
      font-weight: 600;
      margin-left: 4px;
      opacity: 0.9;
    }

    .show-more-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      height: 32px;
      padding: 0 12px;
      margin-left: 8px;
      border: 1px solid var(--border-color);
      border-radius: 16px;
      background: var(--bg-tertiary);
      color: var(--text-secondary);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      flex-shrink: 0;
      vertical-align: middle;

      &:hover {
        background: var(--bg-elevated);
        color: var(--text-primary);
        border-color: var(--brand-accent);
      }

      mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
    }

    ::ng-deep .mat-mdc-chip.mat-mdc-chip-selected {
      border: 1px solid var(--chip-color, var(--brand-accent)) !important;
      box-shadow: 0 0 8px color-mix(in srgb, var(--chip-color, var(--brand-accent)) 50%, transparent);

      .mdc-evolution-chip__graphic {
        width: 0 !important;
        padding: 0 !important;
        display: none !important;
      }
    }

    ::ng-deep .mat-mdc-chip {
      border: 1px solid transparent;

      .mdc-evolution-chip__graphic {
        width: 0 !important;
        padding: 0 !important;
        display: none !important;
      }
    }

    .chart-container {
      height: 300px;
      position: relative;
    }

    .chart-skeleton {
      height: 300px;
      position: relative;
    }

    .chart-skeleton-area {
      width: 100%;
      height: 100%;
      border-radius: 8px;
    }

    .skeleton-summary {
      background: var(--bg-elevated);
    }

    /* Skeleton Styles */
    .skeleton-pulse {
      background: linear-gradient(
        90deg,
        var(--bg-tertiary) 0%,
        var(--bg-elevated) 50%,
        var(--bg-tertiary) 100%
      );
      background-size: 200% 100%;
      animation: skeleton-shimmer 1.5s infinite;
    }

    @keyframes skeleton-shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    .skeleton-text {
      display: block;
      border-radius: 4px;
    }

    .chart-summary {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 16px;
      padding: 12px 16px;
      border-radius: 8px;
      background: var(--bg-elevated);

      &.positive {
        .change-value, .change-percent {
          color: var(--color-success);
        }
      }

      &.negative {
        .change-value, .change-percent {
          color: var(--color-error);
        }
      }
    }

    .change-value {
      font-size: 18px;
      font-weight: 700;
      font-family: 'SF Mono', monospace;
    }

    .change-percent {
      font-size: 14px;
      font-weight: 500;
    }

    .timeframe-label {
      margin-left: auto;
      font-size: 13px;
      color: var(--text-secondary);
    }

    .empty-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 300px;
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
      }

      .hint {
        font-size: 13px;
        margin-top: 8px;
        opacity: 0.7;
      }
    }
  `,
  ],
})
export class BalanceChartComponent implements OnInit {
  private balanceService = inject(ConsolidatedBalanceService);

  selectedTimeframe = signal<ChartTimeframe>('24h');
  private internalLoading = signal(true);
  changeUsd = signal(0);
  changePercent = signal(0);

  // Combined loading state for chart area
  loading = computed(() => this.internalLoading());

  // Initial loading state: show skeletons for header/filters while dashboard is loading
  isInitialLoading = computed(() => this.balanceService.loading());

  // Multi-asset state
  selectedAssets = signal<Set<string>>(new Set());
  availableAssets = signal<string[]>([]);
  assetValues = signal<Map<string, number>>(new Map());
  showSmallAssets = signal(false);
  readonly minAssetValue = 5;

  // Visible assets (filtered by min value unless showSmallAssets is true)
  visibleAssets = computed(() => {
    const all = this.availableAssets();
    const values = this.assetValues();
    if (this.showSmallAssets()) {
      return all;
    }
    return all.filter(asset => (values.get(asset) || 0) >= this.minAssetValue);
  });

  // Count of hidden small assets
  hiddenAssetsCount = computed(() => {
    const all = this.availableAssets();
    const values = this.assetValues();
    return all.filter(asset => (values.get(asset) || 0) < this.minAssetValue).length;
  });

  private rawData = signal<ChartDataResponse | null>(null);
  private rawDataByAsset = signal<ChartDataByAssetResponse | null>(null);
  private originalLabels = signal<string[]>([]);

  // Only 24h and 7d support multi-asset view
  supportsMultiAsset = computed(() => {
    const tf = this.selectedTimeframe();
    return tf === '24h' || tf === '7d';
  });

  hasData = computed(() => {
    const selected = this.selectedAssets();
    if (selected.size > 0 && this.supportsMultiAsset()) {
      const data = this.rawDataByAsset();
      return data && data.labels.length > 0;
    }
    const data = this.rawData();
    return data && data.labels.length > 0;
  });

  chartData = computed<ChartData<'line'>>(() => {
    const selected = this.selectedAssets();

    // If assets selected and timeframe supports it, show multi-line
    if (selected.size > 0 && this.supportsMultiAsset()) {
      return this.buildMultiAssetChartData();
    }

    // Otherwise show total portfolio line
    return this.buildSingleLineChartData();
  });

  chartOptions = computed<ChartOptions<'line'>>(() => {
    const hasMultipleAssets = this.selectedAssets().size > 0 && this.supportsMultiAsset();

    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: 'index',
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleColor: '#fff',
          bodyColor: '#fff',
          padding: 12,
          displayColors: hasMultipleAssets,
          callbacks: {
            title: (tooltipItems) => {
              if (tooltipItems.length === 0) return '';
              const index = tooltipItems[0].dataIndex;
              const labels = this.originalLabels();
              if (index < labels.length) {
                const date = new Date(labels[index]);
                return date.toLocaleString('es-AR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });
              }
              return '';
            },
            label: (context) => {
              const value = context.parsed.y ?? 0;
              const label = context.dataset.label || '';
              const formatted = `$${value.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`;
              return hasMultipleAssets ? `${label}: ${formatted}` : formatted;
            },
          },
        },
      },
      scales: {
        x: {
          display: true,
          grid: {
            display: false,
          },
          ticks: {
            maxTicksLimit: 6,
            color: 'rgba(255, 255, 255, 0.5)',
          },
        },
        y: {
          display: true,
          grid: {
            color: 'rgba(255, 255, 255, 0.1)',
          },
          ticks: {
            color: 'rgba(255, 255, 255, 0.5)',
            callback: (value) => `$${Number(value).toLocaleString()}`,
          },
        },
      },
    };
  });

  constructor(private chartService: ChartService) {}

  ngOnInit(): void {
    this.loadChartData();
  }

  onTimeframeChange(timeframe: ChartTimeframe): void {
    const previousTimeframe = this.selectedTimeframe();
    this.selectedTimeframe.set(timeframe);

    // Clear selection when switching to unsupported timeframe
    if (timeframe !== '24h' && timeframe !== '7d') {
      this.selectedAssets.set(new Set());
      this.availableAssets.set([]);
    } else if (previousTimeframe !== '24h' && previousTimeframe !== '7d') {
      // Switching from unsupported to supported timeframe - clear selection to load all assets
      this.selectedAssets.set(new Set());
    }

    this.loadChartData();
  }

  onAssetFilterChange(event: MatChipListboxChange): void {
    const newSelection = new Set<string>(event.value || []);
    this.selectedAssets.set(newSelection);
    this.loadChartData();
  }

  getAssetLogo(asset: string): string {
    if (!asset) return '';
    let normalized = asset.toLowerCase();
    // Handle Binance locked staking assets (e.g., LDBTC -> btc)
    if (normalized.startsWith('ld') && normalized.length > 2) {
      normalized = normalized.substring(2);
    }
    return `/${normalized}.svg`;
  }

  onAssetLogoError(event: Event, asset: string): void {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
    const parent = img.parentElement;
    if (parent && !parent.querySelector('.asset-fallback')) {
      const fallback = document.createElement('div');
      fallback.className = 'asset-fallback';
      fallback.textContent = asset.substring(0, 2).toUpperCase();
      parent.insertBefore(fallback, img);
    }
  }

  getTimeframeLabel(): string {
    const labels: Record<ChartTimeframe, string> = {
      '24h': 'Últimas 24 horas',
      '7d': 'Últimos 7 días',
      '1m': 'Último mes',
      '1y': 'Último año',
    };
    return labels[this.selectedTimeframe()];
  }

  getAssetValue(asset: string): string {
    const value = this.assetValues().get(asset) || 0;
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}k`;
    }
    return `$${value.toFixed(0)}`;
  }

  toggleSmallAssets(): void {
    this.showSmallAssets.set(!this.showSmallAssets());
  }

  private loadChartData(): void {
    this.internalLoading.set(true);
    const timeframe = this.selectedTimeframe();
    const selected = this.selectedAssets();

    // For 24h/7d, always load by-asset data to get available assets
    if (timeframe === '24h' || timeframe === '7d') {
      const assetsArray = selected.size > 0 ? Array.from(selected) : undefined;
      this.chartService.getChartDataByAsset(timeframe, assetsArray).subscribe({
        next: (data) => {
          this.rawDataByAsset.set(data);
          this.originalLabels.set(data.labels);

          // Only update available assets when no filter is applied
          // This keeps the full list of assets for the filter UI
          if (selected.size === 0 && data.availableAssets && data.assetData) {
            // Sort assets by their current value (last data point) descending
            const valuesMap = new Map<string, number>();
            data.assetData.forEach(ad => {
              const lastValue = ad.data.length > 0 ? ad.data[ad.data.length - 1] : 0;
              valuesMap.set(ad.asset, lastValue);
            });
            const sortedAssets = [...data.availableAssets].sort((a, b) => {
              return (valuesMap.get(b) || 0) - (valuesMap.get(a) || 0);
            });
            this.availableAssets.set(sortedAssets);
            this.assetValues.set(valuesMap);
          }

          this.changeUsd.set(data.changeUsd);
          this.changePercent.set(data.changePercent);

          // Also set rawData for total view
          this.rawData.set({
            labels: data.labels,
            data: data.totalData,
            changeUsd: data.changeUsd,
            changePercent: data.changePercent,
            timeframe: data.timeframe,
          });

          this.internalLoading.set(false);
        },
        error: (err) => {
          console.error('Error loading chart data by asset:', err);
          this.rawDataByAsset.set(null);
          this.internalLoading.set(false);
        },
      });
    } else {
      // For 1m/1y, use the simple endpoint
      this.chartService.getChartData(timeframe).subscribe({
        next: (data) => {
          this.rawData.set(data);
          this.originalLabels.set(data.labels);
          this.changeUsd.set(data.changeUsd);
          this.changePercent.set(data.changePercent);
          this.internalLoading.set(false);
        },
        error: (err) => {
          console.error('Error loading chart data:', err);
          this.rawData.set(null);
          this.internalLoading.set(false);
        },
      });
    }
  }

  private buildSingleLineChartData(): ChartData<'line'> {
    const data = this.rawData();
    if (!data || data.labels.length === 0) {
      return { labels: [], datasets: [] };
    }

    const isPositive = data.changeUsd >= 0;
    const color = isPositive ? '#0ecb81' : '#f6465d';

    return {
      labels: this.formatLabels(data.labels),
      datasets: [
        {
          label: 'Total Portfolio',
          data: data.data,
          borderColor: color,
          backgroundColor: `${color}20`,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: color,
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2,
        },
      ],
    };
  }

  private buildMultiAssetChartData(): ChartData<'line'> {
    const data = this.rawDataByAsset();
    if (!data || data.labels.length === 0 || !data.assetData) {
      return { labels: [], datasets: [] };
    }

    const selected = this.selectedAssets();
    const datasets: ChartDataset<'line'>[] = [];

    // Add datasets for each selected asset
    data.assetData.forEach((assetData) => {
      if (selected.has(assetData.asset)) {
        // Use consistent color based on asset name hash
        const color = this.getAssetColor(assetData.asset);
        datasets.push({
          label: assetData.asset,
          data: assetData.data,
          borderColor: color,
          backgroundColor: `${color}20`,
          fill: false,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: color,
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2,
          borderWidth: 2,
        });
      }
    });

    return {
      labels: this.formatLabels(data.labels),
      datasets,
    };
  }

  /**
   * Get a consistent color for an asset based on its name
   */
  getAssetColor(asset: string): string {
    // Simple hash function for consistent color assignment
    let hash = 0;
    for (let i = 0; i < asset.length; i++) {
      hash = asset.charCodeAt(i) + ((hash << 5) - hash);
    }
    return ASSET_COLORS[Math.abs(hash) % ASSET_COLORS.length];
  }

  private formatLabels(labels: string[]): string[] {
    const timeframe = this.selectedTimeframe();
    return labels.map((label) => {
      const date = new Date(label);
      if (timeframe === '24h') {
        return date.toLocaleTimeString('es-AR', {
          hour: '2-digit',
          minute: '2-digit',
        });
      } else if (timeframe === '7d') {
        return date.toLocaleDateString('es-AR', {
          weekday: 'short',
          day: 'numeric',
        });
      } else {
        return date.toLocaleDateString('es-AR', {
          month: 'short',
          day: 'numeric',
        });
      }
    });
  }
}
