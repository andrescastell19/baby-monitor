import { StreamPort, MonitorPlatform } from '../../core/ports/StreamPort';
import { SignalingPort } from '../../core/ports/SignalingPort';
import { MediaStream } from 'react-native-webrtc';

export class WebSocketRelayAdapter implements StreamPort {
  private localStream: MediaStream | null = null;
  private deviceId: string = '';
  private signaling: SignalingPort;

  private onRemoteStreamCallback: ((stream: any) => void) | null = null;
  private onConnectionStateCallback: ((state: string) => void) | null = null;
  private onMonitorsChangeCallback: ((monitors: string[]) => void) | null = null;

  private webMonitors: Set<string> = new Set();

  constructor(signaling: SignalingPort) {
    this.signaling = signaling;
  }

  setDeviceId(deviceId: string): void {
    this.deviceId = deviceId;
  }

  sendFrame(base64: string): void {
    if (this.webMonitors.size === 0) return;
    this.signaling.send({
      type: 'frame' as any,
      deviceId: this.deviceId,
      payload: base64,
    } as any);
  }

  async startSending(stream: MediaStream): Promise<void> {
    this.localStream = stream;
  }

  stopSending(): void {}

  async addMonitor(monitorId: string, platform: MonitorPlatform): Promise<void> {
    if (platform === 'web') {
      this.webMonitors.add(monitorId);
      this.onMonitorsChangeCallback?.(Array.from(this.webMonitors));
    }
  }

  removeMonitor(monitorId: string): void {
    this.webMonitors.delete(monitorId);
    this.onMonitorsChangeCallback?.(Array.from(this.webMonitors));
  }

  async startReceiving(_cameraId: string): Promise<void> {
    console.log('Relay receiver started, waiting for frames...');
  }

  stopReceiving(): void {}

  handleFrame(base64Frame: string): void {
    this.onRemoteStreamCallback?.(base64Frame);
  }

  onRemoteStream(callback: (stream: any) => void): void {
    this.onRemoteStreamCallback = callback;
  }

  onConnectionState(callback: (state: string) => void): void {
    this.onConnectionStateCallback = callback;
  }

  onMonitorsChange(callback: (monitorIds: string[]) => void): void {
    this.onMonitorsChangeCallback = callback;
  }

  muteAudio(): void {}
  unmuteAudio(): void {}

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getRemoteStream(): MediaStream | null {
    return null;
  }

  getConnectedMonitors(): string[] {
    return Array.from(this.webMonitors);
  }
}
