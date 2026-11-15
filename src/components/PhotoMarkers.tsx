import { useEffect, useRef, useState } from 'react';
import type { PointKey, SamplePoint } from '../engine/faceLandmarks';

interface Props {
  canvas: HTMLCanvasElement;
  points: Record<PointKey, SamplePoint>;
  onChange: (key: PointKey, p: SamplePoint) => void;
  showWhite: boolean;
}
const COLORS: Record<SamplePoint['kind'], string> = { skin: '#f3d9c9', hair: '#7a6b69', eye: '#8ea2b8', brow: '#4e555d', white: '#ffffff' };

/** Photo with draggable sampling markers. Coordinates are in photo pixels. */
export function PhotoMarkers({ canvas, points, onChange, showWhite }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const shown = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(1);
  const drag = useRef<{ key: PointKey; dx: number; dy: number } | null>(null);

  useEffect(() => {
    const c = shown.current!;
    c.width = canvas.width; c.height = canvas.height;
    c.getContext('2d')!.drawImage(canvas, 0, 0);
    const ro = new ResizeObserver(() => setScale((box.current?.clientWidth ?? canvas.width) / canvas.width));
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, [canvas]);

  const down = (key: PointKey) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const rect = box.current!.getBoundingClientRect();
    const p = points[key];
    drag.current = { key, dx: (e.clientX - rect.left) / scale - p.x, dy: (e.clientY - rect.top) / scale - p.y };
  };
  const move = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const rect = box.current!.getBoundingClientRect();
    const { key, dx, dy } = drag.current;
    const x = Math.max(0, Math.min(canvas.width, (e.clientX - rect.left) / scale - dx));
    const y = Math.max(0, Math.min(canvas.height, (e.clientY - rect.top) / scale - dy));
    onChange(key, { ...points[key], x, y });
  };
  const up = () => { drag.current = null; };

  return (
    <div className="photo" ref={box} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <canvas ref={shown} className="photo__img" />
      {(Object.keys(points) as PointKey[]).filter((k) => showWhite || k !== 'white').map((k) => {
        const p = points[k];
        const size = Math.max(22, p.r * 2 * scale);
        return (
          <div key={k} className={`marker marker--${p.kind}`} onPointerDown={down(k)}
            style={{ left: p.x * scale, top: p.y * scale, width: size, height: size, borderColor: COLORS[p.kind] }}
            role="slider" aria-label={`${p.label} sample point`} aria-valuetext={`${Math.round(p.x)}, ${Math.round(p.y)}`} tabIndex={0}>
            <span className="marker__label">{p.label}</span>
          </div>
        );
      })}
    </div>
  );
}
