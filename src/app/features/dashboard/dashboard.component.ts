import { Component, OnInit, signal } from '@angular/core';
import { CommonModule, CurrencyPipe, DecimalPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { RouterLink, RouterOutlet } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

interface AssetBalance {
  asset: string;
  free: number;
  locked: number;
  total: number;
  priceUsd?: number;
  valueUsd?: number;
}

interface ExchangeBalance {
  exchange: string;
  label: string;
  credentialId: string;
  balances: AssetBalance[];
  totalValueUsd: number;
}

interface ConsolidatedBalance {
  byAsset: AssetBalance[];
  byExchange: ExchangeBalance[];
  totalValueUsd: number;
  lastUpdated: Date;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    CurrencyPipe,
    DecimalPipe,
    RouterLink,
    RouterOutlet,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTableModule,
    MatToolbarModule,
    MatSidenavModule,
    MatListModule
  ],
  template: `
    <mat-sidenav-container class="sidenav-container">
      <mat-sidenav mode="side" opened class="sidenav">
        <div class="sidenav-header">
          <h2>Exchange Monitor</h2>
        </div>
        <mat-nav-list>
          <a mat-list-item routerLink="/dashboard">
            <mat-icon matListItemIcon>dashboard</mat-icon>
            <span matListItemTitle>Dashboard</span>
          </a>
          <a mat-list-item routerLink="/balances">
            <mat-icon matListItemIcon>account_balance_wallet</mat-icon>
            <span matListItemTitle>Balances</span>
          </a>
          <a mat-list-item routerLink="/transactions">
            <mat-icon matListItemIcon>swap_horiz</mat-icon>
            <span matListItemTitle>Transacciones</span>
          </a>
          <a mat-list-item routerLink="/exchanges">
            <mat-icon matListItemIcon>vpn_key</mat-icon>
            <span matListItemTitle>API Keys</span>
          </a>
          <a mat-list-item routerLink="/snapshots">
            <mat-icon matListItemIcon>history</mat-icon>
            <span matListItemTitle>Historial</span>
          </a>
        </mat-nav-list>
        <div class="sidenav-footer">
          <button mat-button color="warn" (click)="logout()">
            <mat-icon>logout</mat-icon>
            Cerrar sesión
          </button>
        </div>
      </mat-sidenav>

      <mat-sidenav-content class="content">
        <mat-toolbar color="primary">
          <span>Dashboard</span>
          <span class="spacer"></span>
          <span>{{ authService.user()?.firstName }} {{ authService.user()?.lastName }}</span>
        </mat-toolbar>

        <div class="dashboard-content">
          @if (loading()) {
            <div class="loading-container">
              <mat-spinner></mat-spinner>
              <p>Cargando balances...</p>
            </div>
          } @else if (error()) {
            <mat-card class="error-card">
              <mat-card-content>
                <mat-icon color="warn">error</mat-icon>
                <p>{{ error() }}</p>
                <button mat-button color="primary" (click)="loadBalances()">Reintentar</button>
              </mat-card-content>
            </mat-card>
          } @else {
            <div class="stats-grid">
              <mat-card class="stat-card total-card">
                <mat-card-content>
                  <div class="stat-icon">
                    <mat-icon>account_balance</mat-icon>
                  </div>
                  <div class="stat-info">
                    <span class="stat-label">Balance Total</span>
                    <span class="stat-value">{{ balances()?.totalValueUsd | currency:'USD':'symbol':'1.2-2' }}</span>
                  </div>
                </mat-card-content>
              </mat-card>

              <mat-card class="stat-card">
                <mat-card-content>
                  <div class="stat-icon exchanges">
                    <mat-icon>business</mat-icon>
                  </div>
                  <div class="stat-info">
                    <span class="stat-label">Exchanges</span>
                    <span class="stat-value">{{ balances()?.byExchange?.length || 0 }}</span>
                  </div>
                </mat-card-content>
              </mat-card>

              <mat-card class="stat-card">
                <mat-card-content>
                  <div class="stat-icon assets">
                    <mat-icon>toll</mat-icon>
                  </div>
                  <div class="stat-info">
                    <span class="stat-label">Activos</span>
                    <span class="stat-value">{{ balances()?.byAsset?.length || 0 }}</span>
                  </div>
                </mat-card-content>
              </mat-card>
            </div>

            @if (balances()?.byAsset?.length) {
              <mat-card class="table-card">
                <mat-card-header>
                  <mat-card-title>Balances por Activo</mat-card-title>
                </mat-card-header>
                <mat-card-content>
                  <table mat-table [dataSource]="balances()?.byAsset || []" class="full-width">
                    <ng-container matColumnDef="asset">
                      <th mat-header-cell *matHeaderCellDef>Activo</th>
                      <td mat-cell *matCellDef="let row">
                        <strong>{{ row.asset }}</strong>
                      </td>
                    </ng-container>

                    <ng-container matColumnDef="total">
                      <th mat-header-cell *matHeaderCellDef>Cantidad</th>
                      <td mat-cell *matCellDef="let row">{{ row.total | number:'1.4-8' }}</td>
                    </ng-container>

                    <ng-container matColumnDef="value">
                      <th mat-header-cell *matHeaderCellDef>Valor USD</th>
                      <td mat-cell *matCellDef="let row">{{ row.valueUsd | currency:'USD' }}</td>
                    </ng-container>

                    <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
                    <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
                  </table>
                </mat-card-content>
              </mat-card>
            }
          }
        </div>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: [`
    .sidenav-container {
      height: 100vh;
    }

    .sidenav {
      width: 250px;
      background: #fafafa;
    }

    .sidenav-header {
      padding: 24px 16px;
      border-bottom: 1px solid #e0e0e0;
    }

    .sidenav-header h2 {
      margin: 0;
      color: #3f51b5;
    }

    .sidenav-footer {
      position: absolute;
      bottom: 0;
      width: 100%;
      padding: 16px;
      border-top: 1px solid #e0e0e0;
    }

    .content {
      background: #f5f5f5;
    }

    .spacer {
      flex: 1;
    }

    .dashboard-content {
      padding: 24px;
    }

    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 64px;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 24px;
      margin-bottom: 24px;
    }

    .stat-card mat-card-content {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 24px !important;
    }

    .stat-icon {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: #3f51b5;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .stat-icon mat-icon {
      color: white;
      font-size: 28px;
      width: 28px;
      height: 28px;
    }

    .stat-icon.exchanges {
      background: #ff9800;
    }

    .stat-icon.assets {
      background: #4caf50;
    }

    .stat-info {
      display: flex;
      flex-direction: column;
    }

    .stat-label {
      color: #666;
      font-size: 14px;
    }

    .stat-value {
      font-size: 24px;
      font-weight: 500;
    }

    .total-card {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }

    .total-card .stat-icon {
      background: rgba(255,255,255,0.2);
    }

    .total-card .stat-label {
      color: rgba(255,255,255,0.8);
    }

    .table-card {
      margin-top: 24px;
    }

    .full-width {
      width: 100%;
    }

    .error-card mat-card-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 32px;
    }

    .error-card mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
    }
  `]
})
export class DashboardComponent implements OnInit {
  balances = signal<ConsolidatedBalance | null>(null);
  loading = signal(true);
  error = signal('');

  displayedColumns = ['asset', 'total', 'value'];

  constructor(
    private api: ApiService,
    public authService: AuthService
  ) {}

  ngOnInit() {
    this.loadBalances();
  }

  loadBalances() {
    this.loading.set(true);
    this.error.set('');

    this.api.get<ConsolidatedBalance>('/balances').subscribe({
      next: (data) => {
        this.balances.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message || 'Error al cargar balances');
        this.loading.set(false);
      }
    });
  }

  logout() {
    this.authService.logout();
  }
}
