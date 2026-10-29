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
const config = compile(
  await readFile(new URL("./google-config.ts", import.meta.url), "utf8"),
);
let source = await readFile(new URL("./google.ts", import.meta.url), "utf8");
source = source
  .replace(/import ["']server-only["'];?/, "")
  .replace(/(["'])\.\/google-config\1/g, JSON.stringify(config))
  .replace(/(["'])zod\1/g, JSON.stringify(import.meta.resolve("zod")));
const { parseGa4, parseSearch, summarizeWeb, googleStatus, matchCampaign } =
  await import(compile(source));
const r = parseGa4(
  {
    dimensionHeaders: [{ name: "landingPage" }],
    metricHeaders: [{ name: "sessions" }, { name: "purchaseRevenue" }],
    rows: [
      {
        dimensionValues: [{ value: "/p" }],
        metricValues: [{ value: "10" }, {}],
      },
    ],
    rowCount: 1001,
    metadata: {
      timeZone: "America/Santiago",
      currencyCode: "CLP",
      subjectToThresholding: true,
    },
  },
  "landing",
  "2026-10-01",
  "2026-10-25",
);
assert.equal(r.property_id, "489006527");
assert.equal(r.rows[0].metrics.sessions, 10);
assert.equal(r.rows[0].metrics.purchaseRevenue, null);
assert.equal(r.metadata.truncated, true);
assert.equal(r.metadata.subjectToThresholding, true);
assert.equal(summarizeWeb(r).revenue, null);
const attributionRow = {
  dimensions: {
    sessionManualSource: "meta",
    sessionManualMedium: "paid",
    sessionManualCampaignName: "camp",
    sessionManualAdContent: "piece",
  },
  metrics: { sessions: 10, ecommercePurchases: 1, purchaseRevenue: 5000 },
};
const pub = {
  utm_source: "meta",
  utm_medium: "paid",
  utm_campaign: "camp",
  utm_content: "piece",
};
assert.equal(matchCampaign([attributionRow], pub).purchases, 1);
assert.equal(
  matchCampaign([attributionRow], { ...pub, utm_content: "other" }),
  null,
);
const s = parseSearch(
  {
    rows: [
      {
        keys: ["2026-10-01", "https://dmultisport.cl/p"],
        clicks: 1,
        impressions: 10,
        ctr: 0.1,
        position: 2,
      },
      {
        keys: ["2026-10-02", "https://dmultisport.cl/p"],
        clicks: 9,
        impressions: 90,
        ctr: 0.1,
        position: 12,
      },
    ],
  },
  "2026-10-01",
  "2026-10-25",
);
const summary = summarizeWeb(s);
assert.equal(summary.position, 11);
assert.equal(summary.ctr, 0.1);
assert.equal(s.metadata.timeZone, "America/Los_Angeles");
assert.equal(summarizeWeb({ ...s, rows: [] }).clicks, null);
assert.equal(googleStatus().searchConsoleSite, "sc-domain:dmultisport.cl");
assert.equal(googleStatus().adsSpendConnected, false);
let signing = await readFile(new URL("./signing.ts", import.meta.url), "utf8");
const { ideaProof, validProof } = await import(compile(signing));
const old = process.env.FACTO_BACKEND_SECRET;
process.env.FACTO_BACKEND_SECRET = "isolated-signature-fixture";
const idea = {
  id: "id",
  format: "historias",
  evidence: { candidate: { quantity: 2 } },
  created_at: "2026-10-26",
};
idea.proof = ideaProof(idea, 1, "user");
assert.equal(validProof(idea, 1, "user"), true);
assert.equal(validProof(idea, 2, "user"), false);
assert.equal(
  validProof(
    { ...idea, evidence: { candidate: { quantity: 999 } } },
    1,
    "user",
  ),
  false,
);
if (old === undefined) delete process.env.FACTO_BACKEND_SECRET;
else process.env.FACTO_BACKEND_SECRET = old;
console.log(
  "PASS: Google parsing, unknown values, weighted position/CTR, truncation/thresholds, verified property IDs, no invented ad spend, signed evidence rejects tampering and other companies.",
);
