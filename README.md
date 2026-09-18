# Margin — a little breathing room

A mobile-first Singapore commuter companion for NebulaX PS2. It supports everyday commuting with saved priorities, departure flexibility, walking breaks and arrival deadlines; disruption replays are a secondary flow.

## Run and test

Node.js 20+, no dependencies or API keys required:

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

`dist/network-planner.js` uses line-aware shortest-path search with transfer costs, relevant disruption penalties and optional crowd preferences. Alternatives are deduplicated; the number of routes reflects distinct available paths. The EWL replay only affects paths traversing Paya Lebar–Aljunied–Kallang. The pure engine and GPS helpers have 17 automated tests, including graph connectivity, cross-island transfers, same-station trips and GPS failures.

Times are uncalibrated estimates: station distance divided by 0.65 km/min (MRT) or 0.35 km/min (LRT), plus dwell allowance, a 3-minute initial wait and 5 minutes per interchange. Arrival uncertainty grows with ride time and transfers. GPS walking uses straight-line distance × 1.3 at 0.075 km/min. None of these are measured performance claims or live ETAs.

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

Static ES modules, no build step: `dist/app.js` is the UI, `dist/network-planner.js` the engine, `dist/location.js` GPS validation/distance helpers, and `dist/data/network.js` the generated graph. `dist/sw.js` caches assets; `server.mjs` is the local server.

The app remains a prototype: crowding and disruptions are synthetic, times are estimates, and there is no background notification service. Before claiming PS2's complete live-routing requirement, connect official LTA feeds through a server-side AccountKey proxy, calibrate times, validate pedestrian legs and walk a real journey. No AI prediction accuracy is claimed.

Brief: https://github.com/aochinwen/NebulaX-Hackathon-ProblemStatement/blob/main/PS2/PS2_README.md

## Everyday companion (PS2 FAQ)

The default is an ordinary day. Routine offers arrival focus, fewer changes (12-minute scoring penalty per interchange), or an optional 0/5/10/15-minute walking break included in timing and deadline calculations. No pedestrian path or health outcome is claimed. Less-crowded preference remains independent.

The departure window compares ±15/30 minutes while preserving the arrival deadline. Late options are disabled. The explicitly synthetic ordinary-day crowd model assumes EWL/NSL/NEL are busier at 07:30–09:00 and 17:00–19:00. This demonstrates demand spreading, not observed occupancy or an operator reward programme. Preferences stay on this device; personas are explicitly chosen.

Next: actual occupancy/service feeds, outdoor GPS device testing, calibrated travel times and safe pedestrian routes for location-specific active alternatives.
