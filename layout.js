/* Presentation only: reads the existing survey state and summary text.
   No timing, calculation, sample mutation or export handlers live here. */
(function () {
  'use strict';
  function init() {
    const byId = id => document.getElementById(id);
    const measureTable = byId('measureSamplesTable');
    const resultsTable = byId('resultsTable');
    const measureToggle = byId('measureSamplesToggle');
    const resultsToggle = byId('resultsSamplesToggle');
    const summaryDisplay = byId('resultsSummaryDisplay');
    const summaryFields = [
      ['resultAvg', 'Average speed'],
      ['resultP85', '85th percentile'],
      ['resultP15', '15th percentile'],
      ['resultP05', '5th percentile'],
      ['resultMax', 'Maximum speed'],
      ['resultSD', 'Standard deviation'],
      ['resultQuality', 'Quality']
    ];
    let lastSamples = '';
    let lastSummary = '';
    let lastTab = '';
    let queued = false;

    function speedPair(target, value) {
      if (target.dataset.value === value) return;
      target.dataset.value = value;
      target.replaceChildren();
      const pair = value.match(/^\s*(.*?)\s*m\/s\s*\|\s*(.*?)\s*mph\s*$/);
      if (!pair) { target.textContent = value; return; }
      const group = document.createElement('span');
      group.className = 'speed-pair';
      ['m/s', 'mph'].forEach((unit, i) => {
        const line = document.createElement('span');
        line.className = 'speed-line';
        const number = document.createElement('strong');
        number.textContent = pair[i + 1].trim();
        const suffix = document.createElement('small');
        suffix.textContent = unit;
        line.append(number, suffix);
        group.appendChild(line);
      });
      target.appendChild(group);
    }

    function syncToggle(table, button, count) {
      const section = table.closest('.sample-section');
      button.hidden = count <= 2;
      const expanded = section.classList.contains('expanded');
      button.setAttribute('aria-expanded', String(expanded));
      button.textContent = expanded ? 'Show fewer samples' : 'Show all samples (' + count + ')';
    }
    [[measureTable, measureToggle], [resultsTable, resultsToggle]].forEach(([table, button]) => {
      button.addEventListener('click', () => {
        table.closest('.sample-section').classList.toggle('expanded');
        syncToggle(table, button, table.tBodies[0].rows.length);
      });
    });

    function render() {
      queued = false;
      const samples = typeof measurements === 'undefined' ? [] : measurements;
      const signature = samples.map(m => [m.time, m.speed, m.mph].join(',')).join(';');
      if (signature !== lastSamples || !measureTable.dataset.ready) {
        lastSamples = signature;
        measureTable.dataset.ready = 'true';
        const rows = document.createDocumentFragment();
        samples.forEach((m, i) => {
          const row = document.createElement('tr');
          [i + 1, m.time.toFixed(2), m.speed.toFixed(2), m.mph.toFixed(2)].forEach(value => {
            const cell = document.createElement('td');
            cell.textContent = value;
            row.appendChild(cell);
          });
          rows.appendChild(row);
        });
        measureTable.tBodies[0].replaceChildren(rows);
      }
      byId('measureSamplesEmpty').hidden = samples.length > 0;
      measureTable.hidden = samples.length === 0;
      syncToggle(measureTable, measureToggle, samples.length);
      syncToggle(resultsTable, resultsToggle, resultsTable.tBodies[0].rows.length);
      byId('resultsSampleCount').textContent = samples.length + (samples.length === 1 ? ' sample' : ' samples');
      speedPair(byId('avgDisplay'), byId('avgMetric').textContent.trim());
      speedPair(byId('p85Display'), byId('p85Metric').textContent.trim());
      byId('measureBtn').dataset.state = byId('measureBtn').textContent.trim().toLowerCase();

      const values = summaryFields.map(([id, label]) => {
        const text = byId(id)?.textContent || '';
        const colon = text.indexOf(':');
        return [id, label, colon >= 0 ? text.slice(colon + 1).trim() : '—'];
      });
      const summarySignature = JSON.stringify(values);
      if (summarySignature !== lastSummary) {
        lastSummary = summarySignature;
        const rows = document.createDocumentFragment();
        values.forEach(([id, label, value]) => {
          const row = document.createElement('div');
          row.className = 'summary-item';
          row.dataset.source = id;
          const name = document.createElement('span');
          name.className = 'summary-label';
          name.textContent = label;
          const data = document.createElement('span');
          data.className = 'summary-value';
          speedPair(data, value || '—');
          row.append(name, data);
          rows.appendChild(row);
        });
        summaryDisplay.replaceChildren(rows);
      }
      document.querySelectorAll('.tab-btn').forEach(button => {
        if (button.classList.contains('active')) button.setAttribute('aria-current', 'step');
        else button.removeAttribute('aria-current');
      });
      const activeTab = document.querySelector('.tab-btn.active')?.id || '';
      if (activeTab !== lastTab) {
        lastTab = activeTab;
        window.scrollTo(0, 0);
      }
    }
    function schedule() {
      if (!queued) { queued = true; requestAnimationFrame(render); }
    }
    const observer = new MutationObserver(schedule);
    ['countMetric', 'avgMetric', 'p85Metric', 'qualityInline', 'measureBtn'].forEach(id => {
      observer.observe(byId(id), { childList: true, characterData: true, subtree: true });
    });
    observer.observe(document.querySelector('.summary'), { childList: true, characterData: true, subtree: true });
    observer.observe(resultsTable.tBodies[0], { childList: true, subtree: true });
    document.querySelectorAll('.tab-btn').forEach(button => observer.observe(button, { attributes: true, attributeFilter: ['class'] }));
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
