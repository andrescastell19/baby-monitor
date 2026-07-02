import React, { useState } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppStore } from '../../../infra/store/zustandStore';
import { createDevice } from '../../../core/domain/Device';
import { DeviceRole } from '../../../types';

type RootStackParamList = {
  Pairing: undefined;
  Camera: undefined;
  Monitor: undefined;
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'Pairing'>;

export default function PairingScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { setRole, setLocalDevice, setRemoteDevice } = useAppStore();
  const [selectedRole, setSelectedRole] = useState<DeviceRole | null>(null);

  const handleStart = () => {
    if (!selectedRole) {
      Alert.alert('Error', 'Selecciona un rol');
      return;
    }

    const deviceId = `${selectedRole}-${Date.now()}`;
    const remoteId = selectedRole === 'camera' ? 'monitor-remote' : 'camera-remote';

    setRole(selectedRole);
    setLocalDevice(createDevice(
      deviceId,
      selectedRole === 'camera' ? 'Cámara del bebé' : 'Monitor',
      selectedRole,
      'android',
      true
    ));

    setRemoteDevice(createDevice(
      remoteId,
      selectedRole === 'camera' ? 'Monitor' : 'Cámara del bebé',
      selectedRole === 'camera' ? 'monitor' : 'camera',
      'android',
      true
    ));

    if (selectedRole === 'camera') {
      navigation.navigate('Camera');
    } else {
      navigation.navigate('Monitor');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.emoji}>👶</Text>
        <Text style={styles.title}>Baby Monitor</Text>
        <Text style={styles.subtitle}>Empareja tus dispositivos</Text>
      </View>

      <View style={styles.roleSelection}>
        <Text style={styles.sectionTitle}>¿Qué rol tendrá este dispositivo?</Text>

        <TouchableOpacity
          style={[styles.roleButton, selectedRole === 'camera' && styles.roleButtonActive]}
          onPress={() => setSelectedRole('camera')}
        >
          <Text style={styles.roleEmoji}>📷</Text>
          <Text style={styles.roleTitle}>Cámara</Text>
          <Text style={styles.roleDesc}>Captura video del bebé</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.roleButton, selectedRole === 'monitor' && styles.roleButtonActive]}
          onPress={() => setSelectedRole('monitor')}
        >
          <Text style={styles.roleEmoji}>📱</Text>
          <Text style={styles.roleTitle}>Monitor</Text>
          <Text style={styles.roleDesc}>Recibe el stream en vivo</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.startButton, !selectedRole && styles.startButtonDisabled]}
        onPress={handleStart}
        disabled={!selectedRole}
      >
        <Text style={styles.startButtonText}>Iniciar</Text>
      </TouchableOpacity>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Selecciona el rol opuesto en el otro dispositivo Android
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 30,
  },
  emoji: {
    fontSize: 60,
  },
  title: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 10,
  },
  subtitle: {
    color: '#888',
    fontSize: 16,
    marginTop: 5,
  },
  roleSelection: {
    marginBottom: 30,
  },
  sectionTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  roleButton: {
    backgroundColor: '#2d2d44',
    padding: 20,
    borderRadius: 12,
    marginBottom: 10,
  },
  roleButtonActive: {
    backgroundColor: '#3498db',
    borderColor: '#5dade2',
    borderWidth: 2,
  },
  roleEmoji: {
    fontSize: 30,
  },
  roleTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 10,
  },
  roleDesc: {
    color: '#AAA',
    fontSize: 14,
    marginTop: 5,
  },
  startButton: {
    backgroundColor: '#27ae60',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  startButtonDisabled: {
    backgroundColor: '#555',
  },
  startButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  footer: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 20,
  },
  footerText: {
    color: '#888',
    fontSize: 12,
    textAlign: 'center',
  },
});
