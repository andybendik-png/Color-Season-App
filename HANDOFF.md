# Handoff: verify, then add accounts

Status as of 15 Nov 2026. Live at **https://andybendik-png.github.io/Color-Season-App/**. Every push to `main` runs the tests, builds and deploys (`.github/workflows/deploy.yml`).

## 1. What exists

| Area | Where | State |
|---|---|---|
| Live colour scanner, calibration, saved colours, compare, HEX analyser | `src/components`, `src/engine` | Done; e2e-tested with a synthetic camera feed |
| 12-season palette database (637 colours) | `src/data/palettes`, `src/data/PROVENANCE.md` | Done; illustrative digital approximations, not measured swatches |
| Selfie season analysis (Me tab) | `src/engine/faceAnalysis.ts`, `src/components/SelfieStudio.tsx` | Done; heuristic thresholds, not validated against draped people |
| Virtual drape test | `src/components/DrapeTest.tsx` | Done |
| Eyebrow mapping | `src/engine/brows.ts`, `src/components/BrowStudio.tsx` | Done; tested on one low-res photo only |
| Face landmarks (MediaPipe) | `src/engine/faceLandmarks.ts` | The model is downloaded in CI (`npm run fetch-model`) and served from the app's own origin |
| Accounts + sync (Firebase) | `src/cloud/`, `src/firebaseConfig.ts`, `firestore.rules` | **Code done, not switched on.** `firebaseConfig` is `null` |
| Research notes with sources | Claude project doc `research-selfie-season-and-brows.md` | Done |

## 2. Verification checklist

### Automated
1. `npm ci && npm test`: expect **109 tests passing**. These cover colour maths against published references, all 34 Sharma CIEDE2000 pairs, colour correction, season matching, palette coherence, selfie scoring and brow geometry.
2. `npm run build` should finish with no TypeScript errors.
3. Check the GitHub Actions run is green, and that `/models/face_landmarker.task` and `/mediapipe-wasm/` are served on the Pages site.

### Manual, on an iPhone in Safari (not done yet, highest priority)
1. **Scan tab:** camera starts, the sampling circle and Stable chip update, the season chip shows on the camera, and Freeze → tap-to-pick works.
2. **Camera controls panel:** check which controls iOS actually reports. Expect white-balance and exposure locks to show as unavailable.
3. **Calibrate:** create a profile, adjust it and save. The Scan tab then shows that profile name and a corrected value next to the raw one.
4. **Add to Home Screen:** the app opens full-screen. Turn on Airplane mode, reopen, and confirm it still loads.
5. **Me tab:** a front-camera selfie is found automatically and the points land on their targets. Drag one point and confirm the results change. Tick the white-reference box and drag the White point onto white paper.
6. **Selfie orientation:** check that iPhone photos come in the right way up, and whether front-camera photos are mirrored. Brow labels say "left/right of the photo" for this reason.
7. **Drape test:** the 9 steps complete and the ranking changes.
8. **Brows:** check the Map, After and Before views on a sharp, straight-on photo. Look for false "trim" areas from eye-socket shadow.
9. **Saved:** saving and reopening an analysis works, and data survives an app restart.

### Things worth challenging
- **Season scoring for selfies** (`faceAnalysis.ts`): the thresholds (skin hue centre 57°, contrast centre 38 L*, and so on) are educated guesses. The best check is photos of people with a known, professionally draped season.
- **Brow hair detection** uses luminance. On blurry or very light brows it can mistake shadow for hair. Mitigations are in `computeMasks` in `BrowStudio.tsx`.
- **Palette bias:** Soft Summer has 77 reference colours and the other seasons 50–55, which slightly favours Soft Summer in close calls.
- **Undertone model:** two earlier versions were rejected. The current approach is documented in `src/engine/attributes.ts`.

## 3. Turning on Firebase accounts
Follow **`FIREBASE_SETUP.md`**. In short:
1. Create a Firebase project on the free Spark plan.
2. Enable Email/Password and Google sign-in, and add `andybendik-png.github.io` to the authorised domains.
3. Create a Firestore database (EU location) and publish the rules from `firestore.rules`.
4. Paste the web config into `src/firebaseConfig.ts`, then push.

Design choices already made:
- **Photos are stored in Firestore**, compressed to a JPEG under 1 MiB. Cloud Storage would need the paid Blaze plan.
- **Google sign-in uses a popup**, because Safari breaks redirect sign-in on non-Firebase domains.
- **Sync is a two-way merge by id, and the newer copy wins** (`src/cloud/sync.ts`). Deletes are pushed as they happen; there are no tombstones yet. So if two devices are offline, something deleted on one can come back from the other.

## 4. Alternatives to Firebase
Everything backend-specific is in **`src/cloud/cloud.ts`** and `src/cloud/sync.ts`. An alternative backend only has to provide the same exports:
- auth: `watchUser`, `signUp`, `signIn`, `signInGoogle`, `resetPassword`, `signOut`
- push/remove for samples, profiles and analyses
- `pullAll`, `deleteAccountAndData`

The UI (`AccountPanel.tsx`) and the local IndexedDB store stay as they are.

| Option | Pros | Cons |
|---|---|---|
| **Supabase** (Postgres + Auth + Storage) | Row-level security; EU region; photos can go in Storage on the free tier; SQL access | New schema and policies to write; free projects pause after inactivity |
| **PocketBase** (self-hosted, single binary) | Full control; auth and file storage built in | You run and patch a server (e.g. a small VPS or Fly.io) |
| **No accounts: iCloud/Drive via file export** | No backend and maximum privacy; Export/Import JSON already exists | Manual; photos are not in the export yet |
| **Cloudflare (Workers + D1 + R2)** | Cheap, fast, EU-friendly | Auth must be built or added (e.g. via a third-party provider) |

Whichever you choose: face photos are biometric-adjacent personal data. Keep them private per user, offer deletion (already in the UI) and choose an EU data location.

## 5. Known gaps / next steps
1. Test everything in section 2 on a real iPhone.
2. Add photos to the JSON export, so that people without accounts can back them up.
3. Add delete tombstones to sync.
4. Validate the selfie scoring against real draped results and tune the thresholds in `faceAnalysis.ts`.
5. Optionally add a calibration-card workflow (colour checker) for objective camera correction.

## 6. Repo map
```
src/engine/      colour maths, sampling, correction, matching, selfie scoring, brows, landmarks
src/data/        seasons + palettes (+ PROVENANCE.md)
src/components/  UI
src/storage/     IndexedDB (samples, profiles, analyses, settings)
src/cloud/       Firebase auth + Firestore sync (lazy-loaded)
src/tests/       vitest suites
scripts/         copy-assets.mjs (MediaPipe WASM → public/)
```
