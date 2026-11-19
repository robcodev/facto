import type { CalendarConfig, CalendarFormat } from './calendar-core';

export const MAX_CALENDAR_DAYS = 56;
export const MAX_SALES_AGE_DAYS = 21;
export const shiftDay = (day:string,n:number)=>new Date(Date.parse(day)+n*86400000).toISOString().slice(0,10);
export function calendarRange(config:Pick<CalendarConfig,'from'|'to'|'weeks'>){
 const valid=(day:string)=>/^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day))&&new Date(day).toISOString().slice(0,10)===day;
 if(!valid(config.from)||config.to!==undefined&&!valid(config.to))throw Error('Selecciona fechas válidas de inicio y término.');
 const to=config.to??shiftDay(config.from,config.weeks*7-1),days=Math.round((Date.parse(to)-Date.parse(config.from))/86400000)+1;
 if(!Number.isInteger(days)||days<1||days>MAX_CALENDAR_DAYS)throw Error('Elige un intervalo de 1 a 56 días; Hasta debe ser igual o posterior a Desde.');
 return {from:config.from,to,days,weeks:Math.ceil(days/7)};
}
export function calendarWeekSlots(config:CalendarConfig,days:number){
 const slots:{day:number;format:CalendarFormat;sequence:number}[]=[];
 for(let d=0;d<days;d++)for(let s=0;s<config.storiesPerDay;s++)slots.push({day:d,format:'historia',sequence:s});
 for(const [format,count,offset]of [['reel',config.reelsPerWeek,1],['email',config.emailsPerWeek,2],['banner',config.bannersPerWeek,0],['post',config.postsPerWeek,4],['blog',config.blogsPerWeek,5]] as [CalendarFormat,number,number][])
  for(let s=0;s<count;s++){const day=(offset+Math.floor(s*7/Math.max(1,count)))%7;if(day<days)slots.push({day,format,sequence:s});}
 return slots.sort((a,b)=>Number(a.format==='historia')-Number(b.format==='historia')||a.day-b.day||a.format.localeCompare(b.format));
}
export function calendarSlotCount(config:CalendarConfig){const range=calendarRange(config);let count=0;for(let n=0;n<range.weeks;n++)count+=calendarWeekSlots(config,Math.min(7,range.days-n*7)).length;return count;}
export function rangePreset(today:string,preset:'week'|'fortnight'|'fourWeeks'|'month'|'nextMonth'){
 if(preset==='month'){const d=new Date(today+'T12:00:00Z');return {from:today,to:new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).toISOString().slice(0,10)};}
 if(preset==='nextMonth'){const d=new Date(today+'T12:00:00Z');return {from:new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1)).toISOString().slice(0,10),to:new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+2,0)).toISOString().slice(0,10)};}
 return {from:today,to:shiftDay(today,preset==='week'?6:preset==='fortnight'?13:27)};
}
