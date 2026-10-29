export type HistoryProduct={id:string;name:string;active:boolean};
export type HistoryBasket={day:string;products:string[]};
export type HistoryWindow={from:string;to:string;valid:boolean};
const date=(n:number)=>new Date(n).toISOString().slice(0,10);
const offset=(d:string,n:number)=>date(Date.parse(d)+n*86400000);
const ratio=(a:number,b:number)=>b>0?a/b:null;
export function historyCoverage(windows:HistoryWindow[],closedThrough:string){
 const valid=windows.filter(w=>w.valid&&/^\d{4}-\d{2}-\d{2}$/.test(w.from)&&/^\d{4}-\d{2}-\d{2}$/.test(w.to)&&w.from<=w.to&&w.from<=closedThrough);
 if(!valid.length)throw Error('No hay períodos de ventas con cobertura verificada.');
 const from=valid.map(w=>w.from).sort()[0],to=valid.map(w=>w.to>closedThrough?closedThrough:w.to).sort().at(-1)!;
 const days=new Set<string>(),gaps:{from:string;to:string}[]=[];let gap:string|null=null;
 for(let d=from;d<=to;d=offset(d,1)){if(valid.some(w=>w.from<=d&&w.to>=d)){days.add(d);if(gap){gaps.push({from:gap,to:offset(d,-1)});gap=null;}}else if(!gap)gap=d;}
 if(gap)gaps.push({from:gap,to});
 return {from,to,days,gaps,windowCount:valid.length};
}
export function analyzeHistory(baskets:HistoryBasket[],products:HistoryProduct[],windows:HistoryWindow[],closedThrough:string){
 const coverage=historyCoverage(windows,closedThrough),catalog=new Map(products.map(p=>[p.id,p]));
 const eligible=baskets.filter(b=>coverage.days.has(b.day));
 const months=new Map<string,{month:string;daysCovered:number;calendarDays:number;documents:number;multiProductDocuments:number;products:Set<string>}>();
 for(const day of coverage.days){const month=day.slice(0,7),row=months.get(month)??{month,daysCovered:0,calendarDays:new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).getUTCDate(),documents:0,multiProductDocuments:0,products:new Set<string>()};row.daysCovered++;months.set(month,row);}
 const recentFrom=offset(coverage.to,-89),previousTo=offset(recentFrom,-1),previousFrom=offset(recentFrom,-90);
 const fullyCovered=(from:string,to:string)=>{for(let d=from;d<=to;d=offset(d,1))if(!coverage.days.has(d))return false;return true;};
 const latestYear=Number(coverage.to.slice(0,4)),previousYear=latestYear-1;
 const matchedMonths=[...months.values()].filter(m=>{const old=months.get(String(previousYear)+m.month.slice(4));return m.month.startsWith(String(latestYear))&&m.daysCovered===m.calendarDays&&old&&old.daysCovered===old.calendarDays;}).map(m=>m.month.slice(5)).sort();
 type Counts={total:number;compact:number;recent:number;previous:number;y0:number;y1:number;monthly:Map<string,number>};
 const newCounts=():Counts=>({total:0,compact:0,recent:0,previous:0,y0:0,y1:0,monthly:new Map()});
 const productCounts=new Map<string,Counts>(),pairs=new Map<string,{a:string;b:string;counts:Counts;first:string;last:string;large:number;maxSize:number}>(),totals=newCounts();
 let empty=0,multi=0,totalProducts=0,largeBasketDocuments=0;const sizeDistribution:Record<string,number>={'0':0,'1':0,'2':0,'3':0,'4':0,'5+':0};
 const add=(c:Counts,b:HistoryBasket,compact:boolean)=>{c.total++;if(compact)c.compact++;const month=b.day.slice(0,7);c.monthly.set(month,(c.monthly.get(month)??0)+1);if(b.day>=recentFrom)c.recent++;else if(b.day>=previousFrom&&b.day<=previousTo)c.previous++;if(matchedMonths.includes(month.slice(5))){if(month.startsWith(String(latestYear)))c.y1++;else if(month.startsWith(String(previousYear)))c.y0++;}};
 for(const b of eligible){const ids=[...new Set(b.products)].sort();if(ids.length>200)throw Error('Un documento supera 200 productos. La lectura necesita revisión antes de calcular todas las combinaciones.');
  add(totals,b,ids.length<=10);const m=months.get(b.day.slice(0,7))!;m.documents++;if(ids.length>1){multi++;m.multiProductDocuments++;}if(ids.length>10)largeBasketDocuments++;if(!ids.length)empty++;sizeDistribution[ids.length>=5?'5+':String(ids.length)]++;totalProducts+=ids.length;
  for(const id of ids){m.products.add(id);const c=productCounts.get(id)??newCounts();add(c,b,ids.length<=10);productCounts.set(id,c);}
  for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){const key=ids[i]+':'+ids[j],p=pairs.get(key)??{a:ids[i],b:ids[j],counts:newCounts(),first:b.day,last:b.day,large:0,maxSize:0};add(p.counts,b,ids.length<=10);if(ids.length>10)p.large++;p.maxSize=Math.max(p.maxSize,ids.length);if(b.day<p.first)p.first=b.day;if(b.day>p.last)p.last=b.day;pairs.set(key,p);if(pairs.size>500000)throw Error('El historial supera 500.000 combinaciones. No se presenta una muestra como un análisis completo.');}
 }
 const measures=(pair:number,a:number,b:number,total:number)=>({documents:pair,documentsA:a,documentsB:b,support:ratio(pair,total),givenA:ratio(pair,a),givenB:ratio(pair,b),lift:a&&b?pair*total/(a*b):null});
 const rows=[...pairs.values()].map(p=>{const a=productCounts.get(p.a)!,b=productCounts.get(p.b)!,c=p.counts;const monthly=Object.fromEntries(c.monthly);const activeMonths=c.monthly.size,maxMonthShare=Math.max(...c.monthly.values())/c.total;const current=measures(c.recent,a.recent,b.recent,totals.recent),previous=measures(c.previous,a.previous,b.previous,totals.previous);
  return {a:p.a,b:p.b,nameA:catalog.get(p.a)?.name?.trim()||'Producto ID '+p.a,nameB:catalog.get(p.b)?.name?.trim()||'Producto ID '+p.b,activeA:catalog.get(p.a)?.active??false,activeB:catalog.get(p.b)?.active??false,...measures(c.total,a.total,b.total,totals.total),months:activeMonths,maxMonthShare,first:p.first,last:p.last,largeBasketDocuments:p.large,largeBasketShare:p.large/c.total,maxBasketSize:p.maxSize,compactCheck:measures(c.compact,a.compact,b.compact,totals.compact),repeated:c.total>=10&&activeMonths>=3&&maxMonthShare<=.6,current,previous,yearCurrent:measures(c.y1,a.y1,b.y1,totals.y1),yearPrevious:measures(c.y0,a.y0,b.y0,totals.y0),monthly};
 }).sort((a,b)=>b.documents-a.documents||a.a.localeCompare(b.a)||a.b.localeCompare(b.b));
 return {period:{from:coverage.from,to:coverage.to,daysCovered:coverage.days.size,gaps:coverage.gaps,verifiedWindows:coverage.windowCount},saleDocuments:eligible.length,emptyPaidBaskets:empty,multiProductDocuments:multi,multiProductShare:ratio(multi,eligible.length),averageDistinctPaidProducts:ratio(totalProducts,eligible.length),largeBasketDocuments,sizeDistribution,productCount:productCounts.size,pairCount:rows.length,activePairCount:rows.filter(p=>p.activeA&&p.activeB).length,recurringActivePairs:rows.filter(p=>p.activeA&&p.activeB&&p.repeated&&(p.lift??0)>1&&p.largeBasketShare<.5).length,recentPeriod:{from:recentFrom,to:coverage.to,documents:totals.recent,covered:fullyCovered(recentFrom,coverage.to)},previousPeriod:{from:previousFrom,to:previousTo,documents:totals.previous,covered:fullyCovered(previousFrom,previousTo)},yearComparison:{current:latestYear,previous:previousYear,matchedMonths,currentDocuments:totals.y1,previousDocuments:totals.y0},monthly:[...months.values()].sort((a,b)=>a.month.localeCompare(b.month)).map(m=>({...m,products:m.products.size,fullCalendarMonth:m.calendarDays===m.daysCovered})),productMonthly:Object.fromEntries([...productCounts].map(([id,c])=>[id,Object.fromEntries(c.monthly)])),pairs:rows};
}
export type HistoryAnalysis=ReturnType<typeof analyzeHistory>;
