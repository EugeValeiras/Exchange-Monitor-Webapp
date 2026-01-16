import { Component, Input, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { PriceSocketService } from '../../../core/services/price-socket.service';

@Component({
  selector: 'app-price-cell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, CurrencyPipe],
  template: `
    <span class="price-value">{{ price() | currency:'USD':'symbol':'1.2-4' }}</span>
  `,
  styles: [`
    .price-value {
      font-weight: 700;
      color: var(--text-primary);
    }
  `]
})
export class PriceCellComponent {
  @Input({ required: true }) asset!: string;

  private priceSocket = inject(PriceSocketService);

  price = computed(() => {
    const priceData = this.priceSocket.getPrice(`${this.asset}/USDT`)
      || this.priceSocket.getPrice(`${this.asset}/USD`);
    return priceData?.price ?? 0;
  });
}
