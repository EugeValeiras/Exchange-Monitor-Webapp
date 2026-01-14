import { Component, Inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { CredentialsService, AvailableSymbol, ExchangeType } from '../../core/services/credentials.service';

export interface SymbolsSelectorDialogData {
  exchange: ExchangeType;
  currentSymbols: string[];
}

@Component({
  selector: 'app-symbols-selector-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatCheckboxModule
  ],
  template: `
    <h2 mat-dialog-title>Configurar Pares</h2>

    <mat-dialog-content>
      <!-- Selected Chips -->
      <div class="selected-section">
        <span class="selected-label">Seleccionados ({{ selectedSymbols.size }})</span>
        <div class="selected-chips">
          @if (selectedSymbols.size === 0) {
            <span class="no-selection">Ningún par seleccionado</span>
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
          Limpiar
        </button>
      </div>

      <!-- Search -->
      <mat-form-field appearance="outline" class="search-field">
        <mat-label>Buscar par</mat-label>
        <input matInput [formControl]="searchControl" placeholder="BTC, ETH, SOL...">
        <mat-icon matPrefix>search</mat-icon>
        @if (searchControl.value) {
          <button matSuffix mat-icon-button type="button" (click)="searchControl.setValue('')">
            <mat-icon>close</mat-icon>
          </button>
        }
      </mat-form-field>

      <!-- Symbols List -->
      <div class="symbols-list">
        @if (loading) {
          <div class="loading">
            <mat-spinner diameter="32"></mat-spinner>
            <span>Cargando pares disponibles...</span>
          </div>
        } @else if (filteredSymbols.length === 0) {
          <div class="empty">
            <mat-icon>search_off</mat-icon>
            <span>No se encontraron pares</span>
          </div>
        } @else {
          @for (symbol of filteredSymbols; track symbol.symbol) {
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
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">Cancelar</button>
      <button mat-raised-button color="primary" (click)="onSave()">
        Guardar ({{ selectedSymbols.size }} pares)
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    mat-dialog-content {
      min-width: 500px;
      max-height: 70vh;
    }

    .selected-section {
      margin-bottom: 16px;
    }

    .selected-label {
      font-size: 12px;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .selected-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 8px;
      min-height: 40px;
      padding: 8px;
      background: var(--bg-tertiary);
      border-radius: 8px;
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
      margin-bottom: 16px;
    }

    .search-field {
      width: 100%;
    }

    .symbols-list {
      max-height: 300px;
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
  `]
})
export class SymbolsSelectorDialogComponent implements OnInit, OnDestroy {
  searchControl = new FormControl('');
  selectedSymbols = new Set<string>();
  availableSymbols: AvailableSymbol[] = [];
  filteredSymbols: AvailableSymbol[] = [];
  loading = true;

  private destroy$ = new Subject<void>();

  private readonly popularSymbols = [
    'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT',
    'ADA/USDT', 'DOGE/USDT', 'DOT/USDT', 'MATIC/USDT', 'LINK/USDT'
  ];

  constructor(
    private dialogRef: MatDialogRef<SymbolsSelectorDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: SymbolsSelectorDialogData,
    private credentialsService: CredentialsService
  ) {
    // Initialize with current symbols
    if (data.currentSymbols) {
      data.currentSymbols.forEach(s => this.selectedSymbols.add(s));
    }
  }

  ngOnInit(): void {
    this.loadSymbols();

    // Setup search with debounce
    this.searchControl.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(search => {
      this.filterSymbols(search || '');
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadSymbols(): void {
    this.loading = true;
    this.credentialsService.getAvailableSymbols(this.data.exchange).subscribe({
      next: (response) => {
        this.availableSymbols = response.symbols;
        this.filteredSymbols = response.symbols;
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading symbols:', err);
        this.loading = false;
      }
    });
  }

  filterSymbols(search: string): void {
    if (!search) {
      this.filteredSymbols = this.availableSymbols;
      return;
    }

    const searchUpper = search.toUpperCase();
    this.filteredSymbols = this.availableSymbols.filter(s =>
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
  }

  removeSymbol(symbol: string): void {
    this.selectedSymbols.delete(symbol);
  }

  addPopularSymbols(): void {
    this.popularSymbols.forEach(s => {
      if (this.availableSymbols.some(as => as.symbol === s)) {
        this.selectedSymbols.add(s);
      }
    });
  }

  clearSelection(): void {
    this.selectedSymbols.clear();
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onSave(): void {
    this.dialogRef.close(Array.from(this.selectedSymbols));
  }
}
