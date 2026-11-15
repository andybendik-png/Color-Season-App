# Turning on accounts (Firebase)

This takes about 10 minutes and stays on the free **Spark** plan. Photos are stored in Firestore as compressed JPEGs, because Cloud Storage would need the paid Blaze plan.

1. Go to **console.firebase.google.com**, click **Create a project** and name it (e.g. `soft-summer-scanner`). Google Analytics is not needed.
2. In the project, click the **Web** icon `</>` and register an app (any nickname, no Hosting). Copy the `firebaseConfig` object it shows.
3. **Authentication**:
   1. Go to **Authentication → Get started → Sign-in method**.
   2. Enable **Email/Password**.
   3. Enable **Google** and choose a support email.
   4. Go to **Authentication → Settings → Authorized domains** and add `andybendik-png.github.io`.
4. **Firestore**:
   1. Go to **Firestore Database → Create database**.
   2. Pick a location (for Denmark, `eur3` or `europe-north1`) and start in **production mode**.
5. **Rules**: in Firestore → **Rules**, replace the contents with [`firestore.rules`](firestore.rules) from this repo and click **Publish**.
6. Paste the config from step 2 into `src/firebaseConfig.ts`:
   ```ts
   export const firebaseConfig: FirebaseOptions | null = {
     apiKey: '…', authDomain: '….firebaseapp.com', projectId: '…',
     storageBucket: '…', messagingSenderId: '…', appId: '…',
   };
   ```
   These values are public identifiers, not secrets. The rules are what protect the data.
7. Commit and push. GitHub Actions rebuilds and redeploys. A **Sign in** button then appears top right.

## What is stored
| Path | Content |
|---|---|
| `users/{uid}/samples/{id}` | saved colours |
| `users/{uid}/profiles/{id}` | calibration profiles |
| `users/{uid}/analyses/{id}` | selfie analyses (points, results, no photo) |
| `users/{uid}/photos/{id}` | the analysis photo (JPEG, max 900 px, under 1 MiB) |

Only the signed-in owner can read or write their documents (see `firestore.rules`). The Account panel has **Delete account and cloud data**, which removes every document and then the account.

## Notes
- Google sign-in uses a popup. Safari blocks the cross-site storage that redirect sign-in needs, so redirect isn't used. If a popup is blocked, use email and password.
- Free Spark quotas (per day: 50k reads, 20k writes, 1 GiB stored) are far above personal use.
