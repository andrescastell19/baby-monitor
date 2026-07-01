import { Alert } from '../../types';

export interface AlertPort {
  sendAlert(type: string, message: string, confidence?: number): void;
  addAlert(alert: Alert): void;
  getAlerts(): Alert[];
  markAsRead(id: number): void;
  clearAlerts(): void;
}
