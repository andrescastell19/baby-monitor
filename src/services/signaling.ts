import { Platform } from 'react-native';
import { SignalingMessage } from '../types';

const SERVER_URL = Platform.select({
  android: 'wss://baby-monitor-signaling.onrender.com',
  default: 'ws://localhost:8888'
});

type MessageHandler = (message: SignalingMessage) => void;
type StatusHandler = (status: 'connected' | 'disconnected' | 'error') => void;

class SignalingService {
  private ws: WebSocket | null = null;
  private deviceId: string = '';
  private deviceRole: string = '';
  private onMessage: MessageHandler | null = null;
  private onStatus: StatusHandler | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = Infinity;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  connect(deviceId: string, role: string, onMessage: MessageHandler, onStatus: StatusHandler) {
    this.deviceId = deviceId;
    this.deviceRole = role;
    this.onMessage = onMessage;
    this.onStatus = onStatus;

    console.log('Connecting to signaling server:', SERVER_URL);

    this.ws = new WebSocket(SERVER_URL);

    this.ws.onopen = () => {
      console.log('Signaling server connected');
      this.reconnectAttempts = 0;
      this.onStatus?.('connected');
      this.register();
    };

    this.ws.onmessage = (event) => {
      try {
        const message: SignalingMessage = JSON.parse(event.data);
        console.log('Received message:', message.type);
        this.onMessage?.(message);
      } catch (error) {
        console.error('Failed to parse signaling message:', error);
      }
    };

    this.ws.onclose = () => {
      console.log('Signaling server disconnected');
      this.onStatus?.('disconnected');
      this.attemptReconnect();
    };

    this.ws.onerror = (error) => {
      console.error('Signaling server error:', error);
      this.onStatus?.('error');
    };
  }

  private register() {
    this.send({
      type: 'register',
      deviceId: this.deviceId,
      role: this.deviceRole,
    });
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 10000);
      console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

      this.reconnectTimeout = setTimeout(() => {
        this.connect(this.deviceId, this.deviceRole, this.onMessage!, this.onStatus!);
      }, delay);
    }
  }

  send(message: SignalingMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  sendOffer(targetDeviceId: string, sdp: any) {
    this.send({
      type: 'offer',
      deviceId: this.deviceId,
      targetDeviceId,
      payload: { type: 'offer', sdp },
    });
  }

  sendAnswer(targetDeviceId: string, sdp: any) {
    this.send({
      type: 'answer',
      deviceId: this.deviceId,
      targetDeviceId,
      payload: { type: 'answer', sdp },
    });
  }

  sendCandidate(targetDeviceId: string, candidate: any) {
    this.send({
      type: 'candidate',
      deviceId: this.deviceId,
      targetDeviceId,
      payload: { type: 'candidate', candidate },
    });
  }

  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    this.ws?.close();
    this.ws = null;
  }
}

export const signalingService = new SignalingService();
