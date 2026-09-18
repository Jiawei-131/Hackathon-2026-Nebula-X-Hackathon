import {readFileSync} from 'node:fs';
const catalog=JSON.parse(readFileSync(new URL('../../data/bus-bridges.json',import.meta.url),'utf8'));

export function createBusBridgeAdapter(lta) {
 return {async find(from,to) {
  const options=catalog.bridges[`${from}|${to}`];
  if(!options)return {source:'unavailable',reason:'unsupported-corridor',message:'No verified regular-bus bridge is available for this corridor.'};
  const arrivals=new Map();
  await Promise.all([...new Set(options.map(option=>option.fromStop.code))].map(async stop=>arrivals.set(stop,await lta.bus(stop))));
  return {source:'lta',routeDataAt:catalog.generatedAt,from,to,options:options.map(option=>{
   const feed=arrivals.get(option.fromStop.code),arrival=feed?.source==='live'?feed.services.find(service=>service.service===option.service):null;
   return {...option,arrival:arrival?.arrival||null,load:arrival?.load||null,arrivalSource:arrival?'live':'unavailable'};
  })};
 }};
}
