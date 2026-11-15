import { useState } from 'react';
import { SEASONS } from '../data/seasons';
import { REFERENCE_COLOURS, SOURCE_NOTE } from '../data/database';
import type { ColourCategory, SubSeasonId } from '../data/types';
import { fmt } from './format';

const CATS: ColourCategory[] = ['white', 'grey', 'neutral', 'beige', 'brown', 'blue', 'green', 'red', 'pink', 'purple', 'yellow', 'metallic'];

export function PaletteBrowser({ onAnalyse }: { onAnalyse: (hex: string) => void }) {
  const [sid, setSid] = useState<SubSeasonId>('soft-summer');
  const [cat, setCat] = useState<ColourCategory | 'all'>('all');
  const s = SEASONS.find((x) => x.id === sid)!;
  const cols = REFERENCE_COLOURS.filter((c) => c.subSeason === sid && (cat === 'all' || c.category === cat));
  return (
    <section className="card">
      <h3 className="card__title">Reference palettes</h3>
      <div className="row gap wrap">
        <select value={sid} onChange={(e) => setSid(e.target.value as SubSeasonId)}>{SEASONS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <select value={cat} onChange={(e) => setCat(e.target.value as ColourCategory | 'all')}>
          <option value="all">All categories</option>{CATS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <p className="small">{s.summary} <span className="muted">{REFERENCE_COLOURS.filter((c) => c.subSeason === sid).length} colours. Profile: L* {s.profile.lightness.join('–')}, C* ≤ {s.profile.chromaMax}.</span></p>
      <ul className="pgrid">
        {cols.map((c) => (
          <li key={c.id}>
            <button onClick={() => onAnalyse(c.hex)} className="pgrid__btn" title={`Analyse ${c.name}`}>
              <span className="pgrid__sw" style={{ background: c.hex }} />
              <span className="pgrid__name">{c.name}</span>
              <span className="mono pgrid__hex">{c.hex}</span>
              <span className="pgrid__meta">{c.temperature} · {c.chroma} · {c.lightness}</span>
              <span className="pgrid__meta mono">L {fmt(c.lab.L, 0)} C {fmt(c.desc.lch.C, 0)} h {fmt(c.oklch.h, 0)}°</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="small muted">Provenance: {SOURCE_NOTE} Quality flag on every entry: illustrative digital approximation.</p>
    </section>
  );
}
