export const LINK_METHOD='store_product_identity_v1';
export function productUrl(raw:string){const u=new URL(raw);if(u.protocol!=='https:'||!['dmultisport.cl','www.dmultisport.cl'].includes(u.hostname)||u.port||u.username||u.password||u.search||u.hash||!/^\/product\/[a-zA-Z0-9_%.-]+\/?$/.test(u.pathname))throw Error('Solo URL HTTPS de productos de dmultisport.cl, sin parámetros.');return u;}
function jsonObjectAt(text:string,start:number){let depth=0,quoted=false,escape=false;for(let i=start;i<text.length&&i<start+500000;i++){const c=text[i];if(quoted){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quoted=false;}else if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&!--depth)return JSON.parse(text.slice(start,i+1)) as Record<string,unknown>;}throw Error('Objeto incompleto');}
export function inspectProductIdentity(html:string,expectedProductId:string,url:string){
 const expected=productUrl(url);const links=html.match(/<link\b[^>]*>/gi)??[];
 const canonicalTag=links.find(tag=>/\brel\s*=\s*["']canonical["']/i.test(tag));
 const canonical=canonicalTag?.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
 if(!canonical)throw Error('La página no informa URL canónica.');
 const canonicalUrl=productUrl(new URL(canonical,expected).href);
 if(canonicalUrl.href!==expected.href)throw Error('La URL canónica apunta a otra página; requiere revisión.');
 const ids=new Set<string>();let storeId:string|null=null;
 for(const match of html.matchAll(/"product"\s*:\s*\{/g)){
  try{const p=jsonObjectAt(html,match.index!+match[0].lastIndexOf('{'));if(typeof p.link!=='string')continue;const link=productUrl(new URL(p.link,expected).href);if(link.href!==canonicalUrl.href)continue;const id=String(p.productId??'');if(/^\d+$/.test(id)){ids.add(id);if(String(p.id).match(/^\d+$/))storeId=String(p.id);}}catch{continue;}
 }
 if(ids.size!==1||!ids.has(expectedProductId))throw Error('El ID Bsale de la página no coincide inequívocamente con el catálogo.');
 return {method:LINK_METHOD,bsaleProductId:expectedProductId,storeProductId:storeId,canonicalUrl:canonicalUrl.href};
}
export async function readProductIdentity(url:string,productId:string,fetcher:typeof fetch=fetch){
 let current=productUrl(url);const aliases=[current.href];
 for(let redirect=0;redirect<4;redirect++){
  const r=await fetcher(current.href,{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{Accept:'text/html'}});
  if([301,302,303,307,308].includes(r.status)){const location=r.headers.get('location');if(!location)throw Error('Redirección sin destino.');const next=productUrl(new URL(location,current).href);if(next.pathname!==current.pathname)throw Error('La redirección cambia la ruta del producto: revisar manualmente.');current=next;aliases.push(current.href);continue;}
  if(r.status!==200||!r.headers.get('content-type')?.includes('text/html'))throw Error('No se pudo verificar una página de producto vigente.');
  const reader=r.body?.getReader();if(!reader)throw Error('Página vacía.');let bytes=0,html='';const decoder=new TextDecoder();
  try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>2000000)throw Error('Página demasiado grande para verificar.');html+=decoder.decode(part.value,{stream:true});}html+=decoder.decode();}finally{await reader.cancel().catch(()=>{});}
  return {...inspectProductIdentity(html,productId,current.href),aliases:[...new Set(aliases)],checkedAt:new Date().toISOString(),httpStatus:200};
 }
 throw Error('Demasiadas redirecciones.');
}
