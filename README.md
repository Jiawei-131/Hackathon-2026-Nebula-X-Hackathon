# Margin — a little breathing room

A mobile-first NebulaX Problem Statement 2 prototype for **Rachel**, the fixed-schedule commuter travelling from Tampines to Raffles Place. Margin optimises for protecting her arrival deadline and avoiding unnecessary interruptions.

## Run locally

Requires Node.js 20 or newer. No dependency installation or API key is required.

```sh
npm start
```

Open http://localhost:5173. For a physical phone on the same network, use the computer's LAN address on port 5173. Offline service workers require HTTPS or localhost, so use the hosted HTTPS app when testing offline on a phone.

```sh
npm test
npm run check
```

## Working features

- Nine curated origin/destination combinations, with walking legs, rail alternatives and arrival ranges.
- Deadline-aware ranking: worst-case estimated arrival, a crowding penalty, and a penalty for lateness. Preserve the usual route if its buffer clears the user's threshold and it is within five minutes of the fastest scored option.
- Clearly labelled synthetic replays for major disruption, normal service, minor delay, rain and next-day planned works.
- Cached OpenStreetMap road geometry, original/alternative routes, and the affected segment distinguished visually.
- Device-local routine preferences, larger text, a manually advanced journey walkthrough and an offline app shell.
- Optional NEA current two-hour forecast lookup with issue and validity times and an explicit failure state.

## Three-minute demo

1. Start with Tampines Central → One Raffles Place, leave 07:40, arrive by 08:45.
2. The default injected EWL fault adds 20 minutes between Paya Lebar and Kallang. The usual route's cautious arrival is 08:51; the alternative via DTL and Bugis arrives 08:30–08:33, preserving 12 minutes. Those are reproducible scenario estimates, not observed performance claims.
3. Open **Why this route?** to explain the buffer calculation. Compare route cards and map overlays.
4. Select **Try a different morning → A small delay**. The usual route still works; the app chooses silence rather than a pointless interruption.
5. Open **Looking ahead**, then plan around tomorrow's synthetic works.
6. Start **Let's get you there** and advance through the walking, rail and interchange legs. After the app is cached, disconnect the browser and reload to show its offline warning and cached plan.

## Architecture and data

Vanilla ES modules; no framework or build step. `dist/engine.js` is a pure deterministic scenario planner. `dist/app.js` provides UI and map rendering. `dist/sw.js` caches same-origin application assets. `server.mjs` is a dependency-free local file server; hosted deployment uses static assets.

The basemap is a single cached Overpass road extract covering 1.26–1.38 N, 103.82–103.96 E. Its embedded OSM base timestamp is preserved in `dist/data/osm-roads.json`. Coordinates are rounded to five decimal places and nonessential tags removed. OpenStreetMap contributors own the source data, available under ODbL: https://www.openstreetmap.org/copyright. No public tile server or repeated Overpass requests are used by the app.

Weather endpoint: https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast. Live weather is fetched only on request, identified by its issuance and validity window, and kept separate from replay transport conditions.

## Honest limits and work before submission

This is a **working interaction prototype**, not a production navigation system. Transport scenarios, crowding and duration ranges are synthetic. All overlays are illustrative connections between reference station coordinates, not computed OSM footpaths. The road basemap is real OSM data. The planner supports the listed nine corridors, not arbitrary addresses. It does not verify exits, lifts or sheltered walkways and is not intended for accessibility-constrained travel.

The app does **not yet meet the brief's live transport routing requirement**. Before final submission, connect LTA TrainServiceAlerts, crowding and planned events through a server-side AccountKey proxy; replace curated route/time assumptions with a validated OSM-based or OneMap routing integration; calibrate uncertainty; and validate the entire journey on the ground. Use `AffectedSegments` rather than assuming disruptions are flat records. Add canonical line-code mappings before joining different LTA APIs. Never put AccountKey in the browser or commit it.

Proactive decisions run while the app is open. There is no background scheduler, push service or notification permission request. No AI model is claimed: the deterministic ranking is inspectable and sufficient for demonstrating the decision logic. No calibrated confidence or probability is claimed.

## Privacy and offline behaviour

Preferences and the active walkthrough are stored only in this browser until **My routine → Reset local data**. No account, analytics, location tracking or server-side personal data. The public weather API receives the browser's ordinary network request, not the saved routine. Google Fonts is optional; system fonts work offline.

After a successful first visit, the service worker saves the app and map. When offline, the app keeps the replay plan and displays that conditions may have changed. It never presents cached data as a fresh live feed. External font and live-weather requests are not cached. Real-phone and underground field testing are still required.

## PS2 alignment

| Requirement | Prototype implementation | Remaining production work |
| --- | --- | --- |
| Specific commuter | Rachel, deadline and interruption threshold | Field interviews and validation |
| Plan/replan door-to-door | Curated rail + walking itineraries; scenario-sensitive ranking | Full routing engine, verified access legs and live LTA integration |
| OpenStreetMap base | Bundled attributed road geometry | Pedestrian routing graph |
| Visualise alternatives | Selected, usual and affected route overlays, crowd levels, arrival windows | Validated route geometry |
| Planned/unplanned | Separate labelled replay workflows | Official feeds and background delivery |
| Beyond the brief | Arrival-buffer budget and selective interruption | Measure usefulness and notification precision |

Brief: https://github.com/aochinwen/NebulaX-Hackathon-ProblemStatement/blob/main/PS2/PS2_README.md
