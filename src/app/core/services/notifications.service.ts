import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface NotificationSettings {
  enabled: boolean;
  priceChangeThreshold: number;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  /// Pares que generan aviso ("NEXO/BTC"). Es la unidad correcta: un activo
  /// cotiza contra varias monedas y no valen lo mismo.
  alertPairs?: string[];

  /// Selección vieja por activo, que la API sigue aceptando.
  alertAssets?: string[];
}

@Injectable({
  providedIn: 'root'
})
export class NotificationsService {
  constructor(private api: ApiService) {}

  getSettings(): Observable<NotificationSettings> {
    return this.api.get<NotificationSettings>('/notifications/settings');
  }

  updateSettings(settings: NotificationSettings): Observable<NotificationSettings> {
    return this.api.put<NotificationSettings>('/notifications/settings', settings);
  }
}
