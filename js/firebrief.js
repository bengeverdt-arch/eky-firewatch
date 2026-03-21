// ── NWS Fire Weather Brief (FWF text product) fetch + rendering ──
import { workerFetch } from './api.js';
import { DIAG } from './diag.js';

export function openBrief()  { document.getElementById('briefPanel').classList.remove('hidden'); }
export function closeBrief() { document.getElementById('briefPanel').classList.add('hidden'); }

export async function fetchFireBrief() {
  DIAG.info('FWF', 'Fetching NWS Fire Weather Forecast text from LMK office');

  const data = await workerFetch('/fire-brief', 'FWF');
  const metaEl  = document.getElementById('briefMeta');
  const textEl  = document.getElementById('briefText');
  const alertEl = document.getElementById('briefAlert');
  const btn     = document.getElementById('briefBtn');
  const box     = document.querySelector('.briefbox');

  if (!data || !data.text) {
    DIAG.warn('FWF', 'No fire brief available');
    if (metaEl) metaEl.textContent = 'LMK · Unavailable';
    if (textEl) textEl.textContent = 'Fire weather brief unavailable. Check NWS Louisville directly.';
    return;
  }

  DIAG.ok('FWF', `Loaded FWF product ${data.productId}, issued ${data.issuedAt}`);

  if (metaEl) {
    const ts = data.issuedAt ? new Date(data.issuedAt) : null;
    const tsStr = ts
      ? ts.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '—';
    metaEl.textContent = `${data.office || 'LMK'} · Issued ${tsStr}`;
  }

  // Detect RED FLAG / CRITICAL language
  const upper = (data.text || '').toUpperCase();
  const isRedFlag = /RED FLAG WARNING|FIRE WEATHER WATCH|CRITICAL FIRE/.test(upper);

  if (alertEl) {
    if (isRedFlag) {
      alertEl.textContent = '⚠ RED FLAG / CRITICAL CONDITIONS — See full brief for details';
      alertEl.classList.add('show');
      DIAG.warn('FWF', 'RED FLAG or CRITICAL language detected in FWF product');
    } else {
      alertEl.classList.remove('show');
    }
  }

  // Update header button — pulses red when RED FLAG is active
  if (btn) {
    if (isRedFlag) {
      btn.classList.add('redflag');
      btn.textContent = '⚠ FIRE BRIEF';
    } else {
      btn.classList.remove('redflag');
      btn.textContent = '📋 FIRE BRIEF';
    }
  }

  // Update modal border
  if (box) box.classList.toggle('redflag', isRedFlag);

  if (textEl) {
    // Strip teletype header lines, keep readable content
    const lines = data.text.split('\n');
    const startIdx = lines.findIndex(l => /FIRE WEATHER|SYNOPSIS|DISCUSSION|FORECAST/.test(l.toUpperCase()));
    const cleaned = (startIdx > 0 ? lines.slice(startIdx) : lines).join('\n').trim();
    textEl.textContent = cleaned || data.text;
  }
}
