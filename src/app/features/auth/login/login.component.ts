import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../../core/services/auth.service';
import { LogoLoaderComponent } from '../../../shared/components/logo-loader/logo-loader.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    LogoLoaderComponent
  ],
  template: `
    <div class="auth-container">
      <div class="auth-card">
        <div class="auth-header">
          <app-logo-loader [size]="64" [showText]="false" [float]="false"></app-logo-loader>
          <h1>Exchange Monitor</h1>
          <p>Inicia sesión en tu cuenta</p>
        </div>

        <form [formGroup]="loginForm" (ngSubmit)="onSubmit()" class="auth-form">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Email</mat-label>
            <input matInput formControlName="email" type="email" placeholder="tu@email.com">
            <mat-icon matPrefix>email</mat-icon>
            @if (loginForm.get('email')?.hasError('required') && loginForm.get('email')?.touched) {
              <mat-error>El email es requerido</mat-error>
            }
            @if (loginForm.get('email')?.hasError('email') && loginForm.get('email')?.touched) {
              <mat-error>Email inválido</mat-error>
            }
          </mat-form-field>

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Contraseña</mat-label>
            <input matInput formControlName="password" [type]="hidePassword ? 'password' : 'text'">
            <mat-icon matPrefix>lock</mat-icon>
            <button mat-icon-button matSuffix (click)="hidePassword = !hidePassword" type="button">
              <mat-icon>{{hidePassword ? 'visibility_off' : 'visibility'}}</mat-icon>
            </button>
            @if (loginForm.get('password')?.hasError('required') && loginForm.get('password')?.touched) {
              <mat-error>La contraseña es requerida</mat-error>
            }
          </mat-form-field>

          @if (error) {
            <div class="error-message">
              <mat-icon>error_outline</mat-icon>
              {{ error }}
            </div>
          }

          <button mat-raised-button color="primary" type="submit" class="submit-btn" [disabled]="loading || loginForm.invalid">
            @if (loading) {
              <mat-spinner diameter="20"></mat-spinner>
            } @else {
              Iniciar sesión
            }
          </button>
        </form>

        <div class="auth-footer">
          <span>¿No tienes cuenta?</span>
          <a routerLink="/register">Regístrate aquí</a>
        </div>
      </div>

      <div class="auth-decoration">
        <div class="decoration-content">
          <h2>Gestiona tus criptomonedas</h2>
          <p>Conecta múltiples exchanges y visualiza todos tus activos en un solo lugar.</p>
          <div class="features">
            <div class="feature">
              <mat-icon>insights</mat-icon>
              <span>Balances consolidados</span>
            </div>
            <div class="feature">
              <mat-icon>history</mat-icon>
              <span>Historial de transacciones</span>
            </div>
            <div class="feature">
              <mat-icon>security</mat-icon>
              <span>Credenciales encriptadas</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .auth-container {
      display: flex;
      min-height: 100vh;
      background: var(--bg-primary);
    }

    .auth-card {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 48px;
      max-width: 480px;
    }

    .auth-header {
      text-align: center;
      margin-bottom: 32px;
    }

    .auth-header app-logo-loader {
      margin-bottom: 16px;
    }

    .auth-header h1 {
      margin: 0 0 8px 0;
      font-size: 28px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .auth-header p {
      margin: 0;
      color: var(--text-secondary);
      font-size: 16px;
    }

    .auth-form {
      display: flex;
      flex-direction: column;
    }

    .full-width {
      width: 100%;
      margin-bottom: 8px;
    }

    .error-message {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      background: rgba(246, 70, 93, 0.1);
      border: 1px solid rgba(246, 70, 93, 0.3);
      border-radius: 8px;
      color: var(--color-error);
      margin-bottom: 16px;
      font-size: 14px;
    }

    .error-message mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .submit-btn {
      height: 48px;
      font-size: 16px;
      font-weight: 500;
      margin-top: 8px;
    }

    .auth-footer {
      text-align: center;
      margin-top: 24px;
      color: var(--text-secondary);
    }

    .auth-footer a {
      color: var(--brand-accent);
      margin-left: 4px;
      font-weight: 500;
    }

    .auth-decoration {
      flex: 1;
      background: linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-primary-dark) 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 48px;
    }

    .decoration-content {
      max-width: 400px;
      color: white;
    }

    .decoration-content h2 {
      font-size: 32px;
      font-weight: 600;
      margin: 0 0 16px 0;
    }

    .decoration-content p {
      font-size: 16px;
      opacity: 0.9;
      margin: 0 0 32px 0;
      line-height: 1.6;
    }

    .features {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .feature {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 15px;
    }

    .feature mat-icon {
      width: 24px;
      height: 24px;
      color: var(--brand-accent);
    }

    @media (max-width: 900px) {
      .auth-decoration {
        display: none;
      }

      .auth-card {
        max-width: 100%;
      }
    }
  `]
})
export class LoginComponent {
  loginForm: FormGroup;
  hidePassword = true;
  loading = false;
  error = '';

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required]
    });
  }

  onSubmit(): void {
    if (this.loginForm.invalid) return;

    this.loading = true;
    this.error = '';

    this.authService.login(this.loginForm.value).subscribe({
      next: () => {
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.loading = false;
        this.error = err.error?.message || 'Error al iniciar sesión';
      }
    });
  }
}
