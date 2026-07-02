import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, ScrollView, Platform, NativeModules } from 'react-native';
import { RTCView, mediaDevices } from 'react-native-webrtc';
import * as KeepAwake from 'expo-keep-awake';
import { useInitialize } from '../hooks/useInitialize';
import { useAppStore } from '../../../infra/store/zustandStore';

export default function CameraScreen() {
  const { connection } = useAppStore();
  const { localStream, connectionState, initializeAsCamera, signalingStatus, connectedMonitors } = useInitialize();
  const [isStreaming, setIsStreaming] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-15), `${time} ${msg}`]);
  }, []);

  useEffect(() => {
    addLog(`localDevice: ${connection.localDevice?.id || 'null'} (${connection.localDevice?.role || 'null'})`);
    addLog(`signaling: ${signalingStatus}`);
    addLog(`monitores: ${connectedMonitors.length}`);
  }, [connection.localDevice, signalingStatus, connectedMonitors, addLog]);

  useEffect(() => {
    if (connectionState !== 'new') {
      addLog(`Connection state: ${connectionState}`);
    }
  }, [connectionState, addLog]);

  useEffect(() => {
    return () => {
      KeepAwake.deactivateKeepAwake();
      if (Platform.OS === 'android' && NativeModules.BabyMonitor) {
        NativeModules.BabyMonitor.stopService();
      }
    };
  }, []);

  const startStreaming = async () => {
    setError(null);
    addLog('--- Iniciando transmisión ---');

    if (!connection.localDevice) {
      setError('No hay device local. Vuelve atrás y selecciona un rol.');
      addLog('ERROR: localDevice null');
      return;
    }
    addLog(`localDevice OK: ${connection.localDevice.id}`);

    if (signalingStatus !== 'connected') {
      setError(`Servidor signaling no conectado (estado: ${signalingStatus}). Verifica que el servidor esté corriendo.`);
      addLog(`ERROR: signaling not connected (${signalingStatus})`);
      return;
    }
    addLog('signaling OK');

    setIsConnecting(true);
    try {
      addLog('Obteniendo cámara y micrófono...');
      const stream = await mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: true,
      });
      addLog(`Stream obtenido: ${stream.getVideoTracks().length} video, ${stream.getAudioTracks().length} audio`);

      addLog('Inicializando WebRTC...');
      await initializeAsCamera(stream);

      setIsStreaming(true);
      setIsConnecting(false);
      addLog('TRANSMISION INICIADA');
      KeepAwake.activateKeepAwakeAsync().then(() => addLog('KeepAwake activado'));
      if (Platform.OS === 'android' && NativeModules.BabyMonitor) {
        NativeModules.BabyMonitor.startService();
        addLog('Foreground service iniciado');
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      const fullMsg = `Error al iniciar cámara: ${msg}`;
      setError(fullMsg);
      addLog(`ERROR: ${fullMsg}`);
      console.error('Camera init error:', err);
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <View style={styles.container}>
      {localStream ? (
        <RTCView
          streamURL={localStream.toURL()}
          style={styles.camera}
          objectFit="cover"
          zOrder={0}
        />
      ) : (
        <View style={[styles.camera, styles.placeholder]}>
          <Text style={styles.placeholderIcon}>📷</Text>
          <Text style={styles.placeholderText}>Cámara no disponible</Text>
          <Text style={styles.placeholderSubtext}>Presiona "Iniciar Transmisión" para activar</Text>
        </View>
      )}

      <View style={styles.overlay}>
        <View style={styles.header}>
          <Text style={styles.title}>Cámara Activa</Text>
          <View style={styles.headerRight}>
            <View style={[styles.statusDot, {
              backgroundColor: isStreaming ? '#4CAF50' : error ? '#F44336' : '#FF9800'
            }]} />
          </View>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.middleArea}>
          <Text style={styles.statusText}>
            {isStreaming ? 'Transmitiendo...' : isConnecting ? 'Conectando...' : 'Esperando conexión...'}
          </Text>
          {connection.localDevice && (
            <Text style={styles.deviceText}>ID: {connection.localDevice.id}</Text>
          )}
          {connectedMonitors.length > 0 ? (
            <Text style={styles.deviceText}>Monitores: {connectedMonitors.length} conectado{connectedMonitors.length > 1 ? 's' : ''}</Text>
          ) : (
            <Text style={styles.deviceText}>Esperando monitores...</Text>
          )}
          {!isStreaming && !isConnecting && (
            <TouchableOpacity style={styles.streamButton} onPress={startStreaming}>
              <Text style={styles.streamButtonText}>Iniciar Transmisión</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.logBox}>
          <Text style={styles.logTitle}>Logs:</Text>
          <ScrollView style={styles.logScroll}>
            {logs.map((log, i) => (
              <Text key={i} style={styles.logText}>{log}</Text>
            ))}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { ...StyleSheet.absoluteFillObject },
  placeholder: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a2e' },
  placeholderIcon: { fontSize: 64 },
  placeholderText: { color: '#FFF', fontSize: 16, marginTop: 16, textAlign: 'center' },
  placeholderSubtext: { color: '#888', fontSize: 12, marginTop: 8, textAlign: 'center' },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between', padding: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)', padding: 12, borderRadius: 10 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  errorBox: { backgroundColor: 'rgba(244,67,54,0.9)', padding: 12, borderRadius: 8 },
  errorText: { color: '#FFF', fontSize: 13, fontWeight: 'bold' },
  middleArea: { backgroundColor: 'rgba(0,0,0,0.7)', padding: 12, borderRadius: 10, marginBottom: 8 },
  statusText: { color: '#FFF', fontSize: 14, fontWeight: 'bold' },
  deviceText: { color: '#AAA', fontSize: 10, marginTop: 2 },
  streamButton: { backgroundColor: '#4CAF50', padding: 12, borderRadius: 8, marginTop: 8, alignItems: 'center' },
  streamButtonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  logBox: { backgroundColor: 'rgba(0,0,0,0.7)', padding: 6, borderRadius: 10, maxHeight: 100 },
  logTitle: { color: '#888', fontSize: 10, marginBottom: 4 },
  logScroll: { flex: 1 },
  logText: { color: '#0F0', fontSize: 9, fontFamily: 'monospace', marginBottom: 1 },
});
