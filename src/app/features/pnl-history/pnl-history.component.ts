import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatNativeDateModule } from '@angular/material/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import {
  PnlService,
  PnlSummaryResponse,
  PnlFilters,
} from '../../core/services/pnl.service';
import { PnlSummaryCardsComponent } from './components/pnl-summary-cards.component';
import { RealizedPnlTableComponent } from './components/realized-pnl-table.component';
import { CostBasisTableComponent } from './components/cost-basis-table.component';
import { PnlEvolutionChartComponent } from './components/pnl-evolution-chart.component';

@Component({
  selector: 'app-pnl-history',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTabsModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatNativeDateModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatButtonToggleModule,
    PnlSummaryCardsComponent,
    RealizedPnlTableComponent,
    CostBasisTableComponent,
    PnlEvolutionChartComponent,
  ],
  template: `
    <div class="pnl-history-container">
      <div class="page-header">
        <div class="header-content">
          <h1>Historial P&L</h1>
          <p>Analiza tu rendimiento y cost basis de operaciones</p>
        </div>
        <div class="header-actions">
          <button
            mat-stroked-button
            (click)="exportToExcel()"
            [disabled]="exporting()"
            matTooltip="Exportar datos de P&L a Excel">
            <mat-icon>{{ exporting() ? 'sync' : 'download' }}</mat-icon>
            {{ exporting() ? 'Exportando...' : 'Exportar Excel' }}
          </button>
          <button
            mat-stroked-button
            (click)="recalculatePnl()"
            [disabled]="recalculating()"
            matTooltip="Recalcular P&L desde el historial de transacciones (FIFO)">
            <mat-icon [class.spinning]="recalculating()">{{ recalculating() ? 'sync' : 'refresh' }}</mat-icon>
            {{ recalculating() ? 'Recalculando...' : 'Recalcular P&L' }}
          </button>
        </div>
      </div>

      <!-- Date Range Filter -->
      <div class="filters-section">
        <div class="date-filter">
          <mat-form-field appearance="outline" class="date-range-field">
            <mat-date-range-input [rangePicker]="rangePicker">
              <input matStartDate [(ngModel)]="startDate" placeholder="Desde" (dateChange)="onDateChange()">
              <input matEndDate [(ngModel)]="endDate" placeholder="Hasta" (dateChange)="onDateChange()">
            </mat-date-range-input>
            <mat-datepicker-toggle matIconSuffix [for]="rangePicker"></mat-datepicker-toggle>
            <mat-date-range-picker #rangePicker></mat-date-range-picker>
          </mat-form-field>
          @if (startDate || endDate) {
            <button mat-icon-button (click)="clearDateFilter()" matTooltip="Limpiar filtro de fecha">
              <mat-icon>close</mat-icon>
            </button>
          }
        </div>

        <!-- Asset Filter -->
        @if (filters() && filters()!.assets.length > 0) {
          <div class="filter-group">
            <span class="filter-label">Assets</span>
            <mat-chip-listbox multiple (change)="onAssetFilterChange($event)" class="filter-chips">
              @for (asset of filters()!.assets; track asset) {
                <mat-chip-option [value]="asset" [selected]="selectedAssets().has(asset)" class="filter-chip">
                  <img [src]="getAssetLogo(asset)" [alt]="asset" class="chip-logo" (error)="onLogoError($event, asset)">
                  {{ asset }}
                </mat-chip-option>
              }
            </mat-chip-listbox>
          </div>
        }

        <!-- Exchange Filter -->
        @if (filters() && filters()!.exchanges.length > 0) {
          <div class="filter-group">
            <span class="filter-label">Exchanges</span>
            <mat-chip-listbox multiple (change)="onExchangeFilterChange($event)" class="filter-chips">
              @for (exchange of filters()!.exchanges; track exchange) {
                <mat-chip-option [value]="exchange" [selected]="selectedExchanges().has(exchange)" class="filter-chip">
                  {{ getExchangeLabel(exchange) }}
                </mat-chip-option>
              }
            </mat-chip-listbox>
          </div>
        }
      </div>

      <!-- Summary Cards -->
      <app-pnl-summary-cards [summary]="summary()"></app-pnl-summary-cards>

      <!-- Tabs: Realized P&L / Cost Basis Lots -->
      <mat-tab-group class="pnl-tabs" animationDuration="200ms">
        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon>trending_up</mat-icon>
            P&L Realizado
          </ng-template>
          <app-realized-pnl-table
            [startDate]="formatDateForApi(startDate)"
            [endDate]="formatDateForApi(endDate)"
            [assets]="Array.from(selectedAssets())"
            [exchanges]="Array.from(selectedExchanges())">
          </app-realized-pnl-table>
        </mat-tab>
        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon>inventory_2</mat-icon>
            Lotes de Costo
          </ng-template>
          <app-cost-basis-table
            [assets]="Array.from(selectedAssets())"
            [exchanges]="Array.from(selectedExchanges())">
          </app-cost-basis-table>
        </mat-tab>
      </mat-tab-group>

      <!-- P&L Evolution Chart -->
      <app-pnl-evolution-chart></app-pnl-evolution-chart>
    </div>
  `,
  styles: [`
    .pnl-history-container {
      padding: 24px;
      max-width: 1400px;
      margin: 0 auto;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
      flex-wrap: wrap;
      gap: 16px;
    }

    .header-content h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .header-content p {
      margin: 4px 0 0;
      color: var(--text-secondary);
      font-size: 14px;
    }

    .header-actions {
      display: flex;
      gap: 12px;
    }

    .header-actions button {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .header-actions mat-icon.spinning {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .filters-section {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      align-items: flex-start;
      margin-bottom: 24px;
      padding: 16px;
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
    }

    .date-filter {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .date-range-field {
      width: 280px;
    }

    .date-range-field ::ng-deep .mat-mdc-form-field-subscript-wrapper {
      display: none;
    }

    .filter-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .filter-label {
      font-size: 12px;
      font-weight: 500;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .filter-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .filter-chip {
      font-size: 13px;
    }

    .chip-logo {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      margin-right: 4px;
    }

    .pnl-tabs {
      margin-bottom: 24px;
    }

    .pnl-tabs ::ng-deep .mat-mdc-tab {
      min-width: 160px;
    }

    .pnl-tabs ::ng-deep .mat-mdc-tab .mdc-tab__content {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .pnl-tabs ::ng-deep .mat-mdc-tab-body-wrapper {
      padding-top: 16px;
    }

    @media (max-width: 768px) {
      .pnl-history-container {
        padding: 16px;
      }

      .page-header {
        flex-direction: column;
        align-items: stretch;
      }

      .header-actions {
        flex-direction: column;
      }

      .date-range-field {
        width: 100%;
      }
    }
  `],
})
export class PnlHistoryComponent implements OnInit {
  // Expose Array for template
  Array = Array;

  // State
  summary = signal<PnlSummaryResponse | null>(null);
  filters = signal<PnlFilters | null>(null);
  selectedAssets = signal(new Set<string>());
  selectedExchanges = signal(new Set<string>());
  recalculating = signal(false);
  exporting = signal(false);

  // Date filter
  startDate: Date | null = null;
  endDate: Date | null = null;

  constructor(private pnlService: PnlService) {}

  ngOnInit(): void {
    this.loadSummary();
    this.loadFilters();
  }

  loadSummary(): void {
    this.pnlService.getSummary().subscribe({
      next: (data) => this.summary.set(data),
      error: (err) => console.error('Error loading PNL summary:', err),
    });
  }

  loadFilters(): void {
    this.pnlService.getFilters().subscribe({
      next: (data) => this.filters.set(data),
      error: (err) => console.error('Error loading filters:', err),
    });
  }

  recalculatePnl(): void {
    this.recalculating.set(true);
    this.pnlService.recalculate().subscribe({
      next: () => {
        this.recalculating.set(false);
        this.loadSummary();
      },
      error: (err) => {
        console.error('Error recalculating PNL:', err);
        this.recalculating.set(false);
      },
    });
  }

  exportToExcel(): void {
    this.exporting.set(true);
    this.pnlService.exportPnl().subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `pnl-export-${new Date().toISOString().split('T')[0]}.xlsx`;
        link.click();
        window.URL.revokeObjectURL(url);
        this.exporting.set(false);
      },
      error: (err) => {
        console.error('Error exporting PNL:', err);
        this.exporting.set(false);
      },
    });
  }

  onDateChange(): void {
    // Tables will react to input changes
  }

  clearDateFilter(): void {
    this.startDate = null;
    this.endDate = null;
  }

  onAssetFilterChange(event: { value: string[] }): void {
    const newSet = new Set<string>(event.value || []);
    this.selectedAssets.set(newSet);
  }

  onExchangeFilterChange(event: { value: string[] }): void {
    const newSet = new Set<string>(event.value || []);
    this.selectedExchanges.set(newSet);
  }

  formatDateForApi(date: Date | null): string | undefined {
    return date ? date.toISOString().split('T')[0] : undefined;
  }

  getAssetLogo(asset: string): string {
    if (!asset) return '';
    let normalized = asset.toLowerCase();
    if (normalized.startsWith('ld') && normalized.length > 2) {
      normalized = normalized.substring(2);
    }
    return `/${normalized}.svg`;
  }

  getExchangeLabel(exchange: string): string {
    const labels: Record<string, string> = {
      binance: 'Binance',
      kraken: 'Kraken',
      nexo: 'Nexo',
      bitso: 'Bitso',
    };
    return labels[exchange] || exchange;
  }

  onLogoError(event: Event, asset: string): void {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
    const parent = img.parentElement;
    if (parent && !parent.querySelector('.asset-fallback')) {
      const fallback = document.createElement('span');
      fallback.className = 'asset-fallback';
      fallback.textContent = asset.substring(0, 2).toUpperCase();
      parent.insertBefore(fallback, img);
    }
  }
}
