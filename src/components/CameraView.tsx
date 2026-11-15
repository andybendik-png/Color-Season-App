import { useEffect, useRef, useState } from 'react';
import type { CameraApi } from '../hooks/useCamera';
import { useColourSampling, samplePoint } from '../hooks/useColourSampling';
import { displayToVideo, stabilityOf, type Stability } from '../engine/sampling';
import type { Vec3 } from '../engine/colourConversion';

export type SizeKey = 'S' | 'M' | 'L';
export const SIZE_RADIUS: Record<SizeKey, number> = { S: 12, M: 26, L: 48 };

export interface CurrentSample { srgb: Vec3; spread: number; temporal: number; stability: Stability; source: 'camera' | 'picker' }

interface Props {
  camera: CameraApi;
  onSample: (s: CurrentSample) => void;
  size: SizeKey;
  onSize: (s: SizeKey) => void;
  compact?: boolean;
  previewHex?: string;
  seasonChip?: { text: string; tone: 'ok' | 'warn' | 'bad' } | null;
}

export function CameraView({ camera, onSample, size, onSize, compact, previewHex, seasonChip }: Props) {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const frozenRef = useRef<HTMLCanvasElement | null>(null);
  const [frozen, setFrozen] = useState(false);
  const [pick, setPick] = useState<{ x: number; y: number } | null>(null);
  const [showControls, setShowControls] = useState(false);
  const [controlMsg, setControlMsg] = useState<string | null>(null);
  const radius = SIZE_RADIUS[size];
  const live = camera.state === 'live';
  const sample = useColourSampling(video, live && !frozen, radius);

  useEffect(() => {
    if (video && camera.stream && video.srcObject !== camera.stream) {
      video.srcObject = camera.stream;
      video.play().catch(() => undefined);
    }
  }, [video, camera.stream]);

  useEffect(() => { if (sample && !frozen) onSample({ ...sample, source: 'camera' }); }, [sample, frozen, onSample]);
  useEffect(() => { if (!live) { setFrozen(false); setPick(null); } }, [live]);

  const freeze = () => {
    if (!video || !video.videoWidth) return;
    const c = frozenRef.current!;
    const k = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
    c.width = Math.round(video.videoWidth * k); c.height = Math.round(video.videoHeight * k);
    c.getContext('2d', { willReadFrequently: true } as CanvasRenderingContext2DSettings)!.drawImage(video, 0, 0, c.width, c.height);
    setFrozen(true); setPick(null);
  };
  const resume = () => { setFrozen(false); setPick(null); };

  const onTap = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!frozen) return;
    const c = frozenRef.current!;
    const rect = c.getBoundingClientRect();
    const dx = e.clientX - rect.left, dy = e.clientY - rect.top;
    const m = displayToVideo(dx, dy, rect.width, rect.height, c.width, c.height);
    const r = samplePoint(c, m.x, m.y, radius / m.scale);
    if (r) {
      setPick({ x: dx, y: dy });
      onSample({ srgb: r.srgb, spread: r.spread, temporal: 0, stability: stabilityOf(r.spread, 0), source: 'picker' });
    }
  };

  const stability = sample?.stability;
  const ctrlChange = async (name: Parameters<CameraApi['setControl']>[0], value: string | number) => {
    const r = await camera.setControl(name, value);
    setControlMsg(r.message);
  };

  return (
    <div className={`camera ${compact ? 'camera--compact' : ''}`}>
      <div className="camera__stage">
        <video ref={setVideo} playsInline autoPlay muted className="camera__video" style={{ visibility: frozen ? 'hidden' : 'visible' }} />
        <canvas ref={frozenRef} className="camera__frozen" style={{ display: frozen ? 'block' : 'none' }} onPointerDown={onTap} />
        {live && (
          <div className="reticle" style={{
            width: radius * 2, height: radius * 2,
            left: pick ? pick.x : '50%', top: pick ? pick.y : '50%',
          }}>
            {previewHex && <span className="reticle__fill" style={{ background: previewHex }} />}
          </div>
        )}
        {!live && (
          <div className="camera__placeholder">
            {camera.state === 'starting' ? <p>Starting camera…</p> : (
              <>
                <p className="camera__ph-title">Point the camera at a fabric, object or paint.</p>
                <p className="camera__ph-sub">Processing happens on this device. Nothing is uploaded.</p>
                <button className="btn btn--primary" onClick={camera.start}>Start camera</button>
                {camera.error && <p className="camera__error" role="alert">{camera.error}</p>}
              </>
            )}
          </div>
        )}
        {live && (
          <div className="camera__chips">
            <span className={`chip ${frozen ? 'chip--paused' : 'chip--live'}`}>{frozen ? (pick ? 'Paused · picked point' : 'Paused · tap to pick') : 'Live'}</span>
            {stability && !frozen && <span className={`chip chip--${stability === 'Stable' ? 'ok' : stability === 'Moderate variation' ? 'warn' : 'bad'}`}>{stability}</span>}
            {seasonChip && <span className={`chip chip--season chip--${seasonChip.tone}`}>{seasonChip.text}</span>}
          </div>
        )}
      </div>
      {live && (
        <div className="camera__bar">
          <div className="seg" role="group" aria-label="Sampling area">
            {(['S', 'M', 'L'] as SizeKey[]).map((k) => (
              <button key={k} className={`seg__btn ${size === k ? 'is-on' : ''}`} onClick={() => onSize(k)} aria-pressed={size === k}>
                {k === 'S' ? 'Small' : k === 'M' ? 'Medium' : 'Large'}
              </button>
            ))}
          </div>
          <div className="camera__actions">
            {frozen ? <button className="btn btn--primary" onClick={resume}>Resume</button> : <button className="btn btn--primary" onClick={freeze}>Freeze</button>}
            <button className="btn" onClick={camera.stop}>Stop</button>
          </div>
        </div>
      )}
      {live && !compact && (
        <div className="camera__controls">
          <button className="linkbtn" onClick={() => setShowControls((v) => !v)} aria-expanded={showControls}>
            {showControls ? 'Hide' : 'Show'} camera controls
          </button>
          {showControls && camera.info && (
            <div className="controls">
              <p className="small">{camera.info.label} · {camera.info.width}×{camera.info.height}{camera.info.frameRate ? ` · ${Math.round(camera.info.frameRate)} fps` : ''}</p>
              {!camera.info.capabilitiesApi && <p className="small warn">This browser does not report camera capabilities, so white balance, exposure and focus cannot be locked. The camera's automatic processing is active.</p>}
              <ul className="controls__list">
                {camera.info.controls.map((c) => (
                  <li key={c.name}>
                    <span>{c.label}</span>
                    {!c.supported && <span className="tag tag--off">Not available</span>}
                    {c.supported && c.modes && (
                      <select value={String(c.current ?? '')} onChange={(e) => ctrlChange(c.name, e.target.value)}>
                        {c.current === undefined && <option value="">—</option>}
                        {c.modes.map((m) => <option key={m} value={m}>{m === 'manual' ? 'manual (locked)' : m}</option>)}
                      </select>
                    )}
                    {c.supported && c.range && (
                      <input type="range" min={c.range.min} max={c.range.max} step={c.range.step} defaultValue={Number(c.current ?? c.range.min)}
                        onChange={(e) => ctrlChange(c.name, Number(e.target.value))} />
                    )}
                  </li>
                ))}
              </ul>
              {controlMsg && <p className="small">{controlMsg}</p>}
              <p className="small muted">Only controls the browser reports are shown as available. A setting is only described as applied if the browser reports it back.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
