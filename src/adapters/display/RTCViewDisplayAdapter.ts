import { DisplayPort } from '../../core/ports/DisplayPort';

export class RTCViewDisplayAdapter implements DisplayPort {
  private stream: any = null;
  private onStreamChange: ((stream: any) => void) | null = null;

  setStream(stream: any): void {
    this.stream = stream;
    this.onStreamChange?.(stream);
  }

  setFrame(_base64Frame: string): void {
    // Not used on Android - RTCView handles video natively
  }

  clear(): void {
    this.stream = null;
    this.onStreamChange?.(null);
  }

  getStream(): any {
    return this.stream;
  }

  onStreamChanged(callback: (stream: any) => void): void {
    this.onStreamChange = callback;
  }
}
