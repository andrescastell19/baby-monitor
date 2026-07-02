import { useState, useEffect, useCallback, useRef } from 'react';
import { MediaStream } from 'react-native-webrtc';
import { WebSocketSignalingAdapter } from '../../../adapters/signaling/WebSocketSignalingAdapter';
import { WebRTCStreamAdapter } from '../../../adapters/streaming/WebRTCStreamAdapter';
import { InitializeCamera } from '../../../core/usecases/InitializeCamera';
import { InitializeMonitor } from '../../../core/usecases/InitializeMonitor';
import { useAppStore } from '../../../infra/store/zustandStore';
import { SignalingMessage, ConnectionStatus } from '../../../types';

const TAG = '[useInitialize]';

export function useInitialize() {
  const { connection, setStatus } = useAppStore();
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [connectionState, setConnectionState] = useState<string>('new');
  const [signalingStatus, setSignalingStatus] = useState<string>('disconnected');
  const [connectedMonitors, setConnectedMonitors] = useState<string[]>([]);

  const signalingRef = useRef<WebSocketSignalingAdapter | null>(null);
  const webrtcStreamRef = useRef<WebRTCStreamAdapter | null>(null);
  const initializedRef = useRef(false);

  const handleSignalingMessage = useCallback((message: SignalingMessage) => {
    const webrtcStream = webrtcStreamRef.current;
    console.log(`${TAG} Received: ${message.type} from=${message.deviceId || 'unknown'}`);

    switch (message.type) {
      case 'monitor-online':
        console.log(`${TAG} Monitor online: ${message.deviceId} platform=${message.platform || 'android'}`);
        webrtcStream?.addMonitor(message.deviceId, message.platform || 'android');
        break;
      case 'monitor-offline':
        console.log(`${TAG} Monitor offline: ${message.deviceId}`);
        webrtcStream?.removeMonitor(message.deviceId);
        break;
      case 'offer':
        console.log(`${TAG} Offer received from=${message.deviceId} payload=${JSON.stringify(message.payload).substring(0, 100)}...`);
        if (message.payload) {
          webrtcStream?.handleOffer(message.payload, message.deviceId);
        }
        break;
      case 'answer':
        console.log(`${TAG} Answer received from=${message.deviceId}`);
        if (message.payload) {
          webrtcStream?.handleAnswer(message.payload, message.deviceId);
        }
        break;
      case 'candidate':
        console.log(`${TAG} Candidate received from=${message.deviceId}`);
        if (message.payload) {
          webrtcStream?.handleCandidate(message.payload, message.deviceId);
        }
        break;
      case 'renegotiate':
        console.log(`${TAG} Renegotiate from=${message.deviceId}`);
        webrtcStream?.handleRenegotiate(message.deviceId);
        break;
      case 'alert':
        console.log(`${TAG} Alert from=${message.deviceId}`);
        break;
      case 'ping':
        console.log(`${TAG} Ping from=${message.deviceId}`);
        signalingRef.current?.send({ type: 'pong', deviceId: connection.localDevice?.id || '' } as any);
        break;
      default:
        console.log(`${TAG} Unknown message type: ${message.type}`);
    }
  }, [connection.localDevice?.id]);

  useEffect(() => {
    if (initializedRef.current) return;
    const localDevice = connection.localDevice;
    if (!localDevice) return;

    initializedRef.current = true;

    console.log(`${TAG} Initializing: role=${localDevice.role} id=${localDevice.id}`);

    const signaling = new WebSocketSignalingAdapter();
    const webrtcStream = new WebRTCStreamAdapter(signaling);

    signalingRef.current = signaling;
    webrtcStreamRef.current = webrtcStream;

    signaling.onMessage(handleSignalingMessage);
    signaling.onStatus((status: ConnectionStatus) => {
      console.log(`${TAG} Signaling status: ${status}`);
      setSignalingStatus(status);
      setStatus(status);
    });
    signaling.onReconnect(() => {
      console.log(`${TAG} Signaling reconnecting...`);
    });

    webrtcStream.setDeviceId(localDevice.id);

    webrtcStream.onConnectionState((state: string) => {
      console.log(`${TAG} WebRTC connection state: ${state}`);
      setConnectionState(state);
    });
    webrtcStream.onMonitorsChange((monitors: string[]) => {
      console.log(`${TAG} Connected monitors changed: [${monitors.join(', ')}]`);
      setConnectedMonitors(monitors);
    });
    webrtcStream.onRemoteStream((stream: MediaStream) => {
      console.log(`${TAG} Remote stream received! videoTracks=${stream.getVideoTracks().length} audioTracks=${stream.getAudioTracks().length}`);
      setRemoteStream(stream);
    });

    signaling.connect(localDevice.id, localDevice.role || 'camera', 'android');
    console.log(`${TAG} Connecting signaling as role=${localDevice.role} id=${localDevice.id}`);
  }, [connection.localDevice?.id]);

  const initializeAsCamera = useCallback(async (stream: MediaStream) => {
    const signaling = signalingRef.current;
    const webrtcStream = webrtcStreamRef.current;
    if (!signaling || !webrtcStream) {
      console.log(`${TAG} initializeAsCamera: signaling or webrtcStream is null!`);
      return;
    }

    console.log(`${TAG} initializeAsCamera: videoTracks=${stream.getVideoTracks().length} audioTracks=${stream.getAudioTracks().length}`);
    setLocalStream(stream);

    const localDevice = connection.localDevice;

    const useCase = new InitializeCamera(signaling, webrtcStream);
    await useCase.execute(
      localDevice?.id || '',
      (state: string) => {
        console.log(`${TAG} InitializeCamera connectionState: ${state}`);
        setConnectionState(state);
      },
      (monitors: string[]) => {
        console.log(`${TAG} InitializeCamera monitors: [${monitors.join(', ')}]`);
        setConnectedMonitors(monitors);
      }
    );

    console.log(`${TAG} Starting WebRTC stream...`);
    await webrtcStream.startSending(stream);
    console.log(`${TAG} WebRTC stream started`);
  }, [connection.localDevice]);

  const initializeAsMonitor = useCallback(async () => {
    const signaling = signalingRef.current;
    const webrtcStream = webrtcStreamRef.current;
    if (!signaling || !webrtcStream) {
      console.log(`${TAG} initializeAsMonitor: signaling or webrtcStream is null!`);
      return;
    }

    console.log(`${TAG} initializeAsMonitor called`);

    const localDevice = connection.localDevice;
    const remoteDevice = connection.remoteDevice;

    if (localDevice && remoteDevice) {
      const useCase = new InitializeMonitor(signaling, webrtcStream);
      useCase.execute(
        localDevice.id,
        remoteDevice.id,
        (stream: MediaStream) => {
          console.log(`${TAG} InitializeMonitor onRemoteStream callback! videoTracks=${stream.getVideoTracks().length}`);
          setRemoteStream(stream);
        },
        (state: string) => {
          console.log(`${TAG} InitializeMonitor onConnectionState: ${state}`);
          setConnectionState(state);
        }
      );
      console.log(`${TAG} InitializeMonitor executed, waiting for offers...`);
    }
  }, [connection.localDevice, connection.remoteDevice]);

  const disconnect = useCallback(() => {
    console.log(`${TAG} Disconnecting`);
    signalingRef.current?.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    localStream,
    remoteStream,
    connectionState,
    signalingStatus,
    connectedMonitors,
    initializeAsCamera,
    initializeAsMonitor,
    disconnect,
  };
}
