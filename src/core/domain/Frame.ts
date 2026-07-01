export interface Frame {
  deviceId: string;
  timestamp: number;
  data: string; // base64 JPEG
  width: number;
  height: number;
}

export function createFrame(
  deviceId: string,
  data: string,
  width: number = 640,
  height: number = 480
): Frame {
  return { deviceId, timestamp: Date.now(), data, width, height };
}
