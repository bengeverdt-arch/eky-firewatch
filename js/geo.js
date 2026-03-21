// ── Browser geolocation + RAWS auto-selection ──
import { state, RAWS_STATIONS } from './state.js';
import { DIAG } from './diag.js';
import { fetchNWS } from './wx.js';
import { fetchForecast } from './forecast.js';
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

export function getLocation() {
  if (!navigator.geolocation) {
    DIAG.warn('GEO', 'Geolocation not supported — using London KY default');
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
    },
    err => {
      DIAG.warn('GEO', `GPS unavailable (${err.message}) — using London KY default`);
    },
    { timeout: 10000, maximumAge: 60000 }
  );
}
