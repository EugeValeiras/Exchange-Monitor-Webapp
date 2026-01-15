import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData, ChartOptions } from 'chart.js';
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
import { PnlService, PnlEvolutionData } from '../../../core/services/pnl.service';

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

type PnlTimeframe = '1m' | '3m' | '6m' | '1y' | 'all';

@Component({
  selector: 'app-pnl-evolution-chart',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonToggleModule,
    MatProgressSpinnerModule,
    MatIconModule,
    BaseChartDirective,
  ],
  template: `
    <mat-card class="chart-card">
      <mat-card-header>
        <mat-card-title>Evolución P&L</mat-card-title>
        <div class="header-actions">
          <mat-button-toggle-group
            [value]="selectedTimeframe()"
            (change)="onTimeframeChange($event.value)"
            class="timeframe-toggle">
            <mat-button-toggle value="1m">1M</mat-button-toggle>
            <mat-button-toggle value="3m">3M</mat-button-toggle>
            <mat-button-toggle value="6m">6M</mat-button-toggle>
            <mat-button-toggle value="1y">1Y</mat-button-toggle>
            <mat-button-toggle value="all">All</mat-button-toggle>
          </mat-button-toggle-group>
        </div>
      </mat-card-header>

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
              [options]="chartOptions"
              [type]="'line'">
            </canvas>
          </div>
        } @else {
          <div class="empty-container">
            <mat-icon>show_chart</mat-icon>
            <p>No hay datos de P&L para este período</p>
            <p class="hint">Realiza operaciones de compra/venta para ver la evolución</p>
          </div>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .chart-card {
      margin-top: 24px;
    }

    mat-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;

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

      ::ng-deep .mat-button-toggle-button {
        padding: 0 14px;
        height: 32px;
      }

      ::ng-deep .mat-button-toggle-label-content {
        line-height: 32px;
        margin-left: 0 !important;
        padding-left: 0 !important;
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
  `],
})
export class PnlEvolutionChartComponent implements OnInit {
  selectedTimeframe = signal<PnlTimeframe>('1y');
  loading = signal(true);
  private rawData = signal<PnlEvolutionData | null>(null);

  hasData = computed(() => {
    const data = this.rawData();
    return data && data.labels.length > 0;
  });

  chartData = computed<ChartData<'line'>>(() => {
    const data = this.rawData();
    if (!data || data.labels.length === 0) {
      return { labels: [], datasets: [] };
    }

    // Determine if last value is positive or negative
    const lastValue = data.data[data.data.length - 1] || 0;
    const isPositive = lastValue >= 0;
    const color = isPositive ? '#0ecb81' : '#f6465d';

    return {
      labels: this.formatLabels(data.labels),
      datasets: [
        {
          label: 'P&L Acumulado',
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
  });

  chartOptions: ChartOptions<'line'> = {
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
        displayColors: false,
        callbacks: {
          label: (context) => {
            const value = context.parsed.y ?? 0;
            const sign = value >= 0 ? '+' : '';
            return `${sign}$${value.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`;
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
          maxTicksLimit: 8,
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
          callback: (value) => {
            const numValue = Number(value);
            const sign = numValue >= 0 ? '+' : '';
            return `${sign}$${numValue.toLocaleString()}`;
          },
        },
      },
    },
  };

  constructor(private pnlService: PnlService) {}

  ngOnInit(): void {
    this.loadChartData();
  }

  onTimeframeChange(timeframe: PnlTimeframe): void {
    this.selectedTimeframe.set(timeframe);
    this.loadChartData();
  }

  private loadChartData(): void {
    this.loading.set(true);
    this.pnlService.getPnlEvolution(this.selectedTimeframe()).subscribe({
      next: (data) => {
        this.rawData.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error loading PNL evolution:', err);
        this.rawData.set(null);
        this.loading.set(false);
      },
    });
  }

  private formatLabels(labels: string[]): string[] {
    const timeframe = this.selectedTimeframe();
    return labels.map((label) => {
      const date = new Date(label);
      if (timeframe === '1m') {
        return date.toLocaleDateString('es-AR', {
          day: 'numeric',
          month: 'short',
        });
      } else if (timeframe === '3m' || timeframe === '6m') {
        return date.toLocaleDateString('es-AR', {
          day: 'numeric',
          month: 'short',
        });
      } else {
        return date.toLocaleDateString('es-AR', {
          month: 'short',
          year: '2-digit',
        });
      }
    });
  }
}
