/**
 * Accounts and sync (Firebase Auth + Cloud Firestore), loaded lazily so the app stays light
 * and fully usable without an account.
 *
 * Data layout (all private to the signed-in user, enforced by firestore.rules):
 *   users/{uid}/samples/{id}     saved colours
 *   users/{uid}/profiles/{id}    calibration profiles
 *   users/{uid}/analyses/{id}    selfie analyses (without the photo)
 *   users/{uid}/photos/{id}      the analysis photo as a compressed JPEG data URL (< 1 MiB)
 * Photos go in Firestore rather than Cloud Storage because Cloud Storage now requires the
 * paid Blaze plan; Firestore works on the free Spark plan.
 */
import { firebaseConfig } from '../firebaseConfig';
import type { SavedSample } from '../storage/colourHistory';
import type { CalibrationProfile } from '../storage/calibrationProfiles';
import type { SavedAnalysis } from '../storage/analyses';

export interface CloudUser { uid: string; email: string | null; provider: string }
export const cloudConfigured = () => !!firebaseConfig;

type Mods = {
  app: typeof import('firebase/app');
  auth: typeof import('firebase/auth');
  fs: typeof import('firebase/firestore');
};
let modsP: Promise<Mods & { authI: import('firebase/auth').Auth; db: import('firebase/firestore').Firestore }> | null = null;

function load() {
  if (!firebaseConfig) return Promise.reject(new Error('Accounts are not configured in this build.'));
  if (!modsP) {
    modsP = (async () => {
      const [app, auth, fs] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
      const a = app.initializeApp(firebaseConfig!);
      const authI = auth.initializeAuth(a, { persistence: [auth.indexedDBLocalPersistence, auth.browserLocalPersistence] });
      return { app, auth, fs, authI, db: fs.getFirestore(a) };
    })();
  }
  return modsP;
}

export async function watchUser(cb: (u: CloudUser | null) => void): Promise<() => void> {
  if (!firebaseConfig) { cb(null); return () => undefined; }
  const { auth, authI } = await load();
  return auth.onAuthStateChanged(authI, (u) => cb(u ? { uid: u.uid, email: u.email, provider: u.providerData[0]?.providerId ?? 'password' } : null));
}

export function friendlyAuthError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  const map: Record<string, string> = {
    'auth/invalid-email': 'That email address doesn’t look right.',
    'auth/missing-password': 'Enter a password.',
    'auth/weak-password': 'Use at least 6 characters for the password.',
    'auth/email-already-in-use': 'There is already an account with this email. Sign in instead.',
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/wrong-password': 'Email or password is incorrect.',
    'auth/user-not-found': 'No account with this email. Create one instead.',
    'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
    'auth/popup-blocked': 'The sign-in window was blocked. Allow pop-ups for this site, or use email and password.',
    'auth/popup-closed-by-user': 'The sign-in window was closed before finishing.',
    'auth/unauthorized-domain': 'This web address isn’t authorised in Firebase yet (Authentication → Settings → Authorized domains).',
    'auth/network-request-failed': 'No connection. Check your internet and try again.',
    'auth/requires-recent-login': 'For security, sign in again and then repeat this.',
    'auth/operation-not-allowed': 'This sign-in method isn’t enabled in Firebase yet.',
  };
  return map[code] ?? (e instanceof Error ? e.message : 'Something went wrong.');
}

export async function signUp(email: string, password: string) { const { auth, authI } = await load(); await auth.createUserWithEmailAndPassword(authI, email, password); }
export async function signIn(email: string, password: string) { const { auth, authI } = await load(); await auth.signInWithEmailAndPassword(authI, email, password); }
export async function signInGoogle() {
  // Popup, not redirect: Safari blocks the third-party storage that redirect sign-in relies on.
  const { auth, authI } = await load();
  await auth.signInWithPopup(authI, new auth.GoogleAuthProvider());
}
export async function resetPassword(email: string) { const { auth, authI } = await load(); await auth.sendPasswordResetEmail(authI, email); }
export async function signOut() { const { auth, authI } = await load(); await auth.signOut(authI); }

function uidOrThrow(authI: import('firebase/auth').Auth) {
  const u = authI.currentUser;
  if (!u) throw new Error('Not signed in');
  return u.uid;
}

type Coll = 'samples' | 'profiles' | 'analyses' | 'photos';
async function put(coll: Coll, id: string, data: object) {
  const { fs, db, authI } = await load();
  await fs.setDoc(fs.doc(db, 'users', uidOrThrow(authI), coll, id), JSON.parse(JSON.stringify(data)));
}
async function del(coll: Coll, id: string) {
  const { fs, db, authI } = await load();
  await fs.deleteDoc(fs.doc(db, 'users', uidOrThrow(authI), coll, id));
}
async function all<T>(coll: Coll): Promise<T[]> {
  const { fs, db, authI } = await load();
  const snap = await fs.getDocs(fs.collection(db, 'users', uidOrThrow(authI), coll));
  return snap.docs.map((d) => d.data() as T);
}

export const pushSample = (s: SavedSample) => put('samples', s.id, s);
export const removeSample = (id: string) => del('samples', id);
export const pushProfile = (p: CalibrationProfile) => put('profiles', p.id, p);
export const removeProfile = (id: string) => del('profiles', id);
export async function pushAnalysis(a: SavedAnalysis) {
  const { photo, ...rest } = a;
  await put('photos', a.id, { id: a.id, photo });
  await put('analyses', a.id, rest);
}
export async function removeAnalysis(id: string) { await del('analyses', id); await del('photos', id); }

export interface CloudData { samples: SavedSample[]; profiles: CalibrationProfile[]; analyses: SavedAnalysis[] }
export async function pullAll(): Promise<CloudData> {
  const [samples, profiles, analysesNoPhoto, photos] = await Promise.all([
    all<SavedSample>('samples'), all<CalibrationProfile>('profiles'), all<Omit<SavedAnalysis, 'photo'>>('analyses'), all<{ id: string; photo: string }>('photos'),
  ]);
  const photoById = new Map(photos.map((p) => [p.id, p.photo]));
  const analyses = analysesNoPhoto.filter((a) => photoById.has(a.id)).map((a) => ({ ...a, photo: photoById.get(a.id)! }) as SavedAnalysis);
  return { samples, profiles, analyses };
}

/** Deletes every cloud document for this user, then the account itself. Local data is kept. */
export async function deleteAccountAndData() {
  const { fs, db, authI, auth } = await load();
  const uid = uidOrThrow(authI);
  for (const coll of ['samples', 'profiles', 'analyses', 'photos'] as Coll[]) {
    const snap = await fs.getDocs(fs.collection(db, 'users', uid, coll));
    await Promise.all(snap.docs.map((d) => fs.deleteDoc(d.ref)));
  }
  await auth.deleteUser(authI.currentUser!);
}
