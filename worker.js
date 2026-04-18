/**
 * EKY Fire Watch - Cloudflare Worker Backend  v2.0
 * =================================================
 * DEPLOY: Paste into Cloudflare Workers dashboard and Save & Deploy.
 *
 * ENDPOINTS:
 *  GET /nws?lat=&lon=      → Multi-station composite weather (NWS + METAR fallback)
 *  GET /fems?station=      → Dead fuel moisture + NFDRS from RAWS
 *  GET /forecast?lat=&lon= → NWS 5-day fire weather forecast
 *  GET /alerts?lat=&lon=   → Active NWS fire weather alerts
 *  GET /fires              → Active fire incidents (NIFC IRWIN)
 *  GET /firms              → NASA FIRMS VIIRS thermal hotspots
 *  GET /perimeters         → Fire perimeters year-to-date (NIFC WFIGS)
 *  GET /fire-brief         → NWS FWF text product (Louisville/LMK office)
 *  GET /fuel-model?lat=&lon= → LANDFIRE FBFM40 fuel model at GPS point (READ Option B)
 *  GET /health               → Health check
 */

// ── FBFM40 Fuel Model Lookup (Scott & Burgan 40 + Original 13) ──
const FBFM40 = {
  // Non-burnable
  91:  { name: 'Urban/Developed',              group: 'NB', burnable: false, desc: 'Non-burnable - developed land' },
  92:  { name: 'Snow/Ice',                     group: 'NB', burnable: false, desc: 'Non-burnable - snow or ice' },
  93:  { name: 'Agriculture',                  group: 'NB', burnable: false, desc: 'Agricultural land - low fire risk' },
  98:  { name: 'Water',                        group: 'NB', burnable: false, desc: 'Non-burnable - open water' },
  99:  { name: 'Barren',                       group: 'NB', burnable: false, desc: 'Non-burnable - bare ground' },
  // Original 13 models
  1:   { name: 'FM1 - Short Grass',            group: 'GR', burnable: true,  desc: 'Short dry grass; fast spread, low flame height' },
  2:   { name: 'FM2 - Timber/Grass Mix',       group: 'GS', burnable: true,  desc: 'Mixed grass and open timber; moderate spread' },
  3:   { name: 'FM3 - Tall Grass',             group: 'GR', burnable: true,  desc: 'Dense tall grass; rapid spread, high flame height' },
  4:   { name: 'FM4 - Chaparral',              group: 'SH', burnable: true,  desc: 'Tall shrubs 6+ ft; intense fire, high crown potential' },
  5:   { name: 'FM5 - Low Brush',              group: 'SH', burnable: true,  desc: 'Low green shrubs; moderate spread' },
  6:   { name: 'FM6 - Dormant Brush',          group: 'SH', burnable: true,  desc: 'Dormant brush/hardwood slash; moderate-high spread' },
  7:   { name: 'FM7 - Southern Rough',         group: 'SH', burnable: true,  desc: 'Low shrubs with hardwood understory; moderate spread' },
  8:   { name: 'FM8 - Compact Litter',         group: 'TL', burnable: true,  desc: 'Dense short-needle litter; slow spread, low intensity' },
  9:   { name: 'FM9 - Hardwood Litter',        group: 'TL', burnable: true,  desc: 'Long-needle or hardwood litter; fast spread when dry' },
  10:  { name: 'FM10 - Timber/Understory',     group: 'TL', burnable: true,  desc: 'Heavy litter and downed logs; high intensity, crown potential' },
  11:  { name: 'FM11 - Light Slash',           group: 'SB', burnable: true,  desc: 'Light logging slash; moderate spread' },
  12:  { name: 'FM12 - Medium Slash',          group: 'SB', burnable: true,  desc: 'Medium logging slash; high intensity' },
  13:  { name: 'FM13 - Heavy Slash',           group: 'SB', burnable: true,  desc: 'Heavy logging slash; very high intensity' },
  // GR - Grass
  101: { name: 'GR1 - Short Sparse Grass',     group: 'GR', burnable: true,  desc: 'Very sparse short dry grass; low spread' },
  102: { name: 'GR2 - Low Grass',              group: 'GR', burnable: true,  desc: 'Low continuous grass; moderate spread' },
  103: { name: 'GR3 - Low-Medium Grass',       group: 'GR', burnable: true,  desc: 'Low-medium continuous grass; moderate spread' },
  104: { name: 'GR4 - Moderate Dry Grass',     group: 'GR', burnable: true,  desc: 'Moderate dry grass; fast spread' },
  105: { name: 'GR5 - Low Humid Grass',        group: 'GR', burnable: true,  desc: 'Moderate humid climate grass' },
  106: { name: 'GR6 - Moderate Humid Grass',   group: 'GR', burnable: true,  desc: 'Moderate humid grass; high spread rate' },
  107: { name: 'GR7 - High Dry Grass',         group: 'GR', burnable: true,  desc: 'Heavy dry grass; very fast spread' },
  108: { name: 'GR8 - Coarse Dry Grass',       group: 'GR', burnable: true,  desc: 'Very heavy coarse dry grass; extreme spread potential' },
  109: { name: 'GR9 - High Humid Grass',       group: 'GR', burnable: true,  desc: 'Very heavy humid grass; extreme spread' },
  // GS - Grass-Shrub
  121: { name: 'GS1 - Low Dry Grass-Shrub',    group: 'GS', burnable: true,  desc: 'Mixed grass and low shrubs; moderate spread' },
  122: { name: 'GS2 - Mod Dry Grass-Shrub',    group: 'GS', burnable: true,  desc: 'Mixed grass-shrub; moderate-high spread' },
  123: { name: 'GS3 - Mod Humid Grass-Shrub',  group: 'GS', burnable: true,  desc: 'Moderate humid grass-shrub mix' },
  124: { name: 'GS4 - High Humid Grass-Shrub', group: 'GS', burnable: true,  desc: 'Heavy humid grass-shrub; high intensity' },
  // SH - Shrub
  141: { name: 'SH1 - Low Dry Shrub',          group: 'SH', burnable: true,  desc: 'Low load dry shrub; moderate spread' },
  142: { name: 'SH2 - Mod Dry Shrub',          group: 'SH', burnable: true,  desc: 'Moderate dry shrub; moderate spread' },
  143: { name: 'SH3 - Mod Humid Shrub',        group: 'SH', burnable: true,  desc: 'Dense low humid shrub; moderate spread' },
  144: { name: 'SH4 - Low Humid Timber-Shrub', group: 'SH', burnable: true,  desc: 'Low humid shrub in timber; moderate spread' },
  145: { name: 'SH5 - High Dry Shrub',         group: 'SH', burnable: true,  desc: 'Heavy dry shrub; high intensity' },
  146: { name: 'SH6 - Low Humid Shrub',        group: 'SH', burnable: true,  desc: 'Low humid shrub; moderate intensity' },
  147: { name: 'SH7 - Very High Dry Shrub',    group: 'SH', burnable: true,  desc: 'Very heavy dry shrub; extreme behavior, crown potential' },
  148: { name: 'SH8 - High Humid Shrub',       group: 'SH', burnable: true,  desc: 'Heavy humid shrub; high intensity' },
  149: { name: 'SH9 - Very High Humid Shrub',  group: 'SH', burnable: true,  desc: 'Very heavy humid shrub; high intensity, crown potential' },
  // TU - Timber-Understory
  161: { name: 'TU1 - Low Dry Timber-Understory',      group: 'TU', burnable: true, desc: 'Low load timber with grass/shrub understory; moderate spread' },
  162: { name: 'TU2 - Mod Humid Timber-Shrub',         group: 'TU', burnable: true, desc: 'Moderate humid timber-shrub; moderate spread' },
  163: { name: 'TU3 - Mod Humid Timber-Grass-Shrub',   group: 'TU', burnable: true, desc: 'Mixed humid timber with grass and shrub; moderate-high spread' },
  164: { name: 'TU4 - Dwarf Conifer/Understory',       group: 'TU', burnable: true, desc: 'Dwarf conifer with grass understory; crown potential' },
  165: { name: 'TU5 - High Dry Timber-Shrub',          group: 'TU', burnable: true, desc: 'Heavy dry timber-shrub; high intensity, crown potential' },
  // TL - Timber Litter
  181: { name: 'TL1 - Low Load Compact Timber Litter',  group: 'TL', burnable: true, desc: 'Compact timber litter; slow spread, low intensity' },
  182: { name: 'TL2 - Low Broadleaf Litter',           group: 'TL', burnable: true, desc: 'Broadleaf litter; low-moderate spread' },
  183: { name: 'TL3 - Mod Conifer Litter',             group: 'TL', burnable: true, desc: 'Moderate conifer litter; low spread' },
  184: { name: 'TL4 - Small Downed Logs',              group: 'TL', burnable: true, desc: 'Conifer litter with small logs; moderate intensity' },
  185: { name: 'TL5 - High Conifer Litter',            group: 'TL', burnable: true, desc: 'Heavy conifer litter; moderate spread and intensity' },
  186: { name: 'TL6 - High Broadleaf Litter',          group: 'TL', burnable: true, desc: 'Heavy broadleaf litter; fast spread when dry' },
  187: { name: 'TL7 - Large Downed Logs',              group: 'TL', burnable: true, desc: 'Conifer litter with large logs; high intensity' },
  188: { name: 'TL8 - Long Needle Litter',             group: 'TL', burnable: true, desc: 'Long-needle litter; fast spread, moderate intensity' },
  189: { name: 'TL9 - Very High Broadleaf Litter',     group: 'TL', burnable: true, desc: 'Very heavy broadleaf litter; fast spread when dry - common EKY hardwoods' },
  // SB - Slash-Blowdown
  201: { name: 'SB1 - Low Slash',              group: 'SB', burnable: true,  desc: 'Light logging slash; moderate spread' },
  202: { name: 'SB2 - Mod Slash',              group: 'SB', burnable: true,  desc: 'Moderate slash; high intensity' },
  203: { name: 'SB3 - High Slash',             group: 'SB', burnable: true,  desc: 'Heavy slash; very high intensity' },
  204: { name: 'SB4 - Blowdown',               group: 'SB', burnable: true,  desc: 'Wind-thrown timber; extreme fire behavior' },
};

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
  '/fuel-model':  86400, // 24 hr - LANDFIRE data changes annually at most
  '/slope':       3600,  // 1 hr - terrain is static
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
        case '/fire-brief':  response = await handleFireBrief();      break;
        case '/fuel-model':  response = await handleFuelModel(url);  break;
        case '/slope':       response = await handleSlope(url);       break;
        case '/health':      response = json({ ok: true, ts: new Date().toISOString(), version: '2.1' }); break;
        default:
          response = json({
            name: 'EKY Fire Watch API', version: '2.1',
            endpoints: ['/nws', '/fems', '/forecast', '/alerts', '/fires', '/firms', '/perimeters', '/fire-brief', '/fuel-model', '/slope', '/health'],
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
    timestamp:  stations[0].obs?.timestamp,
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
  const end     = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);
  const start   = new Date(now.getTime() - 5 * 86400000).toISOString().slice(0, 10);
  const apiUrl  = `https://fems.fs2c.usda.gov/api/ext-climatology/download-nfdr-daily-summary/?dataset=observation&startDate=${start}&endDate=${end}&dataFormat=csv&stationIds=${station}&fuelModels=Y`;

  const res = await fetch(apiUrl);
  if (!res.ok) return err('FEMS fetch failed', `HTTP ${res.status}`);

  const csv = await res.text();
  if (!csv || csv.length < 50) return err('FEMS returned empty response');

  const lines = csv.trim().split('\n').filter(l => l.trim().length > 0);
  if (lines.length < 2) return err('FEMS CSV has no data rows', `Got ${lines.length} lines`);

  const header = lines[0].replace(/"/g, '').split(',').map(h => h.trim());
  const ci     = name => header.findIndex(h => h === name);
  const row    = lines[lines.length - 1].replace(/"/g, '').split(',');
  const getV   = name => {
    const i = ci(name);
    return i >= 0 && row[i] && row[i] !== '' ? parseFloat(row[i]) : null;
  };

  return json({
    stationName: row[0] || 'Unknown',
    stationId:   station,
    obsDate:     row[1] || '',
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
    fuelModel: row[ci('FuelModel')] || null,
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

    if (worstRH < 25 && wndDelta > 5)
      trend = `Critical: RH dropping to ${worstRH}% with increasing winds - potential for rapid fire growth and erratic behavior.`;
    else if (worstRH < 25)
      trend = `Critical: RH falling to ${worstRH}% - fire behavior will be erratic and difficult to predict during low-humidity periods.`;
    else if (worstRH < 35 && wndVals.some(v => v > 20))
      trend = `Elevated: Low RH (${worstRH}%) combined with high winds - monitor closely for Red Flag conditions.`;
    else if (rhDelta < -15)
      trend = `Drying trend - RH dropping ${Math.abs(Math.round(rhDelta))}% over forecast period. Monitor fuel moisture before any burn operations.`;
    else if (rhDelta > 15)
      trend = `Improving conditions - RH rising ${Math.round(rhDelta)}% over forecast period. Fire behavior risk decreasing.`;
    else if (wndDelta > 10)
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
  const url  = `https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Incident_Locations_YearToDate/FeatureServer/0/query?where=1%3D1&outFields=IncidentName,IncidentTypeCategory,PercentContained,IncidentSize,POOState,POOCounty,UniqueFireIdentifier,FireDiscoveryDateTime,FireCause&geometry=${bbox}&geometryType=esriGeometryEnvelope&spatialRel=esriSpatialRelIntersects&inSR=4326&outSR=4326&f=geojson`;

  const res = await fetch(url);
  if (!res.ok) return err('NIFC fires fetch failed', `HTTP ${res.status}`);
  const geojson = await res.json();
  if (geojson?.error) return err('NIFC fires service error', JSON.stringify(geojson.error));
  if (!geojson?.features) return err('NIFC returned invalid GeoJSON', JSON.stringify(geojson).slice(0, 200));

  // Normalize to stable field names used by map.js
  const features = geojson.features.map(f => {
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
// Louisville NWS office (LMK) covers Eastern KY
// ─────────────────────────────────────────────
async function handleFireBrief() {
  const listRes = await fetch(
    'https://api.weather.gov/products/types/FWF/locations/LMK',
    { headers: { 'User-Agent': NWS_UA } }
  );
  if (!listRes.ok) return err('FWF product list failed', `HTTP ${listRes.status}`);
  const listData = await listRes.json();

  const productId = listData?.['@graph']?.[0]?.id;
  if (!productId) return err('No FWF products found for LMK office');

  const prodRes = await fetch(
    `https://api.weather.gov/products/${productId}`,
    { headers: { 'User-Agent': NWS_UA } }
  );
  if (!prodRes.ok) return err('FWF product fetch failed', `HTTP ${prodRes.status}`);
  const prodData = await prodRes.json();

  return json({
    issuedAt:  prodData.issuanceTime,
    office:    prodData.issuingOffice,
    productId,
    text:      prodData.productText,
  });
}

// ─────────────────────────────────────────────
// LANDFIRE FBFM40 POINT QUERY (READ Option B)
// WMS GetFeatureInfo against LANDFIRE GeoServer
// ─────────────────────────────────────────────
// Fetch a single LANDFIRE WMS layer at a point, return the raw GRAY_INDEX value or null
async function landfire_query(layer, minx, miny, maxx, maxy) {
  const u = `https://edcintl.cr.usgs.gov/geoserver/landfire/conus_2024/ows` +
    `?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetFeatureInfo` +
    `&LAYERS=${layer}&QUERY_LAYERS=${layer}` +
    `&INFO_FORMAT=application%2Fjson` +
    `&X=2&Y=2&WIDTH=5&HEIGHT=5` +
    `&BBOX=${minx},${miny},${maxx},${maxy}` +
    `&SRS=EPSG%3A4326`;
  try {
    const res = await fetch(u);
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('json')) {
      const d = await res.json();
      const v = d?.features?.[0]?.properties?.GRAY_INDEX ?? null;
      return v != null ? Number(v) : null;
    } else {
      const t = await res.text();
      const m = t.match(/GRAY_INDEX\s*=\s*(\d+)/i);
      return m ? parseInt(m[1]) : null;
    }
  } catch { return null; }
}

async function handleFuelModel(url) {
  const { lat, lon } = getCoords(url);

  const buf  = 0.002;
  const minx = lon - buf, miny = lat - buf;
  const maxx = lon + buf, maxy = lat + buf;

  // Fetch FBFM40, CBH, and CBD in parallel
  const [fbfm40, cbhRaw, cbdRaw] = await Promise.all([
    landfire_query('LF2024_FBFM40_CONUS', minx, miny, maxx, maxy),
    landfire_query('LF2024_CBH_CONUS',    minx, miny, maxx, maxy),
    landfire_query('LF2024_CBD_CONUS',    minx, miny, maxx, maxy),
  ]);

  if (fbfm40 == null) {
    return err('No fuel model data returned for this location - may be outside CONUS coverage');
  }

  // CBH: LANDFIRE stores as meters × 10 (e.g. 15 = 1.5 m). 0 = no canopy.
  const cbh_m     = (cbhRaw != null && cbhRaw > 0) ? cbhRaw * 0.1 : null;
  // CBD: LANDFIRE stores as kg/m³ × 100 (e.g. 10 = 0.10 kg/m³). 0 = no canopy.
  const cbd_kgm3  = (cbdRaw != null && cbdRaw > 0) ? cbdRaw * 0.01 : null;

  const fm = FBFM40[fbfm40];
  if (!fm) {
    return json({
      lat, lon, code: fbfm40,
      name: `FBFM40 Code ${fbfm40}`, group: 'UNKNOWN', burnable: true,
      desc: 'Fuel model code not in lookup table',
      cbh_m, cbd_kgm3,
      source: 'LANDFIRE 2024',
    });
  }

  // Warn when a conifer-labeled TL model is returned for eastern deciduous forest coordinates.
  // LANDFIRE 2024 frequently misclassifies oak/hickory/maple/beech stands as conifer litter.
  // Conifer TL codes: TL1 (181), TL3 (183), TL5 (185), TL8 (188)
  const CONIFER_TL = new Set([181, 183, 185, 188]);
  const inEasternDeciduous = lat >= 34 && lat <= 44 && lon >= -92 && lon <= -72;
  const note = (CONIFER_TL.has(fbfm40) && inEasternDeciduous)
    ? 'LANDFIRE shows conifer litter — eastern hardwood forests (oak, hickory, maple, beech) typically classify as TL2 (low broadleaf) or TL6 (broadleaf litter). Verify locally and consider overriding.'
    : null;

  return json({
    lat, lon, code: fbfm40,
    name:     fm.name,
    group:    fm.group,
    burnable: fm.burnable,
    desc:     fm.desc,
    note,
    cbh_m,
    cbd_kgm3,
    source:   'LANDFIRE 2024',
  });
}

// ─────────────────────────────────────────────
// USGS 3DEP - TERRAIN SLOPE AT POINT
// Samples elevation at 3 nearby points via EPQS,
// computes slope from the gradient vector.
// ─────────────────────────────────────────────
async function handleSlope(url) {
  const { lat, lon } = getCoords(url);

  const epqs = (la, lo) =>
    fetch(`https://epqs.nationalmap.gov/v1/json?x=${lo}&y=${la}&wkid=4326&units=Meters&includeDate=false`)
      .then(r => r.json())
      .then(d => parseFloat(d.value));

  // Sample center + ~111 m north + ~111 m east in parallel
  const δ = 0.001;
  const [z0, zN, zE] = await Promise.all([
    epqs(lat,     lon),
    epqs(lat + δ, lon),
    epqs(lat,     lon + δ),
  ]);

  if (isNaN(z0) || isNaN(zN) || isNaN(zE) || z0 < -9999)
    return err('Elevation query failed — outside 3DEP coverage or EPQS unavailable');

  const dx       = δ * 111320 * Math.cos(lat * Math.PI / 180); // meters east
  const dy       = δ * 111320;                                  // meters north
  const rise     = Math.sqrt(((zE - z0) / dx) ** 2 + ((zN - z0) / dy) ** 2);
  const slopeDeg = +(Math.atan(rise) * 180 / Math.PI).toFixed(1);
  const slopePct = Math.round(rise * 100);

  const bins     = [0, 10, 20, 30, 40];
  const slopeBin = bins.reduce((a, b) => Math.abs(b - slopePct) < Math.abs(a - slopePct) ? b : a);

  return json({ lat, lon, slopeDeg, slopePct, slopeBin });
}
