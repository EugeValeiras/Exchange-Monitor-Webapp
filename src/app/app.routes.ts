import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent),
    canActivate: [guestGuard]
  },
  {
    path: 'register',
    loadComponent: () => import('./features/auth/register/register.component').then(m => m.RegisterComponent),
    canActivate: [guestGuard]
  },
  {
    path: '',
    loadComponent: () => import('./shared/components/layout/layout.component').then(m => m.LayoutComponent),
    canActivate: [authGuard],
    children: [
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard-content.component').then(m => m.DashboardContentComponent)
      },
      {
        path: 'prices',
        loadComponent: () => import('./features/prices/prices.component').then(m => m.PricesComponent)
      },
      {
        path: 'balances',
        loadComponent: () => import('./features/balances/balances.component').then(m => m.BalancesComponent)
      },
      {
        path: 'transactions',
        loadComponent: () => import('./features/transactions/transactions.component').then(m => m.TransactionsComponent)
      },
      {
        path: 'pnl-history',
        loadComponent: () => import('./features/pnl-history/pnl-history.component').then(m => m.PnlHistoryComponent)
      },
      {
        path: 'exchanges',
        loadComponent: () => import('./features/credentials/credentials.component').then(m => m.CredentialsComponent)
      },
      {
        path: 'settings',
        children: [
          {
            path: '',
            redirectTo: 'symbols',
            pathMatch: 'full'
          },
          {
            path: 'symbols',
            loadComponent: () => import('./features/settings/settings.component').then(m => m.SettingsComponent)
          },
          {
            path: 'maintenance',
            loadComponent: () => import('./features/settings/maintenance.component').then(m => m.MaintenanceComponent)
          }
        ]
      }
    ]
  },
  {
    path: '**',
    redirectTo: 'dashboard'
  }
];
