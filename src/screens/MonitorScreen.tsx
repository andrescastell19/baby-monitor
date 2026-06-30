import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, FlatList, ScrollView } from 'react-native';
import { RTCView } from 'react-native-webrtc';
import { useConnectionStore } from '../stores/connectionStore';
import { useWebRTC } from '../hooks/useWebRTC';
import { Alert } from '../types';

export default function MonitorScreen() {
  const { connection, remoteDevice, alerts, markAlertAsRead, localDevice } = useConnectionStore();
  const { remoteStream, connectionState, initializeAsMonitor, muteAudio, unmuteAudio, signalingStatus } = useWebRTC();
  const [isMuted, setIsMuted] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-20), `${time} ${msg}`]);
  };

  useEffect(() => {
    addLog(`localDevice: ${localDevice?.id || 'null'} (${localDevice?.role || 'null'})`);
    addLog(`remoteDevice: ${remoteDevice?.id || 'null'} (${remoteDevice?.role || 'null'})`);
    addLog(`signaling: ${signalingStatus}`);
  }, [localDevice, remoteDevice, signalingStatus]);

  useEffect(() => {
    if (localDevice && remoteDevice) {
      addLog('Inicializando monitor...');
      initializeAsMonitor().then(() => {
        addLog('initializeAsMonitor completado');
      }).catch((err: any) => {
        addLog(`ERROR init: ${err?.message || String(err)}`);
      });
    }
  }, [localDevice, remoteDevice]);

  useEffect(() => {
    if (connectionState !== 'new') {
      addLog(`WebRTC state: ${connectionState}`);
    }
    if (connectionState === 'connected') {
      setIsConnected(true);
      addLog('WebRTC CONECTADO');
    } else if (connectionState === 'failed') {
      setIsConnected(false);
      addLog('WebRTC FALLIDO - intentando reconectar...');
    } else if (connectionState === 'disconnected') {
      setIsConnected(false);
      addLog('WebRTC DESCONECTADO - reconectando...');
    }
  }, [connectionState]);

  useEffect(() => {
    if (remoteStream) {
      addLog('Remote stream received');
    }
  }, [remoteStream]);

  const toggleMute = () => {
    if (isMuted) {
      unmuteAudio();
    } else {
      muteAudio();
    }
    setIsMuted(!isMuted);
  };

  const renderAlert = ({ item }: { item: Alert }) => (
    <TouchableOpacity
      style={[styles.alertItem, item.read && styles.alertRead]}
      onPress={() => markAlertAsRead(item.id)}
    >
      <View style={[styles.alertDot, { backgroundColor: item.type === 'sound' ? '#FF5722' : '#FF9800' }]} />
      <View style={styles.alertContent}>
        <Text style={styles.alertType}>
          {item.type === 'sound' ? 'Sonido detectado' : 'Movimiento detectado'}
        </Text>
        <Text style={styles.alertTime}>
          {new Date(item.timestamp).toLocaleTimeString()}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.videoContainer}>
        {isConnected && remoteStream ? (
          <RTCView
            streamURL={remoteStream.toURL()}
            style={styles.video}
            objectFit="cover"
          />
        ) : (
          <View style={styles.videoPlaceholder}>
            <Text style={styles.videoText}>
              {connectionState === 'connected' ? 'Conectado' : 'Esperando cámara...'}
            </Text>
            {remoteDevice && (
              <Text style={styles.deviceText}>{remoteDevice.name}</Text>
            )}
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
        <TouchableOpacity
          style={[styles.controlButton, isMuted && styles.controlButtonActive]}
          onPress={toggleMute}
        >
          <Text style={styles.controlButtonText}>
            {isMuted ? '🔇 Muted' : '🔊 Sound'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.alertsSection}>
        <Text style={styles.alertsTitle}>
          Alertas ({alerts.filter(a => !a.read).length})
        </Text>
        {alerts.length === 0 ? (
          <Text style={styles.noAlerts}>No hay alertas</Text>
        ) : (
          <FlatList
            data={alerts}
            renderItem={renderAlert}
            keyExtractor={(item) => item.id}
            style={styles.alertsList}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  videoContainer: {
    flex: 2,
    margin: 10,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  video: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  videoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoText: {
    color: '#FFF',
    fontSize: 18,
  },
  deviceText: {
    color: '#AAA',
    fontSize: 14,
    marginTop: 10,
  },
  logBox: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    marginHorizontal: 10,
    padding: 8,
    borderRadius: 10,
    maxHeight: 120,
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
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    paddingVertical: 10,
  },
  controlButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#2d2d44',
  },
  controlButtonActive: {
    backgroundColor: '#e74c3c',
  },
  controlButtonText: {
    color: '#FFF',
    fontSize: 14,
  },
  alertsSection: {
    flex: 1,
    padding: 15,
  },
  alertsTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  noAlerts: {
    color: '#888',
    fontSize: 14,
  },
  alertsList: {
    flex: 1,
  },
  alertItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2d2d44',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  alertRead: {
    opacity: 0.6,
  },
  alertDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
  },
  alertContent: {
    flex: 1,
  },
  alertType: {
    color: '#FFF',
    fontSize: 14,
  },
  alertTime: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
  },
});
