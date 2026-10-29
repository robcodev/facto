// SELECT-only pilot. No snapshots or ideas are saved. No calls to Gemini.
import env from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import ts from "typescript";
env.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url || new URL(url).hostname.split(".")[0] !== "dkwnwasybqaohtwgaelq")
  throw Error("Unexpected project");
const js = ts.transpileModule(
  await readFile(new URL("./reader.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const { readOpportunities } = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);
const db = createClient(url, process.env.FACTO_BACKEND_SECRET, {
  auth: { persistSession: false },
});
const { data: org, error } = await db
  .from("organizations")
  .select("id")
  .eq("slug", "facto-compartido")
  .single();
if (error) throw Error(error.message);
const from = process.argv[2],
  to = process.argv[3];
if (
  !/^\d{4}-\d{2}-\d{2}$/.test(from ?? "") ||
  !/^\d{4}-\d{2}-\d{2}$/.test(to ?? "") ||
  from > to ||
  Date.parse(to) - Date.parse(from) > 90 * 86400000
)
  throw Error("Use FROM TO, up to 91 days");
const r = await readOpportunities(db, org.id, from, to);
console.log(
  JSON.stringify(
    {
      coverage: r.coverage,
      notices: r.notices,
      candidates: r.candidates.map((c) => ({
        key: c.key,
        name: c.productName,
        available: c.available,
        quantity: c.quantity,
      })),
    },
    null,
    2,
  ),
);
