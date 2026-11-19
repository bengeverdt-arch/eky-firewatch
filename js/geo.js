// ── Browser geolocation + RAWS auto-selection ──
// resolveLocation() only decides WHERE (state.LAT/LON + RAWS station).
// loadAll() in main.js does all data fetching afterward, once, in order.
import { state, RAWS_STATIONS } from './state.js';
import { DIAG } from './diag.js';
import { updateUserMarker, updateMapRawsSelection } from './map.js';

const DEFAULT_LOC = { lat: 37.129, lon: -84.083 }; // London, KY

function haverMi(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

async function getUserElevation(lat, lon) {
  try {
    const res = await fetch(
      `https://epqs.nationalmap.gov/v1/json?x=${lon}&y=${lat}&wkid=4326&includeDate=false`
    );
    if (!res.ok) return null;
    const d = await res.json();
    const v = parseFloat(d.value);
    return isNaN(v) ? null : v; // elevation in feet
  } catch {
    return null;
  }
}

// Score a RAWS station by distance + elevation match.
// Lower score = better fit.
// Elevation diff of 300 ft counts as 1 extra mile in the score.
function scoreStation(s, lat, lon, userElev) {
  const distMi   = haverMi(lat, lon, s.lat, s.lon);
  const elevDiff = userElev != null ? Math.abs(s.elev - userElev) / 300 : 0;
  return distMi + elevDiff;
}

function gpsPosition() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      pos => resolve(pos),
      err => { DIAG.warn('GEO', `GPS unavailable (${err.message}) — using London KY default`); resolve(null); },
      { timeout: 10000, maximumAge: 60000 }
    );
  });
}

// Pick best RAWS for the current location (no fetch — loadAll fetches FEMS after)
async function selectRaws() {
  const userElev = await getUserElevation(state.LAT, state.LON);
  if (userElev != null) DIAG.info('GEO', `Ground elevation: ${Math.round(userElev)} ft`);
  else DIAG.warn('GEO', 'Elevation unavailable — scoring by distance only');

  let best = null, bestScore = Infinity;
  for (const s of RAWS_STATIONS) {
    const score = scoreStation(s, state.LAT, state.LON, userElev);
    if (score < bestScore) { bestScore = score; best = s; }
  }
  if (best && best.id !== state.FEMS_STATION) {
    const distMi  = haverMi(state.LAT, state.LON, best.lat, best.lon).toFixed(1);
    const elevStr = userElev != null ? `, your elev ~${Math.round(userElev)} ft` : '';
    DIAG.ok('GEO', `Auto-selected RAWS: ${best.name} — ${distMi} mi, ${best.elev} ft${elevStr}`);
    state.FEMS_STATION = best.id;
    updateMapRawsSelection(best.id);
    const sel = document.getElementById('rawsSelect');
    if (sel) sel.value = best.id;
  }
}

// Decide location: saved manual pin → GPS → London default.
// RAWS auto-select only runs when the location actually moved, so a station
// the user picked by hand survives the 10-minute refresh.
export async function resolveLocation() {
  const prev = { lat: state.LAT, lon: state.LON, src: state.locationSource };

  let loc = null, src = 'default';
  const saved = localStorage.getItem('fwManualLoc');
  if (saved) {
    try {
      const { lat, lon } = JSON.parse(saved);
      if (typeof lat === 'number' && typeof lon === 'number') { loc = { lat, lon }; src = 'manual'; }
    } catch { localStorage.removeItem('fwManualLoc'); }
  }
  if (!loc) {
    DIAG.info('GEO', 'Requesting GPS location');
    const pos = await gpsPosition();
    if (pos) { loc = { lat: pos.coords.latitude, lon: pos.coords.longitude }; src = 'gps'; }
  }
  if (!loc) loc = DEFAULT_LOC;

  state.LAT = loc.lat;
  state.LON = loc.lon;
  state.locationSource = src;
  if (src !== 'default') DIAG.ok('GEO', `${src === 'gps' ? 'GPS' : 'Manual pin'}: ${loc.lat.toFixed(4)}, ${loc.lon.toFixed(4)}`);

  updateUserMarker(state.LAT, state.LON);

  const moved = !state._located || src !== prev.src ||
    haverMi(prev.lat, prev.lon, state.LAT, state.LON) > 0.5;
  state._located = true;
  if (moved) await selectRaws();
}

// ── Manual location (pin-drop) ──
export function setManualLocation(lat, lon) {
  localStorage.setItem('fwManualLoc', JSON.stringify({ lat, lon }));
  DIAG.ok('GEO', `Manual pin saved: ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
}

export function clearManualLocation() {
  localStorage.removeItem('fwManualLoc');
  DIAG.info('GEO', 'Manual location cleared — requesting GPS');
}
