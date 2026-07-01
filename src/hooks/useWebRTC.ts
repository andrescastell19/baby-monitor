import { useState, useEffect, useRef, useCallback } from 'react';
import { webrtcService } from '../services/webrtc';
import { signalingService } from '../services/signaling';
import { useConnectionStore } from '../stores/connectionStore';
import { SignalingMessage, SDPMessage, AlertPayload } from '../types';

export function useWebRTC() {
  const [remoteStream, setRemoteStream] = useState<any>(null);
  const [localStream, setLocalStream] = useState<any>(null);
  const [connectionState, setConnectionState] = useState<string>('new');
  const [signalingStatus, setSignalingStatus] = useState<string>('disconnected');
  const [connectedMonitors, setConnectedMonitors] = useState<string[]>([]);
  const { setStatus, setError, localDevice, addAlert } = useConnectionStore();
  const signalingConnected = useRef(false);
  const isInitialized = useRef(false);

  const handleSignalingMessage = useCallback(async (message: SignalingMessage) => {
    console.log('Signaling message received:', message.type);
    try {
      switch (message.type) {
        case 'offer': {
          const sdp = (message.payload as SDPMessage)?.sdp;
          if (sdp) {
            console.log('Handling WebRTC offer from:', message.deviceId);
            await webrtcService.handleOffer(sdp, message.deviceId);
          }
          break;
        }
        case 'answer': {
          const sdp = (message.payload as SDPMessage)?.sdp;
          if (sdp) {
            console.log('Handling WebRTC answer from:', message.deviceId);
            await webrtcService.handleAnswer(sdp, message.deviceId);
          }
          break;
        }
        case 'candidate': {
          const candidate = (message.payload as SDPMessage)?.candidate;
          if (candidate) {
            console.log('Handling ICE candidate from:', message.deviceId);
            await webrtcService.handleCandidate(candidate, message.deviceId);
          }
          break;
        }
        case 'monitor-online': {
          console.log('Monitor online:', message.deviceId);
          await webrtcService.addMonitor(message.deviceId);
          setConnectedMonitors(webrtcService.getConnectedMonitors());
          break;
        }
        case 'monitor-offline': {
          console.log('Monitor offline:', message.deviceId);
          webrtcService.removeMonitor(message.deviceId);
          setConnectedMonitors(webrtcService.getConnectedMonitors());
          break;
        }
        case 'alert':
          if (message.payload) {
            const alertPayload = message.payload as AlertPayload;
            console.log('Alert received:', alertPayload.type, alertPayload.message);
            addAlert({
              id: Date.now().toString(),
              type: alertPayload.type,
              timestamp: Date.now(),
              message: alertPayload.message,
              read: false,
            });
          }
          break;
        case 'ping':
          signalingService.send({ type: 'pong', deviceId: localDevice?.id || '' } as any);
          break;
        case 'pong':
          console.log('Keepalive pong received');
          break;
        case 'renegotiate':
          console.log('Renegotiate requested by remote');
          webrtcService.handleRenegotiate(message.deviceId);
          break;
      }
    } catch (err) {
      console.error('Error handling signaling message:', message.type, err);
    }
  }, [addAlert, localDevice?.id]);

  const handleStatus = useCallback((status: 'connected' | 'disconnected' | 'error') => {
    console.log('Signaling status:', status);
    setSignalingStatus(status);
    if (status === 'connected') {
      setStatus('connecting');
    } else if (status === 'disconnected') {
      setStatus('disconnected');
    } else if (status === 'error') {
      setError('Error de conexión con el servidor');
    }
  }, [setStatus, setError]);

  const handleReconnect = useCallback(() => {
    if (isInitialized.current) {
      const pc = webrtcService.getPeerConnection();
      const state = pc?.connectionState;
      if (state === 'connected' || state === 'completed') {
        console.log('Signaling reconnected but PC is connected, skipping renegotiate');
      } else {
        console.log('Signaling reconnected and PC is', state, 'renegotiating...');
        webrtcService.renegotiate();
      }
    }
  }, []);

  useEffect(() => {
    if (!localDevice || signalingConnected.current) return;
    signalingConnected.current = true;

    console.log('Connecting to signaling with device:', localDevice.id, 'role:', localDevice.role);
    setSignalingStatus('connecting');
    signalingService.connect(localDevice.id, localDevice.role, handleSignalingMessage, handleStatus, handleReconnect);

    return () => {
      signalingService.disconnect();
      webrtcService.disconnect();
    };
  }, [localDevice, handleSignalingMessage, handleStatus, handleReconnect]);

  const initializeAsCamera = useCallback(async () => {
    if (!localDevice) {
      throw new Error('Faltan datos de dispositivos. Asegúrate de haber seleccionado un rol.');
    }

    console.log('Initializing camera:', localDevice.id);
    isInitialized.current = true;

    await webrtcService.initializeAsCamera(
      localDevice.id,
      '',
      (stream) => {
        console.log('Local stream received');
        setLocalStream(stream);
        setRemoteStream(stream);
      },
      (state) => {
        console.log('Connection state:', state);
        setConnectionState(state);
        if (state === 'connected') {
          setStatus('connected');
        } else if (state === 'failed') {
          setError('Conexión fallida');
        } else if (state === 'disconnected') {
          setStatus('connecting');
        }
      },
      (monitors) => {
        setConnectedMonitors(monitors);
      }
    );

    const local = webrtcService.getLocalStream();
    if (local) {
      setLocalStream(local);
    }
  }, [localDevice, setStatus, setError]);

  const initializeAsMonitor = useCallback(async () => {
    if (!localDevice) {
      throw new Error('Faltan datos de dispositivos. Asegúrate de haber seleccionado un rol.');
    }

    console.log('Initializing monitor:', localDevice.id);
    isInitialized.current = true;

    await webrtcService.initializeAsMonitor(
      localDevice.id,
      '',
      (stream) => {
        console.log('Remote stream received');
        setRemoteStream(stream);
      },
      (state) => {
        console.log('Connection state:', state);
        setConnectionState(state);
        if (state === 'connected') {
          setStatus('connected');
        } else if (state === 'failed') {
          setError('Conexión fallida');
        } else if (state === 'disconnected') {
          setStatus('connecting');
        }
      }
    );
  }, [localDevice, setStatus, setError]);

  const muteAudio = useCallback(() => {
    webrtcService.muteAudio();
  }, []);

  const unmuteAudio = useCallback(() => {
    webrtcService.unmuteAudio();
  }, []);

  const disconnect = useCallback(() => {
    webrtcService.disconnect();
    signalingService.disconnect();
  }, []);

  return {
    remoteStream,
    localStream,
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
