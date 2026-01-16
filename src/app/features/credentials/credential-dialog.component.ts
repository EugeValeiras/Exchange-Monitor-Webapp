import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ExchangeType, ExchangeCredential, CredentialsService } from '../../core/services/credentials.service';
import { ExchangeLogoComponent } from '../../shared/components/exchange-logo/exchange-logo.component';

export interface CredentialDialogData {
  credential?: ExchangeCredential;
}

@Component({
  selector: 'app-credential-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    ExchangeLogoComponent
  ],
  template: `
    <h2 mat-dialog-title>{{ isEditing ? 'Editar Exchange' : 'Agregar Exchange' }}</h2>

    <mat-dialog-content>
      <form [formGroup]="form" class="credential-form">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Exchange</mat-label>
          <mat-select formControlName="exchange" [disabled]="isEditing">
            <mat-select-trigger>
              @if (form.get('exchange')?.value) {
                <div class="selected-exchange">
                  <app-exchange-logo [exchange]="form.get('exchange')?.value" [size]="24"></app-exchange-logo>
                  <span>{{ getExchangeLabel(form.get('exchange')?.value) }}</span>
                </div>
              }
            </mat-select-trigger>
            @for (exchange of exchanges; track exchange.value) {
              <mat-option [value]="exchange.value">
                <div class="exchange-option">
                  <app-exchange-logo [exchange]="exchange.value" [size]="28"></app-exchange-logo>
                  <span>{{ exchange.label }}</span>
                </div>
              </mat-option>
            }
          </mat-select>
          @if (form.get('exchange')?.hasError('required') && form.get('exchange')?.touched) {
            <mat-error>Selecciona un exchange</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Nombre / Etiqueta</mat-label>
          <input matInput formControlName="label" placeholder="Mi cuenta principal">
          @if (form.get('label')?.hasError('required') && form.get('label')?.touched) {
            <mat-error>El nombre es requerido</mat-error>
          }
        </mat-form-field>

        @if (showApiFields) {
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>API Key</mat-label>
            <input matInput formControlName="apiKey" [type]="hideApiKey ? 'password' : 'text'">
            <button mat-icon-button matSuffix (click)="hideApiKey = !hideApiKey" type="button">
              <mat-icon>{{ hideApiKey ? 'visibility_off' : 'visibility' }}</mat-icon>
            </button>
            @if (form.get('apiKey')?.hasError('required') && form.get('apiKey')?.touched) {
              <mat-error>La API Key es requerida</mat-error>
            }
            <mat-hint>{{ isEditing ? 'Dejar vacío para mantener el valor actual' : '' }}</mat-hint>
          </mat-form-field>

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>API Secret</mat-label>
            <input matInput formControlName="apiSecret" [type]="hideApiSecret ? 'password' : 'text'">
            <button mat-icon-button matSuffix (click)="hideApiSecret = !hideApiSecret" type="button">
              <mat-icon>{{ hideApiSecret ? 'visibility_off' : 'visibility' }}</mat-icon>
            </button>
            @if (form.get('apiSecret')?.hasError('required') && form.get('apiSecret')?.touched) {
              <mat-error>El API Secret es requerido</mat-error>
            }
            <mat-hint>{{ isEditing ? 'Dejar vacío para mantener el valor actual' : '' }}</mat-hint>
          </mat-form-field>
        }

        @if (isNexoManual && !isEditing) {
          <div class="nexo-manual-info">
            <mat-icon>info</mat-icon>
            <span>Nexo no requiere credenciales API. Después de crear la cuenta, podrás importar tus transacciones desde un archivo CSV.</span>
          </div>
        }

        @if (showPassphrase) {
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Passphrase (opcional)</mat-label>
            <input matInput formControlName="passphrase" [type]="hidePassphrase ? 'password' : 'text'">
            <button mat-icon-button matSuffix (click)="hidePassphrase = !hidePassphrase" type="button">
              <mat-icon>{{ hidePassphrase ? 'visibility_off' : 'visibility' }}</mat-icon>
            </button>
            <mat-hint>Solo requerido para algunos exchanges como Kraken</mat-hint>
          </mat-form-field>
        }

        @if (error) {
          <div class="error-message">{{ error }}</div>
        }
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">Cancelar</button>
      <button mat-raised-button color="primary" (click)="onSubmit()" [disabled]="loading || form.invalid">
        @if (loading) {
          <mat-spinner diameter="20"></mat-spinner>
        } @else {
          {{ isEditing ? 'Guardar' : 'Agregar' }}
        }
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .credential-form {
      display: flex;
      flex-direction: column;
      min-width: 400px;
      padding-top: 8px;
    }

    .full-width {
      width: 100%;
      margin-bottom: 8px;
    }

    .error-message {
      color: #f44336;
      margin: 8px 0;
      text-align: center;
    }

    mat-dialog-content {
      max-height: 70vh;
    }

    .selected-exchange {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .exchange-option {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 4px 0;
    }

    .exchange-option span {
      font-size: 14px;
    }

    ::ng-deep .mat-mdc-option {
      min-height: 48px !important;
    }

    .nexo-manual-info {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 12px;
      background: rgba(13, 115, 119, 0.1);
      border-radius: 8px;
      margin-bottom: 16px;
      font-size: 13px;
      color: var(--text-secondary);

      mat-icon {
        color: #0D7377;
        flex-shrink: 0;
        font-size: 20px;
        width: 20px;
        height: 20px;
      }
    }
  `]
})
export class CredentialDialogComponent {
  form: FormGroup;
  isEditing: boolean;
  loading = false;
  error = '';
  hideApiKey = true;
  hideApiSecret = true;
  hidePassphrase = true;

  exchanges = [
    { value: ExchangeType.BINANCE, label: 'Binance' },
    { value: ExchangeType.KRAKEN, label: 'Kraken' },
    { value: ExchangeType.NEXO_PRO, label: 'Nexo Pro' },
    { value: ExchangeType.NEXO_MANUAL, label: 'Nexo (CSV)' }
  ];

  constructor(
    private fb: FormBuilder,
    private credentialsService: CredentialsService,
    private dialogRef: MatDialogRef<CredentialDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: CredentialDialogData
  ) {
    this.isEditing = !!data?.credential;

    this.form = this.fb.group({
      exchange: [data?.credential?.exchange || '', Validators.required],
      label: [data?.credential?.label || '', Validators.required],
      apiKey: ['', this.isEditing ? [] : Validators.required],
      apiSecret: ['', this.isEditing ? [] : Validators.required],
      passphrase: ['']
    });

    // Update validators when exchange changes
    this.form.get('exchange')?.valueChanges.subscribe(exchange => {
      const apiKeyControl = this.form.get('apiKey');
      const apiSecretControl = this.form.get('apiSecret');

      if (exchange === ExchangeType.NEXO_MANUAL) {
        apiKeyControl?.clearValidators();
        apiSecretControl?.clearValidators();
      } else if (!this.isEditing) {
        apiKeyControl?.setValidators(Validators.required);
        apiSecretControl?.setValidators(Validators.required);
      }

      apiKeyControl?.updateValueAndValidity();
      apiSecretControl?.updateValueAndValidity();
    });
  }

  get showPassphrase(): boolean {
    const exchange = this.form.get('exchange')?.value;
    return exchange === ExchangeType.KRAKEN;
  }

  get isNexoManual(): boolean {
    return this.form.get('exchange')?.value === ExchangeType.NEXO_MANUAL;
  }

  get showApiFields(): boolean {
    return !this.isNexoManual;
  }

  getExchangeLabel(value: string): string {
    const exchange = this.exchanges.find(e => e.value === value);
    return exchange?.label || value;
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onSubmit(): void {
    if (this.form.invalid) return;

    this.loading = true;
    this.error = '';

    const formValue = this.form.value;

    if (this.isEditing) {
      const updateData: any = { label: formValue.label };
      if (formValue.apiKey) updateData.apiKey = formValue.apiKey;
      if (formValue.apiSecret) updateData.apiSecret = formValue.apiSecret;
      if (formValue.passphrase) updateData.passphrase = formValue.passphrase;

      this.credentialsService.updateCredential(this.data.credential!.id, updateData).subscribe({
        next: (credential) => {
          this.dialogRef.close(credential);
        },
        error: (err) => {
          this.loading = false;
          this.error = err.error?.message || 'Error al actualizar el exchange';
        }
      });
    } else {
      this.credentialsService.createCredential(formValue).subscribe({
        next: (credential) => {
          this.dialogRef.close(credential);
        },
        error: (err) => {
          this.loading = false;
          this.error = err.error?.message || 'Error al agregar el exchange';
        }
      });
    }
  }
}
