// ── 5-day fire weather forecast fetch + rendering ──
import { state } from './state.js';
import { workerFetch } from './api.js';
import { setSplash } from './diag.js';
import { c_F } from './calc.js';

// ── Front detection ──
// Cardinal/intercardinal directions → degrees
const DIR_DEG = {
  N:0,NNE:22.5,NE:45,ENE:67.5,E:90,ESE:112.5,SE:135,SSE:157.5,
  S:180,SSW:202.5,SW:225,WSW:247.5,W:270,WNW:292.5,NW:315,NNW:337.5,
};
function angDiff(a, b) { return Math.abs(((a - b + 540) % 360) - 180); }

function buildFrontNote(wx, days) {
  const { wind, gust, windDirDeg } = wx;

  // Current conditions
  const gustRatio  = (wind > 0 && gust != null) ? gust / wind : null;
  const erraticNow = gustRatio != null && gustRatio >= 1.7 && gust >= 15;
  const gustyNow   = gust != null && gust >= 20;

  // Precipitation signals — next 1-2 days
  const precipPatt  = /shower|rain|storm|thunder/i;
  const nearPrecip  = days.slice(0, 2).some(d =>
    (d.precip != null && d.precip >= 40) || precipPatt.test(d.shortFcast || ''));
  const precipToday = days[0] != null && (
    (days[0].precip != null && days[0].precip >= 40) ||
    precipPatt.test(days[0].shortFcast || ''));

  // Post-frontal conditions (after rain clears)
  const dryAfter  = days.slice(1, 3).some(d => d.rh   != null && d.rh   <  40);
  const windAfter = days.slice(1, 3).some(d => d.wind  != null && d.wind > 12);

  // Wind direction shift — current vs day-1 forecast, or day-0 vs day-1
  const fDir0 = days[0]?.windDir != null ? DIR_DEG[days[0].windDir] : null;
  const fDir1 = days[1]?.windDir != null ? DIR_DEG[days[1].windDir] : null;
  // Direction changes in light/variable wind (under 8 mph) aren't operationally meaningful
  const w0 = days[0]?.wind, w1 = days[1]?.wind;
  const windShift = (w1 != null && w1 >= 8) && (
    (windDirDeg != null && wind >= 8 && fDir1 != null && angDiff(windDirDeg, fDir1) >= 90) ||
    (fDir0      != null && w0 != null && w0 >= 8 && fDir1 != null && angDiff(fDir0, fDir1) >= 90)
  );

  // ── Classify ──

  // Most dangerous scenario for EKY: rain clears → cold dry NW wind + cured fuels
  if (precipToday && dryAfter && windAfter) {
    return {
      level: 'critical',
      head:  'POST-FRONTAL DANGER WINDOW',
      body:  'Rain today strips fuel moisture, then clearing behind the front brings dry northwest winds and cured fuel beds — this is historically when EKY\'s worst runs happen. The day after a frontal rain should be treated as high-danger until fuel moisture is confirmed. Don\'t let yesterday\'s rain give false confidence. Confirm LCES before any assignment following clearance.',
    };
  }

  // Pre-frontal: erratic/gusty + storm coming
  if ((erraticNow || gustyNow || windShift) && nearPrecip) {
    return {
      level: 'caution',
      head:  'PRE-FRONTAL CONDITIONS',
      body:  'Winds ahead of an approaching front are erratic and can shift 90° or more with little warning. A fire\'s head can reverse direction in minutes during frontal passage — escape routes and safety zones that looked good before a wind shift have trapped crews. Plan your routes for ALL wind quadrants, not just the current wind. Watch for sudden gusts that feel "wrong" for the prevailing direction — that\'s often the first sign of a shift.',
    };
  }

  // Wind direction shift forecast without obvious precip pattern
  if (windShift) {
    return {
      level: 'caution',
      head:  'WIND DIRECTION SHIFT FORECAST',
      body:  'Wind direction is forecast to change significantly over the next 24 hours. Escape routes and fire perimeter assignments that are safe under current winds may not be safe under the forecast wind. Re-evaluate anchor points, escape routes, and safety zone viability under the new wind direction before committing crews.',
    };
  }

  // Gusty/erratic with no clear frontal pattern
  if (erraticNow) {
    return {
      level: 'info',
      head:  'GUSTY / ERRATIC WINDS',
      body:  'High gust-to-sustained wind ratio indicates unstable air and variable surface winds. Fire direction becomes unpredictable — the head of the fire can shift rapidly, spotting distance increases, and the "safe" flank can become the active flank. Widen your safety margins, stay on a solid anchor, and keep your escape route behind you.',
    };
  }

  return null;
}

function renderFrontNote(note) {
  const el = document.getElementById('frontNote');
  if (!el) return;
  if (!note) { el.style.display = 'none'; return; }
  el.className = `front-note fn-${note.level}`;
  el.innerHTML =
    `<div class="fn-head"><span class="fn-dot"></span><span class="fn-headline">${note.head}</span></div>` +
    `<div class="fn-body">${note.body}</div>`;
  el.style.display = 'block';
}

// ── FEMS predicted NFDRS values (set by fems.js) ──
// Merged into the NWS forecast cards by date. Either fetch can land first,
// so both paths re-render the cards.
let lastDays     = null;
let femsForecast = null; // { byDate: Map(date → row), station }

export function setFemsForecast(rows, station) {
  femsForecast = rows?.length
    ? { byDate: new Map(rows.map(r => [r.date, r])), station }
    : null;
  if (lastDays) renderCards(lastDays);
}

export async function fetchForecast() {
  setSplash('FETCHING 5-DAY FORECAST...', 60);
  const data = await workerFetch(`/forecast?lat=${state.LAT}&lon=${state.LON}`, 'FCST');
  if(!data || !data.days) {
    document.getElementById('fcastTrend').textContent = 'Forecast unavailable.';
    return;
  }

  lastDays = data.days;
  renderCards(lastDays);

  const trendEl = document.getElementById('fcastTrend');
  trendEl.innerHTML = `<span>TREND ANALYSIS:</span> ${data.trend}`;

  renderFrontNote(buildFrontNote(state.wx, lastDays));
}

function renderCards(days) {
  const dow  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  const c_rh   = v => v==null?'var(--muted)':v<35?'var(--red)':v<50?'var(--yellow)':'var(--green)';
  const c_wind = v => v==null?'var(--muted)':v>25?'var(--red)':v>15?'var(--yellow)':'var(--text)';
  // Same thresholds as the dead fuel moisture bars
  const c_fm   = v => v==null?'var(--muted)':v<8?'var(--red)':v<12?'var(--orange)':v<18?'var(--yellow)':'var(--green)';
  const femsRow = (lbl, term, val, unit, color) => `
        <div class="fcastrow">
          <span class="fcastlbl" data-term="${term}">${lbl}</span>
          <div><span class="fcastval" style="color:${color}">${val ?? '—'}</span><span class="fcastunit">${unit}</span></div>
        </div>`;
  const top_color = d => {
    if(d.rh!=null && d.rh<35)   return 'var(--red)';
    if(d.wind!=null && d.wind>25) return 'var(--red)';
    if(d.rh!=null && d.rh<50)   return 'var(--yellow)';
    if(d.wind!=null && d.wind>15) return 'var(--yellow)';
    return 'var(--green)';
  };

  const grid = document.getElementById('fcastGrid');
  grid.innerHTML = days.map(d => {
    const date    = new Date(d.date + 'T12:00:00');
    const dayName = dow[date.getDay()];
    const dateStr = (date.getMonth()+1) + '/' + date.getDate();
    const tc = top_color(d);
    return `
      <div class="fcastday" style="--fc-top:${tc}">
        <div class="fcastdate">${dateStr}</div>
        <div class="fcastdow">${dayName}</div>
        <div class="fcastrow">
          <span class="fcastlbl" data-term="RH">RH</span>
          <div><span class="fcastval" style="color:${c_rh(d.rh)}">${d.rh??'—'}</span><span class="fcastunit">%</span></div>
        </div>
        <div class="fcastrow">
          <span class="fcastlbl">Wind</span>
          <div><span class="fcastval" style="color:${c_wind(d.wind)}">${d.wind??'—'}</span><span class="fcastunit">mph ${d.windDir||''}</span></div>
        </div>
        <div class="fcastrow">
          <span class="fcastlbl">Precip</span>
          <div><span class="fcastval" style="color:var(--text)">${d.precip??'—'}</span><span class="fcastunit">%</span></div>
        </div>
        ${(() => {
          const fx = femsForecast?.byDate.get(d.date);
          if (!fx) return '';
          return `<div class="fcast-fems">
            <div class="fcast-fems-lbl" data-term="FEMS">FEMS PREDICTED</div>
            ${femsRow('1-hr FM',  '1HR',  fx.fm1,  '%', c_fm(fx.fm1))}
            ${femsRow('10-hr FM', '10HR', fx.fm10, '%', c_fm(fx.fm10))}
            ${femsRow('ERC', 'ERC', fx.erc != null ? Math.round(fx.erc) : null, '', c_F(fx.erc))}
            ${femsRow('BI',  'BI',  fx.bi  != null ? Math.round(fx.bi)  : null, '', c_F(fx.bi))}
          </div>`;
        })()}
        <div class="fcastshort">${d.shortFcast||''}</div>
      </div>`;
  }).join('');

  const srcEl = document.getElementById('fcastFemsSrc');
  if (srcEl) {
    srcEl.textContent = femsForecast
      ? `Predicted fuel moisture, ERC & BI: FEMS NFDRS forecast for ${femsForecast.station} RAWS — model output from NWS gridded forecast, not a measurement.`
      : '';
    srcEl.style.display = femsForecast ? 'block' : 'none';
  }
}
