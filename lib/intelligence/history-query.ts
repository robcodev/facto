import type { readBasketHistory } from './history-server';
export type HistoryDataset=Awaited<ReturnType<typeof readBasketHistory>>;
export type HistoryFilters={q:string;min:number;lift:number;active:boolean;repeated:boolean;compact:boolean;sort:'frequency'|'association'|'recent';page:number};
export function historyView(data:HistoryDataset,input:HistoryFilters){
 const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),q=normalize(input.q);
 const filtered=data.pairs.filter(p=>(!input.active||p.activeA&&p.activeB)&&p.documents>=input.min&&(p.lift??0)>=input.lift&&(!input.repeated||p.repeated)&&(!input.compact||p.largeBasketShare<.5)&&normalize(p.nameA+' '+p.nameB+' '+p.a+' '+p.b).includes(q));
 if(input.sort==='association')filtered.sort((a,b)=>(b.lift??0)-(a.lift??0)||b.documents-a.documents);else if(input.sort==='recent')filtered.sort((a,b)=>b.current.documents-a.current.documents||b.documents-a.documents);
 const page=Math.min(input.page,Math.max(0,Math.ceil(filtered.length/20)-1)),{pairs,productMonthly,...summary}=data;void pairs;
 const rows=filtered.slice(page*20,page*20+20).map(p=>({...p,monthly:data.monthly.map(m=>{const count=p.monthly[m.month]??0,a=productMonthly[p.a]?.[m.month]??0,b=productMonthly[p.b]?.[m.month]??0;return {month:m.month,documents:count,documentsA:a,givenA:a?count/a:null,lift:a&&b?count*m.documents/(a*b):null};})}));
 return {...summary,filters:input,page,total:filtered.length,hasMore:(page+1)*20<filtered.length,rows};
}
export type HistoryResponse=ReturnType<typeof historyView>;
