import { Camera } from 'expo-camera';
import { Alert as RNAlert } from 'react-native';

export interface PermissionResult {
  granted: boolean;
  canAskAgain: boolean;
}

export async function requestCameraPermissions(): Promise<PermissionResult> {
  try {
    const { status, canAskAgain } = await Camera.requestCameraPermissionsAsync();
    return { granted: status === 'granted', canAskAgain };
  } catch (error) {
    console.error('Error requesting camera permissions:', error);
    return { granted: false, canAskAgain: false };
  }
}

export async function requestMicrophonePermissions(): Promise<PermissionResult> {
  try {
    const { status, canAskAgain } = await Camera.requestMicrophonePermissionsAsync();
    return { granted: status === 'granted', canAskAgain };
  } catch (error) {
    console.error('Error requesting microphone permissions:', error);
    return { granted: false, canAskAgain: false };
  }
}

export async function requestAllPermissions(): Promise<PermissionResult> {
  const camera = await requestCameraPermissions();
  const microphone = await requestMicrophonePermissions();

  const granted = camera.granted && microphone.granted;

  if (!granted && !camera.canAskAgain && !microphone.canAskAgain) {
    RNAlert.alert(
      'Permisos requeridos',
      'La aplicación necesita acceso a la cámara y micrófono para funcionar. Por favor, habilita los permisos en la configuración del dispositivo.',
      [{ text: 'OK' }]
    );
  }

  return { granted, canAskAgain: camera.canAskAgain || microphone.canAskAgain };
}

export async function checkPermissions(): Promise<boolean> {
  const camera = await Camera.getCameraPermissionsAsync();
  const microphone = await Camera.getMicrophonePermissionsAsync();
  return camera.status === 'granted' && microphone.status === 'granted';
}
