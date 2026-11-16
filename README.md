# Soft Summer Scanner

A mobile-first PWA for iPhone. Point the rear camera at a garment, fabric, paint or object. The app extracts the colour, converts it to HEX / RGB / HSL / CIELAB / OKLCH, and tells you whether the colour belongs to **Soft Summer**. If it doesn't, the app names the closest of the 12 seasonal sub-seasons.

Colour analysis and face detection run on the device, and the live camera feed is never uploaded. Accounts are optional (Firebase). When you're signed in, saved colours, their capture photos, profiles and selfie analyses sync privately to your account. Works offline after the first load.

## Tabs
Five tabs, following iOS guidance (3–5). Related tools are segments inside a tab.
- **Scan:** Camera / HEX code / Calibrate.
- **My colours:** colour season from a photo, plus the drape test.
- **Face:** proportions (thirds and fifths), brows, and progress over time.
- **Saved:** Colours / Compare.
- **Guide.**

The Colour and Face tabs share one photo.

## Features
- **Live scan**: rear camera or selfie (front) camera with a Rear/Selfie switch, a central sampling circle (Small / Medium / Large), about 8 robust samples per second, and a live stability indicator (Stable / Moderate variation / Unstable).
- **Freeze + colour picker**: freeze the frame, then tap anywhere on it to sample that point.
- **Capture & save**: saves a small photo of the view with the sampled spot circled, plus a name, an item type (Top, Knitwear, Trousers / jeans, Shoes, Bag, Makeup, Home / paint…) and a note. On the Saved tab you can filter by item type.
- **Soft Summer verdict**: Strong / Good / Possible / Weak / Poor match. Also shows a clothing verdict (Excellent / Suitable / Borderline / Not recommended), temperature, chroma and lightness fit, the reasons, the closest Soft Summer colour, and an alternative season.
- **All 12 seasons ranked**: each season expands to show its nearest reference colours with ΔE00 values and its fit details.
- **Visual calibration**: Warm↔Cool, Green↔Magenta, brightness, saturation, contrast and per-channel RGB controls. Includes undo / redo / reset, named profiles per lighting setup, and a raw ↔ corrected toggle.
- **Saved colours**: search, filter, rename, delete, personal palette (★), and JSON export / import (includes profiles).
- **Compare**: put saved or typed colours side by side, with a ΔE00 matrix and the better Soft Summer match.
- **HEX analyser**: type a HEX value to analyse it without the camera. Includes a test bench of known values.
- **Guide**: palette browser for all 637 reference colours, plus method notes and limitations.
- **Me (selfie analysis)**: take or upload a photo. On-device face landmarks (MediaPipe) place sample points on the cheeks, forehead, chin, hair, irises and brows, and you can drag any of them. An optional white reference removes the colour cast. The app measures skin hue angle, L* and C*, hair and eye colour and feature contrast, scores warm/cool, light/deep and soft/clear, and ranks the 12 seasons with a confidence level.
- **Drape test**: 9 side-by-side virtual drape comparisons (chroma, then temperature, then value), combined 60/40 with the photo measurement.
- **Brows**: classic brow mapping (start at the nose ala / inner corner, peak above the outer iris toward the eye corner, tail on the ala–outer-corner line). Shows guide lines, the suggested shape, trim (red) and fill (green) areas, a simulated "after" view, advice per brow in approximate mm (scaled from the iris), symmetry, face-shape adjustment and a pencil shade.
- **Accounts (optional)**: Firebase email/password or Google sign-in. Two-way sync of colours, profiles and analyses (with photos). See `FIREBASE_SETUP.md`.

## Handoff
See **`HANDOFF.md`** for the verification checklist, Firebase steps and backend alternatives.

## Setup
```bash
npm install
npm run dev        # http://localhost:5173 (camera works on localhost)
npm test           # 93 unit tests
npm run build      # production build in dist/
npm run preview    # serve dist/ locally
```
**On a phone, camera access needs HTTPS.** Deploy the app (below), or tunnel your dev server over HTTPS.

## Deploy
**Netlify:** drag the `dist/` folder onto app.netlify.com/drop. Or connect the repo with build command `npm run build` and publish directory `dist`.

**GitHub Pages:** run `npm run build`, then push the contents of `dist/` to a `gh-pages` branch, or use the `actions/deploy-pages` workflow with `dist` as the artifact. `base: './'` in `vite.config.ts` makes the build work from any sub-path.

**Install on iPhone:** open the URL in Safari, tap Share, then Add to Home Screen.

## Architecture
```
Stage 1  physical object → measured colour   engine/camera.ts, sampling.ts, colourCorrection.ts
Stage 2  measured colour → seasonal palette  engine/colourConversion.ts, deltaE.ts, attributes.ts,
                                             seasonalMatching.ts, scoring.ts  +  data/
UI       src/components, src/hooks           storage: IndexedDB (src/storage)
```
The engine has no UI dependencies, and the palette data can be swapped without touching the algorithm.

### Measurement
- `getUserMedia({facingMode: 'environment'})`, highest practical resolution, playsinline.
- The sampling circle is mapped from screen space to the video's **own pixel dimensions**, taking `object-fit: cover` cropping into account. The region is downscaled to 128 px or less.
- Inside the circle, the darkest 10% and brightest 15% of pixels (by luma) are dropped. The colour is the per-channel **median** of the rest. Spatial spread is the 75th-percentile ΔE76 to that median. Temporal spread is taken over the last 6 frames, and the output is the median of the last 4.
- Camera controls (white balance, exposure, focus, exposure compensation, zoom, colour temperature) are read from `getCapabilities()`. Only controls the browser reports are offered, and a setting is only shown as applied if `getSettings()` reports it back. **iOS Safari generally does not expose white-balance or exposure locks.**

### Correction pipeline (documented order)
1. sRGB → linear
2. Per-channel RGB gains
3. White balance as a **Bradford chromatic adaptation**: the warm/cool slider moves the assumed scene white along the Planckian locus in mired steps; the green/magenta slider moves it perpendicular to the locus (CIE 1960 v). At 0/0 this step is an exact identity.
4. Exposure: multiply by 2^EV
5. Contrast on OKLab L around mid-grey
6. Saturation as a chroma scale in OKLCH
7. Gamut mapping: reduce chroma at constant L and hue, then clamp

The raw and corrected values are always kept separately and saved with each sample, along with the profile settings used.

### Classification and scoring (not probabilities)
- **D(season)**: CIEDE2000 to the 3 nearest references of that season, weighted 0.5 / 0.3 / 0.2.
- **Fit (0–1)** for temperature, chroma and lightness, judged against the season's own references of similar hue (OKLCH ±25°). For near-neutral samples, the season's near-neutral references are used instead. Overall fit is the **weakest** dimension, so "cool but too vivid" and "muted but too warm" both fail.
- **Ranking distance** R = D + 5·(1 − fit). **Similarity index** = 100·e^(−R/8).
- **Labels**: Strong (D ≤ 4, fit ≥ 0.7), Good (D ≤ 7, fit ≥ 0.6), Possible (D ≤ 11, fit ≥ 0.3), Weak (D ≤ 16), otherwise Poor.
- **Displayed temperature** is relative to similar colours: the kernel-weighted share of warm-season references at similar hue, chroma and lightness. In seasonal language a blue-red is "cool" even though every red leans yellow in absolute terms. Two earlier undertone models (hue position between warm and cool season means; warm-vs-cool nearest-neighbour resemblance) were tested against the palettes and rejected as unstable.

## Validation
| Category | How | Result |
|---|---|---|
| Colour-space maths | sRGB↔XYZ vs Lindbloom matrices; Lab for primaries/greys; OKLab vs Ottosson's published values; OKLCH red vs CSS Color 4 | pass |
| CIEDE2000 | All 34 Sharma–Wu–Dalal (2005) test pairs to 1e-4, symmetry, ΔE = 0 for identical colours | pass |
| Correction | Identity, Bradford white mapping, Planckian 6504 K, slider directions, EV doubling, hue-preserving saturation, gamut | pass |
| Matching | Deterministic, 12 seasons, edge cases (black/white/grey), "cool-but-vivid" and "muted-but-warm" cases, ≥ 85% top-3 self-classification | pass |
| Palettes | ≥ 50 per season, profile coherence, warm-vs-cool ordering | pass |
| Camera pipeline (end-to-end) | Headless Chrome with a synthetic camera feed of #6D7F98 (YUV 4:2:0) | sampled **#6D7F99** |
| Camera vs real objects | **Not validated.** Passing maths tests does not make camera readings accurate. | — |

## Face proportions (Face tab)
- **One photo,** with hair and beard as usually worn, so the analysis is of the *perceived* face. A hair-back photo is optional.
- **Thirds:** hairline as seen → brows (glabella) → nose base (subnasale) → chin as seen. A fringe shortens the upper third and a beard lengthens the lower third.
- **Fifths at eye level:** visible face edge, eye, inner-eye gap, eye, visible face edge. The face mesh has no ears, so the outer two are "visible width".
- **Automatic lines with manual adjustment:** the lines come from MediaPipe landmarks plus colour-edge detection, which finds the first strong colour edge and places the line where it starts. Every line can be dragged.
- **Photo warnings:** head pitch and yaw (from the face transformation matrix), an open mouth or smile, and an estimated hairline. Scale is taken from the iris (≈ 11.7 mm).
- **Wide tolerances and no attractiveness score:** studies show most attractive faces don't meet the canons.
- **Tips** (`src/engine/faceStyling.ts`) are filtered by saved options: who the advice is for, hair length, hairline, facial hair, and glasses. Each tip states what it balances and whether it is research-backed or a stylist/optician convention. Tips marked ▣ can be previewed on the photo.
- **Brows:** start, peak and tail handles can be dragged, and eye spacing from the fifths moves the suggested brow start by 1 mm.
- **Progress:** every saved analysis stores thirds, eye spacing and length-to-width ratio.
- Research notes with sources are in the Claude project doc `research-facial-proportions.md`.

## Selfie analysis: method and honesty
- Research notes, with sources, are in the project doc `research-selfie-season-and-brows.md`.
- Selfie-based season analysis is unreliable. Studios testing popular apps under daylight lighting got the right broad season only about half the time. The app shows a ranking with a confidence level, lists photo-quality warnings, and recommends physical draping as the reference.
- The scoring thresholds in `src/engine/faceAnalysis.ts` are documented heuristics. They have not been validated against professionally draped people.
- The face model (`face_landmarker.task`) is downloaded during the GitHub Actions build (`npm run fetch-model`) and served from the app's own origin, so detection works offline and photos never leave the device for analysis. Without it, the points start in a default layout and you place them by hand.

## Known limitations
- A phone camera does not measure physical colour. Auto white balance, exposure, HDR and tone mapping all change the reading, and iOS Safari rarely lets you lock them.
- Visual calibration matches the camera to *your perception* on *your screen*. This is not hardware calibration. A measured reference target (e.g. a colour checker card) would be needed for objective correction.
- Named lighting profiles are user labels, not detected conditions.
- The palettes are illustrative digital approximations (see `src/data/PROVENANCE.md`).
- A garment's palette match cannot tell you how it looks against your skin, hair and eyes.
- iPhone cameras may record in Display P3. The browser converts to sRGB for canvas, so very saturated colours can clip.
