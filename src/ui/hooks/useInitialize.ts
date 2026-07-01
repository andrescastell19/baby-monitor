import { useState, useEffect, useCallback, useRef } from 'react';
import { MediaStream } from 'react-native-webrtc';
import { WebSocketSignalingAdapter } from '../../adapters/signaling/WebSocketSignalingAdapter';
import { WebRTCStreamAdapter } from '../../adapters/streaming/WebRTCStreamAdapter';
import { WebSocketRelayAdapter } from '../../adapters/streaming/WebSocketRelayAdapter';
import { InitializeCamera } from '../../core/usecases/InitializeCamera';
import { InitializeMonitor } from '../../core/usecases/InitializeMonitor';
import { useAppStore } from '../../infra/store/zustandStore';
import { SignalingMessage } from '../../types';

export function useInitialize() {
  const { connection, setLocalDevice, setStatus, setRemoteDevice } = useAppStore();
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<any>(null);
  const [connectionState, setConnectionState] = useState<string>('new');
  const [signalingStatus, setSignalingStatus] = useState<string>('disconnected');
  const [connectedMonitors, setConnectedMonitors] = useState<string[]>([]);

  const signalingRef = useRef<WebSocketSignalingAdapter | null>(null);
  const webrtcStreamRef = useRef<WebRTCStreamAdapter | null>(null);
  const relayStreamRef = useRef<WebSocketRelayAdapter | null>(null);

  const handleSignalingMessage = useCallback((message: SignalingMessage) => {
    const webrtcStream = webrtcStreamRef.current;
    const relayStream = relayStreamRef.current;

    switch (message.type) {
      case 'offer':
        if (message.payload && typeof message.payload === 'object' && 'sdp' in message.payload) {
          webrtcStream?.handleOffer(message.payload.sdp, message.deviceId);
        }
        break;
      case 'answer':
        if (message.payload && typeof message.payload === 'object' && 'sdp' in message.payload) {
          webrtcStream?.handleAnswer(message.payload.sdp, message.deviceId);
        }
        break;
      case 'candidate':
        if (message.payload && typeof message.payload === 'object' && 'candidate' in message.payload) {
          webrtcStream?.handleCandidate(message.payload.candidate, message.deviceId);
        }
        break;
      case 'monitor-online':
        if (message.platform === 'web') {
          relayStream?.addMonitor(message.deviceId, 'web');
        } else {
          webrtcStream?.addMonitor(message.deviceId, message.platform || 'android');
        }
        break;
      case 'monitor-offline':
        webrtcStream?.removeMonitor(message.deviceId);
        relayStream?.removeMonitor(message.deviceId);
        break;
      case 'renegotiate':
        webrtcStream?.handleRenegotiate(message.deviceId);
        break;
      case 'frame':
        if (relayStream && typeof message.payload === 'string') {
          relayStream.handleFrame(message.payload);
        }
        break;
      case 'alert':
        break;
      case 'ping':
        signalingRef.current?.send({ type: 'pong', deviceId: connection.localDevice?.id || '' } as any);
        break;
    }
  }, [connection.localDevice?.id]);

  const initializeAsCamera = useCallback(async () => {
    const signaling = new WebSocketSignalingAdapter();
    const webrtcStream = new WebRTCStreamAdapter(signaling);
    const relayStream = new WebSocketRelayAdapter(signaling);

    signalingRef.current = signaling;
    webrtcStreamRef.current = webrtcStream;
    relayStreamRef.current = relayStream;

    signaling.onMessage(handleSignalingMessage);
    signaling.onStatus((status) => {
      setSignalingStatus(status);
      setStatus(status);
    });
    signaling.onReconnect(() => {
      if (connectionState === 'connected') {
        // Reconnect handled by adapters
      }
    });

    const localDevice = connection.localDevice;
    if (localDevice) {
      webrtcStream.setDeviceId(localDevice.id);
      relayStream.setDeviceId(localDevice.id);
    }

    const useCase = new InitializeCamera(signaling, webrtcStream);
    await useCase.execute(
      localDevice?.id || '',
      (stream) => setLocalStream(stream),
      (state) => setConnectionState(state),
      (monitors) => setConnectedMonitors(monitors)
    );
  }, [connection.localDevice, connectionState, handleSignalingMessage, setStatus]);

  const initializeAsMonitor = useCallback(async () => {
    const signaling = new WebSocketSignalingAdapter();
    const webrtcStream = new WebRTCStreamAdapter(signaling);

    signalingRef.current = signaling;
    webrtcStreamRef.current = webrtcStream;

    signaling.onMessage(handleSignalingMessage);
    signaling.onStatus((status) => {
      setSignalingStatus(status);
      setStatus(status);
    });
    signaling.onReconnect(() => {});

    webrtcStream.onRemoteStream((stream) => setRemoteStream(stream));
    webrtcStream.onConnectionState((state) => setConnectionState(state));

    const localDevice = connection.localDevice;
    const remoteDevice = connection.remoteDevice;

    if (localDevice && remoteDevice) {
      const useCase = new InitializeMonitor(signaling, webrtcStream);
      useCase.execute(
        localDevice.id,
        remoteDevice.id,
        (stream) => setRemoteStream(stream),
        (state) => setConnectionState(state)
      );
    }
  }, [connection.localDevice, connection.remoteDevice, handleSignalingMessage, setStatus]);

  const muteAudio = useCallback(() => {
    webrtcStreamRef.current?.muteAudio();
  }, []);

  const unmuteAudio = useCallback(() => {
    webrtcStreamRef.current?.unmuteAudio();
  }, []);

  const disconnect = useCallback(() => {
    signalingRef.current?.disconnect();
    webrtcStreamRef.current?.stopSending();
    relayStreamRef.current?.stopSending();
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
    muteAudio,
    unmuteAudio,
    disconnect,
  };
}
