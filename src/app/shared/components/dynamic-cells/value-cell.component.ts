import { Component, Input, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { PriceSocketService } from '../../../core/services/price-socket.service';

@Component({
  selector: 'app-value-cell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, CurrencyPipe],
  template: `
    <span class="value">{{ value() | currency:'USD':'symbol':'1.2-2' }}</span>
  `,
  styles: [`
    .value {
      font-weight: 700;
      color: var(--text-primary);
    }
  `]
})
export class ValueCellComponent {
  @Input({ required: true }) asset!: string;
  @Input({ required: true }) quantity!: number;

  private priceSocket = inject(PriceSocketService);

  value = computed(() => {
    const priceData = this.priceSocket.getPrice(`${this.asset}/USDT`)
      || this.priceSocket.getPrice(`${this.asset}/USD`);
    const price = priceData?.price ?? 0;
    return price * this.quantity;
  });
}
