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

  detailsErrors.classList.toggle('show', !ok);
  return ok;
}
function formIsValid() { return validateFields(); }

function updateTabVisibility() {
  var detailsOK = formIsValid();
  setDisabled(measureTabBtn, !detailsOK);
  setDisabled(gotoMeasureBtn, !detailsOK);
  detailsHint.textContent = detailsOK ? 'Details complete. Proceed to Measurements.' : 'Fill all fields to unlock Measurements.';
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

var BASE_W = 460, BASE_H = 240, BASE_RATIO = BASE_H / BASE_W;
function resizeCanvas(){
  if (!canvas || !canvasWrap) return;
  var dpr = window.devicePixelRatio || 1;
  var cssWidth = canvasWrap.clientWidth;
  var cssHeight = Math.round(cssWidth * BASE_RATIO);

  canvas.style.width = cssWidth + 'px';
  canvas.style.height = cssHeight + 'px';

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

function drawLines(lines) {
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.font = '16px monospace';
  ctx.fillStyle = '#000';
  var hasIntro = (measurements.length === 0);
  var y = hasIntro ? 24 : 12;
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

  var shown = Math.min(8, measurements.length);
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
  showTab('detailsTab');
}
window.addEventListener('resize', resizeCanvas, false);
document.addEventListener('visibilitychange', function(){ if (!document.hidden) resizeCanvas(); }, false);
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', onReady, false);
} else {
  onReady();
}
