import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, FlatList, ScrollView } from 'react-native';
import { RTCView } from 'react-native-webrtc';
import { useInitialize } from '../hooks/useInitialize';
import { useAppStore } from '../../../infra/store/zustandStore';
import { Alert } from '../../../core/domain/Alert';

export default function MonitorScreen() {
  const { connection, alerts, markAlertAsRead } = useAppStore();
  const { remoteStream, connectionState, initializeAsMonitor, signalingStatus, muteAudio, unmuteAudio } = useInitialize();
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-20), `${time} ${msg}`]);
  }, []);

  useEffect(() => {
    addLog(`localDevice: ${connection.localDevice?.id || 'null'}`);
    addLog(`signaling: ${signalingStatus}`);
  }, [connection.localDevice, signalingStatus, addLog]);

  useEffect(() => {
    if (connection.localDevice) {
      addLog('Inicializando monitor...');
      initializeAsMonitor();
    }
  }, [connection.localDevice?.id]);

  useEffect(() => {
    if (connectionState === 'connected') {
      setIsConnected(true);
      addLog('WebRTC CONECTADO');
    } else if (connectionState === 'disconnected') {
      setIsConnected(false);
      addLog('WebRTC DESCONECTADO');
    }
    if (connectionState !== 'new') {
      addLog(`WebRTC state: ${connectionState}`);
    }
  }, [connectionState, addLog]);

  useEffect(() => {
    if (remoteStream) {
      addLog('Stream remoto recibido');
    }
  }, [remoteStream, addLog]);

  const toggleMute = () => {
    if (isMuted) {
      unmuteAudio();
    } else {
      muteAudio();
    }
    setIsMuted(!isMuted);
  };

  const renderAlert = ({ item }: { item: Alert }) => (
    <View style={styles.alertItem}>
      <View style={[styles.alertDot, { backgroundColor: item.type === 'sound' ? '#F44336' : '#FF9800' }]} />
      <View style={styles.alertContent}>
        <Text style={styles.alertType}>
          {item.type === 'sound' ? '🔊 Sonido detectado' : '👋 Movimiento detectado'}
        </Text>
        <Text style={styles.alertTime}>{new Date(item.timestamp).toLocaleTimeString()}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.videoContainer}>
        {remoteStream ? (
          <RTCView
            streamURL={remoteStream.toURL()}
            style={styles.video}
            objectFit="cover"
          />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>📺</Text>
            <Text style={styles.placeholderLabel}>
              {isConnected ? 'Conectado, esperando video...' : 'Esperando conexión con cámara...'}
            </Text>
          </View>
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

      <View style={styles.controls}>
        <TouchableOpacity style={[styles.controlButton, isMuted && styles.controlButtonActive]} onPress={toggleMute}>
          <Text style={styles.controlButtonText}>{isMuted ? '🔇 Unmute' : '🔊 Sonido'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.alertsSection}>
        <View style={styles.alertsHeader}>
          <Text style={styles.alertsTitle}>Alertas ({alerts.filter(a => !a.read).length})</Text>
        </View>
        <FlatList
          data={alerts}
          renderItem={renderAlert}
          keyExtractor={item => item.id.toString()}
          style={styles.alertsList}
          ListEmptyComponent={<Text style={styles.noAlerts}>No hay alertas</Text>}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e' },
  videoContainer: { flex: 1, backgroundColor: '#000' },
  video: { flex: 1, width: '100%', height: '100%' },
  placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  placeholderText: { fontSize: 64 },
  placeholderLabel: { color: '#FFF', fontSize: 16, marginTop: 16, textAlign: 'center' },
  logBox: { backgroundColor: 'rgba(0,0,0,0.7)', padding: 6, marginHorizontal: 8, borderRadius: 10, maxHeight: 80 },
  logTitle: { color: '#888', fontSize: 10, marginBottom: 4 },
  logScroll: { flex: 1 },
  logText: { color: '#0F0', fontSize: 9, fontFamily: 'monospace', marginBottom: 1 },
  controls: { flexDirection: 'row', justifyContent: 'center', padding: 8, gap: 12 },
  controlButton: { backgroundColor: '#2d2d44', padding: 12, borderRadius: 8, minWidth: 100, alignItems: 'center' },
  controlButtonActive: { backgroundColor: '#F44336' },
  controlButtonText: { color: '#FFF', fontSize: 14, fontWeight: 'bold' },
  alertsSection: { flex: 1, padding: 8 },
  alertsHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  alertsTitle: { color: '#FFF', fontSize: 14, fontWeight: 'bold' },
  alertsList: { flex: 1 },
  alertItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2d2d44', padding: 12, borderRadius: 8, marginBottom: 8 },
  alertDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  alertContent: { flex: 1 },
  alertType: { color: '#FFF', fontSize: 13, fontWeight: 'bold' },
  alertTime: { color: '#888', fontSize: 11, marginTop: 2 },
  noAlerts: { color: '#888', fontSize: 13, textAlign: 'center', marginTop: 20 },
});
