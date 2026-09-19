import {routeImpacts} from './service-alerts.js';
import {planJourney,formatTime} from './engine.js';
import {network} from './data/network.js';
import {annotateCrowding} from './journey-enrichment.js';
import {boardingCrowd,nextDeparture} from './crowding.js';

// Official LTA crowding for every line used by the given routes (CCL readings also cover the Circle Line extension).
export function fetchCrowdFeeds(routes) {
 const lines=[...new Set(routes.flatMap(route=>route.edges.map(edge=>edge.line)).flatMap(line=>line==='CCL'?['CCL','CEL']:[line]))];
 return Promise.all(lines.flatMap(line=>['crowding','crowding-forecast'].map(async endpoint=>{
  try {const response=await fetch(`/api/lta/${endpoint}?line=${encodeURIComponent(line)}`,{signal:AbortSignal.timeout(10000),cache:'no-store'});return response.ok?response.json():{source:'unavailable',line};}
  catch {return {source:'unavailable',line};}
 })));
}

// Turns an official alert response into the plan Margin shows: the usual journey when no listed segment touches it,
// otherwise the best route that avoids every affected edge. Crowd data comes from the injected fetcher.
export async function buildCheckedPlan({state,places,alerts,crowdFeedsFor=fetchCrowdFeeds,originLocation=null}) {
 const base={...state,scenario:'normal',originLocation},departure=nextDeparture(state.departure);
 let baseline=planJourney(base);
 baseline=annotateCrowding(baseline,await crowdFeedsFor(baseline.routes),places,departure,boardingCrowd);
 const impacts=routeImpacts(baseline.usual,alerts,places);
 if(!impacts.length)return {status:'clear',plan:baseline,baseline,impacts,instruction:alerts.status==='normal'?'No major train disruption is currently reported.':'No listed segment matches your usual route. Check the advisories below.'};
 const affectedEdges=network.edges.filter(edge=>routeImpacts({edges:[edge]},alerts,places).length);
 let next;
 try {next=planJourney({...base,blockedEdges:affectedEdges.map(edge=>`${edge.from}|${edge.to}|${edge.line}`)});}
 catch {return {status:'no-alternative',plan:baseline,baseline,impacts,instruction:'Check station staff before boarding your usual line.'};}
 next=annotateCrowding({...next,originalUsual:baseline.usual,checkedAffectedEdges:affectedEdges},await crowdFeedsFor(next.routes),places,departure,boardingCrowd);
 const r=next.best;
 return {status:'rerouted',plan:next,baseline,impacts,instruction:r.buffer>=0?`Leave at ${state.departure}. Take ${r.lines.join(' → ')}; check platform signs.`:`Leave by ${formatTime(next.latestLeave)} if possible; the alternative misses your deadline at the saved departure time.`};
}
