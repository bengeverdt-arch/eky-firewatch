// ── Browser geolocation + RAWS auto-selection ──
import { state, RAWS_STATIONS } from './state.js';
import { DIAG } from './diag.js';
import { fetchNWS } from './wx.js';
import { fetchForecast } from './forecast.js';
import { fetchFuelModel } from './fuelmodel.js';
import { changeStation } from './fems.js';
import { updateUserMarker } from './map.js';

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

// ── Manual location (pin-drop) ──

export async function setManualLocation(lat, lon) {
  state.LAT = lat;
  state.LON = lon;
  state.locationSource = 'manual';
  localStorage.setItem('fwManualLoc', JSON.stringify({ lat, lon }));
  DIAG.ok('GEO', `Manual pin: ${lat.toFixed(4)}, ${lon.toFixed(4)}`);

  const locSub = document.getElementById('wxLocSub');
  if (locSub) locSub.textContent = `${lat.toFixed(3)}°N ${Math.abs(lon).toFixed(3)}°W · Manual`;

  updateUserMarker(lat, lon);

  const userElev = await getUserElevation(lat, lon);

  let best = null, bestScore = Infinity;
  for (const s of RAWS_STATIONS) {
    const score = scoreStation(s, lat, lon, userElev);
    if (score < bestScore) { bestScore = score; best = { ...s }; }
  }
  if (best && best.id !== state.FEMS_STATION) {
    DIAG.ok('GEO', `RAWS auto-select: ${best.name}`);
    await changeStation(best.id);
    const sel = document.getElementById('rawsSelect');
    if (sel) sel.value = best.id;
  }

  await fetchNWS();
  await fetchForecast();
  fetchFuelModel(lat, lon);
}

export async function searchLocation(evt) {
  evt.preventDefault();
  const input = document.getElementById('locSearchInput');
  const query = input?.value?.trim();
  if (!query) return;

  const btn = document.querySelector('.loc-search-btn');
  if (btn) btn.textContent = '…';
  input.disabled = true;

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=1`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const results = await res.json();
    if (!results.length) {
      _showSearchError('No results found');
      return;
    }
    const r   = results[0];
    const lat = parseFloat(r.lat);
    const lon = parseFloat(r.lon);

    // Build a concise place name from address parts
    const a = r.address || {};
    const city  = a.city || a.town || a.village || a.county || r.name || query;
    const state = a.state_code || a.state || '';
    const nameEl = document.getElementById('wxLocName');
    if (nameEl) nameEl.textContent = (city + (state ? `, ${state}` : '')).toUpperCase();

    input.value = '';
    await setManualLocation(lat, lon);
  } catch {
    _showSearchError('Search failed');
  } finally {
    if (btn) btn.textContent = '🔍';
    input.disabled = false;
    input.blur();
  }
}

function _showSearchError(msg) {
  const form = document.getElementById('locSearchForm');
  if (!form) return;
  form.style.position = 'relative';
  let err = form.querySelector('.loc-search-error');
  if (!err) { err = document.createElement('div'); err.className = 'loc-search-error'; form.appendChild(err); }
  err.textContent = msg;
  setTimeout(() => err.remove(), 3000);
}

export function clearManualLocation() {
  localStorage.removeItem('fwManualLoc');
  state.locationSource = 'default';
  DIAG.info('GEO', 'Manual location cleared — requesting GPS');
  getLocation();
}

export function getLocation() {
  // Use saved manual location if present
  const saved = localStorage.getItem('fwManualLoc');
  if (saved) {
    try {
      const { lat, lon } = JSON.parse(saved);
      DIAG.info('GEO', `Restoring saved manual location: ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
      setManualLocation(lat, lon);
      return;
    } catch { localStorage.removeItem('fwManualLoc'); }
  }

  if (!navigator.geolocation) {
    DIAG.warn('GEO', 'Geolocation not supported — using London KY default');
    fetchFuelModel(state.LAT, state.LON);
    return;
  }
  DIAG.info('GEO', 'Requesting GPS location');
  navigator.geolocation.getCurrentPosition(
    async pos => {
      state.LAT = pos.coords.latitude;
      state.LON = pos.coords.longitude;
      state.locationSource = 'gps';
      DIAG.ok('GEO', `GPS: ${state.LAT.toFixed(4)}, ${state.LON.toFixed(4)}`);

      // Update location display
      const locSub = document.getElementById('wxLocSub');
      if (locSub) locSub.textContent =
        `${state.LAT.toFixed(3)}°N ${Math.abs(state.LON).toFixed(3)}°W · GPS`;

      // Update map marker for user's position
      updateUserMarker(state.LAT, state.LON);

      // Get ground elevation for smarter RAWS station matching
      const userElev = await getUserElevation(state.LAT, state.LON);
      if (userElev != null) {
        DIAG.info('GEO', `Ground elevation: ${Math.round(userElev)} ft`);
      } else {
        DIAG.warn('GEO', 'Elevation unavailable — scoring by distance only');
      }

      // Find best RAWS station
      let best = null, bestScore = Infinity;
      for (const s of RAWS_STATIONS) {
        const score = scoreStation(s, state.LAT, state.LON, userElev);
        if (score < bestScore) {
          bestScore = score;
          best = { ...s, distMi: haverMi(state.LAT, state.LON, s.lat, s.lon).toFixed(1) };
        }
      }

      if (best && best.id !== state.FEMS_STATION) {
        const elevStr = userElev != null ? `, your elev ~${Math.round(userElev)} ft` : '';
        DIAG.ok('GEO',
          `Auto-selected RAWS: ${best.name} — ${best.distMi} mi, ${best.elev} ft${elevStr}`);
        await changeStation(best.id);
        // Sync dropdown to match
        const sel = document.getElementById('rawsSelect');
        if (sel) sel.value = best.id;
      }

      // Re-fetch weather for the actual location
      await fetchNWS();
      await fetchForecast();

      // Query LANDFIRE for fuel model at GPS point (READ Option B)
      fetchFuelModel(state.LAT, state.LON);
    },
    err => {
      DIAG.warn('GEO', `GPS unavailable (${err.message}) — using London KY default`);
      fetchFuelModel(state.LAT, state.LON);
    },
    { timeout: 10000, maximumAge: 60000 }
  );
}
