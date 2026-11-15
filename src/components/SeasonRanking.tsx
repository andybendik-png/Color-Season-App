import { useState } from 'react';
import type { Analysis } from '../engine/seasonalMatching';
import { Sw } from './ColourResult';
import { fmt } from './format';

export function SeasonRanking({ analysis }: { analysis: Analysis }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="card">
      <h3 className="card__title">All 12 seasons, ranked</h3>
      <p className="small muted">Bar = similarity index (0–100). Ranked by palette distance D (weighted 3 nearest, CIEDE2000) plus a penalty for poor temperature / chroma / lightness fit.</p>
      <ol className="rank">
        {analysis.ranking.map((r, i) => {
          const isOpen = open === r.season.id;
          return (
            <li key={r.season.id} className={`rank__row ${r.season.id === 'soft-summer' ? 'is-primary' : ''}`}>
              <button className="rank__head" onClick={() => setOpen(isOpen ? null : r.season.id)} aria-expanded={isOpen}>
                <span className="rank__n">{i + 1}</span>
                <span className="rank__name">{r.season.name}</span>
                <span className="rank__bar"><span style={{ width: `${r.similarityIndex}%` }} /></span>
                <span className="rank__score mono">{r.similarityIndex}</span>
              </button>
              {isOpen && (
                <div className="rank__body">
                  <p className="small"><strong>{r.match}</strong> · D = {fmt(r.distance, 2)} ΔE00 · ranking distance {fmt(r.rankingDistance, 2)} · fit {fmt(r.fit.overall, 2)}</p>
                  <p className="small muted">{r.season.summary} Fit judged against {r.fit.basis}.</p>
                  <ul className="fitlist">
                    <li><span>Temperature</span><span className={`fit--${r.fit.temperature.label === 'Excellent' ? 'ok' : r.fit.temperature.label === 'Poor' ? 'bad' : 'warn'}`}>{r.fit.temperature.label}</span><em>{r.fit.temperature.detail}</em></li>
                    <li><span>Chroma</span><span className={`fit--${r.fit.chroma.label === 'Excellent' ? 'ok' : r.fit.chroma.label === 'Poor' ? 'bad' : 'warn'}`}>{r.fit.chroma.label}</span><em>{r.fit.chroma.detail}</em></li>
                    <li><span>Lightness</span><span className={`fit--${r.fit.lightness.label === 'Excellent' ? 'ok' : r.fit.lightness.label === 'Poor' ? 'bad' : 'warn'}`}>{r.fit.lightness.label}</span><em>{r.fit.lightness.detail}</em></li>
                  </ul>
                  <p className="small"><strong>Closest reference colours</strong></p>
                  <ul className="nearest">
                    {r.nearest.map((n) => (
                      <li key={n.ref.id}><Sw hex={n.ref.hex} size={22} /><span>{n.ref.name}</span><span className="mono muted">{n.ref.hex}</span><span className="mono">ΔE {fmt(n.deltaE, 1)}</span></li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
