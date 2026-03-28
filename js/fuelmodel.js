// ── LANDFIRE FBFM40 point query — READ Option B ──
import { state } from './state.js';
import { workerFetch } from './api.js';
import { DIAG } from './diag.js';
import { computeRead } from './read.js';

// Group colors match the FBFM40 legend in the map
const GROUP_COLOR = {
  NB: 'var(--muted)',
  GR: '#c8c800',
  GS: '#c8a000',
  SH: '#c86000',
  TU: '#a07840',
  TL: '#604020',
  SB: '#900090',
};

export async function fetchFuelModel(lat, lon) {
  const data = await workerFetch(`/fuel-model?lat=${lat}&lon=${lon}`, 'FUEL');
  if (!data) return;

  state.fuelModel = data;
  DIAG.ok('FUEL', `${data.name} (code ${data.code}) — ${data.desc}`);

  const bar  = document.getElementById('fuelModelBar');
  const code = document.getElementById('fmAtCode');
  const name = document.getElementById('fmAtName');
  const desc = document.getElementById('fmAtDesc');
  if (!bar || !code || !name || !desc) return;

  const color = GROUP_COLOR[data.group] ?? 'var(--text)';
  code.textContent  = data.burnable ? `FBFM40 · ${data.code}` : `FBFM40 · ${data.code} · NON-BURNABLE`;
  code.style.color  = data.burnable ? color : 'var(--muted)';
  name.textContent  = data.name;
  name.style.color  = color;
  desc.textContent  = data.desc;
  bar.style.display = 'block';

  computeRead();
}
