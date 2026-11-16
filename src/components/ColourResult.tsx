import type { Analysis } from '../engine/seasonalMatching';
import type { Stability } from '../engine/sampling';
import { fmt } from './format';

interface Props {
  analysis: Analysis;
  rawHex: string;
  correctedHex: string;
  basis: 'corrected' | 'raw';
  onBasis?: (b: 'corrected' | 'raw') => void;
  profileName?: string | null;
  stability?: Stability;
  onSave?: () => void;
  onCopy: (hex: string) => void;
  clipped?: boolean;
  saveLabel?: string;
}

const matchClass = (m: string) => (m.startsWith('Strong') ? 'ok' : m.startsWith('Good') ? 'ok2' : m.startsWith('Possible') ? 'warn' : 'bad');
const fitClass = (l: string) => (l === 'Excellent' ? 'ok' : l === 'Good' ? 'ok2' : l === 'Fair' ? 'warn' : 'bad');

export function ColourResult({ analysis, rawHex, correctedHex, basis, onBasis, profileName, stability, onSave, onCopy, clipped, saveLabel }: Props) {
  const c = analysis.colour;
  const p = analysis.primary;
  const f = p.result.fit;
  const a = analysis.attributes;
  const showBoth = rawHex !== correctedHex;
  return (
    <section className="result" aria-live="polite">
      <div className="result__top">
        <div className="swatch-big">
          {showBoth ? (
            <>
              <div className={`swatch-big__half ${basis === 'raw' ? 'is-used' : ''}`} style={{ background: rawHex }}><span>Raw</span></div>
              <div className={`swatch-big__half ${basis === 'corrected' ? 'is-used' : ''}`} style={{ background: correctedHex }}><span>Corrected</span></div>
            </>
          ) : <div className="swatch-big__full" style={{ background: c.hex }} />}
        </div>
        <div className="result__ids">
          <button className="hex" onClick={() => onCopy(c.hex)} title="Copy HEX">{c.hex}<span className="hex__copy">Copy</span></button>
          <p className="mono small">RGB {c.rgb.r}, {c.rgb.g}, {c.rgb.b}</p>
          {showBoth && <p className="small muted">{basis === 'corrected' ? `Raw ${rawHex}` : `Corrected ${correctedHex}`}</p>}
          {stability && <p className={`small stab stab--${stability === 'Stable' ? 'ok' : stability === 'Moderate variation' ? 'warn' : 'bad'}`}>{stability}</p>}
        </div>
      </div>

      {onBasis && (
        <div className="seg seg--small" role="group" aria-label="Measurement used for classification">
          <button className={`seg__btn ${basis === 'corrected' ? 'is-on' : ''}`} onClick={() => onBasis('corrected')}>Corrected{profileName ? ` · ${profileName}` : ''}</button>
          <button className={`seg__btn ${basis === 'raw' ? 'is-on' : ''}`} onClick={() => onBasis('raw')}>Raw camera</button>
        </div>
      )}
      {clipped && <p className="small warn">The correction pushed this colour outside sRGB; it was gamut-mapped.</p>}

      <div className={`verdict verdict--${matchClass(p.result.match)}`}>
        <p className="verdict__eyebrow">Soft Summer compatibility</p>
        <p className="verdict__headline">{p.headline}</p>
        <p className="verdict__meta">{p.result.match} · {p.clothing} · similarity index {p.result.similarityIndex}<span className="muted"> (algorithmic, not a probability)</span></p>
      </div>

      <div className="dims">
        <Dim label="Temperature" value={a.temperature} fit={f.temperature.label} />
        <Dim label="Chroma" value={a.chromaClass} fit={f.chroma.label} />
        <Dim label="Lightness" value={a.lightnessClass} fit={f.lightness.label} />
      </div>

      <ul className="reasons">
        {p.reasons.map((r, i) => <li key={i}>{r}</li>)}
      </ul>

      <dl className="facts">
        <div><dt>Closest Soft Summer colour</dt><dd><Sw hex={p.closestReference.ref.hex} />{p.closestReference.ref.name} <span className="muted">ΔE00 {fmt(p.closestReference.deltaE, 1)}</span></dd></div>
        <div><dt>Closest palette overall</dt><dd>{analysis.best.season.name} <span className="muted">({analysis.bestFamily} family)</span></dd></div>
        <div><dt>Alternative</dt><dd>{p.alternative.season.name} <span className="muted">{p.alternative.match}</span></dd></div>
        <div><dt>Nearest reference anywhere</dt><dd><Sw hex={analysis.closestOverall.ref.hex} />{analysis.closestOverall.ref.name} <span className="muted">{seasonName(analysis.closestOverall.ref.subSeason)} · ΔE00 {fmt(analysis.closestOverall.deltaE, 1)}</span></dd></div>
      </dl>

      <details className="values">
        <summary>All colour values</summary>
        <table className="vtable"><tbody>
          <tr><th>HEX</th><td className="mono">{c.hex}</td></tr>
          <tr><th>RGB</th><td className="mono">{c.rgb.r}, {c.rgb.g}, {c.rgb.b}</td></tr>
          <tr><th>HSL</th><td className="mono">{fmt(c.hsl.h, 0)}°, {fmt(c.hsl.s, 1)}%, {fmt(c.hsl.l, 1)}%</td></tr>
          <tr><th>CIELAB (D65)</th><td className="mono">L* {fmt(c.lab.L, 2)} · a* {fmt(c.lab.a, 2)} · b* {fmt(c.lab.b, 2)}</td></tr>
          <tr><th>LCh(ab)</th><td className="mono">C* {fmt(c.lch.C, 2)} · h {fmt(c.lch.h, 1)}°</td></tr>
          <tr><th>OKLCH</th><td className="mono">L {fmt(c.oklch.L, 4)} · C {fmt(c.oklch.C, 4)} · h {fmt(c.oklch.h, 1)}°</td></tr>
          <tr><th>Undertone index</th><td className="mono">abs {fmt(a.undertone, 2)} · relative {fmt(a.relativeTemperature, 2)}</td></tr>
        </tbody></table>
        <p className="small muted">A precise HEX describes what the camera recorded under this light, not a verified measurement of the object.</p>
      </details>

      {onSave && <button className="btn btn--primary btn--block" onClick={onSave}>{saveLabel ?? 'Save colour'}</button>}
    </section>
  );
}

function Dim({ label, value, fit }: { label: string; value: string; fit: string }) {
  return (
    <div className="dim">
      <p className="dim__label">{label}</p>
      <p className="dim__value">{value}</p>
      <p className={`dim__fit fit--${fitClass(fit)}`}>{fit}</p>
    </div>
  );
}
export function Sw({ hex, size = 14 }: { hex: string; size?: number }) {
  return <span className="sw" style={{ background: hex, width: size, height: size }} />;
}
import { SEASON_BY_ID } from '../data/seasons';
const seasonName = (id: keyof typeof SEASON_BY_ID) => SEASON_BY_ID[id].name;
