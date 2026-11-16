/**
 * Camera access and capability detection. Never assumes a control exists: everything is read
 * from MediaStreamTrack.getCapabilities() / getSettings(), which iOS Safari only partly supports.
 */
export type ControlName = 'whiteBalanceMode' | 'exposureMode' | 'focusMode' | 'exposureCompensation' | 'zoom' | 'colorTemperature';

export interface ControlInfo {
  name: ControlName;
  label: string;
  supported: boolean;
  modes?: string[];
  range?: { min: number; max: number; step: number };
  current?: string | number;
}

export interface CameraInfo { label: string; width: number; height: number; frameRate?: number; controls: ControlInfo[]; capabilitiesApi: boolean }

export type Facing = 'environment' | 'user';

export async function startCamera(facing: Facing = 'environment'): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser does not expose camera access (navigator.mediaDevices). On iPhone, open the app in Safari over HTTPS.');
  }
  const attempts: MediaStreamConstraints[] = [
    { audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } } },
    { audio: false, video: { facingMode: facing } },
    { audio: false, video: true },
  ];
  let last: unknown;
  for (const c of attempts) {
    try { return await navigator.mediaDevices.getUserMedia(c); } catch (e) {
      last = e;
      if (e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) break;
    }
  }
  throw last;
}

export function describeCameraError(e: unknown): string {
  if (e instanceof DOMException) {
    switch (e.name) {
      case 'NotAllowedError': return 'Camera permission was denied. On iPhone: Settings › Safari › Camera › Allow, then reload.';
      case 'NotFoundError': return 'No camera was found on this device.';
      case 'NotReadableError': return 'The camera is in use by another app. Close it and try again.';
      case 'SecurityError': return 'Camera access needs a secure (HTTPS) page.';
      case 'OverconstrainedError': return 'The camera could not satisfy the requested settings.';
    }
  }
  return e instanceof Error ? e.message : String(e);
}

const LABELS: Record<ControlName, string> = {
  whiteBalanceMode: 'White balance lock', exposureMode: 'Exposure lock', focusMode: 'Focus mode',
  exposureCompensation: 'Exposure compensation', zoom: 'Zoom', colorTemperature: 'Colour temperature',
};

export function readCameraInfo(track: MediaStreamTrack): CameraInfo {
  const s = track.getSettings ? track.getSettings() : ({} as MediaTrackSettings);
  const hasCaps = typeof track.getCapabilities === 'function';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const caps: any = hasCaps ? track.getCapabilities() : {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const set: any = s;
  const controls = (Object.keys(LABELS) as ControlName[]).map((name) => {
    const cap = caps[name];
    const info: ControlInfo = { name, label: LABELS[name], supported: cap !== undefined && cap !== null, current: set[name] };
    if (Array.isArray(cap)) { info.modes = cap; info.supported = cap.length > 0; }
    else if (cap && typeof cap === 'object' && 'min' in cap) info.range = { min: cap.min, max: cap.max, step: cap.step ?? 0.1 };
    return info;
  });
  return { label: track.label || 'Camera', width: s.width ?? 0, height: s.height ?? 0, frameRate: s.frameRate, controls, capabilitiesApi: hasCaps };
}

/** Apply a single control. Returns the value the browser actually reports afterwards. */
export async function applyControl(track: MediaStreamTrack, name: ControlName, value: string | number): Promise<string | number | undefined> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await track.applyConstraints({ advanced: [{ [name]: value } as any] });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (track.getSettings() as any)[name];
}

export function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}
