import { Platform } from 'react-native';

const SERVER_URL = Platform.select({
  android: 'ws://10.0.2.2:8888', // Android emulator
  ios: 'ws://localhost:8888',     // iOS simulator
  default: 'ws://localhost:8888'
});

// For physical devices, use your computer's local IP
// Uncomment and set your computer's IP:
// const SERVER_URL = 'ws://192.168.1.XXX:8888';

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

    const { RTCPeerConnection, RTCIceCandidate, RTCSessionDescription, MediaStream, MediaStreamTrack, getUserMedia } = require('react-native-webrtc');

    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ]
    };

    this.pc = new RTCPeerConnection(configuration);

    this.pc.onicecandidate = (event: any) => {
      if (event.candidate) {
        signalingService.sendCandidate(remoteDeviceId, event.candidate);
      }
    };

    this.pc.ontrack = (event: any) => {
      this.remoteStream = event.streams[0];
      this.onRemoteStream?.(this.remoteStream);
    };

    this.pc.onconnectionstatechange = () => {
      this.onConnectionState?.(this.pc.connectionState);
    };

    // Get local stream
    const constraints = {
      audio: true,
      video: {
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };

    try {
      this.localStream = await getUserMedia(constraints);
      this.localStream.getTracks().forEach((track: any) => {
        this.pc.addTrack(track, this.localStream);
      });
      this.onRemoteStream?.(this.localStream);
    } catch (err) {
      console.error('Error getting user media:', err);
    }
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

    const { RTCPeerConnection } = require('react-native-webrtc');

    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ]
    };

    this.pc = new RTCPeerConnection(configuration);

    this.pc.onicecandidate = (event: any) => {
      if (event.candidate) {
        signalingService.sendCandidate(remoteDeviceId, event.candidate);
      }
    };

    this.pc.ontrack = (event: any) => {
      this.remoteStream = event.streams[0];
      this.onRemoteStream?.(this.remoteStream);
    };

    this.pc.onconnectionstatechange = () => {
      this.onConnectionState?.(this.pc.connectionState);
    };
  }

  async createOffer() {
    if (!this.pc) throw new Error('PeerConnection not initialized');

    const { RTCSessionDescription } = require('react-native-webrtc');
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    signalingService.sendOffer(this.remoteDeviceId, offer);
  }

  async handleOffer(sdp: any) {
    if (!this.pc) throw new Error('PeerConnection not initialized');

    const { RTCSessionDescription } = require('react-native-webrtc');
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    signalingService.sendAnswer(this.remoteDeviceId, answer);
  }

  async handleAnswer(sdp: any) {
    if (!this.pc) throw new Error('PeerConnection not initialized');

    const { RTCSessionDescription } = require('react-native-webrtc');
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
  }

  async handleCandidate(candidate: any) {
    if (!this.pc) throw new Error('PeerConnection not initialized');

    const { RTCIceCandidate } = require('react-native-webrtc');
    await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
  }

  getLocalStream() {
    return this.localStream;
  }

  getRemoteStream() {
    return this.remoteStream;
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
  }
}

export const webrtcService = new WebRTCService();
