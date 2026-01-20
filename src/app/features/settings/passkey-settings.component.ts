import { Component, inject, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PasskeyService, PasskeyCredential } from '../../core/services/passkey.service';

@Component({
  selector: 'app-passkey-settings',
  standalone: true,
  imports: [
    CommonModule,
    DatePipe,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule
  ],
  template: `
    <div class="passkey-container">
      <!-- Info Section -->
      <div class="info-section">
        <div class="info-icon-wrapper">
          <mat-icon class="info-icon">fingerprint</mat-icon>
        </div>
        <div class="info-content">
          <h3>Que son los Passkeys?</h3>
          <p>
            Los passkeys te permiten iniciar sesion usando huella dactilar,
            Face ID o Windows Hello, sin necesidad de recordar tu contrasena.
            Son mas seguros y faciles de usar.
          </p>
        </div>
      </div>

      <!-- Warning if not supported -->
      @if (!passkeyService.isSupported()) {
        <div class="alert alert-warning">
          <mat-icon>warning</mat-icon>
          <span>Tu navegador no soporta passkeys</span>
        </div>
      }

      <!-- Error message -->
      @if (passkeyService.error()) {
        <div class="alert alert-error">
          <mat-icon>error_outline</mat-icon>
          <span>{{ passkeyService.error() }}</span>
          <button class="alert-close" (click)="passkeyService.clearError()">
            <mat-icon>close</mat-icon>
          </button>
        </div>
      }

      <!-- Passkeys Section -->
      <div class="passkeys-section">
        <div class="section-header">
          <h3>Tus Passkeys</h3>
          <span class="badge">{{ passkeyService.passkeys().length }}</span>
        </div>

        @if (passkeyService.loading() && passkeyService.passkeys().length === 0) {
          <div class="loading-state">
            <mat-spinner diameter="32"></mat-spinner>
          </div>
        } @else if (passkeyService.passkeys().length === 0) {
          <div class="empty-state">
            <mat-icon>key_off</mat-icon>
            <p>No tienes passkeys registrados</p>
            <span>Agrega uno para iniciar sesion sin contrasena</span>
          </div>
        } @else {
          <div class="passkeys-list">
            @for (passkey of passkeyService.passkeys(); track passkey.id) {
              <div class="passkey-item">
                <div class="passkey-icon">
                  <mat-icon>key</mat-icon>
                </div>
                <div class="passkey-info">
                  <span class="passkey-name">{{ passkey.deviceName }}</span>
                  <span class="passkey-date">Creado: {{ passkey.createdAt | date:'dd/MM/yyyy HH:mm' }}</span>
                  @if (passkey.lastUsedAt) {
                    <span class="passkey-date">Ultimo uso: {{ passkey.lastUsedAt | date:'dd/MM/yyyy HH:mm' }}</span>
                  }
                </div>
                <button class="delete-btn" (click)="deletePasskey(passkey)" [disabled]="passkeyService.loading()">
                  <mat-icon>delete_outline</mat-icon>
                </button>
              </div>
            }
          </div>
        }

        <!-- Add button -->
        <button class="add-passkey-btn"
                (click)="addPasskey()"
                [disabled]="!passkeyService.isSupported() || passkeyService.loading()">
          @if (passkeyService.loading()) {
            <mat-spinner diameter="20"></mat-spinner>
            <span>Registrando...</span>
          } @else {
            <mat-icon>add</mat-icon>
            <span>Agregar Passkey</span>
          }
        </button>
      </div>
    </div>
  `,
  styles: [`
    .passkey-container {
      max-width: 600px;
      margin: 0 auto;
      padding: 24px;
    }

    /* Info Section */
    .info-section {
      display: flex;
      gap: 16px;
      padding: 20px;
      background: var(--bg-card);
      border-radius: 12px;
      border: 1px solid var(--border-color);
      margin-bottom: 24px;
    }

    .info-icon-wrapper {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      background: rgba(0, 184, 212, 0.1);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .info-icon {
      font-size: 28px;
      width: 28px;
      height: 28px;
      color: var(--brand-accent);
    }

    .info-content h3 {
      margin: 0 0 8px 0;
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .info-content p {
      margin: 0;
      font-size: 14px;
      color: var(--text-secondary);
      line-height: 1.5;
    }

    /* Alerts */
    .alert {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 24px;
      font-size: 14px;
    }

    .alert mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .alert-warning {
      background: rgba(255, 193, 7, 0.1);
      border: 1px solid rgba(255, 193, 7, 0.3);
      color: #ffc107;
    }

    .alert-error {
      background: rgba(246, 70, 93, 0.1);
      border: 1px solid rgba(246, 70, 93, 0.3);
      color: #f6465d;
    }

    .alert-close {
      margin-left: auto;
      background: none;
      border: none;
      color: inherit;
      cursor: pointer;
      padding: 4px;
      display: flex;
      opacity: 0.7;
    }

    .alert-close:hover {
      opacity: 1;
    }

    /* Passkeys Section */
    .passkeys-section {
      background: var(--bg-card);
      border-radius: 12px;
      border: 1px solid var(--border-color);
      overflow: hidden;
    }

    .section-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border-color);
    }

    .section-header h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .badge {
      background: var(--bg-elevated);
      color: var(--text-secondary);
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 13px;
      font-weight: 500;
    }

    /* Loading & Empty States */
    .loading-state,
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px 24px;
      text-align: center;
    }

    .empty-state mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: var(--text-tertiary);
      margin-bottom: 16px;
    }

    .empty-state p {
      margin: 0;
      font-size: 16px;
      color: var(--text-secondary);
    }

    .empty-state span {
      margin-top: 4px;
      font-size: 14px;
      color: var(--text-tertiary);
    }

    /* Passkeys List */
    .passkeys-list {
      padding: 8px 0;
    }

    .passkey-item {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px 20px;
      transition: background 0.15s ease;
    }

    .passkey-item:hover {
      background: rgba(255, 255, 255, 0.02);
    }

    .passkey-icon {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: rgba(0, 184, 212, 0.1);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .passkey-icon mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
      color: var(--brand-accent);
    }

    .passkey-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .passkey-name {
      font-size: 15px;
      font-weight: 500;
      color: var(--text-primary);
    }

    .passkey-date {
      font-size: 12px;
      color: var(--text-tertiary);
    }

    .delete-btn {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      border: none;
      background: transparent;
      color: var(--text-tertiary);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
      flex-shrink: 0;
    }

    .delete-btn:hover:not(:disabled) {
      background: rgba(246, 70, 93, 0.1);
      color: #f6465d;
    }

    .delete-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .delete-btn mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    /* Add Button */
    .add-passkey-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: calc(100% - 32px);
      margin: 16px;
      padding: 12px 24px;
      border: none;
      border-radius: 8px;
      background: var(--brand-accent);
      color: #000;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .add-passkey-btn:hover:not(:disabled) {
      background: #00d4ff;
    }

    .add-passkey-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .add-passkey-btn mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .add-passkey-btn mat-spinner {
      display: inline-block;
    }

    ::ng-deep .add-passkey-btn mat-spinner circle {
      stroke: #000 !important;
    }
  `]
})
export class PasskeySettingsComponent implements OnInit {
  passkeyService = inject(PasskeyService);
  private snackBar = inject(MatSnackBar);

  ngOnInit(): void {
    this.passkeyService.loadPasskeys().subscribe();
  }

  addPasskey(): void {
    const deviceName = prompt('Nombre del dispositivo (ej: Chrome en MacBook):', this.getDefaultDeviceName());
    if (deviceName === null) return;

    this.passkeyService.registerPasskey(deviceName || this.getDefaultDeviceName()).subscribe({
      next: (success) => {
        if (success) {
          this.snackBar.open('Passkey registrado correctamente', 'OK', {
            duration: 3000,
            panelClass: 'success-snackbar'
          });
        }
      }
    });
  }

  deletePasskey(passkey: PasskeyCredential): void {
    const confirmed = confirm(`Deseas eliminar el passkey "${passkey.deviceName}"?\n\nNo podras usar este dispositivo para iniciar sesion sin contrasena.`);
    if (!confirmed) return;

    this.passkeyService.deletePasskey(passkey.id).subscribe({
      next: (success) => {
        if (success) {
          this.snackBar.open('Passkey eliminado', 'OK', {
            duration: 3000,
            panelClass: 'success-snackbar'
          });
        }
      }
    });
  }

  private getDefaultDeviceName(): string {
    const ua = navigator.userAgent;
    if (ua.includes('Chrome')) return 'Chrome Browser';
    if (ua.includes('Firefox')) return 'Firefox Browser';
    if (ua.includes('Safari')) return 'Safari Browser';
    if (ua.includes('Edge')) return 'Edge Browser';
    return 'Web Browser';
  }
}
