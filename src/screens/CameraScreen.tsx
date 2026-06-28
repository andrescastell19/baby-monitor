import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Alert } from 'react-native';
import { useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { RTCView } from 'react-native-webrtc';
import { useWebRTC } from '../hooks/useWebRTC';
import { useConnectionStore } from '../stores/connectionStore';

export default function CameraScreen() {
  const { localDevice, remoteDevice } = useConnectionStore();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();
  const { localStream, connectionState, initializeAsCamera } = useWebRTC();
  const [isStreaming, setIsStreaming] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    if (connectionState === 'connected') {
      setIsStreaming(true);
    }
  }, [connectionState]);

  const startStreaming = async () => {
    if (!remoteDevice) {
      Alert.alert('Error', 'No hay monitor conectado. Abre el dashboard web primero.');
      return;
    }
    setIsConnecting(true);
    try {
      await initializeAsCamera();
    } catch (error: any) {
      Alert.alert('Error', 'No se pudo iniciar la cámara: ' + (error.message || error));
    } finally {
      setIsConnecting(false);
    }
  };

  if (!cameraPermission || !microphonePermission) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Solicitando permisos...</Text>
      </View>
    );
  }

  if (!cameraPermission.granted || !microphonePermission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Se necesita acceso a la cámara y micrófono</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={async () => {
            await requestCameraPermission();
            await requestMicrophonePermission();
          }}
        >
          <Text style={styles.buttonText}>Conceder permisos</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {localStream ? (
        <RTCView
          streamURL={localStream.toURL()}
          style={styles.video}
          objectFit="cover"
          mirror={false}
        />
      ) : (
        <View style={styles.cameraPlaceholder}>
          <Text style={styles.placeholderText}>📷</Text>
          <Text style={styles.placeholderLabel}>Cámara inicializando...</Text>
        </View>
      )}

      <View style={styles.overlay}>
        <View style={styles.header}>
          <Text style={styles.title}>Cámara Activa</Text>
          <View style={[styles.statusDot, { backgroundColor: isStreaming ? '#4CAF50' : '#FF9800' }]} />
        </View>

        <View style={styles.footer}>
          {isStreaming ? (
            <Text style={styles.statusText}>Transmitiendo...</Text>
          ) : isConnecting ? (
            <Text style={styles.statusText}>Conectando...</Text>
          ) : (
            <>
              <Text style={styles.statusText}>
                {connectionState === 'connected' ? 'Conectado' : 'Esperando conexión...'}
              </Text>
              {localDevice && (
                <Text style={styles.deviceText}>{localDevice.name}</Text>
              )}
            </>
          )}
          {!isStreaming && !isConnecting && (
            <TouchableOpacity style={styles.streamButton} onPress={startStreaming}>
              <Text style={styles.streamButtonText}>Iniciar Transmisión</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  video: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  cameraPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
  },
  placeholderText: {
    fontSize: 64,
  },
  placeholderLabel: {
    color: '#FFF',
    fontSize: 18,
    marginTop: 16,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 15,
    borderRadius: 10,
  },
  title: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  footer: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 15,
    borderRadius: 10,
  },
  statusText: {
    color: '#FFF',
    fontSize: 14,
  },
  deviceText: {
    color: '#AAA',
    fontSize: 12,
    marginTop: 5,
  },
  streamButton: {
    backgroundColor: '#4CAF50',
    padding: 12,
    borderRadius: 8,
    marginTop: 10,
    alignItems: 'center',
  },
  streamButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  text: {
    color: '#FFF',
    fontSize: 16,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#2196F3',
    padding: 15,
    borderRadius: 8,
    marginTop: 20,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
