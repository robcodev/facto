import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const compile = (s) =>
  "data:text/javascript;base64," +
  Buffer.from(
    ts.transpileModule(s, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
  ).toString("base64");
const core = compile(
  (await readFile(new URL("./core.ts", import.meta.url), "utf8")).replace(
    /(["'])zod\1/g,
    JSON.stringify(import.meta.resolve("zod")),
  ),
);
const candidate = {
  key: "receipt:20",
  signal: "receipt",
  productId: "10",
  variantId: "20",
  productName: "Fixture",
  variantName: "Fixture",
  brand: null,
  quantity: 2,
  documentCount: 1,
  eventDate: "2026-10-24",
  observedAt: "2026-10-26",
  catalogObservedAt: "2026-10-20",
  recordIds: [1],
  available: 0,
  stockObservedAt: "2026-10-26",
  offices: [],
  url: null,
};
const content = {
  title: "Prueba educativa",
  objective: "Informar",
  audience: "Hipótesis",
  hook: "Pregunta",
  message: "Mensaje",
  copy: "Texto",
  action: "Consultar",
  outline: ["Pantalla"],
  materials: [],
  warnings: [],
};
let calls = 0;
let capturedPrompt="";const capturedPrompts=[];
globalThis.marketingTestData = {
  checkedAt: "2026-10-26",
  from: "2026-10-01",
  to: "2026-10-25",
  coverage: {},
  candidates: [candidate],
};
globalThis.marketingTestModel = {
  models: {
    async generateContent(input) {
      capturedPrompt=input.contents;capturedPrompts.push(input.contents);
      calls++;
      return { text: JSON.stringify(content) };
    },
  },
};
const signing = compile(
  await readFile(new URL("./signing.ts", import.meta.url), "utf8"),
);
let source = await readFile(new URL("./server.ts", import.meta.url), "utf8");
source = source
  .replace(/import \{ideaProof\} from ["']\.\/signing["'];?/, "")
  .replace(/(["'])\.\/signing\1/g, JSON.stringify(signing))
  .replace(
    /import \{enrichWithWeb\} from ["']\.\/web-evidence["'];?/,
    "const enrichWithWeb=async(_db,_org,data)=>data;",
  )
  .replace(/import ["']server-only["'];?/, "")
  .replace(
    /import \{ GoogleGenAI \} from ["']@google\/genai["'];?/,
    "const GoogleGenAI=class{constructor(){return globalThis.marketingTestModel;}};",
  )
  .replace(
    /import \{ createClient \} from ["']@\/lib\/supabase\/server["'];?/,
    'const createClient=()=>{throw Error("Auth not used in this isolated test");};',
  )
  .replace(
    /import \{ createAdminClient \} from ["']@\/lib\/supabase\/admin["'];?/,
    'const createAdminClient=()=>{throw Error("Admin context supplied explicitly");};',
  )
  .replace(
    /import \{ readOpportunities \} from ["']\.\/reader["'];?/,
    "const readOpportunities=async()=>globalThis.marketingTestData;",
  )
  .replace(/(["'])\.\/core\1/g, JSON.stringify(core))
  .replace(/(["'])zod\1/g, JSON.stringify(import.meta.resolve("zod")));
source = source.replace(
  /import\s*\{\s*enrichWithWeb\s*\}\s*from\s*["']\.\/web-evidence["'];?/,
  "const enrichWithWeb=async(_db,_org,data)=>data;",
);
const { generateIdeas } = await import(compile(source));
const ctx = {
  orgId: 1,
  db: {
    from(table) {
      assert.equal(
        table,
        "product_research_drafts",
        "only technical facts can be read during generation",
      );
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        async maybeSingle() {
          return { data: null, error: null };
        },
      };
    },
  },
};
const oldSecret = process.env.FACTO_BACKEND_SECRET;
process.env.FACTO_BACKEND_SECRET = "isolated-generation-fixture";
const before = process.env.GEMINI_API_KEY;
process.env.GEMINI_API_KEY = "isolated-test-key";
try {
  const r = await generateIdeas(ctx, {
    from: "2026-10-01",
    to: "2026-10-25",
    keys: ["receipt:20"],
    format: "historias",
  });
  assert.equal(calls, 1);
  assert.equal(r.results[0].idea.content.title, content.title);
  assert.equal(r.results[0].idea.evidence.candidate.available, 0);
  assert.equal(r.results[0].idea.status, "draft");
  assert.ok(r.results[0].idea.id);
  assert.ok(
    r.results[0].idea.evidence.warnings.some((w) => w.includes("educativo")),
  );
  await assert.rejects(() =>
    generateIdeas(ctx, {
      from: "2026-10-01",
      to: "2026-10-25",
      keys: ["receipt:999"],
      format: "historias",
    }),
  );
  assert.equal(calls, 1);
  let storedPeriod="2026-10-01",storedProduct="10";let extraRecommendations=[];
  const linkedCtx={...ctx,db:{from(table){assert.ok(["marketing_analyses","product_research_drafts"].includes(table));return {select(){return this},eq(key,value){if(key==="organization_id")assert.equal(value,1);return this},async single(){return {data:{prompt_version:"marketing-analysis-v4",period_from:storedPeriod,period_to:"2026-10-25",result:{recommendations:[{productId:storedProduct,angle:"Pregunta elegida",hypothesis:"Podría ayudar"},...extraRecommendations]}},error:null}},async maybeSingle(){return {data:null,error:null}}}}}};
  const linkedInput={from:"2026-10-01",to:"2026-10-25",keys:["receipt:20"],format:"historias",analysisId:"12345678-1234-4234-9234-123456789012"};
  await generateIdeas(linkedCtx,linkedInput);assert.equal(calls,2);assert.ok(capturedPrompt.includes("Pregunta elegida"));storedPeriod="2026-09-01";await assert.rejects(()=>generateIdeas(linkedCtx,linkedInput),/período/);storedPeriod="2026-10-01";storedProduct="999";await assert.rejects(()=>generateIdeas(linkedCtx,linkedInput),/selección/);assert.equal(calls,2);
  storedProduct="10";extraRecommendations=[{productId:"11",angle:"Otra pregunta elegida",hypothesis:"Otra hipótesis"}];
  globalThis.marketingTestData.candidates.push({...candidate,key:"receipt:21",variantId:"21",productId:"11",productName:"Segundo producto"});
  const batch=await generateIdeas(linkedCtx,{...linkedInput,keys:["receipt:20","receipt:21"]});
  assert.equal(batch.results.length,2);assert.ok(batch.results.every(r=>r.idea?.evidence.analysisId===linkedInput.analysisId));assert.equal(calls,4);
  assert.ok(capturedPrompts.at(-2).includes("Pregunta elegida"));assert.ok(!capturedPrompts.at(-2).includes("Otra pregunta elegida"));assert.ok(capturedPrompts.at(-1).includes("Otra pregunta elegida"));
  await assert.rejects(()=>generateIdeas(linkedCtx,{...linkedInput,keys:["receipt:20","receipt:20"]}),/No repitas/);assert.equal(calls,4);
  console.log(
    "PASS: generated idea returned in response, zero stock warnings, no database writes or Marketing tables, invalid candidate rejected before AI.",
  );
} finally {
  if (oldSecret === undefined) delete process.env.FACTO_BACKEND_SECRET;
  else process.env.FACTO_BACKEND_SECRET = oldSecret;
  if (before === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = before;
}
