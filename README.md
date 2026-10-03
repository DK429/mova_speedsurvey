# MovaSpeed
HTML document for performing MOVA speed surveys

## Mobile layout regression check

With Node.js installed, run from the repository directory:

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium webkit
node --test tests/mobile-layout.test.cjs
```

The check covers 320–430px phones in Chromium and WebKit, repeated portrait →
landscape → portrait changes, rotation with Measurements hidden, rotation while
timing, sample preservation, reachable survey buttons, and the Results screen.
It also checks the large circular Start/Stop target, minimum button heights,
and separation of the two secondary actions after rotation.

On a physical phone, complete Junction Details, open Measurements, and rotate
back and forth several times before and during timing. Check that Start/Stop,
Delete Last Sample, and End Survey remain within the screen width and reachable
by scrolling. End the survey and repeat the rotation check on Results.
