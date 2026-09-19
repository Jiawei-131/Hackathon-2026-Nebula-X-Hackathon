import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildCheckedPlan} from '../dist/live-plan.js';
import {parseAlerts,assistanceDemos,routeImpacts} from '../dist/service-alerts.js';
import {places} from '../dist/engine.js';

const rachel={origin:'tampines',destination:'raffles',departure:'07:40',deadline:'08:45',scenario:'disruption',priority:'balanced',walkBreak:10,comfort:false,threshold:10};
const normalService={source:'live',status:'normal',segments:[],messages:[]};
const officialSample=parseAlerts(JSON.parse(readFileSync(new URL('../data/fixtures/lta-train-service-alerts-documentation-sample.json',import.meta.url),'utf8')));
const noCrowdData=async routes=>{assert.ok(routes.length>0);return [];};

test('live plan keeps the usual journey and ignores a remembered demo scenario when no disruption is reported',async()=>{
 const result=await buildCheckedPlan({state:rachel,places,alerts:normalService,crowdFeedsFor:noCrowdData});
 assert.equal(result.status,'clear');assert.equal(result.impacts.length,0);
 assert.equal(result.plan.event.delay,0,'simulated signal fault must not leak into live mode');
 assert.equal(result.plan.best.id,'usual');assert.ok(result.plan.best.buffer>=0);
});
test('live plan leaves a route alone when LTA reports a disruption on another line',async()=>{
 const result=await buildCheckedPlan({state:rachel,places,alerts:officialSample,crowdFeedsFor:noCrowdData});
 assert.equal(officialSample.status,'disrupted');assert.equal(result.status,'clear');assert.equal(result.plan.best.id,'usual');
});
test('live plan reroutes around every affected edge in the official documentation sample',async()=>{
 const state={...rachel,origin:'harbourfront',destination:'dhoby-ghaut'};
 const result=await buildCheckedPlan({state,places,alerts:officialSample,crowdFeedsFor:noCrowdData});
 assert.equal(result.status,'rerouted');assert.ok(result.impacts.length>0);
 assert.ok(routeImpacts(result.plan.originalUsual,officialSample,places).length>0,'the original route stays available for the map');
 assert.ok(result.plan.checkedAffectedEdges.length>0);
 for(const route of result.plan.routes)assert.equal(routeImpacts(route,officialSample,places).length,0);
 assert.match(result.instruction,/^Leave (at|by) /);
});
test('an EWL disruption on Rachel\'s corridor produces an unaffected alternative with an honest buffer',async()=>{
 const alerts=parseAlerts(assistanceDemos.publicBus),result=await buildCheckedPlan({state:rachel,places,alerts,crowdFeedsFor:noCrowdData});
 assert.equal(result.status,'rerouted');
 assert.equal(routeImpacts(result.plan.best,alerts,places).length,0);
 assert.equal(result.plan.best.buffer,result.plan.due-result.plan.best.arrival);
});
test('unavailable crowd feeds are recorded per route without inventing a reading',async()=>{
 const result=await buildCheckedPlan({state:rachel,places,alerts:normalService,crowdFeedsFor:async routes=>routes.flatMap(route=>route.edges.map(edge=>({source:'unavailable',line:edge.line})))});
 for(const route of result.plan.routes){
  assert.ok(route.crowdObservations.length>0);
  for(const observation of route.crowdObservations)assert.ok(!['live','forecast'].includes(observation.source));
 }
});
