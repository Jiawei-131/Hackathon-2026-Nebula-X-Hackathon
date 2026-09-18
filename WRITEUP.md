# Margin — PS2 write-up

## Persona and decision

Rachel is the primary disruption persona: Tampines to Raffles Place, leaving at 07:40 and arriving by 08:45. Small delays should not cause unnecessary route changes. The routine preferences also demonstrate fewer transfers and optional walking time. Provider-verified access paths remain subject to real-world entrance and accessibility checks.

## Architecture

A mobile web app with vanilla JavaScript, a local line-aware rail graph and a bundled attributed OpenStreetMap road extract. A small Node server serves static files and proxies fixed LTA endpoints. Secrets stay server-side. No database or authentication. The service-check recommendation is deterministic; no generative model calculates routes or fabricates facts.

Official alerts are checked on demand, independently of the default replay. Affected station codes and line codes conservatively exclude adjacent edges in both directions. This may exclude more service than a directional notice requires. The new itinerary remains separate from the main replay map/walkthrough.

## Evidence and assumptions

Run `npm test` and `npm run check`. Thirty-three automated tests cover journey invariants, quiet minor delays, nested alerts, assistance distinction, affected/unaffected routes, blocked-edge routing, provider fallback, current and forecast crowding, verified bus bridges, routine weekdays and HTTP validation. Separate credential checks verified live OneMap search, openrouteservice walking and LTA feeds without printing secrets.

Rail edges use median scheduled travel times from LTA's GTFS Schedule (Train), rounded to minutes; waiting, interchanges and uncertainty remain explicit planner allowances. OneMap supplies addresses and openrouteservice provides the working walking fallback. Provider walking is not claimed to be step-free or sheltered. Fresh PCDRealTime readings cover immediate boarding and PCDForecast covers applicable future intervals. Regular paid bus bridges use official BusStops and BusRoutes and never inherit free-shuttle claims.

## Privacy and offline

Routine preferences stay in local storage until reset. GPS coordinates remain in page memory; the LTA alert check sends no user coordinates to LTA. Cached static files enable offline replay use. API responses are not cached by the browser service worker. Live checks fail visibly offline, and fetch timestamps identify the last check; no ongoing monitoring or notifications are claimed.

## Remaining work and deployment

Remaining submission work is physical verification of entrances and walking routes, authentic disrupted-alert validation, real-device testing, Google Cloud deployment and a demo recording. See PS2_REVIEW.md for prioritisation. GOOGLE_CLOUD.md covers the organiser's deployment requirement; no Cloud Run deployment has been performed in this task.
