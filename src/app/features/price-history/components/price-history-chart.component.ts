import { Component, Input, OnChanges, signal, computed, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
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
import { PriceHistoryService, ChartDataPoint, Timeframe } from '../price-history.service';

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

@Component({
  selector: 'app-price-history-chart',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatIconModule,
    BaseChartDirective,
  ],
  template: `
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
        <p>No hay datos historicos para este periodo</p>
        <p class="hint">Selecciona otro simbolo o periodo de tiempo</p>
      </div>
    }
  `,
  styles: [`
    .chart-container {
      height: 400px;
      position: relative;
    }

    .chart-skeleton {
      height: 400px;
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
      height: 400px;
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
export class PriceHistoryChartComponent implements OnChanges {
  @Input() symbol!: string;
  @Input() timeframe: Timeframe = '24h';
  @Input() exchange?: string;

  loading = signal(true);
  private rawData = signal<ChartDataPoint[]>([]);

  hasData = computed(() => {
    const data = this.rawData();
    return data && data.length > 0;
  });

  chartData = computed<ChartData<'line'>>(() => {
    const data = this.rawData();
    if (!data || data.length === 0) {
      return { labels: [], datasets: [] };
    }

    const labels = data.map(point => this.formatTimestamp(point.time));
    const prices = data.map(point => point.price);

    const firstPrice = prices[0];
    const lastPrice = prices[prices.length - 1];
    const isPositive = lastPrice >= firstPrice;
    const color = isPositive ? '#0ecb81' : '#f6465d';

    return {
      labels,
      datasets: [
        {
          label: this.symbol,
          data: prices,
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
            return `$${value.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 8,
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
            return `$${numValue.toLocaleString()}`;
          },
        },
      },
    },
  };

  constructor(private priceHistoryService: PriceHistoryService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['symbol'] || changes['timeframe'] || changes['exchange']) {
      this.loadChartData();
    }
  }

  private loadChartData(): void {
    if (!this.symbol) return;

    this.loading.set(true);
    this.priceHistoryService
      .getChartData(this.symbol, this.timeframe, this.exchange)
      .subscribe({
        next: (response) => {
          this.rawData.set(response.data);
          this.loading.set(false);
        },
        error: (err) => {
          console.error('Error loading price history chart:', err);
          this.rawData.set([]);
          this.loading.set(false);
        },
      });
  }

  private formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    const timeframe = this.timeframe;

    if (timeframe === '1h' || timeframe === '6h' || timeframe === '12h') {
      return date.toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } else if (timeframe === '24h') {
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
        day: 'numeric',
        month: 'short',
      });
    }
  }
}
