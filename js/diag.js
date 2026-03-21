// ── Diagnostics engine + splash helpers ──

export const DIAG = {
  entries: [],
  log(level, source, message, detail='') {
    const ts = new Date().toLocaleTimeString('en-US',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'});
    this.entries.push({ts, level, source, message, detail});
    this.render();
  },
  ok(src, msg, detail='')   { this.log('OK',   src, msg, detail); },
  err(src, msg, detail='')  { this.log('ERR',  src, msg, detail); },
  warn(src, msg, detail='') { this.log('WARN', src, msg, detail); },
  info(src, msg, detail='') { this.log('INFO', src, msg, detail); },
  render() {
    const el = document.getElementById('diagLog');
    if (!el) return;
    const colorMap = { OK:'log-ok', ERR:'log-err', WARN:'log-warn', INFO:'log-info' };
    el.innerHTML = this.entries.map(e => {
      const cls = colorMap[e.level] || 'log-info';
      const det = e.detail ? `\n          ${e.detail.substring(0,200)}` : '';
      return `<span class="${cls}">[${e.ts}] [${e.level.padEnd(4)}] [${e.source.padEnd(12)}] ${e.message}${det}</span>`;
    }).join('\n');
    el.scrollTop = el.scrollHeight;
    this.updateSummary();
  },
  updateSummary() {
    const el = document.getElementById('diagSummary');
    if (!el) return;
    const oks  = this.entries.filter(e=>e.level==='OK').length;
    const errs = this.entries.filter(e=>e.level==='ERR').length;
    const warns= this.entries.filter(e=>e.level==='WARN').length;
    const last = this.entries[this.entries.length-1];
    el.innerHTML = `
      <strong>Status:</strong> ${oks} OK · ${errs} errors · ${warns} warnings<br>
      <strong>Last event:</strong> ${last ? `[${last.level}] ${last.source} — ${last.message}` : 'none'}<br>
      <strong>Total log entries:</strong> ${this.entries.length}<br>
      <span style="color:var(--muted2)">Paste this log to Claude to diagnose any issues.</span>
    `;
  },
  toText() {
    return 'EKY FIRE WATCH v4 — DIAGNOSTICS LOG\n' +
           '====================================\n' +
           `Generated: ${new Date().toISOString()}\n\n` +
           this.entries.map(e =>
             `[${e.ts}] [${e.level}] [${e.source}] ${e.message}${e.detail ? '\n  DETAIL: '+e.detail : ''}`
           ).join('\n');
  }
};

export function openDiag()  { document.getElementById('diagPanel').classList.remove('hidden'); DIAG.render(); }
export function closeDiag() { document.getElementById('diagPanel').classList.add('hidden'); }
export function copyLog()   {
  navigator.clipboard.writeText(DIAG.toText()).then(()=>{
    const btn = document.querySelector('.da-copy');
    btn.textContent = '✓ COPIED!';
    setTimeout(()=>btn.textContent='📋 COPY LOG TO CLIPBOARD', 2000);
  }).catch(()=> alert('Copy failed — select the log text manually'));
}

// ── Splash helpers (used by wx, fems, forecast, main) ──
export function setSplash(msg, pct) {
  const el = document.getElementById('spMsg'); if(el) el.textContent = msg;
  const bar = document.getElementById('spFill'); if(bar && pct != null) bar.style.width = pct + '%';
}
export function dismissSplash() {
  setSplash('COMPLETE', 100);
  setTimeout(()=>{
    const el = document.getElementById('splash');
    if(el){ el.classList.add('out'); setTimeout(()=>{ if(el) el.style.display='none'; }, 600); }
  }, 400);
}
