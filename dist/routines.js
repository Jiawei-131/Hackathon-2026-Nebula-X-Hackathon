export function validWeekdays(days){return Array.isArray(days)&&days.length>0&&days.every(day=>Number.isInteger(day)&&day>=1&&day<=7)&&new Set(days).size===days.length;}
export function scheduledRoutines(routines,weekday){return routines.filter(item=>item?.enabled===true&&validWeekdays(item.weekdays)&&item.weekdays.includes(weekday));}
