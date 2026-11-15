# Soft Summer Scanner

A mobile-first PWA for iPhone. Point the rear camera at a garment, fabric, paint or object. The app extracts the colour, converts it to HEX / RGB / HSL / CIELAB / OKLCH, and tells you whether the colour belongs to **Soft Summer**. If it doesn't, the app names the closest of the 12 seasonal sub-seasons.

Everything runs on the device. No account, no backend, no uploads. Works offline after the first load.

## Features
- **Live scan**: rear camera, a central sampling circle (Small / Medium / Large), about 8 robust samples per second, and a live stability indicator (Stable / Moderate variation / Unstable).
- **Freeze + colour picker**: freeze the frame, then tap anywhere on it to sample that point.
- **Soft Summer verdict**: Strong / Good / Possible / Weak / Poor match. Also shows a clothing verdict (Excellent / Suitable / Borderline / Not recommended), temperature, chroma and lightness fit, the reasons, the closest Soft Summer colour, and an alternative season.
- **All 12 seasons ranked**: each season expands to show its nearest reference colours with ΔE00 values and its fit details.
- **Visual calibration**: Warm↔Cool, Green↔Magenta, brightness, saturation, contrast and per-channel RGB controls. Includes undo / redo / reset, named profiles per lighting setup, and a raw ↔ corrected toggle.
- **Saved colours**: search, filter, rename, delete, personal palette (★), and JSON export / import (includes profiles).
- **Compare**: put saved or typed colours side by side, with a ΔE00 matrix and the better Soft Summer match.
- **HEX analyser**: type a HEX value to analyse it without the camera. Includes a test bench of known values.
- **Guide**: palette browser for all 637 reference colours, plus method notes and limitations.

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

## Known limitations
- A phone camera does not measure physical colour. Auto white balance, exposure, HDR and tone mapping all change the reading, and iOS Safari rarely lets you lock them.
- Visual calibration matches the camera to *your perception* on *your screen*. This is not hardware calibration. A measured reference target (e.g. a colour checker card) would be needed for objective correction.
- Named lighting profiles are user labels, not detected conditions.
- The palettes are illustrative digital approximations (see `src/data/PROVENANCE.md`).
- A garment's palette match cannot tell you how it looks against your skin, hair and eyes.
- iPhone cameras may record in Display P3. The browser converts to sRGB for canvas, so very saturated colours can clip.
