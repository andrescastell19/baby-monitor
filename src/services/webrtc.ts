import { signalingService } from './signaling';

type StreamHandler = (stream: any) => void;
type ConnectionStateHandler = (state: string) => void;

class WebRTCService {
  private pc: any = null;
  private localStream: any = null;
  private remoteStream: any = null;
  private deviceId: string = '';
  private remoteDeviceId: string = '';
  private onRemoteStream: StreamHandler | null = null;
  private onConnectionState: ConnectionStateHandler | null = null;
  private pendingCandidates: any[] = [];
  private remoteDescriptionSet: boolean = false;
  private pendingOffer: any = null;

  private role: 'camera' | 'monitor' = 'camera';
  private disconnectedTimer: ReturnType<typeof setTimeout> | null = null;
  private keepaliveInterval: ReturnType<typeof setInterval> | null = null;
  private frozenCheckInterval: ReturnType<typeof setInterval> | null = null;
  private lastFramesReceived = 0;
  private lastFramesCheckTime = 0;
  private lastRemoteStreamTime = 0;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  private getConfiguration() {
    return {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
      ],
    };
  }

  private resetState() {
    this.pendingCandidates = [];
    this.remoteDescriptionSet = false;
    this.pendingOffer = null;
    this.reconnectAttempts = 0;
    this.lastFramesReceived = 0;
    this.lastFramesCheckTime = 0;
    this.lastRemoteStreamTime = Date.now();
    this.clearTimers();
  }

  private clearTimers() {
    if (this.disconnectedTimer) { clearTimeout(this.disconnectedTimer); this.disconnectedTimer = null; }
    if (this.keepaliveInterval) { clearInterval(this.keepaliveInterval); this.keepaliveInterval = null; }
    if (this.frozenCheckInterval) { clearInterval(this.frozenCheckInterval); this.frozenCheckInterval = null; }
  }

  private setupKeepalive() {
    this.clearTimers();

    this.keepaliveInterval = setInterval(() => {
      if (!this.pc) return;
      signalingService.send({
        type: 'ping',
        deviceId: this.deviceId,
      } as any);
    }, 3000);

    this.frozenCheckInterval = setInterval(() => this.checkFrozenStream(), 4000);
  }

  private async checkFrozenStream() {
    if (!this.pc || this.pc.connectionState !== 'connected') return;

    try {
      const stats = await this.pc.getStats();
      let framesReceived = 0;

      stats.forEach((report: any) => {
        if (report.type === 'inbound-rtp' && report.kind === 'video') {
          framesReceived = report.framesReceived || 0;
        }
      });

      if (this.lastFramesReceived > 0 && framesReceived === this.lastFramesReceived) {
        const stallTime = Date.now() - this.lastRemoteStreamTime;
        console.log(`Stream frozen check: same frames for ${stallTime}ms`);

        if (stallTime > 5000 && this.reconnectAttempts < this.maxReconnectAttempts) {
          console.log('Stream appears frozen, attempting ICE restart');
          await this.attemptIceRestart();
        }
      } else {
        this.lastRemoteStreamTime = Date.now();
      }

      this.lastFramesReceived = framesReceived;
    } catch (err) {
      console.warn('Error checking frozen stream:', err);
    }
  }

  private async attemptIceRestart() {
    if (!this.pc) return;

    this.reconnectAttempts++;
    console.log(`ICE restart attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);

    try {
      this.pc.restartIce();
      await this.createOffer();
      console.log('ICE restart offer sent');
    } catch (err) {
      console.error('ICE restart failed:', err);

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.log('Max reconnect attempts reached, tearing down');
        this.onConnectionState?.('failed');
      }
    }
  }

  private handleIceStateChange() {
    if (!this.pc) return;

    const state = this.pc.iceConnectionState;
    console.log('ICE connection state:', state);

    switch (state) {
      case 'disconnected':
        console.log('ICE disconnected, waiting for recovery...');
        this.disconnectedTimer = setTimeout(async () => {
          if (this.pc?.iceConnectionState === 'disconnected' && this.reconnectAttempts < this.maxReconnectAttempts) {
            console.log('ICE still disconnected after 3s, attempting restart');
            await this.attemptIceRestart();
          }
        }, 3000);
        break;

      case 'failed':
        console.log('ICE connection failed');
        this.onConnectionState?.('failed');
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.attemptIceRestart();
        }
        break;

      case 'connected':
      case 'completed':
        if (this.disconnectedTimer) {
          clearTimeout(this.disconnectedTimer);
          this.disconnectedTimer = null;
        }
        this.reconnectAttempts = 0;
        this.lastRemoteStreamTime = Date.now();
        console.log('ICE connected/completed');
        break;
    }
  }

  private setupPeerConnection(pc: any) {
    pc.onicecandidate = (event: any) => {
      if (event.candidate) {
        signalingService.sendCandidate(this.remoteDeviceId, event.candidate);
      }
    };

    pc.oniceconnectionstatechange = () => this.handleIceStateChange();

    pc.ontrack = (event: any) => {
      console.log('Remote track received:', event.track.kind);
      this.remoteStream = event.streams[0];
      this.lastRemoteStreamTime = Date.now();
      this.onRemoteStream?.(this.remoteStream);
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log('Connection state:', state);
      this.onConnectionState?.(state);
    };
  }

  async initializeAsCamera(
    deviceId: string,
    remoteDeviceId: string,
    onRemoteStream: StreamHandler,
    onConnectionState: ConnectionStateHandler
  ) {
    this.deviceId = deviceId;
    this.remoteDeviceId = remoteDeviceId;
    this.onRemoteStream = onRemoteStream;
    this.onConnectionState = onConnectionState;
    this.role = 'camera';
    this.resetState();

    const { RTCPeerConnection, mediaDevices } = require('react-native-webrtc');

    this.pc = new RTCPeerConnection(this.getConfiguration());
    this.setupPeerConnection(this.pc);

    const constraints = {
      audio: true,
      video: {
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };

    console.log('Requesting getUserMedia with constraints:', JSON.stringify(constraints));
    this.localStream = await mediaDevices.getUserMedia(constraints);
    console.log('getUserMedia success, tracks:', this.localStream.getTracks().length);
    this.localStream.getTracks().forEach((track: any) => {
      console.log('Adding track:', track.kind, track.id);
      this.pc.addTrack(track, this.localStream);
    });
    this.onRemoteStream?.(this.localStream);
    this.setupKeepalive();
  }

  async initializeAsMonitor(
    deviceId: string,
    remoteDeviceId: string,
    onRemoteStream: StreamHandler,
    onConnectionState: ConnectionStateHandler
  ) {
    this.deviceId = deviceId;
    this.remoteDeviceId = remoteDeviceId;
    this.onRemoteStream = onRemoteStream;
    this.onConnectionState = onConnectionState;
    this.role = 'monitor';
    this.resetState();

    const { RTCPeerConnection } = require('react-native-webrtc');

    this.pc = new RTCPeerConnection(this.getConfiguration());
    this.setupPeerConnection(this.pc);

    this.setupKeepalive();

    if (this.pendingOffer) {
      console.log('Processing queued offer from initializeAsMonitor');
      const offer = this.pendingOffer;
      this.pendingOffer = null;
      await this.handleOffer(offer);
    }
  }

  async createOffer() {
    if (!this.pc) throw new Error('PeerConnection not initialized');

    this.remoteDescriptionSet = false;
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    signalingService.sendOffer(this.remoteDeviceId, offer);
  }

  async renegotiate() {
    if (!this.pc || this.role !== 'camera') return;

    console.log('Renegotiating after signaling reconnect');
    try {
      this.remoteDescriptionSet = false;
      this.pendingCandidates = [];
      await this.createOffer();
    } catch (err) {
      console.error('Renegotiation failed:', err);
    }
  }

  async handleOffer(sdp: any) {
    if (!this.pc) {
      console.log('PeerConnection not ready, queuing offer');
      this.pendingOffer = sdp;
      return;
    }

    const { RTCSessionDescription } = require('react-native-webrtc');

    try {
      this.remoteDescriptionSet = false;

      await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
      this.remoteDescriptionSet = true;
      console.log('Remote description set, flushing', this.pendingCandidates.length, 'queued candidates');

      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      signalingService.sendAnswer(this.remoteDeviceId, answer);
      console.log('Answer sent to:', this.remoteDeviceId);

      await this.flushPendingCandidates();
    } catch (err) {
      console.error('Error handling offer:', err);
    }
  }

  async handleAnswer(sdp: any) {
    if (!this.pc) return;

    const { RTCSessionDescription } = require('react-native-webrtc');

    try {
      this.remoteDescriptionSet = false;
      await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
      this.remoteDescriptionSet = true;
      console.log('Answer remote description set, flushing', this.pendingCandidates.length, 'queued candidates');
      await this.flushPendingCandidates();
    } catch (err) {
      console.error('Error handling answer:', err);
    }
  }

  async handleCandidate(candidate: any) {
    if (!this.pc) {
      console.log('Queuing candidate (PeerConnection not ready)');
      this.pendingCandidates.push(candidate);
      return;
    }

    if (!this.remoteDescriptionSet) {
      console.log('Queuing ICE candidate (remoteDescription not set yet)');
      this.pendingCandidates.push(candidate);
      return;
    }

    await this.addCandidate(candidate);
  }

  private async addCandidate(candidate: any) {
    try {
      const { RTCIceCandidate } = require('react-native-webrtc');
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.warn('Failed to add ICE candidate:', e);
    }
  }

  private async flushPendingCandidates() {
    if (this.pendingCandidates.length > 0) {
      console.log(`Flushing ${this.pendingCandidates.length} queued candidates`);
      for (const c of this.pendingCandidates) {
        await this.addCandidate(c);
      }
      this.pendingCandidates = [];
    }
  }

  getLocalStream() {
    return this.localStream;
  }

  getRemoteStream() {
    return this.remoteStream;
  }

  getPeerConnection() {
    return this.pc;
  }

  muteAudio() {
    this.localStream?.getAudioTracks().forEach((track: any) => {
      track.enabled = false;
    });
  }

  unmuteAudio() {
    this.localStream?.getAudioTracks().forEach((track: any) => {
      track.enabled = true;
    });
  }

  disconnect() {
    this.clearTimers();
    this.localStream?.getTracks().forEach((track: any) => track.stop());
    this.pc?.close();
    this.pc = null;
    this.localStream = null;
    this.remoteStream = null;
    this.resetState();
  }
}

export const webrtcService = new WebRTCService();
