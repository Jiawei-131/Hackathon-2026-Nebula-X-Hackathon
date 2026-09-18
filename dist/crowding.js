// LTA timestamps without a zone are Singapore local time, never browser local time.
export function ltaTime(value) {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/.test(value))return NaN;
 return Date.parse(/[Zz]$|[+-]\d{2}:\d{2}$/.test(value)?value:value+'+08:00');
}
export const crowdLines=['NSL','EWL','CGL','CCL','CEL','NEL','DTL','BPL','SLRT','PLRT','TEL'];
export function parseCrowding(data,line) {
 if(!Array.isArray(data?.value)||data.value.length>1000)throw Error('Invalid crowd response');
 return {line,stations:data.value.map(s=>{
  const start=ltaTime(s.StartTime),end=ltaTime(s.EndTime);
  if(typeof s.Station!=='string'||!s.Station.match(/^[A-Z]{1,3}\d{1,2}$/)||!['l','m','h','NA'].includes(s.CrowdLevel)||!Number.isFinite(start)||!Number.isFinite(end)||end<=start)throw Error('Invalid crowd observation');
  return {station:s.Station,line,level:({l:'Low',m:'Moderate',h:'High',NA:null})[s.CrowdLevel],start:new Date(start).toISOString(),end:new Date(end).toISOString()};
 })};
}
export function parseCrowdForecast(data,line) {
 if(!Array.isArray(data?.value)||data.value.length>14)throw Error('Invalid crowd forecast response');
 const stations=[];
 for(const day of data.value){
  if(!Number.isFinite(ltaTime(day?.Date))||!Array.isArray(day.Stations)||day.Stations.length>1000)throw Error('Invalid crowd forecast day');
  for(const station of day.Stations){
   if(typeof station.Station!=='string'||!station.Station.match(/^[A-Z]{1,3}\d{1,2}$/)||!Array.isArray(station.Interval)||station.Interval.length>96)throw Error('Invalid crowd forecast station');
   for(const interval of station.Interval){
    const start=ltaTime(interval.Start),level=({l:'Low',m:'Moderate',h:'High',NA:null})[interval.CrowdLevel];
    if(!['l','m','h','NA'].includes(interval.CrowdLevel)||!Number.isFinite(start))throw Error('Invalid crowd forecast interval');
    stations.push({station:station.Station,line,level,start:new Date(start).toISOString(),end:new Date(start+30*60000).toISOString(),forecast:true});
   }
  }
 }
 return {line,forecast:true,stations};
}
export function boardingCrowd(station,line,feeds,at,now=Date.now()) {
 const matches=feeds.flatMap(feed=>feed.source==='live'?(feed.stations||[]).filter(s=>station.codes.includes(s.station)&&(s.line===line||(line==='CCL'&&s.line==='CEL'))).map(s=>({...s,fetchedAt:feed.fetchedAt})):[]);
 const current=matches.filter(item=>!item.forecast).sort((a,b)=>Date.parse(b.end)-Date.parse(a.end))[0];
 if(current?.level){
  const start=Date.parse(current.start),end=Date.parse(current.end),fetched=Date.parse(current.fetchedAt),fresh=Number.isFinite(fetched)&&now-fetched<=15*60000&&fetched<=now+60000&&now>=start&&now<end;
  if(fresh&&at>=start&&at<end)return {...current,source:'live',label:`${current.level} · Live now`,rank:({Low:0,Moderate:5,High:15})[current.level]};
 }
 const forecast=matches.filter(item=>item.forecast&&item.level&&at>=Date.parse(item.start)&&at<Date.parse(item.end)).sort((a,b)=>Date.parse(b.fetchedAt)-Date.parse(a.fetchedAt))[0];
 if(forecast){
  const fetched=Date.parse(forecast.fetchedAt);
  if(Number.isFinite(fetched)&&now-fetched<=36*3600000&&fetched<=now+60000)return {...forecast,source:'forecast',label:`${forecast.level} · LTA forecast`,rank:({Low:0,Moderate:5,High:15})[forecast.level]};
 }
 if(current)return {...current,source:'stale',label:'Live observation does not cover your boarding time',rank:0};
 return {label:'Crowd information unavailable',source:'unavailable',rank:0};
}
export function nextDeparture(time,now=Date.now()) {
 const sg=new Date(now+8*3600000),date=sg.toISOString().slice(0,10);
 let departure=Date.parse(`${date}T${time}:00+08:00`);
 if(departure<now-60000)departure+=86400000;
 return departure;
}
