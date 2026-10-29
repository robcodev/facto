export type SalesLineFact={variantId:string;productId:string|null;quantity:number|null;net:number|null;discounted:boolean;originalLinked:boolean;originalCancelled:boolean};
export type SalesDocumentFact={id:string;kind:'sale'|'credit'|'debit';currency:string|null;net:number|null;complete:boolean;lines:SalesLineFact[]};
export type CommercialFacts={covered:boolean;documents:SalesDocumentFact[];receiptCosts:{variantId:string;cost:number|null;quantity:number;day:string}[]};
export type Pair={a:string;b:string;documents:number;documentsA:number;documentsB:number;support:number;givenA:number;givenB:number;lift:number};
export function analyzeSales(facts:CommercialFacts){
 const sales=facts.documents.filter(d=>d.kind==='sale'),notes=facts.documents.filter(d=>d.kind!=='sale');
 const productDocs=new Map<string,number>(),pairs=new Map<string,{a:string;b:string;documents:number}>();
 let basketLimit=false;
 if(facts.covered)for(const doc of sales){
  const ids=[...new Set(doc.lines.map(l=>l.productId).filter((id):id is string=>!!id))].sort();
  if(ids.length>200){basketLimit=true;break;}
  for(const id of ids)productDocs.set(id,(productDocs.get(id)??0)+1);
  for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){const key=ids[i]+':'+ids[j];const p=pairs.get(key)??{a:ids[i],b:ids[j],documents:0};p.documents++;pairs.set(key,p);if(pairs.size>100000){basketLimit=true;break;}}
  if(basketLimit)break;
 }
 const pairRows:Pair[]=facts.covered&&!basketLimit?[...pairs.values()].map(p=>({...p,documentsA:productDocs.get(p.a)!,documentsB:productDocs.get(p.b)!,support:p.documents/sales.length,givenA:p.documents/productDocs.get(p.a)!,givenB:p.documents/productDocs.get(p.b)!,lift:p.documents*sales.length/(productDocs.get(p.a)!*productDocs.get(p.b)!)})).sort((a,b)=>b.documents-a.documents||b.lift-a.lift||a.a.localeCompare(b.a)||a.b.localeCompare(b.b)):[];
 const currencies=[...new Set(facts.documents.map(d=>d.currency??'unknown'))];
 const financial=currencies.map(currency=>{
  const docs=facts.documents.filter(d=>(d.currency??'unknown')===currency),sell=docs.filter(d=>d.kind==='sale'),credit=docs.filter(d=>d.kind==='credit'),debit=docs.filter(d=>d.kind==='debit');
  const sum=(items:SalesDocumentFact[])=>items.every(d=>d.net!==null&&d.net>=0)?items.reduce((n,d)=>n+d.net!,0):null;
  const saleNet=sum(sell),creditNet=sum(credit),debitNet=sum(debit);
  const unresolved=docs.filter(d=>d.kind!=='sale').flatMap(d=>d.lines).filter(l=>!l.originalLinked||l.originalCancelled||!l.productId||l.net===null).length;
  const complete=facts.covered&&currency!=='unknown'&&docs.every(d=>d.complete&&d.lines.length>0&&d.net!==null&&d.net>=0&&d.lines.every(l=>l.net!==null&&l.net>=0&&l.productId))&&unresolved===0;
  const productAmounts:Record<string,{sales:number;credits:number;debits:number;units:number;discountedLines:number;balance:number|null}>={};
  for(const d of docs)for(const l of d.lines){if(!l.productId||l.net===null)continue;const row=productAmounts[l.productId]??{sales:0,credits:0,debits:0,units:0,discountedLines:0,balance:null};if(d.kind==='sale'){row.sales+=l.net;row.units+=l.quantity??0;if(l.discounted)row.discountedLines++;}else if(d.kind==='credit')row.credits+=l.net;else row.debits+=l.net;productAmounts[l.productId]=row;}
  for(const row of Object.values(productAmounts))row.balance=complete?row.sales-row.credits+row.debits:null;
  const linesNet=sell.flatMap(d=>d.lines).every(l=>l.net!==null)?sell.flatMap(d=>d.lines).reduce((n,l)=>n+l.net!,0):null;
  const ranked=Object.entries(productAmounts).map(([id,v])=>({id,...v,share:linesNet&&linesNet>0?v.sales/linesNet:null})).sort((a,b)=>b.sales-a.sales||a.id.localeCompare(b.id));
  return {currency,saleDocuments:sell.length,creditDocuments:credit.length,debitDocuments:debit.length,salesExTax:saleNet,creditsExTax:creditNet,debitsExTax:debitNet,balanceExTax:complete&&saleNet!==null&&creditNet!==null&&debitNet!==null?saleNet-creditNet+debitNet:null,reconciled:complete,unresolvedNoteLines:unresolved,linesVsHeaders:linesNet!==null&&saleNet!==null?linesNet-saleNet:null,productAmounts,ranked,top5Share:linesNet&&linesNet>0?ranked.slice(0,5).reduce((n,p)=>n+p.sales,0)/linesNet:null,top10Share:linesNet&&linesNet>0?ranked.slice(0,10).reduce((n,p)=>n+p.sales,0)/linesNet:null};
 });
 return {covered:facts.covered,basketLimited:basketLimit,saleDocuments:sales.length,pairs:pairRows,financial,adjustmentDocuments:notes.length,receiptCostRows:facts.receiptCosts.length,receiptCostsWithValue:facts.receiptCosts.filter(r=>r.cost!==null).length,receiptCosts:facts.receiptCosts};
}
