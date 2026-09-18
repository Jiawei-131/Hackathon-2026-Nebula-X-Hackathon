import {distanceKm} from '../../dist/location.js';
export function validCoord(c) {return Array.isArray(c)&&c.length===2&&c.every(Number.isFinite)&&c[0]>=103.59&&c[0]<=104.12&&c[1]>=1.20&&c[1]<=1.48;}
export function decodeGeometry(encoded) {
 if(typeof encoded!=='string'||encoded.length>250000)throw Error('Invalid walking geometry');
 let index=0,lat=0,lon=0;const points=[];
 const next=()=>{let result=0,shift=0,b;do {if(index>=encoded.length||shift>30)throw Error('Invalid polyline');b=encoded.charCodeAt(index++)-63;if(b<0||b>63)throw Error('Invalid polyline');result|=(b&31)<<shift;shift+=5;}while(b>=32);return result&1?~(result>>1):result>>1;};
 while(index<encoded.length){lat+=next();lon+=next();const c=[lon/1e5,lat/1e5];if(!validCoord(c))throw Error('Walking route outside Singapore');points.push(c);}
 if(points.length<2)throw Error('Empty walking geometry');return points;
}
export function parseWalk(data,start,end) {
 if(data?.error||data?.status!==0)throw Error('Walking route unavailable');
 const summary=data.route_summary;
 if(!summary||!Number.isFinite(summary.total_time)||summary.total_time<0||summary.total_time>14400||!Number.isFinite(summary.total_distance)||summary.total_distance<0||summary.total_distance>15000)throw Error('Invalid walking summary');
 const geometry=decodeGeometry(data.route_geometry);
 const gaps=[distanceKm(start,geometry[0])*1000,distanceKm(end,geometry.at(-1))*1000];
 if(gaps.some(g=>g>100))throw Error('Walking path too far from the requested endpoints');
 if(!Array.isArray(data.route_instructions)||data.route_instructions.length>1000)throw Error('Invalid walking instructions');
 const instructions=data.route_instructions.map(i=>{
  if(!Array.isArray(i)||typeof i[9]!=='string'||i[9].length>2000||!Number.isFinite(i[2])||i[2]<0)throw Error('Invalid walking instruction');
  return {text:i[9],metres:i[2]};
 });
 return {source:'onemap',geometry,seconds:summary.total_time,minutes:Math.ceil(summary.total_time/60),metres:summary.total_distance,instructions,snapMetres:gaps.map(Math.ceil)};
}
export function createOneMapAdapter({token=process.env.ONEMAP_API_TOKEN,fetcher=fetch,now=Date.now}={}) {
 async function request(path,params,parse) {
  if(!token)return {source:'unavailable',reason:'missing-key',message:'Address search and walking routes need a OneMap token. Station planning remains available.'};
  try {
   const response=await fetcher(`https://www.onemap.gov.sg/api/${path}?${new URLSearchParams(params)}`,{headers:{Authorization:token,Accept:'application/json'},signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw Error();const data=await response.json();if(data.error)throw Error();
   return {source:'onemap',fetchedAt:new Date(now()).toISOString(),...parse(data)};
  }catch{return {source:'unavailable',reason:'upstream-error',message:'OneMap could not verify this route or address. Check the token or try again; no walking path has been invented.'};}
 }
 return {
  search:query=>request('common/elastic/search',{searchVal:query,returnGeom:'Y',getAddrDetails:'Y',pageNum:'1'},data=>{
   if(!Array.isArray(data.results))throw Error();
   return {results:data.results.slice(0,20).map(r=>{
    const coord=[Number(r.LONGITUDE),Number(r.LATITUDE)],label=r.ADDRESS||r.SEARCHVAL;
    if(!validCoord(coord)||typeof label!=='string'||label.length>500)throw Error();
    return {label,coord};
   })};
  }),
  walk:(start,end)=>request('public/routingsvc/route',{start:`${start[1]},${start[0]}`,end:`${end[1]},${end[0]}`,routeType:'walk'},data=>parseWalk(data,start,end))
 };
}
