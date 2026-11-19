// ── Fire danger indices panel + shared UI color helpers ──
// No invented rating: this panel shows official NFDRS values from FEMS,
// how they compare with the same time of year at the station, and a
// plain check of current readings against NWS Jackson's Red Flag criteria.
import { state } from './state.js';

// ── Color helpers ──
export const c_T  = v => v>95?'var(--red)':v>85?'var(--orange)':v>75?'var(--amber)':'var(--text)';
export const c_RH = v => v<20?'var(--red)':v<30?'var(--orange)':v<40?'var(--yellow)':'var(--green)';
export const c_W  = v => v>30?'var(--red)':v>20?'var(--orange)':v>12?'var(--yellow)':'var(--text)';
export const d2c  = d => {
  if(d==null) return '—';
  return ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(d/22.5)%16];
};

export function setV(id, val, fn) {
  const el = document.getElementById(id); if(!el) return;
  el.textContent = val != null ? val : '—';
  if(fn && val != null) el.style.color = fn(val);
}

// ── Station history comparison ──
// Percent of same-time-of-year days at this station with a LOWER value.
export function pctOf(kind, v) {
  const arr = state.clim?.data?.[kind];
  if (v == null || !arr?.length) return null;
  let below = 0, equal = 0;
  for (const x of arr) { if (x < v) below++; else if (x === v) equal++; }
  return Math.round(100 * (below + equal / 2) / arr.length);
}

const pctColor = p => p==null ? 'var(--text)' : p>=90 ? 'var(--red)' : p>=75 ? 'var(--orange)' : 'var(--text)';
// Color an ERC/BI value by where it falls in station history (neutral if no history)
export const idxColor = (kind, v) => v==null ? 'var(--muted)' : pctColor(pctOf(kind, v));

function pctPhrase(p) {
  if (p >= 97) return 'Near the highest on record for this time of year';
  if (p >= 90) return 'Top 10% for this time of year';
  if (p >= 75) return 'Higher than usual for this time of year';
  if (p >= 25) return 'Typical for this time of year';
  return 'Lower than usual for this time of year';
}

function windowLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const f = off => new Date(d.getTime() + off*86400000).toLocaleDateString('en-US',{month:'short',day:'numeric'});
  return `${f(-15)} – ${f(15)}`;
}

function renderIndex(kind, v) {
  const valEl = document.getElementById(`${kind}Val`);
  const mark  = document.getElementById(`${kind}Mark`);
  const cmp   = document.getElementById(`${kind}Cmp`);
  if (!valEl || !mark || !cmp) return;

  valEl.textContent = v != null ? Math.round(v) : '—';
  valEl.style.color = idxColor(kind, v);

  const p = pctOf(kind, v);
  const c = state.clim;
  if (p == null) {
    mark.style.display = 'none';
    cmp.textContent = v == null ? 'No FEMS value for this station today.'
      : c?.failed ? 'Station history unavailable — no comparison possible.'
      : 'Loading station history…';
    return;
  }
  mark.style.display = 'block';
  mark.style.left = `${Math.min(98, Math.max(2, p))}%`;
  mark.style.background = pctColor(p);
  cmp.innerHTML = `<b style="color:${pctColor(p)}">${pctPhrase(p)}.</b> `
    + `Higher than ${p}% of ${windowLabel(c.date)} days at ${state.fm.station || 'this station'}, ${c.data.firstYear}–${c.data.lastYear}.`;
}

// ── NWS Jackson (JKL) Red Flag criteria — check against current readings ──
function renderRedFlag() {
  const {wx, fm} = state;
  const rows = [
    { id:'rf10',   val: fm.fm10, ok: v => v <= 8,  fmt: v => `${v.toFixed(1)}%` },
    { id:'rfRH',   val: wx.rh,   ok: v => v <= 25, fmt: v => `${v}%` },
    { id:'rfWind', val: wx.wind, ok: v => v >= 15, fmt: v => `${v} mph` },
  ];
  let met = 0, known = 0;
  for (const r of rows) {
    const el = document.getElementById(r.id); if (!el) continue;
    const has = r.val != null, hit = has && r.ok(r.val);
    if (has) known++;
    if (hit) met++;
    el.classList.toggle('met', hit);
    el.querySelector('.rfmark').textContent = !has ? '?' : hit ? '✓' : '✗';
    el.querySelector('.rfval').textContent  = has ? r.fmt(r.val) : 'no data';
  }
  const sum = document.getElementById('rfSum'); if (!sum) return;
  const lead = known < 3 ? `${met} of 3 met (${3-known} unknown).` : `${met} of 3 met.`;
  sum.innerHTML = `<b>${lead}</b> NWS considers a Red Flag Warning when all three line up. `
    + `This only checks current readings — official warnings appear in the alert box under Live Conditions.`;
}

// Name kept from the old rating code: fems.js / wx.js / main.js call recalc() when data changes
export function recalc() {
  const intro = document.getElementById('dIntro');
  if (intro) intro.textContent = state.fm.station
    ? `Official NFDRS values from ${state.fm.station} RAWS${state.fm.obsDate ? ` (${state.fm.obsDate})` : ''}, compared with the same time of year in past seasons.`
    : 'Official NFDRS values from the selected RAWS, compared with the same time of year in past seasons.';
  renderIndex('erc', state.fm.erc);
  renderIndex('bi',  state.fm.bi);

  const fl = document.getElementById('biFlame');
  if (fl) fl.textContent = state.fm.bi != null
    ? `Rough guide: BI ÷ 10 ≈ ${Math.max(1, Math.round(state.fm.bi/10))} ft flames at the head of a fire in this station's reference fuels.`
    : '';
  renderRedFlag();
}
