import { Platform } from 'react-native';

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
  private lastMotionTime = 0;
  private motionThreshold = 0.5;
  private soundThreshold = 0.7;
  private checkInterval: ReturnType<typeof setInterval> | null = null;

  start(onDetection: DetectionCallback) {
    if (this.isRunning) return;

    this.isRunning = true;
    this.onDetection = onDetection;

    this.checkInterval = setInterval(() => {
      this.simulateDetection();
    }, 1000);
  }

  private simulateDetection() {
    if (!this.isRunning) return;

    const now = Date.now();
    const randomValue = Math.random();

    if (randomValue > this.soundThreshold) {
      this.emitDetection({
        type: 'sound',
        timestamp: now,
        confidence: randomValue,
        message: `Sonido detectado (${Math.round(randomValue * 100)}%)`,
      });
    }

    if (randomValue > this.motionThreshold && now - this.lastMotionTime > 2000) {
      this.lastMotionTime = now;
      this.emitDetection({
        type: 'motion',
        timestamp: now,
        confidence: randomValue,
        message: `Movimiento detectado (${Math.round(randomValue * 100)}%)`,
      });
    }
  }

  private emitDetection(event: DetectionEvent) {
    this.onDetection?.(event);
  }

  stop() {
    this.isRunning = false;
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  updateThresholds(soundThreshold: number, motionThreshold: number) {
    this.soundThreshold = soundThreshold;
    this.motionThreshold = motionThreshold;
  }
}

export const detectionService = new DetectionService();
