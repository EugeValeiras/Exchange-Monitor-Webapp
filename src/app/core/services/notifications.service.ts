import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface NotificationSettings {
  enabled: boolean;
  priceChangeThreshold: number;
  quietHoursStart?: string;
  quietHoursEnd?: string;
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
