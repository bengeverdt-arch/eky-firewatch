// ── Entry point: init, clock, tabs, loadAll, auto-refresh ──
import { state } from './state.js';
import { DIAG, openDiag, closeDiag, copyLog, setSplash, dismissSplash } from './diag.js';
import { fetchNWS } from './wx.js';
import { fetchFEMS, changeStation } from './fems.js';
import { fetchForecast } from './forecast.js';
import { initLeafletMap, loadFireData, toggleMapLayer } from './map.js';
import { getLocation } from './geo.js';
import { recalc } from './calc.js';
import { fetchFireBrief, openBrief, closeBrief } from './firebrief.js';

// ── Clock ──
function tick() {
  const s = new Date().toLocaleTimeString('en-US',{hour12:true,hour:'2-digit',minute:'2-digit',second:'2-digit'})
          + ' · ' + new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  document.getElementById('clk').textContent = s;
  document.getElementById('fTime').textContent = s;
}
setInterval(tick, 1000); tick();

// ── Wind direction selector (spread panel) ──
function setWD(btn, deg) {
  document.querySelectorAll('#dbtns .dbtn').forEach(b=>b.classList.remove('act'));
  btn.classList.add('act');
  state.windDeg = deg;
  recalc();
}

// ── Main data load ──
export async function loadAll() {
  getLocation();
  const btn = document.getElementById('refBtn');
  if(btn) btn.classList.add('spin');
  DIAG.info('MAIN', `Load started at ${new Date().toISOString()}`);
  DIAG.info('MAIN', `User agent: ${navigator.userAgent.substring(0,80)}`);

  setSplash('FETCHING NWS WEATHER...', 10);
  await fetchNWS();

  setSplash('FETCHING FEMS RAWS DATA...', 40);
  await fetchFEMS();

  setSplash('FETCHING 5-DAY FORECAST...', 60);
  await fetchForecast();

  setSplash('LOADING FIRE MAP...', 80);
  if(state.kyMap) await loadFireData();

  setSplash('LOADING FIRE BRIEF...', 92);
  fetchFireBrief(); // non-blocking — don't await, let it load async

  recalc();
  DIAG.info('MAIN','Load complete');
  if(btn) btn.classList.remove('spin');
  dismissSplash();
}

// ── Init ──
window.addEventListener('DOMContentLoaded', () => {
  DIAG.info('INIT','Dashboard loaded, initializing Leaflet map');
  setSplash('INITIALIZING...', 5);
  initLeafletMap();
  loadAll();
  setInterval(loadAll, 10*60*1000); // auto-refresh every 10 minutes
});

// ── Expose functions needed by inline HTML event handlers ──
window.loadAll        = loadAll;
window.openDiag       = openDiag;
window.closeDiag      = closeDiag;
window.copyLog        = copyLog;
window.setWD          = setWD;
window.changeStation  = changeStation;
window.toggleMapLayer = toggleMapLayer;
window.openBrief      = openBrief;
window.closeBrief     = closeBrief;
