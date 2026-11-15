import { useState } from 'react';
import { cloudConfigured, deleteAccountAndData, friendlyAuthError, resetPassword, signIn, signInGoogle, signOut, signUp, type CloudUser } from '../cloud/cloud';

interface Props { user: CloudUser | null; syncing: boolean; lastSync: string | null; onSync: () => void; onClose: () => void }

export function AccountPanel({ user, syncing, lastSync, onSync, onClose }: Props) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>, ok?: string) => {
    setBusy(true); setMsg(null);
    try { await fn(); if (ok) setMsg(ok); } catch (e) { setMsg(friendlyAuthError(e)); } finally { setBusy(false); }
  };

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="acct-title" onClick={onClose}>
      <div className="sheet__panel" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__head">
          <h2 id="acct-title" className="card__title">Account</h2>
          <button className="linkbtn" onClick={onClose}>Close</button>
        </div>

        {!cloudConfigured() && (
          <div className="prose">
            <p>Accounts aren't connected in this build yet. Everything works without an account and stays on this device.</p>
            <p className="small muted">To turn accounts on, add the Firebase project settings as described in FIREBASE_SETUP.md in the repository.</p>
          </div>
        )}

        {cloudConfigured() && !user && (
          <form className="acct" onSubmit={(e) => { e.preventDefault(); run(() => (mode === 'signin' ? signIn(email, pw) : signUp(email, pw))); }}>
            <div className="seg" role="group">
              <button type="button" className={`seg__btn ${mode === 'signin' ? 'is-on' : ''}`} onClick={() => setMode('signin')}>Sign in</button>
              <button type="button" className={`seg__btn ${mode === 'signup' ? 'is-on' : ''}`} onClick={() => setMode('signup')}>Create account</button>
            </div>
            <label className="field"><span>Email</span><input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
            <label className="field"><span>Password</span><input type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={pw} onChange={(e) => setPw(e.target.value)} minLength={6} required /></label>
            <button className="btn btn--primary btn--block" disabled={busy} type="submit">{busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}</button>
            <button type="button" className="btn btn--block" disabled={busy} onClick={() => run(signInGoogle)}>Continue with Google</button>
            {mode === 'signin' && <button type="button" className="linkbtn" disabled={busy || !email} onClick={() => run(() => resetPassword(email), 'Password reset email sent.')}>Forgot password?</button>}
            <p className="small muted">Your saved colours, calibration profiles and selfie analyses, including photos, are stored privately in your account. Only you can read them.</p>
          </form>
        )}

        {cloudConfigured() && user && (
          <div className="acct">
            <p>Signed in as <strong>{user.email ?? 'your account'}</strong></p>
            <p className="small muted">{syncing ? 'Syncing…' : lastSync ? `Last synced ${lastSync}` : 'Not synced yet'}</p>
            <button className="btn btn--block" onClick={onSync} disabled={syncing}>Sync now</button>
            <button className="btn btn--block" onClick={() => run(signOut)}>Sign out</button>
            <p className="small muted">Signing out keeps a copy on this device.</p>
            <button className="btn btn--danger btn--block" disabled={busy} onClick={() => {
              if (confirm('Delete your account and all cloud data, including photos? Data on this device is kept.')) run(deleteAccountAndData, 'Account and cloud data deleted.');
            }}>Delete account and cloud data</button>
          </div>
        )}
        {msg && <p className="small" role="status">{msg}</p>}
      </div>
    </div>
  );
}
