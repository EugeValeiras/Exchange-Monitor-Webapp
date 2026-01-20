import { Injectable, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap, switchMap } from 'rxjs';
import { ApiService } from './api.service';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface TokenResponse {
  accessToken: string;
  expiresIn: string;
  tokenType: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly TOKEN_KEY = 'auth_token';
  private readonly USER_KEY = 'auth_user';

  private userSignal = signal<User | null>(this.loadUser());

  user = this.userSignal.asReadonly();
  isAuthenticated = computed(() => !!this.userSignal());

  constructor(
    private api: ApiService,
    private router: Router
  ) {}

  login(credentials: LoginRequest): Observable<User> {
    return this.api.post<TokenResponse>('/auth/login', credentials).pipe(
      tap(response => {
        this.saveToken(response.accessToken);
      }),
      switchMap(() => this.loadCurrentUser())
    );
  }

  register(data: RegisterRequest): Observable<User> {
    return this.api.post<TokenResponse>('/auth/register', data).pipe(
      tap(response => {
        this.saveToken(response.accessToken);
      }),
      switchMap(() => this.loadCurrentUser())
    );
  }

  logout(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    this.userSignal.set(null);
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  private saveToken(token: string): void {
    localStorage.setItem(this.TOKEN_KEY, token);
  }

  private loadUser(): User | null {
    const userJson = localStorage.getItem(this.USER_KEY);
    return userJson ? JSON.parse(userJson) : null;
  }

  private loadCurrentUser(): Observable<User> {
    return this.api.get<User>('/auth/me').pipe(
      tap(user => {
        localStorage.setItem(this.USER_KEY, JSON.stringify(user));
        this.userSignal.set(user);
      })
    );
  }

  loginWithToken(tokenResponse: TokenResponse): Observable<User> {
    this.saveToken(tokenResponse.accessToken);
    return this.loadCurrentUser();
  }
}
