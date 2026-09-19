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
  spare:late?`${-buffer} min late`:`${buffer} min spare`,tone:late?'late':tight?'tight':'ok',
  verdict:late?`About ${-buffer} min late if you leave at ${departure}`:tight?`Tight: only ${buffer} min spare`:`On time, ${buffer} min spare`
 };
}
