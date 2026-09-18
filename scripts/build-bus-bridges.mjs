import fs from 'node:fs';
import {distanceKm} from '../dist/location.js';
import {network} from '../dist/data/network.js';

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
const [stops,routes]=await Promise.all([all('BusStops'),all('BusRoutes')]);
const groups=new Map();for(const row of routes){const key=`${row.ServiceNo}|${row.Direction}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
const nearbyStops=stops.filter(stop=>Object.values(network.stations).some(station=>distanceKm(station.coord,[Number(stop.Longitude),Number(stop.Latitude)])<=.8));
const nearbyCodes=new Set(nearbyStops.map(stop=>stop.BusStopCode));
const compactStops=nearbyStops.map(stop=>({code:stop.BusStopCode,name:stop.Description,road:stop.RoadName,coord:[Number(stop.Longitude),Number(stop.Latitude)]}));
const services=[];for(const rows of groups.values()){rows.sort((a,b)=>a.StopSequence-b.StopSequence);if(!rows.some(row=>nearbyCodes.has(row.BusStopCode)))continue;services.push({number:rows[0].ServiceNo,direction:rows[0].Direction,stops:rows.map(row=>row.BusStopCode),distances:rows.map(row=>Number(row.Distance))});}
const output={source:'LTA DataMall BusStops and BusRoutes',generatedAt:new Date().toISOString(),coverage:'direct buses within 800 m of MRT/LRT stations',stops:compactStops,services};
fs.writeFileSync('data/bus-network.json',JSON.stringify(output)+'\n');
console.log(`Loaded ${stops.length} stops and ${routes.length} route rows; wrote ${compactStops.length} station-near stops and ${services.length} directional services.`);
