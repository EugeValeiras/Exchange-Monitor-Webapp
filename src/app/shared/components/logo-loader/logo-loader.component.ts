import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-logo-loader',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="logo-loader" [style.--size]="size + 'px'">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 64 64"
        [attr.width]="size"
        [attr.height]="size"
        [class.animated-logo]="float"
      >
        <defs>
          <linearGradient id="loaderAccent" x1="10" y1="54" x2="54" y2="10" gradientUnits="userSpaceOnUse">
            <stop offset="0" stop-color="#00C2FF" stop-opacity="0.90"/>
            <stop offset="1" stop-color="#00C2FF" stop-opacity="1"/>
          </linearGradient>
          <filter id="loaderGlow" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">
            <feGaussianBlur stdDeviation="2" result="blur"/>
            <feColorMatrix in="blur" type="matrix"
              values="1 0 0 0 0
                      0 1 0 0 0
                      0 0 1 0 0
                      0 0 0 .6 0" result="glow"/>
            <feMerge>
              <feMergeNode in="glow"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        <!-- Border rectangle -->
        <rect x="6" y="6" width="52" height="52" rx="14" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="2" class="border-rect"/>

        <!-- Grid lines -->
        <path d="M18 44H46" stroke="rgba(255,255,255,.08)" stroke-width="2" stroke-linecap="round"/>
        <path d="M18 32H42" stroke="rgba(255,255,255,.06)" stroke-width="2" stroke-linecap="round"/>

        <!-- Animated trend line -->
        <g filter="url(#loaderGlow)">
          <path
            d="M18 40 L28 30 L36 34 L46 22"
            stroke="url(#loaderAccent)"
            stroke-width="4"
            stroke-linecap="round"
            stroke-linejoin="round"
            fill="none"
            class="trend-line"
          />

          <!-- Data points with staggered animation -->
          <circle cx="18" cy="40" r="3.2" fill="#00C2FF" class="data-point point-1"/>
          <circle cx="28" cy="30" r="3.2" fill="#00C2FF" class="data-point point-2"/>
          <circle cx="36" cy="34" r="3.2" fill="#00C2FF" class="data-point point-3"/>
          <circle cx="46" cy="22" r="3.2" fill="#00C2FF" class="data-point point-4"/>
        </g>
      </svg>

      @if (showText) {
        <p class="loader-text">{{ text }}</p>
      }
    </div>
  `,
  styles: [`
    .logo-loader {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }

    .animated-logo {
      animation: float 3s ease-in-out infinite;
    }

    @keyframes float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-6px); }
    }

    .border-rect {
      animation: borderPulse 2s ease-in-out infinite;
    }

    @keyframes borderPulse {
      0%, 100% { stroke-opacity: 0.12; }
      50% { stroke-opacity: 0.25; }
    }

    /* Line drawing animation */
    .trend-line {
      stroke-dasharray: 80;
      stroke-dashoffset: 80;
      animation: drawLine 1.5s ease-out forwards, glowPulse 2s ease-in-out 1.5s infinite;
    }

    @keyframes drawLine {
      to {
        stroke-dashoffset: 0;
      }
    }

    @keyframes glowPulse {
      0%, 100% { filter: drop-shadow(0 0 2px #00C2FF); }
      50% { filter: drop-shadow(0 0 8px #00C2FF); }
    }

    /* Data points appear one by one */
    .data-point {
      opacity: 0;
      transform-origin: center;
      animation: pointAppear 0.3s ease-out forwards, pointPulse 2s ease-in-out infinite;
    }

    .point-1 { animation-delay: 0.3s, 1.8s; }
    .point-2 { animation-delay: 0.6s, 2.1s; }
    .point-3 { animation-delay: 0.9s, 2.4s; }
    .point-4 { animation-delay: 1.2s, 2.7s; }

    @keyframes pointAppear {
      0% {
        opacity: 0;
        transform: scale(0);
      }
      70% {
        transform: scale(1.3);
      }
      100% {
        opacity: 1;
        transform: scale(1);
      }
    }

    @keyframes pointPulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.15); opacity: 0.9; }
    }

    .loader-text {
      margin: 0;
      color: var(--text-secondary);
      font-size: 14px;
      animation: textFade 2s ease-in-out infinite;
    }

    @keyframes textFade {
      0%, 100% { opacity: 0.7; }
      50% { opacity: 1; }
    }
  `]
})
export class LogoLoaderComponent {
  @Input() size = 64;
  @Input() text = 'Cargando...';
  @Input() showText = true;
  @Input() float = true;
}
