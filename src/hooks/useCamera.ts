import { useCallback, useEffect, useRef, useState } from 'react';
import { applyControl, describeCameraError, readCameraInfo, startCamera, stopStream, type CameraInfo, type ControlName } from '../engine/camera';

export type CameraState = 'idle' | 'starting' | 'live' | 'error';

export function useCamera() {
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<CameraInfo | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const start = useCallback(async () => {
    if (streamRef.current) return;
    setState('starting'); setError(null);
    try {
      const s = await startCamera();
      streamRef.current = s;
      setStream(s);
      const track = s.getVideoTracks()[0];
      setInfo(readCameraInfo(track));
      track.addEventListener('ended', () => { streamRef.current = null; setStream(null); setState('idle'); });
      setState('live');
    } catch (e) {
      setError(describeCameraError(e)); setState('error');
    }
  }, []);

  const stop = useCallback(() => {
    stopStream(streamRef.current);
    streamRef.current = null; setStream(null); setState('idle');
  }, []);

  const setControl = useCallback(async (name: ControlName, value: string | number) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return { ok: false, message: 'Camera not running' };
    try {
      const actual = await applyControl(track, name, value);
      setInfo(readCameraInfo(track));
      const ok = actual === undefined ? false : String(actual) === String(value) || typeof value === 'number';
      return { ok, message: ok ? `${name} = ${actual}` : `Browser accepted the request but reports ${name} = ${actual ?? 'unknown'}; the setting may not be applied.` };
    } catch (e) {
      return { ok: false, message: `Not applied: ${e instanceof Error ? e.message : String(e)}` };
    }
  }, []);

  // Release the camera when the page is hidden (saves battery; iOS also suspends it).
  useEffect(() => {
    const onVis = () => { if (document.hidden && streamRef.current) stop(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); stopStream(streamRef.current); };
  }, [stop]);

  return { state, error, info, stream, start, stop, setControl };
}
export type CameraApi = ReturnType<typeof useCamera>;
