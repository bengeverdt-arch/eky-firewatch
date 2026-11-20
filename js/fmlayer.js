// ── Fuel moisture map layers ──
// 1) STATION FM — RAWS dots colored by 10-hr dead fuel moisture (FEMS observed +
//    FEMS forecast, official NFDRS values). 10-hr is the class used in the JKL
//    Red Flag criterion, and it is steadier than the 1-hr daily snapshot.
// 2) 100-HR GRID — USFS WFAS NFDRS 100-hr forecast on the NWS 2.5 km grid.
//    Click a cell: grid 100-hr there + the nearest station's official values.
// Colors are a fixed visual scale of the moisture number — not a danger rating.
import { state, RAWS_STATIONS } from './state.js';
import { workerFetch } from './api.js';
import { DIAG } from './diag.js';
import { setRawsFm, ensureRawsVisible } from './map.js';

// Color stops: [moisture %, rgb]. Drier = redder.
const STOPS = {
  fm10:  [[4, [178, 24, 43]], [8, [239, 108, 0]], [12, [253, 216, 53]], [16, [102, 187, 106]], [22, [30, 136, 229]]],
  fm100: [[8, [178, 24, 43]], [12, [239, 108, 0]], [16, [253, 216, 53]], [20, [102, 187, 106]], [26, [30, 136, 229]]],
};

export function fmRGB(v, kind) {
  const s = STOPS[kind];
  if (v <= s[0][0]) return s[0][1];
  for (let i = 1; i < s.length; i++) {
    if (v <= s[i][0]) {
      const [a, ca] = s[i - 1], [b, cb] = s[i];
      const t = (v - a) / (b - a);
      return ca.map((c, k) => Math.round(c + (cb[k] - c) * t));
    }
  }
  return s[s.length - 1][1];
}
export const fmCss = (v, kind) => `rgb(${fmRGB(v, kind).join(',')})`;

const STALE_MS = 30 * 60 * 1000;
let stationsOn = false, gridOn = false;
let dayIdx = 0;              // 0 = today … 6
let stationData = null, stationAt = 0;
let gridDay0Issued = null;   // YYYY-MM-DD the WFAS grids were produced
const gridCache = {};        // wfas day → { data, at }
let gridOverlay = null, gridShown = null; // shown = grid data on map
let clickBound = false;

const localISO = d => d.toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
function dateForIdx(i) { const d = new Date(); d.setDate(d.getDate() + i); return localISO(d); }
function fmtDate(iso) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
const dayDiff = (a, b) => Math.round((new Date(a + 'T12:00:00') - new Date(b + 'T12:00:00')) / 86400000);

// ── Data ──
async function loadStations() {
  if (stationData && Date.now() - stationAt < STALE_MS) return stationData;
  const ids = RAWS_STATIONS.map(s => s.id).join(',');
  const d = await workerFetch(`/fm-stations?stations=${ids}`, 'FM-STATIONS');
  if (d?.stations) { stationData = d.stations; stationAt = Date.now(); }
  return stationData;
}

async function loadGrid(wfasDay) {
  const c = gridCache[wfasDay];
  if (c && Date.now() - c.at < STALE_MS) return c.data;
  const d = await workerFetch(`/fm-grid?day=${wfasDay}&v=2`, 'FM-GRID');
  if (d?.values) {
    gridCache[wfasDay] = { data: d, at: Date.now() };
    if (wfasDay === 0 && d.issued) gridDay0Issued = d.issued;
  }
  return d;
}

// Station row for a date: FEMS forecast for that day, else nothing
function stationRow(id, iso) {
  const st = stationData?.[id];
  if (!st) return null;
  return st.forecast.find(r => r.date === iso) || null;
}

// ── Rendering ──
function refreshStations() {
  if (!stationsOn || !stationData) { setRawsFm(null); return; }
  const iso = dateForIdx(dayIdx), out = {};
  for (const s of RAWS_STATIONS) {
    const st = stationData[s.id];
    out[s.id] = { day: stationRow(s.id, iso), obs: st?.obs || null, iso,
                  color: v => fmCss(v, 'fm10') };
  }
  setRawsFm(out);
}

function drawGrid(g) {
  const cv = document.createElement('canvas');
  cv.width = g.nx; cv.height = g.ny;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(g.nx, g.ny);
  for (let k = 0; k < g.values.length; k++) {
    const v = g.values[k];
    if (v < 0) continue;
    const [r, gg, b] = fmRGB(v * g.scale, 'fm100');
    img.data[k * 4] = r; img.data[k * 4 + 1] = gg; img.data[k * 4 + 2] = b; img.data[k * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const bounds = [[g.bounds.s, g.bounds.w], [g.bounds.n, g.bounds.e]];
  if (gridOverlay) state.kyMap.removeLayer(gridOverlay);
  gridOverlay = L.imageOverlay(cv.toDataURL(), bounds, {
    opacity: 0.6, pane: 'landfirePave', className: 'fmgrid-img', interactive: false,
    attribution: '<a href="https://www.wfas.net" target="_blank">USFS WFAS</a>',
  }).addTo(state.kyMap);
  gridShown = g;
}

function clearGrid() {
  if (gridOverlay && state.kyMap) state.kyMap.removeLayer(gridOverlay);
  gridOverlay = null; gridShown = null;
}

async function refreshGrid() {
  if (!gridOn) { clearGrid(); return; }
  setGridNote('Loading WFAS grid…');
  if (!gridDay0Issued) await loadGrid(0);
  if (!gridDay0Issued) { clearGrid(); setGridNote('WFAS grid unavailable right now.'); return; }
  const iso = dateForIdx(dayIdx);
  const wfasDay = dayDiff(iso, gridDay0Issued);
  if (wfasDay < 0 || wfasDay > 6) {
    clearGrid(); setGridNote(`No WFAS grid for ${fmtDate(iso)} (latest run ${fmtDate(gridDay0Issued)}).`); return;
  }
  const g = await loadGrid(wfasDay);
  if (!g?.values) { clearGrid(); setGridNote('WFAS grid unavailable right now.'); return; }
  if (!gridOn) return; // toggled off while loading
  drawGrid(g);
  setGridNote(`WFAS run ${fmtDate(g.issued)} · 2.5 km cells · click map for values`);
}

// ── Control panel ──
function setGridNote(t) { const el = document.getElementById('fmGridNote'); if (el) el.textContent = t; }

function legendBar(kind, ticks) {
  const s = STOPS[kind], lo = s[0][0], hi = s[s.length - 1][0];
  const grad = s.map(([v, c]) => `rgb(${c.join(',')}) ${((v - lo) / (hi - lo) * 100).toFixed(0)}%`).join(',');
  const lbls = ticks.map(v => `<span style="left:${((v - lo) / (hi - lo) * 100).toFixed(0)}%">${v}</span>`).join('');
  return `<div class="fmleg-bar" style="background:linear-gradient(90deg,${grad})"></div><div class="fmleg-ticks">${lbls}</div>`;
}

function renderCtrl() {
  const el = document.getElementById('fmCtrl');
  if (!el) return;
  if (!stationsOn && !gridOn) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  document.getElementById('fmDay').textContent =
    (dayIdx === 0 ? 'TODAY · ' : `+${dayIdx}d · `) + fmtDate(dateForIdx(dayIdx));
  document.getElementById('fmPrev').disabled = dayIdx === 0;
  document.getElementById('fmNext').disabled = dayIdx === 6;
  document.getElementById('fmLegSt').style.display = stationsOn ? 'block' : 'none';
  document.getElementById('fmLegGrid').style.display = gridOn ? 'block' : 'none';
}

function buildCtrl() {
  const el = document.getElementById('fmCtrl');
  if (!el || el.dataset.built) return;
  el.dataset.built = '1';
  el.innerHTML = `
    <div class="fmc-head">
      <span class="fmc-title">DEAD FUEL MOISTURE</span>
      <span class="fmc-nav">
        <button id="fmPrev" class="radar-btn" onclick="window.stepFmDay(-1)">◀</button>
        <span id="fmDay" class="fmc-day">—</span>
        <button id="fmNext" class="radar-btn" onclick="window.stepFmDay(1)">▶</button>
      </span>
    </div>
    <div id="fmLegSt" class="fmleg">
      <div class="fmleg-lbl">STATIONS · 10-hr % · FEMS forecast</div>
      ${legendBar('fm10', [4, 8, 12, 16, 22])}
      <div class="fmleg-note">8% = JKL Red Flag 10-hr criterion. Number on dot = 10-hr %.</div>
    </div>
    <div id="fmLegGrid" class="fmleg">
      <div class="fmleg-lbl">GRID · 100-hr % · USFS WFAS forecast</div>
      ${legendBar('fm100', [8, 12, 16, 20, 26])}
      <div class="fmleg-note" id="fmGridNote">—</div>
    </div>
    <div class="fmleg-note">Colors show the moisture number only — not a danger rating.</div>`;
}

// ── Map click → values at point ──
function haverMi(a, b, c, d) {
  const R = 3958.8, r = Math.PI / 180;
  const x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(x));
}

function gridValueAt(g, lat, lon) {
  const B = g.bounds, mY = l => Math.log(Math.tan(Math.PI / 4 + l * Math.PI / 360));
  if (lat < B.s || lat > B.n || lon < B.w || lon > B.e) return null;
  const i = Math.floor((lon - B.w) / (B.e - B.w) * g.nx);
  const j = Math.floor((mY(B.n) - mY(lat)) / (mY(B.n) - mY(B.s)) * g.ny);
  const v = g.values[j * g.nx + i];
  return v >= 0 ? v * g.scale : null;
}

function onMapClick(e) {
  if (!gridOn || !gridShown || state.pinMode) return;
  const { lat, lng } = e.latlng;
  const v = gridValueAt(gridShown, lat, lng);
  const iso = dateForIdx(dayIdx);
  let near = null;
  for (const s of RAWS_STATIONS) {
    const row = stationRow(s.id, iso);
    if (!row) continue;
    const mi = haverMi(lat, lng, s.lat, s.lon);
    if (!near || mi < near.mi) near = { s, row, mi };
  }
  const f = x => x != null ? x.toFixed(1) + '%' : '—';
  const stBlock = near
    ? `<div style="margin-top:6px;border-top:1px solid #444;padding-top:5px">
        <b style="color:#ffab00">Nearest RAWS: ${near.s.name}</b> · ${near.mi.toFixed(0)} mi<br>
        FEMS forecast ${fmtDate(iso)}:<br>
        1-hr ${f(near.row.fm1)} · 10-hr ${f(near.row.fm10)}<br>
        100-hr ${f(near.row.fm100)} · 1000-hr ${f(near.row.fm1000)}
      </div>`
    : `<div style="margin-top:6px;color:#888">No station forecast loaded for this day.</div>`;
  L.popup().setLatLng(e.latlng).setContent(
    `<div style="font-family:monospace;font-size:11px;line-height:1.6;max-width:230px">
      <b style="color:#ff7700">100-hr fuel moisture: ${v != null ? v.toFixed(1) + '%' : 'no data'}</b><br>
      <span style="color:#888">USFS WFAS forecast · ${fmtDate(gridShown.valid || iso)} · 2.5 km cell</span>
      ${stBlock}
      <div style="margin-top:5px;color:#888;font-size:10px">1-hr/10-hr are station values — no official grid exists at this detail.</div>
    </div>`
  ).openOn(state.kyMap);
}

// ── Public ──
export async function toggleFmLayer(which, btn) {
  if (!state.kyMap) return;
  buildCtrl();
  if (!clickBound) { state.kyMap.on('click', onMapClick); clickBound = true; }

  if (which === 'stations') {
    stationsOn = !stationsOn;
    btn?.classList.toggle('act', stationsOn);
    renderCtrl();
    if (stationsOn) {
      ensureRawsVisible();
      await loadStations();
      if (!stationData) DIAG.warn('FM-STATIONS', 'No station FM data');
    }
    refreshStations();
  } else if (which === 'grid') {
    gridOn = !gridOn;
    btn?.classList.toggle('act', gridOn);
    renderCtrl();
    if (gridOn) loadStations().then(() => {}); // nearest-station values for click popups
    await refreshGrid();
  }
}

export async function stepFmDay(dir) {
  dayIdx = Math.max(0, Math.min(6, dayIdx + dir));
  renderCtrl();
  if (stationsOn) { await loadStations(); refreshStations(); }
  await refreshGrid();
}
