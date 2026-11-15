/**
 * Firebase web configuration. These values are public identifiers (not secrets); access to
 * data is enforced by the security rules in firestore.rules. See FIREBASE_SETUP.md.
 * Leave as null to run the app without accounts (everything stays on the device).
 */
import type { FirebaseOptions } from 'firebase/app';

export const firebaseConfig: FirebaseOptions | null = null;
