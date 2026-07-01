import { StreamPort } from '../ports/StreamPort';

export class ReceiveStream {
  constructor(private stream: StreamPort) {}

  onRemoteStream(callback: (stream: any) => void): void {
    this.stream.onRemoteStream(callback);
  }

  muteAudio(): void {
    this.stream.muteAudio();
  }

  unmuteAudio(): void {
    this.stream.unmuteAudio();
  }

  getRemoteStream(): any {
    return this.stream.getRemoteStream();
  }
}
