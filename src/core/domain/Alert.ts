export type AlertType = 'sound' | 'motion';

export interface Alert {
  id: number;
  type: AlertType;
  timestamp: number;
  message: string;
  read: boolean;
  confidence?: number;
}

export function createAlert(
  type: AlertType,
  message: string,
  confidence?: number
): Alert {
  return {
    id: Date.now(),
    type,
    timestamp: Date.now(),
    message,
    read: false,
    confidence,
  };
}

export function alertToDTO(alert: Alert): any {
  return {
    id: String(alert.id),
    type: alert.type,
    timestamp: alert.timestamp,
    message: alert.message,
    read: alert.read,
  };
}
