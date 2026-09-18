import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createLtaAdapter} from './lib/api/lta.mjs';
import {createOneMapAdapter,validCoord} from './lib/api/onemap.mjs';
import {createWalkingAdapter} from './lib/api/openrouteservice.mjs';
import {createBusBridgeAdapter} from './lib/api/bus-bridge.mjs';
try {process.loadEnvFile?.();}catch(error){if(error.code!=='ENOENT')throw error;}
const root=resolve(dirname(fileURLToPath(import.meta.url)),'dist');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
export function createServer(adapter=createLtaAdapter(),oneMap=createOneMapAdapter(),walking=createWalkingAdapter({oneMap}),busBridge=createBusBridgeAdapter(adapter)) {
 return http.createServer(async(req,res)=>{
  const json=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:JSON.stringify(body));};
  try {
   if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'}).end();return;}
   const url=new URL(req.url,'http://localhost');
   if(url.pathname==='/api/health'){json(200,{status:'ok'});return;}
   if(url.pathname==='/api/lta/train-alerts'){json(200,await adapter.alerts());return;}
   if(url.pathname==='/api/lta/crowding'){
    const line=url.searchParams.get('line');
    if(!/^(NSL|EWL|CGL|CCL|CEL|NEL|DTL|BPL|SLRT|PLRT|TEL)$/.test(line||'')){json(400,{error:'Choose a supported train line.'});return;}
    json(200,await adapter.crowd(line));return;
   }
   if(url.pathname==='/api/lta/crowding-forecast'){
    const line=url.searchParams.get('line');
    if(!/^(NSL|EWL|CGL|CCL|CEL|NEL|DTL|BPL|SLRT|PLRT|TEL)$/.test(line||'')){json(400,{error:'Choose a supported train line.'});return;}
    json(200,await adapter.forecast(line));return;
   }
   if(url.pathname==='/api/lta/bus-arrivals'){
    const stop=url.searchParams.get('stop');if(!/^\d{5}$/.test(stop||'')){json(400,{error:'Choose a five-digit bus stop code.'});return;}
    json(200,await adapter.bus(stop));return;
   }
   if(url.pathname==='/api/lta/bus-bridge'){
    const from=url.searchParams.get('from'),to=url.searchParams.get('to');
    if(!/^(paya|kallang)$/.test(from||'')||!/^(paya|kallang)$/.test(to||'')||from===to){json(400,{error:'Choose a supported disruption corridor.'});return;}
    json(200,await busBridge.find(from,to));return;
   }
   if(url.pathname==='/api/locations/search'){
    const query=(url.searchParams.get('q')||'').trim();
    if(query.length<2||query.length>100){json(400,{error:'Enter 2 to 100 characters.'});return;}
    json(200,await oneMap.search(query));return;
   }
   if(url.pathname==='/api/walking-route'){
    const start=[Number(url.searchParams.get('startLon')),Number(url.searchParams.get('startLat'))];
    const end=[Number(url.searchParams.get('endLon')),Number(url.searchParams.get('endLat'))];
    if(!validCoord(start)||!validCoord(end)){json(400,{error:'Choose valid Singapore start and end points.'});return;}
    json(200,await walking.walk(start,end));return;
   }
   if(url.pathname.startsWith('/api/')){json(404,{error:'Unknown endpoint'});return;}
   const file=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
   if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
   const body=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:body);
  }catch {res.writeHead(404).end('Not found');}
 });
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const port=Number(process.env.PORT||5173);
 createServer().listen(port,'0.0.0.0',()=>console.log(`Local: http://localhost:${port}`));
}
