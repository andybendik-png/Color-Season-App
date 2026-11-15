import { PaletteBrowser } from './PaletteBrowser';
import { REFERENCE_COLOURS } from '../data/database';

export function InfoPanel({ onAnalyse }: { onAnalyse: (hex: string) => void }) {
  return (
    <section>
      <div className="card prose">
        <h3 className="card__title">How to read the results</h3>
        <p>The app answers two separate questions.</p>
        <p><strong>1. What colour is the camera seeing?</strong> This depends on the light, the iPhone's automatic white balance, exposure, HDR and tone mapping. Browsers on iPhone usually do not allow these to be locked, so the same scarf can read differently by the window and under a lamp. The HEX is a precise record of what the camera produced, not a verified measurement of the object.</p>
        <p><strong>2. Which seasonal palette does that colour resemble?</strong> This step is exact computation: CIELAB (D65), CIEDE2000 distances to {REFERENCE_COLOURS.length} reference colours in 12 sub-seasons, and checks of temperature, chroma and lightness against each season's own colours of similar hue. Same input, same answer, every time.</p>
        <p>Scores are similarity measures, not probabilities. “Strong match” means close to Soft Summer's reference colours and inside its temperature, chroma and lightness range; it does not mean a 9-in-10 chance of anything.</p>
        <p>Seasonal colour analysis is about how colours sit next to your skin, hair and eyes. A garment can match the Soft Summer palette and still look different on you in practice. Treat the verdict as a guide.</p>
      </div>
      <div className="card prose">
        <h3 className="card__title">Getting the most reliable readings</h3>
        <ol>
          <li>Scan in even daylight near a window, not direct sun or mixed lamps.</li>
          <li>Fill the sampling circle with one colour; watch for “Stable”.</li>
          <li>Avoid shine: tilt glossy items until highlights leave the circle.</li>
          <li>Compare items under the same light, ideally in one session.</li>
          <li>Use a calibration profile per lighting setup, and switch to “Raw camera” to see the uncorrected reading.</li>
        </ol>
      </div>
      <PaletteBrowser onAnalyse={onAnalyse} />
      <div className="card prose">
        <h3 className="card__title">Privacy</h3>
        <p>The camera feed is processed on this device. No images are uploaded, there is no account, and saved colours live in this browser's storage only. Use Export to keep a backup.</p>
      </div>
    </section>
  );
}
