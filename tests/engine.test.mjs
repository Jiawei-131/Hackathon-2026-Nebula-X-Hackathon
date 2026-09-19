import test from 'node:test';
import assert from 'node:assert/strict';
import {planJourney,formatTime,scenarios,places,lines} from '../dist/engine.js';
import {network} from '../dist/data/network.js';
import {distanceKm,nearestStations,validatePosition,gpsError} from '../dist/location.js';
test('major disruption reroutes around the affected east-west segment',()=>{const p=planJourney();assert.notEqual(p.best.id,'usual');assert.equal(p.best.delay,0);assert.ok(p.usual.buffer<10);assert.equal(p.interrupted,true);assert.ok(!p.best.stationIds.includes('aljunied'));});
test('ordinary and minor-delay mornings do not interrupt Rachel',()=>{for(const scenario of ['normal','minor']){const p=planJourney({scenario});assert.equal(p.best.id,'usual');assert.equal(p.interrupted,false);assert.ok(p.usual.buffer>=10);}});
test('a generous deadline never brings back a delayed route once an unaffected alternative is close in time',()=>{
 // Regression: with a loose deadline the buffer/closeness "stay on usual" rule used to override the ranking
 // back onto the incident-delayed route whenever the numbers looked close enough, recommending a ride straight
 // into the reported fault even though a clean, equally-fast alternative existed.
 const p=planJourney({scenario:'disruption',deadline:'09:45'});
 assert.ok(p.usual.delay>0,'the usual route must still carry the incident penalty in this fixture');
 assert.ok(p.usual.buffer>=10,'precondition: buffer alone would have looked safe enough to stick with usual');
 assert.ok(p.usual.max<=p.best.max+5,'precondition: usual is close enough in time to have triggered the old override');
 assert.notEqual(p.best.id,'usual');assert.equal(p.best.delay,0);
});
test('impossible deadline is reported as late, never a positive buffer',()=>{const p=planJourney({deadline:'08:05'});assert.ok(p.routes.every(r=>r.buffer<0));assert.match(p.notice,/miss your deadline/);});
test('planned event produces pre-departure rerouting',()=>{const p=planJourney({scenario:'planned'});assert.notEqual(p.best.id,'usual');assert.equal(p.interrupted,true);});
test('all supported journeys have continuous endpoints and timing invariants',()=>{for(const origin of ['tampines','bedok','paya'])for(const destination of ['raffles','bugis','chinatown'])for(const scenario of Object.keys(scenarios)){const p=planJourney({origin,destination,scenario});for(const r of p.routes){assert.ok(r.min<=r.max);assert.equal(r.buffer,p.due-r.arrival);assert.equal(r.steps.reduce((n,s)=>n+s.minutes,0),r.min);assert.equal(r.steps[0].type,'walk');assert.equal(r.steps.at(-1).type,'walk');assert.ok(r.geometry.every(c=>c.length===2&&c.every(Number.isFinite)));}}});
test('clock handles overnight arrivals and invalid corridors are rejected',()=>{assert.equal(formatTime(1505),'01:05');const p=planJourney({departure:'23:40',deadline:'00:45'});assert.equal(p.due,1485);assert.throws(()=>planJourney({origin:'unknown'}),/supported/);});
test('planned works outside the journey window do not generate a delay',()=>{const p=planJourney({scenario:'planned',departure:'10:00',deadline:'11:15'});assert.equal(p.event.delay,0);assert.equal(p.interrupted,false);assert.equal(p.best.id,'usual');});
test('invalid clock and threshold inputs fail safely',()=>{assert.throws(()=>planJourney({departure:'99:00'}),/valid time/);assert.throws(()=>planJourney({threshold:NaN}),/valid time/);});
test('all stations form one connected network and every advertised line is routable',()=>{const reached=new Set(['tampines']);let changed=true;while(changed){changed=false;for(const e of network.edges)if(reached.has(e.from)&&!reached.has(e.to)){reached.add(e.to);changed=true;}}assert.equal(reached.size,Object.keys(places).length);assert.ok(reached.size>180);for(const line of Object.keys(lines))assert.ok(network.edges.some(e=>e.line===line));});
test('cross-island MRT and LRT journeys use real connected graph edges',()=>{for(const [origin,destination]of [['woodlands','harbourfront'],['punggol','one-north'],['cove','bayshore'],['tuas-link','changi-airport'],['choa-chu-kang','keppel'],['fernvale','hume']]){const p=planJourney({origin,destination});assert.equal(p.best.stationIds[0],origin);assert.equal(p.best.stationIds.at(-1),destination);for(const e of p.best.edges)assert.ok(network.edges.some(n=>n.from===e.from&&n.to===e.to&&n.line===e.line));assert.equal(p.best.steps.reduce((n,s)=>n+s.minutes,0),p.best.min);}});
test('replay disruption does not penalise an unrelated northern journey',()=>{const a=planJourney({origin:'woodlands',destination:'yishun',scenario:'disruption'}),b=planJourney({origin:'woodlands',destination:'yishun',scenario:'normal'});assert.equal(a.usual.delay,0);assert.equal(a.usual.min-b.usual.min,2);});
test('same station returns walking access without invented train rides',()=>{const p=planJourney({origin:'orchard',destination:'orchard'});assert.equal(p.routes.length,1);assert.equal(p.best.lines.length,0);assert.ok(p.best.steps.every(s=>s.type==='walk'));});
test('GPS finds nearby station and contributes a measured walking allowance',()=>{const coord=[103.787,1.438],nearby=nearestStations(coord,places);assert.equal(nearby[0].id,'woodlands');const position=validatePosition({coords:{longitude:coord[0],latitude:coord[1],accuracy:20},timestamp:1000},places,1100);const p=planJourney({origin:nearby[0].id,destination:'orchard',originLocation:position});assert.deepEqual(p.best.geometry[0],coord);assert.ok(p.best.steps[0].minutes>=2);assert.equal(distanceKm(coord,coord),0);});
test('GPS rejects out-of-area, inaccurate, stale and invalid positions',()=>{const good={coords:{longitude:103.787,latitude:1.438,accuracy:20},timestamp:1000};assert.throws(()=>validatePosition({...good,coords:{...good.coords,longitude:0}},places,1100),/Singapore/);assert.throws(()=>validatePosition({...good,coords:{...good.coords,accuracy:2000}},places,1100),/approximate/);assert.throws(()=>validatePosition(good,places,200000),/out of date/);assert.throws(()=>nearestStations([NaN,1.3],places),/Singapore/);assert.match(gpsError({code:1}),/denied/);assert.match(gpsError({code:3}),/too long/);});
test('train steps name only the boarding and alighting stations for every leg of a multi-change route',()=>{
  const detour=planJourney({scenario:'disruption'}).routes.find(r=>r.lines.join('/')==='DTL/NEL/EWL');
  assert.ok(detour);
  const rail=detour.steps.filter(s=>s.type==='rail');
  assert.deepEqual(rail.map(s=>s.title),['Take Downtown Line to Chinatown','Take North East Line to Outram Park','Take East–West Line to Raffles Place']);
  assert.deepEqual(rail.map(s=>s.detail),['Board at Tampines · alight at Chinatown · 13 stops','Board at Chinatown · alight at Outram Park · 1 stop','Board at Outram Park · alight at Raffles Place · 2 stops']);
  assert.deepEqual(detour.steps.filter(s=>s.type==='transfer').map(s=>s.title),['Change at Chinatown','Change at Outram Park']);
  assert.ok(rail.every(s=>!s.detail.includes('→')));
});
