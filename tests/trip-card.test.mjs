import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {tripDay,tripSummary,describeRoutes,changesText} from '../dist/trip-summary.js';
import {describeDisruption,parseAlerts,assistanceDemos} from '../dist/service-alerts.js';
import {planJourney,places,lines} from '../dist/engine.js';

const rachel={origin:'tampines',destination:'raffles',departure:'07:40',deadline:'08:45',scenario:'normal'};
const sample=parseAlerts(JSON.parse(readFileSync(new URL('../data/fixtures/lta-train-service-alerts-documentation-sample.json',import.meta.url),'utf8')));

test('trip card timeline shows leave, travel, latest arrival, spare time and deadline from the same plan',()=>{
 const plan=planJourney(rachel),t=tripSummary(plan,plan.best,{departure:'07:40',deadline:'08:45',threshold:10});
 assert.equal(t.leave,'07:40');assert.equal(t.deadline,'08:45');
 assert.equal(t.duration,`${plan.best.min}–${plan.best.max} min`);
 assert.equal(t.latest,'08:23');assert.equal(t.earliest,'08:18');
 assert.equal(t.spare,'22 min spare','spare time is measured from the latest likely arrival');
 assert.equal(t.tone,'ok');assert.equal(t.verdict,'On time, 22 min spare');
});
test('trip card verdict turns tight below the alert threshold and late past the deadline',()=>{
 const tight=planJourney({...rachel,deadline:'08:30'}),late=planJourney({...rachel,deadline:'08:15'});
 const t1=tripSummary(tight,tight.best,{departure:'07:40',deadline:'08:30',threshold:10});
 assert.equal(t1.tone,'tight');assert.match(t1.verdict,/^Tight: only \d+ min spare$/);
 const t2=tripSummary(late,late.best,{departure:'07:40',deadline:'08:15',threshold:10});
 assert.equal(t2.tone,'late');assert.equal(t2.spare,`${-late.best.buffer} min late`);assert.match(t2.verdict,/^About \d+ min late if you leave at 07:40$/);
});
test('a departure already past today is labelled as tomorrow\'s trip',()=>{
 const noonSgt=Date.parse('2026-09-19T04:00:00Z'),earlySgt=Date.parse('2026-09-18T22:00:00Z');
 assert.equal(tripDay('07:40',noonSgt),'Tomorrow');assert.equal(tripDay('18:00',noonSgt),'Today');assert.equal(tripDay('07:40',earlySgt),'Today');
});
test('disruption summary names the line, stations, direction and free travel help in plain language',()=>{
 const route=planJourney(rachel).usual;
 const bus=describeDisruption({source:'demo',...parseAlerts(assistanceDemos.publicBus)},route,places,lines);
 assert.deepEqual({state:bus.state,lineName:bus.lineName,from:bus.from,to:bus.to,direction:bus.direction},{state:'affected',lineName:'East–West Line',from:'Paya Lebar',to:'Kallang',direction:'Both directions'});
 assert.equal(bus.publicBus,'Paya Lebar, Aljunied, Kallang');assert.equal(bus.shuttle,null,'free bus boarding is never described as a shuttle');
 const shuttle=describeDisruption({source:'demo',...parseAlerts(assistanceDemos.shuttle)},route,places,lines);
 assert.equal(shuttle.publicBus,null);assert.equal(shuttle.shuttle,'Paya Lebar, Aljunied, Kallang');assert.equal(shuttle.shuttleDirection,'both directions');
});
test('disruption summary separates clear, elsewhere, affected-with-direction and unavailable',()=>{
 const rachelRoute=planJourney(rachel).usual,nelRoute=planJourney({origin:'harbourfront',destination:'dhoby-ghaut',scenario:'normal'}).usual;
 assert.equal(describeDisruption({source:'live',status:'normal',segments:[],messages:[]},rachelRoute,places,lines).state,'clear');
 assert.deepEqual(describeDisruption({source:'fixture',...sample},rachelRoute,places,lines),{state:'elsewhere',lines:['North East Line']});
 const nel=describeDisruption({source:'fixture',...sample},nelRoute,places,lines);
 assert.equal(nel.state,'affected');assert.equal(nel.direction,'Towards Punggol');
 assert.equal(describeDisruption({source:'unavailable'},rachelRoute,places,lines).state,'unavailable');
});

test('route cards are named by their benefit and compared with the recommendation',()=>{
 const normal=planJourney(rachel),n=describeRoutes(normal);
 assert.equal(n.usual.label,'Fastest · Fewest changes');assert.equal(n.usual.compare,null,'the recommended route has no comparison line');
 assert.equal(n['alternative-1'].label,'Alternative');assert.equal(n['alternative-1'].compare,'20 min later · 2 more changes');
 const fault=planJourney({...rachel,scenario:'disruption'}),d=describeRoutes(fault);
 assert.equal(fault.best.id,'alternative-1');assert.equal(d['alternative-1'].label,'Fastest');
 assert.equal(d.usual.label,'Fewest changes','the delayed direct route still offers a real trade-off');
 assert.equal(d.usual.compare,'4 min later, but 2 fewer changes');
 for(const route of fault.routes)assert.notEqual(d[route.id].label,'','every route gets a name');
});
test('change counts read naturally',()=>{assert.equal(changesText(0),'No changes');assert.equal(changesText(1),'1 change');assert.equal(changesText(2),'2 changes');});
test('arriving exactly at the deadline says so plainly instead of 0 min spare',()=>{
 const plan=planJourney({...rachel,deadline:'08:23'}),t=tripSummary(plan,plan.best,{departure:'07:40',deadline:'08:23',threshold:10});
 assert.equal(plan.best.buffer,0);assert.equal(t.spare,'No spare time');assert.equal(t.verdict,'Tight: no spare time');assert.equal(t.tone,'tight');
});
