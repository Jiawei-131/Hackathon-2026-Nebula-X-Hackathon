# PS2 implementation review

Scope: improve the existing **Margin** app for Problem Statement 2. The attached SmartCommute text is a feature proposal, not a requirement to rename the product or replace its working architecture. Nothing from PS1 (track access) or PS3 (condition monitoring) is included.

## What was added

- Optional server-side LTA TrainServiceAlerts and v3/BusArrival adapters; credentials never reach the browser.
- Nested AffectedSegments parsing, message timestamps, separate free public-bus and MRT shuttle fields.
- A before-departure service check and two labelled assistance demos.
- Deterministic alternative rail planning that excludes edges touching affected stations on the affected line. Timing remains estimated, with deadline and transfer counts shown.
- Missing-key, timeout, invalid-response and unavailable-service handling; short server caches and no service-worker API caching.
- PORT support, environment example, Google Cloud source-upload exclusions and Cloud Run deployment instructions.
- Focused parser, routing, adapter and HTTP tests; syntax validation across all JavaScript files; accessible dialog names.

## Selection from the attached proposal

| Proposal | Decision / status |
| --- | --- |
| Mobile commuter UI, arrival deadline, route comparison, saved preferences, OSM | Reused existing functionality; retained Margin branding. |
| Official disruptions, free boarding and shuttle distinction | Added, including synthetic demos. The configured AccountKey returned an authenticated normal-service response; a real disrupted response still needs validation. |
| Deterministic recommendation before explanation | Added for official checks; model is not needed to invent or rank routes. |
| Bus arrival lookup | Server endpoint added and fixture-tested; not automatically matched to rail stations or shown as a bridging route. |
| Everyday/minor/major/planned/weather demos | Existing scenarios retained, with separate assistance demos. |
| Complete bus + MRT routing | A verified regular-bus bridge is implemented for the demonstrated Paya Lebar–Kallang disruption using LTA BusStops, BusRoutes and live BusArrival. Island-wide multimodal routing remains outside the MVP. |
| Door-to-door, address search, map picking | OneMap address search and OneMap-to-openrouteservice walking fallback are implemented. The Tampines Mall and One Raffles Place access legs were validated digitally with live credentials; physical checks and explicit map picking remain. |
| Station-specific crowding | PCDRealTime and PCDForecast are validated and shown on applicable main-route cards and checked alternatives. Labels preserve the difference between current observations, forecasts and demo estimates. |
| Saved journey weekday scheduling and enable/disable | Implemented locally: multiple named routines, weekday selection, enable/disable state and day-ahead matching. Background notifications remain outstanding. |
| Gemini, Next.js, TypeScript, shadcn, Zod | Not introduced in this increment. These are implementation preferences in the attachment, not PS2 judging requirements. Existing dependency-free architecture and explicit runtime validation retained. |
| Auth/database/background push | Not added; unnecessary for this MVP. |

## Improvements ordered by commuter value and judging impact

1. **Validate the door-to-door Rachel journey on a real phone and on foot.** Live OneMap search plus openrouteservice returned a 530 m Tampines Mall access path and an 84 m One Raffles Place access path. Confirm the selected entrances and accessibility physically; pedestrian routing does not imply step-free or sheltered access.
2. **Capture redacted LTA fixtures from authentic responses.** Live normal alerts, EWL real-time crowding and EWL forecasts have been authenticated. Preserve representative redacted fixtures and test changes against them; fetch time does not prove a notice remains current indefinitely.
3. **Validate official reroutes end to end.** Checked alternatives now replace the active map, route cards and walkthrough while preserving the original route and affected edges. Confirm the behavior against an authentic disruption response before calling it live navigation.
4. **Expand verified bus links only if judging requires it.** The replay corridor has regular paid bus bridges from official reference data and live arrivals. Island-wide bus routing would require broader itinerary work; never infer shuttle ETAs from regular bus ETAs.
5. **Consider background checks after the MVP.** Multiple scheduled routines and day-ahead matching are implemented locally. Background notifications still require a server-side subscription and user permission flow.
6. **Validate on a real phone and record the demo.** Check one-thumb use, text size, daylight contrast, offline state, keyboard behaviour and GPS. The two assistance scenarios are synthetic, not historical real incidents.
7. **Add Gemini only where measurable.** Summarise an official notice into a schema-validated explanation referencing an existing route ID. Keep facts and assistance flags deterministic and retain a fallback. Use a small held-out set to measure grounding; do not claim prediction accuracy without evidence.

## References

- [Official PS2 brief](https://github.com/aochinwen/NebulaX-Hackathon-ProblemStatement/blob/main/PS2/PS2_README.md)
- [Submission instructions](https://github.com/aochinwen/NebulaX-Hackathon-ProblemStatement/blob/main/PS2/submission/README.md)
- The linked `PS2/references/PS2_scoring_rubric.md` returned 404 during this review; assessment uses the rubric embedded in the brief.
- User-supplied organiser announcement: submission must be available on Google Cloud. A Sites preview alone does not establish this requirement. See GOOGLE_CLOUD.md.
