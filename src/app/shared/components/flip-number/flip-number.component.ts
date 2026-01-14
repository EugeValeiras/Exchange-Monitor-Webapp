import { Component, Input, OnChanges, SimpleChanges, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

interface FlipDigit {
  char: string;
  key: number;
  isFlipping: boolean;
  prevChar: string;
}

@Component({
  selector: 'app-flip-number',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flip-container" [class.small]="size === 'small'" [class.large]="size === 'large'">
      @for (digit of digits(); track digit.key) {
        <div class="flip-digit" [class.separator]="digit.char === ',' || digit.char === '.'">
          @if (digit.char === ',' || digit.char === '.') {
            <span class="separator-char">{{ digit.char }}</span>
          } @else {
            <div class="flip-card" [class.flipping]="digit.isFlipping" [class.symbol]="digit.char === '$'">
              <div class="flip-panel top">
                <span>{{ digit.isFlipping ? digit.prevChar : digit.char }}</span>
              </div>
              <div class="flip-panel bottom">
                <span>{{ digit.char }}</span>
              </div>
              @if (digit.isFlipping) {
                <div class="flip-panel top flap-front">
                  <span>{{ digit.prevChar }}</span>
                </div>
                <div class="flip-panel bottom flap-back">
                  <span>{{ digit.char }}</span>
                </div>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: inline-block;
      --flip-bg-top: rgba(0, 0, 0, 0.25);
      --flip-bg-bottom: rgba(0, 0, 0, 0.35);
      --flip-text: #ffffff;
      --flip-text-dim: rgba(255, 255, 255, 0.85);
      --flip-shadow: rgba(0, 0, 0, 0.3);
      --flip-line: rgba(0, 0, 0, 0.5);
    }

    .flip-container {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      font-family: 'SF Mono', 'Roboto Mono', 'Consolas', monospace;
      font-size: 24px;
    }

    .flip-container.small {
      gap: 1px;
      font-size: 18px;
    }

    .flip-container.large {
      gap: 2px;
      font-size: 28px;
    }

    .flip-digit {
      position: relative;
    }

    .flip-digit.separator {
      display: flex;
      align-items: center;
    }

    .separator-char {
      font-size: inherit;
      font-weight: 600;
      color: var(--flip-text);
      padding: 0 1px;
      opacity: 0.9;
    }

    .flip-card {
      position: relative;
      width: 0.65em;
      height: 1.2em;
      border-radius: 3px;
      box-shadow: 0 2px 4px var(--flip-shadow);
    }

    .flip-card.symbol {
      width: 0.55em;
    }

    .flip-container.small .flip-card {
      width: 0.6em;
      height: 1.1em;
      border-radius: 2px;
    }

    .flip-container.small .flip-card.symbol {
      width: 0.5em;
    }

    .flip-container.large .flip-card {
      width: 0.68em;
      height: 1.25em;
      border-radius: 4px;
    }

    .flip-container.large .flip-card.symbol {
      width: 0.58em;
    }

    .flip-panel {
      position: absolute;
      left: 0;
      right: 0;
      height: 50%;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .flip-panel.top {
      top: 0;
      background: var(--flip-bg-top);
      border-radius: 3px 3px 0 0;
    }

    .flip-panel.bottom {
      bottom: 0;
      background: var(--flip-bg-bottom);
      border-radius: 0 0 3px 3px;
    }

    .flip-container.small .flip-panel.top {
      border-radius: 2px 2px 0 0;
    }

    .flip-container.small .flip-panel.bottom {
      border-radius: 0 0 2px 2px;
    }

    .flip-container.large .flip-panel.top {
      border-radius: 4px 4px 0 0;
    }

    .flip-container.large .flip-panel.bottom {
      border-radius: 0 0 4px 4px;
    }

    .flip-panel.top span {
      position: relative;
      top: 50%;
      color: var(--flip-text);
      font-weight: 600;
    }

    .flip-panel.bottom span {
      position: relative;
      bottom: 50%;
      color: var(--flip-text-dim);
      font-weight: 600;
    }

    /* Animated flaps */
    .flip-panel.flap-front {
      z-index: 3;
      transform-origin: bottom center;
      animation: flip-front 0.3s ease-in forwards;
      backface-visibility: hidden;
    }

    .flip-panel.flap-back {
      z-index: 2;
      transform-origin: top center;
      transform: rotateX(90deg);
      animation: flip-back 0.3s ease-out 0.15s forwards;
      backface-visibility: hidden;
    }

    @keyframes flip-front {
      0% {
        transform: rotateX(0deg);
      }
      100% {
        transform: rotateX(-90deg);
      }
    }

    @keyframes flip-back {
      0% {
        transform: rotateX(90deg);
      }
      100% {
        transform: rotateX(0deg);
      }
    }

    /* Line in the middle */
    .flip-card::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 0;
      right: 0;
      height: 1px;
      background: var(--flip-line);
      z-index: 10;
      transform: translateY(-50%);
    }
  `]
})
export class FlipNumberComponent implements OnChanges {
  @Input() value: number = 0;
  @Input() format: 'currency' | 'number' | 'percent' = 'currency';
  @Input() decimals: number = 2;
  @Input() size: 'small' | 'medium' | 'large' = 'medium';

  private _digits = signal<FlipDigit[]>([]);
  private keyCounter = 0;
  private previousFormattedValue = '';

  readonly digits = this._digits.asReadonly();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['value'] || changes['format'] || changes['decimals']) {
      this.updateDigits();
    }
  }

  private formatValue(value: number): string {
    if (this.format === 'currency') {
      return value.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: this.decimals,
        maximumFractionDigits: this.decimals
      });
    } else if (this.format === 'percent') {
      return value.toLocaleString('en-US', {
        style: 'percent',
        minimumFractionDigits: this.decimals,
        maximumFractionDigits: this.decimals
      });
    } else {
      return value.toLocaleString('en-US', {
        minimumFractionDigits: this.decimals,
        maximumFractionDigits: this.decimals
      });
    }
  }

  private updateDigits(): void {
    const formattedValue = this.formatValue(this.value);
    const newDigits: FlipDigit[] = [];

    const prevChars = this.previousFormattedValue.split('');
    const newChars = formattedValue.split('');

    // Align from the right for proper number animation
    const maxLen = Math.max(prevChars.length, newChars.length);
    while (prevChars.length < maxLen) prevChars.unshift(' ');
    while (newChars.length < maxLen) newChars.unshift(' ');

    let digitIndex = 0;
    for (let i = 0; i < newChars.length; i++) {
      const newChar = newChars[i];
      const prevChar = prevChars[i] || ' ';

      // Skip empty padding
      if (newChar === ' ' && prevChar === ' ') continue;
      if (newChar === ' ') continue;

      const isFlipping = newChar !== prevChar &&
                         prevChar !== ' ' &&
                         newChar !== ',' &&
                         newChar !== '.' &&
                         prevChar !== ',' &&
                         prevChar !== '.';

      newDigits.push({
        char: newChar,
        key: digitIndex++,
        isFlipping,
        prevChar: isFlipping ? prevChar : newChar
      });
    }

    this._digits.set(newDigits);
    this.previousFormattedValue = formattedValue;

    // Reset flipping state after animation completes
    if (newDigits.some(d => d.isFlipping)) {
      setTimeout(() => {
        this._digits.update(digits =>
          digits.map(d => ({ ...d, isFlipping: false }))
        );
      }, 500);
    }
  }
}
