import {network} from './data/network.js';
import {distanceKm} from './location.js';
export {scenarios} from './scenarios.js';
import {scenarios} from './scenarios.js';
export const places=network.stations;
export const lines=network.lines;
export const metadata=network.metadata;
export const clockMinutes=t=>{const [h,m]=t.split(':').map(Number);return h*60+m;};
export const formatTime=n=>{n=((n%1440)+1440)%1440;return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;};
export const affectedPairs=[['paya','aljunied'],['aljunied','kallang']];
const affected=e=>e.line==='EWL'&&affectedPairs.some(([a,b])=>(e.from===a&&e.to===b)||(e.from===b&&e.to===a));
const adjacency=new Map(Object.keys(places).map(id=>[id,[]]));network.edges.forEach(e=>adjacency.get(e.from).push(e));
function findPath(origin,destination,{delay=0,transferWeight=5,avoidEdges=new Set(),comfort=false}={}){
 const queue=[{station:origin,line:'',cost:0,path:[],paid:false}],costs=new Map();
 while(queue.length){queue.sort((a,b)=>a.cost-b.cost);const item=queue.shift(),key=`${item.station}|${item.line}|${item.paid}`;if(costs.has(key)&&costs.get(key)<item.cost)continue;if(item.station===destination)return item.path;
  for(const edge of adjacency.get(item.station)||[]){if(item.path.some(e=>e.from===edge.to))continue;const change=item.line&&item.line!==edge.line;const incident=affected(edge)&&!item.paid?delay:0,paid=item.paid||affected(edge);const cost=item.cost+edge.minutes+(change?transferWeight:0)+incident+(avoidEdges.has(`${edge.from}|${edge.to}`)?3:0)+(comfort&&['EWL','NSL','NEL'].includes(edge.line)?1.5:0);const nextKey=`${edge.to}|${edge.line}|${paid}`;if(cost< (costs.get(nextKey)??Infinity)){costs.set(nextKey,cost);queue.push({station:edge.to,line:edge.line,cost,path:[...item.path,edge],paid});}}
 }return null;
}
export function planJourney({origin='tampines',destination='raffles',departure='07:40',deadline='08:45',scenario='disruption',comfort=false,threshold=10,priority="balanced",walkBreak=0,originLocation=null}={}){
 if(!Object.hasOwn(places,origin)||!Object.hasOwn(places,destination)||!Object.hasOwn(scenarios,scenario))throw Error('Choose a supported MRT or LRT station.');
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(departure)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(deadline)||![5,10,15].includes(Number(threshold)))throw Error('Choose a valid time and alert threshold.');
 if(!['balanced','simple','active'].includes(priority)||![0,5,10,15].includes(Number(walkBreak)))throw Error('Choose a valid commute preference.');
 const extraWalk=priority==='active'?Number(walkBreak):0;
 const start=clockMinutes(departure),event={...scenarios[scenario]};if(scenario==='planned'&&!(start<540&&start+90>420))event.delay=0;
 let due=clockMinutes(deadline);if(due<start)due+=1440;
 const from=places[origin],to=places[destination];let originWalk=3,originCoord=from.coord;
 if(originLocation){if(!Array.isArray(originLocation.coord)||originLocation.coord.length!==2||!originLocation.coord.every(Number.isFinite))throw Error('Invalid GPS position.');const distance=distanceKm(originLocation.coord,from.coord);if(distance>3)throw Error('Choose a station within 3 km of your location.');originWalk=Math.max(2,Math.ceil(distance*1.3/0.075));originCoord=originLocation.coord;}
 const base=findPath(origin,destination);if(base===null)throw Error('No connected rail route is available for these stations.');
 const paths=[{id:'usual',path:base}];const candidates=[findPath(origin,destination,{delay:event.delay,comfort}),findPath(origin,destination,{delay:event.delay,transferWeight:15}),findPath(origin,destination,{delay:event.delay,comfort:true,avoidEdges:new Set(base.map(e=>`${e.from}|${e.to}`))})];
 const signature=path=>path.map(e=>`${e.to}:${e.line}`).join('|');const seen=new Set([signature(base)]);for(const path of candidates){if(path&&!seen.has(signature(path))){seen.add(signature(path));paths.push({id:`alternative-${paths.length}`,path});}}
 const routes=paths.slice(0,3).map(({id,path})=>{
  const impacted=path.some(affected),delay=impacted?event.delay:0,groups=[];for(const edge of path){if(groups.at(-1)?.line===edge.line){groups.at(-1).edges.push(edge);}else groups.push({line:edge.line,edges:[edge]});}
  const transfers=Math.max(0,groups.length-1),walk=originWalk+3+(event.rain?2:0)+extraWalk,crowd=groups.some(g=>['EWL','NSL','NEL'].includes(g.line))?(scenario==='normal'?((start>=450&&start<540)||(start>=1020&&start<1140)?'high':'low'):event.crowd):(scenario==='normal'?'low':'medium');
  const ride=path.reduce((n,e)=>n+e.minutes,0),min=walk+ride+transfers*5+(path.length?3:0)+delay,max=min+Math.max(3,Math.ceil(ride*.15))+transfers*2,arrival=start+max,buffer=due-arrival;
  const steps=[{title:originLocation?`Walk to ${from.name} station`:`Enter ${from.name} station`,detail:originLocation?'Approximate walk from your GPS position. Distance allowance is not a verified pedestrian route.':'Allow time to reach the platform. Choose GPS to include your walk from your current location.',minutes:originWalk+(event.rain?2:0),type:'walk'}];
  if(extraWalk)steps.unshift({title:`Your ${extraWalk}-minute walking break`,detail:'An optional walk before entering the station. Choose a familiar, safe path; this is a time allowance, not pedestrian directions. Shorten it in Routine if the weather is unsuitable.',minutes:extraWalk,type:'walk'});
  if(path.length)steps.push({title:'Wait for your train',detail:'A 3-minute allowance; check platform displays for actual departure times.',minutes:3,type:'wait'});
  groups.forEach((group,i)=>{const first=group.edges[0],last=group.edges.at(-1);if(i)steps.push({title:`Change at ${places[first.from].name}`,detail:`Follow signs for ${lines[group.line]}. Interchange walking and waiting are estimated.`,minutes:5,type:'transfer'});steps.push({title:`Take ${lines[group.line]} to ${places[last.to].name}`,detail:`Board at ${places[first.from].name}, toward ${places[first.to].name} · ${group.edges.length} stop${group.edges.length===1?'':'s'} · ${group.edges.map(e=>places[e.to].name).join(' → ')}`,minutes:group.edges.reduce((n,e)=>n+e.minutes,0),type:'rail'});});
  if(delay)steps.push({title:'Allow for the replay disruption',detail:'EWL Paya Lebar–Kallang segment · synthetic delay, not a live advisory.',minutes:delay,type:'delay'});
  steps.push({title:`Exit at ${to.name}`,detail:'You have reached the selected station. Follow local exit signs; a destination address is not included.',minutes:3,type:'walk'});
  const penalty=comfort?(crowd==='high'?15:crowd==='medium'?5:0):0;return {id,name:id==='usual'?'Usual fastest route':`Alternative via ${groups.map(g=>g.line).join(' / ')}`,lines:groups.map(g=>g.line),min,max,arrival,buffer,crowd,walk,transfers,steps,geometry:[originCoord,from.coord,...path.map(e=>places[e.to].coord)],stationIds:[origin,...path.map(e=>e.to)],edges:path,score:max+penalty+(priority==='simple'?transfers*12:0)+Math.max(0,-buffer)*4,delay};
 });
 const usual=routes[0];let best=[...routes].sort((a,b)=>a.score-b.score)[0];if(!comfort&&priority!=='simple'&&usual.buffer>=threshold&&usual.max<=best.max+5)best=usual;
 const interrupted=usual.buffer<threshold||(scenario==='planned'&&usual.delay>0);return {routes,best,usual,event,start,due,interrupted,latestLeave:due-best.max,originCoord,originIsGps:!!originLocation,notice:best.buffer<0?'All options miss your deadline. Leave earlier if possible.':!interrupted?'Your usual journey still protects your arrival. No interruption needed.':`Take ${best.lines.join(' → ')||'the walking route'} to protect your arrival.`};
}
