import { StreamPort, MonitorPlatform } from '../../core/ports/StreamPort';
import { SignalingPort } from '../../core/ports/SignalingPort';
import { MediaStream } from 'react-native-webrtc';
import { FRAME_CAPTURE_INTERVAL, FRAME_QUALITY, FRAME_WIDTH, FRAME_HEIGHT } from '../../core/config/ice';

export class WebSocketRelayAdapter implements StreamPort {
  private localStream: MediaStream | null = null;
  private deviceId: string = '';
  private signaling: SignalingPort;
  private frameInterval: ReturnType<typeof setInterval> | null = null;
  private canvas: any = null;
  private ctx: any = null;

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

  private startFrameCapture(): void {
    if (this.frameInterval || !this.localStream) return;

    const { RTCPeerConnection } = require('react-native-webrtc');

    this.canvas = { width: FRAME_WIDTH, height: FRAME_HEIGHT };
    const VideoFrame = require('react-native-webrtc').default?.VideoFrame;

    this.frameInterval = setInterval(() => {
      if (!this.localStream || this.webMonitors.size === 0) return;

      try {
        const tracks = this.localStream.getVideoTracks();
        if (tracks.length === 0) return;

        const settings = tracks[0]?.getSettings?.() || {};
        const width = settings.width || FRAME_WIDTH;
        const height = settings.height || FRAME_HEIGHT;

        const frameData = JSON.stringify({
          w: width,
          h: height,
          t: Date.now(),
        });

        this.signaling.send({
          type: 'frame' as any,
          deviceId: this.deviceId,
          payload: frameData,
        } as any);
      } catch (err) {
        console.warn('Frame capture error:', err);
      }
    }, FRAME_CAPTURE_INTERVAL);
  }

  private stopFrameCapture(): void {
    if (this.frameInterval) {
      clearInterval(this.frameInterval);
      this.frameInterval = null;
    }
  }

  async startSending(stream: MediaStream): Promise<void> {
    this.localStream = stream;
  }

  stopSending(): void {
    this.stopFrameCapture();
  }

  async addMonitor(monitorId: string, platform: MonitorPlatform): Promise<void> {
    if (platform === 'web') {
      this.webMonitors.add(monitorId);
      this.onMonitorsChangeCallback?.(Array.from(this.webMonitors));
      this.startFrameCapture();
    }
  }

  removeMonitor(monitorId: string): void {
    this.webMonitors.delete(monitorId);
    this.onMonitorsChangeCallback?.(Array.from(this.webMonitors));
    if (this.webMonitors.size === 0) {
      this.stopFrameCapture();
    }
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
