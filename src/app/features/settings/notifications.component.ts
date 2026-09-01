import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { NotificationsService } from '../../core/services/notifications.service';
import { ConsolidatedBalanceService } from '../../core/services/consolidated-balance.service';

@Component({
  selector: 'app-notifications-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatCheckboxModule,
  ],
  template: `
    <div class="notifications-page">
      <div class="page-header">
        <h1>Notificaciones</h1>
        <p class="page-subtitle">Configura las alertas push de cambio de precio</p>
      </div>

      @if (loading) {
        <div class="loading-state">
          <mat-spinner diameter="32"></mat-spinner>
        </div>
      } @else {
        <form [formGroup]="form" (ngSubmit)="save()">
          <!-- Price change notifications card -->
          <mat-card class="settings-card">
            <mat-card-header>
              <mat-icon mat-card-avatar class="card-icon">notifications_active</mat-icon>
              <mat-card-title>Cambio de precio</mat-card-title>
              <mat-card-subtitle>Recibe una push cuando un activo se mueve significativamente</mat-card-subtitle>
            </mat-card-header>

            <mat-card-content>
              <div class="toggle-row">
                <div class="toggle-text">
                  <span class="toggle-label">Notificaciones de cambio de precio</span>
                  <span class="toggle-hint">Si lo desactivas, no recibiras ninguna alerta de precio.</span>
                </div>
                <mat-slide-toggle formControlName="enabled"></mat-slide-toggle>
              </div>

              <mat-form-field appearance="outline" class="threshold-field">
                <mat-label>Umbral de cambio (%)</mat-label>
                <input matInput type="number" formControlName="priceChangeThreshold" min="1" max="50" step="1">
                <span matTextSuffix>%</span>
                <mat-hint>Aplica a alertas de tus activos favoritos (entre 1 y 50).</mat-hint>
                @if (form.get('priceChangeThreshold')?.hasError('required') || form.get('priceChangeThreshold')?.hasError('min') || form.get('priceChangeThreshold')?.hasError('max')) {
                  <mat-error>Ingresa un valor entre 1 y 50</mat-error>
                }
              </mat-form-field>
            </mat-card-content>
          </mat-card>

          <!-- Assets card -->
          <mat-card class="settings-card">
            <mat-card-header>
              <mat-icon mat-card-avatar class="card-icon">tune</mat-icon>
              <mat-card-title>Activos</mat-card-title>
              <mat-card-subtitle>De cuáles querés que te avisen</mat-card-subtitle>
            </mat-card-header>

            <mat-card-content>
              @if (assetRows().length === 0) {
                <p class="assets-empty">Cuando cargue tu cartera vas a poder elegir acá.</p>
              } @else {
                <div class="assets-grid">
                  @for (row of assetRows(); track row.asset) {
                    <mat-checkbox
                      [checked]="alertAssets.has(row.asset)"
                      (change)="toggleAsset(row.asset, $event.checked)">
                      <span class="asset-ticker">{{ row.asset }}</span>
                      <span class="asset-value">{{ row.label }}</span>
                    </mat-checkbox>
                  }
                </div>
                <p class="assets-hint">
                  @if (alertAssets.size === 0) {
                    Sin ningún activo elegido no llega ningún aviso.
                  } @else {
                    Sólo avisamos de los activos marcados ({{ alertAssets.size }} de {{ assetRows().length }}).
                  }
                </p>
              }
            </mat-card-content>
          </mat-card>

          <!-- Quiet hours card -->
          <mat-card class="settings-card">
            <mat-card-header>
              <mat-icon mat-card-avatar class="card-icon">bedtime</mat-icon>
              <mat-card-title>Horario sin molestias</mat-card-title>
              <mat-card-subtitle>Opcional: silencia las notificaciones en un rango horario</mat-card-subtitle>
            </mat-card-header>

            <mat-card-content>
              <div class="quiet-hours-row">
                <mat-form-field appearance="outline">
                  <mat-label>Desde</mat-label>
                  <input matInput type="time" formControlName="quietHoursStart">
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>Hasta</mat-label>
                  <input matInput type="time" formControlName="quietHoursEnd">
                </mat-form-field>
              </div>
            </mat-card-content>
          </mat-card>

          <div class="actions">
            <button mat-raised-button color="primary" type="submit" [disabled]="saving || form.invalid">
              @if (saving) {
                <mat-spinner diameter="20" class="button-spinner"></mat-spinner>
              }
              <mat-icon>save</mat-icon>
              Guardar
            </button>
          </div>
        </form>
      }
    </div>
  `,
  styles: [`
    .notifications-page {
      padding: 24px;
      max-width: 900px;
      margin: 0 auto;
    }

    @media (max-width: 900px) {
      .notifications-page {
        padding: 12px;
      }
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

    .loading-state {
      display: flex;
      justify-content: center;
      padding: 48px 0;
    }

    .settings-card {
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

    .toggle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 12px 0 20px;
    }

    .toggle-text {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .toggle-label {
      color: var(--text-primary);
      font-size: 15px;
      font-weight: 500;
    }

    .toggle-hint {
      color: var(--text-secondary);
      font-size: 13px;
    }

    .threshold-field {
      width: 100%;
      max-width: 280px;
    }

    .quiet-hours-row {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }

    .quiet-hours-row mat-form-field {
      flex: 1;
      min-width: 140px;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
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

    .assets-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 8px 16px;
    }

    .asset-ticker {
      font-weight: 500;
    }

    .asset-value {
      margin-left: 8px;
      opacity: 0.6;
      font-size: 12px;
    }

    .assets-hint,
    .assets-empty {
      margin: 16px 0 0;
      font-size: 12px;
      opacity: 0.7;
    }
  `]
})
export class NotificationsSettingsComponent implements OnInit {
  form: FormGroup;
  loading = true;
  saving = false;

  /// Activos elegidos. Va aparte del form porque no es un control: es una
  /// selección sobre una lista que sale de la cartera, no un campo fijo.
  alertAssets = new Set<string>();

  constructor(
    private fb: FormBuilder,
    private notificationsService: NotificationsService,
    private balanceService: ConsolidatedBalanceService,
    private snackBar: MatSnackBar
  ) {
    this.form = this.fb.group({
      enabled: [false],
      priceChangeThreshold: [5, [Validators.required, Validators.min(1), Validators.max(50)]],
      quietHoursStart: [''],
      quietHoursEnd: [''],
    });
  }

  ngOnInit(): void {
    this.notificationsService.getSettings().subscribe({
      next: (settings) => {
        this.form.patchValue({
          enabled: settings.enabled,
          priceChangeThreshold: settings.priceChangeThreshold,
          quietHoursStart: settings.quietHoursStart ?? '',
          quietHoursEnd: settings.quietHoursEnd ?? '',
        });
        this.alertAssets = new Set(
          (settings.alertAssets ?? []).map((a) => a.toUpperCase()),
        );
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading notification settings:', err);
        this.loading = false;
        this.showError('No se pudieron cargar las preferencias de notificaciones');
      }
    });
  }

  save(): void {
    if (this.form.invalid) {
      return;
    }

    this.saving = true;
    const raw = this.form.value;
    const payload = {
      enabled: raw.enabled,
      priceChangeThreshold: Number(raw.priceChangeThreshold),
      ...(raw.quietHoursStart ? { quietHoursStart: raw.quietHoursStart } : {}),
      ...(raw.quietHoursEnd ? { quietHoursEnd: raw.quietHoursEnd } : {}),
      alertAssets: [...this.alertAssets],
    };

    this.notificationsService.updateSettings(payload).subscribe({
      next: () => {
        this.saving = false;
        this.showSuccess('Preferencias de notificaciones guardadas');
      },
      error: (err) => {
        console.error('Error saving notification settings:', err);
        this.saving = false;
        this.showError('Error al guardar las preferencias');
      }
    });
  }

  /**
   * Qué se puede elegir: tu cartera, más lo que ya estuviera elegido aunque hoy
   * no tengas saldo. Sin esa segunda parte, vender todo de un activo borraría
   * en silencio una elección tuya.
   */
  assetRows(): { asset: string; label: string }[] {
    const held = this.balanceService.balance()?.byAsset ?? [];
    const rows = held.map((a) => ({
      asset: a.asset.toUpperCase(),
      label: a.valueUsd == null ? '' : this.formatUsd(a.valueUsd),
    }));

    const tickers = new Set(rows.map((r) => r.asset));
    const orphans = [...this.alertAssets]
      .filter((a) => !tickers.has(a))
      .sort()
      .map((asset) => ({ asset, label: 'sin saldo' }));

    return [...rows, ...orphans];
  }

  toggleAsset(asset: string, checked: boolean): void {
    if (checked) {
      this.alertAssets.add(asset);
    } else {
      this.alertAssets.delete(asset);
    }
  }

  private formatUsd(value: number): string {
    return value.toLocaleString('es-AR', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
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
