import { StreamPort, MonitorPlatform } from '../ports/StreamPort';

export class SendStream {
  constructor(private stream: StreamPort) {}

  async addMonitor(monitorId: string, platform: MonitorPlatform): Promise<void> {
    await this.stream.addMonitor(monitorId, platform);
  }

  removeMonitor(monitorId: string): void {
    this.stream.removeMonitor(monitorId);
  }

  muteAudio(): void {
    this.stream.muteAudio();
  }

  unmuteAudio(): void {
    this.stream.unmuteAudio();
  }
}
