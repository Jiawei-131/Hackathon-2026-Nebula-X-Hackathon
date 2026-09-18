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
