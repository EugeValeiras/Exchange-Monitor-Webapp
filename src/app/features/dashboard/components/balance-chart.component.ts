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
} from '../../../core/services/chart.service';
import { LogoLoaderComponent } from '../../../shared/components/logo-loader/logo-loader.component';

@Component({
  selector: 'app-balance-chart',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonToggleModule,
    MatProgressSpinnerModule,
    MatIconModule,
    BaseChartDirective,
    LogoLoaderComponent,
  ],
  template: `
    <mat-card class="chart-card">
      <mat-card-header>
        <mat-card-title>Balance History</mat-card-title>
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
      </mat-card-header>
      <mat-card-content>
        @if (loading()) {
          <div class="loading-container">
            <app-logo-loader [size]="56" [showText]="false"></app-logo-loader>
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
          <div class="chart-summary" [class.positive]="changeUsd() >= 0" [class.negative]="changeUsd() < 0">
            <span class="change-value">
              {{ changeUsd() >= 0 ? '+' : '' }}{{ changeUsd() | currency:'USD':'symbol':'1.2-2' }}
            </span>
            <span class="change-percent">
              ({{ changePercent() >= 0 ? '+' : '' }}{{ changePercent() | number:'1.2-2' }}%)
            </span>
            <span class="timeframe-label">{{ getTimeframeLabel() }}</span>
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
      background: var(--bg-tertiary);
      border-radius: 8px;
      border: none;
      padding: 4px;

      ::ng-deep .mat-button-toggle-group {
        border: none;
      }

      ::ng-deep .mat-button-toggle {
        font-size: 12px;
        font-weight: 500;
        border: none !important;
        background: transparent;
        border-radius: 6px;
      }

      ::ng-deep .mat-button-toggle-appearance-standard {
        background: transparent;
      }

      ::ng-deep .mat-button-toggle + .mat-button-toggle {
        border-left: none !important;
      }

      ::ng-deep .mat-button-toggle-checked {
        background: var(--brand-primary) !important;
        color: white;
        border-radius: 6px;
      }

      ::ng-deep .mat-button-toggle-button {
        padding: 0 12px;
        height: 28px;
      }
    }

    .chart-container {
      height: 300px;
      position: relative;
    }

    .loading-container {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 300px;
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
  selectedTimeframe = signal<ChartTimeframe>('7d');
  loading = signal(true);
  changeUsd = signal(0);
  changePercent = signal(0);

  private rawData = signal<ChartDataResponse | null>(null);

  hasData = computed(() => {
    const data = this.rawData();
    return data && data.labels.length > 0;
  });

  chartData = computed<ChartData<'line'>>(() => {
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
          data: data.data,
          borderColor: color,
          backgroundColor: this.createGradient(color),
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
            return `$${value.toLocaleString('en-US', {
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

  constructor(private chartService: ChartService) {}

  ngOnInit(): void {
    this.loadChartData();
  }

  onTimeframeChange(timeframe: ChartTimeframe): void {
    this.selectedTimeframe.set(timeframe);
    this.loadChartData();
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

  private loadChartData(): void {
    this.loading.set(true);
    this.chartService.getChartData(this.selectedTimeframe()).subscribe({
      next: (data) => {
        this.rawData.set(data);
        this.changeUsd.set(data.changeUsd);
        this.changePercent.set(data.changePercent);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error loading chart data:', err);
        this.rawData.set(null);
        this.loading.set(false);
      },
    });
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

  private createGradient(color: string): string | CanvasGradient {
    // For SSR compatibility, return a simple color
    // The gradient will be applied via CSS or chart.js plugin if needed
    return `${color}20`;
  }
}
