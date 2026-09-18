import {parseAlerts,assistanceDemos,availableAssistance,routeImpacts} from './service-alerts.js';
import {planJourney,formatTime} from './engine.js';
import {network} from './data/network.js';
import {annotateCrowding} from './journey-enrichment.js';
import {boardingCrowd,nextDeparture} from './crowding.js';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let generation=0;
export function mountServiceCheck({state,plan,places,onActivate}) {
 const host=document.querySelector('#service-check'),version=++generation;
 host.innerHTML=`<span class="source-label">BEFORE YOU LEAVE</span><h3>Check your usual route</h3><p>Official alerts are checked separately from the replay above. Route times remain estimates.</p><button class="outline-button" id="check-official">Check official service alerts ↗</button><details><summary>Test disruption handling</summary><p>The official LTA documentation sample checks message, direction, assistance flags, rerouting, buses and map without claiming a live event.</p><button class="outline-button" id="check-fixture">Run official-schema sample</button><button class="outline-button" data-assistance="publicBus">Free public-bus demo</button><button class="outline-button" data-assistance="shuttle">Free MRT shuttle demo</button></details><div id="service-result" role="status" aria-live="polite"></div>`;
 let requestVersion=0;
 const out=host.querySelector('#service-result');
 async function crowdFeedsFor(route) {
  const lines=[...new Set(route.edges.map(edge=>edge.line).flatMap(line=>line==='CCL'?['CCL','CEL']:[line]))];
  return Promise.all(lines.flatMap(line=>['crowding','crowding-forecast'].map(async endpoint=>{
   try {const response=await fetch(`/api/lta/${endpoint}?line=${encodeURIComponent(line)}`,{signal:AbortSignal.timeout(10000),cache:'no-store'});return response.ok?response.json():{source:'unavailable',line};}
   catch{return {source:'unavailable',line};}
  })));
 }
 async function busBridgeFor(route,data) {
  const ids=route.stationIds||[],affected=new Set(data.segments.flatMap(segment=>segment.stations));
  const indexes=ids.map((id,index)=>places[id]?.codes.some(code=>affected.has(code))?index:-1).filter(index=>index>=0);if(!indexes.length)return '';
  const first=Math.max(0,Math.min(...indexes)-1),last=Math.min(ids.length-1,Math.max(...indexes)+1),from=ids[first],to=ids[last];if(from===to)return '';
  try {
   const response=await fetch(`/api/lta/bus-bridge?from=${from}&to=${to}`,{signal:AbortSignal.timeout(12000),cache:'no-store'}),data=await response.json();
   if(!response.ok||data.source!=='lta'||!data.options?.length)return '';
   const eta=value=>{if(!value)return 'arrival unavailable';const minutes=Math.max(0,Math.ceil((Date.parse(value)-Date.now())/60000));return Number.isFinite(minutes)?`${minutes} min`:'arrival unavailable';};
   return `<div class="service-segment"><strong>Direct regular-bus alternatives · ${esc(places[from].name)} to ${esc(places[to].name)}</strong><p>Official LTA stops and routes, within 800 m of each rail station. These are ordinary paid services, separate from free boarding or MRT shuttles.</p>${data.options.slice(0,3).map(option=>`<p><strong>Bus ${esc(option.service)} · ${eta(option.arrival)}</strong><br>Walk ${option.walkFromMetres} m to ${esc(option.fromStop.name)} (${option.fromStop.code}), ride ${option.busStops} stops, then walk ${option.walkToMetres} m from ${esc(option.toStop.name)} (${option.toStop.code}). ${option.load?`Load: ${esc(option.load)}.`:''}</p>`).join('')}</div>`;
  } catch {return '';}
 }
 async function display(data) {
  if(version!==generation)return;
  if(data.source==='unavailable'){out.innerHTML=`<p>${esc(data.message)}</p><p>Your labelled replay is still available.</p>`;return;}
  const demo=data.source==='demo',impacts=routeImpacts(plan.usual,data,places);
  const names=codes=>codes.map(code=>{const station=Object.values(places).find(s=>s.codes.includes(code));return station?`${station.name} (${code})`:code;}).join(', ');
  let instruction=impacts.length?'Check station staff before boarding your usual line.':data.status==='normal'?'No major train disruption is currently reported.':'No listed segment matches your usual route. Check the advisories below.';
  let baseline=planJourney({...state,scenario:'normal'});
  const baselineFeeds=await crowdFeedsFor(baseline.best);
  baseline=annotateCrowding(baseline,baselineFeeds,places,nextDeparture(state.departure),boardingCrowd);
  let checkedPlan=baseline;
  const baselineCrowd=baseline.best.crowdObservations?.map(item=>`${item.stationName} ${item.line}: ${item.label}`).join('<br>')||'Crowd information unavailable.';
  let alternative=`<p><strong>Station crowding on your route</strong><br>${baselineCrowd}</p><button class="primary-button" id="use-checked-route">Use checked conditions on my map →</button>`;
  if(impacts.length){
   const blockedEdges=network.edges.filter(e=>routeImpacts({edges:[e]},data,places).length).map(e=>`${e.from}|${e.to}|${e.line}`);
   try {
    let next=planJourney({...state,scenario:'normal',blockedEdges});
    next={...next,originalUsual:plan.originalUsual||plan.usual,checkedAffectedEdges:network.edges.filter(e=>routeImpacts({edges:[e]},data,places).length)};
    const feeds=await crowdFeedsFor(next.best);
    next=annotateCrowding(next,feeds,places,nextDeparture(state.departure),boardingCrowd);
    const r=next.best;checkedPlan=next;
    const crowd=r.crowdObservations?.map(item=>`${item.stationName} ${item.line}: ${item.label}`).join('<br>')||'Crowd information unavailable.';
    instruction=r.buffer>=0?`Leave at ${state.departure}. Take ${r.lines.join(' → ')}; check platform signs.`:`Leave by ${formatTime(next.latestLeave)} if possible; the alternative misses your deadline at the saved departure time.`;
    const busBridge=await busBridgeFor(plan.usual,data);
    alternative=`<p><strong>Alternative avoiding listed affected stations</strong><br>Estimated arrival ${formatTime(next.start+r.min)}–${formatTime(r.arrival)} · ${r.transfers} transfers · ${r.buffer>=0?r.buffer+' min buffer':-r.buffer+' min late'}</p><p><strong>Station crowding</strong><br>${crowd}</p><button class="primary-button" id="use-checked-route">Use this route on my map →</button><details><summary>View alternative journey steps</summary><ol>${r.steps.map(s=>`<li><strong>${esc(s.title)}</strong><br>${esc(s.detail)} · ${s.minutes} min estimated</li>`).join('')}</ol></details>${busBridge}<p>Conservative: both directions and adjacent edges are excluded. Current observations are used only for an immediate boarding interval; otherwise Margin uses the applicable daily LTA forecast.</p>`;
   }catch {alternative='<p>No alternative rail route could be found. Check official assistance and station staff; no bus route or arrival time has been invented.</p>';}
  }
  const fixture=data.source==='fixture',validation=impacts.length?'message parsed · direction parsed · assistance flags separated · affected edges identified · reroute calculated · map action ready':'message parsed · direction parsed · assistance flags separated · selected route correctly marked unaffected';out.innerHTML=`<span class="source-label">${fixture?'OFFICIAL-SCHEMA FIXTURE · NOT LIVE':demo?'DEMO DATA · SYNTHETIC ASSISTANCE':'LTA SERVICE CHECK · '+esc(data.fetchedAt)}</span><h3>${esc(instruction)}</h3>${fixture?`<p><strong>Validation passed:</strong> ${validation}.</p>`:''}${alternative}${data.segments.map(s=>`<div class="service-segment"><strong>${esc(s.line)} · ${esc(s.direction)}</strong><p>Affected: ${esc(names(s.stations))}</p><p><strong>${availableAssistance(s.publicBus)?'Free public bus boarding available':'Free public-bus boarding: not listed'}</strong>${availableAssistance(s.publicBus)?'<br>'+esc(s.publicBus):''}</p><p><strong>${availableAssistance(s.shuttle)?'Free MRT shuttle available':'Free MRT shuttle: not listed'}</strong>${availableAssistance(s.shuttle)?'<br>'+esc(s.shuttle)+' · '+esc(s.shuttleDirection):''}</p></div>`).join('')}${data.messages.map(m=>`<p>${esc(m.content)}<br><small>${esc(m.createdAt)}</small></p>`).join('')}<p>Regular free bus boarding is not a dedicated shuttle. Follow official signs for boarding points and eligible services. Bus arrivals are not inferred for shuttle services.</p>`;
  if(checkedPlan)host.querySelector('#use-checked-route').onclick=()=>onActivate?.(checkedPlan,{source:demo||fixture?'demo':'live',headline:instruction});
 }
 host.querySelector('#check-official').onclick=async event=>{
  const request=++requestVersion,button=event.currentTarget;button.disabled=true;out.textContent='Checking official alerts…';out.setAttribute('aria-busy','true');
  try {const response=await fetch('/api/lta/train-alerts',{signal:AbortSignal.timeout(10000),cache:'no-store'});if(!response.ok)throw Error();const data=await response.json();if(request===requestVersion)await display(data);}
  catch {if(request===requestVersion)display({source:'unavailable',message:'Live service unavailable. Check your connection or station displays; no normal-service status is assumed.'});}
  finally {button.disabled=false;out.setAttribute('aria-busy','false');}
 };
 host.querySelector('#check-fixture').onclick=async event=>{const button=event.currentTarget;button.disabled=true;out.textContent='Replaying official-schema sample…';try{const response=await fetch('/api/lta/train-alerts/sample',{cache:'no-store'}),raw=await response.json();await display({source:'fixture',fetchedAt:raw.fetchedAt,...parseAlerts(raw)});}catch{out.textContent='The sample could not be loaded.';}finally{button.disabled=false;}};
 host.querySelectorAll('[data-assistance]').forEach(button=>button.onclick=async()=>{requestVersion++;await display({source:'demo',...parseAlerts(assistanceDemos[button.dataset.assistance])});});
}
