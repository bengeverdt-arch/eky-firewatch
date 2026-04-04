// ── READ — Rothermel Evaluated Active Decision-support ──
// Rothermel (1972) surface fire spread + Anderson (1983) spread ellipse
import { state }       from './state.js';
import { DIAG }        from './diag.js';
import { workerFetch } from './api.js';

// ─── FBFM40 FUEL PARAMETERS (Scott & Burgan 2005) ─────────────────────────
// w = tons/acre | sav = ft²/ft³ | depth = ft | Mx = % dead extinction
const FP = {
  // Original 13
  1:  {w1:.034,w10:0,    w100:0,    wLH:.034, wLW:0,    sav1:3500,savLH:1500,savLW:0,   depth:1.0,Mx:12},
  2:  {w1:.046,w10:.023, w100:0,    wLH:.023, wLW:.023, sav1:3000,savLH:1500,savLW:1500,depth:1.0,Mx:15},
  3:  {w1:.138,w10:0,    w100:0,    wLH:.414, wLW:0,    sav1:1500,savLH:1500,savLW:0,   depth:2.5,Mx:25},
  4:  {w1:.230,w10:.184, w100:.092, wLH:0,    wLW:.230, sav1:2000,savLH:0,   savLW:1500,depth:6.0,Mx:20},
  5:  {w1:.046,w10:.023, w100:0,    wLH:0,    wLW:.092, sav1:2000,savLH:0,   savLW:1500,depth:2.0,Mx:20},
  6:  {w1:.069,w10:.115, w100:.046, wLH:0,    wLW:0,    sav1:1750,savLH:0,   savLW:0,   depth:2.5,Mx:25},
  7:  {w1:.052,w10:.086, w100:.069, wLH:0,    wLW:.017, sav1:1750,savLH:0,   savLW:1550,depth:2.5,Mx:40},
  8:  {w1:.069,w10:.046, w100:.115, wLH:0,    wLW:0,    sav1:2000,savLH:0,   savLW:0,   depth:0.2,Mx:30},
  9:  {w1:.134,w10:.019, w100:.007, wLH:0,    wLW:0,    sav1:2500,savLH:0,   savLW:0,   depth:0.2,Mx:25},
  10: {w1:.138,w10:.092, w100:.230, wLH:0,    wLW:.092, sav1:2000,savLH:0,   savLW:1500,depth:1.0,Mx:25},
  11: {w1:.069,w10:.207, w100:.621, wLH:0,    wLW:0,    sav1:1500,savLH:0,   savLW:0,   depth:1.0,Mx:15},
  12: {w1:.184,w10:.644, w100:.759, wLH:0,    wLW:0,    sav1:1500,savLH:0,   savLW:0,   depth:2.3,Mx:20},
  13: {w1:.322,w10:1.058,w100:1.288,wLH:0,    wLW:0,    sav1:1500,savLH:0,   savLW:0,   depth:3.0,Mx:25},
  // GR — Grass
  101:{w1:.010,w10:0,    w100:0,    wLH:.034, wLW:0,    sav1:2200,savLH:2000,savLW:0,   depth:0.4,Mx:15},
  102:{w1:.046,w10:0,    w100:0,    wLH:.046, wLW:0,    sav1:2000,savLH:1800,savLW:0,   depth:1.0,Mx:15},
  103:{w1:.023,w10:.023, w100:0,    wLH:.152, wLW:0,    sav1:1500,savLH:1300,savLW:0,   depth:2.0,Mx:30},
  104:{w1:.023,w10:0,    w100:0,    wLH:.368, wLW:0,    sav1:2000,savLH:1800,savLW:0,   depth:2.0,Mx:15},
  105:{w1:.023,w10:.023, w100:0,    wLH:.230, wLW:0,    sav1:1800,savLH:1600,savLW:0,   depth:4.0,Mx:40},
  106:{w1:.023,w10:.023, w100:0,    wLH:.152, wLW:0,    sav1:2200,savLH:2000,savLW:0,   depth:3.5,Mx:40},
  107:{w1:.045,w10:.045, w100:0,    wLH:.598, wLW:0,    sav1:2000,savLH:1800,savLW:0,   depth:3.0,Mx:15},
  108:{w1:.045,w10:.045, w100:0,    wLH:.920, wLW:0,    sav1:1500,savLH:1300,savLW:0,   depth:4.0,Mx:30},
  109:{w1:.046,w10:.046, w100:.046, wLH:1.104,wLW:0,    sav1:1800,savLH:1600,savLW:0,   depth:5.0,Mx:40},
  // GS — Grass-Shrub
  121:{w1:.046,w10:.023, w100:0,    wLH:.023, wLW:.046, sav1:2000,savLH:1800,savLW:1800,depth:0.9,Mx:15},
  122:{w1:.046,w10:.046, w100:0,    wLH:.046, wLW:.230, sav1:2000,savLH:1800,savLW:1800,depth:1.5,Mx:15},
  123:{w1:.046,w10:.046, w100:0,    wLH:.121, wLW:.046, sav1:1800,savLH:1600,savLW:1600,depth:1.8,Mx:40},
  124:{w1:.121,w10:.085, w100:.085, wLH:.230, wLW:.690, sav1:1800,savLH:1600,savLW:1600,depth:2.1,Mx:40},
  // SH — Shrub
  141:{w1:.023,w10:.023, w100:0,    wLH:.025, wLW:.250, sav1:2000,savLH:1800,savLW:1600,depth:1.0,Mx:15},
  142:{w1:.069,w10:.115, w100:.046, wLH:0,    wLW:.299, sav1:2000,savLH:0,   savLW:1600,depth:1.0,Mx:15},
  143:{w1:.207,w10:0,    w100:0,    wLH:0,    wLW:.138, sav1:1600,savLH:0,   savLW:1400,depth:2.4,Mx:40},
  144:{w1:.092,w10:.023, w100:0,    wLH:0,    wLW:.368, sav1:2000,savLH:0,   savLW:1600,depth:3.0,Mx:30},
  145:{w1:.161,w10:.276, w100:0,    wLH:0,    wLW:.138, sav1:750, savLH:0,   savLW:1600,depth:6.0,Mx:15},
  146:{w1:.276,w10:0,    w100:0,    wLH:0,    wLW:.552, sav1:750, savLH:0,   savLW:1600,depth:2.0,Mx:30},
  147:{w1:.138,w10:.921, w100:.046, wLH:0,    wLW:1.058,sav1:750, savLH:0,   savLW:1600,depth:6.0,Mx:15},
  148:{w1:.276,w10:.138, w100:.092, wLH:0,    wLW:.828, sav1:750, savLH:0,   savLW:1600,depth:3.0,Mx:40},
  149:{w1:.138,w10:.552, w100:.184, wLH:.092, wLW:1.565,sav1:750, savLH:1800,savLW:1500,depth:4.4,Mx:40},
  // TU — Timber-Understory
  161:{w1:.045,w10:.034, w100:0,    wLH:.034, wLW:.121, sav1:2000,savLH:1500,savLW:1500,depth:0.6,Mx:20},
  162:{w1:.109,w10:.015, w100:.030, wLH:0,    wLW:.121, sav1:2000,savLH:0,   savLW:1500,depth:1.0,Mx:30},
  163:{w1:.138,w10:.092, w100:.023, wLH:.046, wLW:.092, sav1:1750,savLH:1500,savLW:1500,depth:1.3,Mx:30},
  164:{w1:.236,w10:0,    w100:0,    wLH:.095, wLW:.236, sav1:2300,savLH:2000,savLW:1500,depth:0.5,Mx:12},
  165:{w1:.230,w10:.184, w100:.092, wLH:.230, wLW:.230, sav1:1500,savLH:750, savLW:1500,depth:1.0,Mx:25},
  // TL — Timber Litter
  181:{w1:.045,w10:.085, w100:.085, wLH:0,    wLW:0,    sav1:2000,savLH:0,   savLW:0,   depth:0.2,Mx:30},
  182:{w1:.045,w10:.085, w100:.085, wLH:0,    wLW:0,    sav1:2000,savLH:0,   savLW:0,   depth:0.2,Mx:25},
  183:{w1:.046,w10:.092, w100:.092, wLH:0,    wLW:0,    sav1:2000,savLH:0,   savLW:0,   depth:0.3,Mx:20},
  184:{w1:.023,w10:.184, w100:.092, wLH:0,    wLW:0,    sav1:2000,savLH:0,   savLW:0,   depth:0.4,Mx:25},
  185:{w1:.092,w10:.230, w100:.092, wLH:0,    wLW:0,    sav1:2000,savLH:0,   savLW:0,   depth:0.6,Mx:25},
  186:{w1:.092,w10:.184, w100:0,    wLH:0,    wLW:0,    sav1:2000,savLH:0,   savLW:0,   depth:0.2,Mx:25},
  187:{w1:.046,w10:.230, w100:.230, wLH:0,    wLW:.092, sav1:2000,savLH:0,   savLW:1500,depth:0.2,Mx:25},
  188:{w1:.134,w10:.184, w100:.230, wLH:0,    wLW:0,    sav1:2000,savLH:0,   savLW:0,   depth:0.3,Mx:35},
  189:{w1:.134,w10:.252, w100:.336, wLH:0,    wLW:0,    sav1:2000,savLH:0,   savLW:0,   depth:0.6,Mx:35},
  // SB — Slash-Blowdown
  201:{w1:.069,w10:.138, w100:.920, wLH:0,    wLW:0,    sav1:2000,savLH:0,   savLW:0,   depth:1.0,Mx:25},
  202:{w1:.207,w10:.207, w100:.414, wLH:0,    wLW:0,    sav1:2000,savLH:0,   savLW:0,   depth:1.0,Mx:25},
  203:{w1:.138,w10:.414, w100:1.105,wLH:0,    wLW:0,    sav1:2000,savLH:0,   savLW:0,   depth:1.2,Mx:25},
  204:{w1:.230,w10:.230, w100:.575, wLH:0,    wLW:0,    sav1:2000,savLH:0,   savLW:0,   depth:2.7,Mx:25},
};

// Wind adjustment factor by group (20-ft wind to midflame)
const WAF = {GR:.36, GS:.32, SH:.28, TU:.22, TL:.15, SB:.15};

const TA2    = 2000/43560; // tons/acre to lb/ft²
const RHO_P  = 32;         // particle density, lb/ft³
const S_T    = 0.0555;
const S_E    = 0.010;
const H_BTU  = 8000;       // BTU/lb
const SAV10  = 109;
const SAV100 = 30;
const FT_LAT = 1/364000;   // ft to degrees latitude
const FT_LON = 1/288000;   // ft to degrees longitude at ~37°N

// ─── FUEL MODEL NAMES (for override display) ──────────────────────────────
const FM_NAMES = {
  1:'FM1 – Short Grass',2:'FM2 – Timber/Grass Mix',3:'FM3 – Tall Grass',4:'FM4 – Chaparral',
  5:'FM5 – Brush',6:'FM6 – Dormant Brush',7:'FM7 – Southern Rough',8:'FM8 – Compact Timber Litter',
  9:'FM9 – Hardwood Litter',10:'FM10 – Timber/Understory',11:'FM11 – Light Slash',
  12:'FM12 – Medium Slash',13:'FM13 – Heavy Slash',
  101:'GR1 – Short Sparse Dry Grass',102:'GR2 – Low Load Dry Grass',103:'GR3 – Low Load Coarse Humid Grass',
  104:'GR4 – Moderate Load Dry Grass',105:'GR5 – Low Load Humid Grass',106:'GR6 – Moderate Load Humid Grass',
  107:'GR7 – High Load Dry Grass',108:'GR8 – High Load Coarse Humid Grass',109:'GR9 – Very High Load Humid Grass',
  121:'GS1 – Low Load Dry Grass-Shrub',122:'GS2 – Moderate Load Dry Grass-Shrub',
  123:'GS3 – Moderate Load Humid Grass-Shrub',124:'GS4 – High Load Humid Grass-Shrub',
  141:'SH1 – Low Load Dry Shrub',142:'SH2 – Moderate Load Dry Shrub',143:'SH3 – Moderate Load Humid Shrub',
  144:'SH4 – Low Load Humid Shrub',145:'SH5 – High Load Dry Shrub',146:'SH6 – Low Load Humid Shrub',
  147:'SH7 – Very High Load Shrub',148:'SH8 – High Load Humid Shrub',149:'SH9 – Very High Load Humid Shrub',
  161:'TU1 – Low Load Dry Shrub/Grass',162:'TU2 – Moderate Load Humid Shrub/Grass',
  163:'TU3 – Moderate Load Well Shaded',164:'TU4 – Dwarf Conifer Understory',165:'TU5 – Very High Load',
  181:'TL1 – Low Load Compact Litter',182:'TL2 – Low Load Broadleaf Litter',
  183:'TL3 – Moderate Load Broadleaf Litter',184:'TL4 – Small Downed Logs',
  185:'TL5 – High Load Conifer Litter',186:'TL6 – Moderate Load Broadleaf Litter (mesic)',
  187:'TL7 – Heavy Load Broadleaf Litter',188:'TL8 – Long-Needle Litter',
  189:'TL9 – Very High Load Broadleaf Litter',
  201:'SB1 – Low Load Activity Fuel',202:'SB2 – Moderate Load Activity Fuel',
  203:'SB3 – High Load Activity Fuel',204:'SB4 – High Load Humid Activity Fuel',
};

function codeToGroup(c) {
  if (c >= 201) return 'SB';
  if (c >= 181) return 'TL';
  if (c >= 161) return 'TU';
  if (c >= 141) return 'SH';
  if (c >= 121) return 'GS';
  if (c >= 101) return 'GR';
  return 'TL'; // Original 13 — mostly timber
}

// ─── MODULE STATE ──────────────────────────────────────────────────────────
let slopePct   = 0;
let fuelOverride = null;  // manually selected fuel model, overrides GPS
let ignPt      = null;   // { lat, lon }
let ellipseLyrs = [];
let ignMarker  = null;
let mapClickOn = false;
let lastCalc   = null;   // cached calculation inputs + results

// ─── ROTHERMEL SURFACE FIRE SPREAD MODEL (1972) ────────────────────────────
function rothermel(fp, dm1, lmH, lmW, windMph, slope, group) {
  const waf   = WAF[group] ?? 0.25;
  const dm10  = dm1 * 1.5;
  const dm100 = dm1 * 2.5;

  const fuels = [];
  if (fp.w1   > 0) fuels.push({w: fp.w1   * TA2, s: fp.sav1,         M: dm1,  live:false});
  if (fp.w10  > 0) fuels.push({w: fp.w10  * TA2, s: SAV10,            M: dm10, live:false});
  if (fp.w100 > 0) fuels.push({w: fp.w100 * TA2, s: SAV100,           M: dm100,live:false});
  if (fp.wLH  > 0) fuels.push({w: fp.wLH  * TA2, s: fp.savLH || 1500, M: lmH,  live:true });
  if (fp.wLW  > 0) fuels.push({w: fp.wLW  * TA2, s: fp.savLW || 1500, M: lmW,  live:true });

  const active = fuels.filter(f => f.w > 0 && f.s > 0);
  if (!active.length) return null;

  const W_T  = active.reduce((s,f) => s + f.w, 0);
  const dead  = active.filter(f => !f.live);
  const live  = active.filter(f =>  f.live);
  const W_d  = dead.reduce((s,f) => s + f.w, 0);
  const W_l  = live.reduce((s,f) => s + f.w, 0);

  // Characteristic SAV (σ')
  const sigma = active.reduce((s,f) => s + f.w * f.s**1.5, 0) /
                active.reduce((s,f) => s + f.w * f.s**0.5, 0);

  // Packing ratio
  const rho_b   = W_T / fp.depth;
  const beta    = rho_b / RHO_P;
  const beta_op = 3.348 * sigma**(-0.8189);
  const ratio   = beta / beta_op;

  // Reaction velocity
  const A    = 133 / sigma**0.7913;
  const Gmax = sigma**1.5 / (495 + 0.0594 * sigma**1.5);
  const G    = Gmax * ratio**A * Math.exp(A * (1 - ratio));

  // Moisture damping (dead)
  const Mx    = fp.Mx / 100;
  const Md    = W_d > 0 ? dead.reduce((s,f) => s + f.w * f.M, 0) / W_d : 0;
  const rMd   = Math.min(1, Md / Mx);
  const etaMd = Math.max(0, 1 - 2.59*rMd + 5.11*rMd**2 - 3.52*rMd**3);

  // Moisture damping (live)
  let etaMl = 0;
  if (W_l > 0) {
    const Ml  = live.reduce((s,f) => s + f.w * f.M, 0) / W_l;
    const rMl = Math.min(1, Ml / Math.max(Mx, 0.30));
    etaMl     = Math.max(0, 1 - 2.59*rMl + 5.11*rMl**2 - 3.52*rMl**3);
  }

  const etaM = (W_d * etaMd + W_l * etaMl) / W_T;
  const etaS = 0.174 * S_E**(-0.19);

  // Reaction intensity (BTU/ft²/min)
  const wn  = W_T * (1 - S_T);
  const I_R = G * wn * H_BTU * Math.max(0, etaM) * etaS;

  // Propagating flux ratio
  const xi = Math.exp((0.792 + 0.681 * sigma**0.5) * (beta + 0.1)) / (192 + 0.2595 * sigma);

  // Wind factor (midflame wind)
  const U    = windMph * 88 * waf;
  const C    = 7.47  * Math.exp(-0.133 * sigma**0.55);
  const B    = 0.02526 * sigma**0.54;
  const E    = 0.715  * Math.exp(-3.59e-4 * sigma);
  const phiW = U > 0 ? C * U**B * (beta/beta_op)**(-E) : 0;

  // Slope factor
  const phiS = 5.275 * beta**(-0.3) * (slope/100)**2;

  // Rate of spread (ft/min)
  const eps  = Math.exp(-138 / sigma);
  const Q_ig = 250 + 1116 * Md;
  const R    = Math.max(0, I_R * xi * (1 + phiW + phiS) / (rho_b * eps * Q_ig));

  // Byram fireline intensity: I_R × τ_r × R/60  (BTU/ft/s)
  const I_b = Math.max(0, I_R * (384/sigma) * R / 60);

  // Byram flame length (ft)
  const L = I_b > 0 ? 0.45 * I_b**0.46 : 0;

  return { ros:R, rosMph:R/88, I_b, flameLen:L };
}

// ─── VAN WAGNER CROWN FIRE MODEL (1977) ───────────────────────────────────
// Determines surface-to-crown fire transition and active crown fire potential
function foliageMC() {
  // Seasonal foliar moisture content estimate for Eastern Kentucky
  const m = new Date().getMonth() + 1;
  if (m >= 3 && m <= 5)  return 100; // spring green-up
  if (m >= 6 && m <= 8)  return 120; // full summer canopy
  if (m >= 9 && m <= 10) return 85;  // fall drying
  return 100; // dormant
}

function crownCheck(I_b, ros, cbh_m, cbd_kgm3) {
  if (cbh_m == null || cbh_m <= 0) {
    return { label:'NO CANOPY DATA', sub:'Crown fire not assessed for this location', color:'var(--muted)', level:0 };
  }
  const fmc    = foliageMC();
  const I_b_kW = I_b * 3.459; // BTU/ft/s → kW/m
  const I_0    = Math.pow(0.01 * cbh_m * (460 + 25.9 * fmc), 1.5);
  const canInitiate = I_b_kW >= I_0;

  let canActive = false;
  if (canInitiate && cbd_kgm3 != null && cbd_kgm3 > 0) {
    const ros_mmin = ros * 0.3048; // ft/min → m/min
    const R_0      = 3.0 / cbd_kgm3;
    canActive      = ros_mmin >= R_0;
  }

  const i0str = `I₀ ${I_0.toFixed(0)} kW/m`;
  const ibstr = `I_b ${I_b_kW.toFixed(0)} kW/m`;
  if (canActive)    return { label:'ACTIVE CROWN FIRE',   sub:`${ibstr} ≥ ${i0str} · ROS sustains active spread`,   color:'var(--extreme)', level:3 };
  if (canInitiate)  return { label:'TORCHING POSSIBLE',   sub:`${ibstr} ≥ ${i0str} · spotty crown entry likely`,    color:'var(--red)',     level:2 };
  return             { label:'SURFACE FIRE ONLY',         sub:`${ibstr} < ${i0str} · crown entry unlikely`,         color:'var(--green)',   level:1 };
}

// ─── SPREAD ELLIPSE GEOMETRY (Anderson 1983) ───────────────────────────────
function ellipseGeom(ros, windMph, minutes) {
  const LB  = Math.max(1.01, 0.936*Math.exp(0.2566*windMph) + 0.461*Math.exp(-0.1548*windMph) - 0.397);
  const e   = Math.sqrt(1 - 1/(LB*LB));
  const HB  = (1+e)/(1-e);
  const d_h = ros * minutes;
  const d_b = d_h / HB;
  const a   = (d_h + d_b) / 2;
  const b   = a / LB;
  return { a, b, c: a - d_b, LB, HB, acres: (Math.PI * a * b) / 43560 };
}

function ellipsePts(g, windFromDeg, ignLat, ignLon) {
  const headDeg = (windFromDeg + 180) % 360;
  const cosH = Math.cos(headDeg * Math.PI/180);
  const sinH = Math.sin(headDeg * Math.PI/180);
  const cLat = ignLat + g.c * cosH * FT_LAT;
  const cLon = ignLon + g.c * sinH * FT_LON;
  const pts  = [];
  for (let i = 0; i <= 72; i++) {
    const t  = (i/72) * 2 * Math.PI;
    const xe = g.a * Math.cos(t);
    const ye = g.b * Math.sin(t);
    pts.push([cLat + (xe*cosH - ye*sinH)*FT_LAT, cLon + (xe*sinH + ye*cosH)*FT_LON]);
  }
  return pts;
}

// ─── INTENSITY LABEL ──────────────────────────────────────────────────────
function flameLabel(L) {
  if (L < 4)  return {lbl:'Hand tools effective',               c:'var(--green)' };
  if (L < 8)  return {lbl:'Hand tools marginal — use equipment', c:'var(--yellow)'};
  if (L < 11) return {lbl:'Direct attack not recommended',      c:'var(--orange)'};
  return            {lbl:'Disengage — safety zone now',         c:'var(--red)'   };
}

// ─── COMPASS HELPER ────────────────────────────────────────────────────────
function d2c(d) {
  if (d == null) return '—';
  return ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(d/22.5)%16];
}

// ─── PLAIN-LANGUAGE CREW BRIEFING ─────────────────────────────────────────
function buildBriefText(calc) {
  const {r60, g30, g60, g120, fm, wx, fems, dm1} = calc;
  const fl = flameLabel(r60.flameLen);

  const lines = [
    `FUEL: ${fm.name ?? 'Unknown'} (code ${fm.code})`,
    `1-HR FM: ${(dm1*100).toFixed(0)}%  ${fems?.fm1 != null ? '(RAWS measured)' : '(RH-estimated)'}`,
    `WIND: ${wx.wind ?? '—'} mph from ${d2c(wx.windDirDeg)} · SLOPE: ${slopePct}%`,
    '',
    `RATE OF SPREAD:  ${r60.ros.toFixed(1)} ft/min  (${r60.rosMph.toFixed(2)} mph)`,
    `FLAME LENGTH:    ${r60.flameLen.toFixed(0)} ft`,
    `ACTION:          ${fl.lbl.toUpperCase()}`,
    `FIRELINE INTENSITY: ${r60.I_b.toFixed(0)} BTU/ft/s`,
    '',
    'PROJECTED SPREAD:',
    `  30 MIN — head ${g30.a.toFixed(0)} ft · ${g30.acres.toFixed(2)} ac`,
    `  1 HOUR — head ${g60.a.toFixed(0)} ft · ${g60.acres.toFixed(1)} ac`,
    `  2 HOUR — head ${g120.a.toFixed(0)} ft · ${g120.acres.toFixed(1)} ac`,
    '',
  ];

  if (r60.flameLen >= 11) {
    lines.push('DISENGAGE. Safety zone is priority. Engage only with confirmed escape route and established LCES.');
  } else if (r60.flameLen >= 8) {
    lines.push('Avoid direct attack on head. Flank attack or indirect only. Equipment support required.');
  } else if (r60.flameLen >= 4) {
    lines.push('Hand tools marginal on fire head. Work flanks and pinch. Monitor for wind shifts.');
  } else {
    lines.push('Conditions support direct attack. Maintain LCES. Watch for rapid changes.');
  }

  if ((wx.wind ?? 0) >= 20) lines.push(`High wind (${wx.wind} mph) — spotting potential beyond active head.`);
  if (slopePct >= 30)       lines.push(`Steep slope (${slopePct}%) — fire will accelerate uphill. Plan escape downslope.`);

  lines.push('');
  lines.push('Surface fire only. Crown fire not assessed. Verify with FBAN before suppression decisions.');
  return lines.join('\n');
}

// ─── ELLIPSE MAP DRAWING ───────────────────────────────────────────────────
function clearEllipse() {
  ellipseLyrs.forEach(l => state.kyMap?.removeLayer(l));
  ellipseLyrs = [];
  if (ignMarker) { state.kyMap?.removeLayer(ignMarker); ignMarker = null; }
}

function drawEllipse(calc, iLat, iLon) {
  if (!state.kyMap || !calc) return;
  clearEllipse();
  const wDir = calc.wx.windDirDeg ?? 270;

  const rings = [
    { g: calc.g120, color:'#ff2020', label:'2 HR'   },
    { g: calc.g60,  color:'#ff6a00', label:'1 HR'   },
    { g: calc.g30,  color:'#ffab00', label:'30 MIN' },
  ];

  for (const {g, color} of rings) {
    const pts  = ellipsePts(g, wDir, iLat, iLon);
    const poly = L.polygon(pts, {
      color, weight:1.5, opacity:.85, fillColor:color, fillOpacity:.10, dashArray:'6 4',
    }).addTo(state.kyMap);
    ellipseLyrs.push(poly);
  }

  ignMarker = L.marker([iLat, iLon], {
    icon: L.divIcon({
      html: `<div style="font-size:20px;line-height:1;filter:drop-shadow(0 0 5px rgba(255,100,0,.9))">🔥</div>`,
      className:'', iconAnchor:[10,20],
    }),
    zIndexOffset:500,
  }).addTo(state.kyMap);

  ignMarker.bindPopup(
    `<div style="font-family:monospace;font-size:11px;line-height:1.6">
      <b style="color:#ff6a00">READ Ignition Point</b><br>
      ${iLat.toFixed(4)}°N &nbsp;${Math.abs(iLon).toFixed(4)}°W<br>
      <a href="#" onclick="window.clearReadIgnition();return false"
         style="color:#ff4500;text-decoration:none">✕ Remove</a>
    </div>`
  );

}

// ─── AUTO SLOPE FROM TERRAIN ───────────────────────────────────────────────
async function fetchAutoSlope(lat, lon) {
  const data = await workerFetch(`/slope?lat=${lat}&lon=${lon}`, 'READ-SLOPE');
  if (!data) return;
  DIAG.ok('READ-SLOPE', `${data.slopePct}% raw → ${data.slopeBin}% bin (${data.slopeDeg}°)`);
  const bins = [0, 10, 20, 30, 40];
  const idx  = bins.indexOf(data.slopeBin);
  const btns = document.querySelectorAll('.slope-btn');
  slopePct = data.slopeBin;
  btns.forEach(b => b.classList.remove('act'));
  if (idx >= 0 && btns[idx]) btns[idx].classList.add('act');
  const note = document.getElementById('slopeAutoNote');
  if (note) { note.textContent = `~${data.slopePct}% from terrain`; note.style.display = 'block'; }
  computeRead();
}

// ─── MAP CLICK HANDLER ─────────────────────────────────────────────────────
function onMapClick(e) {
  if (state.pinMode) return; // defer to pin-drop mode
  ignPt = { lat: e.latlng.lat, lon: e.latlng.lng };
  DIAG.info('READ', `Ignition: ${ignPt.lat.toFixed(4)}, ${ignPt.lon.toFixed(4)}`);
  fetchAutoSlope(ignPt.lat, ignPt.lon);
  if (lastCalc) drawEllipse(lastCalc, ignPt.lat, ignPt.lon);
  updatePanel();
}

function enableMapClick() {
  if (mapClickOn || !state.kyMap) return;
  state.kyMap.on('click', onMapClick);
  state.kyMap.getContainer().style.cursor = 'crosshair';
  mapClickOn = true;
}

function disableMapClick() {
  if (!state.kyMap) return;
  state.kyMap.off('click', onMapClick);
  state.kyMap.getContainer().style.cursor = '';
  mapClickOn = false;
}

// ─── CORE CALCULATION ──────────────────────────────────────────────────────
export function computeRead() {
  const wx   = state.wx;
  const fems = state.fm;

  // Use manual override if set, otherwise fall back to GPS fuel model
  const fm = fuelOverride ?? state.fuelModel;

  if (!fm?.code) { hideSumBar(); return; }
  if (!fm.burnable) { showNBPrompt(); return; }
  const fp = FP[fm.code];
  if (!fp) { DIAG.warn('READ', `No fuel params for code ${fm.code}`); hideSumBar(); return; }

  // Dead fuel moisture: RAWS 1-hr preferred, RH fallback
  let dm1 = fems?.fm1 != null ? fems.fm1 / 100 : null;
  if (dm1 == null && wx?.rh != null) dm1 = Math.max(0.03, wx.rh / 200 + 0.02);
  if (dm1 == null) dm1 = 0.08;

  const lmH     = 0.90;
  const lmW     = 1.10;
  const windMph = wx?.wind ?? 5;
  const windDir = wx?.windDirDeg ?? 270;

  const r = rothermel(fp, dm1, lmH, lmW, windMph, slopePct, fm.group);
  if (!r) { hideSumBar(); return; }

  const g30  = ellipseGeom(r.ros, windMph, 30);
  const g60  = ellipseGeom(r.ros, windMph, 60);
  const g120 = ellipseGeom(r.ros, windMph, 120);

  const cbh_m    = fuelOverride ? null : state.fuelModel?.cbh_m ?? null;
  const cbd_kgm3 = fuelOverride ? null : state.fuelModel?.cbd_kgm3 ?? null;
  const crown    = crownCheck(r.I_b, r.ros, cbh_m, cbd_kgm3);

  lastCalc = { r60:r, g30, g60, g120, fm, wx:{...wx}, fems:{...fems}, dm1, windDir, crown };

  DIAG.ok('READ', `ROS=${r.ros.toFixed(1)} ft/min  FL=${r.flameLen.toFixed(0)} ft  I_b=${r.I_b.toFixed(0)} BTU/ft/s  Crown:${crown.label}`);

  updateSumBar(r);
  updatePanel();
  if (ignPt) drawEllipse(lastCalc, ignPt.lat, ignPt.lon);
}

// ─── UI HELPERS ────────────────────────────────────────────────────────────
function gel(id)        { return document.getElementById(id); }
function set(id, txt, c) { const e=gel(id); if(!e) return; e.textContent=txt; if(c) e.style.color=c; }

function hideSumBar() { const b=gel('readSumBar'); if(b) b.style.display='none'; }

function showNBPrompt() {
  const bar = gel('readSumBar');
  if (!bar) return;
  bar.style.display = 'block';
  const nb   = gel('readSumNB');
  const calc = gel('readSumCalc');
  if (nb)   nb.style.display   = 'block';
  if (calc) calc.style.display = 'none';
}

function updateSumBar(r) {
  const bar = gel('readSumBar');
  if (!bar) return;
  bar.style.display = 'block';
  const nb   = gel('readSumNB');
  const calc = gel('readSumCalc');
  if (nb)   nb.style.display   = 'none';
  if (calc) calc.style.display = 'block';
  const fl = flameLabel(r.flameLen);
  set('rsSumROS',   `${r.ros.toFixed(0)} ft/min (${r.rosMph.toFixed(2)} mph)`);
  set('rsSumFlame', `${r.flameLen.toFixed(0)} ft`, fl.c);
  set('rsSumLabel', fl.lbl, fl.c);
}

function updatePanel() {
  if (!lastCalc) return;
  const {r60, g30, g60, g120, fm, wx, fems, dm1, crown} = lastCalc;
  const fl = flameLabel(r60.flameLen);

  set('rFuelName', fm.name ?? '—');
  set('rFM',   `${(dm1*100).toFixed(0)}%  ${fems?.fm1 != null ? '(RAWS)' : '(est.)'}`);
  set('rWind', `${wx?.wind ?? '—'} mph from ${d2c(wx?.windDirDeg)}`);
  set('rROS',    `${r60.ros.toFixed(1)} ft/min`);
  set('rROSmph', `${r60.rosMph.toFixed(2)} mph`);
  set('rFlame',  `${r60.flameLen.toFixed(0)} ft`, fl.c);
  set('rLabel',  fl.lbl, fl.c);
  set('rIb',     `${r60.I_b.toFixed(0)} BTU/ft/s`);

  set('rProj30ac',  `${g30.acres.toFixed(2)} ac`);
  set('rProj30ft',  `${g30.a.toFixed(0)} ft`);
  set('rProj60ac',  `${g60.acres.toFixed(1)} ac`);
  set('rProj60ft',  `${g60.a.toFixed(0)} ft`);
  set('rProj120ac', `${g120.acres.toFixed(1)} ac`);
  set('rProj120ft', `${g120.a.toFixed(0)} ft`);

  // Crown fire
  if (crown) {
    set('rCrownLabel', crown.label, crown.color);
    set('rCrownSub',   crown.sub);
  }

  const brief = gel('rBriefText');
  if (brief) brief.textContent = buildBriefText(lastCalc);

  const ign = gel('rIgnStatus');
  if (ign) {
    ign.textContent = ignPt
      ? `Ignition at ${ignPt.lat.toFixed(4)}, ${Math.abs(ignPt.lon).toFixed(4)} — ellipse on map`
      : 'Click the map to place ignition point and draw spread ellipse';
    ign.style.color = ignPt ? 'var(--green)' : 'var(--muted)';
  }
}

// ─── FUEL MODEL OVERRIDE ───────────────────────────────────────────────────
export function setFuelOverride(val) {
  if (!val) {
    fuelOverride = null;
    DIAG.info('READ', 'Fuel override cleared — using GPS fuel model');
  } else {
    const code = parseInt(val);
    fuelOverride = { code, group: codeToGroup(code), burnable: true,
                     name: FM_NAMES[code] ?? `Code ${code}`, desc: 'Manual override' };
    DIAG.info('READ', `Fuel override set: ${fuelOverride.name}`);
  }
  computeRead();
}

// ─── SLOPE SELECTOR ────────────────────────────────────────────────────────
export function setSlopeRead(pct, btn) {
  slopePct = pct;
  document.querySelectorAll('.slope-btn').forEach(b => b.classList.remove('act'));
  btn.classList.add('act');
  const note = document.getElementById('slopeAutoNote');
  if (note) note.style.display = 'none';
  computeRead();
}

// ─── OPEN / CLOSE / CLEAR ──────────────────────────────────────────────────
export function openRead() {
  const p = gel('readPanel');
  if (p) p.classList.add('open');
  document.body.classList.add('read-open');
  enableMapClick();
  updatePanel();
  const map = document.querySelector('.kymap-section');
  if (map) map.scrollIntoView({behavior:'smooth', block:'start'});
}

export function closeRead() {
  const p = gel('readPanel');
  if (p) p.classList.remove('open');
  document.body.classList.remove('read-open');
  disableMapClick();
  ignPt = null;
  clearEllipse();
  updatePanel();
}

export function clearReadIgnition() {
  ignPt = null;
  clearEllipse();
  updatePanel();
}
