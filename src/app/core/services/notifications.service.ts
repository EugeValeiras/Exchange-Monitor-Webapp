import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface NotificationSettings {
  enabled: boolean;
  priceChangeThreshold: number;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  /// Activos que generan aviso. La API devuelve la lista ya resuelta: si nunca
  /// elegiste, manda el conjunto por defecto.
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
