import { signalingService } from './signaling';

export type DetectionType = 'sound' | 'motion';

export interface DetectionEvent {
  type: DetectionType;
  timestamp: number;
  confidence: number;
  message: string;
}

type DetectionCallback = (event: DetectionEvent) => void;

class DetectionService {
  private isRunning = false;
  private onDetection: DetectionCallback | null = null;
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private lastAlertTime = 0;
  private cooldownMs = 3000;
  private soundThreshold = -50;
  private pc: any = null;

  start(pc: any, onDetection: DetectionCallback, threshold = -50) {
    if (this.isRunning) return;

    this.pc = pc;
    this.isRunning = true;
    this.onDetection = onDetection;
    this.soundThreshold = threshold;
    this.lastAlertTime = 0;

    console.log('Sound detection started, threshold:', threshold, 'dB');

    this.checkInterval = setInterval(() => {
      this.checkAudioLevel();
    }, 800);
  }

  private async checkAudioLevel() {
    if (!this.isRunning || !this.pc) return;

    try {
      const stats = await this.pc.getStats();
      let audioLevel = -100;

      stats.forEach((report: any) => {
        if (report.type === 'media-source' && report.kind === 'audio') {
          if (report.audioLevel !== undefined) {
            audioLevel = 20 * Math.log10(Math.max(report.audioLevel, 0.0001));
          }
        }
      });

      if (audioLevel > -100) {
        console.log('Audio level:', audioLevel.toFixed(1), 'dB');

        if (audioLevel > this.soundThreshold) {
          const now = Date.now();
          if (now - this.lastAlertTime > this.cooldownMs) {
            this.lastAlertTime = now;
            const confidence = Math.min(100, Math.round(((audioLevel - this.soundThreshold) / 30) * 100));
            this.onDetection?.({
              type: 'sound',
              timestamp: now,
              confidence,
              message: `Sonido fuerte detectado (${confidence}%)`,
            });
          }
        }
      }
    } catch (err) {
      console.warn('Error checking audio level:', err);
    }
  }

  stop() {
    this.isRunning = false;
    this.pc = null;
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    console.log('Sound detection stopped');
  }

  updateThreshold(threshold: number) {
    this.soundThreshold = threshold;
  }
}

export const detectionService = new DetectionService();
