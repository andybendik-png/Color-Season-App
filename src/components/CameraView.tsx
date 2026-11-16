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
  /** Filled with a function that returns a small JPEG of what is on screen, with the sampled spot marked. */
  captureRef?: React.MutableRefObject<(() => string | null) | null>;
}

export function CameraView({ camera, onSample, size, onSize, compact, previewHex, seasonChip, captureRef }: Props) {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const frozenRef = useRef<HTMLCanvasElement | null>(null);
  const [frozen, setFrozen] = useState(false);
  const [pick, setPick] = useState<{ x: number; y: number } | null>(null);
  const [showControls, setShowControls] = useState(false);
  const [controlMsg, setControlMsg] = useState<string | null>(null);
  const radius = SIZE_RADIUS[size];
  const live = camera.state === 'live';
  const mirrored = camera.facing === 'user';
  const stageRef = useRef<HTMLDivElement | null>(null);
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
    const ctx = c.getContext('2d', { willReadFrequently: true } as CanvasRenderingContext2DSettings)!;
    ctx.save();
    // Front camera: store the frame mirrored, exactly as the preview shows it, so taps map directly.
    if (mirrored) { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, 0, 0, c.width, c.height);
    ctx.restore();
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

  // Capture: crop to what is visible on screen (object-fit: cover), scale to <= 480 px, mark the sampled spot.
  useEffect(() => {
    if (!captureRef) return;
    captureRef.current = () => {
      const stage = stageRef.current;
      if (!stage || !video) return null;
      const src: CanvasImageSource | null = frozen ? frozenRef.current : video;
      const sw = frozen ? frozenRef.current!.width : video.videoWidth, sh = frozen ? frozenRef.current!.height : video.videoHeight;
      if (!src || !sw || !sh) return null;
      const cw = stage.clientWidth, ch = stage.clientHeight;
      const scale = Math.max(cw / sw, ch / sh);
      const vw = cw / scale, vh = ch / scale, x0 = (sw - vw) / 2, y0 = (sh - vh) / 2;
      const k = Math.min(1, 480 / Math.max(vw, vh));
      const out = document.createElement('canvas');
      out.width = Math.round(vw * k); out.height = Math.round(vh * k);
      const ctx = out.getContext('2d')!;
      ctx.save();
      if (!frozen && mirrored) { ctx.translate(out.width, 0); ctx.scale(-1, 1); }
      ctx.drawImage(src, x0, y0, vw, vh, 0, 0, out.width, out.height);
      ctx.restore();
      const px = (pick ? pick.x : cw / 2) * (out.width / cw), py = (pick ? pick.y : ch / 2) * (out.height / ch);
      const r = Math.max(5, radius * (out.width / cw));
      ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.beginPath(); ctx.arc(px, py, r + 2, 0, Math.PI * 2); ctx.stroke();
      return out.toDataURL('image/jpeg', 0.75);
    };
    return () => { captureRef.current = null; };
  }, [captureRef, video, frozen, pick, radius, mirrored]);

  const stability = sample?.stability;
  const ctrlChange = async (name: Parameters<CameraApi['setControl']>[0], value: string | number) => {
    const r = await camera.setControl(name, value);
    setControlMsg(r.message);
  };

  return (
    <div className={`camera ${compact ? 'camera--compact' : ''}`}>
      <div className="camera__stage" ref={stageRef}>
        <video ref={setVideo} playsInline autoPlay muted className="camera__video" style={{ visibility: frozen ? 'hidden' : 'visible', transform: mirrored ? 'scaleX(-1)' : undefined }} />
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
                <p className="camera__ph-sub">Colour analysis happens on this device. Captures you save sync to your account only if you're signed in.</p>
                <div className="row gap">
                  <button className="btn btn--primary" onClick={() => camera.start('environment')}>Start camera</button>
                  <button className="btn" onClick={() => camera.start('user')}>Selfie camera</button>
                </div>
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
            <button className="btn" onClick={() => camera.flip()} aria-label={mirrored ? 'Switch to rear camera' : 'Switch to selfie camera'} title="Switch camera">{mirrored ? 'Rear' : 'Selfie'}</button>
            <button className="btn" onClick={camera.stop}>Stop</button>
          </div>
        </div>
      )}
      {live && mirrored && <p className="small muted">Selfie camera: hold the item next to your face. The front camera has its own colour processing, so a calibration profile made with the rear camera may not fit it. Make a separate profile if readings look off.</p>}
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
