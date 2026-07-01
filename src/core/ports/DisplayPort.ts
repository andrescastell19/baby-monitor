export interface DisplayPort {
  setStream(stream: any): void;
  setFrame(base64Frame: string): void;
  clear(): void;
}
