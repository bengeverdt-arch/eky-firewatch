// ── NWS Fire Weather Brief (FWF text product) fetch + rendering ──
import { workerFetch } from './api.js';
import { DIAG } from './diag.js';

export async function fetchFireBrief() {
  DIAG.info('FWF', 'Fetching NWS Fire Weather Forecast text from LMK office');

  const data = await workerFetch('/fire-brief', 'FWF');
  const meta = document.getElementById('briefMeta');
  const textEl = document.getElementById('briefText');
  const badgeEl = document.getElementById('briefBadge');
  const alertEl = document.getElementById('briefAlert');

  if (!data || !data.text) {
    DIAG.warn('FWF', 'No fire brief available');
    if (textEl) textEl.textContent = 'Fire weather brief unavailable. Check NWS Louisville directly.';
    if (badgeEl) badgeEl.textContent = 'LMK · UNAVAILABLE';
    return;
  }

  DIAG.ok('FWF', `Loaded FWF product ${data.productId}, issued ${data.issuedAt}`);

  if (badgeEl) {
    const ts = data.issuedAt ? new Date(data.issuedAt) : null;
    const tsStr = ts
      ? ts.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '—';
    badgeEl.textContent = `${data.office || 'LMK'} · ${tsStr}`;
  }

  if (meta) {
    const ts = data.issuedAt ? new Date(data.issuedAt) : null;
    meta.innerHTML =
      `<span class="brief-office">${data.office || 'KLMK'}</span>` +
      (ts ? `<span class="brief-issued">Issued ${ts.toLocaleString('en-US',{weekday:'short',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span>` : '');
  }

  // Highlight RED FLAG or CRITICAL conditions
  const upper = (data.text || '').toUpperCase();
  if (alertEl) {
    if (/RED FLAG WARNING|FIRE WEATHER WATCH|CRITICAL/.test(upper)) {
      alertEl.textContent = '⚠ RED FLAG / CRITICAL CONDITIONS IN EFFECT';
      alertEl.classList.add('show');
      DIAG.warn('FWF', 'RED FLAG or CRITICAL language detected in FWF product');
    } else {
      alertEl.classList.remove('show');
    }
  }

  if (textEl) {
    // Strip teletype header lines, keep readable content
    const lines = data.text.split('\n');
    const startIdx = lines.findIndex(l => /FIRE WEATHER|SYNOPSIS|DISCUSSION|FORECAST/.test(l.toUpperCase()));
    const cleaned = (startIdx > 0 ? lines.slice(startIdx) : lines).join('\n').trim();
    textEl.textContent = cleaned || data.text;
  }
}
