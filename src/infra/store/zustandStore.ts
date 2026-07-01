import { create } from 'zustand';
import { Device } from '../../core/domain/Device';
import { Alert } from '../../core/domain/Alert';
import { DeviceRole, ConnectionStatus } from '../../types';

interface ConnectionState {
  status: ConnectionStatus;
  localDevice: Device | null;
  remoteDevice: Device | null;
  error: string | null;
}

interface AppStore {
  connection: ConnectionState;
  role: DeviceRole | null;
  alerts: Alert[];
  setRole: (role: DeviceRole) => void;
  setLocalDevice: (device: Device) => void;
  setRemoteDevice: (device: Device) => void;
  setStatus: (status: ConnectionStatus) => void;
  setError: (error: string | null) => void;
  addAlert: (alert: Alert) => void;
  markAlertAsRead: (id: number) => void;
  clearAlerts: () => void;
  reset: () => void;
}

const initialConnection: ConnectionState = {
  status: 'disconnected',
  localDevice: null,
  remoteDevice: null,
  error: null,
};

export const useAppStore = create<AppStore>((set) => ({
  connection: initialConnection,
  role: null,
  alerts: [],

  setRole: (role) => set({ role }),

  setLocalDevice: (device) =>
    set((state) => ({
      connection: { ...state.connection, localDevice: device },
    })),

  setRemoteDevice: (device) =>
    set((state) => ({
      connection: { ...state.connection, remoteDevice: device },
    })),

  setStatus: (status) =>
    set((state) => ({
      connection: { ...state.connection, status },
    })),

  setError: (error) =>
    set((state) => ({
      connection: {
        ...state.connection,
        error,
        status: error ? 'error' : state.connection.status,
      },
    })),

  addAlert: (alert) =>
    set((state) => ({
      alerts: [alert, ...state.alerts],
    })),

  markAlertAsRead: (id) =>
    set((state) => ({
      alerts: state.alerts.map((a) =>
        a.id === id ? { ...a, read: true } : a
      ),
    })),

  clearAlerts: () => set({ alerts: [] }),

  reset: () => set({ connection: initialConnection, role: null, alerts: [] }),
}));
