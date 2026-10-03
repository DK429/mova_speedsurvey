const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdir, readFile } = require('node:fs/promises');
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium, webkit } = require('playwright');

const appUrl = pathToFileURL(resolve(__dirname, '../index.html')).href;
async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function screenshot(page, name) {
  if (!process.env.CI) return;
  await mkdir(resolve(__dirname, '../test-artifacts'), { recursive: true });
  await page.screenshot({ path: resolve(__dirname, `../test-artifacts/${name}.png`), fullPage: true });
}
async function visibleRows(page, table) {
  return page.locator(`#${table} tbody tr:visible`).count();
}

for (const [engine, browserType] of Object.entries({ chromium, webkit })) {
  for (const width of [320, 375]) {
    test(`${engine}: ${width}px expandable tables preserve samples, summary values and complete exports`, async () => {
      const browser = await browserType.launch({ headless: true });
      try {
        const page = await browser.newPage({ viewport: { width, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(appUrl);
        await page.locator('#site').fill('123');
        await page.locator('#junction').fill('North');
        await page.locator('#arm').fill('South Downs');
        await page.locator('#date').fill('2026-10-03');
        await page.locator('#distance').fill('25');
        await settle(page);
        const inputWidths = await page.locator('#detailsTab input').evaluateAll(inputs => inputs.map(input => input.getBoundingClientRect().width));
        assert.ok(inputWidths.every(w => Math.abs(w - inputWidths[0]) < 1), 'Date and other fields must have equal widths');
        await screenshot(page, `${engine}-${width}-details`);
        await page.locator('#gotoMeasureBtn').tap();
        await page.evaluate(() => {
          measurements = Array.from({ length: 12 }, (_, i) => {
            const speed = 14 + i * 0.6;
            return { distance: 25, time: 25 / speed, speed, mph: speed * 2.23694 };
          });
          renderDisplay();
        });
        await settle(page);
        const original = await page.evaluate(() => JSON.stringify(measurements));
        const timingRect = await page.locator('#measureBtn').boundingBox();
        assert.equal(await visibleRows(page, 'measureSamplesTable'), 2);
        const last = await page.locator('#measureSamplesTable tbody tr').last().boundingBox();
        const previous = await page.locator('#measureSamplesTable tbody tr').nth(10).boundingBox();
        assert.ok(last.y < previous.y, 'Newest sample must be first');
        await screenshot(page, `${engine}-${width}-measure`);
        await page.locator('#measureSamplesToggle').tap();
        assert.equal(await visibleRows(page, 'measureSamplesTable'), 12);
        assert.equal(await page.locator('#measureSamplesToggle').getAttribute('aria-expanded'), 'true');
        await page.evaluate(() => window.scrollTo(0, 0));
        const expandedRect = await page.locator('#measureBtn').boundingBox();
        assert.ok(Math.abs(timingRect.y - expandedRect.y) < 1, 'Expanding history must not move timing controls');
        await page.locator('#measureSamplesToggle').tap();
        assert.equal(await visibleRows(page, 'measureSamplesTable'), 2);
        await page.locator('#endSurveyBtn').tap();
        await settle(page);
        assert.equal(await visibleRows(page, 'resultsTable'), 2);
        assert.equal(await page.locator('#resultsTable tbody tr').count(), 12, 'Collapsed rows must remain available to the existing calculations');
        assert.equal(await page.locator('.summary-item').count(), 7);
        const summaryMatches = await page.locator('.summary-item').evaluateAll(rows => rows.every(row => {
          const source = document.getElementById(row.dataset.source).textContent.split(':').slice(1).join(':').replace(/\s/g, '');
          const pair = [...row.querySelectorAll('.speed-line')].map(line => line.textContent.replace(/\s/g, '')).join('|');
          const visible = pair || row.querySelector('.summary-value').textContent.replace(/\s/g, '');
          return source === visible;
        }));
        assert.ok(summaryMatches, 'Structured summary must preserve every existing value and unit');
        await screenshot(page, `${engine}-${width}-results`);
        const originalExport = await page.evaluate(() => buildTxtContent());
        const pending = page.waitForEvent('download');
        await page.locator('#saveResultsBtn').tap();
        const download = await pending;
        assert.equal(await readFile(await download.path(), 'utf8'), originalExport);
        await page.locator('#resultsSamplesToggle').tap();
        assert.equal(await visibleRows(page, 'resultsTable'), 12);
        // Legacy summary alignment can settle later after a touch navigation.
        // Ignore spacing only, while comparing every field, value, unit and row.
        const normalize = text => text.split('\r\n').map(line => line.replace(/[ \t]+/g, ' ').trim()).join('\n');
        assert.equal(normalize(await page.evaluate(() => buildTxtContent())), normalize(originalExport), 'Expansion must not change exported data');
        assert.equal(await page.evaluate(() => JSON.stringify(measurements)), original);

        // Increase all text by 25%, including controls; retain the fixed approved circle.
        await page.locator('#resultsSamplesToggle').tap();
        await page.evaluate(() => {
          const nodes = [...document.querySelectorAll('h1, h2, legend, label, button, input, .summary-label, .summary-value, strong, small, .sample-table, th, td, .metric-caption, .timer-caption, #timerMetric')];
          const sizes = nodes.map(el => parseFloat(getComputedStyle(el).fontSize));
          nodes.forEach((el, i) => el.style.fontSize = sizes[i] * 1.25 + 'px');
        });
        await settle(page);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), 'Larger text must not cause page overflow');
        await screenshot(page, `${engine}-${width}-results-larger-text`);
        await page.locator('#measureTabBtn').tap();
        await settle(page);
        const circle = await page.locator('#measureBtn').boundingBox();
        assert.equal(circle.width, 164);
        assert.equal(circle.height, 164);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
        assert.deepEqual(errors, []);
      } finally { await browser.close(); }
    });
  }
}
