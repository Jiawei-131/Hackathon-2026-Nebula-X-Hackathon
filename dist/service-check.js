import {parseAlerts,availableAssistance,routeImpacts} from './service-alerts.js';
import {formatTime,lines as lineNames} from './engine.js';
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
let generation=0;
// Live mode shows the official LTA status here; Demo mode shows the simulated condition instead, never both.
export function mountServiceCheck({state,plan,places,onActivate,originLocation=null,mode='live',demo=null}) {
 const host=document.querySelector('#service-check'),version=++generation,terms=routeTerms(plan,places),simulatedAlert=mode==='demo'&&demo?.kind==='alert';
 if(mode==='demo'){
  const headline=simulatedAlert?(demo.data?(demo.impacted?'Simulated LTA alert on your usual route':'Simulated LTA alert, not on your route'):'Loading the simulated alert…'):demo?.key==='normal'?'Simulated: no disruption':`Simulated: ${demo?.name||'scenario'}`;
  const sub=simulatedAlert?demo.caption:demo?.key==='normal'?'Tap ● Live now for real LTA alerts.':demo?.description||'';
  host.innerHTML=`<div class="service-status" data-tone="sim" role="status" aria-live="polite"><span class="service-icon" aria-hidden="true">~</span><span><span class="service-headline">${esc(headline)}</span><small class="service-sub">${badge('sim','Simulated')}${esc(sub)}</small></span></div><details id="service-details"><summary>${simulatedAlert?'Simulated alert details':'Test with LTA’s official sample alert'}</summary>${simulatedAlert?'':'<p>Replays the sample alert from LTA’s DataMall documentation to show how Margin reads a real alert, without claiming a live event.</p><button class="outline-button" id="check-fixture">Run the LTA sample alert</button>'}<div id="service-result" role="status" aria-live="polite"></div></details>`;
 } else host.innerHTML=`<div class="service-status" data-tone="muted" role="status" aria-live="polite"><span class="service-icon" aria-hidden="true">…</span><span><span class="service-headline">Checking official LTA train alerts…</span><small class="service-sub"></small></span></div><details id="service-details"${detailsOpen?' open':''}><summary>Official LTA check details</summary><div id="service-result" role="status" aria-live="polite"></div><button class="outline-button" id="check-official">Check again</button></details>`;
 let requestVersion=0,live=null,shown=false;
 const out=host.querySelector('#service-result'),details=host.querySelector('#service-details'),status=host.querySelector('.service-status');
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
 function showStatus(data) {
  if(version!==generation)return;
  live=data;
  const icon=status.querySelector('.service-icon'),headline=status.querySelector('.service-headline'),sub=status.querySelector('.service-sub');
  if(data.source!=='live'){status.dataset.tone='muted';icon.textContent='!';headline.textContent='Live LTA alerts are unavailable right now.';sub.textContent='Check station displays before you leave.';return;}
  const impacts=routeImpacts(plan.originalUsual||plan.usual,data,places),notices=splitNotices(data,terms),others=notices.otherSegments.length+notices.otherMessages.length,time=checkedTime(data.fetchedAt);
  status.dataset.tone=impacts.length?'warn':'ok';icon.textContent=impacts.length?'!':'✓';
  headline.textContent=impacts.length?'LTA reports a disruption on your usual route.':data.status==='disrupted'?'Your route is clear. LTA reports disruptions elsewhere.':'No LTA train disruptions reported.';
  sub.innerHTML=`${time?badge('live',`Live · ${time} SGT`):''}${others?esc(`${others} other network notice${others===1?'':'s'}`):''}`;
  if(impacts.length)details.open=true;
 }
 async function display(data) {
  if(version!==generation)return;
  if(data.source==='unavailable'){out.innerHTML=`<p>${esc(data.message)}</p><p>Try a demo scenario to see how Margin reacts.</p>`;return;}
  const demo=data.source==='demo';
  const names=codes=>codes.map(code=>{const station=Object.values(places).find(s=>s.codes.includes(code));return station?`${station.name} (${code})`:code;}).join(', ');
  const crowdFor=route=>route.crowdObservations?.map(item=>`${item.stationName} ${item.line}: ${item.label}`).join('<br>')||'Crowd information unavailable.';
  // Simulated and sample alerts never borrow live crowd readings.
  const result=await buildCheckedPlan({state,places,alerts:data,crowdFeedsFor:data.source==='live'?fetchCrowdFeeds:async()=>[],originLocation});
  const {impacts,instruction,baseline}=result,checkedPlan=result.status==='no-alternative'?null:result.plan;
  let alternative=`<p><strong>Station crowding on your route</strong><br>${crowdFor(baseline.best)}</p><button class="primary-button" id="use-checked-route">Use checked conditions on my map →</button>`;
  if(result.status==='rerouted'){
   const next=result.plan,r=next.best,busBridge=await busBridgeFor(baseline.usual,data);
   alternative=`<p><strong>Alternative avoiding listed affected stations</strong><br>Estimated arrival ${formatTime(next.start+r.min)}–${formatTime(r.arrival)} · ${r.transfers} transfers · ${r.buffer>=0?r.buffer+' min buffer':-r.buffer+' min late'}</p><p><strong>Station crowding</strong><br>${crowdFor(r)}</p><button class="primary-button" id="use-checked-route">Use this route on my map →</button><details><summary>View alternative journey steps</summary><ol>${r.steps.map(s=>`<li><strong>${esc(s.title)}</strong><br>${esc(s.detail)} · ${s.minutes} min estimated</li>`).join('')}</ol></details>${busBridge}<p>Conservative: both directions and adjacent edges are excluded. Current observations are used only for an immediate boarding interval; otherwise Margin uses the applicable daily LTA forecast.</p>`;
  }
  if(result.status==='no-alternative')alternative='<p>No alternative rail route could be found. Check official assistance and station staff; no bus route or arrival time has been invented.</p>';
  if(version!==generation)return;
  const fixture=data.source==='fixture',validation=impacts.length?'message parsed · direction parsed · assistance flags separated · affected edges identified · reroute calculated · map action ready':'message parsed · direction parsed · assistance flags separated · selected route correctly marked unaffected';
  const notices=splitNotices(data,terms),others=notices.otherSegments.length+notices.otherMessages.length,time=checkedTime(data.fetchedAt);
  const segmentHtml=s=>`<div class="service-segment"><strong>${esc(s.line)} · ${esc(s.direction)}</strong><p>Affected: ${esc(names(s.stations))}</p><p><strong>${availableAssistance(s.publicBus)?'Free public bus boarding available':'Free public-bus boarding: not listed'}</strong>${availableAssistance(s.publicBus)?'<br>'+esc(s.publicBus):''}</p><p><strong>${availableAssistance(s.shuttle)?'Free MRT shuttle available':'Free MRT shuttle: not listed'}</strong>${availableAssistance(s.shuttle)?'<br>'+esc(s.shuttle)+' · '+esc(s.shuttleDirection):''}</p></div>`;
  const messageHtml=m=>`<p>${esc(m.content)}<br><small>${esc(noticeTime(m.createdAt))}</small></p>`;
  out.innerHTML=`${fixture?badge('sim','LTA sample data · not live'):demo?badge('sim','Simulated alert'):badge('live','Live LTA check'+(time?` · ${time} SGT`:''))}<h3>${esc(instruction)}</h3>${fixture?`<p><strong>Validation passed:</strong> ${validation}.</p>`:''}${alternative}${notices.segments.map(segmentHtml).join('')}${notices.messages.map(messageHtml).join('')}${others?`<details class="other-notices"><summary>Other network notices (${others})</summary>${notices.otherSegments.map(segmentHtml).join('')}${notices.otherMessages.map(messageHtml).join('')}</details>`:''}${data.segments.length?'<p>Regular free bus boarding is not a dedicated shuttle. Follow official signs for boarding points and eligible services. Bus arrivals are not inferred for shuttle services.</p>':''}`;
  const useRoute=host.querySelector('#use-checked-route');if(checkedPlan&&useRoute)useRoute.onclick=()=>onActivate?.(checkedPlan,{source:demo||fixture?'demo':'live',headline:instruction,impacted:impacts.length>0,fetchedAt:data.fetchedAt,alerts:data});
 }
 if(mode==='demo'){
  if(simulatedAlert)details.addEventListener('toggle',()=>{if(details.open&&demo.data&&!shown){shown=true;display(demo.data);}});
  else host.querySelector('#check-fixture').onclick=async event=>{const button=event.currentTarget;button.disabled=true;out.textContent='Replaying LTA’s sample alert…';try{const response=await fetch('/api/lta/train-alerts/sample',{cache:'no-store'}),raw=await response.json();await display({source:'fixture',fetchedAt:raw.fetchedAt,...parseAlerts(raw)});}catch{out.textContent='The sample could not be loaded.';}finally{button.disabled=false;}};
  return;
 }
 // The live status loads automatically; the heavier route check runs only once the details are open.
 function showDetails(){if(details.open&&live&&!shown){shown=true;display(live);}}
 details.addEventListener('toggle',()=>{detailsOpen=details.open;showDetails();});
 fetchAlerts().then(data=>{showStatus(data);showDetails();});
 host.querySelector('#check-official').onclick=async event=>{
  const request=++requestVersion,button=event.currentTarget;button.disabled=true;out.textContent='Checking official alerts…';out.setAttribute('aria-busy','true');
  try {const data=await fetchAlerts(true);if(request===requestVersion){showStatus(data);shown=true;await display(data);}}
  finally {button.disabled=false;out.setAttribute('aria-busy','false');}
 };
}
