import { signalingService } from './signaling';

type StreamHandler = (stream: any) => void;
type ConnectionStateHandler = (state: string) => void;
type MonitorsChangeHandler = (monitorIds: string[]) => void;

interface PeerConnectionEntry {
  pc: any;
  lastFramesReceived: number;
  lastRemoteStreamTime: number;
  pendingCandidates: any[];
  remoteDescriptionSet: boolean;
  reconnectAttempts: number;
  isReconnecting: boolean;
}

class WebRTCService {
  private localStream: any = null;
  private remoteStream: any = null;
  private deviceId: string = '';
  private onRemoteStream: StreamHandler | null = null;
  private onConnectionState: ConnectionStateHandler | null = null;
  private onMonitorsChange: MonitorsChangeHandler | null = null;

  private role: 'camera' | 'monitor' = 'camera';

  private keepaliveInterval: ReturnType<typeof setInterval> | null = null;
  private frozenCheckInterval: ReturnType<typeof setInterval> | null = null;

  private peerConnections: Map<string, PeerConnectionEntry> = new Map();
  private pendingMonitors: string[] = [];

  private getConfiguration() {
    return {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
      ],
      iceCandidatePoolSize: 2,
      bundlePolicy: 'max-bundle',
    };
  }

  private clearTimers() {
    if (this.keepaliveInterval) { clearInterval(this.keepaliveInterval); this.keepaliveInterval = null; }
    if (this.frozenCheckInterval) { clearInterval(this.frozenCheckInterval); this.frozenCheckInterval = null; }
  }

  private setupTimers() {
    this.clearTimers();

    this.keepaliveInterval = setInterval(() => {
      signalingService.send({ type: 'ping', deviceId: this.deviceId } as any);
    }, 3000);

    this.frozenCheckInterval = setInterval(() => this.checkFrozenStreams(), 4000);
  }

  private setupPeerConnectionForMonitor(pc: any, monitorId: string) {
    const entry = this.peerConnections.get(monitorId);

    pc.onicecandidate = (event: any) => {
      if (event.candidate) {
        const c = event.candidate.candidate || '';
        const type = c.includes('typ relay') ? 'RELAY' : c.includes('typ srflx') ? 'SRFLX' : 'HOST';
        console.log(`ICE candidate [${type}] [${monitorId}]:`, c.substring(0, 120));
        signalingService.sendCandidate(monitorId, event.candidate);
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
        console.log(`ICE connected [${monitorId}]`);
      } else if (state === 'disconnected') {
        console.log(`ICE disconnected [${monitorId}], waiting 5s...`);
        setTimeout(async () => {
          if (pc.iceConnectionState === 'disconnected' && entry && !entry.isReconnecting) {
            console.log(`Still disconnected [${monitorId}], doing full reconnect`);
            await this.fullReconnectMonitor(monitorId);
          }
        }, 5000);
      } else if (state === 'failed') {
        console.log(`ICE failed [${monitorId}]`);
        if (entry && !entry.isReconnecting) {
          this.fullReconnectMonitor(monitorId);
        }
      }
    };

    pc.ontrack = (event: any) => {
      console.log('Remote track received:', event.track.kind);
      this.remoteStream = event.streams[0];
      if (entry) entry.lastRemoteStreamTime = Date.now();
      this.onRemoteStream?.(this.remoteStream);
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log(`Connection state [${monitorId}]:`, state);
      this.onConnectionState?.(state);
    };
  }

  private async fullReconnectMonitor(monitorId: string) {
    const entry = this.peerConnections.get(monitorId);
    if (!entry || entry.isReconnecting) return;

    entry.isReconnecting = true;
    entry.reconnectAttempts++;
    console.log(`Full reconnect [${monitorId}] attempt ${entry.reconnectAttempts}/10`);

    if (entry.reconnectAttempts > 10) {
      console.log(`Max reconnect reached [${monitorId}], removing`);
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
    const pc = new RTCPeerConnection(this.getConfiguration());
    console.log(`PC created [${monitorId}], iceServers:`, JSON.stringify(this.getConfiguration().iceServers.map(s => s.urls)));
    entry.pc = pc;
      this.setupPeerConnectionForMonitor(pc, monitorId);

      if (this.localStream) {
        this.localStream.getTracks().forEach((track: any) => {
          pc.addTrack(track, this.localStream);
        });
      }

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      signalingService.sendOffer(monitorId, offer);
      console.log(`New offer sent [${monitorId}] after reconnect`);

      entry.isReconnecting = false;
    } catch (err) {
      console.error(`Full reconnect failed [${monitorId}]:`, err);
      entry.isReconnecting = false;
      this.removeMonitor(monitorId);
    }
  }

  private async checkFrozenStreams() {
    for (const [monitorId, entry] of this.peerConnections) {
      if (entry.isReconnecting || !entry.pc) continue;

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
            console.log(`Stream frozen [${monitorId}] for ${stallTime}ms, reconnecting`);
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

  async initializeAsCamera(
    deviceId: string,
    _remoteDeviceId: string,
    onRemoteStream: StreamHandler,
    onConnectionState: ConnectionStateHandler,
    onMonitorsChange?: MonitorsChangeHandler
  ) {
    this.deviceId = deviceId;
    this.onRemoteStream = onRemoteStream;
    this.onConnectionState = onConnectionState;
    this.onMonitorsChange = onMonitorsChange || null;
    this.role = 'camera';

    this.peerConnections.clear();
    this.clearTimers();

    const { mediaDevices } = require('react-native-webrtc');

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
    this.onRemoteStream?.(this.localStream);
    this.setupTimers();

    if (this.pendingMonitors.length > 0) {
      console.log(`Processing ${this.pendingMonitors.length} queued monitors`);
      const monitors = [...this.pendingMonitors];
      this.pendingMonitors = [];
      for (const monitorId of monitors) {
        await this.addMonitor(monitorId);
      }
    }
  }

  async addMonitor(monitorId: string) {
    if (this.role !== 'camera') return;
    if (this.peerConnections.has(monitorId)) {
      console.log(`Monitor ${monitorId} already has a PC, skipping`);
      return;
    }

    if (!this.localStream) {
      console.log(`LocalStream not ready, queuing monitor: ${monitorId}`);
      if (!this.pendingMonitors.includes(monitorId)) {
        this.pendingMonitors.push(monitorId);
      }
      return;
    }

    console.log(`Adding monitor: ${monitorId}`);

    const { RTCPeerConnection } = require('react-native-webrtc');

    const entry: PeerConnectionEntry = {
      pc: null,
      lastFramesReceived: 0,
      lastRemoteStreamTime: Date.now(),
      pendingCandidates: [],
      remoteDescriptionSet: false,
      reconnectAttempts: 0,
      isReconnecting: false,
    };

    const pc = new RTCPeerConnection(this.getConfiguration());
    entry.pc = pc;
    this.peerConnections.set(monitorId, entry);

    this.setupPeerConnectionForMonitor(pc, monitorId);

    if (this.localStream) {
      this.localStream.getTracks().forEach((track: any) => {
        pc.addTrack(track, this.localStream);
      });
    }

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      signalingService.sendOffer(monitorId, offer);
      console.log(`Offer sent to monitor: ${monitorId}`);
      this.onMonitorsChange?.(Array.from(this.peerConnections.keys()));
    } catch (err) {
      console.error(`Failed to create offer for ${monitorId}:`, err);
      this.removeMonitor(monitorId);
    }
  }

  removeMonitor(monitorId: string) {
    const entry = this.peerConnections.get(monitorId);
    if (entry) {
      try { entry.pc?.close(); } catch (e) {}
      this.peerConnections.delete(monitorId);
      console.log(`Monitor removed: ${monitorId}`);
      this.onMonitorsChange?.(Array.from(this.peerConnections.keys()));
    }
  }

  async initializeAsMonitor(
    deviceId: string,
    remoteDeviceId: string,
    onRemoteStream: StreamHandler,
    onConnectionState: ConnectionStateHandler
  ) {
    this.deviceId = deviceId;
    this.onRemoteStream = onRemoteStream;
    this.onConnectionState = onConnectionState;
    this.role = 'monitor';

    this.peerConnections.clear();
    this.clearTimers();

    const { RTCPeerConnection } = require('react-native-webrtc');

    const entry: PeerConnectionEntry = {
      pc: null,
      lastFramesReceived: 0,
      lastRemoteStreamTime: Date.now(),
      pendingCandidates: [],
      remoteDescriptionSet: false,
      reconnectAttempts: 0,
      isReconnecting: false,
    };

    const pc = new RTCPeerConnection(this.getConfiguration());
    entry.pc = pc;
    this.peerConnections.set(remoteDeviceId, entry);

    this.setupPeerConnectionForMonitor(pc, remoteDeviceId);
    this.setupTimers();

    console.log('Monitor PC created, waiting for offer...');
  }

  async handleOffer(sdp: any, fromDeviceId: string) {
    const entry = this.peerConnections.get(fromDeviceId);

    if (!entry || !entry.pc) {
      console.log(`PeerConnection not ready for ${fromDeviceId}, queuing offer`);
      return;
    }

    const { RTCSessionDescription } = require('react-native-webrtc');

    try {
      entry.remoteDescriptionSet = false;

      await entry.pc.setRemoteDescription(new RTCSessionDescription(sdp));
      entry.remoteDescriptionSet = true;
      console.log(`Remote description set [${fromDeviceId}], flushing ${entry.pendingCandidates.length} candidates`);

      const answer = await entry.pc.createAnswer();
      await entry.pc.setLocalDescription(answer);
      signalingService.sendAnswer(fromDeviceId, answer);
      console.log(`Answer sent to: ${fromDeviceId}`);

      for (const c of entry.pendingCandidates) {
        try {
          const { RTCIceCandidate } = require('react-native-webrtc');
          await entry.pc.addIceCandidate(new RTCIceCandidate(c));
        } catch (e) {
          console.warn('Failed to add queued candidate:', e);
        }
      }
      entry.pendingCandidates = [];
    } catch (err) {
      console.error(`Error handling offer from ${fromDeviceId}:`, err);
    }
  }

  async handleAnswer(sdp: any, fromDeviceId: string) {
    const entry = this.peerConnections.get(fromDeviceId);
    if (!entry || !entry.pc) return;

    const { RTCSessionDescription } = require('react-native-webrtc');

    try {
      entry.remoteDescriptionSet = false;
      await entry.pc.setRemoteDescription(new RTCSessionDescription(sdp));
      entry.remoteDescriptionSet = true;
      console.log(`Answer remote description set [${fromDeviceId}], flushing ${entry.pendingCandidates.length} candidates`);

      for (const c of entry.pendingCandidates) {
        try {
          const { RTCIceCandidate } = require('react-native-webrtc');
          await entry.pc.addIceCandidate(new RTCIceCandidate(c));
        } catch (e) {
          console.warn('Failed to add queued candidate:', e);
        }
      }
      entry.pendingCandidates = [];
    } catch (err) {
      console.error(`Error handling answer from ${fromDeviceId}:`, err);
    }
  }

  async handleCandidate(candidate: any, fromDeviceId: string) {
    const entry = this.peerConnections.get(fromDeviceId);

    if (!entry || !entry.pc) {
      console.log(`Queuing candidate for ${fromDeviceId} (PC not ready)`);
      return;
    }

    if (!entry.remoteDescriptionSet) {
      console.log(`Queuing ICE candidate [${fromDeviceId}] (remoteDescription not set)`);
      entry.pendingCandidates.push(candidate);
      return;
    }

    try {
      const { RTCIceCandidate } = require('react-native-webrtc');
      await entry.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.warn(`Failed to add ICE candidate [${fromDeviceId}]:`, e);
    }
  }

  async renegotiate() {
    console.log('Renegotiating all connections');
    for (const [monitorId, entry] of this.peerConnections) {
      if (entry.pc && (entry.pc.connectionState === 'connected' || entry.pc.connectionState === 'completed')) {
        try {
          entry.remoteDescriptionSet = false;
          const offer = await entry.pc.createOffer();
          await entry.pc.setLocalDescription(offer);
          signalingService.sendOffer(monitorId, offer);
          console.log(`New offer sent [${monitorId}]`);
        } catch (err) {
          console.warn(`Failed to renegotiate [${monitorId}]:`, err);
        }
      }
    }
  }

  async handleRenegotiate(fromDeviceId: string) {
    console.log(`Renegotiate requested by ${fromDeviceId}`);
    const entry = this.peerConnections.get(fromDeviceId);
    if (entry && entry.pc && (entry.pc.connectionState === 'connected' || entry.pc.connectionState === 'completed')) {
      try {
        entry.remoteDescriptionSet = false;
        const offer = await entry.pc.createOffer();
        await entry.pc.setLocalDescription(offer);
        signalingService.sendOffer(fromDeviceId, offer);
        console.log(`New offer sent in response to renegotiate [${fromDeviceId}]`);
      } catch (err) {
        console.warn(`Failed to create renegotiate offer [${fromDeviceId}]:`, err);
      }
    }
  }

  getLocalStream() {
    return this.localStream;
  }

  getRemoteStream() {
    return this.remoteStream;
  }

  getPeerConnection() {
    const first = this.peerConnections.values().next();
    return first.done ? null : first.value.pc;
  }

  getConnectedMonitors(): string[] {
    return Array.from(this.peerConnections.keys());
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

    for (const [id, entry] of this.peerConnections) {
      try { entry.pc?.close(); } catch (e) {}
    }
    this.peerConnections.clear();

    this.localStream = null;
    this.remoteStream = null;
  }
}

export const webrtcService = new WebRTCService();
