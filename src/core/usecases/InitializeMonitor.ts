import { SignalingPort } from '../ports/SignalingPort';
import { StreamPort } from '../ports/StreamPort';

export class InitializeMonitor {
  constructor(
    private signaling: SignalingPort,
    private stream: StreamPort
  ) {}

  execute(
    deviceId: string,
    remoteDeviceId: string,
    onRemoteStream: (stream: any) => void,
    onConnectionState: (state: string) => void
  ): void {
    this.stream.onConnectionState(onConnectionState);
    this.stream.onRemoteStream(onRemoteStream);
  }
}
