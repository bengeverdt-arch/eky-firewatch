# EKY Fire Watch — Project Brief
**Paste this at the start of any new Claude conversation to restore full context.**

---

## What We're Building
A real-time wildfire operations dashboard for **East Kentucky fire crews** — specifically the London, KY / Laurel County area and Daniel Boone National Forest region. The goal is a single HTML file (or hosted webpage) that anyone can load in a browser with no install required.

## Current Status
- **v4 built** — `ky-wildfire-dashboard-v4.html`
- Dashboard works visually and all fire math calculates correctly
- **Blocked problem:** All live data fetches fail because the Anthropic API proxy approach doesn't work in the browser environment (network firewall blocks outbound calls to `api.anthropic.com`)
- **Next step agreed on:** Build a **Cloudflare Worker** backend to act as a CORS proxy — then the dashboard calls the Worker instead of trying to reach APIs directly from the browser

## Architecture Plan
```
User's browser  →  Cloudflare Worker (YOUR backend, free tier)  →  NWS / FEMS / NIFC / FIRMS
                ←  clean JSON data                               ←
```

## Data Sources Being Integrated
| Source | Data | URL Pattern |
|--------|------|-------------|
| NWS api.weather.gov | Live temp, RH, wind, gust, dewpoint, precip, alerts | `/points/37.129,-84.083` → stations → `/observations/latest` |
| FEMS fs2c.usda.gov | Real dead fuel moisture (1hr/10hr/100hr/1000hr), ERC, BI, KBDI | `/api/ext-climatology/download-nfdr-daily-summary/?stationIds=12120` |
| NIFC ArcGIS | Active fire incidents (IRWIN) for KY region | `services3.arcgis.com/.../Active_Fires/FeatureServer/0/query` |
| NASA FIRMS ArcGIS | VIIRS satellite thermal hotspots | `services9.arcgis.com/.../VIIRS_Thermal_Hotspots.../query` |
| KDF fiResponse | Kentucky Division of Forestry official fire map | `kdf.firesponse.com/public/` (iframe only, no public API) |

## Key Technical Details
- **Location:** London, KY — `LAT=37.129, LON=-84.083` — Laurel County — ~1145 ft elevation
- **NWS office:** Louisville (LMK)
- **FEMS RAWS station:** ID `12120` — Daniel Boone NF area
- **Map:** Leaflet.js with CartoDB dark tiles, EKY ops area bounding box `[[36.8,-85.1],[38.1,-82.2]]`
- **Fire math:** Fosberg FWI, simplified Rothermel ROS, flame length, scorch height, 30-min projections
- **Fuel model selector:** Anderson fuel models
- **Design:** Dark ops theme — Barlow Condensed + Share Tech Mono fonts, orange (#ff4500) accent

## Dashboard Features Built
- Live weather cards (temp, RH, wind, gust, dewpoint, precip) from NWS
- Dead fuel moisture bars (1hr/10hr/100hr/1000hr) from FEMS RAWS — falls back to EMC estimate
- NFDRS outputs from RAWS: ERC, Burning Index, KBDI
- Fire Danger Index with Fosberg FWI bar (Low → Extreme)
- Fire behavior panel: ROS, flame length, scorch height, 30-min area/distance projections
- Animated fire ellipse visualization with wind direction
- Crew safety advisory box (Manageable / Caution / WITHDRAW)
- NWS active alerts / Red Flag Warning display
- Multi-tab map section: custom Leaflet map + KDF iframe + NASA FIRMS + InciWeb + NWS + Drought Monitor
- Quick links bar to KDF, InciWeb, FIRMS, NWS LMK, SACC, FEMS, Daniel Boone NF, Drought Monitor
- Diagnostics panel with full log — copy-to-clipboard for debugging
- Auto-refresh every 10 minutes

## What Cloudflare Worker Needs to Do
The Worker is a small JavaScript file deployed to Cloudflare. It needs to:
1. Accept requests from the dashboard like `GET /nws` → fetch NWS data and return JSON
2. Accept `GET /fems` → fetch FEMS CSV, parse it, return JSON
3. Accept `GET /fires` → fetch NIFC IRWIN + FIRMS GeoJSON, return combined GeoJSON
4. Set CORS headers so the browser trusts responses from the Worker
5. Cache responses briefly (5-10 min) to avoid hammering source APIs

**Cloudflare Workers free tier:** 100,000 requests/day — more than enough.
**Deploy method:** Paste JS into Cloudflare dashboard → click Deploy → get a `*.workers.dev` URL.

## Conversation History Summary
- Started with manual slider prototype (v1)
- Added NWS live weather integration (v2)  
- Added FEMS RAWS real fuel moisture + Leaflet fire map (v3)
- Added diagnostics panel, routed all fetches through Anthropic API proxy (v4) — proxy approach blocked by network environment
- Agreed to build Cloudflare Worker as proper backend solution
- User is on Windows, running dashboard in browser (not local server)
- User is a firefighter/fire crew operator, not a developer — keep instructions non-technical

## Glossary (for context)
- **CORS** — Browser security rule that blocks a webpage from calling APIs on other domains unless those APIs explicitly allow it. Servers talking to servers don't have this restriction.
- **Backend** — A server-side program that handles data fetching, processing, and serving. Lives on a server, not in the browser.
- **Cloudflare Worker** — A tiny JavaScript program that runs on Cloudflare's servers globally. Free, no setup required beyond pasting code into their dashboard.
- **RAWS** — Remote Automated Weather Station. The official fire weather monitoring network.
- **FEMS** — Fire Environment Mapping System (USDA). Official NFDRS data portal.
- **NFDRS** — National Fire Danger Rating System
- **FWI** — Fire Weather Index (Fosberg)
- **ERC** — Energy Release Component
- **KBDI** — Keetch-Byram Drought Index
- **ROS** — Rate of Spread
- **LCES** — Lookouts, Communications, Escape Routes, Safety Zones
- **FBAN** — Fire Behavior Analyst
- **SACC** — Southern Area Coordination Center (covers Kentucky)
- **KDF** — Kentucky Division of Forestry
- **InciWeb / IRWIN** — National incident reporting databases
