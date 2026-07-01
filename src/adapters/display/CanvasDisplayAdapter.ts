import { DisplayPort } from '../../core/ports/DisplayPort';

export class CanvasDisplayAdapter implements DisplayPort {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private img: HTMLImageElement | null = null;

  setCanvas(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.img = new Image();
  }

  setStream(_stream: any): void {
    // Not used for relay mode - frames come as base64
  }

  setFrame(base64Frame: string): void {
    if (!this.ctx || !this.canvas || !this.img) return;

    this.img.onload = () => {
      this.ctx!.drawImage(this.img!, 0, 0, this.canvas!.width, this.canvas!.height);
    };
    this.img.src = 'data:image/jpeg;base64,' + base64Frame;
  }

  clear(): void {
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }
}
