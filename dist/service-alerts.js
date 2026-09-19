// Shared by server and UI; credentials never belong here.
const text = value => typeof value === 'string' && value.length <= 12000;
export function parseAlerts(payload) {
  const raw=payload?.value, data=Array.isArray(raw)?raw[0]:raw;
  if(!data || !['1','2'].includes(String(data.Status)) || !Array.isArray(data.AffectedSegments) || !Array.isArray(data.Message)) throw Error('Invalid train alert response');
  const segments=data.AffectedSegments.map(s=>{
    if(!['Line','Direction','Stations','FreePublicBus','FreeMRTShuttle','MRTShuttleDirection'].every(k=>text(s[k]??'')) || !s.Line || !s.Stations)throw Error('Invalid affected segment');
    return {line:s.Line,direction:s.Direction||'Not listed',stations:s.Stations.split(',').map(x=>x.trim()).filter(Boolean),publicBus:s.FreePublicBus||'',shuttle:s.FreeMRTShuttle||'',shuttleDirection:s.MRTShuttleDirection||'Not listed'};
  });
  const messages=data.Message.map(m=>{
    if(!text(m.Content)||!text(m.CreatedDate))throw Error('Invalid advisory');
    return {content:m.Content,createdAt:m.CreatedDate};
  });
  return {status:String(data.Status)==='2'?'disrupted':'normal',segments,messages};
}
export function availableAssistance(value) {
  return typeof value==='string' && !/^(?:\s*|no|n\/a|na|nil|none|not available|not applicable|-)$/i.test(value.trim());
}
export function routeImpacts(route,alerts,stations) {
  if(alerts.status!=='disrupted')return [];
  // Conservatively flag both directions until direction text can be resolved reliably.
  return alerts.segments.filter(s=>route.edges.some(e=>e.line===s.line && [e.from,e.to].some(id=>stations[id]?.codes.some(code=>s.stations.includes(code)))));
}
export const assistanceDemos={
 publicBus:{value:{Status:2,AffectedSegments:[{Line:'EWL',Direction:'Both',Stations:'EW8,EW9,EW10',FreePublicBus:'EW8,EW9,EW10',FreeMRTShuttle:'',MRTShuttleDirection:''}],Message:[{Content:'Synthetic example: free boarding on regular public buses at affected stations. Check staff for eligible services.',CreatedDate:'Demo scenario — not a current notice'}]}},
 shuttle:{value:{Status:2,AffectedSegments:[{Line:'EWL',Direction:'Both',Stations:'EW8,EW9,EW10',FreePublicBus:'',FreeMRTShuttle:'EW8,EW9,EW10',MRTShuttleDirection:'Both'}],Message:[{Content:'Synthetic example: free MRT shuttle between affected stations. Follow station staff directions.',CreatedDate:'Demo scenario — not a current notice'}]}}
};
// Plain-language summary of an alert for one route: nothing wrong, trouble elsewhere, or this route is affected
// (which line, between which stations, which direction, and what free travel help LTA lists).
const stationCodes=value=>typeof value==='string'&&/^\s*[A-Z]{1,3}\d{1,3}(\s*,\s*[A-Z]{1,3}\d{1,3})*\s*$/.test(value)?value.split(',').map(code=>code.trim()):null;
export function describeDisruption(alerts,route,stations,lineNames={}) {
  if(!alerts||!['live','demo','fixture'].includes(alerts.source))return {state:'unavailable'};
  const nameOf=code=>Object.values(stations).find(station=>station.codes?.includes(code))?.name||code;
  const help=value=>{if(!availableAssistance(value))return null;const codes=stationCodes(value);return codes?codes.map(nameOf).join(', '):value.trim();};
  const impacts=routeImpacts(route,alerts,stations);
  if(!impacts.length){const lines=alerts.status==='disrupted'?[...new Set(alerts.segments.map(segment=>segment.line))]:[];return {state:lines.length?'elsewhere':'clear',lines:lines.map(line=>lineNames[line]||line)};}
  const segment=impacts[0],bus=impacts.map(s=>help(s.publicBus)).find(Boolean)||null,shuttleSegment=impacts.find(s=>help(s.shuttle));
  const direction=/^both$/i.test(segment.direction)?'Both directions':segment.direction&&segment.direction!=='Not listed'?`Towards ${segment.direction}`:'Direction not listed';
  const shuttleDirection=shuttleSegment&&shuttleSegment.shuttleDirection!=='Not listed'?(/^both$/i.test(shuttleSegment.shuttleDirection)?'both directions':`towards ${shuttleSegment.shuttleDirection}`):null;
  return {state:'affected',line:segment.line,lineName:lineNames[segment.line]||segment.line,from:nameOf(segment.stations[0]),to:nameOf(segment.stations.at(-1)),direction,more:impacts.length-1,publicBus:bus,shuttle:shuttleSegment?help(shuttleSegment.shuttle):null,shuttleDirection};
}
