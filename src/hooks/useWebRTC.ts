import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import { webrtcService } from '../services/webrtc';
import { signalingService } from '../services/signaling';
import { useConnectionStore } from '../stores/connectionStore';
import { SignalingMessage, SDPMessage, AlertPayload } from '../types';

export function useWebRTC() {
  const [remoteStream, setRemoteStream] = useState<any>(null);
  const [localStream, setLocalStream] = useState<any>(null);
  const [connectionState, setConnectionState] = useState<string>('new');
  const [signalingStatus, setSignalingStatus] = useState<string>('disconnected');
  const { setStatus, setError, localDevice, remoteDevice, addAlert } = useConnectionStore();
  const signalingConnected = useRef(false);

  const handleSignalingMessage = useCallback(async (message: SignalingMessage) => {
    console.log('Signaling message received:', message.type);
    try {
      switch (message.type) {
        case 'offer': {
          const sdp = (message.payload as SDPMessage)?.sdp;
          if (sdp) {
            console.log('Handling WebRTC offer from:', message.deviceId);
            await webrtcService.handleOffer(sdp);
          }
          break;
        }
        case 'answer': {
          const sdp = (message.payload as SDPMessage)?.sdp;
          if (sdp) {
            console.log('Handling WebRTC answer from:', message.deviceId);
            await webrtcService.handleAnswer(sdp);
          }
          break;
        }
        case 'candidate': {
          const candidate = (message.payload as SDPMessage)?.candidate;
          if (candidate) {
            console.log('Handling ICE candidate from:', message.deviceId);
            await webrtcService.handleCandidate(candidate);
          }
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
      }
    } catch (err) {
      console.error('Error handling signaling message:', message.type, err);
    }
  }, [addAlert]);

  const handleStatus = useCallback((status: 'connected' | 'disconnected' | 'error') => {
    console.log('Signaling status:', status);
    setSignalingStatus(status);
    if (status === 'connected') {
      setStatus('connecting');
    } else if (status === 'error') {
      setError('Error de conexión con el servidor');
    }
  }, [setStatus, setError]);

  useEffect(() => {
    if (!localDevice || signalingConnected.current) return;
    signalingConnected.current = true;

    console.log('Connecting to signaling with device:', localDevice.id, 'role:', localDevice.role);
    setSignalingStatus('connecting');
    signalingService.connect(localDevice.id, localDevice.role, handleSignalingMessage, handleStatus);

    return () => {
      signalingService.disconnect();
      webrtcService.disconnect();
    };
  }, [localDevice, handleSignalingMessage, handleStatus]);

  const initializeAsCamera = useCallback(async () => {
    if (!localDevice || !remoteDevice) {
      throw new Error('Faltan datos de dispositivos. Asegúrate de haber seleccionado un rol.');
    }

    console.log('Initializing camera:', localDevice.id, '->', remoteDevice.id);

    await webrtcService.initializeAsCamera(
      localDevice.id,
      remoteDevice.id,
      (stream) => {
        console.log('Local stream received');
        setLocalStream(stream);
        setRemoteStream(stream);
      },
      (state) => {
        console.log('Connection state:', state);
        setConnectionState(state);
        if (state === 'connected') setStatus('connected');
        if (state === 'failed') setError('Conexión fallida');
      }
    );

    const local = webrtcService.getLocalStream();
    if (local) {
      setLocalStream(local);
    }

    await webrtcService.createOffer();
  }, [localDevice, remoteDevice]);

  const initializeAsMonitor = useCallback(async () => {
    if (!localDevice || !remoteDevice) {
      throw new Error('Faltan datos de dispositivos. Asegúrate de haber seleccionado un rol.');
    }

    console.log('Initializing monitor:', localDevice.id, '->', remoteDevice.id);

    await webrtcService.initializeAsMonitor(
      localDevice.id,
      remoteDevice.id,
      (stream) => {
        console.log('Remote stream received');
        setRemoteStream(stream);
      },
      (state) => {
        console.log('Connection state:', state);
        setConnectionState(state);
        if (state === 'connected') setStatus('connected');
        if (state === 'failed') setError('Conexión fallida');
      }
    );
  }, [localDevice, remoteDevice]);

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
    initializeAsCamera,
    initializeAsMonitor,
    muteAudio,
    unmuteAudio,
    disconnect,
  };
}
