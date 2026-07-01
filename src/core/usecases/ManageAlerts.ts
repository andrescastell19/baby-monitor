import { AlertPort } from '../ports/AlertPort';
import { Alert } from '../domain/Alert';

export class ManageAlerts {
  constructor(private alertPort: AlertPort) {}

  addAlert(alert: Alert): void {
    this.alertPort.addAlert(alert);
  }

  getAlerts(): Alert[] {
    return this.alertPort.getAlerts();
  }

  markAsRead(id: number): void {
    this.alertPort.markAsRead(id);
  }

  clearAlerts(): void {
    this.alertPort.clearAlerts();
  }
}
