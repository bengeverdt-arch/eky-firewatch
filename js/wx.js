// ── NWS weather fetch + wx card rendering ──
import { state } from './state.js';
import { workerFetch } from './api.js';
import { DIAG, setSplash } from './diag.js';
import { recalc, c_T, c_RH, c_W, d2c, setV } from './calc.js';

export async function fetchNWS() {
  setSplash('FETCHING NWS WEATHER DATA...', 15);
  DIAG.info('NWS', `Calling Worker /nws endpoint`);

  const data = await workerFetch(`/nws?lat=${state.LAT}&lon=${state.LON}`, 'NWS');
  if (!data) { setWxFallback(); return; }

  state.wx = {
    temp:       data.temp,
    rh:         data.rh,
    wind:       data.wind,
    gust:       data.gust,
    dew:        data.dew,
    precip:     data.precip,
    windDirDeg: data.windDir,
  };

  DIAG.ok('NWS', `temp=${state.wx.temp}°F rh=${state.wx.rh}% wind=${state.wx.wind}mph gust=${state.wx.gust}mph dew=${state.wx.dew}°F`);

  document.getElementById('stName').textContent =
    `${data.station?.name || '—'} (${data.station?.id || '—'})`;
  document.getElementById('hRaws').textContent = data.station?.id || '—';
  document.getElementById('wxLocName').textContent = data.station?.name || 'UNKNOWN';
  document.getElementById('wxLocSub').textContent = `${state.LAT.toFixed(3)}°N ${Math.abs(state.LON).toFixed(3)}°W`;

  const ts = data.timestamp ? new Date(data.timestamp) : null;
  if(ts) document.getElementById('hUpdated').textContent =
    ts.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}) + ' ' +
    ts.toLocaleDateString('en-US',{month:'short',day:'numeric'});

  updateWxCards();
  if(state.wx.windDirDeg != null) autoWindDir(state.wx.windDirDeg);

  // Alerts non-blocking
  workerFetch('/alerts','NWS-ALRT').then(showAlerts).catch(e=>DIAG.warn('NWS-ALRT','Alert fetch error',e.message));
}

export function setWxFallback() {
  DIAG.warn('NWS','Using hardcoded fallback values — wx data unavailable');
  state.wx = {temp:72,rh:38,wind:12,gust:18,dew:42,precip:0,windDirDeg:225};
  document.getElementById('stName').textContent='API unavailable — estimated values';
  document.getElementById('hRaws').textContent='OFFLINE';
  updateWxCards();
}

export function updateWxCards() {
  const {wx} = state;
  setV('wTemp', wx.temp, c_T);
  document.getElementById('wTempSub').textContent = wx.temp!=null?`${((wx.temp-32)*5/9).toFixed(1)}°C`:'—';
  setV('wRH', wx.rh, c_RH);
  document.getElementById('wRHSub').textContent = wx.rh!=null?(wx.rh<25?'⚠ CRITICALLY LOW':wx.rh<35?'LOW':wx.rh<60?'Moderate':'High'):'—';
  setV('wWind', wx.wind, c_W);
  document.getElementById('wWindDir').textContent = wx.windDirDeg!=null?`FROM ${d2c(wx.windDirDeg)}`:'—';
  setV('wGust', wx.gust!=null?wx.gust:'N/A', v=>v==='N/A'?'var(--muted)':c_W(v));
  setV('wDew', wx.dew, ()=>'#00b894');
  document.getElementById('wDewSub').textContent = wx.dew!=null?(wx.dew>50?'Humid':wx.dew>35?'Moderate':'Dry'):'—';
  setV('wPrecip', wx.precip!=null?wx.precip.toFixed(2):'0.00', ()=>'#74b9ff');
  recalc();
}

export function autoWindDir(deg) {
  const dirs = [0,45,90,135,180,225,270,315];
  let best=90, min=999;
  dirs.forEach(d=>{ const diff=Math.abs(((deg-d+540)%360)-180); if(diff<min){min=diff;best=d} });
  state.windDeg = best;
  document.querySelectorAll('#dbtns .dbtn').forEach((b,i)=>b.classList.toggle('act',dirs[i]===best));
}

export function showAlerts(data) {
  if(!data) return;
  const box = document.getElementById('alertBox');
  if(!data.count){ box.style.display='none'; DIAG.info('NWS-ALRT','No active alerts'); return; }
  DIAG.ok('NWS-ALRT',`${data.count} active alert(s)`);
  box.style.display = 'block';
  box.innerHTML = (data.alerts||[]).slice(0,3).map(a=>
    `<div class="aitem ${a.isFire?'crit':''}"><div class="ahead">🚨 ${a.event}</div>${(a.headline||'').substring(0,150)}</div>`
  ).join('');
}
