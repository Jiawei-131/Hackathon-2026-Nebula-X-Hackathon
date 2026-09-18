import {readFileSync} from 'node:fs';
import {distanceKm} from '../../dist/location.js';
import {network} from '../../dist/data/network.js';
const catalog=JSON.parse(readFileSync(new URL('../../data/bus-bridges.json',import.meta.url),'utf8'));
let island=null;try{island=JSON.parse(readFileSync(new URL('../../data/bus-network.json',import.meta.url),'utf8'));}catch{}

function directChoices(from,to){
 const a=network.stations[from],b=network.stations[to];if(!a||!b||!island)return null;
 const nearby=coord=>island.stops.map(stop=>({stop,walkKm:distanceKm(coord,stop.coord)})).filter(x=>x.walkKm<=.8);
 const origins=nearby(a.coord),destinations=nearby(b.coord),results=[];
 for(const service of island.services){const indexes=new Map(service.stops.map((code,index)=>[code,index]));for(const origin of origins)for(const destination of destinations){const i=indexes.get(origin.stop.code),j=indexes.get(destination.stop.code);if(i===undefined||j===undefined||j<=i)continue;const km=service.distances[j]-service.distances[i];if(!(km>0&&km<=30))continue;results.push({service:service.number,direction:service.direction,fromStop:origin.stop,toStop:destination.stop,walkFromMetres:Math.round(origin.walkKm*1000),walkToMetres:Math.round(destination.walkKm*1000),busStops:j-i,busDistanceKm:Number(km.toFixed(1)),score:origin.walkKm+destination.walkKm+km/20});}}
 const unique=new Map();for(const option of results.sort((x,y)=>x.score-y.score)){const key=`${option.service}|${option.fromStop.code}|${option.toStop.code}`;if(!unique.has(key))unique.set(key,option);}return [...unique.values()].slice(0,5).map(({score,...option})=>option);
}

export function createBusBridgeAdapter(lta) {
 return {supports(from,to){return Boolean(network.stations[from]&&network.stations[to]&&from!==to);},async find(from,to) {
  let options=directChoices(from,to),scope='island-wide direct bus';if(!options){options=catalog.bridges[`${from}|${to}`];scope='verified corridor';}
  if(!options?.length)return {source:'unavailable',reason:island?'no-direct-service':'catalog-unavailable',message:island?'No direct regular bus was found within an 800 m walk of both stations.':'Island-wide bus data has not been built yet.'};
  const arrivals=new Map();
  await Promise.all([...new Set(options.map(option=>option.fromStop.code))].map(async stop=>arrivals.set(stop,await lta.bus(stop))));
  return {source:'lta',routeDataAt:island?.generatedAt||catalog.generatedAt,scope,from,to,options:options.map(option=>{
   const feed=arrivals.get(option.fromStop.code),arrival=feed?.source==='live'?feed.services.find(service=>service.service===option.service):null;
   return {...option,arrival:arrival?.arrival||null,load:arrival?.load||null,arrivalSource:arrival?'live':'unavailable'};
  })};
 }};
}
