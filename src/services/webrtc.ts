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
    this.resetState();

    const { RTCPeerConnection, mediaDevices } = require('react-native-webrtc');

    this.pc = new RTCPeerConnection(this.getConfiguration());

    this.pc.onicecandidate = (event: any) => {
      if (event.candidate) {
        signalingService.sendCandidate(remoteDeviceId, event.candidate);
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', this.pc.iceConnectionState);
    };

    this.pc.ontrack = (event: any) => {
      this.remoteStream = event.streams[0];
      this.onRemoteStream?.(this.remoteStream);
    };

    this.pc.onconnectionstatechange = () => {
      this.onConnectionState?.(this.pc.connectionState);
    };

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
    this.resetState();

    const { RTCPeerConnection } = require('react-native-webrtc');

    this.pc = new RTCPeerConnection(this.getConfiguration());

    this.pc.onicecandidate = (event: any) => {
      if (event.candidate) {
        signalingService.sendCandidate(remoteDeviceId, event.candidate);
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', this.pc.iceConnectionState);
    };

    this.pc.ontrack = (event: any) => {
      console.log('Remote track received:', event.track.kind);
      this.remoteStream = event.streams[0];
      this.onRemoteStream?.(this.remoteStream);
    };

    this.pc.onconnectionstatechange = () => {
      console.log('Connection state:', this.pc.connectionState);
      this.onConnectionState?.(this.pc.connectionState);
    };

    if (this.pendingOffer) {
      console.log('Processing queued offer from initializeAsMonitor');
      const offer = this.pendingOffer;
      this.pendingOffer = null;
      await this.handleOffer(offer);
    }
  }

  async createOffer() {
    if (!this.pc) throw new Error('PeerConnection not initialized');

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    signalingService.sendOffer(this.remoteDeviceId, offer);
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
    this.localStream?.getTracks().forEach((track: any) => track.stop());
    this.pc?.close();
    this.pc = null;
    this.localStream = null;
    this.remoteStream = null;
    this.resetState();
  }
}

export const webrtcService = new WebRTCService();
