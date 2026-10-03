const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFile } = require('node:fs/promises');
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium, webkit } = require('playwright');

const appUrl = pathToFileURL(resolve(__dirname, '../index.html')).href;
async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function checkStats(page, maximum, sd) {
  await settle(page);
  const maxText = await page.locator('[data-source="resultMax"] .summary-value').textContent();
  const sdText = await page.locator('[data-source="resultSD"] .summary-value').textContent();
  assert.ok(maxText.includes(maximum + 'm/s'), maxText);
  assert.equal(sdText, sd + ' m/s');
  const pending = page.waitForEvent('download');
  await page.locator('#saveResultsBtn').tap();
  const download = await pending;
  const text = await readFile(await download.path(), 'utf8');
  assert.match(text, new RegExp('Max speed +: ' + maximum.replace('.', '\\.') + ' m/s'));
  assert.match(text, new RegExp('Standard deviation +: ' + sd.replace('.', '\\.') + ' m/s'));
}

for (const [engine, browserType] of Object.entries({ chromium, webkit })) {
  test(`${engine}: touch-recorded samples calculate max and sample SD, including after deleting the outlier`, async () => {
    const browser = await browserType.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, acceptDownloads: true });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(appUrl);
      await page.locator('#site').fill('123');
      await page.locator('#junction').fill('North');
      await page.locator('#arm').fill('South');
      await page.locator('#distance').fill('100');
      await page.locator('#gotoMeasureBtn').tap();
      // Control only the clock; record through the actual Start/Stop touch path.
      await page.evaluate(() => { window.testClock = 1000; window.nowMs = () => window.testClock; });
      for (const seconds of [10, 5, 2]) {
        await page.evaluate(() => { window.testClock += 500; });
        await page.locator('#measureBtn').tap();
        assert.equal(await page.locator('#measureBtn').textContent(), 'Stop');
        await page.evaluate(seconds => { window.testClock += seconds * 1000; }, seconds);
        await page.locator('#measureBtn').tap();
        await settle(page);
        assert.equal(await page.locator('#latestSampleMps').textContent(), (100 / seconds).toFixed(2));
      }
      await page.locator('#endSurveyBtn').tap();
      await checkStats(page, '50.00', '20.817');
      assert.equal(await page.locator('#resultsTable tbody tr:visible').count(), 2);
      await page.locator('#resultsSamplesToggle').tap();
      await checkStats(page, '50.00', '20.817');
      await page.locator('#measureTabBtn').tap();
      await page.locator('#deleteLastBtn').tap();
      await settle(page);
      assert.equal(await page.locator('#latestSampleNumber').textContent(), 'Sample 2');
      assert.equal(await page.locator('#latestSampleMps').textContent(), '20.00');
      await page.locator('#endSurveyBtn').tap();
      await checkStats(page, '20.00', '7.071');
      await page.locator('#measureTabBtn').tap();
      await page.locator('#deleteLastBtn').tap();
      await page.locator('#endSurveyBtn').tap();
      await checkStats(page, '10.00', '—');
      // Results tab navigation must also refresh; reopening must not rely on click.
      await page.locator('#measureTabBtn').tap();
      await page.locator('#resultsTabBtn').tap();
      await checkStats(page, '10.00', '—');
      page.once('dialog', dialog => dialog.accept());
      await page.locator('#clearDataBtn').tap();
      await settle(page);
      assert.equal(await page.locator('#latestSampleNumber').textContent(), 'No sample yet');
      assert.equal(await page.locator('#latestSampleMps').textContent(), '—');
      assert.ok((await page.locator('#resultMax').textContent()).includes('— m/s'));
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });

  test(`${engine}: statistics use full precision and support identical speeds and keyboard navigation`, async () => {
    const browser = await browserType.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 320, height: 812 }, hasTouch: true, acceptDownloads: true });
      await page.goto(appUrl);
      await page.locator('#site').fill('123');
      await page.locator('#junction').fill('North');
      await page.locator('#arm').fill('South');
      await page.locator('#distance').fill('100');
      await page.locator('#gotoMeasureBtn').press('Enter');
      await page.evaluate(() => {
        measurements = [10.0049, 20.0071, 50.0093].map(speed => ({ distance: 100, time: 100 / speed, speed, mph: speed * 2.23694 }));
        renderDisplay();
      });
      await page.locator('#endSurveyBtn').press('Enter');
      await checkStats(page, '50.01', '20.819');
      await page.locator('#measureTabBtn').press('Enter');
      await page.evaluate(() => {
        measurements = [15, 15, 15].map(speed => ({ distance: 100, time: 100 / speed, speed, mph: speed * 2.23694 }));
        renderDisplay();
      });
      await page.locator('#endSurveyBtn').press('Enter');
      await checkStats(page, '15.00', '0.000');
    } finally { await browser.close(); }
  });
}
