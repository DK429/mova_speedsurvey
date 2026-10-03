(function(){
  if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = function(cb){ return setTimeout(function(){ cb(Date.now()); }, 16); };
  }
  if (!window.cancelAnimationFrame) {
    window.cancelAnimationFrame = function(id){ clearTimeout(id); };
  }
})();
function nowMs(){ return (window.performance && performance.now) ? performance.now() : Date.now(); }
function padRight(str, len){ str = String(str); while (str.length < len) str += ' '; return str; }
function padLeft(str, len){ str = String(str); if (str.length >= len) return str; return Array(len - str.length + 1).join(' ') + str; }

var canvas = document.getElementById('canvas');
var ctx = canvas.getContext('2d');
var canvasWrap = document.getElementById('canvasWrap');

var siteInput = document.getElementById('site');
var junctionInput = document.getElementById('junction');
var armInput = document.getElementById('arm');
var dateInput = document.getElementById('date');
var distanceInput = document.getElementById('distance');

var measureBtn = document.getElementById('measureBtn');
var deleteLastBtn = document.getElementById('deleteLastBtn');
var endSurveyBtn = document.getElementById('endSurveyBtn');

var detailsTabBtn = document.getElementById('detailsTabBtn');
var measureTabBtn = document.getElementById('measureTabBtn');
var resultsTabBtn = document.getElementById('resultsTabBtn');

var detailsTab = document.getElementById('detailsTab');
var measureTab = document.getElementById('measureTab');
var resultsTab = document.getElementById('resultsTab');

var gotoMeasureBtn = document.getElementById('gotoMeasureBtn');
var resultsTbody = document.querySelector('#resultsTable tbody');

var resultAvg = document.getElementById('resultAvg');
var resultP85 = document.getElementById('resultP85');
var resultP15 = document.getElementById('resultP15');
var resultP05 = document.getElementById('resultP05');

var detailsHint = document.getElementById('detailsHint');
var detailsErrors = document.getElementById('detailsErrors');

var avgMetric = document.getElementById('avgMetric');
var p85Metric = document.getElementById('p85Metric');
var countMetric = document.getElementById('countMetric');
var timerMetric = document.getElementById('timerMetric');

var measuring = false;
var startTime = 0;
var rafId = null;
var measurements = [];
var resultsUnlocked = false;

/* ===== Metric label alignment ===== */
function alignMetricGroup(labelNodes) {
  if (!labelNodes || !labelNodes.length) return;
  var labels = [];
  var longest = 0;
  for (var i = 0; i < labelNodes.length; i++) {
    var el = labelNodes[i];
    var raw = (el.textContent || '').replace(/:\s*$/, '').trim();
    labels.push({ el: el, label: raw });
    if (raw.length > longest) longest = raw.length;
  }
  var widthCh = longest + 2; // 1 space + colon
  for (var j = 0; j < labels.length; j++) {
    var L = labels[j].label;
    var pad = Array(longest - L.length + 2).join(' ');
    labels[j].el.textContent = L + pad + ':';
    labels[j].el.style.width = widthCh + 'ch';
    labels[j].el.style.display = 'inline-block';
  }
}
function alignAllMetricLabels() {
  var topLabels = document.querySelectorAll('.metrics-bar-top .metric .label');
  var bottomLabels = document.querySelectorAll('#metricsBottom .metric .label');
  alignMetricGroup(topLabels);
  alignMetricGroup(bottomLabels);
}

/* ===== Validation and tab logic ===== */
function setDisabled(el, disabled){
  if (!el) return;
  el.disabled = !!disabled;
  if (disabled) { el.setAttribute('disabled',''); }
  else { el.removeAttribute('disabled'); }
  el.setAttribute('aria-disabled', String(!!disabled));
}
function addRobustTap(el, handler){
  if (!el) return;
  el.addEventListener('click', handler, false);
  el.addEventListener('pointerup', handler, false);
  el.addEventListener('touchend', handler, false);
}
function sanitizeSite(value) { return String(value || '').replace(/[^A-Za-z0-9]/g, '').slice(0,7); }

function validateFields() {
  var ok = true;
  function mark(el, cond) {
    if (!cond) { el.classList.add('invalid'); ok = false; }
    else { el.classList.remove('invalid'); }
  }
  var siteOk = /^[A-Za-z0-9]{1,7}$/.test(siteInput.value || '');
  var junctionOk = (junctionInput.value || '').trim().length > 0;
  var armOk = (armInput.value || '').trim().length > 0;
  var dateOk = !!(dateInput.value || '');
  var dist = parseFloat(distanceInput.value || '');
  var distOk = !isNaN(dist) && dist > 0;

  mark(siteInput, siteOk);
  mark(junctionInput, junctionOk);
  mark(armInput, armOk);
  mark(dateInput, dateOk);
  mark(distanceInput, distOk);

  detailsErrors && detailsErrors.classList.toggle('show', !ok);
  return ok;
}
function formIsValid() { return validateFields(); }

function updateTabVisibility() {
  var detailsOK = formIsValid();
  setDisabled(measureTabBtn, !detailsOK);
  setDisabled(gotoMeasureBtn, !detailsOK);
  if (detailsHint) detailsHint.textContent = detailsOK ? 'Details complete. Proceed to Measurements.' : 'Fill all fields to unlock Measurements.';
  setDisabled(resultsTabBtn, !resultsUnlocked);
  if (!detailsOK && (measureTabBtn.classList.contains('active') || resultsTabBtn.classList.contains('active'))) {
    showTab('detailsTab');
  }
  if (!resultsUnlocked && resultsTabBtn.classList.contains('active')) {
    showTab('measureTab');
  }
  applyMeasureBtnEnabled(detailsOK);
}

function showTab(tab) {
  if (tab === 'measureTab' && !formIsValid()) {
    alert('Please complete Junction Details first.');
    tab = 'detailsTab';
  }
  if (tab === 'resultsTab' && !resultsUnlocked) {
    alert('Press \"End Survey\" to view results.');
    tab = 'measureTab';
  }
  detailsTab.classList.add('hidden'); detailsTab.setAttribute('aria-hidden','true');
  measureTab.classList.add('hidden');  measureTab.setAttribute('aria-hidden','true');
  resultsTab.classList.add('hidden');  resultsTab.setAttribute('aria-hidden','true');
  detailsTabBtn.classList.remove('active');
  measureTabBtn.classList.remove('active');
  resultsTabBtn.classList.remove('active');
  if (tab === 'detailsTab') {
    detailsTab.classList.remove('hidden'); detailsTab.setAttribute('aria-hidden','false');
    detailsTabBtn.classList.add('active');
  } else if (tab === 'measureTab') {
    measureTab.classList.remove('hidden'); measureTab.setAttribute('aria-hidden','false');
    measureTabBtn.classList.add('active');
    resizeCanvas();
  } else {
    resultsTab.classList.remove('hidden'); resultsTab.setAttribute('aria-hidden','false');
    resultsTabBtn.classList.add('active');
    renderResultsTable();
    renderSummaryBox();
  }
}

addRobustTap(detailsTabBtn, function(){ showTab('detailsTab'); });
addRobustTap(measureTabBtn, function(){ updateTabVisibility(); showTab('measureTab'); });
addRobustTap(resultsTabBtn, function(){ updateTabVisibility(); showTab('resultsTab'); });
addRobustTap(gotoMeasureBtn, function(){ updateTabVisibility(); showTab('measureTab'); });

function resizeCanvas(){
  if (!canvas || !canvasWrap) return;
  // CSS controls the displayed size. Never feed the previous orientation's
  // pixel width back into the layout, which can prevent the fieldset shrinking.
  var cssWidth = canvas.clientWidth;
  var cssHeight = canvas.clientHeight;
  if (!cssWidth || !cssHeight) return; // The Measurements tab may be hidden.
  var dpr = window.devicePixelRatio || 1;

  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  renderDisplay();
}

function getQuality(n) {
  if (n >= 100) return { label: 'V.Good', cls: 'quality-vgood' };
  if (n >= 75)  return { label: 'Good',   cls: 'quality-good'  };
  if (n >= 50)  return { label: 'Fair',   cls: 'quality-fair'  };
  if (n >= 25)  return { label: 'Low',    cls: 'quality-low'   };
  return { label: 'Poor',  cls: 'quality-poor' };
}
function updateQualityBadge(){
  var q = getQuality(measurements.length);
  var inline = document.getElementById('qualityInline');
  if (inline) {
    inline.textContent = 'Quality: ' + q.label;
    inline.className = 'quality-chip ' + q.cls;
  }
}

/* ===== Canvas drawing ===== */
function drawLines(lines) {
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.font = '16px monospace';
  ctx.fillStyle = '#000';
  var y = 18; // Start text near the very top of the canvas
  var x = 12;
  for (var i=0;i<lines.length;i++){ ctx.fillText(lines[i], x, y); y += 22; }
}

function renderDisplay() {
  var lines = [];
  var valid = formIsValid();
  if (measurements.length === 0) {
    lines.push(valid ? 'Press Start to begin measuring' : 'Complete details: Site, Location, Arm, Date, Distance (>0)');
  }
  lines.push('');
  lines.push('#   Time(s)  m/s    mph');

  // Show the last 7 samples (newest-first)
  var shown = Math.min(7, measurements.length);
  for (var i=0; i<shown; i++){
    var idx = measurements.length - 1 - i;
    var m = measurements[idx];
    var num = idx + 1;
    var row = padRight(String(num),4) + padRight(m.time.toFixed(2),9) + padRight(m.speed.toFixed(2),7) + m.mph.toFixed(2);
    lines.push(row);
  }

  drawLines(lines);
  updateEndSurveyColor();
  updateMetricsBars();
  updateQualityBadge();
}

function fmtMetric(ms){
  if (!isFinite(ms)) return '— m/s | — mph';
  var mps  = Number(ms).toFixed(2);
  var mph  = Number(ms * 2.23694).toFixed(2);
  var mpsP = padLeft(mps, 6);
  var mphP = padLeft(mph, 6);
  return mpsP + ' m/s | ' + mphP + ' mph';
}

function tick() {
  if (measuring) {
    var elapsed = (nowMs() - startTime) / 1000;
    timerMetric.textContent = elapsed.toFixed(2) + ' s';
    rafId = requestAnimationFrame(tick);
  }
  renderDisplay();
}

function startMeasurement() {
  if (!formIsValid()) return;
  measuring = true;
  measureBtn.textContent = 'Stop';
  measureBtn.style.backgroundColor = '#c62828';
  startTime = nowMs();
  rafId = requestAnimationFrame(tick);
  resultsUnlocked = false;
  updateTabVisibility();
}
function finishMeasurement() {
  if (!measuring) return;
  measuring = false;
  measureBtn.textContent = 'Start';
  measureBtn.style.backgroundColor = '#4CAF50';
  if (rafId) cancelAnimationFrame(rafId);
  var elapsed = (nowMs() - startTime) / 1000;
  var distance = parseFloat(distanceInput.value) || 0;
  var speed = (elapsed > 0) ? (distance / elapsed) : 0;
  var mph = speed * 2.23694;
  measurements.push({ distance: distance, time: elapsed, speed: speed, mph: mph });
  timerMetric.textContent = '0.00 s';
  renderDisplay();
  resultsUnlocked = false;
  updateTabVisibility();
}
function deleteLastSample() {
  if (measurements.length === 0) { alert('No sample to delete!'); return; }
  measurements.pop();
  renderDisplay();
  resultsUnlocked = false;
  updateTabVisibility();
}

addRobustTap(endSurveyBtn, function(){
  if (measurements.length === 0) { alert('No measurements recorded!'); return; }
  resultsUnlocked = true;
  updateTabVisibility();
  showTab('resultsTab');
  renderResultsTable();
  renderSummaryBox();
});

function percentile(sortedArray, p) {
  if (sortedArray.length === 0) return 0;
  var idx = (p / 100) * (sortedArray.length - 1);
  var lower = Math.floor(idx);
  var upper = Math.ceil(idx);
  if (upper >= sortedArray.length) return sortedArray[lower];
  var weight = idx - lower;
  return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
}
function renderResultsTable() {
  while (resultsTbody.firstChild) resultsTbody.removeChild(resultsTbody.firstChild);
  for (var i=0;i<measurements.length;i++){
    var m = measurements[i];
    var tr = document.createElement('tr');
    var idx = document.createElement('td'); idx.textContent = (i+1);
    var t = document.createElement('td'); t.textContent = m.time.toFixed(2);
    var s = document.createElement('td'); s.textContent = m.speed.toFixed(2);
    var mph = document.createElement('td'); mph.textContent = m.mph.toFixed(2);
    tr.appendChild(idx); tr.appendChild(t); tr.appendChild(s); tr.appendChild(mph);
    resultsTbody.appendChild(tr);
  }
}

/* Results summary alignment (unchanged) */
function formatAlignedLines(labelValuePairs) {
  var longest = 0;
  for (var i=0; i<labelValuePairs.length; i++) {
    if (labelValuePairs[i].label.length > longest) longest = labelValuePairs[i].label.length;
  }
  var out = [];
  for (var j=0; j<labelValuePairs.length; j++) {
    var L = labelValuePairs[j].label;
    var pad = ' '.repeat(longest - L.length + 1);
    out.push(L + pad + ': ' + labelValuePairs[j].value);
  }
  return out;
}
function renderResultsPlaceholders() {
  var lines = formatAlignedLines([
    { label: 'Avg Speed',  value: '— m/s | — mph' },
    { label: '85th %tile', value: '— m/s | — mph' },
    { label: '15th %tile', value: '— m/s | — mph' },
    { label: '5th %tile',  value: '— m/s | — mph' }
  ]);
  resultAvg.textContent = lines[0];
  resultP85.textContent = lines[1];
  resultP15.textContent = lines[2];
  resultP05.textContent = lines[3];
}
function renderSummaryBox() {
  var speeds = measurements.map(function(x){ return x.speed; }).sort(function(a,b){ return a - b; });
  function pct(sorted, p){ if (!sorted.length) return NaN; var idx=(p/100)*(sorted.length-1), lo=Math.floor(idx), hi=Math.ceil(idx); if (hi>=sorted.length) return sorted[lo]; var w=idx-lo; return sorted[lo]*(1-w)+sorted[hi]*w; }
  var avg = speeds.length ? speeds.reduce(function(a,b){return a+b;},0)/speeds.length : NaN;
  var p85 = pct(speeds, 85), p15 = pct(speeds, 15), p05 = pct(speeds, 5);

  var lines = formatAlignedLines([
    { label: 'Avg Speed',  value: fmtMetric(avg) },
    { label: '85th %tile', value: fmtMetric(p85) },
    { label: '15th %tile', value: fmtMetric(p15) },
    { label: '5th %tile',  value: fmtMetric(p05) }
  ]);
  resultAvg.textContent = lines[0];
  resultP85.textContent = lines[1];
  resultP15.textContent = lines[2];
  resultP05.textContent = lines[3];
}

function buildTxtContent() {
  function pad(str, len, alignRight) {
    str = String(str);
    if (str.length >= len) return str;
    var spaces = Array(len - str.length + 1).join(' ');
    return alignRight ? spaces + str : str + spaces;
  }
  function numf(n, len) { return pad((isFinite(n) ? Number(n).toFixed(2) : '0.00'), len, true); }
  function numi(n, len) { return pad(parseInt(n, 10), len, true); }

  var lines = [];
  var distance = parseFloat(distanceInput.value) || 0;
  lines.push('JUNCTION DETAILS');
  lines.push('Site Number        : ' + (siteInput.value || 'N/A'));
  lines.push('Junction Location  : ' + (junctionInput.value || 'N/A'));
  lines.push('Arm                : ' + (armInput.value || 'N/A'));
  lines.push('Date               : ' + (dateInput.value || new Date().toISOString().split('T')[0]));
  lines.push('Distance of Travel : ' + distance + ' m');
  lines.push('');
  lines.push('MEASUREMENTS');
  var W_IDX = 5, W_TIME = 10, W_MS = 12, W_MPH = 12;
  var header = pad('#', W_IDX, true) + ' ' + pad('Time (s)', W_TIME, true) + ' ' + pad('Speed (m/s)', W_MS, true) + ' ' + pad('Speed (mph)', W_MPH, true);
  lines.push(header);
  lines.push(Array(header.length + 1).join('-'));
  for (var i = 0; i < measurements.length; i++) {
    var m = measurements[i];
    var row = numi(i + 1, W_IDX) + ' ' + numf(m.time, W_TIME) + ' ' + numf(m.speed, W_MS) + ' ' + numf(m.mph, W_MPH);
    lines.push(row);
  }
  if (measurements.length === 0) lines.push('(no measurements)');
  lines.push('');
  var speeds = measurements.map(function(x){ return x.speed; }).sort(function(a,b){ return a - b; });
  function percentile(sorted, p) { if (!sorted.length) return NaN; var idx=(p/100)*(sorted.length-1), lo=Math.floor(idx), hi=Math.ceil(idx); if (hi>=sorted.length) return sorted[lo]; var w=idx-lo; return sorted[lo]*(1-w)+sorted[hi]*w; }
  var avg = NaN; if (speeds.length) { avg = speeds.reduce(function(a,b){return a+b;},0)/speeds.length; }
  var p85 = percentile(speeds, 85);
  var p15 = percentile(speeds, 15);
  var p5  = percentile(speeds, 5);

  function metricRow(label, ms){
    var val = isFinite(ms) ? (function(){
      var mps = Number(ms).toFixed(2);
      var mph = Number(ms * 2.23694).toFixed(2);
      var mpsP = padLeft(mps, 6);
      var mphP = padLeft(mph, 6);
      return mpsP + ' m/s | ' + mphP + ' mph';
    })() : '   — m/s |    — mph';
    return pad(label, 18, false) + ' : ' + val;
  }
  lines.push('RESULTS');
  lines.push(metricRow('Average Speed',   avg));
  lines.push(metricRow('85th Percentile', p85));
  lines.push(metricRow('15th Percentile', p15));
  lines.push(metricRow('5th Percentile',  p5));

  return lines.join('\n');
}
function trunc(s, n) { return String(s || '').length <= n ? String(s || '') : String(s || '').slice(0, n); }
function sanitizeFilePart(s) { return String(s || '').replace(/[^A-Za-z0-9_-]/g, '_'); }
function makeFilename() {
  var d = dateInput.value ? new Date(dateInput.value) : new Date();
  var yy = String(d.getFullYear()).slice(-2);
  var mm = ('0' + (d.getMonth()+1)).slice(-2);
  var dd = ('0' + d.getDate()).slice(-2);
  var site = sanitizeFilePart(siteInput.value || 'SITE');
  var armRaw = armInput.value || 'ARM';
  var armPart = sanitizeFilePart(trunc(armRaw, 12));
  return yy + mm + dd + '_' + site + '_' + armPart + '.txt';
}
function downloadText(filename, content) {
  try {
    var blob = new Blob([content], { type: 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
  } catch (e) {
    var dataUrl = 'data:text/plain;charset=utf-8,' + encodeURIComponent(content);
    window.open(dataUrl, '_blank');
  }
}

function applyMeasureBtnEnabled(enabled) {
  if (enabled && !measuring) {
    measureBtn.classList.remove('btn-disabled');
    measureBtn.style.backgroundColor = '#4CAF50';
  } else if (!enabled && !measuring) {
    measureBtn.classList.add('btn-disabled');
    measureBtn.style.backgroundColor = '#999';
  }
}
function updateEndSurveyColor() {
  var n = measurements.length;
  if (n < 25) { endSurveyBtn.style.backgroundColor = '#c62828'; }
  else if (n < 50) { endSurveyBtn.style.backgroundColor = '#ef6c00'; }
  else { endSurveyBtn.style.backgroundColor = '#2e7d32'; }
}

function updateMetricsBars(){
  if (countMetric) countMetric.textContent = String(measurements.length);
  if (!avgMetric || !p85Metric) return;
  if (measurements.length === 0){
    avgMetric.textContent = '— m/s | — mph';
    p85Metric.textContent = '— m/s | — mph';
    return;
  }
  var sum = 0, speeds = [];
  for (var i=0;i<measurements.length;i++){ sum += measurements[i].speed; speeds.push(measurements[i].speed); }
  var avg = sum / measurements.length;
  speeds.sort(function(a,b){ return a-b; });
  var p85 = percentile(speeds, 85);
  avgMetric.textContent = fmtMetric(avg);
  p85Metric.textContent = fmtMetric(p85);
}

window.toggleHandler = function(e) {
  if (e && e.preventDefault) e.preventDefault();
  if (!formIsValid()) {
    alert('Please complete Junction Details first.');
    showTab('detailsTab');
    return;
  }
  var t = nowMs();
  if (t - (window._lastToggleTime || 0) < 350) return;
  window._lastToggleTime = t;
  if (!measuring) startMeasurement(); else finishMeasurement();
};

function clearAllAndReset() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  measuring = false;
  measureBtn.textContent = 'Start';
  measureBtn.style.backgroundColor = '#4CAF50';
  measurements.length = 0;
  armInput.value = '';
  distanceInput.value = '';
  resultsUnlocked = false;
  timerMetric.textContent = '0.00 s';
  renderResultsTable();
  renderResultsPlaceholders();
  renderDisplay();
  updateEndSurveyColor();
  updateMetricsBars();
  updateTabVisibility();
  showTab('detailsTab');
}

deleteLastBtn.addEventListener('click', deleteLastSample, false);
document.getElementById('saveResultsBtn').addEventListener('click', function(){
  if (!resultsUnlocked) { alert('Press \"End Survey\" first.'); return; }
  if (measurements.length === 0) { alert('No measurements to save.'); return; }
  downloadText(makeFilename(), buildTxtContent());
}, false);
document.getElementById('clearDataBtn').addEventListener('click', function(){
  if (confirm('Clear all measurements and reset?')) {
    clearAllAndReset();
  }
}, false);

var liveInputs = [siteInput, junctionInput, armInput, dateInput, distanceInput];
for (var ii=0; ii<liveInputs.length; ii++){
  liveInputs[ii].addEventListener('input', function(){
    var cleaned = sanitizeSite(siteInput.value || '');
    if (cleaned !== siteInput.value) siteInput.value = cleaned;
    resultsUnlocked = false;
    renderDisplay();
    updateTabVisibility();
    updateEndSurveyColor();
  }, false);
  liveInputs[ii].addEventListener('change', function(){
    resultsUnlocked = false;
    renderDisplay();
    updateTabVisibility();
    updateEndSurveyColor();
  }, false);
}

function onReady(){
  if (!dateInput.value) {
    var d = new Date();
    var yyyy = d.getFullYear();
    var mm = ('0' + (d.getMonth()+1)).slice(-2);
    var dd = ('0' + d.getDate()).slice(-2);
    dateInput.value = yyyy + '-' + mm + '-' + dd;
  }
  resizeCanvas();
  renderResultsPlaceholders();
  renderDisplay();
  updateTabVisibility();
  updateMetricsBars();
  updateQualityBadge();
  alignAllMetricLabels();
  showTab('detailsTab');
}
window.addEventListener('resize', function(){ resizeCanvas(); alignAllMetricLabels(); }, false);
// Observe the final container size as mobile browsers settle after rotation,
// and when a hidden Measurements tab becomes visible again.
if (window.ResizeObserver && canvasWrap) {
  var canvasResizeObserver = new ResizeObserver(resizeCanvas);
  canvasResizeObserver.observe(canvasWrap);
}
document.addEventListener('visibilitychange', function(){ if (!document.hidden) { resizeCanvas(); alignAllMetricLabels(); } }, false);
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', onReady, false);
} else {
  onReady();
}


/* ===== Results Summary Alignment Helper (2025-10-12) ===== */
(function(){
  function formatSummaryAlignment(){
    var ids = ["resultAvg","resultP85","resultP15","resultP05","resultMax","resultSD","resultQuality"];
    var rows = [];
    ids.forEach(function(id){
      var el = document.getElementById(id);
      if (!el) return;
      var text = (el.textContent || "").trim();
      var idx = text.indexOf(":");
      var label = idx>=0 ? text.slice(0,idx).trim() : text;
      var value = idx>=0 ? text.slice(idx+1).trim() : "";
      rows.push([el,label,value]);
    });
    if (!rows.length) return;
    var maxLen = rows.reduce(function(m, r){ return Math.max(m, r[1].length); }, 0);
    rows.forEach(function(r){
      var pad = Math.max(0, maxLen - r[1].length);
      r[0].textContent = r[1] + " ".repeat(pad) + ": " + r[2];
    });
  }
  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", function(){ setTimeout(formatSummaryAlignment, 0); });
  } else {
    setTimeout(formatSummaryAlignment, 0);
  }
  window.__formatSummaryAlignment = formatSummaryAlignment;
})();


/* ===== Extra Results Metrics + Save Enhancements (2025-10-12) ===== */
(function(){
  function toNumber(x){ var n = Number(x); return Number.isFinite(n) ? n : NaN; }
  function mpsToMph(mps){ return Number.isFinite(mps) ? mps * 2.2369362921 : NaN; }
  function mean(arr){ return arr.length ? arr.reduce((a,b)=>a+b,0) / arr.length : NaN; }
  function sampleSD(arr){
    var n = arr.length;
    if (n < 2) return NaN;
    var mu = mean(arr);
    var v = 0;
    for (var i=0;i<n;i++) v += Math.pow(arr[i]-mu,2);
    v /= (n-1);
    return Math.sqrt(v);
  }
  function qualityFromSpeeds(speeds){
    // Placeholder; overridden by final quality patch below
    var n = speeds.length;
    if (n === 0) return {label:"—", cls:""};
    var mu = mean(speeds);
    var sd = sampleSD(speeds);
    var cov = (mu>0 && Number.isFinite(sd)) ? (sd/mu) : Infinity;
    var label = "Fair", cls = "quality-fair";
    if (n < 5){ label = "Low"; cls = "quality-low"; }
    else if (cov < 0.05){ label = "Very Good"; cls = "quality-vgood"; }
    else if (cov < 0.12){ label = "Good"; cls = "quality-good"; }
    else if (cov < 0.25){ label = "Fair"; cls = "quality-fair"; }
    else if (cov < 0.40){ label = "Low"; cls = "quality-low"; }
    else { label = "Poor"; cls = "quality-poor"; }
    return {label, cls, sd, cov};
  }
  function fmtFixed(n, d){ return Number.isFinite(n) ? n.toFixed(d) : "—"; }
  function fmtSpeedPair(mps){ return fmtFixed(mps,2) + " m/s | " + fmtFixed(mpsToMph(mps),2) + " mph"; }

  function ensureSummarySpans(){
    var cont = document.querySelector(".summary");
    if (!cont) return {};
    function need(id){
      var el = document.getElementById(id);
      if (!el){
        el = document.createElement("span"); el.id = id; cont.appendChild(el);
      }
      return el;
    }
    return {
      avg: document.getElementById("resultAvg"),
      p85: document.getElementById("resultP85"),
      p15: document.getElementById("resultP15"),
      p05: document.getElementById("resultP05"),
      max: need("resultMax"),
      qual: need("resultQuality"),
      sd: need("resultSD"),
    };
  }

  function parseSpeedsFromTable(){
    var rows = Array.from(document.querySelectorAll("#resultsTable tbody tr"));
    var speeds = [];
    rows.forEach(function(tr){
      var tds = tr.querySelectorAll("td");
      if (tds.length >= 4){
        var mps = toNumber((tds[2].textContent || "").trim());
        if (Number.isFinite(mps)) speeds.push(mps);
      }
    });
    return speeds;
  }

  function computeAndRenderExtraSummary(){
    var spans = ensureSummarySpans();
    var speeds = parseSpeedsFromTable();
    var max = speeds.length ? Math.max.apply(null, speeds) : NaN;
    var q = qualityFromSpeeds(speeds);
    if (spans.max) spans.max.textContent = "Max speed: " + fmtSpeedPair(max);
    if (spans.sd) spans.sd.textContent = "Standard deviation: " + fmtFixed(q.sd, 3) + " m/s";
    if (spans.qual) spans.qual.textContent = "Quality: " + q.label;

    if (window.__formatSummaryAlignment){ window.__formatSummaryAlignment(); }
  }

  // Hook events
  ["click"].forEach(function(evt){
    var endBtn = document.getElementById("endSurveyBtn");
    if (endBtn){ endBtn.addEventListener(evt, function(){ setTimeout(computeAndRenderExtraSummary, 0); }); }
    var resBtn = document.getElementById("resultsTabBtn");
    if (resBtn){ resBtn.addEventListener(evt, function(){ setTimeout(computeAndRenderExtraSummary, 0); }); }
  });
  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", function(){ setTimeout(computeAndRenderExtraSummary, 0); });
  } else {
    setTimeout(computeAndRenderExtraSummary, 0);
  }

  // Enhanced save
  var saveBtnInit = function(){
    var saveBtn = document.getElementById("saveResultsBtn");
    if (!saveBtn) return;
    saveBtn.addEventListener("click", function(ev){
      try{
        ev.preventDefault(); ev.stopImmediatePropagation();
        // Data
        var site = (document.getElementById("site")||{}).value || "";
        var dist = toNumber((document.getElementById("distance")||{}).value || "");
        var date = (document.getElementById("date")||{}).value || "";
        var junction = (document.getElementById("junction")||{}).value || "";
        var arm = (document.getElementById("arm")||{}).value || "";

        var rows = Array.from(document.querySelectorAll("#resultsTable tbody tr"));
        var times = [], speeds = [];
        rows.forEach(function(tr){
          var tds = tr.querySelectorAll("td");
          var t = toNumber((tds[1]?.textContent||"").trim());
          var mps = toNumber((tds[2]?.textContent||"").trim());
          if (!Number.isFinite(mps) && Number.isFinite(t) && Number.isFinite(dist) && t>0){
            mps = dist / t;
          }
          if (Number.isFinite(t)) times.push(t);
          if (Number.isFinite(mps)) speeds.push(mps);
        });

        var maxSpd = speeds.length ? Math.max.apply(null, speeds) : NaN;
        // temporary quality until overridden
        var mu = mean(speeds); var sd = (function(){ var n=speeds.length;if(n<2) return NaN;var v=0;for(var i=0;i<n;i++) v+=(speeds[i]-mu)**2;return Math.sqrt(v/(n-1));})();
        var q = qualityFromSpeeds(speeds);

        var out = [];
        out.push("MOVA SPEED SURVEY v3.3");
        out.push("Site: " + site);
        out.push("Junction: " + junction);
        out.push("Arm: " + arm);
        out.push("Date: " + date);
        out.push("Distance (m): " + (Number.isFinite(dist) ? dist : ""));
        out.push("Max speed: " + (Number.isFinite(maxSpd)?maxSpd.toFixed(2):"") + " m/s | " + (Number.isFinite(maxSpd)?(maxSpd*2.2369362921).toFixed(2):"") + " mph");
        out.push("Standard deviation (m/s): " + (Number.isFinite(sd)?sd.toFixed(3):"—"));
        out.push("Quality: " + q.label);
        out.push("");
        out.push("#\tTime (s)\tSpeed (m/s)\tSpeed (mph)");
        rows.forEach(function(tr, i){
          var tds = tr.querySelectorAll("td");
          var t = toNumber((tds[1]?.textContent||"").trim());
          var mps = toNumber((tds[2]?.textContent||"").trim());
          if (!Number.isFinite(mps) && Number.isFinite(dist) && Number.isFinite(t) && t>0){
            mps = dist / t;
          }
          var mph = Number.isFinite(mps) ? mps*2.2369362921 : NaN;
          out.push((i+1) + "\t" + (Number.isFinite(t)?t.toFixed(2):"") + "\t" + (Number.isFinite(mps)?mps.toFixed(2):"") + "\t" + (Number.isFinite(mph)?mph.toFixed(2):""));
        });

        var blob = new Blob([out.join("\\n")], {type:"text/plain;charset=utf-8"});
        var a = document.createElement("a");
        a.download = (site || "mova_survey") + "_" + Date.now() + ".txt";
        a.href = URL.createObjectURL(blob);
        a.click();
        URL.revokeObjectURL(a.href);
      }catch(e){ console.error(e); }
    }, true);
  };
  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", saveBtnInit);
  } else {
    saveBtnInit();
  }
})();


/* ===== Bugfix: enforce single colon in metric labels (2025-10-12) ===== */
(function(){
  function ensureLabelColon(node){
    if (!node) return;
    var label = node.querySelector(".label");
    if (!label) return;
    var t = (label.textContent || "").trimEnd();
    if (!t.endsWith(":")) label.textContent = t + ":";
  }
  function applyOnce(){
    try{
      document.querySelectorAll(".metrics-bar-top .metrics-row .metric").forEach(ensureLabelColon);
      document.querySelectorAll(".metrics-bar .metric").forEach(ensureLabelColon);
    }catch(e){}
  }
  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", applyOnce, {once:true});
  } else {
    applyOnce();
  }
})();


/* ===== Quality Classification Fix (bias down one level) (2025-10-12) ===== */
(function(){
  const QUALITY_LEVELS = [
    { label: "Poor",       cls: "quality-poor"  },
    { label: "Low",        cls: "quality-low"   },
    { label: "Fair",       cls: "quality-fair"  },
    { label: "Good",       cls: "quality-good"  },
    { label: "Very Good",  cls: "quality-vgood" }
  ];
  function covFromArray(arr){
    var n = arr.length;
    if (n === 0) return Infinity;
    var mu = arr.reduce((a,b)=>a+b,0) / n;
    if (!(mu > 0)) return Infinity;
    var v = 0;
    for (var i=0;i<n;i++) v += Math.pow(arr[i]-mu,2);
    var sd = Math.sqrt(v / Math.max(1, n - 1));
    return sd / mu;
  }
  function baseQualityIndex(n, cov){
    if (!Number.isFinite(cov)) return 0;
    if (n < 5)               return 1;
    if (cov < 0.050)         return 4;
    if (cov < 0.120)         return 3;
    if (cov < 0.250)         return 2;
    if (cov < 0.400)         return 1;
    return 0;
  }
  function biasedDownIndex(idx){ return Math.max(0, idx - 1); }

  // Override/define global helpers expected by existing code
  window.qualityLabelFromSamples = function(samples){
    var n = samples.length;
    var cov = covFromArray(samples);
    var idx = biasedDownIndex(baseQualityIndex(n, cov));
    return { label: QUALITY_LEVELS[idx].label, cls: QUALITY_LEVELS[idx].cls };
  };
  window.qualityFromSpeeds = function(speeds){
    var n = speeds.length;
    var cov = covFromArray(speeds);
    var idx = biasedDownIndex(baseQualityIndex(n, cov));
    var mu = speeds.length ? speeds.reduce((a,b)=>a+b,0) / speeds.length : NaN;
    var sd = NaN;
    if (speeds.length >= 2){
      var v = 0;
      for (var i=0;i<speeds.length;i++) v += Math.pow(speeds[i]-mu,2);
      sd = Math.sqrt(v / (speeds.length - 1));
    }
    return { label: QUALITY_LEVELS[idx].label, cls: QUALITY_LEVELS[idx].cls, sd: sd, cov: cov };
  };
})();


/* ===== Patch (2025-10-12): normalize value columns widths for m/s and mph ===== */
(function(){
  function normalizeValuePair(val){
    // Expect like: "<num> m/s | <num> mph"
    var m = val.match(/([+-]?\d+(?:\.\d+)?)\s*m\/s\s*\|\s*([+-]?\d+(?:\.\d+)?)\s*mph/i);
    if (!m) return val;
    var mps = Number(m[1]), mph = Number(m[2]);
    if (!Number.isFinite(mps) || !Number.isFinite(mph)) return val;
    var mpsStr = mps.toFixed(2).padStart(6, " ");
    var mphStr = mph.toFixed(2).padStart(6, " ");
    return mpsStr + " m/s | " + mphStr + " mph";
  }

  window.__formatSummaryAlignment = function(){
    var ids = ["resultAvg","resultP85","resultP15","resultP05","resultMax","resultSD","resultQuality"];
    var rows = [];
    ids.forEach(function(id){
      var el = document.getElementById(id);
      if (!el) return;
      var text = (el.textContent || "").trim();
      var idx = text.indexOf(":");
      var label = idx>=0 ? text.slice(0,idx).trim() : text;
      var value = idx>=0 ? text.slice(idx+1).trim() : "";
      // normalize value pair if present
      value = normalizeValuePair(value);
      rows.push([el,label,value]);
    });
    if (!rows.length) return;
    var maxLen = rows.reduce(function(m, r){ return Math.max(m, r[1].length); }, 0);
    rows.forEach(function(r){
      var pad = Math.max(0, maxLen - r[1].length);
      r[0].textContent = r[1] + " ".repeat(pad) + ": " + r[2];
    });
  };

  // Re-run alignment on load and when tab shows
  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", function(){ setTimeout(window.__formatSummaryAlignment, 0); });
  } else {
    setTimeout(window.__formatSummaryAlignment, 0);
  }
  var resBtn = document.getElementById("resultsTabBtn");
  if (resBtn){ resBtn.addEventListener("click", function(){ setTimeout(window.__formatSummaryAlignment, 0); }); }
})();


/* ===== Patch (2025-10-12): Final Results Quality — require >=10 samples for above "Poor" ===== */
(function(){
  function covFromArray(arr){
    var n = arr.length;
    if (n === 0) return Infinity;
    var mu = arr.reduce((a,b)=>a+b,0) / n;
    if (!(mu > 0)) return Infinity;
    var v = 0;
    for (var i=0;i<n;i++) v += Math.pow(arr[i]-mu,2);
    var sd = Math.sqrt(v / Math.max(1, n - 1));
    return sd / mu;
  }
  var LEVELS = [
    { label: "Poor", cls: "quality-poor" },
    { label: "Low", cls: "quality-low" },
    { label: "Fair", cls: "quality-fair" },
    { label: "Good", cls: "quality-good" },
    { label: "Very Good", cls: "quality-vgood" },
  ];
  function baseIdx(n, cov){
    if (!Number.isFinite(cov)) return 0;
    if (n < 5) return 1;
    if (cov < 0.050) return 4;
    if (cov < 0.120) return 3;
    if (cov < 0.250) return 2;
    if (cov < 0.400) return 1;
    return 0;
  }
  function biasedDown(i){ return Math.max(0, i - 1); }

  // Final results rule: if n < 10 => Poor, otherwise biased thresholds
  function classifyFinal(speeds){
    var n = speeds.length;
    if (n < 10) return LEVELS[0];
    var cov = covFromArray(speeds);
    var idx = biasedDown(baseIdx(n, cov));
    return LEVELS[idx];
  }

  // Hook into extra summary + save pipeline by overriding qualityFromSpeeds used there
  var oldQualityFromSpeeds = window.qualityFromSpeeds;
  window.qualityFromSpeeds = function(speeds){
    var res = classifyFinal(speeds);
    // keep sd/cov if old available
    var q = { label: res.label, cls: res.cls };
    if (Array.isArray(speeds) && speeds.length >= 2){
      var n = speeds.length;
      var mu = speeds.reduce((a,b)=>a+b,0) / n;
      var v = 0; for (var i=0;i<n;i++) v += Math.pow(speeds[i]-mu,2);
      q.sd = Math.sqrt(v / (n-1));
      q.cov = (mu>0) ? q.sd / mu : Infinity;
    }
    return q;
  };
})();


/* ===== Unified Quality (sample-count thresholds) 2025-10-12 ===== */
(function(){
  function qualityLevelFromCount(n){
    if (n >= 100) return { label: "Very Good", cls: "quality-vgood" };
    if (n >= 75)  return { label: "Good",      cls: "quality-good" };
    if (n >= 50)  return { label: "Fair",      cls: "quality-fair" };
    if (n >= 25)  return { label: "Low",       cls: "quality-low" };
    return { label: "Poor",                     cls: "quality-poor" };
  }

  // Override any previous quality helpers to use count-based thresholds everywhere
  window.qualityLabelFromSamples = function(samples){
    var n = Array.isArray(samples) ? samples.length : 0;
    return qualityLevelFromCount(n);
  };

  // Results summary helper (used by extra metrics/save) aligned to the same rule
  window.qualityFromSpeeds = function(speeds){
    var n = Array.isArray(speeds) ? speeds.length : 0;
    var q = qualityLevelFromCount(n);
    // Keep sd/cov if any upstream expects them (compute sd only if needed elsewhere)
    // Not required for classification now, but harmless to include NaN.
    q.sd = Number.NaN;
    q.cov = Number.NaN;
    return q;
  };

  // Also patch the inline Quality chip in Measurements tab if it was computed differently
  function patchQualityChip(){
    var chip = document.getElementById("qualityInline");
    if (!chip) return;
    // Remove any previous quality-* classes, then apply the unified one
    ["quality-poor","quality-low","quality-fair","quality-good","quality-vgood"].forEach(function(c){
      chip.classList.remove(c);
    });
    // Count samples from the bottom metrics or state inferred from table
    var rows = document.querySelectorAll("#resultsTable tbody tr");
    var n = 0;
    if (rows && rows.length){
      n = rows.length;
    } else {
      // Fallback: try to read the 'Samples' metric on the top bar if present
      var countEl = document.getElementById("countMetric");
      if (countEl){
        var v = parseInt((countEl.textContent||"").trim(), 10);
        n = isFinite(v) ? v : 0;
      }
    }
    var q = qualityLevelFromCount(n);
    chip.classList.add(q.cls);
    chip.textContent = "Quality: " + q.label;
  }

  // Try to keep chip in sync
  document.addEventListener("DOMContentLoaded", function(){
    setTimeout(patchQualityChip, 0);
  });
  ["click","input"].forEach(function(evt){
    document.addEventListener(evt, function(){
      setTimeout(patchQualityChip, 0);
    }, true);
  });
})();


/* === FINAL unified quality: ALWAYS use sample count everywhere (v3.2) === */
(function(){
  function qualityLevelFromCount(n){
    if (n >= 100) return { label: "Very Good", cls: "quality-vgood" };
    if (n >= 75)  return { label: "Good",      cls: "quality-good"  };
    if (n >= 50)  return { label: "Fair",      cls: "quality-fair"  };
    if (n >= 25)  return { label: "Low",       cls: "quality-low"   };
    return { label: "Poor",                    cls: "quality-poor"  };
  }
  function getSampleCount(){
    const countEl = document.getElementById("countMetric");
    const v = parseInt((countEl?.textContent || "").trim(), 10);
    if (Number.isFinite(v) && v >= 0) return v;
    return document.querySelectorAll("#resultsTable tbody tr").length;
  }
  window.qualityLabelFromSamples = function(_samples){
    return qualityLevelFromCount(getSampleCount());
  };
  window.qualityFromSpeeds = function(_speeds){
    const q = qualityLevelFromCount(getSampleCount());
    q.sd = Number.NaN; q.cov = Number.NaN;
    return q;
  };
  function updateResultsQualityLine(){
    const el = document.getElementById("resultQuality");
    if (!el) return;
    const q = qualityLevelFromCount(getSampleCount());
    el.textContent = "Quality: " + q.label;
    if (typeof window.__formatSummaryAlignment === "function"){
      setTimeout(window.__formatSummaryAlignment, 0);
    }
  }
  function updateChip(){
    const chip = document.getElementById("qualityInline");
    if (!chip) return;
    const q = qualityLevelFromCount(getSampleCount());
    ["quality-poor","quality-low","quality-fair","quality-good","quality-vgood"]
      .forEach(c => chip.classList.remove(c));
    chip.classList.add(q.cls);
    chip.textContent = "Quality: " + q.label;
  }
  function syncAll(){ updateResultsQualityLine(); updateChip(); }
  document.addEventListener("DOMContentLoaded", () => setTimeout(syncAll, 0));
  ["click","input"].forEach(evt => document.addEventListener(evt, () => setTimeout(syncAll, 0), true));
  setTimeout(syncAll, 0);
})();


/* ==== Chip-Referenced Quality (v3.2.1) ====
   Use the Measurements tab quality chip text verbatim for Results + save.
*/
(function(){
  function chipQualityText(){
    var chip = document.getElementById("qualityInline");
    if (!chip) return "—";
    var t = (chip.textContent || "").trim();
    // Expect "Quality: <Label>"
    var i = t.indexOf(":");
    return (i >= 0 ? t.slice(i+1) : t).trim() || "—";
  }
  function updateResultsQualityFromChip(){
    var el = document.getElementById("resultQuality");
    if (!el) return;
    el.textContent = "Quality: " + chipQualityText();
    if (typeof window.__formatSummaryAlignment === "function"){
      setTimeout(window.__formatSummaryAlignment, 0);
    }
  }

  // Keep Results line synced whenever UI changes likely affect chip
  function bindSync(){
    var ids = ["endSurveyBtn","resultsTabBtn","measureTabBtn","clearDataBtn","deleteLastBtn","measureBtn"];
    ids.forEach(function(id){
      var btn = document.getElementById(id);
      if (btn) btn.addEventListener("click", function(){ setTimeout(updateResultsQualityFromChip, 0); }, true);
    });
    // Also re-sync on generic input changes
    document.addEventListener("input", function(){ setTimeout(updateResultsQualityFromChip, 0); }, true);
    // Initial sync
    setTimeout(updateResultsQualityFromChip, 0);
  }
  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", bindSync);
  } else {
    bindSync();
  }

  // Override save to use chip text
  function installSaveOverride(){
    var saveBtn = document.getElementById("saveResultsBtn");
    if (!saveBtn) return;
    saveBtn.addEventListener("click", function(ev){
      try{
        ev.preventDefault(); ev.stopImmediatePropagation();
        // Collect data for saving (reuse existing DOM)
        function toNumber(x){ var n = Number(x); return Number.isFinite(n) ? n : NaN; }
        function mpsToMph(mps){ return Number.isFinite(mps) ? mps * 2.2369362921 : NaN; }

        var site = (document.getElementById("site")||{}).value || "";
        var dist = toNumber((document.getElementById("distance")||{}).value || "");
        var date = (document.getElementById("date")||{}).value || "";
        var junction = (document.getElementById("junction")||{}).value || "";
        var arm = (document.getElementById("arm")||{}).value || "";

        var rows = Array.from(document.querySelectorAll("#resultsTable tbody tr"));
        var out = [];
        out.push("MOVA SPEED SURVEY v3.3");
        out.push("Site: " + site);
        out.push("Junction: " + junction);
        out.push("Arm: " + arm);
        out.push("Date: " + date);
        out.push("Distance (m): " + (Number.isFinite(dist) ? dist : ""));

        // Max speed (recompute from table to avoid stale)
        var speeds = [];
        rows.forEach(function(tr){
          var tds = tr.querySelectorAll("td");
          var t = toNumber((tds[1]?.textContent||"").trim());
          var mps = toNumber((tds[2]?.textContent||"").trim());
          if (!Number.isFinite(mps) && Number.isFinite(dist) && Number.isFinite(t) && t>0){
            mps = dist / t;
          }
          if (Number.isFinite(mps)) speeds.push(mps);
        });
        var maxSpd = speeds.length ? Math.max.apply(null, speeds) : NaN;
        out.push("Max speed: " + (Number.isFinite(maxSpd)?maxSpd.toFixed(2):"") + " m/s | " + (Number.isFinite(maxSpd)?(maxSpd*2.2369362921).toFixed(2):"") + " mph");

        // Quality from chip
        out.push("Quality: " + chipQualityText());

        out.push("");
        out.push("#\tTime (s)\tSpeed (m/s)\tSpeed (mph)");
        rows.forEach(function(tr, i){
          var tds = tr.querySelectorAll("td");
          var t = toNumber((tds[1]?.textContent||"").trim());
          var mps = toNumber((tds[2]?.textContent||"").trim());
          if (!Number.isFinite(mps) && Number.isFinite(dist) && Number.isFinite(t) && t>0){
            mps = dist / t;
          }
          var mph = mpsToMph(mps);
          out.push((i+1) + "\t" + (Number.isFinite(t)?t.toFixed(2):"") + "\t" + (Number.isFinite(mps)?mps.toFixed(2):"") + "\t" + (Number.isFinite(mph)?mph.toFixed(2):""));
        });

        var blob = new Blob([out.join("\n")], {type:"text/plain;charset=utf-8"});
        var a = document.createElement("a");
        a.download = (site || "mova_survey") + "_" + Date.now() + ".txt";
        a.href = URL.createObjectURL(blob);
        a.click();
        URL.revokeObjectURL(a.href);
      }catch(e){ console.error(e); }
    }, true);
  }
  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", installSaveOverride);
  } else {
    installSaveOverride();
  }
})();


/* === v3.2.2: Enforce exactly one space after ':' in Results summary === */
(function(){
  window.__formatSummaryAlignment = function(){
    var ids = ["resultAvg","resultP85","resultP15","resultP05","resultMax","resultSD","resultQuality"];
    var rows = [];
    ids.forEach(function(id){
      var el = document.getElementById(id);
      if (!el) return;
      var text = (el.textContent || "").trim();
      var idx = text.indexOf(":");
      var label = idx>=0 ? text.slice(0,idx).trim() : text;
      var value = idx>=0 ? text.slice(idx+1).trim() : "";
      // remove any leading spaces to guarantee only ONE space after ':'
      value = value.replace(/^\s+/, "");
      rows.push([el,label,value]);
    });
    if (!rows.length) return;
    // Align labels only (no extra spaces added at start of value)
    var maxLen = rows.reduce(function(m, r){ return Math.max(m, r[1].length); }, 0);
    rows.forEach(function(r){
      var pad = Math.max(0, maxLen - r[1].length);
      r[0].textContent = r[1] + " ".repeat(pad) + ": " + r[2];
    });
  };
  // Run on load
  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", function(){ setTimeout(window.__formatSummaryAlignment, 0); });
  } else {
    setTimeout(window.__formatSummaryAlignment, 0);
  }
  // Re-run when results tab is shown
  var resBtn = document.getElementById("resultsTabBtn");
  if (resBtn){ resBtn.addEventListener("click", function(){ setTimeout(window.__formatSummaryAlignment, 0); }); }
})();


/* === v3.2.3: Strict single-space formatting for value pairs and after ':' === */
(function(){
  function formatValuePair(value){
    // Expect: "<x> m/s | <y> mph" possibly with extra spaces
    var m = value.match(/([-+]?\d+(?:\.\d+)?)\s*m\/s\s*\|\s*([-+]?\d+(?:\.\d+)?)\s*mph/i);
    if (!m) return value.trim(); // non-pair lines (e.g., SD, Quality)
    var mps = Number(m[1]);
    var mph = Number(m[2]);
    if (!Number.isFinite(mps) || !Number.isFinite(mph)) return value.trim();
    // EXACT pattern with one space everywhere
    return mps.toFixed(2) + " m/s | " + mph.toFixed(2) + " mph";
  }

  window.__formatSummaryAlignment = function(){
    var ids = ["resultAvg","resultP85","resultP15","resultP05","resultMax","resultSD","resultQuality"];
    var rows = [];
    ids.forEach(function(id){
      var el = document.getElementById(id);
      if (!el) return;
      var text = (el.textContent || "").trim();
      var idx = text.indexOf(":");
      var label = idx>=0 ? text.slice(0,idx).trim() : text;
      var value = idx>=0 ? text.slice(idx+1).trim() : "";
      value = formatValuePair(value); // normalize pair spacing
      rows.push([el,label,value]);
    });
    if (!rows.length) return;
    var maxLen = rows.reduce(function(m, r){ return Math.max(m, r[1].length); }, 0);
    rows.forEach(function(r){
      var pad = Math.max(0, maxLen - r[1].length);
      r[0].textContent = r[1] + " ".repeat(pad) + ": " + r[2]; // exactly one space after ':'
    });
  };

  function runAlign(){ if (typeof window.__formatSummaryAlignment === "function") window.__formatSummaryAlignment(); }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", function(){ setTimeout(runAlign, 0); });
  } else {
    setTimeout(runAlign, 0);
  }
  var resBtn = document.getElementById("resultsTabBtn");
  if (resBtn){ resBtn.addEventListener("click", function(){ setTimeout(runAlign, 0); }); }
})();


/* === v3.2.3: Race-free chip-driven quality sync === */
(function(){
  const Q_CHIP_ID = "qualityInline";
  const Q_RESULTS_ID = "resultQuality";

  function getChip(){ return document.getElementById(Q_CHIP_ID); }
  function getRes(){
    var el = document.getElementById(Q_RESULTS_ID);
    if (!el){
      var cont = document.querySelector(".summary");
      if (cont){ el = document.createElement("span"); el.id = Q_RESULTS_ID; cont.appendChild(el); }
    }
    return el;
  }

  function chipText(){
    const chip = getChip();
    if (!chip) return "—";
    const t = (chip.textContent || "").trim();
    const i = t.indexOf(":");
    return (i >= 0 ? t.slice(i+1) : t).trim() || "—";
  }

  function writeResultsFromChip(){
    const el = getRes();
    if (!el) return;
    el.textContent = "Quality: " + chipText();
    if (typeof window.__formatSummaryAlignment === "function"){
      requestAnimationFrame(() => window.__formatSummaryAlignment());
    }
  }

  function installObserver(){
    const chip = getChip();
    if (!chip) return;
    if (window.__qualityChipObserver) { try { window.__qualityChipObserver.disconnect(); } catch(e){} }
    const mo = new MutationObserver(writeResultsFromChip);
    mo.observe(chip, { characterData: true, subtree: true, childList: true });
    window.__qualityChipObserver = mo;
  }

  function bindTriggers(){
    const ids = ["endSurveyBtn","resultsTabBtn","measureTabBtn","clearDataBtn","deleteLastBtn","measureBtn"];
    ids.forEach(id => {
      const b = document.getElementById(id);
      if (b) b.addEventListener("click", () => setTimeout(writeResultsFromChip, 0), true);
    });
    document.addEventListener("input", () => setTimeout(writeResultsFromChip, 0), true);
  }

  // Override any other calculators to ALWAYS mirror the chip
  window.qualityFromSpeeds = function(){ return { label: chipText(), cls: "" }; };
  window.qualityLabelFromSamples = function(){ return { label: chipText(), cls: "" }; };

  function init(){
    installObserver();
    bindTriggers();
    requestAnimationFrame(writeResultsFromChip); // ensure we win over any earlier writes
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();


/* === v3.2.x: Fully render Results tab when shown or End Survey is clicked ===
   Forces a full, ordered render so quality and spacing are always correct.
*/
(function(){
  const SUMMARY_IDS = ["resultAvg","resultP85","resultP15","resultP05","resultMax","resultSD","resultQuality"];

  function ensureResultQualityEl(){
    let el = document.getElementById("resultQuality");
    if (!el){
      const cont = document.querySelector(".summary");
      if (cont){
        el = document.createElement("span");
        el.id = "resultQuality";
        cont.appendChild(el);
      }
    }
    return el;
  }

  function chipQualityText(){
    const chip = document.getElementById("qualityInline");
    if (!chip) return "—";
    const t = (chip.textContent || "").trim();
    const i = t.indexOf(":");
    return (i >= 0 ? t.slice(i+1) : t).trim() || "—";
  }

  function normalizePair(value){
    const m = String(value).match(/([-+]?\d+(?:\.\d+)?)\s*m\/s\s*\|\s*([-+]?\d+(?:\.\d+)?)\s*mph/i);
    if (!m) return String(value).trim();
    const mps = Number(m[1]), mph = Number(m[2]);
    if (!Number.isFinite(mps) || !Number.isFinite(mph)) return String(value).trim();
    return mps.toFixed(2) + " m/s | " + mph.toFixed(2) + " mph";
  }

  function formatSummaryAlignment(){
    const rows = [];
    for (const id of SUMMARY_IDS){
      const el = document.getElementById(id);
      if (!el) continue;
      const text = (el.textContent || "").trim();
      const idx = text.indexOf(":");
      const label = idx>=0 ? text.slice(0,idx).trim() : text;
      let value = idx>=0 ? text.slice(idx+1).trim() : "";
      value = normalizePair(value.replace(/^\s+/, "")); // exactly one space after ':'
      rows.push([el,label,value]);
    }
    if (!rows.length) return;
    const maxLen = rows.reduce((m, r) => Math.max(m, r[1].length), 0);
    rows.forEach(([el,label,value]) => {
      const pad = Math.max(0, maxLen - label.length);
      el.textContent = label + " ".repeat(pad) + ": " + value;
    });
  }

  function renderResultsTabNow(){
    if (typeof window.renderResults === "function") {
      window.renderResults();
    }
    const qEl = ensureResultQualityEl();
    if (qEl) qEl.textContent = "Quality: " + chipQualityText();
    formatSummaryAlignment();
  }

  (function patchActivateTab(){
    const prev = window.activateTab;
    if (typeof prev === "function" && !prev.__patched_full_results){
      const wrapped = function(tabId){
        prev.apply(this, arguments);
        if (tabId === "resultsTab") {
          requestAnimationFrame(renderResultsTabNow);
        }
      };
      wrapped.__patched_full_results = true;
      window.activateTab = wrapped;
    } else if (typeof prev !== "function") {
      const btn = document.getElementById("resultsTabBtn");
      if (btn && !btn.__bound_full_results){
        btn.addEventListener("click", () => requestAnimationFrame(renderResultsTabNow), true);
        btn.__bound_full_results = true;
      }
    }
  })();

  (function patchEndSurvey(){
    const prev = window.endSurvey;
    if (typeof prev === "function" && !prev.__patched_full_results){
      const wrapped = function(){
        prev.apply(this, arguments);
        requestAnimationFrame(renderResultsTabNow);
      };
      wrapped.__patched_full_results = true;
      window.endSurvey = wrapped;
    } else {
      const btn = document.getElementById("endSurveyBtn");
      if (btn && !btn.__bound_full_results){
        btn.addEventListener("click", () => requestAnimationFrame(renderResultsTabNow), true);
        btn.__bound_full_results = true;
      }
    }
  })();

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", () => requestAnimationFrame(renderResultsTabNow), { once:true });
  } else {
    requestAnimationFrame(renderResultsTabNow);
  }
})();


/* === v3.2.5: Save .txt formatting fix (clean tabs, stable decimals, CRLF) === */
(function(){
  function toNumber(x){ var n = Number(x); return Number.isFinite(n) ? n : NaN; }
  function mpsToMph(mps){ return Number.isFinite(mps) ? mps * 2.2369362921 : NaN; }
  function fmt(n, d){ return Number.isFinite(n) ? n.toFixed(d) : ""; }

  function buildTxt(){
    var site = (document.getElementById("site")||{}).value || "";
    var dist = toNumber((document.getElementById("distance")||{}).value || "");
    var date = (document.getElementById("date")||{}).value || "";
    var junction = (document.getElementById("junction")||{}).value || "";
    var arm = (document.getElementById("arm")||{}).value || "";

    var rows = Array.from(document.querySelectorAll("#resultsTable tbody tr"));
    var lines = [];
    var EOL = "\r\n"; // ensure good Windows/Notepad rendering

    lines.push("MOVA SPEED SURVEY v3.3" + EOL);
    lines.push("Site: " + site + EOL);
    lines.push("Junction: " + junction + EOL);
    lines.push("Arm: " + arm + EOL);
    lines.push("Date: " + date + EOL);
    lines.push("Distance (m): " + (Number.isFinite(dist) ? dist : "") + EOL);

    // Compute max speed from the table (fallback compute from time if needed)
    var maxSpd = NaN;
    rows.forEach(function(tr){
      var tds = tr.querySelectorAll("td");
      var t = toNumber((tds[1]?.textContent||"").trim());
      var mps = toNumber((tds[2]?.textContent||"").trim());
      if (!Number.isFinite(mps) && Number.isFinite(dist) && Number.isFinite(t) && t > 0){
        mps = dist / t;
      }
      if (Number.isFinite(mps)){
        if (!Number.isFinite(maxSpd) || mps > maxSpd) maxSpd = mps;
      }
    });
    lines.push("Max speed: " + (Number.isFinite(maxSpd)?fmt(maxSpd,2):"") + " m/s | " + (Number.isFinite(maxSpd)?fmt(mpsToMph(maxSpd),2):"") + " mph" + EOL);

    // Mirror the chip's quality text exactly
    var chip = document.getElementById("qualityInline");
    var qText = "—";
    if (chip){
      var t = (chip.textContent || "").trim();
      var i = t.indexOf(":");
      qText = (i >= 0 ? t.slice(i+1) : t).trim() || "—";
    }
    lines.push("Quality: " + qText + EOL);

    lines.push(EOL);
    lines.push("#\tTime (s)\tSpeed (m/s)\tSpeed (mph)" + EOL);

    rows.forEach(function(tr, i){
      var tds = tr.querySelectorAll("td");
      var t = toNumber((tds[1]?.textContent||"").trim());
      var mps = toNumber((tds[2]?.textContent||"").trim());
      if (!Number.isFinite(mps) && Number.isFinite(dist) && Number.isFinite(t) && t > 0){
        mps = dist / t;
      }
      var mph = mpsToMph(mps);
      // Strict tab-separated columns with fixed decimals, no extra spaces
      lines.push((i+1) + "\t" + fmt(t,2) + "\t" + fmt(mps,2) + "\t" + fmt(mph,2) + EOL);
    });

    return lines.join("");
  }

  function installSaveFix(){
    var btn = document.getElementById("saveResultsBtn");
    if (!btn) return;
    // Capture-phase handler to override any earlier saves cleanly
    btn.addEventListener("click", function(ev){
      try{
        ev.preventDefault(); ev.stopImmediatePropagation();
        var txt = buildTxt();
        var site = (document.getElementById("site")||{}).value || "mova_survey";
        var blob = new Blob([txt], {type:"text/plain;charset=utf-8"});
        var a = document.createElement("a");
        a.download = site + "_" + Date.now() + ".txt";
        a.href = URL.createObjectURL(blob);
        a.click();
        URL.revokeObjectURL(a.href);
      }catch(e){ console.error(e); }
    }, true);
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", installSaveFix);
  } else {
    installSaveFix();
  }
})();


/* === v3.2.6: Monospaced, user-readable .txt export with aligned columns ===
   - Fixed-width, right-aligned numeric columns
   - CRLF line endings for Notepad compatibility
   - Exactly one space after ':' in labels
   - Mirrors chip quality, and uses current results values
*/
(function(){
  function toNumber(x){ var n = Number(x); return Number.isFinite(n) ? n : NaN; }
  function fmt(n, d){ return Number.isFinite(n) ? n.toFixed(d) : ""; }
  function mphFrom(mps){ return Number.isFinite(mps) ? mps * 2.2369362921 : NaN; }
  function padLeft(s, w){ s = String(s); return s.length >= w ? s : " ".repeat(w - s.length) + s; }
  function padRight(s, w){ s = String(s); return s.length >= w ? s : s + " ".repeat(w - s.length); }

  function chipQualityText(){
    var chip = document.getElementById("qualityInline");
    if (!chip) return "—";
    var t = (chip.textContent || "").trim();
    var i = t.indexOf(":");
    return (i >= 0 ? t.slice(i+1) : t).trim() || "—";
  }

  function collectRows(){
    var dist = toNumber((document.getElementById("distance")||{}).value || "");
    var trs = Array.from(document.querySelectorAll("#resultsTable tbody tr"));
    return trs.map(function(tr, i){
      var tds = tr.querySelectorAll("td");
      var t = toNumber((tds[1]?.textContent||"").trim());
      var mps = toNumber((tds[2]?.textContent||"").trim());
      if (!Number.isFinite(mps) && Number.isFinite(dist) && Number.isFinite(t) && t > 0){
        mps = dist / t;
      }
      var mph = mphFrom(mps);
      return {
        idx: i + 1,
        time: Number.isFinite(t) ? t : NaN,
        mps: Number.isFinite(mps) ? mps : NaN,
        mph: Number.isFinite(mph) ? mph : NaN
      };
    });
  }

  function buildMonospaceTxt(){
    var EOL = "\r\n";
    var site = (document.getElementById("site")||{}).value || "";
    var date = (document.getElementById("date")||{}).value || "";
    var junction = (document.getElementById("junction")||{}).value || "";
    var arm = (document.getElementById("arm")||{}).value || "";
    var dist = toNumber((document.getElementById("distance")||{}).value || "");

    var rows = collectRows();
    var speeds = rows.map(r => r.mps).filter(Number.isFinite);
    var maxSpd = speeds.length ? Math.max.apply(null, speeds) : NaN;
    var avgSpd = speeds.length ? speeds.reduce((a,b)=>a+b,0)/speeds.length : NaN;
    // Percentiles
    function percentile(sorted, p){
      if (!sorted.length) return NaN;
      var rank = (p/100) * (sorted.length - 1);
      var lo = Math.floor(rank), hi = Math.ceil(rank);
      if (lo === hi) return sorted[lo];
      var t = rank - lo;
      return sorted[lo]*(1-t) + sorted[hi]*t;
    }
    var sorted = speeds.slice().sort((a,b)=>a-b);
    var p85 = percentile(sorted, 85);
    var p15 = percentile(sorted, 15);
    var p05 = percentile(sorted, 5);

    // Header
    var out = [];
    out.push("MOVA SPEED SURVEY v3.3" + EOL);
    out.push("Site: " + site + EOL);
    out.push("Junction: " + junction + EOL);
    out.push("Arm: " + arm + EOL);
    out.push("Date: " + date + EOL);
    out.push("Distance (m): " + (Number.isFinite(dist) ? dist : "") + EOL);
    out.push(EOL);

    // Summary (aligned label column)
    var summary = [
      ["Average speed", fmt(avgSpd,2) + " m/s | " + fmt(mphFrom(avgSpd),2) + " mph"],
      ["85th percentile", fmt(p85,2) + " m/s | " + fmt(mphFrom(p85),2) + " mph"],
      ["15th percentile", fmt(p15,2) + " m/s | " + fmt(mphFrom(p15),2) + " mph"],
      ["5th percentile",  fmt(p05,2) + " m/s | " + fmt(mphFrom(p05),2) + " mph"],
      ["Max speed",       fmt(maxSpd,2) + " m/s | " + fmt(mphFrom(maxSpd),2) + " mph"],
      ["Quality",         chipQualityText()]
    ];
    var maxLabel = summary.reduce((m, r)=>Math.max(m, r[0].length), 0);
    out.push("Results Summary" + EOL);
    summary.forEach(function(row){
      var label = padRight(row[0], maxLabel);
      out.push(label + ": " + row[1] + EOL);
    });
    out.push(EOL);

    // Table
    // Determine widths
    var wIdx = Math.max(1, String(rows.length || 1).length);
    var wTime = Math.max("Time (s)".length, 7);
    var wMps  = Math.max("Speed (m/s)".length, 11);
    var wMph  = Math.max("Speed (mph)".length, 11);

    // Build header and separator
    var header = [
      padRight("#", wIdx),
      padRight("Time (s)", wTime),
      padRight("Speed (m/s)", wMps),
      padRight("Speed (mph)", wMph)
    ].join("  ");
    var sep = [
      "-".repeat(wIdx),
      "-".repeat(wTime),
      "-".repeat(wMps),
      "-".repeat(wMph)
    ].join("  ");
    out.push(header + EOL);
    out.push(sep + EOL);

    // Rows
    rows.forEach(function(r){
      var cIdx = padLeft(r.idx, wIdx);
      var cTime = padLeft(fmt(r.time,2), wTime);
      var cMps  = padLeft(fmt(r.mps,2), wMps);
      var cMph  = padLeft(fmt(r.mph,2), wMph);
      out.push([cIdx, cTime, cMps, cMph].join("  ") + EOL);
    });

    return out.join("");
  }

  function installMonospaceSave(){
    var btn = document.getElementById("saveResultsBtn");
    if (!btn) return;
    btn.addEventListener("click", function(ev){
      try{
        ev.preventDefault(); ev.stopImmediatePropagation();
        var txt = buildMonospaceTxt();
        var site = (document.getElementById("site")||{}).value || "mova_survey";
        var blob = new Blob([txt], {type:"text/plain;charset=utf-8"});
        var a = document.createElement("a");
        a.download = site + "_" + Date.now() + ".txt";
        a.href = URL.createObjectURL(blob);
        a.click();
        URL.revokeObjectURL(a.href);
      }catch(e){ console.error(e); }
    }, true);
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", installMonospaceSave);
  } else {
    installMonospaceSave();
  }
})();


/* === v3.2.7: Force single save handler (remove old listeners) + hard CRLF === */
(function(){
  function installSingleSaveHandler(buildTxtFn){
    var old = document.getElementById("saveResultsBtn");
    if (!old) return;
    // Replace the button node to drop any previously attached listeners
    var parent = old.parentNode;
    var clone = old.cloneNode(true);
    clone.id = "saveResultsBtn"; // keep same id
    parent.replaceChild(clone, old);

    function doSave(ev){
      try{
        ev.preventDefault(); ev.stopImmediatePropagation();
        var txt = buildTxtFn();
        // Ensure literal CRLF newlines in the Blob
        txt = txt.replace(/\r?\n/g, "\r\n");
        var site = (document.getElementById("site")||{}).value || "mova_survey";
        var blob = new Blob([txt], {type:"text/plain;charset=utf-8"});
        var a = document.createElement("a");
        a.download = site + "_" + Date.now() + ".txt";
        a.href = URL.createObjectURL(blob);
        a.click();
        URL.revokeObjectURL(a.href);
      }catch(e){ console.error(e); }
    }
    // Attach our single authoritative handler
    clone.addEventListener("click", doSave, true);
  }

  // If our v3.2.6 builder exists, wire it up via the single handler
  if (typeof window !== "undefined"){
    var install = function(){
      if (typeof buildMonospaceTxt === "function"){
        installSingleSaveHandler(buildMonospaceTxt);
      }
    };
    if (document.readyState === "loading"){
      document.addEventListener("DOMContentLoaded", install);
    } else {
      install();
    }
  }
})();


/* === v3.3: Readable line-by-line save (true CRLF, aligned) === */
(function(){
  function toNumber(x){ const n=Number(x); return Number.isFinite(n)?n:NaN; }
  function fmt(n,d){ return Number.isFinite(n)? n.toFixed(d):""; }
  function mph(mps){ return Number.isFinite(mps)? mps*2.2369362921:NaN; }
  function padR(s,w){ s=String(s); return s.length>=w? s : s+" ".repeat(w-s.length); }
  function padL(s,w){ s=String(s); return s.length>=w? s : " ".repeat(w-s.length)+s; }

  function chipQualityText(){
    const chip=document.getElementById("qualityInline");
    if(!chip) return "—";
    const t=(chip.textContent||"").trim();
    const i=t.indexOf(":");
    return (i>=0?t.slice(i+1):t).trim()||"—";
  }

  function collectRows(){
    const dist=toNumber((document.getElementById("distance")||{}).value||"");
    const trs=Array.from(document.querySelectorAll("#resultsTable tbody tr"));
    return trs.map((tr,i)=>{
      const tds=tr.querySelectorAll("td");
      const t=toNumber((tds[1]?.textContent||"").trim());
      let mps=toNumber((tds[2]?.textContent||"").trim());
      if(!Number.isFinite(mps)&&Number.isFinite(t)&&t>0&&Number.isFinite(dist)) mps=dist/t;
      return { idx:i+1, t, mps, mph:mph(mps) };
    });
  }

  function buildText(){
    const EOL = "\r\n";
    const lines = [];

    const site=(document.getElementById("site")||{}).value||"";
    const junction=(document.getElementById("junction")||{}).value||"";
    const arm=(document.getElementById("arm")||{}).value||"";
    const date=(document.getElementById("date")||{}).value||"";
    const dist=toNumber((document.getElementById("distance")||{}).value||"");

    const rows=collectRows();
    const speeds=rows.map(r=>r.mps).filter(Number.isFinite);
    const maxSpd=speeds.length?Math.max(...speeds):NaN;
    const avg=speeds.length?speeds.reduce((a,b)=>a+b,0)/speeds.length:NaN;
    const sd=(function(){
      if(speeds.length<2) return NaN;
      const m=avg; const v=speeds.reduce((a,b)=>a+(b-m)**2,0)/(speeds.length-1);
      return Math.sqrt(v);
    })();

    const labelW = 18;

    lines.push("MOVA SPEED SURVEY v3.3");
    lines.push("");
    lines.push(padR("Site",labelW)+": "+site);
    lines.push(padR("Junction",labelW)+": "+junction);
    lines.push(padR("Arm",labelW)+": "+arm);
    lines.push(padR("Date",labelW)+": "+date);
    lines.push(padR("Distance (m)",labelW)+": "+(Number.isFinite(dist)?dist:""));
    lines.push(padR("Max speed",labelW)+": "+fmt(maxSpd,2)+" m/s | "+fmt(mph(maxSpd),2)+" mph");
    lines.push("");
    lines.push(padR("Standard deviation (m/s)",labelW)+": "+fmt(sd,3));
    lines.push(padR("Quality",labelW)+": "+chipQualityText());
    lines.push("");

    // Tabular data (tabs + padded numeric columns for monospaced editors)
    const wTime=7, wMps=11, wMph=11;
    lines.push("#\tTime (s)\tSpeed (m/s)\tSpeed (mph)");
    rows.forEach(r=>{
      lines.push(
        r.idx + "\t" +
        padL(fmt(r.t,2), wTime) + "\t" +
        padL(fmt(r.mps,2), wMps) + "\t" +
        padL(fmt(r.mph,2), wMph)
      );
    });

    // Join with TRUE CRLF newlines
    return lines.join(EOL);
  }

  function installSave(){
    const btn=document.getElementById("saveResultsBtn");
    if(!btn) return;
    const parent=btn.parentNode;
    const clone=btn.cloneNode(true);
    parent.replaceChild(clone, btn);

    clone.addEventListener("click", (ev)=>{
      try{
        ev.preventDefault(); ev.stopImmediatePropagation();
        const text = buildText();
        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        const site=(document.getElementById("site")||{}).value||"mova_survey";
        const a=document.createElement("a");
        a.download = site + "_" + Date.now() + ".txt";
        a.href = URL.createObjectURL(blob);
        a.click();
        URL.revokeObjectURL(a.href);
      }catch(e){ console.error(e); }
    }, true);
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", installSave, { once:true });
  } else {
    installSave();
  }
})();
