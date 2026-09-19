import {parseAlerts,availableAssistance,routeImpacts,describeDisruption} from './service-alerts.js';
import {formatTime,lines as lineNames,affectedPairs} from './engine.js';
import {buildCheckedPlan,fetchCrowdFeeds} from './live-plan.js';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const badge=(kind,text)=>`<span class="data-badge ${kind}">${esc(text)}</span>`;
const sgClock=new Intl.DateTimeFormat('en-SG',{timeZone:'Asia/Singapore',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
// fetchedAt is ISO/UTC from our server; LTA CreatedDate is already Singapore local time ("YYYY-MM-DD HH:MM:SS").
export const checkedTime=iso=>{const time=Date.parse(iso);return Number.isFinite(time)?sgClock.format(time):'';};
const noticeTime=value=>{const m=/^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2})/.exec(value);return m?`${Number(m[3])} ${months[m[2]-1]}, ${m[4]}`:value;};
// Whole-word matching: " ewl " matches "EWL" or "East-West Line" wording but not "Jewel".
const normalise=value=>` ${String(value).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()} `;
function routeTerms(plan,places){
 const routes=[plan.usual,plan.best].filter(Boolean),lineIds=[...new Set(routes.flatMap(route=>route.edges.map(edge=>edge.line)))];
 const stationNames=[...new Set(routes.flatMap(route=>route.stationIds||[]))].map(id=>places[id]?.name).filter(Boolean);
 return {lineIds,words:[...lineIds,...lineIds.map(id=>lineNames[id]).filter(Boolean),...stationNames].map(normalise)};
}
// Live notices are split into this trip's lines/stations and everything else; demo and fixture data are always shown in full.
function splitNotices(data,terms){
 const all=data.source!=='live',segments=all?data.segments:data.segments.filter(s=>terms.lineIds.includes(s.line)),messages=all?data.messages:data.messages.filter(m=>terms.words.some(word=>normalise(m.content).includes(word)));
 return {segments,messages,otherSegments:data.segments.filter(s=>!segments.includes(s)),otherMessages:data.messages.filter(m=>!messages.includes(m))};
}
let alertCache=null,alertPending=null,detailsOpen=false;
export function fetchAlerts(force=false){
 if(!force&&alertCache&&Date.now()-alertCache.time<60000)return Promise.resolve(alertCache.data);
 if(!force&&alertPending)return alertPending;
 alertPending=(async()=>{
  try {const response=await fetch('/api/lta/train-alerts',{signal:AbortSignal.timeout(10000),cache:'no-store'});if(!response.ok)throw Error();const data=await response.json();alertCache={time:Date.now(),data};return data;}
  catch {return {source:'unavailable',message:'Live service unavailable. Check your connection or station displays; no normal-service status is assumed.'};}
 })().finally(()=>{alertPending=null;});
 return alertPending;
}

// The disruption component: one line when nothing affects the trip, an expanded box (what, where, direction,
// free travel help) when it does. Live mode shows the official LTA status; Demo mode shows the simulation, never both.
function statusHtml({tone,icon,headline,meta='',body=''}){return `<div class="service-status" data-tone="${tone}"><span class="service-icon" aria-hidden="true">${icon}</span><div class="service-main"><p class="service-headline">${esc(headline)}</p>${meta?`<p class="service-sub">${meta}</p>`:''}${body}</div></div>`;}
function helpHtml(d){return `<ul class="service-help"><li><span aria-hidden="true">🚌</span><span>${d.publicBus?`<strong>Free public bus</strong> at ${esc(d.publicBus)}`:'Free public bus: not listed'}</span></li><li><span aria-hidden="true">🚆</span><span>${d.shuttle?`<strong>Free MRT shuttle</strong> at ${esc(d.shuttle)}${d.shuttleDirection?`, ${esc(d.shuttleDirection)}`:''}`:'Free MRT shuttle: not listed'}</span></li></ul>`;}
function alertStatus(data,plan,places,terms,simulated){
 if(!data)return statusHtml({tone:'muted',icon:'…',headline:simulated?'Loading the simulated alert…':'Checking LTA train alerts…'});
 if(!['live','demo'].includes(data.source))return statusHtml({tone:'muted',icon:'!',headline:'Live LTA alerts are unavailable',meta:esc('Check station displays before you leave.')});
 const d=describeDisruption(data,plan.originalUsual||plan.usual,places,lineNames),time=checkedTime(data.fetchedAt);
 const source=simulated?badge('sim','Simulated'):badge('live',time?`Live · LTA ${time}`:'Live');
 if(d.state==='affected')return statusHtml({tone:'warn',icon:'!',headline:`${d.lineName} disrupted · ${d.from} → ${d.to}`,meta:`${source} ${esc(d.direction+(d.more?` · +${d.more} more`:''))}`,body:`<p class="service-note">${plan.originalUsual?'Your usual route is affected, so Margin rerouted you.':'Your usual route is affected and no rail alternative was found.'}</p>${helpHtml(d)}`});
 if(d.state==='elsewhere')return statusHtml({tone:'ok',icon:'✓',headline:simulated?'Simulated alert: your route is clear':'LTA: your route is clear',meta:`${source} ${esc(`Disruption on the ${d.lines.join(' and ')}`)}`});
 const notices=splitNotices(data,terms),others=notices.otherSegments.length+notices.otherMessages.length;
 return statusHtml({tone:'ok',icon:'✓',headline:'LTA: no train disruptions now',meta:`${source}${others?` ${esc(`${others} other network notice${others===1?'':'s'}`)}`:''}`});
}
function scenarioStatus(key,plan,places){
 const event=plan.event,simulated=badge('sim','Simulated');
 if(!event.delay)return statusHtml({tone:'ok',icon:'✓',headline:'No train disruption in this simulation',meta:`${simulated} ${esc(key==='rain'?'Heavy rain is simulated, so walks may be slower.':'Tap ● Live now for real LTA alerts.')}`});
 const from=places[affectedPairs[0][0]]?.name,to=places[affectedPairs.at(-1)[1]]?.name,what={disruption:'signal fault',minor:'delay',planned:'planned works'}[key]||'disruption';
 if(!plan.usual.delay)return statusHtml({tone:'ok',icon:'✓',headline:'Your route is clear',meta:`${simulated} ${esc(`Simulated East–West Line ${what} elsewhere`)}`});
 return statusHtml({tone:'warn',icon:'!',headline:`East–West Line ${what} · ${from} → ${to}`,meta:`${simulated} ${esc(`Adds about ${event.delay} min`)}`,body:`<p class="service-note">${plan.best.id!=='usual'?'Your usual route is affected, so Margin rerouted you.':'Your usual route is slower but still gets you there in time.'}</p>`});
}

let generation=0;
export function mountServiceCheck({state,plan,places,onActivate,onRefresh,originLocation=null,mode='live',demo=null,ready=true}) {
 const host=document.querySelector('#service-check'),version=++generation,terms=routeTerms(plan,places),simulatedAlert=mode==='demo'&&demo?.kind==='alert',scenario=mode==='demo'&&!simulatedAlert;
 const summary=scenario?'Test with LTA’s official sample alert':simulatedAlert?'Full simulated notice':'Details';
 host.innerHTML=`<div class="service-slot" role="status" aria-live="polite"></div><details id="service-details"${!scenario&&!simulatedAlert&&detailsOpen?' open':''}><summary>${summary}</summary>${scenario?'<p>Replays the sample alert from LTA’s DataMall documentation to show how Margin reads a real alert, without claiming a live event.</p><button class="outline-button" id="check-fixture">Run the LTA sample alert</button>':''}<div id="service-result"></div>${!scenario&&!simulatedAlert?'<button class="outline-button" id="check-official">Check again</button>':''}</details>`;
 const slot=host.querySelector('.service-slot'),out=host.querySelector('#service-result'),details=host.querySelector('#service-details');
 const paint=html=>{if(version===generation)slot.innerHTML=html;};
 const names=codes=>codes.map(code=>{const station=Object.values(places).find(s=>s.codes.includes(code));return station?`${station.name} (${code})`:code;}).join(', ');
 const segmentHtml=s=>`<div class="service-segment"><strong>${esc(s.line)} · ${esc(s.direction)}</strong><p>Affected: ${esc(names(s.stations))}</p><p><strong>${availableAssistance(s.publicBus)?'Free public bus boarding available':'Free public-bus boarding: not listed'}</strong>${availableAssistance(s.publicBus)?'<br>'+esc(s.publicBus):''}</p><p><strong>${availableAssistance(s.shuttle)?'Free MRT shuttle available':'Free MRT shuttle: not listed'}</strong>${availableAssistance(s.shuttle)?'<br>'+esc(s.shuttle)+' · '+esc(s.shuttleDirection):''}</p></div>`;
 const messageHtml=m=>`<p>${esc(m.content)}<br><small>${esc(noticeTime(m.createdAt))}</small></p>`;
 const assistanceNote='<p>Regular free bus boarding is not a dedicated shuttle. Follow official signs for boarding points and eligible services. Bus arrivals are not inferred for shuttle services.</p>';
 async function busBridgeFor(route,data) {
  const ids=route.stationIds||[],affected=new Set(data.segments.flatMap(segment=>segment.stations));
  const indexes=ids.map((id,index)=>places[id]?.codes.some(code=>affected.has(code))?index:-1).filter(index=>index>=0);if(!indexes.length)return '';
  const first=Math.max(0,Math.min(...indexes)-1),last=Math.min(ids.length-1,Math.max(...indexes)+1),from=ids[first],to=ids[last];if(from===to)return '';
  try {
   const response=await fetch(`/api/lta/bus-bridge?from=${from}&to=${to}`,{signal:AbortSignal.timeout(12000),cache:'no-store'}),data=await response.json();
   if(!response.ok||data.source!=='lta'||!data.options?.length)return '';
   const eta=value=>{if(!value)return 'arrival unavailable';const minutes=Math.max(0,Math.ceil((Date.parse(value)-Date.now())/60000));return Number.isFinite(minutes)?`${minutes} min`:'arrival unavailable';};
   return `<div class="service-segment"><strong>Direct regular-bus alternatives · ${esc(places[from].name)} to ${esc(places[to].name)}</strong> ${badge('live','Live LTA bus data')}<p>Official LTA stops and routes, within 800 m of each rail station. These are ordinary paid services, separate from free boarding or MRT shuttles.</p>${data.options.slice(0,3).map(option=>`<p><strong>Bus ${esc(option.service)} · ${eta(option.arrival)}</strong><br>Walk ${option.walkFromMetres} m to ${esc(option.fromStop.name)} (${option.fromStop.code}), ride ${option.busStops} stops, then walk ${option.walkToMetres} m from ${esc(option.toStop.name)} (${option.toStop.code}). ${option.load?`Load: ${esc(option.load)}.`:''}</p>`).join('')}</div>`;
  } catch {return '';}
 }
 // The full notice: affected segments, nearby regular buses when the trip is affected, and LTA's messages.
 async function noticeDetails(data) {
  if(data.source==='unavailable')return `<p>${esc(data.message)}</p><p>Try a demo scenario to see how Margin reacts.</p>`;
  const route=plan.originalUsual||plan.usual,notices=splitNotices(data,terms),others=notices.otherSegments.length+notices.otherMessages.length;
  const bus=routeImpacts(route,data,places).length?await busBridgeFor(route,data):'';
  return `${notices.segments.map(segmentHtml).join('')}${bus}${notices.messages.map(messageHtml).join('')}${notices.segments.length||notices.messages.length?'':'<p>No LTA notices mention your lines or stations.</p>'}${others?`<details class="other-notices"><summary>Other network notices (${others})</summary>${notices.otherSegments.map(segmentHtml).join('')}${notices.otherMessages.map(messageHtml).join('')}</details>`:''}${data.segments.length?assistanceNote:''}`;
 }
 // Test tool only: replays LTA's documented sample through the full reroute so the result can be checked end to end.
 async function displaySample(data) {
  const crowdFor=route=>route.crowdObservations?.map(item=>`${item.stationName} ${item.line}: ${item.label}`).join('<br>')||'Crowd information unavailable.';
  const result=await buildCheckedPlan({state,places,alerts:data,crowdFeedsFor:async()=>[],originLocation});
  const {impacts,instruction,baseline}=result,checkedPlan=result.status==='no-alternative'?null:result.plan;
  let alternative=`<p><strong>Station crowding on your route</strong><br>${crowdFor(baseline.best)}</p><button class="primary-button" id="use-checked-route">Use checked conditions on my map →</button>`;
  if(result.status==='rerouted'){const next=result.plan,r=next.best;alternative=`<p><strong>Alternative avoiding listed affected stations</strong><br>Estimated arrival ${formatTime(next.start+r.min)}–${formatTime(r.arrival)} · ${r.transfers} transfers · ${r.buffer>=0?r.buffer+' min buffer':-r.buffer+' min late'}</p><button class="primary-button" id="use-checked-route">Use this route on my map →</button>`;}
  if(result.status==='no-alternative')alternative='<p>No alternative rail route could be found. Check official assistance and station staff; no bus route or arrival time has been invented.</p>';
  if(version!==generation)return;
  const validation=impacts.length?'message parsed · direction parsed · assistance flags separated · affected edges identified · reroute calculated · map action ready':'message parsed · direction parsed · assistance flags separated · selected route correctly marked unaffected';
  out.innerHTML=`${badge('sim','LTA sample data · not live')}<h3>${esc(instruction)}</h3><p><strong>Validation passed:</strong> ${validation}.</p>${alternative}${data.segments.map(segmentHtml).join('')}${data.messages.map(messageHtml).join('')}${assistanceNote}`;
  const useRoute=host.querySelector('#use-checked-route');if(checkedPlan&&useRoute)useRoute.onclick=()=>onActivate?.(checkedPlan,{source:'demo',headline:instruction,impacted:impacts.length>0,fetchedAt:data.fetchedAt,alerts:data});
 }
 const setSummary=data=>{const affected=data&&['live','demo'].includes(data.source)&&routeImpacts(plan.originalUsual||plan.usual,data,places).length;details.querySelector('summary').textContent=affected?(simulatedAlert?'Full simulated notice':'Full LTA notice'):simulatedAlert?'Simulated notice':'Details';};
 if(scenario){
  paint(scenarioStatus(demo?.key,plan,places));
  host.querySelector('#check-fixture').onclick=async event=>{const button=event.currentTarget;button.disabled=true;out.textContent='Replaying LTA’s sample alert…';try{const response=await fetch('/api/lta/train-alerts/sample',{cache:'no-store'}),raw=await response.json();await displaySample({source:'fixture',fetchedAt:raw.fetchedAt,...parseAlerts(raw)});}catch{out.textContent='The sample could not be loaded.';}finally{button.disabled=false;}};
  return;
 }
 let data=simulatedAlert?demo.data:null,shown=false;
 const showDetails=async()=>{if(details.open&&data&&!shown){shown=true;const html=await noticeDetails(data);if(version===generation)out.innerHTML=html;}};
 details.addEventListener('toggle',()=>{if(!simulatedAlert)detailsOpen=details.open;showDetails();});
 if(simulatedAlert){paint(alertStatus(data,plan,places,terms,true));if(data)setSummary(data);return;}
 // Live: while the main check is still running, the component waits rather than guessing whether the trip was rerouted.
 paint(alertStatus(null,plan,places,terms,false));
 host.querySelector('#check-official').onclick=async event=>{const button=event.currentTarget;button.disabled=true;out.textContent='Checking official alerts…';await fetchAlerts(true);onRefresh?.();};
 if(!ready)return;
 fetchAlerts().then(result=>{if(version!==generation)return;data=result;paint(alertStatus(result,plan,places,terms,false));setSummary(result);showDetails();});
}
