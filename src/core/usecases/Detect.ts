import { DetectionPort, DetectionEvent } from '../ports/DetectionPort';
import { AlertPort } from '../ports/AlertPort';
import { SignalingPort } from '../ports/SignalingPort';

export class Detect {
  constructor(
    private detection: DetectionPort,
    private alertPort: AlertPort,
    private signaling: SignalingPort
  ) {}

  start(pc: any): void {
    this.detection.start(pc, (event: DetectionEvent) => {
      this.alertPort.sendAlert(event.type, event.message, event.confidence);
      this.signaling.send({
        type: 'alert',
        deviceId: '',
        payload: {
          type: event.type,
          message: event.message,
          confidence: event.confidence,
        },
      });
    });
  }

  stop(): void {
    this.detection.stop();
  }

  updateSoundThreshold(threshold: number): void {
    this.detection.updateSoundThreshold(threshold);
  }
}
