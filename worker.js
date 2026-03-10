/**
 * EKY Fire Watch — Cloudflare Worker Backend
 * ============================================
 * DEPLOY INSTRUCTIONS:
 *  1. Go to https://dash.cloudflare.com → Workers & Pages → Create Worker
 *  2. Delete all the default code in the editor
 *  3. Paste this entire file
 *  4. Click "Save and Deploy"
 *  5. Copy your Worker URL (looks like: https://eky-fire-watch.YOUR-NAME.workers.dev)
 *  6. Paste that URL into the dashboard HTML where it says WORKER_URL
 *
 * ENDPOINTS THIS WORKER PROVIDES:
 *  GET /nws    → Live weather observation for London KY (NWS)
 *  GET /fems   → Dead fuel moisture + NFDRS from RAWS station 12120
 *  GET /alerts → Active NWS fire weather alerts for London KY
 *  GET /fires  → Active fire incidents (NIFC IRWIN) for East KY region
 *  GET /firms  → NASA FIRMS VIIRS thermal hotspots for East KY region
 *  GET /health → Simple health check
 */

const LAT = 37.129;
const LON = -84.083;
const FEMS_STATION = 12120;

// CORS headers — allows any webpage to call this Worker
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

function err(message, detail = '', status = 500) {
  return json({ error: true, message, detail }, status);
}

// ─────────────────────────────────────────────
// ROUTING
// ─────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle preflight CORS requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    // Cache layer — reuse responses for 8 minutes to avoid hammering source APIs
    const cache = caches.default;
    const cacheKey = new Request(url.toString());
    const cached = await cache.match(cacheKey);
    if (cached) {
      const resp = new Response(cached.body, cached);
      resp.headers.set('X-Cache', 'HIT');
      return resp;
    }

    let response;
    try {
      switch (url.pathname) {
        case '/nws':    response = await handleNWS();    break;
        case '/fems':   response = await handleFEMS();   break;
        case '/alerts': response = await handleAlerts(); break;
        case '/fires':  response = await handleFires();  break;
        case '/firms':  response = await handleFIRMS();  break;
        case '/health': response = json({ ok: true, ts: new Date().toISOString() }); break;
        default:
          response = json({
            name: 'EKY Fire Watch API',
            version: '1.0',
            endpoints: ['/nws', '/fems', '/alerts', '/fires', '/firms', '/health']
          });
      }
    } catch (e) {
      response = err('Unhandled server error', e.message);
    }

    // Cache successful responses for 8 minutes
    if (response.status === 200) {
      const toCache = response.clone();
      ctx.waitUntil(
        cache.put(cacheKey, new Response(toCache.body, {
          ...toCache,
          headers: { ...Object.fromEntries(toCache.headers), 'Cache-Control': 'max-age=480' }
        }))
      );
    }

    response.headers.set('X-Cache', 'MISS');
    return response;
  }
};

// ─────────────────────────────────────────────
// NWS WEATHER
// ─────────────────────────────────────────────
async function handleNWS() {
  // Step 1: find grid + nearest observation station
  const ptRes = await fetch(`https://api.weather.gov/points/${LAT},${LON}`, {
    headers: { 'User-Agent': 'EKY-FireWatch/1.0 (cloudflare-worker)' }
  });
  if (!ptRes.ok) return err('NWS points lookup failed', `HTTP ${ptRes.status}`);
  const ptData = await ptRes.json();

  const stationsUrl = ptData?.properties?.observationStations;
  if (!stationsUrl) return err('No observation stations URL from NWS');

  // Step 2: get nearest station ID
  const stRes = await fetch(stationsUrl, {
    headers: { 'User-Agent': 'EKY-FireWatch/1.0 (cloudflare-worker)' }
  });
  if (!stRes.ok) return err('NWS stations list failed', `HTTP ${stRes.status}`);
  const stData = await stRes.json();

  const station = stData?.features?.[0];
  if (!station) return err('No stations found near London KY');

  const sid   = station.properties.stationIdentifier;
  const sname = station.properties.name;

  // Step 3: latest observation
  const obsRes = await fetch(`https://api.weather.gov/stations/${sid}/observations/latest`, {
    headers: { 'User-Agent': 'EKY-FireWatch/1.0 (cloudflare-worker)' }
  });
  if (!obsRes.ok) return err('NWS observations failed', `HTTP ${obsRes.status}`);
  const obsData = await obsRes.json();
  const obs = obsData?.properties;
  if (!obs) return err('No observation properties in NWS response');

  // Convert and clean up values
  const C2F = c => c != null ? Math.round(c * 9 / 5 + 32) : null;
  const mps2mph = m => m != null ? Math.round(m * 2.237) : null;
  const m2in = m => m != null ? Math.round(m * 39.3701 * 100) / 100 : null;

  return json({
    station: { id: sid, name: sname },
    timestamp: obs.timestamp,
    temp:    C2F(obs.temperature?.value),
    rh:      obs.relativeHumidity?.value != null ? Math.round(obs.relativeHumidity.value) : null,
    wind:    mps2mph(obs.windSpeed?.value),
    gust:    mps2mph(obs.windGust?.value),
    windDir: obs.windDirection?.value,
    dew:     C2F(obs.dewpoint?.value),
    precip:  m2in(obs.precipitationLastHour?.value),
    pressure: obs.barometricPressure?.value,
    visibility: obs.visibility?.value,
    rawText: obs.rawMessage,
  });
}

// ─────────────────────────────────────────────
// FEMS RAWS — DEAD FUEL MOISTURE + NFDRS
// ─────────────────────────────────────────────
async function handleFEMS() {
  const now   = new Date();
  const end   = now.toISOString().slice(0, 10);
  const start = new Date(now - 5 * 86400000).toISOString().slice(0, 10);
  const url   = `https://fems.fs2c.usda.gov/api/ext-climatology/download-nfdr-daily-summary/?dataset=observation&startDate=${start}&endDate=${end}&dataFormat=csv&stationIds=${FEMS_STATION}&fuelModels=Y`;

  const res = await fetch(url);
  if (!res.ok) return err('FEMS fetch failed', `HTTP ${res.status}`);

  const csv = await res.text();
  if (!csv || csv.length < 50) return err('FEMS returned empty response');

  const lines = csv.trim().split('\n').filter(l => l.trim().length > 0);
  if (lines.length < 2) return err('FEMS CSV has no data rows', `Got ${lines.length} lines`);

  // Parse CSV
  const header = lines[0].replace(/"/g, '').split(',').map(h => h.trim());
  const ci = name => header.findIndex(h => h === name);

  // Use the most recent row (last line)
  const row = lines[lines.length - 1].replace(/"/g, '').split(',');
  const getV = name => {
    const i = ci(name);
    return i >= 0 && row[i] && row[i] !== '' ? parseFloat(row[i]) : null;
  };

  return json({
    stationName: row[0] || 'Unknown',
    stationId:   FEMS_STATION,
    obsDate:     row[1] || '',
    header:      header, // include so dashboard can debug column names if needed
    fm1hr:   getV('1HrFM'),
    fm10hr:  getV('10HrFM'),
    fm100hr: getV('100HrFM'),
    fm1000hr:getV('1000HrFM'),
    erc:     getV('ERC'),
    bi:      getV('BI'),
    kbdi:    getV('KBDI'),
    ic:      getV('IC'),
    sc:      getV('SC'),
    fuelModel: row[ci('FuelModel')] || null,
  });
}

// ─────────────────────────────────────────────
// NWS ALERTS
// ─────────────────────────────────────────────
async function handleAlerts() {
  const res = await fetch(`https://api.weather.gov/alerts/active?point=${LAT},${LON}`, {
    headers: { 'User-Agent': 'EKY-FireWatch/1.0 (cloudflare-worker)' }
  });
  if (!res.ok) return err('NWS alerts failed', `HTTP ${res.status}`);
  const data = await res.json();

  const alerts = (data.features || []).map(f => ({
    event:    f.properties.event,
    headline: f.properties.headline,
    severity: f.properties.severity,
    urgency:  f.properties.urgency,
    onset:    f.properties.onset,
    expires:  f.properties.expires,
    isFire:   /fire|red flag/i.test(f.properties.event),
  }));

  return json({ count: alerts.length, alerts });
}

// ─────────────────────────────────────────────
// NIFC IRWIN — ACTIVE FIRE INCIDENTS
// ─────────────────────────────────────────────
async function handleFires() {
  // Bounding box covering Kentucky + surrounding region
  const bbox = '-89,36,-81,39';
  const url = `https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/Active_Fires/FeatureServer/0/query?where=1%3D1&outFields=IncidentName,IncidentTypeCategory,PercentContained,DailyAcres,FireBehaviorGeneral,POOState,UniqueFireIdentifier&geometry=${bbox}&geometryType=esriGeometryEnvelope&spatialRel=esriSpatialRelIntersects&outSR=4326&f=geojson`;

  const res = await fetch(url);
  if (!res.ok) return err('NIFC IRWIN fetch failed', `HTTP ${res.status}`);

  const geojson = await res.json();
  if (!geojson?.features) return err('NIFC returned invalid GeoJSON');

  return json({
    count: geojson.features.length,
    features: geojson.features,
    type: 'FeatureCollection',
    source: 'NIFC IRWIN Active Fires',
    fetched: new Date().toISOString(),
  });
}

// ─────────────────────────────────────────────
// NASA FIRMS — VIIRS THERMAL HOTSPOTS
// ─────────────────────────────────────────────
async function handleFIRMS() {
  const bbox = '-89,36,-81,39';
  const url = `https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/VIIRS_Thermal_Hotspots_and_Fire_Activity/FeatureServer/0/query?where=1%3D1&outFields=BRIGHTNESS,FRP,DAYNIGHT,ACQ_DATE,CONFIDENCE&geometry=${bbox}&geometryType=esriGeometryEnvelope&spatialRel=esriSpatialRelIntersects&outSR=4326&f=geojson`;

  const res = await fetch(url);
  if (!res.ok) return err('NASA FIRMS fetch failed', `HTTP ${res.status}`);

  const geojson = await res.json();
  if (!geojson?.features) return err('FIRMS returned invalid GeoJSON');

  return json({
    count: geojson.features.length,
    features: geojson.features,
    type: 'FeatureCollection',
    source: 'NASA FIRMS VIIRS',
    fetched: new Date().toISOString(),
  });
}
