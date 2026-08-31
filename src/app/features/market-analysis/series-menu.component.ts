import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { SERIES, SeriesConfig, SeriesId, seriesColor } from './lib/series';

/**
 * The switchboard behind the "Series" button.
 *
 * Split by what each series costs you: an overlay shares the price panel and
 * costs ink, a panel opens a pane of its own and costs height. Every row
 * carries the colour it will be drawn in, so you pick a line, not a name.
 */
@Component({
  selector: 'app-series-menu',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="menu" role="menu">
      <div class="group">
        <span class="group-label">Sobre el precio</span>
        @for (s of overlays; track s.id) {
          <button
            type="button"
            role="menuitemcheckbox"
            [attr.aria-checked]="series[s.id]"
            [class.on]="series[s.id]"
            [title]="s.hint"
            (click)="toggle(s.id)">
            <span class="check">
              @if (series[s.id]) {
                <mat-icon>check</mat-icon>
              }
            </span>
            <span class="swatch" [style.background]="color(s.id)"></span>
            <span class="label">{{ s.label }}</span>
          </button>
        }
      </div>

      <div class="group">
        <span class="group-label">Paneles</span>
        @for (s of panels; track s.id) {
          <button
            type="button"
            role="menuitemcheckbox"
            [attr.aria-checked]="series[s.id]"
            [class.on]="series[s.id]"
            [title]="s.hint"
            (click)="toggle(s.id)">
            <span class="check">
              @if (series[s.id]) {
                <mat-icon>check</mat-icon>
              }
            </span>
            <span class="swatch" [style.background]="color(s.id)"></span>
            <span class="label">{{ s.label }}</span>
          </button>
        }
      </div>

      <div class="foot">
        <button type="button" class="link" (click)="reset.emit()">Volver al default</button>
      </div>
    </div>
  `,
  styles: [
    `
      .menu {
        position: absolute;
        top: calc(100% + 6px);
        right: 0;
        z-index: var(--z-overlay);
        width: 190px;
        padding: var(--sp-3);
        border: 1px solid var(--border-light);
        border-radius: var(--r-4);
        background: var(--bg-elevated);
        box-shadow: 0 18px 44px rgba(0, 0, 0, 0.55);
      }

      .group + .group {
        margin-top: var(--sp-3);
        padding-top: var(--sp-3);
        border-top: 1px solid var(--border-color);
      }

      .group-label {
        display: block;
        padding: 0 6px 5px;
        font-size: var(--fs-10);
        font-weight: 700;
        letter-spacing: 0.09em;
        text-transform: uppercase;
        color: var(--text-tertiary);
      }

      .menu button {
        display: flex;
        align-items: center;
        gap: 7px;
        width: 100%;
        height: 26px;
        padding: 0 6px;
        border: none;
        border-radius: var(--r-2);
        background: transparent;
        color: var(--text-secondary);
        font-family: inherit;
        font-size: 12px;
        text-align: left;
        cursor: pointer;
      }

      .menu button:hover {
        background: var(--bg-tertiary);
        color: var(--text-primary);
      }

      .menu button.on {
        color: var(--text-primary);
      }

      .check {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 13px;
        color: var(--brand-accent);
      }

      .check mat-icon {
        font-size: 13px;
        width: 13px;
        height: 13px;
      }

      .swatch {
        width: 9px;
        height: 2px;
        border-radius: 1px;
        opacity: 0.9;
      }

      /* An off series shows its colour drained, not a different colour */
      button:not(.on) .swatch {
        opacity: 0.35;
      }

      .label {
        flex: 1;
      }

      .foot {
        margin-top: var(--sp-3);
        padding-top: var(--sp-3);
        border-top: 1px solid var(--border-color);
      }

      .foot .link {
        height: 22px;
        justify-content: center;
        color: var(--text-tertiary);
        font-size: 11px;
      }
    `,
  ],
})
export class SeriesMenuComponent {
  @Input({ required: true }) series!: SeriesConfig;

  @Output() seriesChange = new EventEmitter<SeriesConfig>();
  @Output() reset = new EventEmitter<void>();

  readonly overlays = SERIES.filter((s) => s.kind === 'overlay');
  readonly panels = SERIES.filter((s) => s.kind === 'panel');

  readonly color = seriesColor;

  toggle(id: SeriesId): void {
    this.seriesChange.emit({ ...this.series, [id]: !this.series[id] });
  }
}
