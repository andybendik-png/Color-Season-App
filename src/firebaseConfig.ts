/**
 * Firebase web configuration. These values are public identifiers (not secrets); access to
 * data is enforced by the security rules in firestore.rules. See FIREBASE_SETUP.md.
 * Leave as null to run the app without accounts (everything stays on the device).
 */
import type { FirebaseOptions } from 'firebase/app';

export const firebaseConfig: FirebaseOptions | null = {
  apiKey: 'AIzaSyADgK0DqV73zaITlsUjPzrypp_KcyQWFiA',
  authDomain: 'color-season-app.firebaseapp.com',
  projectId: 'color-season-app',
  storageBucket: 'color-season-app.firebasestorage.app',
  messagingSenderId: '1009947322796',
  appId: '1:1009947322796:web:39260ed0fa77ea2f05f209',
};
