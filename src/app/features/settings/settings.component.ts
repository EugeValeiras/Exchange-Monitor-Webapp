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
import { Subject, debounceTime, distinctUntilChanged, takeUntil, forkJoin, switchMap, of, catchError } from 'rxjs';
import { SettingsService, AvailableSymbol } from '../../core/services/settings.service';
import { LogoLoaderComponent } from '../../shared/components/logo-loader/logo-loader.component';
import { ExchangeLogoComponent } from '../../shared/components/exchange-logo/exchange-logo.component';

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
    MatSnackBarModule,
    LogoLoaderComponent,
    ExchangeLogoComponent
  ],
  template: `
    <div class="settings-page">
      <div class="page-header">
        <h1>Configuracion</h1>
      </div>

      <mat-card class="settings-card">
        <mat-card-header>
          <mat-icon mat-card-avatar class="card-icon">show_chart</mat-icon>
          <mat-card-title>Pares de Precios</mat-card-title>
          <mat-card-subtitle>Configura que pares de trading quieres monitorear por exchange</mat-card-subtitle>
        </mat-card-header>

        <mat-card-content>
          <!-- Selected Symbols Summary -->
          <div class="selected-section">
            <div class="section-header">
              <span class="section-label">Pares seleccionados</span>
              @if (hasChanges) {
                <span class="unsaved-badge">Sin guardar</span>
              }
            </div>
            <div class="selected-chips">
              @if (selectedBinanceSymbols.size === 0 && selectedKrakenSymbols.size === 0) {
                <span class="no-selection">Ningun par seleccionado. Agrega pares para monitorear precios.</span>
              } @else {
                @for (symbol of selectedBinanceSymbols; track symbol) {
                  <mat-chip class="selected-chip binance-chip" (removed)="removeBinanceSymbol(symbol)">
                    <span class="chip-content">
                      <app-exchange-logo exchange="binance" [size]="16"></app-exchange-logo>
                      <span>{{ symbol }}</span>
                    </span>
                    <mat-icon matChipRemove>cancel</mat-icon>
                  </mat-chip>
                }
                @for (symbol of selectedKrakenSymbols; track symbol) {
                  <mat-chip class="selected-chip kraken-chip" (removed)="removeKrakenSymbol(symbol)">
                    <span class="chip-content">
                      <app-exchange-logo exchange="kraken" [size]="16"></app-exchange-logo>
                      <span>{{ symbol }}</span>
                    </span>
                    <mat-icon matChipRemove>cancel</mat-icon>
                  </mat-chip>
                }
              }
            </div>
          </div>

          <!-- Exchange Tabs -->
          <mat-tab-group [(selectedIndex)]="selectedTabIndex">
            <mat-tab label="Binance ({{ selectedBinanceSymbols.size }})">
              <ng-template matTabContent>
                <div class="exchange-tab-content">
                  <mat-form-field appearance="outline" class="search-field">
                    <mat-label>Buscar par en Binance</mat-label>
                    <input matInput [formControl]="binanceSearchControl" (input)="onBinanceInput($event)" placeholder="BTC, ETH, SOL...">
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
                        <app-logo-loader [size]="40" [showText]="false" [float]="false"></app-logo-loader>
                        <span>Buscando pares...</span>
                      </div>
                    } @else if (!binanceSearchControl.value || binanceSearchControl.value.length < 2) {
                      <div class="empty">
                        <mat-icon>search</mat-icon>
                        <span>Escribi al menos 2 caracteres para buscar</span>
                      </div>
                    } @else if (filteredBinanceSymbols.length === 0) {
                      <div class="empty">
                        <mat-icon>search_off</mat-icon>
                        <span>No se encontraron pares</span>
                      </div>
                    } @else {
                      @for (symbol of filteredBinanceSymbols; track symbol.symbol) {
                        <div class="symbol-item" (click)="toggleBinanceSymbol(symbol.symbol)">
                          <mat-checkbox
                            [checked]="selectedBinanceSymbols.has(symbol.symbol)"
                            (click)="$event.stopPropagation()"
                            (change)="toggleBinanceSymbol(symbol.symbol)">
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

            <mat-tab label="Kraken ({{ selectedKrakenSymbols.size }})">
              <ng-template matTabContent>
                <div class="exchange-tab-content">
                  <mat-form-field appearance="outline" class="search-field">
                    <mat-label>Buscar par en Kraken</mat-label>
                    <input matInput [formControl]="krakenSearchControl" (input)="onKrakenInput($event)" placeholder="BTC, ETH, SOL...">
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
                        <app-logo-loader [size]="40" [showText]="false" [float]="false"></app-logo-loader>
                        <span>Buscando pares...</span>
                      </div>
                    } @else if (!krakenSearchControl.value || krakenSearchControl.value.length < 2) {
                      <div class="empty">
                        <mat-icon>search</mat-icon>
                        <span>Escribi al menos 2 caracteres para buscar</span>
                      </div>
                    } @else if (filteredKrakenSymbols.length === 0) {
                      <div class="empty">
                        <mat-icon>search_off</mat-icon>
                        <span>No se encontraron pares</span>
                      </div>
                    } @else {
                      @for (symbol of filteredKrakenSymbols; track symbol.symbol) {
                        <div class="symbol-item" (click)="toggleKrakenSymbol(symbol.symbol)">
                          <mat-checkbox
                            [checked]="selectedKrakenSymbols.has(symbol.symbol)"
                            (click)="$event.stopPropagation()"
                            (change)="toggleKrakenSymbol(symbol.symbol)">
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
      background: var(--bg-tertiary);
      color: var(--text-primary);
      border-radius: 8px;
      width: 40px !important;
      height: 40px !important;
      display: flex !important;
      align-items: center;
      justify-content: center;
    }

    ::ng-deep .mat-mdc-tab-group {
      --mdc-tab-indicator-active-indicator-color: var(--text-primary);
      --mat-tab-header-active-label-text-color: var(--text-primary);
      --mat-tab-header-active-focus-label-text-color: var(--text-primary);
      --mat-tab-header-active-hover-label-text-color: var(--text-primary);
      --mat-tab-header-inactive-label-text-color: var(--text-secondary);
      --mat-tab-header-inactive-focus-label-text-color: var(--text-secondary);
      --mat-tab-header-inactive-hover-label-text-color: var(--text-primary);
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
      background: transparent !important;
      color: var(--text-primary) !important;
      border-width: 1.5px !important;
      border-style: solid !important;
    }

    .binance-chip {
      border-color: #F0B90B !important;
    }

    .kraken-chip {
      border-color: #5741D9 !important;
    }

    .chip-content {
      display: inline-flex;
      align-items: center;
      gap: 6px;
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

  // Separate sets per exchange
  selectedBinanceSymbols = new Set<string>();
  selectedKrakenSymbols = new Set<string>();
  originalBinanceSymbols = new Set<string>();
  originalKrakenSymbols = new Set<string>();

  filteredBinanceSymbols: AvailableSymbol[] = [];
  filteredKrakenSymbols: AvailableSymbol[] = [];

  loadingBinance = false;
  loadingKraken = false;
  saving = false;
  hasChanges = false;
  selectedTabIndex = 0;

  private destroy$ = new Subject<void>();

  constructor(
    private settingsService: SettingsService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadCurrentSymbols();
    this.setupSearchFilters();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadCurrentSymbols(): void {
    this.settingsService.loadAllSymbols().subscribe({
      next: (response) => {
        this.selectedBinanceSymbols = new Set(response.symbolsByExchange?.['binance'] || []);
        this.selectedKrakenSymbols = new Set(response.symbolsByExchange?.['kraken'] || []);
        this.originalBinanceSymbols = new Set(this.selectedBinanceSymbols);
        this.originalKrakenSymbols = new Set(this.selectedKrakenSymbols);
        this.checkChanges();
      },
      error: (err) => {
        console.error('Error loading symbols:', err);
        this.showError('Error al cargar la configuracion');
      }
    });
  }

  private setupSearchFilters(): void {
    // Binance search - debounced API call
    this.binanceSearchControl.valueChanges.pipe(
      debounceTime(400),
      distinctUntilChanged(),
      switchMap(search => {
        if (!search || search.length < 2) {
          return of({ symbols: [] as AvailableSymbol[] });
        }
        return this.settingsService.getAvailableSymbols('binance', search).pipe(
          catchError(() => of({ symbols: [] as AvailableSymbol[] }))
        );
      }),
      takeUntil(this.destroy$)
    ).subscribe(response => {
      this.filteredBinanceSymbols = response.symbols;
      this.loadingBinance = false;
    });

    // Kraken search - debounced API call
    this.krakenSearchControl.valueChanges.pipe(
      debounceTime(400),
      distinctUntilChanged(),
      switchMap(search => {
        if (!search || search.length < 2) {
          return of({ symbols: [] as AvailableSymbol[] });
        }
        return this.settingsService.getAvailableSymbols('kraken', search).pipe(
          catchError(() => of({ symbols: [] as AvailableSymbol[] }))
        );
      }),
      takeUntil(this.destroy$)
    ).subscribe(response => {
      this.filteredKrakenSymbols = response.symbols;
      this.loadingKraken = false;
    });
  }

  // Immediate input handlers for loading state
  onBinanceInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (value && value.length >= 2) {
      this.loadingBinance = true;
      this.filteredBinanceSymbols = [];
    } else {
      this.loadingBinance = false;
      this.filteredBinanceSymbols = [];
    }
  }

  onKrakenInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (value && value.length >= 2) {
      this.loadingKraken = true;
      this.filteredKrakenSymbols = [];
    } else {
      this.loadingKraken = false;
      this.filteredKrakenSymbols = [];
    }
  }

  toggleBinanceSymbol(symbol: string): void {
    if (this.selectedBinanceSymbols.has(symbol)) {
      this.selectedBinanceSymbols.delete(symbol);
    } else {
      this.selectedBinanceSymbols.add(symbol);
    }
    this.checkChanges();
  }

  toggleKrakenSymbol(symbol: string): void {
    if (this.selectedKrakenSymbols.has(symbol)) {
      this.selectedKrakenSymbols.delete(symbol);
    } else {
      this.selectedKrakenSymbols.add(symbol);
    }
    this.checkChanges();
  }

  removeBinanceSymbol(symbol: string): void {
    this.selectedBinanceSymbols.delete(symbol);
    this.checkChanges();
  }

  removeKrakenSymbol(symbol: string): void {
    this.selectedKrakenSymbols.delete(symbol);
    this.checkChanges();
  }

  resetChanges(): void {
    this.selectedBinanceSymbols = new Set(this.originalBinanceSymbols);
    this.selectedKrakenSymbols = new Set(this.originalKrakenSymbols);
    this.checkChanges();
  }

  private checkChanges(): void {
    const binanceCurrent = Array.from(this.selectedBinanceSymbols).sort();
    const binanceOriginal = Array.from(this.originalBinanceSymbols).sort();
    const krakenCurrent = Array.from(this.selectedKrakenSymbols).sort();
    const krakenOriginal = Array.from(this.originalKrakenSymbols).sort();

    this.hasChanges =
      JSON.stringify(binanceCurrent) !== JSON.stringify(binanceOriginal) ||
      JSON.stringify(krakenCurrent) !== JSON.stringify(krakenOriginal);
  }

  saveSymbols(): void {
    this.saving = true;

    const binanceSymbols = Array.from(this.selectedBinanceSymbols);
    const krakenSymbols = Array.from(this.selectedKrakenSymbols);

    // Save both exchanges in parallel
    forkJoin([
      this.settingsService.updateExchangeSymbols('binance', binanceSymbols),
      this.settingsService.updateExchangeSymbols('kraken', krakenSymbols)
    ]).subscribe({
      next: ([binanceResponse, krakenResponse]) => {
        this.originalBinanceSymbols = new Set(binanceResponse.symbols);
        this.originalKrakenSymbols = new Set(krakenResponse.symbols);
        this.checkChanges();
        this.saving = false;
        const total = binanceResponse.symbols.length + krakenResponse.symbols.length;
        this.showSuccess(`Configuracion guardada (${total} pares)`);
      },
      error: (err) => {
        console.error('Error saving symbols:', err);
        this.saving = false;
        this.showError('Error al guardar la configuracion');
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
