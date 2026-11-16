import { useMemo, useState } from 'react';
import { ITEM_CATEGORIES, type ItemCategory, type SavedSample } from '../storage/colourHistory';
import { fmtDate } from './format';

type Filter = 'all' | 'palette' | 'fits' | 'borderline' | 'not';
interface Props {
  samples: SavedSample[];
  compareIds: string[];
  onToggleCompare: (id: string) => void;
  onUpdate: (s: SavedSample) => void;
  onDelete: (id: string) => void;
  onCopy: (hex: string) => void;
  onOpen: (s: SavedSample) => void;
  onExport: () => void;
  onImport: (file: File) => void;
}

export function ColourHistory({ samples, compareIds, onToggleCompare, onUpdate, onDelete, onCopy, onOpen, onExport, onImport }: Props) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<string | null>(null);
  const [cat, setCat] = useState<ItemCategory | 'all' | 'none'>('all');
  const [viewing, setViewing] = useState<SavedSample | null>(null);
  const usedCats = useMemo(() => ITEM_CATEGORIES.filter((c) => samples.some((s) => s.category === c)), [samples]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return samples.filter((s) => {
      if (filter === 'palette' && !s.inPalette) return false;
      if (filter === 'fits' && !/Strong|Good/.test(s.softSummerMatch)) return false;
      if (filter === 'borderline' && !/Possible/.test(s.softSummerMatch)) return false;
      if (filter === 'not' && !/Weak|Poor/.test(s.softSummerMatch)) return false;
      if (cat === 'none' && s.category) return false;
      if (cat !== 'all' && cat !== 'none' && s.category !== cat) return false;
      if (!t) return true;
      return [s.name, s.hex, s.rawHex, s.bestSeasonName, s.softSummerMatch, s.clothing, s.notes ?? '', s.category ?? ''].some((x) => x.toLowerCase().includes(t));
    });
  }, [samples, q, filter, cat]);

  return (
    <section>
      <div className="toolbar">
        <input className="search" type="search" placeholder="Search name, HEX, season…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="chips" role="group" aria-label="Filter">
          {([['all', 'All'], ['palette', 'My palette'], ['fits', 'Fits Soft Summer'], ['borderline', 'Borderline'], ['not', 'Not recommended']] as [Filter, string][]).map(([k, l]) => (
            <button key={k} className={`chipbtn ${filter === k ? 'is-on' : ''}`} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
        {usedCats.length > 0 && (
          <select value={cat} onChange={(e) => setCat(e.target.value as ItemCategory | 'all' | 'none')} aria-label="Filter by item type">
            <option value="all">All item types</option>
            {usedCats.map((c) => <option key={c} value={c}>{c}</option>)}
            <option value="none">No type set</option>
          </select>
        )}
      </div>
      {!samples.length && (
        <div className="empty">
          <p className="empty__title">No saved colours yet</p>
          <p className="small muted">Scan something and tap “Save sample”, or analyse a HEX code.</p>
        </div>
      )}
      {samples.length > 0 && !list.length && <p className="small muted center">No samples match this filter.</p>}
      {filter === 'palette' && list.length > 0 && (
        <div className="palette-strip" aria-label="Personal palette">{list.map((s) => <span key={s.id} style={{ background: s.hex }} title={`${s.name} ${s.hex}`} />)}</div>
      )}
      <ul className="hist">
        {list.map((s) => (
          <li key={s.id} className="hist__item">
            <div className="hist__thumb">
              {s.photo
                ? <button className="hist__photo" onClick={() => setViewing(s)} aria-label={`View photo of ${s.name}`}><img src={s.photo} alt="" /></button>
                : <button className="hist__sw" style={{ background: s.hex }} onClick={() => onOpen(s)} aria-label={`Open ${s.name}`} />}
              {s.photo && <button className="hist__chip" style={{ background: s.hex }} onClick={() => onOpen(s)} aria-label={`Analyse ${s.hex}`} />}
            </div>
            <div className="hist__main">
              {editing === s.id ? (
                <input className="hist__rename" defaultValue={s.name} autoFocus
                  onBlur={(e) => { setEditing(null); const v = e.target.value.trim(); if (v && v !== s.name) onUpdate({ ...s, name: v }); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
              ) : <button className="hist__name" onClick={() => setEditing(s.id)} title="Rename">{s.name}</button>}
              <p className="mono small"><button className="linkbtn mono" onClick={() => onCopy(s.hex)}>{s.hex}</button> · RGB {s.rgb.r},{s.rgb.g},{s.rgb.b}</p>
              <p className="small"><span className={`pill pill--${/Strong|Good/.test(s.softSummerMatch) ? 'ok' : /Possible/.test(s.softSummerMatch) ? 'warn' : 'bad'}`}>{s.clothing}</span> <span className="muted">Best: {s.bestSeasonName} · index {s.softSummerIndex}</span></p>
              <p className="small">
                <select className="hist__cat" value={s.category ?? ''} onChange={(e) => onUpdate({ ...s, category: (e.target.value || undefined) as ItemCategory | undefined })} aria-label="Item type">
                  <option value="">+ Item type</option>
                  {ITEM_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                {s.camera === 'front' && <span className="muted"> · selfie camera</span>}
              </p>
              {s.notes && <p className="small muted">{s.notes}</p>}
              <p className="small muted">{fmtDate(s.createdAt)} · {s.basis === 'corrected' && s.profile ? `Profile: ${s.profile.name}` : 'Raw camera'}{s.rawHex !== s.hex ? ` · raw ${s.rawHex}` : ''}</p>
            </div>
            <div className="hist__actions">
              <button className={`iconbtn ${s.inPalette ? 'is-on' : ''}`} onClick={() => onUpdate({ ...s, inPalette: !s.inPalette })} aria-pressed={s.inPalette} title="Personal palette">{s.inPalette ? '★' : '☆'}</button>
              <button className={`iconbtn ${compareIds.includes(s.id) ? 'is-on' : ''}`} onClick={() => onToggleCompare(s.id)} aria-pressed={compareIds.includes(s.id)} title="Add to comparison">⇄</button>
              <button className="iconbtn iconbtn--danger" onClick={() => { if (confirm(`Delete "${s.name}"?`)) onDelete(s.id); }} title="Delete">✕</button>
            </div>
          </li>
        ))}
      </ul>
      {viewing && (
        <div className="sheet" role="dialog" aria-modal="true" aria-label={viewing.name} onClick={() => setViewing(null)}>
          <div className="sheet__panel" onClick={(e) => e.stopPropagation()}>
            <div className="sheet__head"><h2 className="card__title">{viewing.name}</h2><button className="linkbtn" onClick={() => setViewing(null)}>Close</button></div>
            <img className="capture__full" src={viewing.photo} alt={`Photo of ${viewing.name}; the ring shows the sampled spot`} />
            <p className="small"><span className="sw" style={{ background: viewing.hex }} /><span className="mono">{viewing.hex}</span> · {viewing.clothing}{viewing.category ? ` · ${viewing.category}` : ''}</p>
            <button className="btn btn--block" onClick={() => { onUpdate({ ...viewing, photo: undefined }); setViewing(null); }}>Remove photo, keep colour</button>
          </div>
        </div>
      )}
      <div className="row gap wrap io">
        <button className="btn" onClick={onExport}>Export JSON</button>
        <label className="btn">Import JSON<input type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ''; }} /></label>
      </div>
      <p className="small muted">Export includes saved colours (with their photos) and calibration profiles. Without an account, everything stays on this device.</p>
    </section>
  );
}
