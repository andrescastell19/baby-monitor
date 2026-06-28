import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import { webrtcService } from '../services/webrtc';
import { signalingService } from '../services/signaling';
import { useConnectionStore } from '../stores/connectionStore';
import { SignalingMessage } from '../types';

export function useWebRTC() {
  const [remoteStream, setRemoteStream] = useState<any>(null);
  const [localStream, setLocalStream] = useState<any>(null);
  const [connectionState, setConnectionState] = useState<string>('new');
  const { setStatus, setError, localDevice, remoteDevice } = useConnectionStore();
  const signalingConnected = useRef(false);

  const handleSignalingMessage = useCallback((message: SignalingMessage) => {
    switch (message.type) {
      case 'offer':
        if (message.payload?.sdp) {
          webrtcService.handleOffer(message.payload.sdp);
        }
        break;
      case 'answer':
        if (message.payload?.sdp) {
          webrtcService.handleAnswer(message.payload.sdp);
        }
        break;
      case 'candidate':
        if (message.payload?.candidate) {
          webrtcService.handleCandidate(message.payload.candidate);
        }
        break;
    }
  }, []);

  const handleStatus = useCallback((status: 'connected' | 'disconnected' | 'error') => {
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
    initializeAsCamera,
    initializeAsMonitor,
    muteAudio,
    unmuteAudio,
    disconnect,
  };
}
