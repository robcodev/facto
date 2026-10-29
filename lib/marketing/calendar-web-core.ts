export const CALENDAR_WEB_SCOPE='calendar-page-evidence-v1';
export type CalendarWebSource='ga4'|'search_console';
export type CalendarWebMetrics={views?:number|null;sessions?:number|null;engagedSessions?:number|null;clicks?:number|null;impressions?:number|null;ctr?:number|null;position?:number|null};
export type CalendarWebObservation={source:CalendarWebSource;propertyId:string;reportIds:string[];from:string;to:string;previousFrom:string;previousTo:string;observedAt:string;previousObservedAt:string;timeZone:string|null;previousTimeZone:string|null;partial:boolean;thresholded:boolean;current:CalendarWebMetrics|null;previous:CalendarWebMetrics|null};
export type CalendarProductWeb={verified:boolean;observations:CalendarWebObservation[];signals:string[];priorityBoost:number;salesCurrent?:{from:string;to:string;units:number|null;documents:number|null};salesPrevious?:{from:string;to:string;units:number|null;documents:number|null}};
export type CalendarWebPeriods={from:string;to:string;previousFrom:string;previousTo:string};
export type CalendarWebSourceStatus={source:CalendarWebSource;propertyId:string;ready:boolean;reason:string;observedAt:string|null;previousObservedAt:string|null;pagesRead:number;pagesRetained:number;timeZone:string|null;partial:boolean;thresholded:boolean};
export type InternalSearchSummary={status:'observed'|'no_rows'|'unavailable'|'limited';familyEvents:Record<string,number>;events:number;matchedEvents:number;reason:string;timeZone:string|null};
export type CalendarInternalSearch={ready:boolean;current:InternalSearchSummary;previous:InternalSearchSummary};
export type CalendarWebContext={internalSearch?:CalendarInternalSearch;periods:CalendarWebPeriods;sources:CalendarWebSourceStatus[];verifiedProducts:number;productsWithObservedMetrics:number;products:Record<string,CalendarProductWeb>;notices:string[]};
const day=(d:string,n:number)=>new Date(Date.parse(d)+n*86400000).toISOString().slice(0,10);
export function calendarWebPeriods(cutoff:string,today:string):CalendarWebPeriods{const settled=day(today,-3),to=cutoff<settled?cutoff:settled,from=day(to,-27),previousTo=day(from,-1);return {from,to,previousFrom:day(previousTo,-27),previousTo};}
export function aggregateCalendarWeb(source:CalendarWebSource,rows:{metrics:Record<string,number|null>}[]):CalendarWebMetrics|null{
 if(!rows.length)return null;
 const sum=(key:string)=>rows.every(r=>r.metrics[key]!==null&&r.metrics[key]!==undefined&&Number.isFinite(r.metrics[key]))?rows.reduce((n,r)=>n+r.metrics[key]!,0):null;
 if(source==='ga4')return {sessions:sum('sessions'),engagedSessions:sum('engagedSessions')};
 const clicks=sum('clicks'),impressions=sum('impressions');return {clicks,impressions,ctr:impressions&&clicks!==null?clicks/impressions:null,position:impressions&&rows.every(r=>r.metrics.position!==null&&r.metrics.position!==undefined)?rows.reduce((n,r)=>n+r.metrics.position!*r.metrics.impressions!,0)/impressions:null};
}
export function prioritizeCalendarWeb(products:Record<string,CalendarProductWeb>){
 const observations=Object.values(products).flatMap(p=>p.observations),maxViews=Math.max(1,...observations.filter(o=>o.source==='ga4'&&!o.thresholded).map(o=>o.current?.views??0)),maxClicks=Math.max(1,...observations.filter(o=>o.source==='search_console').map(o=>o.current?.clicks??0)),maxSessions=Math.max(1,...observations.filter(o=>o.source==='ga4'&&!o.thresholded).map(o=>o.current?.sessions??0));
 return Object.fromEntries(Object.entries(products).map(([id,p])=>{let boost=0;const signals:string[]=[];for(const o of p.observations){if(!o.current)continue;if(o.source==='search_console'){const c=o.current.clicks,i=o.current.impressions;if(c!=null&&i!=null&&c>=5&&i>=50){boost+=.15*Math.log1p(c)/Math.log1p(maxClicks);signals.push('Interés de búsqueda observado');}if(c!=null&&(o.previous?.clicks??0)>=5&&c>=5&&c>o.previous!.clicks!*1.2)signals.push('Más clics orgánicos que en los 28 días anteriores');if(i!=null&&i>=100&&o.current.ctr!=null&&o.current.ctr<=.02)signals.push('Revisar cómo se presenta la ficha en búsqueda');}else if(!o.thresholded&&((o.current.views??o.current.sessions)??0)>=10){const views=o.current.views;boost+=.1*Math.log1p(views??o.current.sessions!)/Math.log1p(views!=null?maxViews:maxSessions);signals.push(views!=null?'Vistas observadas en la ficha':'Sesiones de entrada observadas en la ficha');}}
  return [id,{...p,signals:[...new Set(signals)],priorityBoost:p.verified?Math.min(.25,boost):0}];}));
}
