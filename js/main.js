// ── Entry point: init, clock, tabs, loadAll, auto-refresh ──
import { state } from './state.js';
import { DIAG, openDiag, closeDiag, copyLog, setSplash, dismissSplash } from './diag.js';
import { fetchNWS } from './wx.js';
import { fetchFEMS, changeStation } from './fems.js';
import { fetchForecast } from './forecast.js';
import { initLeafletMap, loadFireData, toggleMapLayer, swapBasemap, toggleImagery, enterPinMode, toggleRadarPlay, stepRadar } from './map.js';
import { resolveLocation, setManualLocation, clearManualLocation } from './geo.js';
import { recalc } from './calc.js';
import { fetchFireBrief, openBrief, closeBrief } from './firebrief.js';
import { openGlossary, closeGlossary, initGlossary } from './glossary.js';

// ── Clock ──
function tick() {
  const s = new Date().toLocaleTimeString('en-US',{hour12:true,hour:'2-digit',minute:'2-digit',second:'2-digit'})
          + ' · ' + new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  document.getElementById('clk').textContent = s;
  document.getElementById('fTime').textContent = s;
}
setInterval(tick, 1000); tick();

// ── Main data load ──
let loading = false;
export async function loadAll() {
  if (loading) return; // refresh button / timer / pin-drop can overlap
  loading = true;
  const btn = document.getElementById('refBtn');
  if(btn) btn.classList.add('spin');
  DIAG.info('MAIN', `Load started at ${new Date().toISOString()}`);
  DIAG.info('MAIN', `User agent: ${navigator.userAgent.substring(0,80)}`);

  try {
    // Resolve location FIRST so every fetch below uses the right coordinates/RAWS
    setSplash('LOCATING...', 5);
    await resolveLocation();

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
  } catch (e) {
    DIAG.err('MAIN', 'Load failed', e.message);
  } finally {
    if(btn) btn.classList.remove('spin');
    loading = false;
    dismissSplash();
  }
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
  initGlossary();
  initLeafletMap();
  loadAll();
  setInterval(loadAll, 10*60*1000); // auto-refresh every 10 minutes
});

// ── Expose functions needed by inline HTML event handlers ──
window.loadAll           = loadAll;
window.openDiag       = openDiag;
window.closeDiag      = closeDiag;
window.copyLog        = copyLog;
window.changeStation  = changeStation;
window.toggleMapLayer       = toggleMapLayer;
window.toggleImagery        = toggleImagery;
window.enterPinMode         = () => enterPinMode((lat, lon) => { setManualLocation(lat, lon); loadAll(); });
window.useGPS               = () => { clearManualLocation(); loadAll(); };
window.toggleRadarPlay      = toggleRadarPlay;
window.stepRadar            = stepRadar;
window.openBrief      = openBrief;
window.closeBrief     = closeBrief;
window.toggleTheme    = toggleTheme;
window.openGlossary   = openGlossary;
window.closeGlossary  = closeGlossary;
