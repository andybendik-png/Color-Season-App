import { useState } from 'react';
import { isValidHex, normaliseHex } from '../engine/colourConversion';
import { analyseHex } from '../engine/seasonalMatching';
import { ColourResult } from './ColourResult';
import { SeasonRanking } from './SeasonRanking';
import { REFERENCE_COLOURS } from '../data/database';

const KNOWN: { label: string; hex: string }[] = [
  { label: 'Soft Summer slate blue', hex: '#6D7F98' }, { label: 'Soft Summer dusty rose', hex: '#C2939B' },
  { label: 'Cool but vivid (True Winter blue)', hex: '#1E4FB5' }, { label: 'Muted but warm (Soft Autumn)', hex: '#9A6B52' },
  { label: 'Warm and vivid (tomato)', hex: '#E5452F' }, { label: 'Pure white', hex: '#FFFFFF' },
  { label: 'Black', hex: '#000000' }, { label: 'Mid grey', hex: '#808080' }, { label: 'Navy', hex: '#1F2A44' }, { label: 'Camel', hex: '#C19A6B' },
];

export function HexAnalyser({ initial, onSave, onCopy }: { initial: string; onSave: (hex: string) => void; onCopy: (hex: string) => void }) {
  const [input, setInput] = useState(initial);
  const [hex, setHex] = useState(normaliseHex(initial));
  const valid = isValidHex(input);
  const analyse = (v: string) => { setInput(v); if (isValidHex(v)) setHex(normaliseHex(v)); };
  const a = analyseHex(hex);
  return (
    <section>
      <div className="card">
        <h3 className="card__title">Analyse a HEX colour</h3>
        <div className="row gap">
          <input className="mono hexinput" value={input} onChange={(e) => analyse(e.target.value)} aria-invalid={!valid} aria-describedby="hexhelp" spellCheck={false} autoCapitalize="characters" />
          <input type="color" value={hex.toLowerCase()} onChange={(e) => analyse(e.target.value.toUpperCase())} aria-label="Colour picker" />
          <button className="btn" onClick={() => { const r = REFERENCE_COLOURS[Math.floor(Math.random() * REFERENCE_COLOURS.length)]; analyse(r.hex); }}>Random reference</button>
        </div>
        <p id="hexhelp" className={`small ${valid ? 'muted' : 'warn'}`}>{valid ? 'Formats: #RGB or #RRGGBB.' : 'Enter a HEX value like #8E9196 or 8E9.'}</p>
        <details>
          <summary>Test bench: known values</summary>
          <div className="chips">{KNOWN.map((k) => <button key={k.hex} className="chipbtn" onClick={() => analyse(k.hex)}><span className="sw" style={{ background: k.hex }} />{k.label}</button>)}</div>
        </details>
      </div>
      <ColourResult analysis={a} rawHex={hex} correctedHex={hex} basis="raw" onCopy={onCopy} onSave={() => onSave(hex)} />
      <SeasonRanking analysis={a} />
    </section>
  );
}
