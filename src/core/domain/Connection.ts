import { Device } from './Device';

export type ConnectionStateStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ConnectionState {
  status: ConnectionStateStatus;
  localDevice: Device | null;
  remoteDevice: Device | null;
  error: string | null;
}

export function createInitialState(): ConnectionState {
  return {
    status: 'disconnected',
    localDevice: null,
    remoteDevice: null,
    error: null,
  };
}
