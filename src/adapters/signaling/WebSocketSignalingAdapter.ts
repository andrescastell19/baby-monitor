import { Platform } from 'react-native';
import { SignalingPort } from '../../core/ports/SignalingPort';
import { SignalingMessage, ConnectionStatus } from '../../types';

const SERVER_URL = Platform.select({
  android: 'wss://baby-monitor-signaling-20xt.onrender.com',
  default: 'ws://localhost:8888',
});

export class WebSocketSignalingAdapter implements SignalingPort {
  private ws: WebSocket | null = null;
  private deviceId: string = '';
  private role: string = '';
  private platform: string = 'android';
  private onMessageCallback: ((msg: SignalingMessage) => void) | null = null;
  private onStatusCallback: ((status: ConnectionStatus) => void) | null = null;
  private onReconnectCallback: (() => void) | null = null;
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private keepaliveInterval: ReturnType<typeof setInterval> | null = null;

  connect(deviceId: string, role: string, platform: string): void {
    this.deviceId = deviceId;
    this.role = role;
    this.platform = platform;

    console.log('Connecting to signaling server:', SERVER_URL);

    this.ws = new WebSocket(SERVER_URL);

    this.ws.onopen = () => {
      console.log('Signaling server connected');
      this.reconnectAttempts = 0;
      this.onStatusCallback?.('connected');
      this.register();
      this.startKeepalive();
    };

    this.ws.onmessage = (event) => {
      try {
        const message: SignalingMessage = JSON.parse(event.data);
        console.log('Received message:', message.type);
        this.onMessageCallback?.(message);
      } catch (error) {
        console.error('Failed to parse signaling message:', error);
      }
    };

    this.ws.onclose = () => {
      console.log('Signaling server disconnected');
      this.onStatusCallback?.('disconnected');
      this.attemptReconnect();
    };

    this.ws.onerror = (error) => {
      console.error('Signaling server error:', error);
      this.onStatusCallback?.('error');
    };
  }

  private register(): void {
    this.send({
      type: 'register',
      deviceId: this.deviceId,
      role: this.role as any,
      platform: this.platform as any,
    } as any);
  }

  private startKeepalive(): void {
    this.stopKeepalive();
    this.keepaliveInterval = setInterval(() => {
      this.send({ type: 'ping', deviceId: this.deviceId } as any);
    }, 20000);
  }

  private stopKeepalive(): void {
    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval);
      this.keepaliveInterval = null;
    }
  }

  private attemptReconnect(): void {
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 10000);
    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      this.connect(this.deviceId, this.role, this.platform);
      setTimeout(() => this.onReconnectCallback?.(), 1000);
    }, delay);
  }

  send(message: SignalingMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  onMessage(callback: (msg: SignalingMessage) => void): void {
    this.onMessageCallback = callback;
  }

  onStatus(callback: (status: ConnectionStatus) => void): void {
    this.onStatusCallback = callback;
  }

  onReconnect(callback: () => void): void {
    this.onReconnectCallback = callback;
  }

  disconnect(): void {
    this.stopKeepalive();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    this.ws?.close();
    this.ws = null;
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  sendOffer(targetDeviceId: string, sdp: any): void {
    this.send({
      type: 'offer',
      deviceId: this.deviceId,
      targetDeviceId,
      payload: { type: 'offer', sdp },
    });
  }

  sendAnswer(targetDeviceId: string, sdp: any): void {
    this.send({
      type: 'answer',
      deviceId: this.deviceId,
      targetDeviceId,
      payload: { type: 'answer', sdp },
    });
  }

  sendCandidate(targetDeviceId: string, candidate: any): void {
    this.send({
      type: 'candidate',
      deviceId: this.deviceId,
      targetDeviceId,
      payload: { type: 'candidate', candidate },
    });
  }

  sendAlert(type: string, message: string, confidence?: number): void {
    this.send({
      type: 'alert',
      deviceId: this.deviceId,
      payload: { type, message, confidence },
    } as any);
  }

  sendFrame(frameBase64: string): void {
    this.send({
      type: 'frame' as any,
      deviceId: this.deviceId,
      payload: frameBase64,
    } as any);
  }
}
