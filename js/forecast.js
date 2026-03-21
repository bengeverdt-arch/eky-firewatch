// ── 5-day fire weather forecast fetch + rendering ──
import { state } from './state.js';
import { workerFetch } from './api.js';
import { setSplash } from './diag.js';

export async function fetchForecast() {
  setSplash('FETCHING 5-DAY FORECAST...', 60);
  const data = await workerFetch(`/forecast?lat=${state.LAT}&lon=${state.LON}`, 'FCST');
  if(!data || !data.days) {
    document.getElementById('fcastTrend').textContent = 'Forecast unavailable.';
    return;
  }

  const days = data.days;
  const dow  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  const c_rh   = v => v==null?'var(--muted)':v<35?'var(--red)':v<50?'var(--yellow)':'var(--green)';
  const c_wind = v => v==null?'var(--muted)':v>25?'var(--red)':v>15?'var(--yellow)':'var(--text)';
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
          <span class="fcastlbl">RH</span>
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
        <div class="fcastshort">${d.shortFcast||''}</div>
      </div>`;
  }).join('');

  const trendEl = document.getElementById('fcastTrend');
  trendEl.innerHTML = `<span>TREND ANALYSIS:</span> ${data.trend}`;
}
