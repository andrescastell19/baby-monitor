import { Device } from './Device';

export type PeerConnectionState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';

export interface Peer {
  device: Device;
  connectionState: PeerConnectionState;
  reconnectAttempts: number;
  lastFramesReceived: number;
  lastRemoteStreamTime: number;
}

export function createPeer(device: Device): Peer {
  return {
    device,
    connectionState: 'new',
    reconnectAttempts: 0,
    lastFramesReceived: 0,
    lastRemoteStreamTime: Date.now(),
  };
}
