export type DeviceRole = 'camera' | 'monitor';
export type DevicePlatform = 'android' | 'web';

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
  id: number;
  type: 'sound' | 'motion';
  timestamp: number;
  message: string;
  read: boolean;
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
  platform?: DevicePlatform;
}

export interface SignalingMessage {
  type: 'register' | 'offer' | 'answer' | 'candidate' | 'disconnect' | 'alert' | 'camera-online' | 'camera-offline' | 'monitor-online' | 'monitor-offline' | 'ping' | 'pong' | 'renegotiate' | 'frame';
  deviceId: string;
  targetDeviceId?: string;
  role?: DeviceRole;
  platform?: DevicePlatform;
  payload?: SDPMessage | AlertPayload | RegisterPayload | string;
}
