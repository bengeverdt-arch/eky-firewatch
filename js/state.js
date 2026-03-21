// ── Shared mutable state ──
// All modules import this object and mutate its properties directly.
export const state = {
  LAT: 37.129,
  LON: -84.083,
  locationSource: 'default',
  FEMS_STATION: '157201',
  wx: { temp: null, rh: null, wind: null, gust: null, dew: null, precip: null, windDirDeg: null },
  fm: { fm1: null, fm10: null, fm100: null, fm1000: null, erc: null, bi: null, kbdi: null },
  windDeg: 90,
  kyMap: null,
};

export const RAWS_STATIONS = [
  {id:'157201', name:'Peabody',        region:'Eastern KY', agency:'USFS', elev:1473, lat:37.13769, lon:-83.57789},
  {id:'152001', name:'Triangle Mtn',   region:'Eastern KY', agency:'USFS', elev:1364, lat:38.177,   lon:-83.40681},
  {id:'154801', name:'Big Sandy',      region:'Eastern KY', agency:'S&PF', elev:1180, lat:37.74883, lon:-82.64122},
  {id:'156001', name:'Jackson Co AP',  region:'Eastern KY', agency:'S&PF', elev:1388, lat:37.59194, lon:-83.31475},
  {id:'154401', name:'Pilgrim',        region:'Eastern KY', agency:'USFS', elev:1272, lat:37.43614, lon:-83.96033},
  {id:'157002', name:'Big Swag',       region:'Eastern KY', agency:'USFS', elev:1400, lat:36.87267, lon:-84.42325},
  {id:'159801', name:'Yellow Creek',   region:'Eastern KY', agency:'NPS',  elev:1090, lat:36.60361, lon:-83.69611},
  {id:'159501', name:'Alpine',         region:'Eastern KY', agency:'S&PF', elev:853,  lat:36.79556, lon:-85.38028},
  {id:'156502', name:'Houchin Meadow', region:'Eastern KY', agency:'NPS',  elev:774,  lat:37.13167, lon:-86.14806},
  {id:'150703', name:'Crittenden',     region:'Central/Western KY', agency:'S&PF', elev:935, lat:38.76917, lon:-84.60194},
  {id:'151191', name:'Greenville',     region:'Central/Western KY', agency:'S&PF', elev:552, lat:37.2734,  lon:-87.20219},
  {id:'55522265',name:'Ft Campbell',   region:'Central/Western KY', agency:'DOD',  elev:540, lat:36.71557, lon:-87.73376},
  {id:'159901', name:'KYLBL',          region:'Central/Western KY', agency:'USFS', elev:649, lat:36.77805, lon:-88.05713},
];
