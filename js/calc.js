// ── Fire behavior calculations + UI color helpers ──
import { state } from './state.js';

// ── Color helpers ──
export const c_T  = v => v>95?'var(--red)':v>85?'var(--orange)':v>75?'var(--amber)':'var(--text)';
export const c_RH = v => v<20?'var(--red)':v<30?'var(--orange)':v<40?'var(--yellow)':'var(--green)';
export const c_W  = v => v>30?'var(--red)':v>20?'var(--orange)':v>12?'var(--yellow)':'var(--text)';
export const c_F  = v => v==null?'var(--muted)':v>70?'var(--red)':v>40?'var(--orange)':'var(--green)';
export const d2c  = d => {
  if(d==null) return '—';
  return ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(d/22.5)%16];
};

export function setV(id, val, fn) {
  const el = document.getElementById(id); if(!el) return;
  el.textContent = val != null ? val : '—';
  if(fn && val != null) el.style.color = fn(val);
}

// ── Fire Weather Index (simplified Fosberg FWI) ──
export function calcFWI(t, rh, w) {
  if(t==null||rh==null||w==null) return null;
  const mc = Math.max(2, 10*Math.exp((rh-100)/10)+0.5*(t-60)*0.05);
  const eta = Math.max(0, Math.min(1, 1-2*(mc/30)+1.5*(mc/30)**2-0.5*(mc/30)**3));
  return Math.round(eta*Math.sqrt(1+w*w)/0.3002);
}

export function getRating(f) {
  if(f==null) return{lbl:'—',c:'var(--muted)',pct:0,lvl:-1,summary:'Awaiting live weather data...'};
  if(f<20)   return{lbl:'LOW',c:'var(--green)',pct:f/20*20,lvl:0,summary:'Low fire danger. Fuels relatively moist. Normal crew protocols in effect.'};
  if(f<40)   return{lbl:'MODERATE',c:'var(--yellow)',pct:20+(f-20)/20*20,lvl:1,summary:'Moderate danger. Unattended fires may escape. Identify escape routes and safety zones.'};
  if(f<60)   return{lbl:'HIGH',c:'var(--orange)',pct:40+(f-40)/20*20,lvl:2,summary:'High danger. Fires start easily, spread quickly on slopes and ridges. LCES required.'};
  if(f<80)   return{lbl:'VERY HIGH',c:'var(--red)',pct:60+(f-60)/20*20,lvl:3,summary:'Very high danger. Rapid spread, spotting likely. Crew safety is priority — no fire is worth a life.'};
  return{lbl:'EXTREME',c:'var(--extreme)',pct:Math.min(100,80+(f-80)/20*20),lvl:4,summary:'EXTREME — Near/at Red Flag criteria. All fires potentially uncontrollable. Review LCES with full crew before any engagement.'};
}

function buildDangerSummary(r, wx, fm) {
  if (r.lvl < 2) return r.summary; // LOW / MODERATE — static is fine

  const {rh, wind} = wx;
  const {fm1} = fm;
  const parts = [];

  if (rh  != null && rh  < 30) parts.push(`RH at ${rh}%`);
  if (wind != null && wind > 12) parts.push(`${wind} mph winds`);
  if (fm1  != null && fm1 < 8)  parts.push(`1-hr fuels at ${fm1}%`);

  if (!parts.length) return r.summary;

  const cond = parts.join(', ');
  if (r.lvl === 4) return `${cond} — near Red Flag criteria. All fires potentially uncontrollable. Crew safety overrides all other objectives. Review LCES with full crew before any engagement.`;
  if (r.lvl === 3) return `${cond} — rapid spread and spotting expected. Confirm escape routes and safety zones before engagement. No fire is worth a life.`;
  return `${cond} — fires start easily and spread quickly on slopes and ridges. LCES required on all assignments.`;
}

export function recalc() {
  const {wx, fm} = state;
  const f = calcFWI(wx.temp, wx.rh, wx.wind);
  const r = getRating(f);
  const rEl = document.getElementById('dRating');
  rEl.textContent = r.lbl; rEl.style.color = r.c;
  document.getElementById('dFWI').textContent = `FWI: ${f??'—'}`;
  document.getElementById('dSummary').textContent = buildDangerSummary(r, wx, fm);
  document.getElementById('dBar').style.cssText = `width:${Math.max(1,r.pct)}%;background:${r.c}`;
  ['dl0','dl1','dl2','dl3','dl4'].forEach((id,i)=>document.getElementById(id).classList.toggle('act',i===r.lvl));

  const ip = wx.temp&&wx.rh&&fm.fm1?Math.round(Math.max(0,Math.min(100,100*(1-fm.fm1/30)*(1+(wx.temp-60)/120)*(1-wx.rh/100)))):null;
  const si = wx.wind&&fm.fm1?Math.round(Math.max(0,wx.wind*(1-fm.fm1/30)*1.2)):null;
  const erc = fm.erc??(wx.temp&&fm.fm10&&fm.fm100?Math.round(Math.max(0,100*(1-fm.fm10/40)*(1-fm.fm100/50)*(1+(wx.temp-60)/120))):null);
  const bi = fm.bi??null;

  const setFact = (cid, vid, val, disp) => {
    const c = c_F(val);
    const card = document.getElementById(cid); if(card) card.style.setProperty('--fc',c);
    const vel  = document.getElementById(vid);  if(vel)  { vel.textContent=disp??'—'; vel.style.color=c; }
  };
  setFact('fc0','fv0',ip, ip!=null?ip+'%':null);
  setFact('fc1','fv1',si, si);
  setFact('fc2','fv2',erc,erc);
  setFact('fc3','fv3',bi, bi);
}
