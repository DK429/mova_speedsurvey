const assert = require('node:assert/strict');
const { test } = require('node:test');
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const { mkdir } = require('node:fs/promises');
const { chromium, webkit } = require('playwright');

const appUrl = pathToFileURL(resolve(__dirname, '../index.html')).href;

async function checkLayout(page, tab) {
  // Allow the resize event, ResizeObserver, and a paint to finish.
  await page.evaluate(() => new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
  const layout = await page.evaluate(tab => {
    const viewport = document.documentElement.clientWidth;
    const panel = document.getElementById(tab);
    return {
      viewport,
      scrollWidth: document.documentElement.scrollWidth,
      controls: [...document.querySelectorAll('.tab-btn'), ...panel.querySelectorAll('button, input')]
        .map(el => {
          const rect = el.getBoundingClientRect();
          return { id: el.id, left: rect.left, right: rect.right, width: rect.width, height: rect.height, button: el.tagName === 'BUTTON' };
        }),
    };
  }, tab);
  assert.ok(layout.scrollWidth <= layout.viewport + 1, `Page overflows: ${JSON.stringify(layout)}`);
  for (const control of layout.controls) {
    assert.ok(control.width > 0 && control.left >= -1 && control.right <= layout.viewport + 1,
      `Control is off screen: ${JSON.stringify(control)}`);
    if (control.button) assert.ok(control.height >= 48, `Button is too small to tap: ${JSON.stringify(control)}`);
  }
  if (tab === 'measureTab') {
    const actions = await page.evaluate(() => {
      const rect = id => {
        const r = document.getElementById(id).getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
      };
      return { primary: rect('measureBtn'), remove: rect('deleteLastBtn'), end: rect('endSurveyBtn'), history: rect('canvas') };
    });
    assert.ok(actions.primary.width >= 144 && actions.primary.height >= 144, 'Start/Stop must be a large target');
    assert.ok(Math.abs(actions.primary.width - actions.primary.height) < 1, 'Start/Stop must stay circular after rotation');
    assert.ok(actions.remove.top >= actions.primary.bottom + 12 && actions.end.top >= actions.primary.bottom + 12,
      'Secondary actions must be separated below Start/Stop');
    assert.ok(actions.end.left >= actions.remove.right + 12, 'Secondary actions need a clear gap');
    assert.ok(actions.history.top >= Math.max(actions.remove.bottom, actions.end.bottom), 'History must follow the controls');
    const canvas = await page.evaluate(() => {
      const canvas = document.getElementById('canvas');
      const rect = canvas.getBoundingClientRect();
      const wrap = document.getElementById('canvasWrap').getBoundingClientRect();
      return {
        left: rect.left, right: rect.right, wrapLeft: wrap.left, wrapRight: wrap.right,
        width: canvas.width, height: canvas.height,
        cssWidth: canvas.clientWidth, cssHeight: canvas.clientHeight, dpr: devicePixelRatio,
      };
    });
    assert.ok(canvas.left >= canvas.wrapLeft - 1 && canvas.right <= canvas.wrapRight + 1,
      `Canvas exceeds its container: ${JSON.stringify(canvas)}`);
    assert.equal(canvas.width, Math.round(canvas.cssWidth * canvas.dpr));
    assert.equal(canvas.height, Math.round(canvas.cssHeight * canvas.dpr));
  }
}

async function rotate(page, portrait, tab) {
  await page.setViewportSize({ width: portrait.height, height: portrait.width });
  await checkLayout(page, tab);
  await page.setViewportSize(portrait);
  await checkLayout(page, tab);
}

for (const [engine, browserType] of Object.entries({ chromium, webkit })) {
  for (const width of [320, 375, 390, 430]) {
    test(`${engine}: ${width}px phone returns to portrait without losing controls or samples`, async () => {
      const browser = await browserType.launch({ headless: true });
      try {
        const portrait = { width, height: 844 };
        const page = await browser.newPage({
          viewport: portrait, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
        });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(appUrl);
        await checkLayout(page, 'detailsTab');
        await rotate(page, portrait, 'detailsTab');
        await page.locator('#site').fill('12A34BC');
        await page.locator('#junction').fill('A645 / A638');
        await page.locator('#arm').fill('Northbound');
        await page.locator('#distance').fill('100');
        await page.locator('#gotoMeasureBtn').click();
        await checkLayout(page, 'measureTab');
        for (let i = 0; i < 3; i++) await rotate(page, portrait, 'measureTab');

        // Resize while the canvas is hidden, then reopen Measurements.
        await page.locator('#detailsTabBtn').click();
        await rotate(page, portrait, 'detailsTab');
        await page.locator('#measureTabBtn').click();
        await checkLayout(page, 'measureTab');

        // Timing and sample data must survive rotation.
        await page.locator('#measureBtn').click();
        assert.equal(await page.locator('#measureBtn').textContent(), 'Stop');
        await rotate(page, portrait, 'measureTab');
        await page.waitForTimeout(400); // The existing Start/Stop debounce is 350ms.
        await page.locator('#measureBtn').click();
        assert.equal(await page.locator('#countMetric').textContent(), '1');

        if (width === 375 && process.env.CI) {
          await mkdir(resolve(__dirname, '../test-artifacts'), { recursive: true });
          await page.locator('#measureTab').screenshot({ path: resolve(__dirname, `../test-artifacts/${engine}-measurement.png`) });
        }
        await checkLayout(page, 'measureTab');
        await rotate(page, portrait, 'measureTab');
        assert.equal(await page.locator('#countMetric').textContent(), '1');

        for (const id of ['measureBtn', 'deleteLastBtn', 'endSurveyBtn']) {
          await page.locator(`#${id}`).scrollIntoViewIfNeeded();
          const rect = await page.locator(`#${id}`).boundingBox();
          assert.ok(rect.y >= 0 && rect.y + rect.height <= portrait.height);
        }
        await page.locator('#endSurveyBtn').click();
        await page.locator('#resultsTab').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#resultsTable tbody tr').count(), 1);
        await checkLayout(page, 'resultsTab');
        await rotate(page, portrait, 'resultsTab');
        await page.locator('#measureTabBtn').click();
        await checkLayout(page, 'measureTab');
        await page.locator('#deleteLastBtn').click();
        assert.equal(await page.locator('#countMetric').textContent(), '0');
        assert.deepEqual(errors, []);
      } finally {
        await browser.close();
      }
    });
  }
}
