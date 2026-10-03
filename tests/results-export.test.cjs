const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFile } = require('node:fs/promises');
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium, webkit } = require('playwright');

const appUrl = pathToFileURL(resolve(__dirname, '../index.html')).href;
const summaryIds = ['resultAvg', 'resultP85', 'resultP15', 'resultP05', 'resultQuality', 'resultMax', 'resultSD'];

async function saveAndCheck(page, expectedCount) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const displayed = await page.evaluate(ids => ({
    summary: Object.fromEntries(ids.map(id => [id, document.getElementById(id).textContent.trim()])),
    rows: [...document.querySelectorAll('#resultsTable tbody tr')]
      .map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent.trim()).join('\t')),
  }), summaryIds);
  assert.equal(displayed.rows.length, expectedCount);
  const downloads = [];
  const onDownload = download => downloads.push(download);
  page.on('download', onDownload);
  const pending = page.waitForEvent('download');
  await page.locator('#saveResultsBtn').click();
  const download = await pending;
  const text = await readFile(await download.path(), 'utf8');
  await page.waitForTimeout(100);
  page.off('download', onDownload);
  assert.equal(downloads.length, 1, 'One tap must produce one complete file');
  assert.match(download.suggestedFilename(), /12A34BC.*\.txt$/);
  assert.ok(!/(?<!\r)\n/.test(text), 'Export must use actual CRLF line endings');
  for (const value of ['12A34BC', 'A645 / A638', 'Northbound', '2026-10-03', '100 m']) {
    assert.ok(text.includes(value), `Missing junction detail: ${value}`);
  }
  assert.match(text, new RegExp(`Samples +: ${expectedCount}\\r\\n`));
  for (const [id, line] of Object.entries(displayed.summary)) {
    assert.ok(line.includes(':'), `Missing displayed statistic: ${id}`);
    assert.ok(text.split('\r\n').includes(line), `Export differs from the screen: ${id}: ${line}`);
  }
  const exportedRows = text.split('\r\n').filter(line => /^\d+\t/.test(line));
  assert.deepEqual(exportedRows, displayed.rows, 'Every sample and displayed time/speed must be saved, in order');
  return displayed.summary;
}

for (const [engine, browserType] of Object.entries({ chromium, webkit })) {
  test(`${engine}: downloaded file includes all displayed statistics and samples after deleting a sample`, async () => {
    const browser = await browserType.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 375, height: 844 }, acceptDownloads: true });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(appUrl);
      await page.locator('#site').fill('12A34BC');
      await page.locator('#junction').fill('A645 / A638');
      await page.locator('#arm').fill('Northbound');
      await page.locator('#date').fill('2026-10-03');
      await page.locator('#distance').fill('100');
      await page.locator('#gotoMeasureBtn').click();

      // Deterministic recorded samples; exercise the real Results and Save buttons.
      // More than seven samples catches accidentally exporting just the history.
      await page.evaluate(() => {
        measurements = Array.from({ length: 12 }, (_, i) => {
          const speed = 10 + (i % 4) * 10 + 0.0049;
          return { time: 100 / speed, speed, mph: speed * 2.23694 };
        });
        renderDisplay();
      });
      await page.locator('#endSurveyBtn').click();
      await page.locator('#resultsTab').waitFor({ state: 'visible' });
      const summary = await saveAndCheck(page, 12);
      for (const id of ['resultAvg', 'resultP85', 'resultP15', 'resultP05', 'resultMax']) {
        assert.match(summary[id], /\d+\.\d{2} m\/s \| \d+\.\d{2} mph/);
      }
      assert.match(summary.resultSD, /\d+\.\d{3} m\/s/);

      await page.locator('#measureTabBtn').click();
      await page.locator('#deleteLastBtn').click();
      await page.locator('#endSurveyBtn').click();
      await saveAndCheck(page, 11);

      // A single sample still saves the displayed unavailable SD and all other lines.
      await page.locator('#measureTabBtn').click();
      await page.evaluate(() => { measurements = measurements.slice(0, 1); renderDisplay(); });
      await page.locator('#endSurveyBtn').click();
      await saveAndCheck(page, 1);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });
}
