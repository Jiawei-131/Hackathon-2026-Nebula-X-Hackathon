import {parseCrowding,parseCrowdForecast} from '../../dist/crowding.js';
import {parseAlerts} from '../../dist/service-alerts.js';
// Failures are cached briefly so a struggling or rate-limited upstream is not hammered, but they never
// outlive this window: a single hiccup must not hide data for the full success TTL (6 hours for forecasts).
export const FAILURE_TTL=60000;
export function createLtaAdapter({key=process.env.LTA_DATAMALL_ACCOUNT_KEY,fetcher=fetch,now=Date.now}={}) {
 const cache=new Map(),pending=new Map();
 async function get(path,parse,ttl=60000) {
  if(!key)return {source:'unavailable',reason:'missing-key',message:'Live service unavailable: LTA credentials are not configured. Labelled demos remain available.'};
  const stored=cache.get(path);if(stored && now()-stored.time<stored.ttl)return stored.data;
  if(pending.has(path))return pending.get(path);
  const request=(async()=>{
   try {
    const response=await fetcher(`https://datamall2.mytransport.sg/ltaodataservice/${path}`,{headers:{AccountKey:key,Accept:'application/json'},signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw Error('Upstream unavailable');
    const data={source:'live',fetchedAt:new Date(now()).toISOString(),...parse(await response.json())};
    cache.set(path,{time:now(),ttl,data});return data;
   } catch {
    const data={source:'unavailable',reason:'upstream-error',message:'Live service unavailable. No normal-service status is assumed; use station displays and official notices.'};
    cache.set(path,{time:now(),ttl:Math.min(ttl,FAILURE_TTL),data});return data;
   } finally {pending.delete(path);}
  })();
  pending.set(path,request);return request;
 }
 return {
  alerts:()=>get('TrainServiceAlerts',parseAlerts),
  crowd:line=>get(`PCDRealTime?TrainLine=${line}`,data=>parseCrowding(data,line),60000),
  forecast:line=>get(`PCDForecast?TrainLine=${line}`,data=>parseCrowdForecast(data,line),6*3600000),
  bus:stop=>get(`v3/BusArrival?BusStopCode=${stop}`,data=>{
   if(!Array.isArray(data.Services))throw Error('Invalid arrivals');
   return {stop,services:data.Services.map(s=>{
    if(typeof s.ServiceNo!=='string')throw Error('Invalid bus service');
    const eta=s.NextBus?.EstimatedArrival;
    if(eta && !Number.isFinite(Date.parse(eta)))throw Error('Invalid arrival');
    return {service:s.ServiceNo,arrival:eta||null,load:['SEA','SDA','LSD'].includes(s.NextBus?.Load)?s.NextBus.Load:null};
   })};
  },30000)
 };
}
