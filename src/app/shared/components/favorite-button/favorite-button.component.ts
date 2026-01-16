import { Component, Input, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FavoritesService } from '../../../core/services/favorites.service';

@Component({
  selector: 'app-favorite-button',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, MatTooltipModule],
  template: `
    <button
      mat-icon-button
      class="favorite-btn"
      [class.is-favorite]="isFavorite()"
      [class.loading]="isLoading()"
      (click)="toggle($event)"
      [matTooltip]="isFavorite() ? 'Quitar de favoritos' : 'Agregar a favoritos'"
      matTooltipPosition="above">
      <mat-icon>{{ isFavorite() ? 'star' : 'star_border' }}</mat-icon>
    </button>
  `,
  styles: [`
    .favorite-btn {
      color: var(--text-tertiary);
      transition: all 0.2s ease;
    }

    .favorite-btn:hover {
      color: var(--brand-primary);
    }

    .favorite-btn.is-favorite {
      color: #f59e0b;
    }

    .favorite-btn.is-favorite mat-icon {
      animation: pop 0.3s ease;
    }

    .favorite-btn.loading {
      opacity: 0.5;
      pointer-events: none;
    }

    @keyframes pop {
      0% { transform: scale(1); }
      50% { transform: scale(1.3); }
      100% { transform: scale(1); }
    }
  `]
})
export class FavoriteButtonComponent {
  @Input({ required: true }) asset!: string;

  private favoritesService = inject(FavoritesService);
  isLoading = signal(false);

  isFavorite() {
    return this.favoritesService.isFavorite(this.asset);
  }

  toggle(event: Event) {
    event.stopPropagation();

    if (this.isLoading()) return;

    this.isLoading.set(true);
    this.favoritesService.toggleFavorite(this.asset).subscribe({
      next: () => this.isLoading.set(false),
      error: () => this.isLoading.set(false)
    });
  }
}
