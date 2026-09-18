import test from 'node:test';
import assert from 'node:assert/strict';
import {createOneMapAdapter,decodeGeometry,parseWalk} from '../lib/api/onemap.mjs';
import {createOrsAdapter,createWalkingAdapter,parseOrsWalk} from '../lib/api/openrouteservice.mjs';
import {parseCrowding,parseCrowdForecast,boardingCrowd,nextDeparture} from '../dist/crowding.js';
import {applyAccessLegs,annotateCrowding} from '../dist/journey-enrichment.js';
import {planJourney,places} from '../dist/engine.js';
import {scheduledRoutines,validWeekdays} from '../dist/routines.js';
import {createBusBridgeAdapter} from '../lib/api/bus-bridge.mjs';

function encode(points) {
  let lastLat=0,lastLon=0,result='';
  const value=n=>{n=n<0?~(n<<1):n<<1;let out='';while(n>=32){out+=String.fromCharCode((32|(n&31))+63);n>>=5;}return out+String.fromCharCode(n+63);};
  for(const [lon,lat] of points){const a=Math.round(lat*1e5),b=Math.round(lon*1e5);result+=value(a-lastLat)+value(b-lastLon);lastLat=a;lastLon=b;}
  return result;
}

test('OneMap walk parsing verifies geometry endpoints and timing',()=>{
  const start=[103.944,1.354],end=[103.945,1.355],points=[start,[103.9445,1.3545],end];
  const walk=parseWalk({status:0,route_geometry:encode(points),route_summary:{total_time:420,total_distance:600},route_instructions:[['Straight','',600,'',0,0,0,0,'','Walk to the station']]},start,end);
  assert.deepEqual(decodeGeometry(encode(points)),points);assert.equal(walk.minutes,7);assert.equal(walk.metres,600);assert.equal(walk.instructions[0].text,'Walk to the station');
  assert.throws(()=>parseWalk({status:0,route_geometry:encode([[103.8,1.3],[103.81,1.31]]),route_summary:{total_time:5,total_distance:5},route_instructions:[]},start,end),/endpoints/);
});

test('OneMap adapter requires credentials and validates address results',async()=>{
  assert.equal((await createOneMapAdapter({token:''}).search('Raffles')).reason,'missing-key');
  const adapter=createOneMapAdapter({token:'secret',fetcher:async(url,options)=>{assert.equal(options.headers.Authorization,'secret');return {ok:true,json:async()=>({results:[{ADDRESS:'One Raffles Place',LATITUDE:'1.284',LONGITUDE:'103.851'}]})};}});
  assert.deepEqual((await adapter.search('Raffles')).results,[{label:'One Raffles Place',coord:[103.851,1.284]}]);
});

test('openrouteservice validates GeoJSON and provides a walking fallback',async()=>{
  const start=[103.944,1.354],end=[103.945,1.355];
  const response={features:[{geometry:{type:'LineString',coordinates:[start,[103.9445,1.3545],end]},properties:{summary:{duration:420,distance:600},segments:[{steps:[{instruction:'Walk east',distance:600}]}]}}]};
  const parsed=parseOrsWalk(response,start,end);assert.equal(parsed.source,'openrouteservice');assert.equal(parsed.minutes,7);assert.equal(parsed.instructions[0].text,'Walk east');
  const ors=createOrsAdapter({key:'secret',now:()=>1000,fetcher:async(url,options)=>{assert.match(url,/foot-walking\/geojson$/);assert.equal(options.headers.Authorization,'secret');return {ok:true,json:async()=>response};}});
  const fallback=createWalkingAdapter({oneMap:{walk:async()=>({source:'unavailable',reason:'upstream-error'})},ors});
  assert.equal((await fallback.walk(start,end)).source,'openrouteservice');
  assert.throws(()=>parseOrsWalk({...response,features:[{...response.features[0],geometry:{type:'LineString',coordinates:[[103.8,1.3],[103.81,1.31]]}}]},start,end),/endpoints/);
});

test('verified first and last walks replace station allowances and geometry',()=>{
  const base=planJourney({scenario:'normal'}),start=[103.943,1.353],end=[103.852,1.283];
  const walk=(geometry,minutes,metres)=>({source:'onemap',geometry,minutes,metres,instructions:[{text:'Verified walk',metres}]});
  const result=applyAccessLegs(base,{origin:walk([start,places.tampines.coord],8,650),destination:walk([places.raffles.coord,end],6,450),originStationName:'Tampines',destinationLabel:'One Raffles Place'});
  assert.equal(result.best.min,base.best.min+8);assert.deepEqual(result.best.geometry[0],start);assert.deepEqual(result.best.geometry.at(-1),end);assert.equal(result.best.steps[0].source,'OneMap');assert.equal(result.best.steps.at(-1).source,'OneMap');
});

test('crowding only scores fresh readings that cover boarding time',()=>{
  const now=Date.parse('2026-09-19T00:05:00Z'),data=parseCrowding({value:[{Station:'EW2',StartTime:'2026-09-19T08:00:00+08:00',EndTime:'2026-09-19T08:30:00+08:00',CrowdLevel:'h'}]},'EWL');
  const feed={source:'live',fetchedAt:new Date(now).toISOString(),...data};
  assert.equal(boardingCrowd(places.tampines,'EWL',[feed],Date.parse('2026-09-19T00:10:00Z'),now).rank,15);
  assert.equal(boardingCrowd(places.tampines,'EWL',[feed],Date.parse('2026-09-19T01:10:00Z'),now).rank,0);
  assert.equal(boardingCrowd(places.tampines,'EWL',[{...feed,fetchedAt:'2026-09-18T23:00:00Z'}],Date.parse('2026-09-19T00:10:00Z'),now).source,'stale');
  const plan=annotateCrowding(planJourney({scenario:'normal'}),[feed],places,Date.parse('2026-09-19T00:10:00Z'),boardingCrowd);
  assert.equal(plan.usual.crowdObservations[0].level,'High');assert.ok(Number.isFinite(nextDeparture('07:40',now)));
});

test('crowding forecast is used for a future boarding interval',()=>{
  const now=Date.parse('2026-09-19T00:05:00Z'),at=Date.parse('2026-09-19T01:10:00Z');
  const parsed=parseCrowdForecast({value:[{Date:'2026-09-19T00:00:00+08:00',Stations:[{Station:'EW2',Interval:[{Start:'2026-09-19T09:00:00+08:00',CrowdLevel:'m'}]}]}]},'EWL');
  const result=boardingCrowd(places.tampines,'EWL',[{source:'live',fetchedAt:new Date(now).toISOString(),...parsed}],at,now);
  assert.equal(result.source,'forecast');assert.equal(result.level,'Moderate');assert.equal(result.rank,5);
});

test('verified bus bridges preserve route facts and attach only matching live arrivals',async()=>{
  const adapter=createBusBridgeAdapter({bus:async stop=>({source:'live',services:[{service:'21',arrival:'2026-09-19T08:00:00+08:00',load:'SEA'},{service:'999',arrival:null,load:null}]})});
  const result=await adapter.find('paya','kallang');assert.equal(result.source,'lta');assert.ok(result.options.length>0);assert.equal(result.options[0].service,'21');assert.equal(result.options[0].load,'SEA');assert.equal(result.options[0].fromStop.code,'82109');
  const island=await adapter.find('raffles','tampines');assert.ok(['lta','unavailable'].includes(island.source));
  assert.equal(adapter.supports('raffles','tampines'),true);assert.equal(adapter.supports('missing','tampines'),false);
});

test('routine schedules require valid weekdays and respect enabled state',()=>{
  const routines=[{id:'work',enabled:true,weekdays:[1,2,3,4,5]},{id:'weekend',enabled:true,weekdays:[6,7]},{id:'off',enabled:false,weekdays:[1]}];
  assert.equal(scheduledRoutines(routines,1)[0].id,'work');assert.equal(scheduledRoutines(routines,6)[0].id,'weekend');assert.equal(validWeekdays([]),false);assert.equal(validWeekdays([1,1]),false);
});
