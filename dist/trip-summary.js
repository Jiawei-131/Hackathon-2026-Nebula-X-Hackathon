import {formatTime} from './engine.js';
import {nextDeparture} from './crowding.js';

const sgDate=ms=>new Date(ms+8*3600000).toISOString().slice(0,10);
// A departure already past today (e.g. 07:40 checked at noon) is tomorrow's trip.
export function tripDay(departure,now=Date.now()) {return sgDate(nextDeparture(departure,now))===sgDate(now)?'Today':'Tomorrow';}

// Everything the trip card shows, as a timeline: leave → travel → latest arrival → spare time → deadline.
// The buffer is measured from the latest likely arrival, so "spare" never flatters the estimate.
export function tripSummary(plan,route,{departure,deadline,threshold=10}) {
 const buffer=route.buffer,late=buffer<0,tight=!late&&buffer<threshold;
 return {
  leave:departure,duration:`${route.min}–${route.max} min`,latest:formatTime(route.arrival),earliest:formatTime(plan.start+route.min),deadline,
  spare:late?`${-buffer} min late`:buffer===0?'No spare time':`${buffer} min spare`,tone:late?'late':tight?'tight':'ok',
  verdict:late?`About ${-buffer} min late if you leave at ${departure}`:buffer===0?'Tight: no spare time':tight?`Tight: only ${buffer} min spare`:`On time, ${buffer} min spare`
 };
}

const plural=(n,word,words=`${word}s`)=>`${n} ${n===1?word:words}`;
export const changesText=n=>n?plural(n,'change'):'No changes';
// Names each route by what it is best at (not planner jargon) and says how it compares with the recommended one,
// so choosing is about a visible trade-off: "6 min later, but 1 fewer change".
export function describeRoutes(plan) {
 const routes=plan.routes,best=plan.best,others=r=>routes.filter(o=>o.id!==r.id);
 const fastest=[...routes].sort((a,b)=>a.arrival-b.arrival||a.transfers-b.transfers)[0];
 return Object.fromEntries(routes.map(r=>{
  const labels=[];
  if(r.id===fastest.id)labels.push('Fastest');
  if(others(r).length&&others(r).every(o=>r.transfers<o.transfers))labels.push('Fewest changes');
  if(!labels.length&&others(r).length&&others(r).every(o=>r.walk<=o.walk-2))labels.push('Least walking');
  let compare=null;
  if(r.id!==best.id){
   const late=r.arrival-best.arrival,changes=r.transfers-best.transfers,walk=r.walk-best.walk;
   const time=late>0?`${late} min later`:late<0?`${-late} min earlier`:'Same arrival';
   const gains=[changes<0&&plural(-changes,'fewer change','fewer changes'),walk<=-2&&`${-walk} min less walking`].filter(Boolean);
   const costs=[changes>0&&plural(changes,'more change','more changes'),walk>=2&&`${walk} min more walking`].filter(Boolean);
   compare=late>0&&gains.length?[`${time}, but ${gains.join(' and ')}`,...costs].join(' · '):[time,...gains,...costs].join(' · ');
  }
  return [r.id,{label:labels.join(' · ')||'Alternative',compare}];
 }));
}
