// ── Leaflet map init, fire data, RAWS markers, layer toggles ──
import { state, RAWS_STATIONS } from './state.js';
import { workerFetch } from './api.js';
import { DIAG } from './diag.js';

let rawsGroup   = null;
let firmsGroup  = null;
let irwinGroup  = null;
let perimGroup  = null;
let userMarker  = null;
let rawsMarkers = {}; // id → L.marker

export function initLeafletMap() {
  DIAG.info('MAP', 'Initializing Leaflet map');
  state.kyMap = L.map('kyMapDiv', { center: [37.4, -83.8], zoom: 7 });
  setTimeout(() => state.kyMap.invalidateSize(), 500);

  L.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; Stadia Maps', maxZoom: 20,
  }).addTo(state.kyMap);

  // Layer groups — each toggleable independently
  perimGroup = L.layerGroup().addTo(state.kyMap);  // perimeters below everything else
  rawsGroup  = L.layerGroup().addTo(state.kyMap);
  firmsGroup = L.layerGroup().addTo(state.kyMap);
  irwinGroup = L.layerGroup().addTo(state.kyMap);

  // User location marker (starts at default, updates on GPS)
  userMarker = L.marker([state.LAT, state.LON], { icon: makeUserIcon() })
    .addTo(state.kyMap)
    .bindPopup(makeUserPopup());

  // Draw all RAWS stations
  renderRawsMarkers();

  DIAG.ok('MAP', 'Leaflet initialized');
  loadFireData();
}

// ── User location marker ──
function makeUserIcon() {
  return L.divIcon({
    html: `<div style="width:12px;height:12px;border-radius:50%;
      background:rgba(0,229,160,.4);border:2px solid #00e5a0;
      box-shadow:0 0 12px rgba(0,229,160,.6)"></div>`,
    className: '', iconAnchor: [6, 6],
  });
}

function makeUserPopup() {
  const src = state.locationSource === 'gps' ? 'GPS location' : 'London KY (default)';
  return `<div style="font-family:monospace;font-size:11px;line-height:1.5">
    <b style="color:#00e5a0">${src}</b><br>
    ${state.LAT.toFixed(4)}°N · ${Math.abs(state.LON).toFixed(4)}°W
  </div>`;
}

export function updateUserMarker(lat, lon) {
  if (!userMarker) return;
  userMarker.setLatLng([lat, lon]);
  userMarker.setPopupContent(makeUserPopup());
}

// ── RAWS station markers ──
function haverMi(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function makeRawsIcon(isActive) {
  return isActive
    ? L.divIcon({
        html: `<div style="width:14px;height:14px;border-radius:50%;
          background:#ffab00;border:2px solid #ff4500;
          box-shadow:0 0 14px rgba(255,171,0,.9)"></div>`,
        className: '', iconAnchor: [7, 7],
      })
    : L.divIcon({
        html: `<div style="width:9px;height:9px;border-radius:50%;
          background:#3d3000;border:1.5px solid #ffab00;
          box-shadow:0 0 5px rgba(255,171,0,.35)"></div>`,
        className: '', iconAnchor: [4, 4],
      });
}

function makeRawsPopup(s) {
  const isActive = state.FEMS_STATION === s.id;
  const distStr  = (state.locationSource === 'gps')
    ? `${haverMi(state.LAT, state.LON, s.lat, s.lon).toFixed(1)} mi from you · ` : '';
  const action   = isActive
    ? `<span style="color:#00e5a0">✓ Currently selected</span>`
    : `<a href="#" onclick="window.changeStation('${s.id}');return false;"
         style="color:#ff4500;text-decoration:none">▶ Use as fuel moisture source</a>`;
  return `<div style="font-family:monospace;font-size:11px;line-height:1.7">
    <b style="color:#ffab00">${s.name}</b><br>
    ${s.agency} · ${s.region}<br>
    <span style="color:#888">${distStr}${s.elev.toLocaleString()} ft elev</span><br>
    ${action}
  </div>`;
}

function renderRawsMarkers() {
  rawsGroup.clearLayers();
  rawsMarkers = {};
  for (const s of RAWS_STATIONS) {
    const m = L.marker([s.lat, s.lon], { icon: makeRawsIcon(s.id === state.FEMS_STATION) })
      .bindPopup(makeRawsPopup(s));
    m.addTo(rawsGroup);
    rawsMarkers[s.id] = m;
  }
}

export function updateMapRawsSelection(id) {
  for (const [sid, marker] of Object.entries(rawsMarkers)) {
    marker.setIcon(makeRawsIcon(sid === id));
    const s = RAWS_STATIONS.find(x => x.id === sid);
    if (s) marker.setPopupContent(makeRawsPopup(s));
  }
}

// ── Layer toggle (called from HTML onclick) ──
export function toggleMapLayer(name, btn) {
  const group = name === 'raws' ? rawsGroup : name === 'firms' ? firmsGroup : name === 'fires' ? irwinGroup : perimGroup;
  if (!group || !state.kyMap) return;
  if (state.kyMap.hasLayer(group)) {
    state.kyMap.removeLayer(group);
    btn.classList.remove('act');
  } else {
    state.kyMap.addLayer(group);
    btn.classList.add('act');
  }
}

// ── Fire data (IRWIN + FIRMS) ──
export async function loadFireData() {
  const statusEl = document.getElementById('mapStatus');
  if (statusEl) statusEl.textContent = 'Loading fire data...';

  firmsGroup.clearLayers();
  irwinGroup.clearLayers();
  perimGroup.clearLayers();
  let fires = 0;

  const [irwinData, firmsData, perimData] = await Promise.all([
    workerFetch('/fires', 'MAP-IRWIN'),
    workerFetch('/firms', 'MAP-FIRMS'),
    workerFetch('/perimeters', 'MAP-PERIM'),
  ]);

  if (irwinData?.features?.length >= 0) {
    DIAG.ok('MAP-IRWIN', `${irwinData.count} IRWIN incidents`);
    const icon = L.divIcon({
      html: `<div style="width:14px;height:14px;border-radius:50%;
        background:#ff2020;border:2px solid #cc0000;
        box-shadow:0 0 10px rgba(255,32,32,.8)"></div>`,
      className: '', iconAnchor: [7, 7],
    });
    L.geoJSON({ type: 'FeatureCollection', features: irwinData.features }, {
      pointToLayer: (_, ll) => L.marker(ll, { icon }),
      onEachFeature: (f, layer) => {
        const p = f.properties;
        layer.bindPopup(`<div style="font-family:monospace;font-size:11px;line-height:1.6">
          <b style="color:#ff2020">🔥 ${p.IncidentName || 'Unnamed Incident'}</b><br>
          Type: ${p.IncidentTypeCategory || '—'}<br>
          Size: ${p.DailyAcres ? p.DailyAcres.toLocaleString() + ' ac' : 'unknown'}<br>
          Contained: ${p.PercentContained != null ? p.PercentContained + '%' : 'unknown'}<br>
          State: ${p.POOState || '—'}
        </div>`);
        fires++;
      },
    }).addTo(irwinGroup);
  }

  if (firmsData?.features?.length >= 0) {
    DIAG.ok('MAP-FIRMS', `${firmsData.count} VIIRS detections`);
    L.geoJSON({ type: 'FeatureCollection', features: firmsData.features }, {
      pointToLayer: (f, ll) => {
        const frp = f.properties.FRP || f.properties.frp || 0;
        const sz  = Math.min(18, 8 + frp / 8);
        return L.marker(ll, {
          icon: L.divIcon({
            html: `<div style="width:${sz}px;height:${sz}px;border-radius:50%;
              background:rgba(255,140,0,.85);border:1px solid #ffaa00;
              box-shadow:0 0 ${sz}px rgba(255,140,0,.7)"></div>`,
            className: '', iconAnchor: [sz/2, sz/2],
          }),
        });
      },
      onEachFeature: (f, layer) => {
        const p = f.properties;
        layer.bindPopup(`<div style="font-family:monospace;font-size:11px;line-height:1.6">
          <b style="color:#ff8c00">🛰️ VIIRS Thermal Detection</b><br>
          Brightness: ${p.BRIGHTNESS || '—'} K<br>
          Fire Power: ${p.FRP || '—'} MW<br>
          Confidence: ${p.CONFIDENCE || '—'}<br>
          Date: ${p.ACQ_DATE || '—'}
        </div>`);
        fires++;
      },
    }).addTo(firmsGroup);
  }

  if (perimData?.features?.length >= 0) {
    DIAG.ok('MAP-PERIM', `${perimData.count} fire perimeters`);
    L.geoJSON({ type: 'FeatureCollection', features: perimData.features }, {
      style: f => {
        const acres = f.properties.acres || 0;
        // Larger fires get more opaque fill
        const fillOpacity = acres > 10000 ? 0.35 : acres > 1000 ? 0.25 : 0.18;
        return {
          color:       '#ff4500',
          weight:      1.5,
          opacity:     0.8,
          fillColor:   '#ff6a00',
          fillOpacity,
          dashArray:   '4 3',
        };
      },
      onEachFeature: (f, layer) => {
        const p = f.properties;
        const acStr  = p.acres != null ? p.acres.toLocaleString() + ' ac' : 'unknown acres';
        const contStr = p.contained != null ? `${p.contained}% contained` : 'containment unknown';
        const discDate = p.discovered
          ? new Date(p.discovered).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : '—';
        layer.bindPopup(`<div style="font-family:monospace;font-size:11px;line-height:1.6">
          <b style="color:#ff4500">🔥 ${p.name}</b><br>
          ${acStr} · ${contStr}<br>
          State: ${p.state} · Type: ${p.type}<br>
          Discovered: ${discDate}
        </div>`);
        layer.on('mouseover', () => layer.setStyle({ fillOpacity: 0.5, weight: 2.5 }));
        layer.on('mouseout',  () => layer.setStyle({
          fillOpacity: (p.acres || 0) > 10000 ? 0.35 : (p.acres || 0) > 1000 ? 0.25 : 0.18,
          weight: 1.5,
        }));
      },
    }).addTo(perimGroup);
  }

  if (statusEl) {
    statusEl.textContent = fires > 0
      ? `${fires} active fire detections in region · Updated ${new Date().toLocaleTimeString()}`
      : `No active fire detections in region · Checked ${new Date().toLocaleTimeString()}`;
  }
}
