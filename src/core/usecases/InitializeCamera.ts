import { SignalingPort } from '../ports/SignalingPort';
import { StreamPort } from '../ports/StreamPort';

export class InitializeCamera {
  constructor(
    private signaling: SignalingPort,
    private stream: StreamPort
  ) {}

  async execute(
    deviceId: string,
    onConnectionState: (state: string) => void,
    onMonitorsChange: (monitors: string[]) => void
  ): Promise<void> {
    this.stream.onConnectionState(onConnectionState);
    this.stream.onMonitorsChange(onMonitorsChange);
  }
}
