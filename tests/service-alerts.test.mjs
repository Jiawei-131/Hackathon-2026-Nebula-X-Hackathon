import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAlerts,assistanceDemos,availableAssistance,routeImpacts} from '../dist/service-alerts.js';
import {createLtaAdapter,FAILURE_TTL} from '../lib/api/lta.mjs';
import {createServer} from '../server.mjs';
import {planJourney,places} from '../dist/engine.js';
import {network} from '../dist/data/network.js';
import {readFileSync} from 'node:fs';

test('official nested segments preserve bus boarding separately from shuttle',()=>{
 const bus=parseAlerts(assistanceDemos.publicBus),shuttle=parseAlerts(assistanceDemos.shuttle);
 assert.equal(bus.status,'disrupted');assert.equal(availableAssistance(bus.segments[0].publicBus),true);assert.equal(availableAssistance(bus.segments[0].shuttle),false);
 assert.equal(availableAssistance(shuttle.segments[0].shuttle),true);assert.equal(shuttle.segments[0].shuttleDirection,'Both');
 for(const value of ['', 'No', 'N/A', 'None', '-', null])assert.equal(availableAssistance(value),false);
});
test('invalid feed never becomes a normal-service report',()=>{
 for(const value of [{},{value:{Status:1}},{value:{Status:3,AffectedSegments:[],Message:[]}}])assert.throws(()=>parseAlerts(value));
 assert.equal(parseAlerts({value:{Status:1,AffectedSegments:[],Message:[]}}).status,'normal');
});
test('route matching finds affected stations but excludes unrelated lines',()=>{
 const alerts=parseAlerts(assistanceDemos.publicBus);
 assert.equal(routeImpacts(planJourney({scenario:'normal'}).usual,alerts,places).length,1);
 assert.equal(routeImpacts(planJourney({origin:'woodlands',destination:'yishun',scenario:'normal'}).usual,alerts,places).length,0);
 const blockedEdges=network.edges.filter(e=>routeImpacts({edges:[e]},alerts,places).length).map(e=>`${e.from}|${e.to}|${e.line}`);
 const result=planJourney({scenario:'normal',blockedEdges});
 assert.ok(result.best.lines.includes('DTL'));
 for(const route of result.routes)assert.equal(routeImpacts(route,alerts,places).length,0);
 assert.equal(result.best.buffer,result.due-result.best.arrival);
});
test('official documentation disruption sample parses and affects its NEL corridor',()=>{
 const fixture=JSON.parse(readFileSync(new URL('../data/fixtures/lta-train-service-alerts-documentation-sample.json',import.meta.url),'utf8')),alerts=parseAlerts(fixture),route=planJourney({origin:'harbourfront',destination:'dhoby-ghaut',scenario:'normal'}).usual;
 assert.equal(alerts.status,'disrupted');assert.equal(alerts.segments[0].direction,'Punggol');assert.ok(routeImpacts(route,alerts,places).length>0);assert.equal(availableAssistance(alerts.segments[0].publicBus),true);assert.equal(availableAssistance(alerts.segments[0].shuttle),true);
});
test('missing credentials and upstream failures stay unavailable without exposing secrets',async()=>{
 let called=false;
 assert.equal((await createLtaAdapter({key:'',fetcher:()=>{called=true;}}).alerts()).reason,'missing-key');assert.equal(called,false);
 const result=await createLtaAdapter({key:'private',fetcher:()=>{throw Error('private');}}).alerts();
 assert.equal(result.source,'unavailable');assert.ok(!JSON.stringify(result).includes('private'));
});
test('successful LTA checks are validated, timestamped and cached',async()=>{
 let calls=0;
 const adapter=createLtaAdapter({key:'test',now:()=>1000,fetcher:async(url,options)=>{calls++;assert.equal(options.headers.AccountKey,'test');return {ok:true,json:async()=>assistanceDemos.publicBus};}});
 const first=await adapter.alerts();assert.equal(first.source,'live');assert.equal(first.fetchedAt,new Date(1000).toISOString());await adapter.alerts();assert.equal(calls,1);
 const broken=createLtaAdapter({key:'test',fetcher:async()=>({ok:true,json:async()=>({value:{Status:1}})})});assert.equal((await broken.alerts()).source,'unavailable');
});
test('a failed LTA request is retried after a minute, while a good forecast stays cached for hours',async()=>{
 let clock=Date.parse('2026-09-19T04:00:00Z'),calls=0,failing=true;
 const forecast={value:[{Date:'2026-09-19T00:00:00+08:00',Stations:[{Station:'EW2',Interval:[{Start:'2026-09-19T07:30:00+08:00',CrowdLevel:'h'}]}]}]};
 const adapter=createLtaAdapter({key:'test',now:()=>clock,fetcher:async()=>{calls++;if(failing)return {ok:false,json:async()=>({fault:{faultstring:'Rate limit quota violation'}})};return {ok:true,json:async()=>forecast};}});
 assert.equal((await adapter.forecast('EWL')).source,'unavailable');assert.equal(calls,1);
 clock+=FAILURE_TTL-1000;assert.equal((await adapter.forecast('EWL')).source,'unavailable');assert.equal(calls,1,'failure is briefly cached to avoid hammering LTA');
 failing=false;clock+=2000;
 const recovered=await adapter.forecast('EWL');assert.equal(recovered.source,'live');assert.equal(calls,2,'failure is not kept for the 6-hour forecast TTL');
 clock+=5*3600000;assert.equal((await adapter.forecast('EWL')).source,'live');assert.equal(calls,2,'a good forecast is still served from cache hours later');
 clock+=2*3600000;await adapter.forecast('EWL');assert.equal(calls,3,'the forecast is refreshed once its 6-hour TTL expires');
});
test('bus arrival adapter never fabricates missing ETA or crowd information',async()=>{
 const adapter=createLtaAdapter({key:'test',fetcher:async()=>({ok:true,json:async()=>({Services:[{ServiceNo:'10',NextBus:{EstimatedArrival:'',Load:''}}]})})});
 const result=await adapter.bus('83139');assert.deepEqual(result.services,[{service:'10',arrival:null,load:null}]);
});
test('HTTP server validates bus codes, shields files, and provides uncached API responses',async t=>{
 const oneMap={search:async query=>({source:'onemap',results:[{label:query,coord:[103.85,1.29]}]}),walk:async()=>({source:'onemap',minutes:5})};
 const server=createServer(createLtaAdapter({key:''}),oneMap);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base=`http://127.0.0.1:${server.address().port}`;
 assert.equal((await fetch(base+'/')).status,200);
 assert.equal((await fetch(base+'/.env')).status,404);
 assert.equal((await fetch(base+'/api/lta/bus-arrivals?stop=invalid')).status,400);
 assert.equal((await fetch(base+'/api/lta/bus-bridge?from=bad&to=kallang')).status,400);
 assert.equal((await fetch(base+'/api/lta/crowding?line=bad')).status,400);
 assert.equal((await fetch(base+'/api/lta/crowding-forecast?line=bad')).status,400);
 assert.equal((await fetch(base+'/api/locations/search?q=x')).status,400);
 assert.equal((await fetch(base+'/api/locations/search?q=Raffles')).status,200);
 assert.equal((await fetch(base+'/api/walking-route?startLon=0&startLat=0&endLon=0&endLat=0')).status,400);
 assert.equal((await fetch(base+'/api/walking-route?startLon=103.85&startLat=1.29&endLon=103.86&endLat=1.30')).status,200);
 assert.equal((await fetch(base+'/api/lta/train-alerts',{method:'POST'})).status,405);
 const sample=await fetch(base+'/api/lta/train-alerts/sample');assert.equal(sample.status,200);assert.equal((await sample.json()).source,'fixture');
 const response=await fetch(base+'/api/lta/train-alerts');assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).source,'unavailable');
 assert.equal((await fetch(base+'/api/health')).status,200);
});
