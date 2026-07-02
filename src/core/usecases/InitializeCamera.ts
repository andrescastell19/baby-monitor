import { SignalingPort } from '../ports/SignalingPort';
import { StreamPort } from '../ports/StreamPort';
import { MediaStream } from 'react-native-webrtc';

export class InitializeCamera {
  constructor(
    private signaling: SignalingPort,
    private stream: StreamPort
  ) {}

  async execute(
    deviceId: string,
    onLocalStream: (stream: MediaStream) => void,
    onConnectionState: (state: string) => void,
    onMonitorsChange: (monitors: string[]) => void
  ): Promise<void> {
    this.stream.onConnectionState(onConnectionState);
    this.stream.onMonitorsChange(onMonitorsChange);

    const { mediaDevices } = require('react-native-webrtc');
    const constraints = {
      audio: true,
      video: {
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    };

    const localStream: MediaStream = await mediaDevices.getUserMedia(constraints);
    onLocalStream(localStream);

    await this.stream.startSending(localStream);
  }
}
