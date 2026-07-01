export type DetectionType = 'sound' | 'motion';

export interface DetectionEvent {
  type: DetectionType;
  timestamp: number;
  confidence: number;
  message: string;
}

export interface DetectionPort {
  start(pc: any, onAlert: (event: DetectionEvent) => void): void;
  stop(): void;
  updateSoundThreshold(threshold: number): void;
}
