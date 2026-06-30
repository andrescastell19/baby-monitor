export type DeviceRole = 'camera' | 'monitor';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface Device {
  id: string;
  name: string;
  role: DeviceRole;
  isOnline: boolean;
}

export interface ConnectionState {
  status: ConnectionStatus;
  localDevice: Device | null;
  remoteDevice: Device | null;
  error: string | null;
}

export interface Alert {
  id: string;
  type: 'sound' | 'motion';
  timestamp: number;
  message: string;
  read: boolean;
}

export interface CameraSettings {
  facing: 'front' | 'back';
  enabled: boolean;
  audioEnabled: boolean;
}

export interface MonitorSettings {
  volume: number;
  brightness: number;
  alertsEnabled: boolean;
}

export interface SDPMessage {
  type: 'offer' | 'answer' | 'candidate';
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

export interface AlertPayload {
  type: 'sound' | 'motion';
  message: string;
  confidence?: number;
}

export interface RegisterPayload {
  role: DeviceRole;
}

export interface SignalingMessage {
  type: 'register' | 'offer' | 'answer' | 'candidate' | 'disconnect' | 'alert' | 'camera-online' | 'camera-offline';
  deviceId: string;
  targetDeviceId?: string;
  role?: DeviceRole;
  payload?: SDPMessage | AlertPayload | RegisterPayload;
}
