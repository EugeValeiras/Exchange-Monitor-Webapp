import { Component, Input, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { PriceSocketService } from '../../../core/services/price-socket.service';

@Component({
  selector: 'app-change-cell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, DecimalPipe],
  template: `
    @if (change() !== null) {
      <span class="change-value" [class.positive]="change()! > 0" [class.negative]="change()! < 0">
        {{ change()! > 0 ? '+' : '' }}{{ change() | number:'1.2-2' }}%
      </span>
    } @else {
      <span class="change-value neutral">--</span>
    }
  `,
  styles: [`
    .change-value {
      font-weight: 600;
      font-size: 13px;
    }

    .change-value.positive {
      color: var(--color-success);
    }

    .change-value.negative {
      color: var(--color-error);
    }

    .change-value.neutral {
      color: var(--text-tertiary);
    }
  `]
})
export class ChangeCellComponent {
  @Input({ required: true }) asset!: string;

  private priceSocket = inject(PriceSocketService);

  change = computed(() => {
    const priceData = this.priceSocket.getPrice(`${this.asset}/USDT`)
      || this.priceSocket.getPrice(`${this.asset}/USD`);
    return priceData?.change24h ?? null;
  });
}
