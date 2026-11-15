import { useEffect, useMemo, useRef, useState } from 'react';
import type { DrapeAnswers } from '../storage/analyses';

type Dim = 'clarity' | 'temperature' | 'value';
// Each pair: [colour for the "−" pole, colour for the "+" pole], hue-matched, from the reference palettes.
const ROUNDS: { dim: Dim; title: string; minus: string; plus: string; pairs: [string, string][] }[] = [
  { dim: 'clarity', title: 'Soft or clear?', minus: 'Soft (muted)', plus: 'Clear (bright)', pairs: [['#6D7F98', '#1F4FD1'], ['#9E5C69', '#E0162B'], ['#5D8480', '#00A36C']] },
  { dim: 'temperature', title: 'Cool or warm?', minus: 'Cool', plus: 'Warm', pairs: [['#D47F96', '#F27B5F'], ['#4F6E9E', '#2F9A8E'], ['#8A8D93', '#B68A55']] },
  { dim: 'value', title: 'Light or deep?', minus: 'Deep', plus: 'Light', pairs: [['#1C2A55', '#B4C9DE'], ['#4F1E44', '#CBB2D6'], ['#36393E', '#C9CBCE']] },
];

interface Props { photo: HTMLCanvasElement; chinY: number; faceBox: { x: number; y: number; w: number; h: number }; initial: DrapeAnswers; onDone: (a: DrapeAnswers) => void }

/** Render the photo with a coloured cape below the chin (virtual drape). */
function drape(photo: HTMLCanvasElement, box: Props['faceBox'], chinY: number, colour: string, out: HTMLCanvasElement) {
  const W = 300, H = 400;
  out.width = W; out.height = H;
  const ctx = out.getContext('2d')!;
  // crop: face box expanded, 3:4
  const cw = box.w * 1.9, ch = cw * (4 / 3);
  const cx = box.x + box.w / 2, cy = box.y + box.h * 0.55;
  ctx.drawImage(photo, cx - cw / 2, cy - ch / 2, cw, ch, 0, 0, W, H);
  const k = W / cw;
  const yChin = (chinY - (cy - ch / 2)) * k;
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(0, yChin + H * 0.16);
  ctx.quadraticCurveTo(W * 0.18, yChin + H * 0.04, W * 0.38, yChin + H * 0.015);
  ctx.quadraticCurveTo(W / 2, yChin + H * 0.06, W * 0.62, yChin + H * 0.015);
  ctx.quadraticCurveTo(W * 0.82, yChin + H * 0.04, W, yChin + H * 0.16);
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
}

export function DrapeTest({ photo, chinY, faceBox, initial, onDone }: Props) {
  const [round, setRound] = useState(0);
  const [pairIdx, setPairIdx] = useState(0);
  const [votes, setVotes] = useState<Record<Dim, number[]>>({ clarity: [], temperature: [], value: [] });
  const [finished, setFinished] = useState(initial.clarity !== null || initial.temperature !== null || initial.value !== null);
  const left = useRef<HTMLCanvasElement>(null), right = useRef<HTMLCanvasElement>(null);
  const r = ROUNDS[round];
  const pair = r.pairs[pairIdx];
  const flip = (round + pairIdx) % 2 === 1; // alternate sides so position does not bias the choice
  const [colL, colR] = flip ? [pair[1], pair[0]] : [pair[0], pair[1]];

  useEffect(() => {
    if (finished) return;
    drape(photo, faceBox, chinY, colL, left.current!);
    drape(photo, faceBox, chinY, colR, right.current!);
  }, [photo, faceBox, chinY, colL, colR, finished]);

  const choose = (side: 'L' | 'R' | 'same') => {
    const v = side === 'same' ? 0 : ((side === 'L') !== flip ? -1 : 1); // −1 = minus pole preferred
    const nv = { ...votes, [r.dim]: [...votes[r.dim], v] };
    setVotes(nv);
    if (pairIdx + 1 < r.pairs.length) { setPairIdx(pairIdx + 1); return; }
    if (round + 1 < ROUNDS.length) { setRound(round + 1); setPairIdx(0); return; }
    const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
    onDone({ clarity: avg(nv.clarity), temperature: avg(nv.temperature), value: avg(nv.value) });
    setFinished(true);
  };
  const restart = () => { setVotes({ clarity: [], temperature: [], value: [] }); setRound(0); setPairIdx(0); setFinished(false); };

  const progress = useMemo(() => round * 3 + pairIdx + 1, [round, pairIdx]);

  if (finished) {
    const show = (v: number | null, minus: string, plus: string) => (v === null ? 'not tested' : Math.abs(v) < 0.34 ? 'no clear preference' : v < 0 ? minus : plus);
    return (
      <div className="card">
        <h3 className="card__title">Drape test result</h3>
        <ul className="small">
          <li>Chroma: <strong>{show(initial.clarity, 'Soft', 'Clear')}</strong></li>
          <li>Temperature: <strong>{show(initial.temperature, 'Cool', 'Warm')}</strong></li>
          <li>Value: <strong>{show(initial.value, 'Deep', 'Light')}</strong></li>
        </ul>
        <p className="small muted">Your answers are combined with the photo measurement (60% drape, 40% photo) in the ranking on the Colouring tab.</p>
        <button className="btn" onClick={restart}>Redo drape test</button>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 className="card__title">Drape test · {r.title}</h3>
      <p className="small muted">Look at your face, not the colour. Pick the side where the skin looks smoother and more even, the eyes clearer, and shadows under the eyes and around the mouth lighter. Step {progress} of 9.</p>
      <div className="drape">
        <button className="drape__opt" onClick={() => choose('L')}><canvas ref={left} /><span>This one</span></button>
        <button className="drape__opt" onClick={() => choose('R')}><canvas ref={right} /><span>This one</span></button>
      </div>
      <button className="btn btn--block" onClick={() => choose('same')}>Can't see a difference</button>
      <p className="small muted">The photo's own lighting colours this comparison, which is why physical draping in daylight stays the reference method.</p>
    </div>
  );
}
