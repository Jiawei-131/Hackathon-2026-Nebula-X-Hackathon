import fs from 'node:fs';
import path from 'node:path';

const directory=process.argv[2];
if(!directory)throw Error('Usage: node scripts/build-rail-calibration.mjs <extracted GTFS directory>');
function csv(name){
 const rows=fs.readFileSync(path.join(directory,name),'utf8').trim().split(/\r?\n/),keys=rows.shift().split(',');
 return rows.map(row=>{const values=row.split(',');return Object.fromEntries(keys.map((key,index)=>[key,values[index]??'']));});
}
function seconds(value){const [hour,minute,second]=value.split(':').map(Number);return hour*3600+minute*60+second;}
const stops=new Map(csv('stops.txt').map(stop=>[stop.stop_id,stop.stop_code]));
const trips=new Map(csv('trips.txt').map(trip=>[trip.trip_id,trip.route_id]));
const samples=new Map(),previous=new Map();
for(const row of csv('stop_times.txt')){
 const route=trips.get(row.trip_id),code=stops.get(row.stop_id),prior=previous.get(row.trip_id);
 if(route&&code&&prior){
  const duration=seconds(row.arrival_time)-seconds(prior.departure),key=`${prior.code}|${code}|${route}`;
  if(duration>0&&duration<1200){if(!samples.has(key))samples.set(key,[]);samples.get(key).push(duration);}
 }
 previous.set(row.trip_id,{code,departure:row.departure_time});
}
const edges={};
for(const [key,values] of samples){values.sort((a,b)=>a-b);const median=values[Math.floor(values.length/2)];edges[key]={seconds:median,minutes:Math.max(1,Math.round(median/60)),samples:values.length};}
const feed=Object.fromEntries(csv('feed_info.txt')[0]?Object.entries(csv('feed_info.txt')[0]):[]);
const output={source:'LTA DataMall GTFS Schedule (Train)',endpoint:'GTFSScheduleTrain',generatedAt:new Date().toISOString(),feed,edges};
fs.writeFileSync('data/rail-calibration.json',JSON.stringify(output,null,2)+'\n');
console.log(`${Object.keys(edges).length} directed scheduled station pairs written to data/rail-calibration.json`);
