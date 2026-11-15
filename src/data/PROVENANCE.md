# Palette provenance and methodology

**Status of every entry: illustrative digital approximation** (`quality: 'illustrative-digital-approximation'`).

## What the data is
- 12 sub-season palettes, 50–77 colours each (637 total), organised into 12 categories
  (whites, greys, neutrals, beige/taupe, browns, blues, greens, reds, pinks, purples, yellows, metallic-inspired).
- Each colour was authored as a HEX value from the published *descriptions* of the 12-season
  (tonal, Sci\ART-derived) system: each season is defined by value (light–deep), chroma
  (muted–bright) and temperature (warm–cool). Soft Summer = cool to neutral-cool, muted,
  medium to light-medium, low–moderate contrast.
- No commercial fan deck was copied, and nothing was measured from physical swatches.
  Commercial systems differ from each other; none is a scientific standard.

## What is computed, not typed
RGB, CIELAB, OKLCH, temperature / chroma / lightness classes and IDs are all derived in
`src/data/database.ts` with the same engine used for camera samples.

## Quality checks (automated, `src/tests/paletteCoherence.test.ts`)
- ≥ 50 colours per sub-season, no duplicate HEX within a season.
- ≥ 90% of each season's chromatic colours sit inside its declared lightness / chroma profile
  (`src/data/seasons.ts`). Known, intentional exceptions: icy/lemon accents in Deep Winter,
  the clear reds of Light Summer.
- Each warm season's chromatic colours are, on average, warmer than its cool counterpart.
- In `seasonalMatching.test.ts`, ≥ 85% of reference colours have their own season in the top 3.
  Top-1 self-classification is about 84%. The misses are mostly between neighbouring seasons
  (e.g. Bright Spring vs Bright Winter, Soft Summer vs True Summer), which overlap in the theory itself.

## Replacing or extending the data
Edit or add `[name, HEX, category]` rows in `src/data/palettes/*.ts`. To use measured
swatches, set `quality: 'measured-physical-swatch'` and a real `source` in `database.ts`.
Re-run `npm test`. The matching algorithm needs no changes.

## Known bias
Soft Summer has more reference colours (77) than the other seasons (50–55). Denser palettes
give slightly shorter nearest-neighbour distances. The 3-neighbour average and the fit checks
reduce this effect, but do not remove it.
