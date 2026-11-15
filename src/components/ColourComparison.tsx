import { useMemo, useState } from 'react';
import { describeHex, isValidHex, normaliseHex } from '../engine/colourConversion';
import { deltaE2000 } from '../engine/deltaE';
import { analyseHex } from '../engine/seasonalMatching';
import type { SavedSample } from '../storage/colourHistory';
import { fmt } from './format';

interface Item { id: string; name: string; hex: string }
interface Props { samples: SavedSample[]; compareIds: string[]; onToggle: (id: string) => void; onClear: () => void }

export function ColourComparison({ samples, compareIds, onToggle, onClear }: Props) {
  const [extra, setExtra] = useState<Item[]>([]);
  const [hexIn, setHexIn] = useState('');
  const items: Item[] = useMemo(() => [
    ...compareIds.map((id) => samples.find((s) => s.id === id)).filter(Boolean).map((s) => ({ id: s!.id, name: s!.name, hex: s!.hex })),
    ...extra,
  ], [compareIds, samples, extra]);
  const analyses = useMemo(() => items.map((i) => analyseHex(i.hex)), [items]);
  const best = analyses.length > 1 ? analyses.reduce((bi, a, i) => (a.primary.result.rankingDistance < analyses[bi].primary.result.rankingDistance ? i : bi), 0) : -1;
  const labs = items.map((i) => describeHex(i.hex).lab);

  const addHex = () => {
    if (!isValidHex(hexIn)) return;
    const hex = normaliseHex(hexIn);
    setExtra((e) => [...e, { id: `x-${hex}-${e.length}`, name: hex, hex }]);
    setHexIn('');
  };

  return (
    <section>
      <div className="card">
        <h3 className="card__title">Compare colours</h3>
        <p className="small muted">Pick saved colours with ⇄ in Saved, or add a HEX here.</p>
        <div className="row gap">
          <input className="mono" placeholder="#8E9196" value={hexIn} onChange={(e) => setHexIn(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addHex()} aria-invalid={hexIn !== '' && !isValidHex(hexIn)} />
          <button className="btn" onClick={addHex} disabled={!isValidHex(hexIn)}>Add HEX</button>
        </div>
        {samples.length > 0 && (
          <details>
            <summary>Choose from saved ({compareIds.length} selected)</summary>
            <ul className="picklist">
              {samples.map((s) => (
                <li key={s.id}><label><input type="checkbox" checked={compareIds.includes(s.id)} onChange={() => onToggle(s.id)} /><span className="sw" style={{ background: s.hex }} />{s.name} <span className="mono muted">{s.hex}</span></label></li>
              ))}
            </ul>
          </details>
        )}
        {items.length > 0 && <button className="linkbtn" onClick={() => { onClear(); setExtra([]); }}>Clear comparison</button>}
      </div>

      {items.length < 2 && <p className="small muted center">Add at least two colours to compare.</p>}

      {items.length >= 2 && (
        <>
          <div className="cmp">
            {items.map((it, i) => {
              const a = analyses[i];
              return (
                <div key={it.id} className={`cmp__col ${i === best ? 'is-best' : ''}`}>
                  <div className="cmp__sw" style={{ background: it.hex }} />
                  <p className="cmp__name">{it.name}</p>
                  <p className="mono small">{it.hex}</p>
                  <p className="small"><strong>{a.primary.result.match}</strong></p>
                  <p className="small">{a.primary.clothing}</p>
                  <p className="small muted">Index {a.primary.result.similarityIndex} · best {a.best.season.name}</p>
                  {i === best && <p className="badge">Better Soft Summer match</p>}
                  {!items[i].id.startsWith('x-') && <button className="linkbtn small" onClick={() => onToggle(it.id)}>Remove</button>}
                  {items[i].id.startsWith('x-') && <button className="linkbtn small" onClick={() => setExtra((e) => e.filter((x) => x.id !== it.id))}>Remove</button>}
                </div>
              );
            })}
          </div>
          <div className="card">
            <h3 className="card__title">ΔE00 between colours</h3>
            <div className="matrix-wrap">
              <table className="matrix">
                <thead><tr><th />{items.map((it) => <th key={it.id}><span className="sw" style={{ background: it.hex }} /></th>)}</tr></thead>
                <tbody>
                  {items.map((a, i) => (
                    <tr key={a.id}><th><span className="sw" style={{ background: a.hex }} /></th>
                      {items.map((b, j) => <td key={b.id} className="mono">{i === j ? '—' : fmt(deltaE2000(labs[i], labs[j]), 1)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small muted">Under ~1: usually indistinguishable side by side. 2–5: noticeable on close inspection. Above 10: clearly different colours.</p>
            {best >= 0 && <p className="small">{explain(items, analyses, best)}</p>}
          </div>
        </>
      )}
    </section>
  );
}

function explain(items: Item[], an: ReturnType<typeof analyseHex>[], best: number) {
  const b = an[best].primary.result;
  const others = an.map((a, i) => ({ a, i })).filter((x) => x.i !== best);
  const o = others[0];
  return `${items[best].name} is the better Soft Summer match (palette distance ${fmt(b.distance, 1)} vs ${fmt(o.a.primary.result.distance, 1)} for ${items[o.i].name}; weakest dimension fit ${fmt(b.fit.overall, 2)} vs ${fmt(o.a.primary.result.fit.overall, 2)}).`;
}
