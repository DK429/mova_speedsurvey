# MOVA Speed Survey v3.4

Current app: https://dk429.github.io/mova_speedsurvey/

Mobile survey app with the larger timing control, latest-sample display,
expandable sample tables, complete data exports and corrected maximum speed
and standard deviation.

## Mobile layout regression check

With Node.js installed, run from the repository directory:

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium webkit
node --test tests/*.test.cjs
```

The check covers 320–430px phones in Chromium and WebKit, repeated portrait →
landscape → portrait changes, rotation with Measurements hidden, rotation while
timing, sample preservation, reachable survey buttons, and the Results screen.
It also checks the large circular Start/Stop target, minimum button heights,
and separation of the two secondary actions after rotation.
Phone widths include 320, 360, 375, 390, 402 and 430 CSS pixels.
The export check downloads the actual file in both browsers and compares all
seven Results statistics and every sample against the screen, including after
deleting a sample and when only one sample remains.
Presentation checks cover touch-operated expandable tables, two newest rows,
unchanged data and exports while collapsed/expanded, equal input widths,
structured summary values, and larger text. CI saves screenshots of all screens
at 320 and 375px in both browser engines.

`layout.js` only reads the existing survey state and renders the presentation.
The timing, calculations, sample handling and export logic remain in `ms.js`.
Both tables show two newest samples by default and can expand to show all rows.
Save Data always exports all retained samples, regardless of expansion.

On a physical phone, complete Junction Details, open Measurements, and rotate
back and forth several times before and during timing. Check that Start/Stop,
Delete Last Sample, and End Survey remain within the screen width and reachable
by scrolling. End the survey and repeat the rotation check on Results.

The Last sample card sits immediately above Start/Stop, shows elapsed time and
both speed units, and updates after recording, deleting or clearing samples.
Maximum speed and sample standard deviation refresh synchronously when Results
opens by touch, mouse or keyboard, using all retained full-precision samples.
Standard deviation uses n−1; one sample displays unavailable SD, and identical
samples display zero. Quality continues to use the existing count thresholds.
