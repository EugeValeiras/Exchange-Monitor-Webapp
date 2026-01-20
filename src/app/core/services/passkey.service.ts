import { Injectable, signal, computed } from '@angular/core';
import { Observable, from, tap, switchMap, catchError, of, throwError } from 'rxjs';
import { startRegistration, startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { ApiService } from './api.service';

export interface PasskeyCredential {
  id: string;
  deviceName: string;
  createdAt: string;
  lastUsedAt?: string;
}

export interface PasskeyListResponse {
  passkeys: PasskeyCredential[];
}

export interface RegistrationChallengeResponse {
  options: any; // PublicKeyCredentialCreationOptionsJSON from server
  challenge: string;
}

export interface AuthenticationChallengeResponse {
  options: any; // PublicKeyCredentialRequestOptionsJSON from server
  challenge: string;
}

export interface TokenResponse {
  accessToken: string;
  expiresIn: string;
  tokenType: string;
}

@Injectable({
  providedIn: 'root'
})
export class PasskeyService {
  private passkeysSignal = signal<PasskeyCredential[]>([]);
  private loadingSignal = signal(false);
  private errorSignal = signal<string | null>(null);

  passkeys = this.passkeysSignal.asReadonly();
  loading = this.loadingSignal.asReadonly();
  error = this.errorSignal.asReadonly();
  isSupported = computed(() => browserSupportsWebAuthn());
  hasPasskeys = computed(() => this.passkeysSignal().length > 0);

  constructor(private api: ApiService) {}

  loadPasskeys(): Observable<PasskeyCredential[]> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    return this.api.get<PasskeyListResponse>('/auth/passkey/list').pipe(
      tap(response => {
        this.passkeysSignal.set(response.passkeys);
        this.loadingSignal.set(false);
      }),
      switchMap(response => of(response.passkeys)),
      catchError(err => {
        this.errorSignal.set(err.error?.message || 'Error al cargar passkeys');
        this.loadingSignal.set(false);
        return of([]);
      })
    );
  }

  registerPasskey(deviceName?: string): Observable<boolean> {
    if (!this.isSupported()) {
      this.errorSignal.set('Tu navegador no soporta passkeys');
      return of(false);
    }

    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    return this.api.post<RegistrationChallengeResponse>('/auth/passkey/register/challenge', {}).pipe(
      switchMap(challengeResponse => {
        return from(startRegistration({ optionsJSON: challengeResponse.options })).pipe(
          switchMap(credential => {
            return this.api.post<{ success: boolean }>('/auth/passkey/register/verify', {
              response: credential,
              deviceName: deviceName || this.getDeviceName()
            });
          })
        );
      }),
      switchMap(verifyResponse => {
        if (verifyResponse.success) {
          return this.loadPasskeys().pipe(switchMap(() => of(true)));
        }
        return of(false);
      }),
      tap({
        next: () => this.loadingSignal.set(false),
        error: () => this.loadingSignal.set(false)
      }),
      catchError(err => {
        this.loadingSignal.set(false);
        if (err.name === 'NotAllowedError') {
          this.errorSignal.set('Registro cancelado por el usuario');
        } else if (err.name === 'InvalidStateError') {
          this.errorSignal.set('Este dispositivo ya tiene un passkey registrado');
        } else {
          this.errorSignal.set(err.error?.message || err.message || 'Error al registrar passkey');
        }
        return of(false);
      })
    );
  }

  authenticateWithPasskey(email?: string): Observable<TokenResponse> {
    if (!this.isSupported()) {
      return throwError(() => new Error('Tu navegador no soporta passkeys'));
    }

    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    // If email is provided, use traditional flow; otherwise use discoverable credentials
    const challengeBody = email ? { email } : {};

    return this.api.post<AuthenticationChallengeResponse>('/auth/passkey/authenticate/challenge', challengeBody).pipe(
      switchMap(challengeResponse => {
        return from(startAuthentication({ optionsJSON: challengeResponse.options })).pipe(
          switchMap(credential => {
            const verifyBody = email
              ? { email, response: credential }
              : { response: credential };
            return this.api.post<TokenResponse>('/auth/passkey/authenticate/verify', verifyBody);
          })
        );
      }),
      tap({
        next: () => this.loadingSignal.set(false),
        error: () => this.loadingSignal.set(false)
      }),
      catchError(err => {
        this.loadingSignal.set(false);
        if (err.name === 'NotAllowedError') {
          this.errorSignal.set('Autenticacion cancelada por el usuario');
        } else {
          this.errorSignal.set(err.error?.message || err.message || 'Error de autenticacion');
        }
        return throwError(() => err);
      })
    );
  }

  deletePasskey(credentialId: string): Observable<boolean> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    const encodedId = encodeURIComponent(credentialId);
    return this.api.delete<{ success: boolean }>(`/auth/passkey/${encodedId}`).pipe(
      tap(response => {
        if (response.success) {
          this.passkeysSignal.update(passkeys =>
            passkeys.filter(p => p.id !== credentialId)
          );
        }
        this.loadingSignal.set(false);
      }),
      switchMap(response => of(response.success)),
      catchError(err => {
        this.errorSignal.set(err.error?.message || 'Error al eliminar passkey');
        this.loadingSignal.set(false);
        return of(false);
      })
    );
  }

  clearError(): void {
    this.errorSignal.set(null);
  }

  private getDeviceName(): string {
    const ua = navigator.userAgent;
    if (ua.includes('Chrome')) return 'Chrome Browser';
    if (ua.includes('Firefox')) return 'Firefox Browser';
    if (ua.includes('Safari')) return 'Safari Browser';
    if (ua.includes('Edge')) return 'Edge Browser';
    return 'Web Browser';
  }
}
