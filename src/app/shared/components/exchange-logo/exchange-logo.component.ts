import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-exchange-logo',
  standalone: true,
  imports: [CommonModule],
  template: `
    @switch (exchange) {
      @case ('binance') {
        <img [src]="'/binance.svg'" [width]="size" [height]="size" alt="Binance" class="exchange-img" />
      }
      @case ('kraken') {
        <img [src]="'/kraken.svg'" [width]="size" [height]="size" alt="Kraken" class="exchange-img" />
      }
      @case ('nexo-pro') {
        <img [src]="'/nexo-pro.svg'" [width]="size" [height]="size" alt="Nexo Pro" class="exchange-img" />
      }
      @case ('nexo-manual') {
        <img [src]="'/nexo-manual.svg'" [width]="size" [height]="size" alt="Nexo Manual" class="exchange-img" />
      }
      @default {
        <div class="fallback-icon" [style.width.px]="size" [style.height.px]="size">
          {{ exchange.charAt(0).toUpperCase() }}
        </div>
      }
    }
  `,
  styles: [`
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    svg, .exchange-img {
      display: block;
      border-radius: 10px;
    }

    .fallback-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg-tertiary);
      border-radius: 10px;
      font-weight: 700;
      font-size: 18px;
      color: var(--text-primary);
    }
  `]
})
export class ExchangeLogoComponent {
  @Input() exchange: string = '';
  @Input() size: number = 48;
}
