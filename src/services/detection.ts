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
  private soundInterval: ReturnType<typeof setInterval> | null = null;
  private motionInterval: ReturnType<typeof setInterval> | null = null;
  private lastSoundAlert = 0;
  private lastMotionAlert = 0;
  private cooldownMs = 3000;
  private soundThreshold = -50;
  private pc: any = null;

  private prevFramesDecoded = 0;
  private prevBytesReceived = 0;
  private prevTimestamp = 0;
  private motionBaselineSet = false;

  start(pc: any, onDetection: DetectionCallback, soundThreshold = -50) {
    if (this.isRunning) return;

    this.pc = pc;
    this.isRunning = true;
    this.onDetection = onDetection;
    this.soundThreshold = soundThreshold;
    this.lastSoundAlert = 0;
    this.lastMotionAlert = 0;
    this.prevFramesDecoded = 0;
    this.prevBytesReceived = 0;
    this.prevTimestamp = 0;
    this.motionBaselineSet = false;

    console.log('Detection started, sound threshold:', soundThreshold, 'dB');

    this.soundInterval = setInterval(() => this.checkAudioLevel(), 800);
    this.motionInterval = setInterval(() => this.checkMotion(), 2000);
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
          if (now - this.lastSoundAlert > this.cooldownMs) {
            this.lastSoundAlert = now;
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

  private async checkMotion() {
    if (!this.isRunning || !this.pc) return;

    try {
      const stats = await this.pc.getStats();
      let framesDecoded = 0;
      let bytesReceived = 0;

      stats.forEach((report: any) => {
        if (report.type === 'inbound-rtp' && report.kind === 'video') {
          framesDecoded = report.framesDecoded || 0;
          bytesReceived = report.bytesReceived || 0;
        }
      });

      if (!this.motionBaselineSet) {
        this.prevFramesDecoded = framesDecoded;
        this.prevBytesReceived = bytesReceived;
        this.prevTimestamp = Date.now();
        this.motionBaselineSet = true;
        console.log('Motion baseline set:', { framesDecoded, bytesReceived });
        return;
      }

      const timeDelta = (Date.now() - this.prevTimestamp) / 1000;
      if (timeDelta < 1) return;

      const frameDelta = framesDecoded - this.prevFramesDecoded;
      const bytesDelta = bytesReceived - this.prevBytesReceived;
      const fps = frameDelta / timeDelta;
      const kbps = (bytesDelta * 8) / timeDelta / 1000;

      console.log(`Motion stats: ${fps.toFixed(1)} FPS, ${kbps.toFixed(0)} kbps`);

      this.prevFramesDecoded = framesDecoded;
      this.prevBytesReceived = bytesReceived;
      this.prevTimestamp = Date.now();

      if (frameDelta > 5 && kbps > 50) {
        const now = Date.now();
        if (now - this.lastMotionAlert > this.cooldownMs) {
          this.lastMotionAlert = now;
          const confidence = Math.min(100, Math.round(fps * 10));
          this.onDetection?.({
            type: 'motion',
            timestamp: now,
            confidence,
            message: `Movimiento detectado (${confidence}%)`,
          });
        }
      }
    } catch (err) {
      console.warn('Error checking motion:', err);
    }
  }

  stop() {
    this.isRunning = false;
    this.pc = null;
    this.motionBaselineSet = false;
    if (this.soundInterval) { clearInterval(this.soundInterval); this.soundInterval = null; }
    if (this.motionInterval) { clearInterval(this.motionInterval); this.motionInterval = null; }
    console.log('Detection stopped');
  }

  updateSoundThreshold(threshold: number) {
    this.soundThreshold = threshold;
  }
}

export const detectionService = new DetectionService();
