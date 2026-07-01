import { SignalingMessage, ConnectionStatus } from '../../types';

export interface SignalingPort {
  connect(deviceId: string, role: string, platform: string): void;
  send(message: SignalingMessage): void;
  sendOffer(targetDeviceId: string, sdp: any): void;
  sendAnswer(targetDeviceId: string, sdp: any): void;
  sendCandidate(targetDeviceId: string, candidate: any): void;
  sendAlert(type: string, message: string, confidence?: number): void;
  onMessage(callback: (msg: SignalingMessage) => void): void;
  onStatus(callback: (status: ConnectionStatus) => void): void;
  onReconnect(callback: () => void): void;
  disconnect(): void;
  isConnected(): boolean;
}
