import { useState, useEffect, useRef, useCallback } from 'react';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { useConnectionStore } from '../stores/connectionStore';

export function useCamera() {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isReady, setIsReady] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const { setStatus, setLocalDevice } = useConnectionStore();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();

  useEffect(() => {
    if (cameraPermission && microphonePermission) {
      setHasPermission(cameraPermission.granted && microphonePermission.granted);
    }
  }, [cameraPermission, microphonePermission]);

  useEffect(() => {
    if (!cameraPermission || !cameraPermission.granted) {
      requestCameraPermission();
    }
    if (!microphonePermission || !microphonePermission.granted) {
      requestMicrophonePermission();
    }
  }, []);

  const onCameraReady = useCallback(() => {
    setIsReady(true);
    setLocalDevice({
      id: 'local-camera',
      name: 'Cámara del bebé',
      role: 'camera',
      isOnline: true,
    });
    setStatus('connected');
  }, []);

  const takePicture = useCallback(async () => {
    if (!cameraRef.current) return null;

    try {
      const photo = await cameraRef.current.takePictureAsync();
      return photo;
    } catch (error) {
      console.error('Error taking picture:', error);
      return null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (!cameraRef.current) return null;

    try {
      const video = await cameraRef.current.recordAsync();
      return video;
    } catch (error) {
      console.error('Error starting recording:', error);
      return null;
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (cameraRef.current) {
      cameraRef.current.stopRecording();
    }
  }, []);

  return {
    cameraRef,
    hasPermission,
    isReady,
    onCameraReady,
    takePicture,
    startRecording,
    stopRecording,
  };
}
