import { useRef } from 'react';
import type { FaceSession } from '../hooks/useFaceSession';
import type { SavedAnalysis } from '../storage/analyses';
import { fmtDate } from './format';

interface Props { session: FaceSession; saved: SavedAnalysis[]; onDelete: (id: string) => void; signedIn: boolean; mode: 'colour' | 'face' }

/** Start screen shared by the Colour and Face tabs: photo tips, take/choose a photo, saved analyses. */
export function PhotoPicker({ session, saved, onDelete, signedIn, mode }: Props) {
  const fileRef = useRef<HTMLInputElement>(null), camRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <div className="card prose">
        {mode === 'colour' ? (
          <>
            <h3 className="card__title">Find your season from a photo</h3>
            <p>The app measures your skin, hair and eye colours on this device, estimates warm/cool, light/deep and soft/clear, and ranks the 12 seasons. You can then check it with a virtual drape test.</p>
            <ol>
              <li>Face a window in daylight, with no direct sun and no lamps on.</li>
              <li>No makeup, filters or beauty mode. Wear white or grey against a plain background.</li>
              <li>Hold a sheet of white paper under your chin to use as a white reference.</li>
            </ol>
            <p className="small muted">Even under ideal light, selfie-based season apps got the broad season right only about half the time in a studio test. Use this as a guide.</p>
          </>
        ) : (
          <>
            <h3 className="card__title">Face proportions, brows and grooming</h3>
            <p>One photo is enough. The app measures how your face <em>looks</em> (with your hair and beard as you wear them) in thirds and fifths, then suggests realistic hair, beard, brow and glasses tweaks.</p>
            <ol>
              <li>Hair and beard as you normally wear them, neutral face, lips together.</li>
              <li>Camera at eye level, face straight on, forehead and both ears' area visible.</li>
              <li>Hold the phone at full arm's length or further. Close selfies make the nose look about 30% wider and distort the middle fifths. A timer photo from 1–1.5 m is best.</li>
            </ol>
            <p className="small muted">Optional later: a second photo with hair pushed back shows your actual hairline. It isn't needed for the analysis.</p>
          </>
        )}
      </div>
      <div className="row gap">
        <button className="btn btn--primary" style={{ flex: 1 }} onClick={() => camRef.current?.click()} disabled={session.busy}>Take a selfie</button>
        <button className="btn" style={{ flex: 1 }} onClick={() => fileRef.current?.click()} disabled={session.busy}>Choose a photo</button>
      </div>
      <input ref={camRef} type="file" accept="image/*" capture="user" hidden onChange={(e) => { session.openFile(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { session.openFile(e.target.files?.[0]); e.target.value = ''; }} />
      {session.status && <p className="small muted" role="status">{session.status}</p>}
      {saved.length > 0 && (
        <div className="card">
          <h3 className="card__title">Saved analyses</h3>
          <ul className="alist">
            {saved.map((s) => (
              <li key={s.id}>
                <button className="alist__open" onClick={() => session.open(s.photo, s)}>
                  <img src={s.photo} alt="" />
                  <span><strong>{s.summary.combinedTop ?? s.summary.topSeason}</strong>
                    <br /><span className="small muted">{fmtDate(s.createdAt)}{s.proportions ? ' · proportions saved' : ''}</span></span>
                </button>
                <button className="iconbtn iconbtn--danger" onClick={() => { if (confirm('Delete this analysis and its photo?')) onDelete(s.id); }} aria-label="Delete analysis">✕</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="small muted center">{signedIn ? 'Saved analyses, including photos, sync to your account.' : 'Saved analyses stay on this device. Sign in to sync them to your account.'}</p>
    </>
  );
}
