// ── Cloudflare Worker fetch — single point of contact for all API calls ──
import { DIAG } from './diag.js';

const WORKER = 'https://dark-recipe-12d3.bengeverdt.workers.dev';

export async function workerFetch(endpoint, label) {
  const url = `${WORKER}${endpoint}`;
  DIAG.info(label, `GET ${url}`);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      DIAG.err(label, `Worker returned HTTP ${res.status}`, await res.text().catch(()=>''));
      return null;
    }
    const data = await res.json();
    if (data?.error) {
      DIAG.err(label, `Worker error: ${data.message}`, data.detail||'');
      return null;
    }
    DIAG.ok(label, `Success — ${JSON.stringify(data).length} bytes`, JSON.stringify(data).substring(0,120));
    return data;
  } catch(e) {
    DIAG.err(label, `Fetch failed`, e.message);
    return null;
  }
}
