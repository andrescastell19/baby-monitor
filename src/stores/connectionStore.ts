import { create } from 'zustand';
import { ConnectionState, Device, DeviceRole, Alert } from '../types';

interface ConnectionStore {
  connection: ConnectionState;
  localDevice: Device | null;
  remoteDevice: Device | null;
  alerts: Alert[];
  role: DeviceRole | null;

  setRole: (role: DeviceRole) => void;
  setLocalDevice: (device: Device) => void;
  setRemoteDevice: (device: Device | null) => void;
  setStatus: (status: ConnectionState['status']) => void;
  setError: (error: string | null) => void;
  addAlert: (alert: Alert) => void;
  markAlertAsRead: (id: string) => void;
  clearAlerts: () => void;
  reset: () => void;
}

const initialState: ConnectionState = {
  status: 'disconnected',
  localDevice: null,
  remoteDevice: null,
  error: null,
};

export const useConnectionStore = create<ConnectionStore>((set) => ({
  connection: initialState,
  localDevice: null,
  remoteDevice: null,
  alerts: [],
  role: null,

  setRole: (role) => set({ role }),

  setLocalDevice: (device) =>
    set((state) => ({
      localDevice: device,
      connection: { ...state.connection, localDevice: device },
    })),

  setRemoteDevice: (device) =>
    set((state) => ({
      remoteDevice: device,
      connection: { ...state.connection, remoteDevice: device },
    })),

  setStatus: (status) =>
    set((state) => ({
      connection: { ...state.connection, status },
    })),

  setError: (error) =>
    set((state) => ({
      connection: { ...state.connection, error, status: error ? 'error' : state.connection.status },
    })),

  addAlert: (alert) => set((state) => ({ alerts: [alert, ...state.alerts] })),

  markAlertAsRead: (id) =>
    set((state) => ({
      alerts: state.alerts.map((a) => (a.id === id ? { ...a, read: true } : a)),
    })),

  clearAlerts: () => set({ alerts: [] }),

  reset: () => set({ connection: initialState, localDevice: null, remoteDevice: null, alerts: [], role: null }),
}));
