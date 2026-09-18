import fs from 'node:fs';
import {distanceKm} from '../dist/location.js';

try {process.loadEnvFile?.();} catch {}
const key=process.env.LTA_DATAMALL_ACCOUNT_KEY;
if(!key)throw Error('LTA_DATAMALL_ACCOUNT_KEY is required');
async function all(path){
 const records=[];
 for(let skip=0;;skip+=500){
  const response=await fetch(`https://datamall2.mytransport.sg/ltaodataservice/${path}?$skip=${skip}`,{headers:{AccountKey:key,Accept:'application/json'},signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error(`${path} returned ${response.status}`);
  const data=await response.json(),batch=data.value;
  if(!Array.isArray(batch))throw Error(`Invalid ${path} response`);
  records.push(...batch);if(batch.length<500)break;
 }
 return records;
}
const stations={paya:{name:'Paya Lebar',coord:[103.8926706888,1.3177432141]},kallang:{name:'Kallang',coord:[103.8713123609,1.3114123456]}};
const [stops,routes]=await Promise.all([all('BusStops'),all('BusRoutes')]);
const stopByCode=new Map(stops.map(stop=>[stop.BusStopCode,{code:stop.BusStopCode,name:stop.Description,road:stop.RoadName,coord:[Number(stop.Longitude),Number(stop.Latitude)]}]));
const nearby=id=>stops.map(stop=>({stop:stopByCode.get(stop.BusStopCode),walkKm:distanceKm(stations[id].coord,[Number(stop.Longitude),Number(stop.Latitude)])})).filter(item=>item.walkKm<=0.8);
const groups=new Map();for(const row of routes){const key=`${row.ServiceNo}|${row.Direction}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
function choices(from,to){
 const origins=nearby(from),destinations=nearby(to),results=[];
 for(const rows of groups.values()){
  rows.sort((a,b)=>a.StopSequence-b.StopSequence);const byStop=new Map(rows.map(row=>[row.BusStopCode,row]));
  for(const origin of origins)for(const destination of destinations){const a=byStop.get(origin.stop.code),b=byStop.get(destination.stop.code);if(!a||!b||b.StopSequence<=a.StopSequence)continue;const km=Number(b.Distance)-Number(a.Distance);if(!(km>0&&km<15))continue;results.push({service:a.ServiceNo,direction:a.Direction,fromStop:origin.stop,toStop:destination.stop,walkFromMetres:Math.round(origin.walkKm*1000),walkToMetres:Math.round(destination.walkKm*1000),busStops:b.StopSequence-a.StopSequence,busDistanceKm:Number(km.toFixed(1)),score:origin.walkKm+destination.walkKm+km/20});}
 }
 const unique=new Map();for(const item of results.sort((a,b)=>a.score-b.score)){const key=`${item.service}|${item.fromStop.code}|${item.toStop.code}`;if(!unique.has(key))unique.set(key,item);}
 return [...unique.values()].slice(0,5).map(({score,...item})=>item);
}
const output={source:'LTA DataMall BusStops and BusRoutes',generatedAt:new Date().toISOString(),stations,bridges:{'paya|kallang':choices('paya','kallang'),'kallang|paya':choices('kallang','paya')}};
fs.writeFileSync('data/bus-bridges.json',JSON.stringify(output,null,2)+'\n');
console.log(`Loaded ${stops.length} stops and ${routes.length} route rows; wrote ${Object.values(output.bridges).reduce((n,x)=>n+x.length,0)} verified bridge options.`);
