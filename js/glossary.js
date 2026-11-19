// ── Acronym / term glossary ──
// Any element with data-term="KEY" gets a hover tooltip and opens the
// glossary scrolled to that entry on click (delegated — works for
// dynamically rendered cards too).

const TERMS = [
  // ── Fuel moisture ──
  { key:'FM',     sec:'Fuel Moisture', term:'Dead Fuel Moisture (FM)',
    def:'Water in dead fuels as a percent of dry weight. Lower = drier = easier ignition and faster spread. Single digits in fine fuels is serious.' },
  { key:'1HR',    sec:'Fuel Moisture', term:'1-hr Fuels',
    def:'Dead fuels under ¼" diameter — grass, leaf litter, needles, twigs. React to RH within about an hour. Drives ignition and how fast a fire takes off. Below 8% is critical; below 5% expect aggressive behavior from first ignition.' },
  { key:'10HR',   sec:'Fuel Moisture', term:'10-hr Fuels',
    def:'Dead fuels ¼"–1" diameter — small branches and sticks. Respond over a day or so. Carry fire into brush and ladder fuels.' },
  { key:'100HR',  sec:'Fuel Moisture', term:'100-hr Fuels',
    def:'Dead fuels 1"–3" diameter — downed limbs. Change over several days. Low values mean longer, hotter burning and more mop-up.' },
  { key:'1000HR', sec:'Fuel Moisture', term:'1000-hr Fuels',
    def:'Dead fuels 3"–8" diameter — logs. Change over weeks; a seasonal drought indicator. Low values mean logs burn out completely and hold heat.' },
  { key:'EMC',    sec:'Fuel Moisture', term:'EMC — Equilibrium Moisture Content',
    def:'The moisture dead fuel would settle at given current temperature and RH. Used here only as a fallback estimate when FEMS RAWS data is unavailable.' },

  // ── NFDRS indices ──
  { key:'NFDRS',  sec:'Fire Danger Indices', term:'NFDRS — National Fire Danger Rating System',
    def:'The national system that turns weather and fuel data into fire danger indices (ERC, BI, IC, SC). Calculated daily for each RAWS station.' },
  { key:'ERC',    sec:'Fire Danger Indices', term:'ERC — Energy Release Component',
    def:'How much heat the fire front could release per square foot, driven mostly by heavier fuel dryness. Changes slowly — best for tracking how dry the season is getting. Higher = hotter, harder-to-control fires. Wind does not affect it.' },
  { key:'BI',     sec:'Fire Danger Indices', term:'BI — Burning Index',
    def:'Combines spread and energy into one number tied to flame length: BI ÷ 10 ≈ expected flame length in feet at the head of the fire. Responds to day-to-day wind and RH.' },
  { key:'IC',     sec:'Fire Danger Indices', term:'IC — Ignition Component',
    def:'Chance (0–100%) that a firebrand landing in fine fuel starts a fire that needs suppression.' },
  { key:'SC',     sec:'Fire Danger Indices', term:'SC — Spread Component',
    def:'NFDRS estimate of forward rate of spread (ft/min) for the station\'s reference fuel model.' },
  { key:'KBDI',   sec:'Fire Danger Indices', term:'KBDI — Keetch-Byram Drought Index',
    def:'Soil and duff dryness on a 0–800 scale (0 = saturated, 800 = maximum drought). Above 400: fire burns into the ground and holds heat after suppression. Above 600: deep burning, extended mop-up, stump holes.' },
  { key:'FWI',    sec:'Fire Danger Indices', term:'FWI — Fosberg Fire Weather Index',
    def:'A 0–100 index from temperature, RH, and wind only — no fuel data. This dashboard uses a simplified version for the danger rating. Treat as a weather-driven indicator, not an official NFDRS rating.' },
  { key:'IGNPROB',sec:'Fire Danger Indices', term:'Ignition Probability (dashboard)',
    def:'Dashboard estimate from 1-hr fuel moisture, temperature and RH. Not the official NFDRS IC — a rough guide to how easily fires start.' },
  { key:'SPREADIDX', sec:'Fire Danger Indices', term:'Spread Index (dashboard)',
    def:'Dashboard estimate from wind and 1-hr fuel moisture. Rough relative indicator, not the NFDRS Spread Component.' },

  // ── Weather ──
  { key:'RH',     sec:'Weather', term:'RH — Relative Humidity',
    def:'How saturated the air is with moisture. Fine fuels follow RH within an hour. Below 25–30% is a key fire weather threshold in Kentucky.' },
  { key:'DEW',    sec:'Weather', term:'Dewpoint',
    def:'Temperature at which air becomes saturated. Low dewpoints mean dry air and low overnight RH recovery.' },
  { key:'RFW',    sec:'Weather', term:'Red Flag Warning / Fire Weather Watch',
    def:'NWS alerts for critical fire weather — usually low RH combined with strong wind on dry fuels. A Watch means conditions are possible in 12–72 hours; a Warning means they are occurring or imminent.' },
  { key:'20FT',   sec:'Weather', term:'20-ft Wind / Midflame Wind',
    def:'Fire weather forecasts give wind 20 ft above vegetation. Wind at flame height (midflame) under a forest canopy is much lower — often 10–20% of 20-ft wind in timber.' },
  { key:'MIXHGT', sec:'Weather', term:'Mixing Height',
    def:'Depth of the air layer where smoke and heat mix upward. Higher = better smoke dispersal and potentially more active fire behavior.' },
  { key:'TRANS',  sec:'Weather', term:'Transport Wind',
    def:'Average wind through the mixing layer — where smoke goes, and a hint of wind aloft that can mix down.' },
  { key:'VENT',   sec:'Weather', term:'Vent Rate',
    def:'Mixing height × transport wind. Measures how well smoke clears out. Under ~20,000 kt-ft is poor dispersion.' },
  { key:'ADI',    sec:'Weather', term:'ADI — Atmospheric Dispersion Index',
    def:'Smoke dispersion rating (Lavdas). Under ~20 is poor to very poor; 40–60 is generally good for burning.' },
  { key:'LVORI',  sec:'Weather', term:'LVORI — Low Visibility Occurrence Risk Index',
    def:'Risk (1–10) of smoke plus fog creating dangerously low visibility, mostly overnight. High values matter for roads near a fire.' },
  { key:'THERMAL',sec:'Weather', term:'Thermal Belt',
    def:'A mid-slope band that stays warmer and drier overnight than valley bottoms or ridgetops. Fires in thermal belts stay active at night.' },
  { key:'METAR',  sec:'Weather', term:'METAR',
    def:'Standard airport weather report. Used here as a backup when NWS station observations are missing a value.' },
  { key:'FWF',    sec:'Weather', term:'FWF — Fire Weather Planning Forecast',
    def:'The NWS text forecast issued for fire managers, by fire weather zone. SE Kentucky is covered by NWS Jackson (JKL).' },

  // ── Data sources ──
  { key:'RAWS',   sec:'Data Sources', term:'RAWS — Remote Automated Weather Station',
    def:'Fire weather stations placed in wildland settings. Feed NFDRS fuel moisture and danger indices.' },
  { key:'FEMS',   sec:'Data Sources', term:'FEMS — Fire Environment Mapping System',
    def:'USDA Forest Service system that publishes RAWS observations and NFDRS outputs, including predicted values for the coming week from the NWS forecast.' },
  { key:'NWS',    sec:'Data Sources', term:'NWS — National Weather Service',
    def:'Source of current observations, the 5-day forecast, alerts, and the Fire Weather Planning Forecast.' },
  { key:'FIRMS',  sec:'Data Sources', term:'FIRMS / VIIRS',
    def:'NASA satellite heat detections. VIIRS passes roughly twice a day. A hotspot can be a wildfire, prescribed burn, or industrial heat — confirm before acting.' },
  { key:'FRP',    sec:'Data Sources', term:'FRP — Fire Radiative Power',
    def:'Heat output of a satellite detection in megawatts. Bigger = more intense burning in that pixel.' },
  { key:'IRWIN',  sec:'Data Sources', term:'IRWIN / WFIGS',
    def:'National interagency incident records and perimeters (NIFC). Year-to-date — includes contained and out fires, not just active ones.' },
  { key:'LANDFIRE', sec:'Data Sources', term:'LANDFIRE',
    def:'National vegetation and fuels mapping (USGS/USFS). Updated about annually. Known to misclassify EKY hardwood stands as conifer litter — verify on the ground.' },

  // ── Fire behavior ──
  { key:'FBFM40', sec:'Fire Behavior', term:'FBFM40 — Scott & Burgan 40 Fuel Models',
    def:'Standard fuel model set: GR grass, GS grass-shrub, SH shrub, TU timber-understory, TL timber litter, SB slash-blowdown, NB non-burnable. EKY hardwoods are typically TL2, TL6, or FM9.' },
  { key:'ROS',    sec:'Fire Behavior', term:'ROS — Rate of Spread',
    def:'How fast the head of the fire moves, in ft/min (88 ft/min = 1 mph). Increases sharply with wind and uphill slope.' },
  { key:'FL',     sec:'Fire Behavior', term:'Flame Length',
    def:'Length of flame at the fire head. Under 4 ft: hand line can hold. 4–8 ft: equipment needed. 8–11 ft: direct attack not recommended. Over 11 ft: indirect only.' },
  { key:'FLI',    sec:'Fire Behavior', term:'Fireline Intensity',
    def:'Heat released per foot of fire front (BTU/ft/s). Determines flame length and whether fire can climb into the canopy.' },
  { key:'CROWN',  sec:'Fire Behavior', term:'Torching / Crown Fire',
    def:'Torching: individual trees or groups flare up. Active crown fire: fire runs through the canopy. Both throw embers far ahead of the main fire.' },
  { key:'CBH',    sec:'Fire Behavior', term:'CBH / CBD — Canopy Base Height / Bulk Density',
    def:'CBH: height from ground to the bottom of the live canopy — lower = easier for surface fire to climb. CBD: how much canopy fuel per volume — higher = canopy can carry fire.' },
  { key:'ROTHERMEL', sec:'Fire Behavior', term:'Rothermel Model',
    def:'The 1972 surface fire spread model behind BehavePlus and FARSITE. Estimates ROS and intensity from fuel, moisture, wind, and slope.' },

  // ── Operations ──
  { key:'LCES',   sec:'Operations', term:'LCES',
    def:'Lookouts, Communications, Escape routes, Safety zones. Established before engaging, re-checked when conditions change.' },
  { key:'FBAN',   sec:'Operations', term:'FBAN — Fire Behavior Analyst',
    def:'Qualified specialist who produces official fire behavior predictions for an incident.' },
  { key:'KDF',    sec:'Operations', term:'KDF — Kentucky Division of Forestry',
    def:'State agency responsible for wildland fire on non-federal lands in Kentucky.' },
  { key:'SACC',   sec:'Operations', term:'SACC — Southern Area Coordination Center',
    def:'The geographic area coordination center (GACC) covering Kentucky and the Southeast — resource ordering and predictive services.' },
  { key:'DBNF',   sec:'Operations', term:'DBNF — Daniel Boone National Forest',
    def:'USFS land across much of eastern Kentucky.' },
];

const BY_KEY = new Map(TERMS.map(t => [t.key, t]));

function render(filter = '') {
  const el = document.getElementById('glossList');
  if (!el) return;
  const q = filter.trim().toLowerCase();
  const hits = TERMS.filter(t => !q || t.term.toLowerCase().includes(q) || t.def.toLowerCase().includes(q));
  const sections = [...new Set(hits.map(t => t.sec))];
  el.innerHTML = sections.map(sec => `
    <div class="gloss-sec">${sec}</div>
    ${hits.filter(t => t.sec === sec).map(t => `
      <div class="gloss-item" id="gl-${t.key}">
        <div class="gloss-term">${t.term}</div>
        <div class="gloss-def">${t.def}</div>
      </div>`).join('')}`).join('') || '<div class="gloss-def">No matching terms.</div>';
}

export function openGlossary(key) {
  const panel = document.getElementById('glossPanel');
  if (!panel) return;
  const input = document.getElementById('glossSearch');
  if (input) input.value = '';
  render();
  panel.classList.remove('hidden');
  if (key) {
    const item = document.getElementById(`gl-${key}`);
    if (item) {
      item.scrollIntoView({ block: 'center' });
      item.classList.add('flash');
      setTimeout(() => item.classList.remove('flash'), 1600);
    }
  }
}

export function closeGlossary() {
  document.getElementById('glossPanel')?.classList.add('hidden');
}

export function initGlossary() {
  document.getElementById('glossSearch')?.addEventListener('input', e => render(e.target.value));

  // Tooltip on hover — set lazily so dynamically rendered elements get it too
  document.addEventListener('mouseover', e => {
    const el = e.target.closest?.('[data-term]');
    if (el && !el.title) {
      const t = BY_KEY.get(el.dataset.term);
      if (t) el.title = `${t.term}\n${t.def}\n(click for glossary)`;
    }
  });
  document.addEventListener('click', e => {
    const el = e.target.closest?.('[data-term]');
    if (el && BY_KEY.has(el.dataset.term)) { e.preventDefault(); openGlossary(el.dataset.term); }
  });
}
