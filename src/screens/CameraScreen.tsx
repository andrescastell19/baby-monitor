import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { RTCView } from 'react-native-webrtc';
import { useWebRTC } from '../hooks/useWebRTC';
import { useConnectionStore } from '../stores/connectionStore';

export default function CameraScreen() {
  const { localDevice, remoteDevice } = useConnectionStore();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();
  const { localStream, connectionState, initializeAsCamera, signalingStatus } = useWebRTC();
  const [isStreaming, setIsStreaming] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-15), `${time} ${msg}`]);
  };

  useEffect(() => {
    addLog(`localDevice: ${localDevice?.id || 'null'} (${localDevice?.role || 'null'})`);
    addLog(`remoteDevice: ${remoteDevice?.id || 'null'} (${remoteDevice?.role || 'null'})`);
    addLog(`signaling: ${signalingStatus}`);
  }, [localDevice, remoteDevice, signalingStatus]);

  useEffect(() => {
    if (connectionState === 'connected') {
      setIsStreaming(true);
      addLog('WebRTC CONECTADO');
    }
    if (connectionState !== 'new') {
      addLog(`WebRTC state: ${connectionState}`);
    }
  }, [connectionState]);

  const startStreaming = async () => {
    setError(null);
    addLog('--- Iniciando transmisión ---');

    if (!localDevice) {
      setError('No hay device local. Vuelve atrás y selecciona un rol.');
      addLog('ERROR: localDevice null');
      return;
    }
    addLog(`localDevice OK: ${localDevice.id}`);

    if (!remoteDevice) {
      setError('No hay device remoto. Asegúrate de tener el dashboard web abierto.');
      addLog('ERROR: remoteDevice null');
      return;
    }
    addLog(`remoteDevice OK: ${remoteDevice.id}`);

    if (signalingStatus !== 'connected') {
      setError(`Servidor signaling no conectado (estado: ${signalingStatus}). Verifica que node server/index.js esté corriendo.`);
      addLog(`ERROR: signaling not connected (${signalingStatus})`);
      return;
    }
    addLog('signaling OK');

    setIsConnecting(true);
    try {
      addLog('Llamando initializeAsCamera...');
      await initializeAsCamera();
      addLog('initializeAsCamera completado');
      addLog(`localStream: ${localStream ? 'OK' : 'null'}`);
      addLog(`connectionState: ${connectionState}`);
    } catch (err: any) {
      const msg = err?.message || String(err);
      const fullMsg = `Error al iniciar cámara: ${msg}`;
      setError(fullMsg);
      addLog(`ERROR: ${fullMsg}`);
      addLog(`ERROR stack: ${err?.stack || 'N/A'}`);
      console.error('Camera init error:', err);
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
          <View style={[styles.statusDot, {
            backgroundColor: isStreaming ? '#4CAF50' : error ? '#F44336' : '#FF9800'
          }]} />
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>❌ {error}</Text>
          </View>
        ) : null}

        <View style={styles.logBox}>
          <Text style={styles.logTitle}>Logs:</Text>
          <ScrollView style={styles.logScroll}>
            {logs.map((log, i) => (
              <Text key={i} style={styles.logText}>{log}</Text>
            ))}
          </ScrollView>
        </View>

        <View style={styles.footer}>
          <Text style={styles.statusText}>
            {isStreaming ? 'Transmitiendo...' : isConnecting ? 'Conectando...' : connectionState === 'connected' ? 'Conectado' : 'Esperando conexión...'}
          </Text>
          {localDevice && (
            <Text style={styles.deviceText}>ID: {localDevice.id}</Text>
          )}
          {remoteDevice && (
            <Text style={styles.deviceText}>Remoto: {remoteDevice.id}</Text>
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
    padding: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 12,
    borderRadius: 10,
  },
  title: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  errorBox: {
    backgroundColor: 'rgba(244,67,54,0.9)',
    padding: 12,
    borderRadius: 8,
  },
  errorText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  footer: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 12,
    borderRadius: 10,
  },
  statusText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  deviceText: {
    color: '#AAA',
    fontSize: 10,
    marginTop: 2,
  },
  streamButton: {
    backgroundColor: '#4CAF50',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
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
  logBox: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 8,
    borderRadius: 10,
    maxHeight: 150,
  },
  logTitle: {
    color: '#888',
    fontSize: 10,
    marginBottom: 4,
  },
  logScroll: {
    flex: 1,
  },
  logText: {
    color: '#0F0',
    fontSize: 9,
    fontFamily: 'monospace',
    marginBottom: 1,
  },
});
