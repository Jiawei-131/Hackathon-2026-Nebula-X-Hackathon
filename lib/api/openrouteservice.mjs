import {distanceKm} from '../../dist/location.js';
import {validCoord} from './onemap.mjs';

export function parseOrsWalk(data,start,end) {
 const feature=data?.features?.[0],summary=feature?.properties?.summary,geometry=feature?.geometry;
 if(geometry?.type!=='LineString'||!Array.isArray(geometry.coordinates)||geometry.coordinates.length<2||geometry.coordinates.length>50000)throw Error('Invalid walking geometry');
 const points=geometry.coordinates.map(point=>{
  if(!validCoord(point))throw Error('Walking route outside Singapore');
  return [point[0],point[1]];
 });
 if(!Number.isFinite(summary?.duration)||summary.duration<0||summary.duration>14400||!Number.isFinite(summary?.distance)||summary.distance<0||summary.distance>15000)throw Error('Invalid walking summary');
 const gaps=[distanceKm(start,points[0])*1000,distanceKm(end,points.at(-1))*1000];
 if(gaps.some(gap=>gap>150))throw Error('Walking path too far from the requested endpoints');
 const steps=(feature.properties?.segments||[]).flatMap(segment=>segment.steps||[]).map(step=>{
  if(typeof step.instruction!=='string'||step.instruction.length>2000||!Number.isFinite(step.distance)||step.distance<0)throw Error('Invalid walking instruction');
  return {text:step.instruction,metres:step.distance};
 });
 if(steps.length>1000)throw Error('Invalid walking instructions');
 return {source:'openrouteservice',provider:'openrouteservice',geometry:points,seconds:summary.duration,minutes:Math.ceil(summary.duration/60),metres:Math.round(summary.distance),instructions:steps,snapMetres:gaps.map(Math.ceil)};
}

export function createOrsAdapter({key=process.env.OPENROUTESERVICE_API_KEY,fetcher=fetch,now=Date.now}={}) {
 return {async walk(start,end) {
  if(!key)return {source:'unavailable',reason:'missing-key',message:'Walking directions are unavailable because the routing key is not configured.'};
  try {
   const response=await fetcher('https://api.openrouteservice.org/v2/directions/foot-walking/geojson',{method:'POST',headers:{Authorization:key,Accept:'application/geo+json, application/json','Content-Type':'application/json'},body:JSON.stringify({coordinates:[start,end],instructions:true}),signal:AbortSignal.timeout(12000)});
   if(!response.ok)throw Error('Upstream unavailable');
   return {fetchedAt:new Date(now()).toISOString(),...parseOrsWalk(await response.json(),start,end)};
  } catch {
   return {source:'unavailable',reason:'upstream-error',message:'No walking provider could verify this route. Try another nearby address or station.'};
  }
 }};
}

export function createWalkingAdapter({oneMap,ors=createOrsAdapter()}={}) {
 return {async walk(start,end) {
  const primary=oneMap?.walk?await oneMap.walk(start,end):{source:'unavailable',reason:'missing-provider'};
  if(primary.source==='onemap')return primary;
  const fallback=await ors.walk(start,end);
  return fallback.source==='openrouteservice'?fallback:{...fallback,attempted:['onemap','openrouteservice']};
 }};
}
