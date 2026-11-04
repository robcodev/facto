import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function compile(file,overrides={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>n in overrides?overrides[n]:require(n),m,m.exports);return m.exports;}
const core=compile('lib/laboratory/product.ts');
const service=compile('lib/laboratory/shimano.ts',{'server-only':{},'./product':core});
const images=compile('lib/laboratory/image.ts',{'server-only':{},'./product':core});
const asset=n=>`https://dassets2.shimano.com/content/dam/test/color-${n}.jpeg`;
const headers=['品番','カラー番号','カラー','タイプ','全長(mm)','重量(g)','フック','本体価格(円)','商品コード','JANコード'];
const row=(no,name,sku,jan)=>`<tr>${['XG-212Z',no,name,'シンキング','120','24','#5 x 3','2,400円',sku,jan].map(c=>`<td>${c}</td>`).join('')}</tr>`;
const picture=(no,name,url=asset(no),model='XG-212Z')=>`<div class="thumbnail__item"><div class="thumbnail__title">${model} 120S ${no} ${name}</div><a class="thumbnail__zoom" href="${url}"><img src="${url}"></a></div>`;
function page(images){return `<h1>ニーナ 120S</h1><div class="skulisting">${images}</div><table><thead><tr>${headers.map(h=>`<th><p>${h}</p></th>`).join('')}</tr></thead><tbody>${row('001','Aゴールド','175717','4969363175717')}${row('002','S UVイワシ','175724','4969363175724')}</tbody></table>`;}
const html=page(picture('002','Ｓ ＵＶイワシ')+picture('001','Ａゴールド'));
let result=service.parseShimano(html,core.EXAMPLE_URL);
assert.equal(result.variants[0].image,asset('001'),'Image order must not determine associations');assert.equal(result.variants[1].image,asset('002'));assert.equal(result.notices.length,0);
assert.equal(result.variants[0].jan,'4969363175717');assert.equal(result.variants[0].specifications.find(s=>s.source==='重量(g)').value,'24');
assert.equal(result.variants[0].specifications.find(s=>s.source==='タイプ').value,'Hundimiento (sinking)');assert.equal(result.variants[0].specifications.find(s=>s.source==='本体価格(円)').original,'2,400円');
result=service.parseShimano(page(picture('001','Aゴールド',asset('001'),'WRONG-MODEL')+picture('002','S UVイワシ','javascript:alert(1)')),core.EXAMPLE_URL);assert.ok(result.variants.every(v=>v.image===null));assert.equal(result.notices.length,2);
result=service.parseShimano(page(picture('001','Aゴールド',asset('one'))+picture('001','Aゴールド',asset('two'))+picture('002','S UVイワシ')),core.EXAMPLE_URL);assert.equal(result.variants[0].image,null,'Ambiguous images must be flagged instead of guessed');
for(const url of ['http://fish.shimano.com/ja-JP/product/x.html','https://fish.shimano.com.evil.test/ja-JP/product/x.html','https://127.0.0.1/ja-JP/product/x.html','https://fish.shimano.com:444/ja-JP/product/x.html','https://user:password@fish.shimano.com/ja-JP/product/x.html','https://fish.shimano.com/ja-JP/product/../../private.html'])assert.throws(()=>core.sourceUrl(url));
assert.equal(core.imageUrl('data:image/svg+xml,x'),null);assert.equal(core.imageUrl('https://evil.test/content/dam/test.jpeg'),null);
assert.equal(core.sourceUrl(core.EXAMPLE_URL+'?tracking=x#spec'),core.EXAMPLE_URL);
const originalFetch=globalThis.fetch;let fetches=0;
try{
 globalThis.fetch=async()=>{fetches++;return new Response('',{status:302,headers:{location:'https://127.0.0.1/private'}});};await assert.rejects(service.fetchShimano(core.EXAMPLE_URL),/Shimano/);assert.equal(fetches,1,'Redirect to a private host is never fetched');
 globalThis.fetch=async()=>new Response('x'.repeat(3*1024*1024+1),{headers:{'Content-Type':'text/html'}});await assert.rejects(service.fetchShimano(core.EXAMPLE_URL),/tamaño/);
 globalThis.fetch=async()=>new Response(html,{headers:{'Content-Type':'text/html'}});assert.equal((await service.fetchShimano(core.EXAMPLE_URL)).variants.length,2);
}finally{globalThis.fetch=originalFetch;}
console.log('PASS: model/color/name association despite reordered images, full-width names, missing/ambiguous image detection, original JAN/price preserved, source and asset allowlists, redirects blocked and bounded response size.');
if(process.argv.includes('--live')){
 const view=await service.fetchShimano(core.EXAMPLE_URL);assert.equal(view.variants.length,10);assert.equal(view.variants.filter(v=>v.image).length,10);assert.equal(view.notices.length,0);assert.equal(new Set(view.variants.map(v=>v.image)).size,10);
 assert.equal(view.variants[0].productCode,'175717');assert.equal(view.variants[0].jan,'4969363175717');assert.equal(view.variants[9].jan,'4969363175809');
 const image=await images.fetchProductImage(view.variants[0].image);assert.ok(image.data.length>100);assert.ok(image.type.startsWith('image/'));
 console.log(JSON.stringify({source:view.source,variants:view.variants.length,verifiedImages:10,notices:0,firstImageBytes:image.data.length}));
}
