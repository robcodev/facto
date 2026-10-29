import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = (
  await readFile(new URL("./core.ts", import.meta.url), "utf8")
).replace(/(["'])zod\1/g, JSON.stringify(import.meta.resolve("zod")));
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { warningsFor, priority, marketingPrompt, contentSchema } = await import(
  "data:text/javascript;base64," + Buffer.from(compiled).toString("base64")
);
const c = {
  signal: "receipt",
  productId: "10",
  variantId: "20",
  productName: "Producto de prueba",
  variantName: "Variante",
  brand: null,
  available: null,
  stockObservedAt: null,
  documentCount: 1,
};
assert.ok(
  warningsFor(c, "2026-10-25", new Date("2026-10-26")).some((x) =>
    x.includes("desconocida"),
  ),
);
assert.ok(
  warningsFor(
    { ...c, available: 0 },
    "2026-10-25",
    new Date("2026-10-26"),
  ).some((x) => x.includes("educativo")),
);
assert.ok(
  warningsFor(
    { ...c, available: 5, stockObservedAt: "2026-10-20" },
    "2026-10-25",
    new Date("2026-10-26"),
  ).some((x) => x.includes("24 horas")),
);
assert.ok(
  warningsFor(c, "2025-05-31", new Date("2026-10-26")).some((x) =>
    x.includes("histórico"),
  ),
);
assert.equal(priority(c).score, 3);
assert.equal(
  priority({ ...c, available: 5000 }).score,
  4,
  "stock volume does not multiply priority",
);
const prompt = marketingPrompt(
  c,
  "email",
  "2026-10-01",
  "2026-10-25",
  ["No enviar correos"],
  [],
);
assert.ok(prompt.includes("hipótesis"));
assert.ok(prompt.includes("No enviar correos"));
assert.ok(!prompt.includes("service_role"));
assert.equal(contentSchema.safeParse({ title: "Idea" }).success, false);
console.log(
  "PASS: unknown/zero/stale stock, historical windows, fixed priority, prompt restrictions and structured result validation.",
);
