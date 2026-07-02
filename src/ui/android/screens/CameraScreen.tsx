import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, ScrollView, Platform, NativeModules } from 'react-native';
import { useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { RTCView } from 'react-native-webrtc';
import ViewShot from 'react-native-view-shot';
import * as KeepAwake from 'expo-keep-awake';
import { useInitialize } from '../hooks/useInitialize';
import { useAppStore } from '../../../infra/store/zustandStore';
import { FRAME_CAPTURE_INTERVAL, FRAME_QUALITY } from '../../../core/config/ice';

export default function CameraScreen() {
  const { connection } = useAppStore();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();
  const { localStream, connectionState, initializeAsCamera, signalingStatus, connectedMonitors, sendFrame } = useInitialize();
  const [isStreaming, setIsStreaming] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [detectionActive, setDetectionActive] = useState(false);
  const [lastAlert, setLastAlert] = useState<string | null>(null);
  const viewShotRef = useRef<any>(null);
  const frameIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const addLog = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-15), `${time} ${msg}`]);
  }, []);

  const captureFrame = useCallback(async () => {
    if (!viewShotRef.current) return;
    try {
      const uri = await viewShotRef.current.capture({
        format: 'jpg',
        quality: FRAME_QUALITY,
      });
      const response = await fetch(uri);
      const blob = await response.blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = (reader.result as string).split(',')[1];
        if (base64data) {
          sendFrame(base64data);
        }
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      // Silently retry
    }
  }, [sendFrame]);

  const startFrameCapture = useCallback(() => {
    if (frameIntervalRef.current) return;
    frameIntervalRef.current = setInterval(captureFrame, FRAME_CAPTURE_INTERVAL);
    addLog(`Frame capture Relay iniciado (${FRAME_CAPTURE_INTERVAL}ms)`);
  }, [captureFrame, addLog]);

  const stopFrameCapture = useCallback(() => {
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    addLog(`localDevice: ${connection.localDevice?.id || 'null'} (${connection.localDevice?.role || 'null'})`);
    addLog(`signaling: ${signalingStatus}`);
    addLog(`monitores web: ${connectedMonitors.length}`);
  }, [connection.localDevice, signalingStatus, connectedMonitors, addLog]);

  useEffect(() => {
    if (connectedMonitors.length > 0 && localStream) {
      addLog(`Monitor web conectado: ${connectedMonitors[connectedMonitors.length - 1]}`);
      startFrameCapture();
    } else {
      stopFrameCapture();
    }
  }, [connectedMonitors.length, localStream, addLog, startFrameCapture, stopFrameCapture]);

  useEffect(() => {
    if (connectionState === 'connected') {
      setIsStreaming(true);
      setIsConnecting(false);
      addLog('WebRTC CONECTADO');
      KeepAwake.activateKeepAwakeAsync().then(() => addLog('KeepAwake activado'));
      if (Platform.OS === 'android' && NativeModules.BabyMonitor) {
        NativeModules.BabyMonitor.startService();
        addLog('Foreground service iniciado');
      }
    } else if (connectionState === 'failed') {
      setIsStreaming(false);
      addLog('WebRTC FALLIDO - intentando reconectar...');
    } else if (connectionState === 'disconnected') {
      setIsStreaming(false);
      addLog('WebRTC DESCONECTADO - reconectando...');
    }
    if (connectionState !== 'new') {
      addLog(`WebRTC state: ${connectionState}`);
    }
  }, [connectionState, addLog]);

  useEffect(() => {
    return () => {
      stopFrameCapture();
      KeepAwake.deactivateKeepAwake();
      if (Platform.OS === 'android' && NativeModules.BabyMonitor) {
        NativeModules.BabyMonitor.stopService();
      }
    };
  }, [stopFrameCapture]);

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
        <ViewShot ref={viewShotRef} options={{ format: 'jpg', quality: FRAME_QUALITY }} style={styles.video}>
          <RTCView
            streamURL={localStream.toURL()}
            style={styles.video}
            objectFit="cover"
            mirror={false}
          />
        </ViewShot>
      ) : (
        <View style={styles.cameraPlaceholder}>
          <Text style={styles.placeholderText}>📷</Text>
          <Text style={styles.placeholderLabel}>Cámara inicializando...</Text>
        </View>
      )}

      <View style={styles.overlay}>
        <View style={styles.header}>
          <Text style={styles.title}>Cámara Activa</Text>
          <View style={styles.headerRight}>
            {detectionActive && (
              <View style={styles.detectionBadge}>
                <Text style={styles.detectionBadgeText}>🎤</Text>
              </View>
            )}
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

        {lastAlert ? (
          <View style={styles.alertBanner}>
            <Text style={styles.alertBannerText}>{lastAlert}</Text>
          </View>
        ) : null}

        <View style={styles.middleArea}>
          <Text style={styles.statusText}>
            {isStreaming ? 'Transmitiendo...' : isConnecting ? 'Conectando...' : connectionState === 'connected' ? 'Conectado' : 'Esperando conexión...'}
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
  video: { flex: 1, width: '100%', height: '100%' },
  cameraPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a2e' },
  placeholderText: { fontSize: 64 },
  placeholderLabel: { color: '#FFF', fontSize: 18, marginTop: 16 },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between', padding: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)', padding: 12, borderRadius: 10 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  detectionBadge: { backgroundColor: 'rgba(76,175,80,0.8)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  detectionBadgeText: { fontSize: 12 },
  alertBanner: { backgroundColor: 'rgba(255,87,34,0.9)', padding: 10, borderRadius: 8 },
  alertBannerText: { color: '#FFF', fontSize: 13, fontWeight: 'bold', textAlign: 'center' },
  errorBox: { backgroundColor: 'rgba(244,67,54,0.9)', padding: 12, borderRadius: 8 },
  errorText: { color: '#FFF', fontSize: 13, fontWeight: 'bold' },
  middleArea: { backgroundColor: 'rgba(0,0,0,0.7)', padding: 12, borderRadius: 10, marginBottom: 8 },
  statusText: { color: '#FFF', fontSize: 14, fontWeight: 'bold' },
  deviceText: { color: '#AAA', fontSize: 10, marginTop: 2 },
  streamButton: { backgroundColor: '#4CAF50', padding: 12, borderRadius: 8, marginTop: 8, alignItems: 'center' },
  streamButtonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  text: { color: '#FFF', fontSize: 16, textAlign: 'center' },
  button: { backgroundColor: '#2196F3', padding: 15, borderRadius: 8, marginTop: 20, alignItems: 'center' },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  logBox: { backgroundColor: 'rgba(0,0,0,0.7)', padding: 6, borderRadius: 10, maxHeight: 100 },
  logTitle: { color: '#888', fontSize: 10, marginBottom: 4 },
  logScroll: { flex: 1 },
  logText: { color: '#0F0', fontSize: 9, fontFamily: 'monospace', marginBottom: 1 },
});
