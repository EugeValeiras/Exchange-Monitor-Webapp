import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ChartService } from '../../core/services/chart.service';

@Component({
  selector: 'app-maintenance',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  template: `
    <div class="maintenance-page">
      <div class="page-header">
        <h1>Mantenimiento</h1>
        <p class="page-subtitle">Herramientas de mantenimiento y reconstruccion de datos</p>
      </div>

      <!-- Rebuild History Card -->
      <mat-card class="maintenance-card">
        <mat-card-header>
          <mat-icon mat-card-avatar class="card-icon">history</mat-icon>
          <mat-card-title>Historial de Balance</mat-card-title>
          <mat-card-subtitle>Recalcula el historial de snapshots basado en las transacciones existentes</mat-card-subtitle>
        </mat-card-header>

        <mat-card-content>
          <div class="info-box">
            <mat-icon class="info-icon">info</mat-icon>
            <p>Esta accion reconstruira el historial de balances usando las transacciones importadas.
               Util si importaste transacciones historicas y quieres ver el grafico de balance completo.</p>
          </div>
        </mat-card-content>

        <mat-card-actions align="end">
          <button mat-raised-button color="primary" (click)="rebuildHistory()" [disabled]="rebuildingHistory">
            @if (rebuildingHistory) {
              <mat-spinner diameter="20" class="button-spinner"></mat-spinner>
            }
            <mat-icon>refresh</mat-icon>
            Recalcular historial
          </button>
        </mat-card-actions>
      </mat-card>
    </div>
  `,
  styles: [`
    .maintenance-page {
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

    .page-subtitle {
      margin: 8px 0 0 0;
      color: var(--text-secondary);
      font-size: 14px;
    }

    .maintenance-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      margin-bottom: 24px;
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

    mat-card-header {
      margin-bottom: 16px;
    }

    mat-card-title {
      color: var(--text-primary) !important;
    }

    mat-card-subtitle {
      color: var(--text-secondary) !important;
    }

    .info-box {
      display: flex;
      gap: 12px;
      padding: 16px;
      background: var(--bg-tertiary);
      border-radius: 8px;
      align-items: flex-start;

      .info-icon {
        color: var(--brand-accent);
        flex-shrink: 0;
      }

      p {
        margin: 0;
        color: var(--text-secondary);
        font-size: 14px;
        line-height: 1.5;
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

    button mat-icon {
      margin-right: 8px;
    }
  `]
})
export class MaintenanceComponent {
  rebuildingHistory = false;

  constructor(
    private chartService: ChartService,
    private snackBar: MatSnackBar
  ) {}

  rebuildHistory(): void {
    this.rebuildingHistory = true;
    this.chartService.rebuildHistory().subscribe({
      next: (response) => {
        this.rebuildingHistory = false;
        this.showSuccess(`Historial recalculado: ${response.snapshotsCreated} snapshots creados`);
      },
      error: (err) => {
        console.error('Error rebuilding history:', err);
        this.rebuildingHistory = false;
        this.showError('Error al recalcular el historial');
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
