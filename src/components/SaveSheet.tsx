import { useState } from 'react';
import { ITEM_CATEGORIES, type ItemCategory } from '../storage/colourHistory';

export interface SaveDraft {
  hex: string;
  verdict: string;
  photo: string | null;
  name: string;
}
interface Props {
  draft: SaveDraft;
  lastCategory: ItemCategory | null;
  onSave: (v: { name: string; category: ItemCategory | null; notes: string; includePhoto: boolean }) => void;
  onCancel: () => void;
}

export function SaveSheet({ draft, lastCategory, onSave, onCancel }: Props) {
  const [name, setName] = useState(draft.name);
  const [category, setCategory] = useState<ItemCategory | null>(lastCategory);
  const [notes, setNotes] = useState('');
  const [includePhoto, setIncludePhoto] = useState(!!draft.photo);
  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="save-title" onClick={onCancel}>
      <form className="sheet__panel" onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); onSave({ name: name.trim() || draft.name, category, notes: notes.trim(), includePhoto }); }}>
        <div className="sheet__head">
          <h2 id="save-title" className="card__title">Save capture</h2>
          <button type="button" className="linkbtn" onClick={onCancel}>Cancel</button>
        </div>
        <div className="capture">
          {draft.photo && includePhoto ? <img className="capture__img" src={draft.photo} alt="Captured view with the sampled spot circled" /> : <div className="capture__img capture__img--none">No photo</div>}
          <div className="capture__meta">
            <span className="capture__sw" style={{ background: draft.hex }} />
            <span className="mono">{draft.hex}</span>
            <span className="small muted">{draft.verdict}</span>
          </div>
        </div>
        <label className="field"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grey wool scarf" /></label>
        <div className="field">
          <span>What is it?</span>
          <div className="chips" role="radiogroup" aria-label="Category">
            {ITEM_CATEGORIES.map((c) => (
              <button type="button" key={c} role="radio" aria-checked={category === c} className={`chipbtn ${category === c ? 'is-on' : ''}`}
                onClick={() => setCategory(category === c ? null : c)}>{c}</button>
            ))}
          </div>
        </div>
        <label className="field"><span>Note (optional)</span><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Shop, brand, size, price…" /></label>
        {draft.photo && <label className="check"><input type="checkbox" checked={includePhoto} onChange={(e) => setIncludePhoto(e.target.checked)} /> Keep the photo with this colour</label>}
        <button className="btn btn--primary btn--block" type="submit">Save</button>
      </form>
    </div>
  );
}
