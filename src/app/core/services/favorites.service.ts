import { Injectable, signal, computed } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ApiService } from './api.service';

export interface FavoritesResponse {
  favorites: string[];
}

export interface ToggleFavoriteResponse {
  favorites: string[];
  isFavorite: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class FavoritesService {
  private favoritesSignal = signal<string[]>([]);
  private loadedSignal = signal<boolean>(false);

  // Exposed as readonly
  favorites = this.favoritesSignal.asReadonly();
  loaded = this.loadedSignal.asReadonly();

  // Computed Set for O(1) lookups
  favoritesSet = computed(() => new Set(this.favoritesSignal()));

  constructor(private api: ApiService) {}

  /**
   * Load favorites from backend
   */
  loadFavorites(): Observable<FavoritesResponse> {
    return this.api.get<FavoritesResponse>('/favorites').pipe(
      tap(response => {
        this.favoritesSignal.set(response.favorites);
        this.loadedSignal.set(true);
      })
    );
  }

  /**
   * Check if an asset is a favorite (sync, uses local state)
   */
  isFavorite(asset: string): boolean {
    return this.favoritesSet().has(asset.toUpperCase());
  }

  /**
   * Toggle favorite status
   */
  toggleFavorite(asset: string): Observable<ToggleFavoriteResponse> {
    const normalizedAsset = asset.toUpperCase();
    return this.api.post<ToggleFavoriteResponse>(`/favorites/${normalizedAsset}/toggle`, {}).pipe(
      tap(response => {
        this.favoritesSignal.set(response.favorites);
      })
    );
  }

  /**
   * Add to favorites
   */
  addFavorite(asset: string): Observable<FavoritesResponse> {
    return this.api.post<FavoritesResponse>(`/favorites/${asset.toUpperCase()}`, {}).pipe(
      tap(response => {
        this.favoritesSignal.set(response.favorites);
      })
    );
  }

  /**
   * Remove from favorites
   */
  removeFavorite(asset: string): Observable<FavoritesResponse> {
    return this.api.delete<FavoritesResponse>(`/favorites/${asset.toUpperCase()}`).pipe(
      tap(response => {
        this.favoritesSignal.set(response.favorites);
      })
    );
  }

  /**
   * Replace all favorites
   */
  updateFavorites(assets: string[]): Observable<FavoritesResponse> {
    return this.api.put<FavoritesResponse>('/favorites', { assets }).pipe(
      tap(response => {
        this.favoritesSignal.set(response.favorites);
      })
    );
  }
}
