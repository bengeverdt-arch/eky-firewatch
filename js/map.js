// ── Leaflet map init + IRWIN/FIRMS fire data rendering ──
import { state } from './state.js';
import { workerFetch } from './api.js';
import { DIAG } from './diag.js';

export function initLeafletMap() {
  DIAG.info('MAP','Initializing Leaflet map');
  state.kyMap = L.map('kyMapDiv', {center:[37.5,-84.5], zoom:7});
  setTimeout(() => state.kyMap.invalidateSize(), 500);
  L.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; Stadia Maps',
    maxZoom: 20
  }).addTo(state.kyMap);

  // EKY ops area outline
  L.rectangle([[36.8,-85.1],[38.1,-82.2]], {
    color:'rgba(255,69,0,.45)', weight:1.5, fillColor:'rgba(255,69,0,.035)',
    fillOpacity:1, dashArray:'6,4'
  }).addTo(state.kyMap).bindPopup('<b style="font-family:monospace">EAST KY OPS AREA</b>');

  // London KY base marker
  const gIcon = L.divIcon({
    html:`<div style="width:12px;height:12px;border-radius:50%;background:rgba(0,229,160,.4);border:2px solid #00e5a0;box-shadow:0 0 12px rgba(0,229,160,.6)"></div>`,
    className:'', iconAnchor:[6,6]
  });
  L.marker([state.LAT, state.LON], {icon:gIcon}).addTo(state.kyMap)
   .bindPopup('<b style="font-family:monospace;color:#00e5a0">London, KY (Base)</b><br><span style="font-family:monospace;font-size:11px">Laurel County · 37.129°N 84.083°W</span>');

  // RAWS station marker
  const rIcon = L.divIcon({
    html:`<div style="width:10px;height:10px;border-radius:50%;background:#ffab00;border:2px solid #ff4500;box-shadow:0 0 8px rgba(255,171,0,.7)"></div>`,
    className:'', iconAnchor:[5,5]
  });
  L.marker([37.20,-84.10], {icon:rIcon}).addTo(state.kyMap)
   .bindPopup(`<b style="font-family:monospace;color:#ffab00">FEMS RAWS #${state.FEMS_STATION}</b><br><span style="font-family:monospace;font-size:11px">Daniel Boone NF area · Fuel moisture source</span>`);

  DIAG.ok('MAP','Leaflet initialized, loading fire data');
  loadFireData();
}

export async function loadFireData() {
  document.getElementById('mapStatus').textContent = 'Loading fire incident data from Worker...';
  let fires = 0;

  // NIFC IRWIN incidents
  const irwinData = await workerFetch('/fires', 'MAP-IRWIN');
  if(irwinData?.features?.length >= 0) {
    DIAG.ok('MAP-IRWIN', `${irwinData.count} IRWIN incidents`);
    const icon = L.divIcon({
      html:`<div style="width:14px;height:14px;border-radius:50%;background:#ff2020;border:2px solid #cc0000;box-shadow:0 0 10px rgba(255,32,32,.8)"></div>`,
      className:'', iconAnchor:[7,7]
    });
    L.geoJSON({type:'FeatureCollection',features:irwinData.features},{
      pointToLayer: (_,ll) => L.marker(ll,{icon}),
      onEachFeature: (f,layer) => {
        const p = f.properties;
        layer.bindPopup(`<div style="font-family:monospace;font-size:11px;line-height:1.6"><b style="color:#ff2020">🔥 ${p.IncidentName||'Unnamed'}</b><br>Type: ${p.IncidentTypeCategory||'—'}<br>Size: ${p.IncidentSize?p.IncidentSize.toLocaleString()+' ac':'unknown'}<br>Contained: ${p.PercentContained!=null?p.PercentContained+'%':'unknown'}<br>County: ${p.POOCounty||'—'}</div>`);
        fires++;
      }
    }).addTo(state.kyMap);
  }

  // NASA FIRMS VIIRS hotspots
  const firmsData = await workerFetch('/firms', 'MAP-FIRMS');
  if(firmsData?.features?.length >= 0) {
    DIAG.ok('MAP-FIRMS', `${firmsData.count} VIIRS thermal detections`);
    L.geoJSON({type:'FeatureCollection',features:firmsData.features},{
      pointToLayer: (f,ll) => {
        const frp = f.properties.frp||0;
        const sz  = Math.min(18, 8+frp/8);
        const icon = L.divIcon({
          html:`<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:rgba(255,140,0,.85);border:1px solid #ffaa00;box-shadow:0 0 ${sz}px rgba(255,140,0,.7)"></div>`,
          className:'', iconAnchor:[sz/2,sz/2]
        });
        return L.marker(ll,{icon});
      },
      onEachFeature: (f,layer) => {
        const p    = f.properties;
        const date = p.acq_date?new Date(p.acq_date).toLocaleDateString():'—';
        layer.bindPopup(`<div style="font-family:monospace;font-size:11px;line-height:1.6"><b style="color:#ff8c00">🛰️ VIIRS Thermal Detection</b><br>Brightness: ${p.bright_ti4||'—'} K<br>Fire Power: ${p.frp||'—'} MW<br>Confidence: ${p.confidence||'—'}<br>Date: ${date}</div>`);
        fires++;
      }
    }).addTo(state.kyMap);
  }

  document.getElementById('mapStatus').textContent = fires > 0
    ? `${fires} active detections in Kentucky · Last updated: ${new Date().toLocaleTimeString()}`
    : `✓ No active fire detections in Kentucky · Last checked: ${new Date().toLocaleTimeString()}`;
}
