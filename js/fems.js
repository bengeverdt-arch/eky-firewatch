// ── FEMS RAWS fuel moisture fetch + FM bar rendering ──
import { state, RAWS_STATIONS } from './state.js';
import { workerFetch } from './api.js';
import { DIAG, setSplash } from './diag.js';
import { recalc, c_F } from './calc.js';
import { updateMapRawsSelection } from './map.js';

export async function fetchFEMS() {
  setSplash('FETCHING FEMS RAWS FUEL MOISTURE...', 45);
  DIAG.info('FEMS', `Calling Worker /fems endpoint (station ${state.FEMS_STATION})`);

  const data = await workerFetch(`/fems?station=${state.FEMS_STATION}`, 'FEMS');
  if (!data) { useFMEstimate(); return; }

  if (data.header) DIAG.info('FEMS', `CSV columns: ${data.header.join(', ')}`);

  state.fm = {
    fm1:    data.fm1hr,
    fm10:   data.fm10hr,
    fm100:  data.fm100hr,
    fm1000: data.fm1000hr,
    erc:    data.erc,
    bi:     data.bi,
    kbdi:   data.kbdi,
  };

  DIAG.ok('FEMS', `station="${data.stationName}" date="${data.obsDate}" 1hr=${state.fm.fm1} 10hr=${state.fm.fm10} 100hr=${state.fm.fm100} ERC=${state.fm.erc} BI=${state.fm.bi} KBDI=${state.fm.kbdi}`);

  if (state.fm.fm1==null && state.fm.fm10==null && state.fm.fm100==null) {
    DIAG.warn('FEMS','All FM values null — check Worker CSV parsing');
    useFMEstimate(); return;
  }

  document.getElementById('fmSrc').innerHTML =
    `<span style="color:var(--green);font-weight:600">✓ LIVE FEMS RAWS DATA</span><br>` +
    `<span style="color:var(--amber)">${data.stationName}</span> · Station ${state.FEMS_STATION} · ${data.obsDate}`;

  updateFMBars();
}

export async function changeStation(id) {
  state.FEMS_STATION = id;
  const station = RAWS_STATIONS.find(s => s.id === id);
  DIAG.info('RAWS', `Station changed to ${station?.name} (${id})`);
  state.fm = {fm1:null,fm10:null,fm100:null,fm1000:null,erc:null,bi:null,kbdi:null};
  updateFMBars();
  // Sync map markers and dropdown
  updateMapRawsSelection(id);
  const sel = document.getElementById('rawsSelect');
  if (sel) sel.value = id;
  await fetchFEMS();
}

export function useFMEstimate() {
  DIAG.warn('FM-EST','Calculating EMC equilibrium estimate from NWS obs');
  const {rh, temp, precip} = state.wx;
  if(rh==null||temp==null){ DIAG.err('FM-EST','No wx data for EMC calc'); return; }
  let emc;
  if(rh<10)      emc = 0.03229+0.281073*rh-0.000578*temp*rh;
  else if(rh<50) emc = 2.22749+0.160107*rh-0.014784*temp;
  else           emc = 21.0606+0.005565*rh*rh-0.00035*rh*temp-0.483199*rh;
  emc = Math.max(2, Math.min(35, emc));
  const wet = Math.min((precip||0)*8, 15);
  state.fm = {
    fm1:    +((emc+wet*.9).toFixed(1)),
    fm10:   +((emc*1.15+wet*.7).toFixed(1)),
    fm100:  +((emc*1.35+wet*.5).toFixed(1)),
    fm1000: +((emc*1.6+wet*.3).toFixed(1)),
    erc: null, bi: null, kbdi: null
  };
  DIAG.ok('FM-EST',`EMC estimate: 1hr=${state.fm.fm1}% 10hr=${state.fm.fm10}% 100hr=${state.fm.fm100}% 1000hr=${state.fm.fm1000}%`);
  document.getElementById('fmSrc').innerHTML =
    `<span style="color:var(--amber)">⚠ FEMS unavailable — EMC equilibrium estimate from NWS obs.</span><br>`+
    `<span style="color:var(--muted2)">Verify with RAWS or KDF field reading before any ops decision.</span>`;
  updateFMBars();
}

export function updateFMBars() {
  const {fm} = state;
  [{b:'fm1b',v:'fm1v',val:fm.fm1,max:30},{b:'fm10b',v:'fm10v',val:fm.fm10,max:35},
   {b:'fm100b',v:'fm100v',val:fm.fm100,max:40},{b:'fm1000b',v:'fm1000v',val:fm.fm1000,max:50}
  ].forEach(({b,v,val,max})=>{
    const pct = val!=null?Math.min(100,val/max*100):0;
    const c   = val==null?'var(--muted2)':val<8?'var(--red)':val<12?'var(--orange)':val<18?'var(--yellow)':'var(--green)';
    const bar = document.getElementById(b); if(bar){ bar.style.width=pct+'%'; bar.style.background=c; }
    const vel = document.getElementById(v); if(vel){ vel.textContent=val!=null?val.toFixed(1)+'%':'—'; vel.style.color=c; }
  });
  if(fm.erc!=null){
    document.getElementById('fmERC').textContent=fm.erc.toFixed(0);
    document.getElementById('fmERC').style.color=c_F(fm.erc);
  }
  if(fm.bi!=null){
    document.getElementById('fmBI').textContent=fm.bi.toFixed(0);
    document.getElementById('fmBI').style.color=c_F(fm.bi);
  }
  if(fm.kbdi!=null){
    document.getElementById('fmKBDI').textContent=fm.kbdi.toFixed(0);
    document.getElementById('fmKBDI').style.color=fm.kbdi>400?'var(--red)':fm.kbdi>200?'var(--orange)':'var(--green)';
  }
  recalc();
}
