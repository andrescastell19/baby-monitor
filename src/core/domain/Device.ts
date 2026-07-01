export type DeviceRole = 'camera' | 'monitor';
export type DevicePlatform = 'android' | 'web';

export interface Device {
  id: string;
  name: string;
  role: DeviceRole;
  platform: DevicePlatform;
  isOnline: boolean;
}

export function createDevice(
  id: string,
  name: string,
  role: DeviceRole,
  platform: DevicePlatform = 'android',
  isOnline: boolean = true
): Device {
  return { id, name, role, platform, isOnline };
}
