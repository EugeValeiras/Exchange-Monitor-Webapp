import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CredentialsService, ExchangeCredential, ExchangeType } from '../../core/services/credentials.service';
import { CredentialDialogComponent } from './credential-dialog.component';
import { ExchangeLogoComponent } from '../../shared/components/exchange-logo/exchange-logo.component';
import { LogoLoaderComponent } from '../../shared/components/logo-loader/logo-loader.component';

@Component({
  selector: 'app-credentials',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatSnackBarModule,
    MatTooltipModule,
    ExchangeLogoComponent,
    LogoLoaderComponent
  ],
  template: `
    <div class="credentials-container">
      <div class="page-header">
        <div class="header-content">
          <h1>Credentials</h1>
          <p>Administra las conexiones a tus exchanges de criptomonedas</p>
        </div>
        <button mat-raised-button color="primary" (click)="openAddDialog()">
          <mat-icon>add</mat-icon>
          Agregar Exchange
        </button>
      </div>

      @if (loading) {
        <div class="loading-container">
          <app-logo-loader [size]="140" text="Cargando exchanges..."></app-logo-loader>
        </div>
      } @else if (credentials.length === 0) {
        <div class="empty-container">
          <div class="empty-icon">
            <mat-icon>vpn_key</mat-icon>
          </div>
          <h2>No hay exchanges conectados</h2>
          <p>Agrega tu primer exchange para comenzar a sincronizar tus balances</p>
          <button mat-raised-button color="primary" (click)="openAddDialog()">
            <mat-icon>add</mat-icon>
            Agregar Exchange
          </button>
        </div>
      } @else {
        <div class="credentials-grid">
          @for (credential of credentials; track credential.id) {
            <div class="credential-card">
              <div class="card-header">
                <app-exchange-logo [exchange]="credential.exchange" [size]="48"></app-exchange-logo>
                <div class="exchange-info">
                  <span class="exchange-name">{{ getExchangeLabel(credential.exchange) }}</span>
                  <span class="exchange-label">{{ credential.label }}</span>
                </div>
                <button
                  class="status-badge"
                  [class.active]="credential.isActive"
                  [class.inactive]="!credential.isActive"
                  [disabled]="togglingId === credential.id"
                  (click)="toggleActive(credential)"
                  matTooltip="Click para {{ credential.isActive ? 'desactivar' : 'activar' }}">
                  @if (togglingId === credential.id) {
                    <mat-spinner diameter="12"></mat-spinner>
                  } @else {
                    {{ credential.isActive ? 'Activo' : 'Inactivo' }}
                  }
                </button>
              </div>

              <div class="card-content">
                @if (credential.lastSyncAt) {
                  <div class="info-row">
                    <mat-icon>sync</mat-icon>
                    <span class="info-label">Última sincronización</span>
                    <span class="info-value">{{ formatDate(credential.lastSyncAt) }}</span>
                  </div>
                }

                @if (credential.lastError) {
                  <div class="error-container">
                    <div class="error-header">
                      <mat-icon>warning</mat-icon>
                      <span>Error</span>
                    </div>
                    <div class="error-message">{{ credential.lastError }}</div>
                  </div>
                }

                <div class="info-row">
                  <mat-icon>event</mat-icon>
                  <span class="info-label">Creado</span>
                  <span class="info-value">{{ formatDate(credential.createdAt) }}</span>
                </div>
              </div>

              <div class="card-actions">
                <div class="actions-left">
                  @if (credential.exchange === 'nexo-manual') {
                    <button
                      mat-icon-button
                      class="action-btn import"
                      (click)="triggerFileInput(credential)"
                      [disabled]="importingId === credential.id"
                      matTooltip="Importar CSV">
                      @if (importingId === credential.id) {
                        <mat-spinner diameter="20"></mat-spinner>
                      } @else {
                        <mat-icon>upload_file</mat-icon>
                      }
                    </button>
                  } @else {
                    <button
                      mat-icon-button
                      class="action-btn sync"
                      (click)="syncTransactions(credential)"
                      [disabled]="syncingId === credential.id"
                      matTooltip="Sincronizar transacciones">
                      @if (syncingId === credential.id) {
                        <mat-spinner diameter="20"></mat-spinner>
                      } @else {
                        <mat-icon>sync</mat-icon>
                      }
                    </button>
                    <button
                      mat-icon-button
                      class="action-btn test"
                      (click)="testConnection(credential)"
                      [disabled]="testingId === credential.id"
                      matTooltip="Probar conexión">
                      @if (testingId === credential.id) {
                        <mat-spinner diameter="20"></mat-spinner>
                      } @else {
                        <mat-icon>wifi_tethering</mat-icon>
                      }
                    </button>
                  }
                </div>
                <div class="actions-right">
                  <button
                    mat-icon-button
                    class="action-btn edit"
                    (click)="openEditDialog(credential)"
                    matTooltip="Editar">
                    <mat-icon>edit</mat-icon>
                  </button>
                  <button
                    mat-icon-button
                    class="action-btn delete"
                    (click)="deleteCredential(credential)"
                    matTooltip="Eliminar">
                    <mat-icon>delete</mat-icon>
                  </button>
                </div>
              </div>
            </div>
          }
        </div>

        <input type="file" #fileInput hidden accept=".csv,text/csv,application/csv,text/plain" (change)="onFileSelected($event)">
      }
    </div>
  `,
  styles: [`
    .credentials-container {
      padding: 24px;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 32px;
    }

    .header-content h1 {
      margin: 0 0 4px 0;
      font-size: 24px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .header-content p {
      margin: 0;
      color: var(--text-secondary);
      font-size: 14px;
    }

    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: calc(100vh - 200px);
    }

    .empty-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 80px;
      text-align: center;
    }

    .empty-icon {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: var(--bg-tertiary);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 24px;
    }

    .empty-icon mat-icon {
      font-size: 40px;
      width: 40px;
      height: 40px;
      color: var(--text-tertiary);
    }

    .empty-container h2 {
      margin: 0 0 8px 0;
      color: var(--text-primary);
    }

    .empty-container p {
      margin: 0 0 24px 0;
      color: var(--text-secondary);
    }

    .credentials-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
      gap: 20px;
    }

    .credential-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      min-height: 280px;
    }

    .card-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 20px;
      border-bottom: 1px solid var(--border-color);
    }

    .exchange-icon {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 18px;
      flex-shrink: 0;
    }

    .exchange-icon.binance {
      background: #f3ba2f;
      color: #1e2026;
    }

    .exchange-icon.kraken {
      background: #5741d9;
      color: white;
    }

    .exchange-icon.nexo-pro {
      background: #1a4bff;
      color: white;
    }

    .exchange-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .exchange-name {
      font-weight: 600;
      color: var(--text-primary);
      font-size: 16px;
    }

    .exchange-label {
      color: var(--text-secondary);
      font-size: 13px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .status-badge {
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 500;
      border: none;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 70px;
      height: 26px;
    }

    .status-badge:disabled {
      cursor: not-allowed;
      opacity: 0.7;
    }

    .status-badge.active {
      background: rgba(14, 203, 129, 0.15);
      color: var(--color-success);
    }

    .status-badge.active:hover:not(:disabled) {
      background: rgba(14, 203, 129, 0.25);
    }

    .status-badge.inactive {
      background: rgba(132, 142, 156, 0.15);
      color: var(--text-secondary);
    }

    .status-badge.inactive:hover:not(:disabled) {
      background: rgba(132, 142, 156, 0.25);
    }

    .card-content {
      padding: 16px 20px;
      flex: 1;
    }

    .info-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 0;
      font-size: 13px;
    }

    .info-row mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: var(--text-tertiary);
    }

    .info-label {
      color: var(--text-secondary);
    }

    .info-value {
      margin-left: auto;
      color: var(--text-primary);
    }

    .error-container {
      background: rgba(246, 70, 93, 0.08);
      border: 1px solid rgba(246, 70, 93, 0.2);
      border-radius: 8px;
      padding: 12px;
      margin-top: 8px;
    }

    .error-header {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--color-error);
      font-weight: 600;
      font-size: 12px;
      margin-bottom: 8px;
    }

    .error-header mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .error-message {
      font-size: 11px;
      font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
      color: var(--text-secondary);
      background: rgba(0, 0, 0, 0.25);
      border-radius: 6px;
      padding: 8px 10px;
      word-break: break-word;
      white-space: pre-wrap;
      max-height: 80px;
      overflow-y: auto;
      user-select: text;
      line-height: 1.4;
    }

    .card-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      border-top: 1px solid var(--border-color);
      background: var(--bg-elevated);
      margin-top: auto;
    }

    .actions-left, .actions-right {
      display: flex;
      gap: 4px;
    }

    .action-btn {
      color: var(--text-secondary);
      transition: all 0.2s ease;

      mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
      }

      &:hover:not(:disabled) {
        color: var(--text-primary);
        background: var(--bg-hover);
      }

      &:disabled {
        opacity: 0.5;
      }

      &.sync:hover:not(:disabled) {
        color: var(--color-success);
        background: rgba(14, 203, 129, 0.1);
      }

      &.test:hover:not(:disabled) {
        color: var(--brand-accent);
        background: rgba(0, 188, 212, 0.1);
      }

      &.import:hover:not(:disabled) {
        color: #a78bfa;
        background: rgba(167, 139, 250, 0.1);
      }

      &.edit:hover:not(:disabled) {
        color: var(--brand-accent);
        background: rgba(0, 188, 212, 0.1);
      }

      &.delete:hover:not(:disabled) {
        color: var(--color-error);
        background: rgba(246, 70, 93, 0.1);
      }
    }
  `]
})
export class CredentialsComponent implements OnInit {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  credentials: ExchangeCredential[] = [];
  loading = true;
  testingId: string | null = null;
  togglingId: string | null = null;
  importingId: string | null = null;
  syncingId: string | null = null;
  private pendingCredentialId: string | null = null;

  constructor(
    private credentialsService: CredentialsService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadCredentials();
  }

  loadCredentials(): void {
    this.loading = true;
    this.credentialsService.loadCredentials().subscribe({
      next: (credentials) => {
        this.credentials = credentials;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.showError('Error al cargar los exchanges');
      }
    });
  }

  openAddDialog(): void {
    const dialogRef = this.dialog.open(CredentialDialogComponent, {
      width: '480px',
      data: {}
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.credentials = [...this.credentials, result];
        this.showSuccess('Exchange agregado correctamente');
      }
    });
  }

  openEditDialog(credential: ExchangeCredential): void {
    const dialogRef = this.dialog.open(CredentialDialogComponent, {
      width: '480px',
      data: { credential }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.credentials = this.credentials.map(c => c.id === result.id ? result : c);
        this.showSuccess('Exchange actualizado correctamente');
      }
    });
  }

  deleteCredential(credential: ExchangeCredential): void {
    if (!confirm(`¿Estás seguro de eliminar "${credential.label}"?`)) {
      return;
    }

    this.credentialsService.deleteCredential(credential.id).subscribe({
      next: () => {
        this.credentials = this.credentials.filter(c => c.id !== credential.id);
        this.showSuccess('Exchange eliminado correctamente');
      },
      error: () => {
        this.showError('Error al eliminar el exchange');
      }
    });
  }

  testConnection(credential: ExchangeCredential): void {
    this.testingId = credential.id;
    this.credentialsService.testConnection(credential.id).subscribe({
      next: (result) => {
        this.testingId = null;
        if (result.success) {
          this.showSuccess('Conexión exitosa');
        } else {
          this.showError(result.message);
        }
      },
      error: (err) => {
        this.testingId = null;
        this.showError(err.error?.message || 'Error al probar la conexión');
      }
    });
  }

  toggleActive(credential: ExchangeCredential): void {
    this.togglingId = credential.id;
    const newStatus = !credential.isActive;

    this.credentialsService.updateCredential(credential.id, { isActive: newStatus }).subscribe({
      next: (updated) => {
        this.togglingId = null;
        this.credentials = this.credentials.map(c => c.id === updated.id ? updated : c);
        this.showSuccess(newStatus ? 'Exchange activado' : 'Exchange desactivado');
      },
      error: () => {
        this.togglingId = null;
        this.showError('Error al cambiar el estado');
      }
    });
  }

  syncTransactions(credential: ExchangeCredential): void {
    this.syncingId = credential.id;

    this.credentialsService.syncTransactions(credential.id).subscribe({
      next: (result) => {
        this.syncingId = null;
        // Update lastSyncAt locally
        this.credentials = this.credentials.map(c =>
          c.id === credential.id
            ? { ...c, lastSyncAt: new Date().toISOString() }
            : c
        );
        this.showSuccess(result.message);
      },
      error: (err) => {
        this.syncingId = null;
        this.showError(err.error?.message || 'Error al sincronizar');
      }
    });
  }

  getExchangeLabel(exchange: string): string {
    return this.credentialsService.getExchangeLabel(exchange as any);
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  triggerFileInput(credential: ExchangeCredential): void {
    this.pendingCredentialId = credential.id;
    this.fileInput.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file || !this.pendingCredentialId) return;

    this.importingId = this.pendingCredentialId;

    this.credentialsService.importCsv(this.pendingCredentialId, file).subscribe({
      next: (result) => {
        this.importingId = null;
        this.pendingCredentialId = null;
        input.value = '';
        this.showSuccess(`Importado: ${result.imported} transacciones (${result.skipped} duplicados)`);
      },
      error: (err) => {
        this.importingId = null;
        this.pendingCredentialId = null;
        input.value = '';
        this.showError(err.error?.message || 'Error al importar CSV');
      }
    });
  }

  copyError(error: string): void {
    navigator.clipboard.writeText(error).then(() => {
      this.showSuccess('Error copiado al portapapeles');
    });
  }

  private showSuccess(message: string): void {
    this.snackBar.open(message, 'Cerrar', {
      duration: 3000,
      panelClass: 'success-snackbar'
    });
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Cerrar', {
      duration: 5000,
      panelClass: 'error-snackbar'
    });
  }
}
