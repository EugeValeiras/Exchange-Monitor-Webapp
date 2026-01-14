import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../../../core/services/auth.service';

interface NavItem {
  label: string;
  icon: string;
  route?: string;
  children?: { label: string; route: string }[];
}

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    MatSidenavModule,
    MatIconModule,
    MatButtonModule
  ],
  template: `
    <div class="layout">
      <aside class="sidebar">
        <div class="sidebar-header">
          <div class="logo">
            <img src="assets/logo-icon.svg" alt="Exchange Monitor" class="logo-icon">
            <span class="logo-text">Exchange Monitor</span>
          </div>
        </div>

        <nav class="sidebar-nav">
          @for (item of navItems; track item.label) {
            @if (item.children) {
              <!-- Expandable item -->
              <div class="nav-group" [class.expanded]="expandedItem() === item.label">
                <button class="nav-item" (click)="toggleExpand(item.label)">
                  <mat-icon class="nav-icon">{{ item.icon }}</mat-icon>
                  <span class="nav-label">{{ item.label }}</span>
                  <mat-icon class="expand-icon">{{ expandedItem() === item.label ? 'expand_less' : 'expand_more' }}</mat-icon>
                </button>
                @if (expandedItem() === item.label) {
                  <div class="nav-children">
                    @for (child of item.children; track child.route) {
                      <a class="nav-child" [routerLink]="child.route" routerLinkActive="active">
                        {{ child.label }}
                      </a>
                    }
                  </div>
                }
              </div>
            } @else {
              <!-- Simple item -->
              <a class="nav-item" [routerLink]="item.route" routerLinkActive="active" [routerLinkActiveOptions]="{exact: item.route === '/dashboard'}">
                <mat-icon class="nav-icon">{{ item.icon }}</mat-icon>
                <span class="nav-label">{{ item.label }}</span>
              </a>
            }
          }
        </nav>

        <div class="sidebar-footer">
          <button class="nav-item logout" (click)="logout()">
            <mat-icon class="nav-icon">logout</mat-icon>
            <span class="nav-label">Cerrar sesión</span>
          </button>
        </div>
      </aside>

      <main class="main">
        <header class="topbar">
          <h1 class="page-title">{{ getPageTitle() }}</h1>
          <div class="topbar-right">
            <div class="user-info">
              <span class="user-name">{{ authService.user()?.firstName }} {{ authService.user()?.lastName }}</span>
              <span class="user-email">{{ authService.user()?.email }}</span>
            </div>
            <div class="user-avatar">
              {{ getUserInitials() }}
            </div>
          </div>
        </header>

        <div class="content">
          <router-outlet></router-outlet>
        </div>
      </main>
    </div>
  `,
  styles: [`
    .layout {
      display: flex;
      height: 100vh;
      background: var(--bg-primary);
    }

    .sidebar {
      width: 240px;
      background: #181a20;
      display: flex;
      flex-direction: column;
      border-right: 1px solid var(--border-color);
    }

    .sidebar-header {
      padding: 20px 16px 32px;
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .logo-icon {
      width: 36px;
      height: 36px;
    }

    .logo-text {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary);
      letter-spacing: -0.3px;
    }

    .sidebar-nav {
      flex: 1;
      padding: 0 12px;
      overflow-y: auto;
    }

    .nav-group {
      margin-bottom: 4px;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      padding: 12px 16px;
      border: none;
      background: transparent;
      color: var(--text-secondary);
      font-size: 14px;
      font-family: inherit;
      text-decoration: none;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s ease;
      margin-bottom: 4px;

      &:hover {
        color: var(--text-primary);
      }

      &.active {
        background: rgba(255, 255, 255, 0.05);
        color: var(--text-primary);

        .nav-icon {
          color: var(--brand-accent);
        }
      }
    }

    .nav-icon {
      width: 20px;
      height: 20px;
      font-size: 20px;
      color: var(--text-tertiary);
      flex-shrink: 0;
    }

    .nav-label {
      flex: 1;
      text-align: left;
    }

    .expand-icon {
      width: 20px;
      height: 20px;
      font-size: 20px;
      color: var(--text-tertiary);
      transition: transform 0.2s ease;
    }

    .nav-children {
      padding: 4px 0 8px;
    }

    .nav-child {
      display: block;
      padding: 10px 16px 10px 48px;
      color: var(--text-secondary);
      font-size: 14px;
      text-decoration: none;
      border-radius: 8px;
      transition: all 0.15s ease;

      &:hover {
        color: var(--text-primary);
      }

      &.active {
        background: rgba(255, 255, 255, 0.08);
        color: var(--text-primary);
      }
    }

    .sidebar-footer {
      padding: 12px;
      border-top: 1px solid var(--border-color);
    }

    .logout {
      color: var(--text-secondary);
      margin-bottom: 0;

      &:hover {
        color: var(--color-error);
        background: rgba(246, 70, 93, 0.1);

        .nav-icon {
          color: var(--color-error);
        }
      }
    }

    .main {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .topbar {
      height: 64px;
      padding: 0 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--bg-elevated);
      border-bottom: 1px solid var(--border-color);
      flex-shrink: 0;
    }

    .page-title {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .topbar-right {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .user-info {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }

    .user-name {
      font-size: 14px;
      font-weight: 500;
      color: var(--text-primary);
    }

    .user-email {
      font-size: 12px;
      color: var(--text-tertiary);
    }

    .user-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: var(--brand-primary);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 13px;
    }

    .content {
      flex: 1;
      overflow: auto;
    }

    /* Scrollbar for sidebar */
    .sidebar-nav::-webkit-scrollbar {
      width: 4px;
    }

    .sidebar-nav::-webkit-scrollbar-track {
      background: transparent;
    }

    .sidebar-nav::-webkit-scrollbar-thumb {
      background: var(--bg-tertiary);
      border-radius: 2px;
    }
  `]
})
export class LayoutComponent {
  expandedItem = signal<string | null>(null);

  navItems: NavItem[] = [
    { label: 'Dashboard', icon: 'space_dashboard', route: '/dashboard' },
    { label: 'Precios', icon: 'show_chart', route: '/prices' },
    { label: 'Balances', icon: 'account_balance_wallet', route: '/balances' },
    { label: 'Transacciones', icon: 'swap_horiz', route: '/transactions' },
    { label: 'Exchanges', icon: 'currency_exchange', route: '/exchanges' },
    {
      label: 'Configuración',
      icon: 'settings',
      children: [
        { label: 'Pares de Precios', route: '/settings/symbols' }
      ]
    }
  ];

  constructor(public authService: AuthService) {}

  toggleExpand(label: string): void {
    if (this.expandedItem() === label) {
      this.expandedItem.set(null);
    } else {
      this.expandedItem.set(label);
    }
  }

  logout(): void {
    this.authService.logout();
  }

  getUserInitials(): string {
    const user = this.authService.user();
    if (!user) return '?';
    const first = user.firstName?.charAt(0) || '';
    const last = user.lastName?.charAt(0) || '';
    return (first + last).toUpperCase();
  }

  getPageTitle(): string {
    const path = window.location.pathname;
    const titles: Record<string, string> = {
      '/dashboard': 'Dashboard',
      '/balances': 'Balances',
      '/transactions': 'Transacciones',
      '/exchanges': 'Exchanges',
      '/settings': 'Configuración',
      '/settings/symbols': 'Pares de Precios'
    };
    return titles[path] || 'Exchange Monitor';
  }
}
