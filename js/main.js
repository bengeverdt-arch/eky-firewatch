// ── Entry point: init, clock, tabs, loadAll, auto-refresh ──
import { state } from './state.js';
import { DIAG, openDiag, closeDiag, copyLog, setSplash, dismissSplash } from './diag.js';
import { fetchNWS } from './wx.js';
import { fetchFEMS, changeStation } from './fems.js';
import { fetchForecast } from './forecast.js';
import { initLeafletMap, loadFireData, toggleMapLayer, swapBasemap, toggleImagery, enterPinMode, toggleRadarPlay, stepRadar } from './map.js';
import { getLocation, setManualLocation, clearManualLocation, searchLocation } from './geo.js';
import { recalc } from './calc.js';
import { fetchFireBrief, openBrief, closeBrief } from './firebrief.js';
import { computeRead, openRead, closeRead, setSlopeRead, clearReadIgnition, setFuelOverride } from './read.js';

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
  computeRead();
  DIAG.info('MAIN','Load complete');
  if(btn) btn.classList.remove('spin');
  dismissSplash();
}

// ── Theme toggle ──
function toggleTheme() {
  const isLight = document.documentElement.classList.toggle('light');
  localStorage.setItem('fwTheme', isLight ? 'light' : 'dark');
  document.getElementById('themeBtn').textContent = isLight ? '🌙 NIGHT MODE' : '☀ DAY MODE';
  swapBasemap(isLight);
}

// ── Init ──
window.addEventListener('DOMContentLoaded', () => {
  // Restore saved theme before map init so basemap starts correct
  if (localStorage.getItem('fwTheme') === 'light') {
    document.documentElement.classList.add('light');
    document.getElementById('themeBtn').textContent = '🌙 NIGHT MODE';
  }

  DIAG.info('INIT','Dashboard loaded, initializing Leaflet map');
  setSplash('INITIALIZING...', 5);
  initLeafletMap();
  loadAll();
  setInterval(loadAll, 10*60*1000); // auto-refresh every 10 minutes
});

// ── Expose functions needed by inline HTML event handlers ──
window.loadAll           = loadAll;
window.openRead          = openRead;
window.closeRead         = closeRead;
window.setSlopeRead      = setSlopeRead;
window.clearReadIgnition = clearReadIgnition;
window.setFuelOverride   = setFuelOverride;
window.openDiag       = openDiag;
window.closeDiag      = closeDiag;
window.copyLog        = copyLog;
window.setWD          = setWD;
window.changeStation  = changeStation;
window.toggleMapLayer       = toggleMapLayer;
window.toggleImagery        = toggleImagery;
window.enterPinMode         = () => enterPinMode(setManualLocation);
window.useGPS               = clearManualLocation;
window.searchLocation       = searchLocation;
window.toggleRadarPlay      = toggleRadarPlay;
window.stepRadar            = stepRadar;
window.openBrief      = openBrief;
window.closeBrief     = closeBrief;
window.toggleTheme    = toggleTheme;
