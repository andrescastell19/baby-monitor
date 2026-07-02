import { useState, useEffect, useCallback, useRef } from 'react';
import { WebSocketSignalingAdapter } from '../../../adapters/signaling/WebSocketSignalingAdapter';
import { WebSocketRelayAdapter } from '../../../adapters/streaming/WebSocketRelayAdapter';
import { InitializeCamera } from '../../../core/usecases/InitializeCamera';
import { InitializeMonitor } from '../../../core/usecases/InitializeMonitor';
import { useAppStore } from '../../../infra/store/zustandStore';
import { SignalingMessage, ConnectionStatus } from '../../../types';

export function useInitialize() {
  const { connection, setStatus } = useAppStore();
  const [currentFrame, setCurrentFrame] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<string>('new');
  const [signalingStatus, setSignalingStatus] = useState<string>('disconnected');
  const [connectedMonitors, setConnectedMonitors] = useState<string[]>([]);

  const signalingRef = useRef<WebSocketSignalingAdapter | null>(null);
  const relayStreamRef = useRef<WebSocketRelayAdapter | null>(null);
  const initializedRef = useRef(false);

  const handleSignalingMessage = useCallback((message: SignalingMessage) => {
    const relayStream = relayStreamRef.current;

    switch (message.type) {
      case 'monitor-online':
        relayStream?.addMonitor(message.deviceId, message.platform || 'android');
        break;
      case 'monitor-offline':
        relayStream?.removeMonitor(message.deviceId);
        break;
      case 'frame':
        if (typeof message.payload === 'string') {
          setCurrentFrame(message.payload);
        }
        break;
      case 'alert':
        break;
      case 'ping':
        signalingRef.current?.send({ type: 'pong', deviceId: connection.localDevice?.id || '' } as any);
        break;
    }
  }, [connection.localDevice?.id]);

  useEffect(() => {
    if (initializedRef.current) return;
    const localDevice = connection.localDevice;
    if (!localDevice) return;

    initializedRef.current = true;

    const signaling = new WebSocketSignalingAdapter();
    const relayStream = new WebSocketRelayAdapter(signaling);

    signalingRef.current = signaling;
    relayStreamRef.current = relayStream;

    signaling.onMessage(handleSignalingMessage);
    signaling.onStatus((status: ConnectionStatus) => {
      setSignalingStatus(status);
      setStatus(status);
    });
    signaling.onReconnect(() => {});

    relayStream.setDeviceId(localDevice.id);

    signaling.connect(localDevice.id, 'camera', 'android');
  }, [connection.localDevice?.id]);

  const initializeAsCamera = useCallback(async () => {
    const signaling = signalingRef.current;
    const relayStream = relayStreamRef.current;
    if (!signaling || !relayStream) return;

    const localDevice = connection.localDevice;

    const useCase = new InitializeCamera(signaling, relayStream);
    await useCase.execute(
      localDevice?.id || '',
      (state: string) => setConnectionState(state),
      (monitors: string[]) => setConnectedMonitors(monitors)
    );
  }, [connection.localDevice, handleSignalingMessage, setStatus]);

  const initializeAsMonitor = useCallback(async () => {
    const signaling = new WebSocketSignalingAdapter();
    const relayStream = new WebSocketRelayAdapter(signaling);

    signalingRef.current = signaling;
    relayStreamRef.current = relayStream;

    signaling.onMessage(handleSignalingMessage);
    signaling.onStatus((status: ConnectionStatus) => {
      setSignalingStatus(status);
      setStatus(status);
    });
    signaling.onReconnect(() => {});

    relayStream.onRemoteStream((frame: string) => setCurrentFrame(frame));

    const localDevice = connection.localDevice;
    const remoteDevice = connection.remoteDevice;

    if (localDevice && remoteDevice) {
      signaling.connect(localDevice.id, 'monitor', 'android');

      const useCase = new InitializeMonitor(signaling, relayStream);
      useCase.execute(
        localDevice.id,
        remoteDevice.id,
        (frame: string) => setCurrentFrame(frame),
        (state: string) => setConnectionState(state)
      );
    }
  }, [connection.localDevice, connection.remoteDevice, handleSignalingMessage, setStatus]);

  const sendFrame = useCallback((base64: string) => {
    relayStreamRef.current?.sendFrame(base64);
  }, []);

  const disconnect = useCallback(() => {
    signalingRef.current?.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    currentFrame,
    connectionState,
    signalingStatus,
    connectedMonitors,
    initializeAsCamera,
    initializeAsMonitor,
    sendFrame,
    disconnect,
  };
}
