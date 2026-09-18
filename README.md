# Margin — a little breathing room

A mobile-first Singapore commuter companion for NebulaX PS2. It supports everyday commuting with saved priorities, departure flexibility, walking breaks and arrival deadlines; disruption replays are a secondary flow.

## Run and test

Node.js 22 or 24 LTS. No external npm dependencies or API keys are needed for replay mode:

```sh
npm start
npm test
npm run check
node scripts/build-network.mjs
```

Open http://localhost:5173. Use the published HTTPS link on phones for GPS, offline caching and home-screen installation.

## Plan a journey

Tap FROM or TO, search by station name/code, or filter by line. Both pickers include 184 stations: NSL, EWL, NEL, CCL, DTL, TEL, the Changi Airport branch, and Bukit Panjang, Sengkang and Punggol LRT. Circle Line 6 is included following its 12 July 2026 opening; future TEL5, DTL3e, JRL and CRL stations are excluded.

Tap FROM → Use current location to request a single GPS fix, then select a nearby boarding station. Nothing requests location automatically. Choose your arrival deadline, compare routes, and start the journey walkthrough. The Plan/Map switch and bottom navigation are designed for phones.

## Routing and assumptions

`dist/network-planner.js` uses line-aware shortest-path search with transfer costs, relevant disruption penalties and optional crowd preferences. Alternatives are deduplicated; the number of routes reflects distinct available paths. The EWL replay only affects paths traversing Paya Lebar–Aljunied–Kallang. The pure engine and GPS helpers have automated tests, including graph connectivity, cross-island transfers, same-station trips and GPS failures.

Rail edge times are calibrated from the median scheduled travel time in LTA DataMall's GTFS Schedule (Train), rounded to minutes. Distance-based estimates remain only where no matching GTFS station pair exists. The planner adds a 3-minute initial wait, 5 minutes per interchange and an uncertainty range; these allowances are still estimates rather than live ETAs. GPS-only walking uses straight-line distance × 1.3 at 0.075 km/min.

Station selection includes station-access time and ends at the selected station; it is not arbitrary address routing. GPS supplies a real origin but not verified pedestrian directions. Map lines connect station coordinates, not actual tracks. Exits, lifts, shelter, operating hours and LRT direction-specific schedules are not verified. LRT loops are modelled in both directions; check platform signs.

## Data and licences

- Station coordinates: LTA/URA open data via https://github.com/elliotwutingfeng/singapore_train_station_coordinates. Source CSVs and licence attribution are in `data/`. Singapore Open Data Licence 1.0 applies; source rows labelled manual are estimates.
- Network topology: LTA system map, checked 18 September 2026: https://www.lta.gov.sg/content/ltagov/en/getting_around/public_transport/rail_network.html. Main-line station-code sequences plus explicit airport/CCL branches and LRT loop closures generate the graph.
- CCL6: https://www.lta.gov.sg/content/ltagov/en/newsroom/2026/6/news-releases/explore-three-new-circle-line-stage-6-stations-on-4-july-2026.html. Keppel, Cantonment and Prince Edward Road coordinates came from the source future-station file and were enabled after LTA's confirmed opening. CC33/CC34 replace CE2/CE1.
- OSM: attributed bundled road extract for eastern/central Singapore (1.26–1.38 N, 103.82–103.96 E), under ODbL. Its source timestamp is embedded in `dist/data/osm-roads.json`. Outside this area the map displays the rail overlay without detailed roads. https://www.openstreetmap.org/copyright. No public tiles or repeated Overpass requests are used.
- Weather: optional on-demand Tampines forecast from https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast. Issue and validity times are shown; current weather never silently overwrites transport replays.

## GPS, privacy and offline use

Precise coordinates remain in JavaScript memory for this page session. They are not uploaded, logged or saved. No reverse-geocoding provider receives the position. Refreshing discards GPS and preserves only the chosen station. The app takes one fix rather than tracking movements.

GPS must be in Singapore, accurate to within 1 km, no older than 2 minutes when received, and within 3 km of an included station. Nearby station choices and walking times are approximate. Permission denial, timeout, stale/inaccurate fixes and out-of-area cases leave manual search available. Automated GPS tests use synthetic positions; phone permission flows and real outdoor accuracy still need device testing.

Routine preferences and non-GPS walkthroughs use device-local storage until Routine → Reset local data. GPS walkthroughs are not persisted. Service-worker caching keeps the app, network and map usable offline with a warning; static/replay conditions are never labelled as live. Google Fonts is optional and falls back to system fonts.

## Architecture and hackathon status

ES modules with a small Node API server, no build step: `dist/app.js` is the UI, `dist/network-planner.js` the engine, `dist/location.js` GPS validation/distance helpers, and `dist/data/network.js` the generated graph. `dist/sw.js` caches assets; `server.mjs` is the local server.

The app remains a prototype: schedule-derived rail timing still includes estimated waiting, interchange and uncertainty allowances, disruption replays are synthetic, and there is no background notification service. The server-side LTA proxy has been authenticated against TrainServiceAlerts, PCDRealTime and PCDForecast. Official current or forecast crowd levels appear on applicable route cards. Before claiming complete live navigation, physically validate pedestrian legs and capture a real disrupted response. No AI prediction accuracy is claimed.

Brief: https://github.com/aochinwen/NebulaX-Hackathon-ProblemStatement/blob/main/PS2/PS2_README.md

## Everyday companion (PS2 FAQ)

The default is an ordinary day. Routine offers arrival focus, fewer changes (12-minute scoring penalty per interchange), or an optional 0/5/10/15-minute walking break included in timing and deadline calculations. No pedestrian path or health outcome is claimed. Less-crowded preference remains independent.

The departure window compares ±15/30 minutes while preserving the arrival deadline. Late options are disabled. Route cards fetch PCDRealTime for immediate boarding and PCDForecast for later applicable intervals. When neither applies, the explicitly synthetic ordinary-day model assumes EWL/NSL/NEL are busier at 07:30–09:00 and 17:00–19:00. Preferences stay on this device; personas are explicitly chosen.

Multiple named routines can be enabled for selected weekdays and are evaluated in the day-ahead view. Next: outdoor GPS testing, physical pedestrian-route checks and background notifications if needed.

## Developer handoff

Continue from `main`. The app is a dependency-free mobile web app/PWA, not a native Android/iOS project. `dist/` contains the editable source, not disposable generated build output (except `dist/data/network.js`).

1. Clone this repository and run `npm start` with Node.js 22 or 24 LTS.
2. Open http://localhost:5173; run `npm test` and `npm run check` before pushing changes. The current suite has 28 passing tests.
3. Edit UI in `dist/app.js`, `dist/index.html`, and `dist/mobile.css`; routing in `dist/network-planner.js`. Rebuild station data with `node scripts/build-network.mjs` only when changing the source datasets/topology.
4. Prioritise everyday commute value from the PS2 FAQ: explicit user preferences, departure flexibility, less crowded options and active travel. Keep disruptions as an additional scenario.
5. Next implementation work: test real-device GPS, physically check selected station entrances and walking paths, and validate an authentic disrupted response. Rail edges now use LTA GTFS schedules; checked itineraries drive the map/walkthrough; applicable LTA crowd data appears on route cards.

Published preview: https://margin-commuter-nebulax.jw2201.chatgpt.site (owner-private). GitHub pushes do not automatically update that preview; publishing requires the owner's Sites access. Local development does not require Sites or credentials. `.sites-runtime/` is ignored scratch work and is not required to run the app.

## PS2 additions and Google Cloud submission

See [PS2_REVIEW.md](PS2_REVIEW.md) for the proposal selection and prioritised gaps, [WRITEUP.md](WRITEUP.md) for the submission write-up, and [GOOGLE_CLOUD.md](GOOGLE_CLOUD.md) for Cloud Run deployment. The organiser announcement requires Google Cloud availability. The Sites preview above does not fulfil that by itself; no Cloud Run deployment has been verified yet.

### Try live checks and door-to-door planning

On Today, use **Check official service alerts**. The server reads an optional LTA AccountKey from the environment. For local setup, copy .env.example to .env and set LTA_DATAMALL_ACCOUNT_KEY, obtained from [LTA DataMall](https://datamall.lta.gov.sg/). Restart the server after changing it. Never put the key in dist/. Missing credentials produce an explicit unavailable state.

Tap FROM or TO and search for a building, road or postal code. OneMap supplies Singapore address results. The server tries OneMap walking first and automatically falls back to openrouteservice when OneMap routing is unavailable. Configure `ONEMAP_API_TOKEN` and `OPENROUTESERVICE_API_KEY` in `.env`; both remain server-side. The validated provider geometry, directions, distance and duration replace the estimated station allowance. If neither provider verifies the path, the address is not applied.

Expand **Try assistance demos** for free regular public-bus boarding or a free MRT shuttle. Both assistance flags are synthetic and remain separate from official checks. An affected Paya Lebar–Kallang route also shows regular paid bus bridges generated from official BusStops and BusRoutes data, with live arrivals when available. These services are never presented as a free shuttle. Choose **Use this route on my map** to apply the checked rail alternative.

### API and data status

- GET /api/lta/train-alerts: authenticated LTA adapter; validates nested segments and advisory messages, caches checks for 60 seconds per server instance, and exposes fetch time. A normal-service response was verified with the configured AccountKey.
- GET /api/lta/crowding?line=EWL: validates station-level PCDRealTime observations. Only readings fetched within 15 minutes and covering the planned boarding time can affect advice; other readings are shown as stale or not applicable.
- GET /api/lta/crowding-forecast?line=EWL: validates and flattens daily PCDForecast intervals for future boarding times, with a six-hour server cache.
- GET /api/lta/bus-arrivals?stop=83139: bus-arrival adapter with a 30-second cache; null means ETA/occupancy unavailable.
- GET /api/lta/bus-bridge?from=paya&to=kallang: checked regular-bus alternatives derived from LTA BusStops and BusRoutes, enriched with live arrivals. It remains separate from free public-bus or MRT-shuttle assistance.
- GET /api/locations/search and GET /api/walking-route: OneMap address search plus OneMap-to-openrouteservice walking fallback. Geometry, endpoints, duration, distance and directions are validated before use.
- GET /api/health: deployment health check. API responses use no-store and are excluded from service-worker caching.
- PCDRealTime and PCDForecast are integrated for boarding and transfer stations on the main cards and checked alternatives. Labels distinguish “Live now”, “LTA forecast” and demo estimates.
- No Gemini, OneMap or Next.js migration in this increment; existing code uses explicit JavaScript validation. TypeScript and lint tooling are not configured; npm run check performs syntax checks, not type checking.

Verification: 33 automated tests and JavaScript syntax checks pass locally. Credential-backed checks returned OneMap search results, LTA alerts, 33 EWL real-time readings, 1,584 EWL forecast intervals and valid openrouteservice walking GeoJSON. LTA GTFS supplied 615 scheduled directed station pairs; 336 matched the app's 426 directed network edges. BusStops and BusRoutes supplied 10 bridge options around the replay disruption. Browser checks covered route forecasts, multiple routines and the bus-bridge disruption UI. Physical-phone, on-foot and authentic disrupted-feed checks remain outstanding.

Submission links still needed: **verified Cloud Run URL** and **demo recording URL**.
