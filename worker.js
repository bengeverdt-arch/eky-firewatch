/**
 * EKY Fire Watch - Cloudflare Worker Backend  v2.2
 * =================================================
 * DEPLOY: Paste into Cloudflare Workers dashboard and Save & Deploy.
 *
 * ENDPOINTS:
 *  GET /nws?lat=&lon=      → Multi-station composite weather (NWS + METAR fallback)
 *  GET /fems?station=      → Dead fuel moisture + NFDRS from RAWS (latest obs + FEMS forecast)
 *  GET /forecast?lat=&lon= → NWS 5-day fire weather forecast
 *  GET /alerts?lat=&lon=   → Active NWS fire weather alerts
 *  GET /fires              → Active fire incidents (NIFC IRWIN)
 *  GET /firms              → NASA FIRMS VIIRS thermal hotspots
 *  GET /perimeters         → Fire perimeters year-to-date (NIFC WFIGS)
 *  GET /fire-brief?lat=&lon= → NWS FWF text product, filtered to the location's fire wx zone
 *  GET /fems-clim?station=&date= → 20-yr ERC/BI history for ±15 days around date
 *  GET /fm-stations?stations=a,b → Dead FM obs + FEMS forecast for many RAWS at once
 *  GET /fm-grid?day=0..6     → WFAS 2.5 km 100-hr dead FM forecast grid, clipped to KY
 *  GET /health               → Health check
 */

const DEFAULT_LAT = 37.129;
const DEFAULT_LON = -84.083;
const NWS_UA = 'EKY-FireWatch/2.0 (cloudflare-worker)';

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

function getCoords(url) {
  const lat = parseFloat(url.searchParams.get('lat')) || DEFAULT_LAT;
  const lon = parseFloat(url.searchParams.get('lon')) || DEFAULT_LON;
  return { lat, lon };
}

// Haversine distance in miles
function haverDist(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

// Unit conversions
const C2F    = c => c != null ? Math.round(c * 9/5 + 32) : null;
const kt2mph = k => k != null ? Math.round(k * 1.15078) : null;
const m2in   = m => m != null ? Math.round(m * 39.3701 * 100) / 100 : null;
// NWS sometimes reports precipitationLastHour in mm instead of m — handle both
function nwsPrecip2in(obs) {
  if (!obs) return null;
  const v = obs.value;
  if (v == null) return null;
  const unit = obs.unitCode || '';
  const inches = unit.includes('mm')
    ? Math.round(v * 0.0393701 * 100) / 100
    : Math.round(v * 39.3701 * 100) / 100;
  // >3 in/hr is physically implausible for EKY — treat as bad sensor, skip station
  return inches > 3 ? null : inches;
}

// NWS changed wind speed unit from m/s to km/h - handle both
function nwsSpeed2mph(obs) {
  if (!obs) return null;
  const v = obs.value;
  if (v == null) return null;
  const unit = obs.unitCode || '';
  if (unit.includes('km_h') || unit.includes('km/h')) return Math.round(v * 0.621371);
  return Math.round(v * 2.237); // assume m/s
}

// Relative humidity from temp + dewpoint (Celsius), Magnus formula
function rhFromTD(t, td) {
  if (t == null || td == null) return null;
  const v = 100 * Math.exp(17.625 * td / (243.04 + td)) / Math.exp(17.625 * t / (243.04 + t));
  return Math.round(Math.min(100, Math.max(0, v)));
}

// Cache TTL per endpoint (seconds)
const CACHE_TTL = {
  '/nws':        480,   // 8 min
  '/fems':       480,   // 8 min
  '/forecast':   1800,  // 30 min
  '/alerts':     300,   // 5 min
  '/fires':      600,   // 10 min
  '/firms':      600,   // 10 min
  '/perimeters': 1800,  // 30 min - perimeters change slowly
  '/fire-brief':  1800,  // 30 min
  '/fems-clim':   86400, // 24 hr - history only changes once a year
  '/fm-stations': 1800,  // 30 min - FEMS daily obs + forecast
  '/fm-grid':     10800, // 3 hr - WFAS grids regenerate once a day
};

// ─────────────────────────────────────────────
// ROUTING
// ─────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const cache    = caches.default;
    const cacheKey = new Request(url.toString());
    const cached   = await cache.match(cacheKey);
    if (cached) {
      const resp = new Response(cached.body, cached);
      resp.headers.set('X-Cache', 'HIT');
      return resp;
    }

    let response;
    try {
      switch (url.pathname) {
        case '/nws':        response = await handleNWS(url);        break;
        case '/fems':       response = await handleFEMS(url);       break;
        case '/forecast':   response = await handleForecast(url);   break;
        case '/alerts':     response = await handleAlerts(url);     break;
        case '/fires':      response = await handleFires();         break;
        case '/firms':      response = await handleFIRMS();         break;
        case '/perimeters': response = await handlePerimeters();    break;
        case '/fire-brief':  response = await handleFireBrief(url);   break;
        case '/fems-clim':   response = await handleFemsClim(url);   break;
        case '/fm-stations': response = await handleFmStations(url); break;
        case '/fm-grid':     response = await handleFmGrid(url);     break;
        case '/health':      response = json({ ok: true, ts: new Date().toISOString(), version: '2.2' }); break;
        default:
          response = json({
            name: 'EKY Fire Watch API', version: '2.2',
            endpoints: ['/nws', '/fems', '/forecast', '/alerts', '/fires', '/firms', '/perimeters', '/fire-brief', '/fems-clim', '/fm-stations', '/fm-grid', '/health'],
          });
      }
    } catch (e) {
      response = err('Unhandled server error', e.message);
    }

    if (response.status === 200) {
      const ttl     = CACHE_TTL[url.pathname] || 480;
      const toCache = response.clone();
      ctx.waitUntil(
        cache.put(cacheKey, new Response(toCache.body, {
          ...toCache,
          headers: { ...Object.fromEntries(toCache.headers), 'Cache-Control': `max-age=${ttl}` },
        }))
      );
    }

    response.headers.set('X-Cache', 'MISS');
    return response;
  },
};

// ─────────────────────────────────────────────
// NWS MULTI-STATION COMPOSITE WEATHER
// ─────────────────────────────────────────────
async function handleNWS(url) {
  const { lat, lon } = getCoords(url);

  // Step 1: NWS grid → nearest observation stations list
  const ptRes = await fetch(`https://api.weather.gov/points/${lat},${lon}`,
    { headers: { 'User-Agent': NWS_UA } });
  if (!ptRes.ok) return err('NWS points lookup failed', `HTTP ${ptRes.status}`);
  const ptData = await ptRes.json();

  const stationsUrl = ptData?.properties?.observationStations;
  if (!stationsUrl) return err('No observation stations URL from NWS');

  const stRes = await fetch(stationsUrl, { headers: { 'User-Agent': NWS_UA } });
  if (!stRes.ok) return err('NWS stations list failed', `HTTP ${stRes.status}`);
  const stData = await stRes.json();

  const features = (stData?.features || []).slice(0, 8);
  if (!features.length) return err('No stations found near location');

  // Step 2: Metadata + distance for each station
  const stationMeta = features.map(f => ({
    id:     f.properties.stationIdentifier,
    name:   f.properties.name,
    lat:    f.geometry?.coordinates?.[1] ?? null,
    lon:    f.geometry?.coordinates?.[0] ?? null,
    distMi: f.geometry?.coordinates
      ? haverDist(lat, lon, f.geometry.coordinates[1], f.geometry.coordinates[0])
      : 999,
  }));

  // Step 3: Fetch all observations in parallel
  const obsResults = await Promise.allSettled(
    stationMeta.map(s =>
      fetch(`https://api.weather.gov/stations/${s.id}/observations/latest`,
        { headers: { 'User-Agent': NWS_UA } })
        .then(r => r.ok ? r.json() : null)
        .then(d => ({ ...s, obs: d?.properties ?? null }))
        .catch(() => ({ ...s, obs: null }))
    )
  );

  // Keep only fulfilled results with actual obs, sort by distance
  const stations = obsResults
    .filter(r => r.status === 'fulfilled' && r.value.obs != null)
    .map(r => r.value)
    .sort((a, b) => a.distMi - b.distMi);

  if (!stations.length) return err('No valid observations returned from NWS stations');

  // Step 4: Per-parameter best value - closest station with non-null reading
  const extractors = {
    temp:    obs => C2F(obs?.temperature?.value),
    rh:      obs => obs?.relativeHumidity?.value != null ? Math.round(obs.relativeHumidity.value) : null,
    wind:    obs => nwsSpeed2mph(obs?.windSpeed),
    gust:    obs => nwsSpeed2mph(obs?.windGust),
    dew:     obs => C2F(obs?.dewpoint?.value),
    precip:  obs => nwsPrecip2in(obs?.precipitationLastHour),
    windDir: obs => obs?.windDirection?.value ?? null,
  };

  const composite = {};
  const sources   = {};

  for (const [param, extract] of Object.entries(extractors)) {
    for (const s of stations) {
      const v = extract(s.obs);
      if (v != null) {
        composite[param] = v;
        sources[param]   = {
          id:     s.id,
          name:   s.name,
          distMi: Math.round(s.distMi * 10) / 10,
          source: 'NWS',
          time:   s.obs?.timestamp ?? null,
        };
        break;
      }
    }
    if (composite[param] == null) composite[param] = null;
  }

  // Step 5: METAR fallback for any still-null key params
  const stillMissing = ['temp', 'rh', 'wind'].some(p => composite[p] == null);
  if (stillMissing) {
    const ids = stationMeta.slice(0, 5).map(s => s.id).join(',');
    try {
      const mRes = await fetch(
        `https://aviationweather.gov/api/data/metar?ids=${ids}&format=json&hours=3`
      );
      if (mRes.ok) {
        const metars = await mRes.json();
        const sorted = (Array.isArray(metars) ? metars : [])
          .map(m => {
            const mLat = m.lat ?? m.latitude;
            const mLon = m.lon ?? m.longitude;
            return { ...m, _dist: (mLat != null && mLon != null) ? haverDist(lat, lon, mLat, mLon) : 999 };
          })
          .sort((a, b) => a._dist - b._dist);

        for (const m of sorted) {
          const vals = {
            temp:    C2F(m.temp),
            rh:      rhFromTD(m.temp, m.dewp),
            wind:    kt2mph(m.wspd),
            gust:    kt2mph(m.wgst),
            dew:     C2F(m.dewp),
            windDir: typeof m.wdir === 'number' ? m.wdir : null,
          };
          for (const [param, v] of Object.entries(vals)) {
            if (composite[param] == null && v != null) {
              composite[param] = v;
              sources[param]   = {
                id:     m.id || m.stationId,
                name:   m.site || m.name || m.id,
                distMi: Math.round(m._dist * 10) / 10,
                source: 'METAR',
                time:   m.obsTime ? new Date(m.obsTime * 1000).toISOString() : (m.reportTime ?? null),
              };
            }
          }
        }
      }
    } catch (_) { /* METAR fallback - silent fail, NWS data is primary */ }
  }

  const primary = sources.temp ?? { id: stations[0].id, name: stations[0].name };

  return json({
    station:    { id: primary.id, name: primary.name },
    // Oldest time among the values actually shown — not just the nearest station's
    timestamp:  Object.values(sources).map(s => s.time).filter(Boolean)
                  .sort((a, b) => new Date(a) - new Date(b))[0] ?? stations[0].obs?.timestamp,
    temp:       composite.temp,
    rh:         composite.rh,
    wind:       composite.wind,
    gust:       composite.gust,
    windDir:    composite.windDir,
    dew:        composite.dew,
    precip:     composite.precip,
    pressure:   stations[0].obs?.barometricPressure?.value,
    visibility: stations[0].obs?.visibility?.value,
    rawText:    stations[0].obs?.rawMessage,
    sources,   // per-parameter source: {id, name, distMi, source}
  });
}

// ─────────────────────────────────────────────
// FEMS RAWS - DEAD FUEL MOISTURE + NFDRS
// ─────────────────────────────────────────────
async function handleFEMS(url) {
  const station = url.searchParams.get('station') || '157201';
  const now     = new Date();
  const start   = new Date(now.getTime() - 14 * 86400000).toISOString().slice(0, 10);
  // dataset=all returns observed rows (NFDRType "O") plus FEMS-predicted rows ("F")
  // for today through ~7 days out. Window end extends a week to capture the forecast.
  const fEnd    = new Date(now.getTime() + 8 * 86400000).toISOString().slice(0, 10);
  const apiUrl  = `https://fems.fs2c.usda.gov/api/ext-climatology/download-nfdr-daily-summary/?dataset=all&startDate=${start}&endDate=${fEnd}&dataFormat=csv&stationIds=${station}&fuelModels=Y`;

  const res = await fetch(apiUrl);
  if (!res.ok) return err('FEMS fetch failed', `HTTP ${res.status}`);

  const csv = await res.text();
  if (!csv || csv.length < 50) return err('FEMS returned empty response');

  const lines = csv.trim().split('\n').filter(l => l.trim().length > 0);
  if (lines.length < 2) return err('FEMS CSV has no data rows', `Got ${lines.length} lines`);

  const header = lines[0].replace(/"/g, '').split(',').map(h => h.trim());
  const ci     = name => header.findIndex(h => h === name);

  const rows    = lines.slice(1).map(l => l.replace(/"/g, '').split(','));
  const typeIdx = ci('NFDRType');
  const typeOf  = r => (typeIdx >= 0 ? r[typeIdx]?.trim() : '') || '';

  const numAt = (r, name) => {
    const idx = ci(name);
    if (idx < 0) return null;
    const v = r[idx]?.trim();
    if (!v || v === '') return null;
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  };
  const hasData = r => ['1HrFM', '10HrFM', 'ERC', 'KBDI'].some(col => numAt(r, col) != null);

  // Latest observed row with data (forecast rows are excluded so "current" stays measured)
  let row = null;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (typeOf(rows[i]) !== 'F' && hasData(rows[i])) { row = rows[i]; break; }
  }

  if (!row) return err('FEMS no valid data rows', `${rows.length} rows checked, all empty`);

  const getV = name => numAt(row, name);

  // FEMS-predicted NFDRS values (from NWS gridded forecast run through NFDRS)
  const r1 = v => v != null ? Math.round(v * 10) / 10 : null;
  const forecast = rows
    .filter(r => typeOf(r) === 'F' && hasData(r))
    .map(r => ({
      date:   r[1]?.trim() || '',
      fm1:    r1(numAt(r, '1HrFM')),
      fm10:   r1(numAt(r, '10HrFM')),
      fm100:  r1(numAt(r, '100HrFM')),
      fm1000: r1(numAt(r, '1000HrFM')),
      erc:    r1(numAt(r, 'ERC')),
      bi:     r1(numAt(r, 'BI')),
      ic:     r1(numAt(r, 'IC')),
      sc:     r1(numAt(r, 'SC')),
      kbdi:   numAt(r, 'KBDI'),
    }));

  return json({
    forecast,
    stationName: row[0]?.trim() || 'Unknown',
    stationId:   station,
    obsDate:     row[1]?.trim() || '',
    header,
    fm1hr:    getV('1HrFM'),
    fm10hr:   getV('10HrFM'),
    fm100hr:  getV('100HrFM'),
    fm1000hr: getV('1000HrFM'),
    erc:      getV('ERC'),
    bi:       getV('BI'),
    kbdi:     getV('KBDI'),
    ic:       getV('IC'),
    sc:       getV('SC'),
    fuelModel: row[ci('FuelModel')]?.trim() || null,
  });
}

// ─────────────────────────────────────────────
// NWS 5-DAY FIRE WEATHER FORECAST
// ─────────────────────────────────────────────
async function handleForecast(url) {
  const { lat, lon } = getCoords(url);

  const ptRes = await fetch(`https://api.weather.gov/points/${lat},${lon}`,
    { headers: { 'User-Agent': NWS_UA } });
  if (!ptRes.ok) return err('NWS points failed for forecast', `HTTP ${ptRes.status}`);
  const ptData = await ptRes.json();

  const fcstUrl    = ptData?.properties?.forecast;
  const hourlyUrl  = ptData?.properties?.forecastHourly;
  if (!fcstUrl) return err('No forecast URL from NWS');

  const [fcRes, hrRes] = await Promise.all([
    fetch(fcstUrl,   { headers: { 'User-Agent': NWS_UA } }),
    hourlyUrl ? fetch(hourlyUrl, { headers: { 'User-Agent': NWS_UA } }) : Promise.resolve(null),
  ]);
  if (!fcRes.ok) return err('NWS forecast fetch failed', `HTTP ${fcRes.status}`);
  const fcData = await fcRes.json();

  // Build a date→minRH map from hourly periods (afternoon window = peak fire weather)
  const hourlyRH = new Map();
  if (hrRes?.ok) {
    const hrData = await hrRes.json();
    for (const p of (hrData?.properties?.periods || [])) {
      const date = p.startTime.slice(0, 10);
      const hour = new Date(p.startTime).getUTCHours();
      // Local Kentucky hours roughly 14–21 UTC cover the 9am–4pm fire weather window
      if (hour >= 14 && hour <= 21) {
        const rh = p.relativeHumidity?.value;
        if (rh != null) {
          const cur = hourlyRH.get(date);
          hourlyRH.set(date, cur == null ? rh : Math.min(cur, rh)); // keep min (worst case)
        }
      }
    }
  }

  const periods = fcData?.properties?.periods;
  if (!periods?.length) return err('No forecast periods from NWS');

  // Parse "10 to 20 mph" → 20 (worst case for fire weather)
  function parseWind(str) {
    if (!str) return null;
    const nums = str.match(/\d+/g);
    return nums ? Math.max(...nums.map(Number)) : null;
  }

  // Build day map - daytime period takes priority for fire weather params
  const dayMap = new Map();
  for (const p of periods) {
    const date = p.startTime.slice(0, 10);
    if (p.isDaytime) {
      dayMap.set(date, {
        date,
        maxTemp:    p.temperature,
        wind:       parseWind(p.windSpeed),
        windDir:    p.windDirection,
        rh:         p.relativeHumidity?.value ?? null,
        precip:     p.probabilityOfPrecipitation?.value ?? null,
        shortFcast: p.shortForecast,
      });
    } else {
      const existing = dayMap.get(date);
      if (existing) {
        // Backfill RH from nighttime if daytime lacked it
        if (existing.rh == null) existing.rh = p.relativeHumidity?.value ?? null;
      } else {
        // "Tonight" case - no daytime period for this date yet
        dayMap.set(date, {
          date,
          maxTemp:    p.temperature,
          wind:       parseWind(p.windSpeed),
          windDir:    p.windDirection,
          rh:         p.relativeHumidity?.value ?? null,
          precip:     p.probabilityOfPrecipitation?.value ?? null,
          shortFcast: p.shortForecast,
        });
      }
    }
  }

  // Fill any still-null RH from hourly data
  for (const [date, day] of dayMap) {
    if (day.rh == null && hourlyRH.has(date)) {
      day.rh = hourlyRH.get(date);
    }
  }

  const days = [...dayMap.values()].slice(0, 5);

  // Simple trend analysis for fire weather
  const rhVals  = days.map(d => d.rh).filter(v => v != null);
  const wndVals = days.map(d => d.wind).filter(v => v != null);
  let trend = 'Fire weather conditions relatively stable over the forecast period.';

  if (rhVals.length >= 2) {
    const rhDelta  = rhVals[rhVals.length - 1] - rhVals[0];
    const worstRH  = Math.min(...rhVals);
    const wndDelta = wndVals.length >= 2 ? wndVals[wndVals.length - 1] - wndVals[0] : 0;

    const maxWnd   = wndVals.length ? Math.max(...wndVals) : 0;

    // "Increasing winds" only counts once wind is strong enough to matter (≥12 mph)
    if (worstRH < 25 && wndDelta > 5 && maxWnd >= 12)
      trend = `Critical: RH dropping to ${worstRH}% with increasing winds - potential for rapid fire growth and erratic behavior.`;
    else if (worstRH < 25)
      trend = `Critical: RH falling to ${worstRH}% - fire behavior will be erratic and difficult to predict during low-humidity periods.`;
    else if (worstRH < 35 && wndVals.some(v => v > 20))
      trend = `Elevated: Low RH (${worstRH}%) combined with high winds - monitor closely for Red Flag conditions.`;
    else if (rhDelta < -15)
      trend = `Drying trend - RH dropping ${Math.abs(Math.round(rhDelta))}% over forecast period. Monitor fuel moisture before any burn operations.`;
    else if (rhDelta > 15)
      trend = `Improving conditions - RH rising ${Math.round(rhDelta)}% over forecast period. Fire behavior risk decreasing.`;
    else if (wndDelta > 10 && maxWnd >= 12)
      trend = `Wind increasing trend - stronger gusts expected later in forecast. Watch for spotting potential and short-range spread.`;
  }

  return json({ days, trend, generated: ptData?.properties?.generatedAt });
}

// ─────────────────────────────────────────────
// NWS ALERTS
// ─────────────────────────────────────────────
async function handleAlerts(url) {
  const { lat, lon } = getCoords(url);
  const res = await fetch(`https://api.weather.gov/alerts/active?point=${lat},${lon}`,
    { headers: { 'User-Agent': NWS_UA } });
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
// NIFC WFIGS - ACTIVE FIRE INCIDENTS
// Active_Fires required auth (499); using WFIGS
// Incident Locations YTD (same org, public)
// ─────────────────────────────────────────────
async function handleFires() {
  const bbox = '-89.5,36.4,-81.9,39.1';
  const url  = `https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Incident_Locations_YearToDate/FeatureServer/0/query?where=1%3D1&outFields=IncidentName,IncidentTypeCategory,PercentContained,IncidentSize,POOState,POOCounty,UniqueFireIdentifier,FireDiscoveryDateTime,FireCause,FireOutDateTime,ContainmentDateTime&geometry=${bbox}&geometryType=esriGeometryEnvelope&spatialRel=esriSpatialRelIntersects&inSR=4326&outSR=4326&f=geojson`;

  const res = await fetch(url);
  if (!res.ok) return err('NIFC fires fetch failed', `HTTP ${res.status}`);
  const geojson = await res.json();
  if (geojson?.error) return err('NIFC fires service error', JSON.stringify(geojson.error));
  if (!geojson?.features) return err('NIFC returned invalid GeoJSON', JSON.stringify(geojson).slice(0, 200));

  // Keep only fires that matter now: not declared out, and either discovered in
  // the last 7 days, or discovered in the last 30 days and not yet contained.
  // (30-day cap: many KY incidents never get an out/containment date recorded.)
  const DAY = 86400000, now = Date.now();
  const current = geojson.features.filter(f => {
    const p = f.properties;
    if (p.FireOutDateTime) return false;
    const age = p.FireDiscoveryDateTime ? now - p.FireDiscoveryDateTime : Infinity;
    if (age <= 7 * DAY) return true;
    const contained = p.ContainmentDateTime || (p.PercentContained ?? 0) >= 100;
    return !contained && age <= 30 * DAY;
  });

  // Normalize to stable field names used by map.js
  const features = current.map(f => {
    const p = f.properties;
    return {
      ...f,
      properties: {
        IncidentName:          p.IncidentName || 'Unnamed Incident',
        IncidentTypeCategory:  p.IncidentTypeCategory || '—',
        DailyAcres:            p.IncidentSize ?? null,
        PercentContained:      p.PercentContained ?? null,
        POOState:              p.POOState || '—',
        POOCounty:             p.POOCounty || null,
        UniqueFireIdentifier:  p.UniqueFireIdentifier || null,
        FireDiscoveryDateTime: p.FireDiscoveryDateTime || null,
        FireCause:             p.FireCause || null,
      },
    };
  });

  return json({
    count:    features.length,
    features,
    type:     'FeatureCollection',
    source:   'NIFC WFIGS Incident Locations',
    filter:   'not out; discovered <=7d, or <=30d and uncontained',
    totalYTD: geojson.features.length,
    fetched:  new Date().toISOString(),
  });
}

// ─────────────────────────────────────────────
// NASA FIRMS - VIIRS THERMAL HOTSPOTS
// ─────────────────────────────────────────────
async function handleFIRMS() {
  // Time-enabled ESRI service — use time= epoch parameter (not WHERE clause)
  const now   = Date.now();
  const start = now - 48 * 3600 * 1000;
  const bbox  = '-89.5,36.4,-81.9,39.1';
  const url   = `https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/Satellite_VIIRS_Thermal_Hotspots_and_Fire_Activity/FeatureServer/0/query?where=1%3D1&time=${start}%2C${now}&outFields=bright_ti4,frp,daynight,acq_date,confidence&geometry=${bbox}&geometryType=esriGeometryEnvelope&spatialRel=esriSpatialRelIntersects&inSR=4326&outSR=4326&f=geojson`;

  const res = await fetch(url);
  if (!res.ok) return err('NASA FIRMS fetch failed', `HTTP ${res.status}`);
  const geojson = await res.json();
  if (geojson?.error) return err('NASA FIRMS service error', JSON.stringify(geojson.error));
  if (!geojson?.features) return err('FIRMS returned invalid GeoJSON', JSON.stringify(geojson).slice(0, 200));

  return json({
    count:    geojson.features.length,
    features: geojson.features,
    type:     'FeatureCollection',
    source:   'NASA FIRMS VIIRS',
    fetched:  new Date().toISOString(),
  });
}

// ─────────────────────────────────────────────
// NIFC WFIGS - FIRE PERIMETERS YEAR-TO-DATE
// Includes all agency perimeters (KDF, USFS, NPS, BLM, etc.)
// ─────────────────────────────────────────────
async function handlePerimeters() {
  // Wider bbox to catch perimeters straddling state borders
  const bbox = '-89.6,36.4,-81.9,39.2';
  const url = `https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters_YearToDate/FeatureServer/0/query` +
    `?where=1%3D1` +
    `&outFields=poly_IncidentName,poly_GISAcres,attr_CalculatedAcres,attr_UniqueFireIdentifier,attr_POOState,attr_IncidentTypeCategory,attr_PercentContained,attr_FireDiscoveryDateTime` +
    `&geometry=${bbox}` +
    `&geometryType=esriGeometryEnvelope` +
    `&spatialRel=esriSpatialRelIntersects` +
    `&outSR=4326` +
    `&f=geojson`;

  const res = await fetch(url);
  if (!res.ok) return err('WFIGS perimeters fetch failed', `HTTP ${res.status}`);
  const geojson = await res.json();
  if (!geojson?.features) return err('WFIGS returned invalid GeoJSON');

  // Normalize fields - WFIGS field names are inconsistent across products
  const features = geojson.features.map(f => {
    const p = f.properties;
    const acres = p.poly_GISAcres ?? p.attr_CalculatedAcres ?? null;
    return {
      ...f,
      properties: {
        name:       p.poly_IncidentName || 'Unnamed Fire',
        acres:      acres != null ? Math.round(acres) : null,
        state:      p.attr_POOState || '—',
        type:       p.attr_IncidentTypeCategory || '—',
        contained:  p.attr_PercentContained ?? null,
        discovered: p.attr_FireDiscoveryDateTime || null,
        uid:        p.attr_UniqueFireIdentifier || null,
      },
    };
  });

  return json({
    count:    features.length,
    features,
    type:     'FeatureCollection',
    source:   'NIFC WFIGS Year-to-Date Perimeters',
    fetched:  new Date().toISOString(),
  });
}

// ─────────────────────────────────────────────
// NWS FWF - FIRE WEATHER FORECAST TEXT PRODUCT
// Office + fire weather zone come from the NWS points lookup for the
// requested location (SE KY / London → JKL, zone KYZ080). The product is
// filtered to headline + discussion, the zone group covering that location,
// and the days 3-7 outlook.
// ─────────────────────────────────────────────

// Expand a UGC header like "KYZ068-069-080-084>088-114-116-192115-" into zone IDs
function parseUGC(ugc) {
  const zones = new Set();
  let prefix = '';
  const addRange = (a, b) => {
    for (let i = +a; i <= (b ? +b : +a); i++) zones.add(prefix + String(i).padStart(3, '0'));
  };
  for (const tok of ugc.replace(/\s+/g, '').split('-')) {
    let m = tok.match(/^([A-Z]{2}[ZC])(\d{3})(?:>(\d{3}))?$/);
    if (m) { prefix = m[1]; addRange(m[2], m[3]); continue; }
    m = tok.match(/^(\d{3})(?:>(\d{3}))?$/);
    if (m && prefix) addRange(m[1], m[2]);
    // 6-digit expiration timestamp falls through — ignored
  }
  return zones;
}

async function handleFireBrief(url) {
  const { lat, lon } = getCoords(url);

  let office = 'JKL', zone = 'KYZ080'; // London / Laurel Co defaults
  try {
    const ptRes = await fetch(`https://api.weather.gov/points/${lat},${lon}`,
      { headers: { 'User-Agent': NWS_UA } });
    if (ptRes.ok) {
      const p = (await ptRes.json())?.properties;
      if (p?.cwa) office = p.cwa;
      const fz = (p?.fireWeatherZone || '').split('/').pop();
      if (fz) zone = fz;
    }
  } catch (_) { /* keep defaults */ }

  const listRes = await fetch(
    `https://api.weather.gov/products/types/FWF/locations/${office}`,
    { headers: { 'User-Agent': NWS_UA } }
  );
  if (!listRes.ok) return err('FWF product list failed', `HTTP ${listRes.status}`);
  const listData = await listRes.json();

  const productId = listData?.['@graph']?.[0]?.id;
  if (!productId) return err(`No FWF products found for ${office} office`);

  const prodRes = await fetch(
    `https://api.weather.gov/products/${productId}`,
    { headers: { 'User-Agent': NWS_UA } }
  );
  if (!prodRes.ok) return err('FWF product fetch failed', `HTTP ${prodRes.status}`);
  const prodData = await prodRes.json();
  const fullText = prodData.productText || '';

  // Split into $$-delimited segments; zone segments start with a UGC header
  const UGC_RE = /^([A-Z]{2}[ZC]\d{3}[0-9A-Z>\-\n]*?\d{6}-)[ \t]*$/m;
  const chunks = fullText.split(/^\$\$[ \t]*$/m);
  let intro = '', zoneSeg = null, zoneAreas = null, extended = '';

  chunks.forEach((chunk, i) => {
    const m = chunk.match(UGC_RE);
    if (!m) {
      if (i === 0) intro = chunk;
      else if (/FORECAST FOR DAYS|EXTENDED/i.test(chunk)) extended = chunk;
      return;
    }
    if (i === 0) intro = chunk.slice(0, m.index);
    if (!zoneSeg && parseUGC(m[1]).has(zone)) {
      zoneSeg   = chunk.slice(m.index + m[0].length);
      // First non-blank line after UGC = county list ("Rockcastle-Jackson-Laurel-...")
      const areaLines = [];
      for (const l of zoneSeg.split('\n').map(s => s.trim())) {
        if (!l) { if (areaLines.length) break; continue; }
        if (/^Including/i.test(l)) break;
        areaLines.push(l);
      }
      zoneAreas = areaLines.join('').replace(/-$/, '').split('-').join(', ');
    }
  });

  const filtered = zoneSeg != null;
  const text = filtered
    ? [intro.trim(), zoneSeg.trim(), extended.trim()].filter(Boolean).join('\n\n')
    : fullText;

  return json({
    issuedAt:  prodData.issuanceTime,
    office:    prodData.issuingOffice,
    productId,
    zone,
    zoneAreas,
    filtered,
    text,
  });
}

// ─────────────────────────────────────────────
// FEMS CLIMATOLOGY - how today's ERC/BI compares
// Pulls every observed day for the last 20 full years, keeps the
// days within ±15 days of the requested date's day-of-year, and
// returns the sorted ERC and BI values so the page can compute
// "higher than X% of days at this time of year".
// ─────────────────────────────────────────────
async function handleFemsClim(url) {
  const station = url.searchParams.get('station') || '157201';
  const date    = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
  const lastYr  = new Date().getUTCFullYear() - 1;
  const firstYr = lastYr - 19;
  const apiUrl  = `https://fems.fs2c.usda.gov/api/ext-climatology/download-nfdr-daily-summary/?dataset=all&startDate=${firstYr}-01-01&endDate=${lastYr}-12-31&dataFormat=csv&stationIds=${station}&fuelModels=Y`;

  const res = await fetch(apiUrl);
  if (!res.ok) return err('FEMS history fetch failed', `HTTP ${res.status}`);
  const lines = (await res.text()).trim().split(/\r?\n/);
  if (lines.length < 2) return err('FEMS history empty');

  const header = lines[0].replace(/"/g, '').split(',').map(h => h.trim());
  const iDate = header.indexOf('ObservationTime');
  const iType = header.indexOf('NFDRType');
  const iERC  = header.indexOf('ERC');
  const iBI   = header.indexOf('BI');
  if (iDate < 0 || iERC < 0 || iBI < 0) return err('FEMS history: unexpected columns', header.join(','));

  const doy = d => Math.floor((Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) - Date.UTC(+d.slice(0, 4), 0, 0)) / 86400000);
  const target = doy(date);
  const near   = d => { const x = Math.abs(doy(d) - target); return Math.min(x, 365 - x) <= 15; };

  const erc = [], bi = [];
  const years = new Set();
  for (let k = 1; k < lines.length; k++) {
    const r = lines[k].replace(/"/g, '').split(',');
    if (iType >= 0 && r[iType] === 'F') continue;
    const d = r[iDate];
    if (!d || !near(d)) continue;
    const e = parseFloat(r[iERC]), b = parseFloat(r[iBI]);
    if (!isNaN(e)) { erc.push(e); years.add(d.slice(0, 4)); }
    if (!isNaN(b)) bi.push(b);
  }
  if (erc.length < 100) return err('Not enough history at this station', `${erc.length} days`);

  const yrs = [...years].sort();
  return json({
    station, date, fuelModel: 'Y',
    firstYear: +yrs[0], lastYear: +yrs[yrs.length - 1], years: yrs.length,
    erc: erc.sort((a, b) => a - b),
    bi:  bi.sort((a, b) => a - b),
  });
}

// ─────────────────────────────────────────────
// FUEL MOISTURE MAP LAYERS
// ─────────────────────────────────────────────

// Dead fuel moisture for many RAWS in one FEMS request — latest observed row
// plus FEMS-predicted rows (today → ~7 days) per station.
async function handleFmStations(url) {
  const ids = (url.searchParams.get('stations') || '')
    .split(',').map(s => s.trim()).filter(s => /^\d+$/.test(s)).slice(0, 30);
  if (!ids.length) return err('No valid station ids', '', 400);

  const now   = new Date();
  const start = new Date(now.getTime() - 4 * 86400000).toISOString().slice(0, 10);
  const end   = new Date(now.getTime() + 8 * 86400000).toISOString().slice(0, 10);
  const apiUrl = `https://fems.fs2c.usda.gov/api/ext-climatology/download-nfdr-daily-summary/?dataset=all&startDate=${start}&endDate=${end}&dataFormat=csv&stationIds=${ids.join(',')}&fuelModels=Y`;

  const res = await fetch(apiUrl);
  if (!res.ok) return err('FEMS fetch failed', `HTTP ${res.status}`);
  const lines = (await res.text()).trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return err('FEMS returned no rows');

  const header = lines[0].replace(/"/g, '').split(',').map(h => h.trim());
  const ci = name => header.indexOf(name);
  const I = { name: ci('StationName'), date: ci('ObservationTime'), type: ci('NFDRType'), id: ci('StationId'),
              fm1: ci('1HrFM'), fm10: ci('10HrFM'), fm100: ci('100HrFM'), fm1000: ci('1000HrFM') };
  const num = (r, i) => {
    if (i < 0) return null;
    const n = parseFloat(r[i]);
    return isNaN(n) ? null : Math.round(n * 10) / 10;
  };

  const stations = {};
  for (const l of lines.slice(1)) {
    const r = l.replace(/"/g, '').split(',').map(v => v.trim());
    const id = r[I.id];
    if (!id) continue;
    const rec = { date: r[I.date], fm1: num(r, I.fm1), fm10: num(r, I.fm10), fm100: num(r, I.fm100), fm1000: num(r, I.fm1000) };
    if (rec.fm1 == null && rec.fm10 == null) continue;
    const st = stations[id] || (stations[id] = { name: r[I.name], obs: null, forecast: [] });
    if (r[I.type] === 'F') st.forecast.push(rec);
    else if (!st.obs || rec.date > st.obs.date) st.obs = rec;
  }
  for (const st of Object.values(stations)) st.forecast.sort((a, b) => a.date.localeCompare(b.date));

  return json({ source: 'FEMS NFDRS (observed + FEMS forecast)', stations });
}

// WFAS (USFS) 100-hr dead fuel moisture forecast, 2.5 km NDFD grid.
// Files are national (~11 MB each); we byte-range only the rows covering KY
// and resample to a regular grid whose rows are evenly spaced in Web Mercator,
// so the client can draw it as one image overlay without distortion.
// (WFAS's 2.5 km 1000-hr grid is NOT used: on 2026-11-20 it read ~35% where
// FEMS stations and WFAS's own station-based map read ~18%.)
const WFAS_MOIST = 'https://www.wfas.net/data/moistures';
const FMGRID_BOX = { s: 36.45, n: 39.2, w: -89.65, e: -81.9, step: 0.025 };

async function handleFmGrid(url) {
  const day = parseInt(url.searchParams.get('day') || '0', 10);
  if (!(day >= 0 && day <= 6)) return err('day must be 0-6', '', 400);
  const base = `${WFAS_MOIST}/fm100_day${day}`;

  const hdrRes = await fetch(`${base}.hdr`);
  if (!hdrRes.ok) return err('WFAS header fetch failed', `HTTP ${hdrRes.status}`);
  const H = {};
  for (const line of (await hdrRes.text()).split('\n')) {
    const [k, v] = line.trim().split(/\s+/);
    if (k) H[k.toLowerCase()] = v;
  }
  const nc = +H.ncols, nr = +H.nrows, cs = +H.cellsize, xll = +H.xllcorner, yll = +H.yllcorner;
  const nodata = +H.nodata_value, little = (H.byteorder || 'lsbfirst').toLowerCase() === 'lsbfirst';
  if (!nc || !nr || !cs) return err('WFAS header unreadable');

  // NDFD Lambert Conformal Conic on a sphere (from the .prj): R 6371000,
  // standard parallel 25°, origin 25°N, central meridian -95°.
  const R = 6371000, p = 25 * Math.PI / 180, n = Math.sin(p);
  const F = Math.cos(p) * Math.tan(Math.PI / 4 + p / 2) ** n / n;
  const rho0 = R * F / Math.tan(Math.PI / 4 + p / 2) ** n;
  const toRC = (lat, lon) => {
    const rho = R * F / Math.tan(Math.PI / 4 + lat * Math.PI / 360) ** n;
    const th = n * (lon + 95) * Math.PI / 180;
    const x = rho * Math.sin(th), y = rho0 - rho * Math.cos(th);
    return [nr - 1 - Math.floor((y - yll) / cs), Math.floor((x - xll) / cs)];
  };

  // Output grid: columns even in lon, rows even in Mercator Y
  const B = FMGRID_BOX;
  const mY = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
  const iY = y => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI;
  const nx = Math.round((B.e - B.w) / B.step);
  const ny = Math.round((B.n - B.s) / B.step);
  const yN = mY(B.n), yS = mY(B.s);

  const idx = new Int32Array(nx * ny * 2);
  let rMin = Infinity, rMax = -Infinity;
  for (let j = 0; j < ny; j++) {
    const lat = iY(yN - (j + 0.5) * (yN - yS) / ny);
    for (let i = 0; i < nx; i++) {
      const lon = B.w + (i + 0.5) * B.step;
      const [r, c] = toRC(lat, lon);
      idx[(j * nx + i) * 2] = r; idx[(j * nx + i) * 2 + 1] = c;
      if (r < rMin) rMin = r;
      if (r > rMax) rMax = r;
    }
  }
  rMin = Math.max(0, rMin); rMax = Math.min(nr - 1, rMax);

  const first = rMin * nc * 4, last = (rMax + 1) * nc * 4 - 1;
  const fltRes = await fetch(`${base}.flt`, { headers: { Range: `bytes=${first}-${last}` } });
  if (fltRes.status !== 206 && fltRes.status !== 200) return err('WFAS grid fetch failed', `HTTP ${fltRes.status}`);
  const buf = await fltRes.arrayBuffer();
  const dv = new DataView(buf);
  const skip = fltRes.status === 200 ? first : 0; // server ignored Range → full file

  // Values in tenths of a percent; -1 = no data (outside CONUS / water)
  const vals = new Array(nx * ny);
  for (let k = 0; k < nx * ny; k++) {
    const r = idx[k * 2], c = idx[k * 2 + 1];
    let v = -1;
    if (r >= rMin && r <= rMax && c >= 0 && c < nc) {
      const off = skip + ((r - rMin) * nc + c) * 4;
      if (off + 4 <= buf.byteLength) {
        const f = dv.getFloat32(off, little);
        if (isFinite(f) && f !== nodata && f > 0 && f < 100) v = Math.round(f * 10);
      }
    }
    vals[k] = v;
  }

  // Date the grid was produced (WFAS runs once each morning) → day 0 = that date
  const lm = fltRes.headers.get('Last-Modified') || hdrRes.headers.get('Last-Modified');
  const issued = lm ? new Date(lm).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) : null;
  const valid = issued
    ? new Date(new Date(issued + 'T12:00:00Z').getTime() + day * 86400000).toISOString().slice(0, 10)
    : null;

  return json({
    source: 'USFS WFAS — NFDRS 100-hr dead fuel moisture forecast (NWS NDFD 2.5 km grid)',
    var: 'fm100', day, issued, valid, lastModified: lm,
    bounds: { s: B.s, n: B.n, w: B.w, e: B.e }, nx, ny, scale: 0.1,
    values: vals,
  });
}
