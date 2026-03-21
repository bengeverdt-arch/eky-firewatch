// ── Browser geolocation ──
import { state } from './state.js';
import { DIAG } from './diag.js';
import { fetchNWS } from './wx.js';
import { fetchForecast } from './forecast.js';

export function getLocation() {
  if(!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    async pos => {
      state.LAT = pos.coords.latitude;
      state.LON = pos.coords.longitude;
      state.locationSource = 'gps';
      DIAG.ok('GEO', `Device location: ${state.LAT.toFixed(4)}, ${state.LON.toFixed(4)}`);
      await fetchNWS();
      await fetchForecast();
    },
    () => {
      DIAG.warn('GEO', `Location denied or unavailable — using London KY default`);
    }
  );
}
