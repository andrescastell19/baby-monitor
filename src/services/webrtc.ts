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
  private lastRemoteStreamTime = 0;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private isReconnecting = false;

  private getConfiguration() {
    return {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
      ],
    };
  }

  private resetState() {
    this.pendingCandidates = [];
    this.remoteDescriptionSet = false;
    this.pendingOffer = null;
    this.reconnectAttempts = 0;
    this.isReconnecting = false;
    this.lastFramesReceived = 0;
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
    if (!this.pc || this.isReconnecting) return;

    try {
      if (this.pc.connectionState !== 'connected') return;

      const stats = await this.pc.getStats();
      let framesReceived = 0;

      stats.forEach((report: any) => {
        if (report.type === 'inbound-rtp' && report.kind === 'video') {
          framesReceived = report.framesReceived || 0;
        }
      });

      if (this.lastFramesReceived > 0 && framesReceived === this.lastFramesReceived) {
        const stallTime = Date.now() - this.lastRemoteStreamTime;
        console.log(`Stream frozen: same frames for ${stallTime}ms`);

        if (stallTime > 3000) {
          console.log('Stream frozen, attempting full reconnect');
          await this.fullReconnect();
        }
      } else {
        this.lastRemoteStreamTime = Date.now();
      }

      this.lastFramesReceived = framesReceived;
    } catch (err) {
      console.warn('getStats failed (network may have changed):', err);
      await this.fullReconnect();
    }
  }

  private async attemptIceRestart() {
    if (!this.pc || this.isReconnecting) return;

    this.reconnectAttempts++;
    console.log(`ICE restart attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);

    try {
      this.pc.restartIce();
      this.remoteDescriptionSet = false;
      const offer = await this.pc.createOffer({ iceRestart: true });
      await this.pc.setLocalDescription(offer);
      signalingService.sendOffer(this.remoteDeviceId, offer);
      console.log('ICE restart offer sent');
    } catch (err) {
      console.error('ICE restart failed, doing full reconnect:', err);
      await this.fullReconnect();
    }
  }

  private async fullReconnect() {
    if (this.isReconnecting) return;
    this.isReconnecting = true;
    this.reconnectAttempts++;
    console.log(`Full reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);

    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      console.log('Max reconnect attempts reached');
      this.isReconnecting = false;
      this.onConnectionState?.('failed');
      return;
    }

    this.clearTimers();

    if (this.pc) {
      try { this.pc.close(); } catch (e) {}
      this.pc = null;
    }

    this.pendingCandidates = [];
    this.remoteDescriptionSet = false;

    try {
      if (this.role === 'camera') {
        await this.rebuildCameraConnection();
      } else {
        await this.rebuildMonitorConnection();
      }
      console.log('Full reconnect completed, waiting for connection...');
    } catch (err) {
      console.error('Full reconnect failed:', err);
      this.isReconnecting = false;
      this.onConnectionState?.('failed');
    }
  }

  private async rebuildCameraConnection() {
    const { RTCPeerConnection } = require('react-native-webrtc');

    this.pc = new RTCPeerConnection(this.getConfiguration());
    this.setupPeerConnection(this.pc);

    if (this.localStream) {
      this.localStream.getTracks().forEach((track: any) => {
        this.pc.addTrack(track, this.localStream);
      });
    }

    this.remoteDescriptionSet = false;
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    signalingService.sendOffer(this.remoteDeviceId, offer);
    console.log('New camera offer sent after full reconnect');

    this.setupKeepalive();
  }

  private async rebuildMonitorConnection() {
    const { RTCPeerConnection } = require('react-native-webrtc');

    this.pc = new RTCPeerConnection(this.getConfiguration());
    this.setupPeerConnection(this.pc);
    this.setupKeepalive();

    console.log('Monitor PC rebuilt, waiting for offer...');
  }

  private handleIceStateChange() {
    if (!this.pc) return;

    const state = this.pc.iceConnectionState;
    console.log('ICE connection state:', state);

    switch (state) {
      case 'disconnected':
        console.log('ICE disconnected, waiting 3s for recovery...');
        this.disconnectedTimer = setTimeout(async () => {
          if (this.pc?.iceConnectionState === 'disconnected' && !this.isReconnecting) {
            console.log('ICE still disconnected after 3s, full reconnect');
            await this.fullReconnect();
          }
        }, 3000);
        break;

      case 'failed':
        console.log('ICE connection failed');
        if (!this.isReconnecting) {
          this.fullReconnect();
        }
        break;

      case 'connected':
      case 'completed':
        if (this.disconnectedTimer) {
          clearTimeout(this.disconnectedTimer);
          this.disconnectedTimer = null;
        }
        this.reconnectAttempts = 0;
        this.isReconnecting = false;
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

    console.log('Requesting getUserMedia');
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
    console.log('Renegotiating after signaling reconnect');
    await this.fullReconnect();
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
