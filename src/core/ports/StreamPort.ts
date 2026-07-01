import { MediaStream } from 'react-native-webrtc';

export type MonitorPlatform = 'android' | 'web';

export interface StreamPort {
  startSending(stream: MediaStream): Promise<void>;
  stopSending(): void;

  addMonitor(monitorId: string, platform: MonitorPlatform): Promise<void>;
  removeMonitor(monitorId: string): void;

  startReceiving(cameraId: string): Promise<void>;
  stopReceiving(): void;

  onRemoteStream(callback: (stream: MediaStream) => void): void;
  onConnectionState(callback: (state: string) => void): void;
  onMonitorsChange(callback: (monitorIds: string[]) => void): void;

  muteAudio(): void;
  unmuteAudio(): void;
  getLocalStream(): MediaStream | null;
  getRemoteStream(): MediaStream | null;
  getConnectedMonitors(): string[];
}
