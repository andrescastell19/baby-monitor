import { StreamPort, MonitorPlatform } from '../../core/ports/StreamPort';
import { SignalingPort } from '../../core/ports/SignalingPort';
import { iceConfig } from '../../core/config/ice';
import { MediaStream } from 'react-native-webrtc';

interface PeerConnectionEntry {
  pc: any;
  platform: MonitorPlatform;
  lastFramesReceived: number;
  lastRemoteStreamTime: number;
  pendingCandidates: any[];
  remoteDescriptionSet: boolean;
  reconnectAttempts: number;
  isReconnecting: boolean;
}

export class WebRTCStreamAdapter implements StreamPort {
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private deviceId: string = '';
  private signaling: SignalingPort;
  private peerConnections: Map<string, PeerConnectionEntry> = new Map();
  private pendingMonitors: string[] = [];

  private onRemoteStreamCallback: ((stream: MediaStream) => void) | null = null;
  private onConnectionStateCallback: ((state: string) => void) | null = null;
  private onMonitorsChangeCallback: ((monitors: string[]) => void) | null = null;

  private keepaliveInterval: ReturnType<typeof setInterval> | null = null;
  private frozenCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor(signaling: SignalingPort) {
    this.signaling = signaling;
  }

  setDeviceId(deviceId: string): void {
    this.deviceId = deviceId;
  }

  private clearTimers(): void {
    if (this.keepaliveInterval) { clearInterval(this.keepaliveInterval); this.keepaliveInterval = null; }
    if (this.frozenCheckInterval) { clearInterval(this.frozenCheckInterval); this.frozenCheckInterval = null; }
  }

  private setupTimers(): void {
    this.clearTimers();
    this.keepaliveInterval = setInterval(() => {
      this.signaling.send({ type: 'ping', deviceId: this.deviceId } as any);
    }, 3000);
    this.frozenCheckInterval = setInterval(() => this.checkFrozenStreams(), 4000);
  }

  private setupPeerConnection(pc: any, monitorId: string): void {
    const entry = this.peerConnections.get(monitorId);

    pc.onicecandidate = (event: any) => {
      if (event.candidate) {
        const c = event.candidate.candidate || '';
        const type = c.includes('typ relay') ? 'RELAY' : c.includes('typ srflx') ? 'SRFLX' : 'HOST';
        console.log(`ICE candidate [${type}] [${monitorId}]:`, c.substring(0, 120));
        this.signaling.sendCandidate(monitorId, event.candidate);
      }
    };

    pc.onicegatheringstatechange = () => {
      console.log(`ICE gathering [${monitorId}]:`, pc.iceGatheringState);
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      console.log(`ICE state [${monitorId}]:`, state);

      if (state === 'connected' || state === 'completed') {
        if (entry) {
          entry.reconnectAttempts = 0;
          entry.isReconnecting = false;
          entry.lastRemoteStreamTime = Date.now();
        }
        this.onConnectionStateCallback?.('connected');
      } else if (state === 'disconnected') {
        setTimeout(async () => {
          if (pc.iceConnectionState === 'disconnected' && entry && !entry.isReconnecting) {
            await this.fullReconnectMonitor(monitorId);
          }
        }, 5000);
      } else if (state === 'failed') {
        if (entry && !entry.isReconnecting) {
          this.fullReconnectMonitor(monitorId);
        }
      }
    };

    pc.ontrack = (event: any) => {
      console.log(`[WebRTC] ontrack: kind=${event.track.kind} enabled=${event.track.enabled} streams=${event.streams.length}`);
      if (event.streams[0]) {
        console.log(`[WebRTC] ontrack stream: id=${event.streams[0].id} videoTracks=${event.streams[0].getVideoTracks().length} audioTracks=${event.streams[0].getAudioTracks().length}`);
      }
      this.remoteStream = event.streams[0];
      if (entry) entry.lastRemoteStreamTime = Date.now();
      console.log(`[WebRTC] onRemoteStreamCallback exists: ${!!this.onRemoteStreamCallback}`);
      this.onRemoteStreamCallback?.(this.remoteStream!);
    };

    pc.onconnectionstatechange = () => {
      console.log(`Connection state [${monitorId}]:`, pc.connectionState);
    };
  }

  private async fullReconnectMonitor(monitorId: string): Promise<void> {
    const entry = this.peerConnections.get(monitorId);
    if (!entry || entry.isReconnecting) return;

    entry.isReconnecting = true;
    entry.reconnectAttempts++;
    console.log(`Full reconnect [${monitorId}] attempt ${entry.reconnectAttempts}/10`);

    if (entry.reconnectAttempts > 10) {
      this.removeMonitor(monitorId);
      return;
    }

    if (entry.pc) {
      try { entry.pc.close(); } catch (e) {}
    }

    entry.pendingCandidates = [];
    entry.remoteDescriptionSet = false;

    try {
      const { RTCPeerConnection } = require('react-native-webrtc');
      const pc = new RTCPeerConnection(iceConfig);
      entry.pc = pc;
      this.setupPeerConnection(pc, monitorId);

      if (this.localStream) {
        this.localStream.getTracks().forEach((track: any) => {
          pc.addTrack(track, this.localStream);
        });
      }

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.signaling.sendOffer(monitorId, offer);
      entry.isReconnecting = false;
    } catch (err) {
      console.error(`Full reconnect failed [${monitorId}]:`, err);
      entry.isReconnecting = false;
      this.removeMonitor(monitorId);
    }
  }

  private async checkFrozenStreams(): Promise<void> {
    for (const [monitorId, entry] of this.peerConnections) {
      if (entry.isReconnecting || !entry.pc || entry.platform !== 'android') continue;

      try {
        if (entry.pc.connectionState !== 'connected') continue;

        const stats = await entry.pc.getStats();
        let framesReceived = 0;
        stats.forEach((report: any) => {
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            framesReceived = report.framesReceived || 0;
          }
        });

        if (entry.lastFramesReceived > 0 && framesReceived === entry.lastFramesReceived) {
          const stallTime = Date.now() - entry.lastRemoteStreamTime;
          if (stallTime > 5000) {
            await this.fullReconnectMonitor(monitorId);
          }
        } else {
          entry.lastRemoteStreamTime = Date.now();
        }
        entry.lastFramesReceived = framesReceived;
      } catch (err) {
        console.warn(`getStats failed [${monitorId}]:`, err);
      }
    }
  }

  async startSending(stream: MediaStream): Promise<void> {
    this.localStream = stream;
    this.setupTimers();

    if (this.pendingMonitors.length > 0) {
      const monitors = [...this.pendingMonitors];
      this.pendingMonitors = [];
      for (const monitorId of monitors) {
        await this.addMonitor(monitorId, 'android');
      }
    }
  }

  stopSending(): void {
    this.clearTimers();
  }

  async addMonitor(monitorId: string, platform: MonitorPlatform): Promise<void> {
    if (this.peerConnections.has(monitorId)) {
      console.log(`[WebRTC] addMonitor: ${monitorId} already exists, skipping`);
      return;
    }

    if (!this.localStream) {
      console.log(`[WebRTC] addMonitor: no localStream yet, queuing ${monitorId}`);
      if (!this.pendingMonitors.includes(monitorId)) {
        this.pendingMonitors.push(monitorId);
      }
      return;
    }

    console.log(`[WebRTC] addMonitor: ${monitorId} (${platform}) localStream tracks: video=${this.localStream.getVideoTracks().length} audio=${this.localStream.getAudioTracks().length}`);

    const { RTCPeerConnection } = require('react-native-webrtc');

    const entry: PeerConnectionEntry = {
      pc: null,
      platform,
      lastFramesReceived: 0,
      lastRemoteStreamTime: Date.now(),
      pendingCandidates: [],
      remoteDescriptionSet: false,
      reconnectAttempts: 0,
      isReconnecting: false,
    };

    const pc = new RTCPeerConnection(iceConfig);
    entry.pc = pc;
    this.peerConnections.set(monitorId, entry);

    this.setupPeerConnection(pc, monitorId);

    this.localStream.getTracks().forEach((track: any) => {
      pc.addTrack(track, this.localStream);
    });

    try {
      const offer = await pc.createOffer();
      console.log(`[WebRTC] Offer created for ${monitorId}: sdpLength=${offer.sdp?.length}`);
      await pc.setLocalDescription(offer);
      console.log(`[WebRTC] setLocalDescription OK, sending offer to ${monitorId}`);
      this.signaling.sendOffer(monitorId, offer);
      console.log(`[WebRTC] Offer sent to ${monitorId}`);
      this.onMonitorsChangeCallback?.(Array.from(this.peerConnections.keys()));
    } catch (err) {
      console.error(`Failed to create offer for ${monitorId}:`, err);
      this.removeMonitor(monitorId);
    }
  }

  removeMonitor(monitorId: string): void {
    const entry = this.peerConnections.get(monitorId);
    if (entry) {
      try { entry.pc?.close(); } catch (e) {}
      this.peerConnections.delete(monitorId);
      console.log(`Monitor removed: ${monitorId}`);
      this.onMonitorsChangeCallback?.(Array.from(this.peerConnections.keys()));
    }
  }

  async startReceiving(_cameraId: string): Promise<void> {
    const { RTCPeerConnection } = require('react-native-webrtc');

    const entry: PeerConnectionEntry = {
      pc: null,
      platform: 'android',
      lastFramesReceived: 0,
      lastRemoteStreamTime: Date.now(),
      pendingCandidates: [],
      remoteDescriptionSet: false,
      reconnectAttempts: 0,
      isReconnecting: false,
    };

    const pc = new RTCPeerConnection(iceConfig);
    entry.pc = pc;
    this.peerConnections.set(_cameraId, entry);

    this.setupPeerConnection(pc, _cameraId);
    this.setupTimers();

    console.log('Monitor PC created, waiting for offer...');
  }

  stopReceiving(): void {
    this.clearTimers();
  }

  async handleOffer(sdp: any, fromDeviceId: string): Promise<void> {
    console.log(`[WebRTC] handleOffer from=${fromDeviceId} sdpType=${sdp?.type} sdpLength=${sdp?.sdp?.length}`);
    let entry = this.peerConnections.get(fromDeviceId);
    if (!entry || !entry.pc) {
      const { RTCPeerConnection } = require('react-native-webrtc');
      const newEntry: PeerConnectionEntry = {
        pc: null,
        platform: 'android',
        lastFramesReceived: 0,
        lastRemoteStreamTime: Date.now(),
        pendingCandidates: [],
        remoteDescriptionSet: false,
        reconnectAttempts: 0,
        isReconnecting: false,
      };
      const pc = new RTCPeerConnection(iceConfig);
      newEntry.pc = pc;
      this.peerConnections.set(fromDeviceId, newEntry);
      this.setupPeerConnection(pc, fromDeviceId);
      this.setupTimers();
      entry = newEntry;
      console.log(`[WebRTC] PC created on-the-fly for ${fromDeviceId}`);
    }

    const { RTCSessionDescription } = require('react-native-webrtc');

    try {
      console.log(`[WebRTC] setRemoteDescription for offer from=${fromDeviceId}`);
      entry.remoteDescriptionSet = false;
      await entry.pc.setRemoteDescription(new RTCSessionDescription(sdp));
      entry.remoteDescriptionSet = true;
      console.log(`[WebRTC] setRemoteDescription OK, creating answer...`);

      const answer = await entry.pc.createAnswer();
      console.log(`[WebRTC] Answer created: sdpLength=${answer.sdp?.length}`);
      await entry.pc.setLocalDescription(answer);
      console.log(`[WebRTC] setLocalDescription OK, sending answer...`);
      this.signaling.sendAnswer(fromDeviceId, answer);
      console.log(`[WebRTC] Answer sent to ${fromDeviceId}`);

      for (const c of entry.pendingCandidates) {
        try {
          const { RTCIceCandidate } = require('react-native-webrtc');
          await entry.pc.addIceCandidate(new RTCIceCandidate(c));
        } catch (e) {}
      }
      entry.pendingCandidates = [];
    } catch (err) {
      console.error(`[WebRTC] Error handling offer from ${fromDeviceId}:`, err);
    }
  }

  async handleAnswer(sdp: any, fromDeviceId: string): Promise<void> {
    console.log(`[WebRTC] handleAnswer from=${fromDeviceId}`);
    const entry = this.peerConnections.get(fromDeviceId);
    if (!entry || !entry.pc) {
      console.log(`[WebRTC] handleAnswer: no PC found for ${fromDeviceId}`);
      return;
    }

    const { RTCSessionDescription } = require('react-native-webrtc');

    try {
      console.log(`[WebRTC] setRemoteDescription for answer from=${fromDeviceId}`);
      entry.remoteDescriptionSet = false;
      await entry.pc.setRemoteDescription(new RTCSessionDescription(sdp));
      entry.remoteDescriptionSet = true;
      console.log(`[WebRTC] setRemoteDescription OK, draining ${entry.pendingCandidates.length} pending candidates`);

      for (const c of entry.pendingCandidates) {
        try {
          const { RTCIceCandidate } = require('react-native-webrtc');
          await entry.pc.addIceCandidate(new RTCIceCandidate(c));
        } catch (e) {}
      }
      entry.pendingCandidates = [];
    } catch (err) {
      console.error(`[WebRTC] Error handling answer from ${fromDeviceId}:`, err);
    }
  }

  async handleCandidate(candidate: any, fromDeviceId: string): Promise<void> {
    const entry = this.peerConnections.get(fromDeviceId);
    if (!entry || !entry.pc) {
      console.log(`[WebRTC] handleCandidate: no PC for ${fromDeviceId}, discarding`);
      return;
    }

    if (!entry.remoteDescriptionSet) {
      console.log(`[WebRTC] handleCandidate: remoteDesc not set yet, queuing (${entry.pendingCandidates.length + 1} pending)`);
      entry.pendingCandidates.push(candidate);
      return;
    }

    try {
      const { RTCIceCandidate } = require('react-native-webrtc');
      console.log(`[WebRTC] addIceCandidate from=${fromDeviceId}`);
      await entry.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.warn(`[WebRTC] Failed to add ICE candidate [${fromDeviceId}]:`, e);
    }
  }

  async handleRenegotiate(fromDeviceId: string): Promise<void> {
    const entry = this.peerConnections.get(fromDeviceId);
    if (entry && entry.pc && (entry.pc.connectionState === 'connected' || entry.pc.connectionState === 'completed')) {
      try {
        entry.remoteDescriptionSet = false;
        const offer = await entry.pc.createOffer();
        await entry.pc.setLocalDescription(offer);
        this.signaling.sendOffer(fromDeviceId, offer);
      } catch (err) {
        console.warn(`Failed to renegotiate [${fromDeviceId}]:`, err);
      }
    }
  }

  onRemoteStream(callback: (stream: MediaStream) => void): void {
    this.onRemoteStreamCallback = callback;
  }

  onConnectionState(callback: (state: string) => void): void {
    this.onConnectionStateCallback = callback;
  }

  onMonitorsChange(callback: (monitorIds: string[]) => void): void {
    this.onMonitorsChangeCallback = callback;
  }

  muteAudio(): void {
    this.localStream?.getAudioTracks().forEach((track: any) => {
      track.enabled = false;
    });
  }

  unmuteAudio(): void {
    this.localStream?.getAudioTracks().forEach((track: any) => {
      track.enabled = true;
    });
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  getConnectedMonitors(): string[] {
    return Array.from(this.peerConnections.keys());
  }

  sendFrame(_base64: string): void {}

  getPeerConnection(monitorId: string): any {
    return this.peerConnections.get(monitorId)?.pc || null;
  }
}
