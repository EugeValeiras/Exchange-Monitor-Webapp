import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTabsModule } from '@angular/material/tabs';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { SettingsService, AvailableSymbol } from '../../core/services/settings.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatCheckboxModule,
    MatTabsModule,
    MatSnackBarModule
  ],
  template: `
    <div class="settings-page">
      <div class="page-header">
        <h1>Configuración</h1>
      </div>

      <mat-card class="settings-card">
        <mat-card-header>
          <mat-icon mat-card-avatar class="card-icon">show_chart</mat-icon>
          <mat-card-title>Pares de Precios</mat-card-title>
          <mat-card-subtitle>Configura qué pares de trading quieres monitorear en tiempo real</mat-card-subtitle>
        </mat-card-header>

        <mat-card-content>
          <!-- Selected Symbols -->
          <div class="selected-section">
            <div class="section-header">
              <span class="section-label">Pares seleccionados ({{ selectedSymbols.size }})</span>
              @if (hasChanges) {
                <span class="unsaved-badge">Sin guardar</span>
              }
            </div>
            <div class="selected-chips">
              @if (selectedSymbols.size === 0) {
                <span class="no-selection">Ningún par seleccionado. Agrega pares para monitorear precios.</span>
              } @else {
                @for (symbol of selectedSymbols; track symbol) {
                  <mat-chip class="selected-chip" (removed)="removeSymbol(symbol)">
                    {{ symbol }}
                    <mat-icon matChipRemove>cancel</mat-icon>
                  </mat-chip>
                }
              }
            </div>
          </div>

          <!-- Quick Actions -->
          <div class="quick-actions">
            <button mat-stroked-button type="button" (click)="addPopularSymbols()">
              <mat-icon>star</mat-icon>
              Agregar populares
            </button>
            <button mat-stroked-button type="button" (click)="clearSelection()" [disabled]="selectedSymbols.size === 0">
              <mat-icon>clear_all</mat-icon>
              Limpiar todo
            </button>
          </div>

          <!-- Exchange Tabs -->
          <mat-tab-group>
            <mat-tab label="Binance">
              <ng-template matTabContent>
                <div class="exchange-tab-content">
                  <mat-form-field appearance="outline" class="search-field">
                    <mat-label>Buscar par en Binance</mat-label>
                    <input matInput [formControl]="binanceSearchControl" placeholder="BTC, ETH, SOL...">
                    <mat-icon matPrefix>search</mat-icon>
                    @if (binanceSearchControl.value) {
                      <button matSuffix mat-icon-button type="button" (click)="binanceSearchControl.setValue('')">
                        <mat-icon>close</mat-icon>
                      </button>
                    }
                  </mat-form-field>

                  <div class="symbols-list">
                    @if (loadingBinance) {
                      <div class="loading">
                        <mat-spinner diameter="32"></mat-spinner>
                        <span>Cargando pares de Binance...</span>
                      </div>
                    } @else if (filteredBinanceSymbols.length === 0) {
                      <div class="empty">
                        <mat-icon>search_off</mat-icon>
                        <span>No se encontraron pares</span>
                      </div>
                    } @else {
                      @for (symbol of filteredBinanceSymbols; track symbol.symbol) {
                        <div class="symbol-item" (click)="toggleSymbol(symbol.symbol)">
                          <mat-checkbox
                            [checked]="selectedSymbols.has(symbol.symbol)"
                            (click)="$event.stopPropagation()"
                            (change)="toggleSymbol(symbol.symbol)">
                          </mat-checkbox>
                          <span class="symbol-name">{{ symbol.symbol }}</span>
                          <span class="symbol-base">{{ symbol.base }}</span>
                        </div>
                      }
                    }
                  </div>
                </div>
              </ng-template>
            </mat-tab>

            <mat-tab label="Kraken">
              <ng-template matTabContent>
                <div class="exchange-tab-content">
                  <mat-form-field appearance="outline" class="search-field">
                    <mat-label>Buscar par en Kraken</mat-label>
                    <input matInput [formControl]="krakenSearchControl" placeholder="BTC, ETH, SOL...">
                    <mat-icon matPrefix>search</mat-icon>
                    @if (krakenSearchControl.value) {
                      <button matSuffix mat-icon-button type="button" (click)="krakenSearchControl.setValue('')">
                        <mat-icon>close</mat-icon>
                      </button>
                    }
                  </mat-form-field>

                  <div class="symbols-list">
                    @if (loadingKraken) {
                      <div class="loading">
                        <mat-spinner diameter="32"></mat-spinner>
                        <span>Cargando pares de Kraken...</span>
                      </div>
                    } @else if (filteredKrakenSymbols.length === 0) {
                      <div class="empty">
                        <mat-icon>search_off</mat-icon>
                        <span>No se encontraron pares</span>
                      </div>
                    } @else {
                      @for (symbol of filteredKrakenSymbols; track symbol.symbol) {
                        <div class="symbol-item" (click)="toggleSymbol(symbol.symbol)">
                          <mat-checkbox
                            [checked]="selectedSymbols.has(symbol.symbol)"
                            (click)="$event.stopPropagation()"
                            (change)="toggleSymbol(symbol.symbol)">
                          </mat-checkbox>
                          <span class="symbol-name">{{ symbol.symbol }}</span>
                          <span class="symbol-base">{{ symbol.base }}</span>
                        </div>
                      }
                    }
                  </div>
                </div>
              </ng-template>
            </mat-tab>
          </mat-tab-group>
        </mat-card-content>

        <mat-card-actions align="end">
          <button mat-button (click)="resetChanges()" [disabled]="!hasChanges || saving">
            Descartar cambios
          </button>
          <button mat-raised-button color="primary" (click)="saveSymbols()" [disabled]="!hasChanges || saving">
            @if (saving) {
              <mat-spinner diameter="20" class="button-spinner"></mat-spinner>
            }
            Guardar cambios
          </button>
        </mat-card-actions>
      </mat-card>
    </div>
  `,
  styles: [`
    .settings-page {
      padding: 24px;
      max-width: 900px;
      margin: 0 auto;
    }

    .page-header {
      margin-bottom: 24px;
    }

    .page-header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .settings-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
    }

    .card-icon {
      background: var(--brand-primary);
      color: #1e2026;
      border-radius: 8px;
      width: 40px !important;
      height: 40px !important;
      display: flex !important;
      align-items: center;
      justify-content: center;
    }

    mat-card-header {
      margin-bottom: 24px;
    }

    mat-card-title {
      color: var(--text-primary) !important;
    }

    mat-card-subtitle {
      color: var(--text-secondary) !important;
    }

    .selected-section {
      margin-bottom: 20px;
    }

    .section-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
    }

    .section-label {
      font-size: 12px;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .unsaved-badge {
      font-size: 11px;
      background: #ff9800;
      color: #1e2026;
      padding: 2px 8px;
      border-radius: 10px;
      font-weight: 600;
    }

    .selected-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      min-height: 50px;
      padding: 12px;
      background: var(--bg-tertiary);
      border-radius: 8px;
      max-height: 150px;
      overflow-y: auto;
    }

    .no-selection {
      color: var(--text-tertiary);
      font-size: 13px;
    }

    .selected-chip {
      background: var(--brand-primary) !important;
      color: #1e2026 !important;
    }

    .quick-actions {
      display: flex;
      gap: 8px;
      margin-bottom: 20px;
    }

    .exchange-tab-content {
      padding-top: 16px;
    }

    .search-field {
      width: 100%;
      margin-bottom: 12px;
    }

    .symbols-list {
      max-height: 350px;
      overflow-y: auto;
      border: 1px solid var(--border-color);
      border-radius: 8px;
    }

    .symbol-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      cursor: pointer;
      border-bottom: 1px solid var(--border-color);

      &:last-child {
        border-bottom: none;
      }

      &:hover {
        background: var(--bg-hover);
      }
    }

    .symbol-name {
      font-weight: 600;
      color: var(--text-primary);
    }

    .symbol-base {
      margin-left: auto;
      font-size: 12px;
      color: var(--text-secondary);
      background: var(--bg-tertiary);
      padding: 2px 8px;
      border-radius: 4px;
    }

    .loading, .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px;
      gap: 12px;
      color: var(--text-secondary);

      mat-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
        color: var(--text-tertiary);
      }
    }

    mat-card-actions {
      padding: 16px !important;
      border-top: 1px solid var(--border-color);
    }

    .button-spinner {
      display: inline-block;
      margin-right: 8px;
    }

    ::ng-deep .button-spinner circle {
      stroke: currentColor !important;
    }
  `]
})
export class SettingsComponent implements OnInit, OnDestroy {
  binanceSearchControl = new FormControl('');
  krakenSearchControl = new FormControl('');

  selectedSymbols = new Set<string>();
  originalSymbols = new Set<string>();

  binanceSymbols: AvailableSymbol[] = [];
  krakenSymbols: AvailableSymbol[] = [];
  filteredBinanceSymbols: AvailableSymbol[] = [];
  filteredKrakenSymbols: AvailableSymbol[] = [];

  loadingBinance = true;
  loadingKraken = true;
  saving = false;
  hasChanges = false;

  private destroy$ = new Subject<void>();

  private readonly popularSymbols = [
    'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT',
    'ADA/USDT', 'DOGE/USDT', 'DOT/USDT', 'MATIC/USDT', 'LINK/USDT',
    'AVAX/USDT', 'ATOM/USDT'
  ];

  constructor(
    private settingsService: SettingsService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadCurrentSymbols();
    this.loadAvailableSymbols();
    this.setupSearchFilters();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadCurrentSymbols(): void {
    this.settingsService.loadSymbols().subscribe({
      next: (response) => {
        this.selectedSymbols = new Set(response.symbols);
        this.originalSymbols = new Set(response.symbols);
        this.checkChanges();
      },
      error: (err) => {
        console.error('Error loading symbols:', err);
        this.showError('Error al cargar la configuración');
      }
    });
  }

  private loadAvailableSymbols(): void {
    // Load Binance symbols
    this.settingsService.getAvailableSymbols('binance').subscribe({
      next: (response) => {
        this.binanceSymbols = response.symbols;
        this.filteredBinanceSymbols = response.symbols;
        this.loadingBinance = false;
      },
      error: (err) => {
        console.error('Error loading Binance symbols:', err);
        this.loadingBinance = false;
      }
    });

    // Load Kraken symbols
    this.settingsService.getAvailableSymbols('kraken').subscribe({
      next: (response) => {
        this.krakenSymbols = response.symbols;
        this.filteredKrakenSymbols = response.symbols;
        this.loadingKraken = false;
      },
      error: (err) => {
        console.error('Error loading Kraken symbols:', err);
        this.loadingKraken = false;
      }
    });
  }

  private setupSearchFilters(): void {
    this.binanceSearchControl.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(search => {
      this.filterBinanceSymbols(search || '');
    });

    this.krakenSearchControl.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(search => {
      this.filterKrakenSymbols(search || '');
    });
  }

  private filterBinanceSymbols(search: string): void {
    if (!search) {
      this.filteredBinanceSymbols = this.binanceSymbols;
      return;
    }
    const searchUpper = search.toUpperCase();
    this.filteredBinanceSymbols = this.binanceSymbols.filter(s =>
      s.symbol.toUpperCase().includes(searchUpper) ||
      s.base.toUpperCase().includes(searchUpper)
    );
  }

  private filterKrakenSymbols(search: string): void {
    if (!search) {
      this.filteredKrakenSymbols = this.krakenSymbols;
      return;
    }
    const searchUpper = search.toUpperCase();
    this.filteredKrakenSymbols = this.krakenSymbols.filter(s =>
      s.symbol.toUpperCase().includes(searchUpper) ||
      s.base.toUpperCase().includes(searchUpper)
    );
  }

  toggleSymbol(symbol: string): void {
    if (this.selectedSymbols.has(symbol)) {
      this.selectedSymbols.delete(symbol);
    } else {
      this.selectedSymbols.add(symbol);
    }
    this.checkChanges();
  }

  removeSymbol(symbol: string): void {
    this.selectedSymbols.delete(symbol);
    this.checkChanges();
  }

  addPopularSymbols(): void {
    const allSymbols = [...this.binanceSymbols, ...this.krakenSymbols];
    this.popularSymbols.forEach(s => {
      if (allSymbols.some(as => as.symbol === s)) {
        this.selectedSymbols.add(s);
      }
    });
    this.checkChanges();
  }

  clearSelection(): void {
    this.selectedSymbols.clear();
    this.checkChanges();
  }

  resetChanges(): void {
    this.selectedSymbols = new Set(this.originalSymbols);
    this.checkChanges();
  }

  private checkChanges(): void {
    const currentArray = Array.from(this.selectedSymbols).sort();
    const originalArray = Array.from(this.originalSymbols).sort();
    this.hasChanges = JSON.stringify(currentArray) !== JSON.stringify(originalArray);
  }

  saveSymbols(): void {
    this.saving = true;
    const symbols = Array.from(this.selectedSymbols);

    this.settingsService.updateSymbols(symbols).subscribe({
      next: (response) => {
        this.originalSymbols = new Set(response.symbols);
        this.checkChanges();
        this.saving = false;
        this.showSuccess(`Configuración guardada (${response.symbols.length} pares)`);
      },
      error: (err) => {
        console.error('Error saving symbols:', err);
        this.saving = false;
        this.showError('Error al guardar la configuración');
      }
    });
  }

  private showSuccess(message: string): void {
    this.snackBar.open(message, 'Cerrar', {
      duration: 3000,
      panelClass: ['snackbar-success']
    });
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Cerrar', {
      duration: 5000,
      panelClass: ['snackbar-error']
    });
  }
}
