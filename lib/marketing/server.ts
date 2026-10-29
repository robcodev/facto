import { enrichWithWeb } from "./web-evidence";
import { ideaProof } from "./signing";
import "server-only";
import { randomUUID } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  contentSchema,
  formats,
  marketingPrompt,
  priority,
  warningsFor,
  RULE_VERSION,
  type Idea,
} from "./core";
import { readOpportunities } from "./reader";
export class MarketingError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function marketingContext() {
  const auth = await createClient();
  const {
    data: { user },
    error,
  } = await auth.auth.getUser();
  if (error || !user) throw new MarketingError("Debes iniciar sesión.", 401);
  const db = createAdminClient();
  const { data: org, error: orgError } = await db
    .from("organizations")
    .select("id")
    .eq("slug", "facto-compartido")
    .single();
  if (orgError || !org)
    throw new MarketingError("No encontramos la empresa de Facto.", 403);
  return { db, orgId: Number(org.id), userId: user.id };
}
type Context = Awaited<ReturnType<typeof marketingContext>>;
export const periodSchema = z
  .object({ from: z.iso.date(), to: z.iso.date() })
  .refine(
    (x) =>
      x.from <= x.to && Date.parse(x.to) - Date.parse(x.from) <= 90 * 86400000,
    "Selecciona entre 1 y 91 días cerrados.",
  );
function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function currentPeriod() {
  const to = new Date(Date.parse(today()) - 86400000)
    .toISOString()
    .slice(0, 10);
  return {
    from: new Date(Date.parse(to) - 13 * 86400000).toISOString().slice(0, 10),
    to,
  };
}
export async function opportunities(
  ctx: Context,
  period: { from: string; to: string },
) {
  const p = periodSchema.parse(period);
  if (p.to >= today())
    throw new MarketingError("Usa días cerrados, hasta ayer.");
  return enrichWithWeb(
    ctx.db,
    ctx.orgId,
    await readOpportunities(ctx.db, ctx.orgId, p.from, p.to),
  );
}
export const generateSchema = periodSchema.safeExtend({
  keys: z
    .array(z.string().regex(/^(receipt|sales):[0-9]+$/))
    .min(1)
    .max(5),
  format: z.enum(formats),
  analysisId:z.uuid().optional(),
});
// This trial has no database writes, server-side idea cache, persistent locks or marketing RPC.
export async function generateIdeas(
  ctx: Context,
  input: z.infer<typeof generateSchema>,
) {
  if (new Set(input.keys).size !== input.keys.length)
    throw new MarketingError("No repitas candidatos en la tanda.");
  const data = await opportunities(ctx, input);
  let analysisRecommendations: {productId:string;angle:string;hypothesis:string;mode?:string}[]=[];
  if(input.analysisId){const stored=await ctx.db.from("marketing_analyses").select("result,period_from,period_to,prompt_version").eq("organization_id",ctx.orgId).eq("id",input.analysisId).single();if(stored.error||stored.data.prompt_version!=="marketing-analysis-v4"||stored.data.period_from!==input.from||stored.data.period_to!==input.to)throw new MarketingError("El análisis no corresponde a este período.");analysisRecommendations=stored.data.result.recommendations;}
  const selected = input.keys.map((key) => {
    const c = data.candidates.find((x) => x.key === key);
    if (!c)
      throw new MarketingError(
        "La oportunidad cambió. Consulta Intel nuevamente.",
      );
    if(input.analysisId&&!analysisRecommendations.some(r=>r.productId===c.productId))throw new MarketingError("La selección no pertenece al análisis.");
    if(input.analysisId&&analysisRecommendations.find(r=>r.productId===c.productId)?.mode==="commercial"){const now=Date.parse(data.checkedAt);if(c.urlVerification?.status!=="verified"||!c.urlVerification.checkedAt||now-Date.parse(c.urlVerification.checkedAt)<0||now-Date.parse(c.urlVerification.checkedAt)>86400000||!c.available||c.available<=0||!c.stockObservedAt||now-Date.parse(c.stockObservedAt)<0||now-Date.parse(c.stockObservedAt)>86400000||now-Date.parse(input.to+"T23:59:59Z")>32*86400000)throw new MarketingError("La variante no conserva enlace verificado y stock reciente para un borrador comercial. Consulta nuevamente.");}
    return c;
  });
  if (!process.env.GEMINI_API_KEY)
    throw new MarketingError("Falta configurar el acceso a Gemini.", 503);
  const model = "gemini-3.8-flash",
    ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: { timeout: 35000 },
    });
  const results: { key: string; idea?: Idea; error?: string }[] = [];
  for (const c of selected) {
    try {
      const research = await ctx.db
        .from("product_research_drafts")
        .select("facts,sources")
        .eq("organization_id", ctx.orgId)
        .eq("bsale_product_id", c.productId)
        .eq("status", "approved")
        .maybeSingle();
      if (research.error) throw new Error("Technical research unavailable");
      const facts = (research.data?.facts ?? []) as {
        label: string;
        value: string;
        accepted: boolean;
      }[];
      const accepted = facts
        .filter((f) => f.accepted === true)
        .slice(0, 12)
        .map((f) => ({ label: f.label, value: f.value }));
      const warnings = warningsFor(c, input.to),
        evidence = {
          analysisId: input.analysisId ?? null,
          candidate: c,
          from: input.from,
          to: input.to,
          checkedAt: data.checkedAt,
          warnings,
          ...priority(c),
          ruleVersion: RULE_VERSION,
        };
      const response = await ai.models.generateContent({
        model,
        contents: marketingPrompt(
          c,
          input.format,
          input.from,
          input.to,
          warnings,
          accepted,
        ) + (input.analysisId ? "\nEnfoque elegido del análisis previo (interpretación e hipótesis, no hechos): "+JSON.stringify(analysisRecommendations.filter(r=>r.productId===c.productId).map(r=>({angle:r.angle,hypothesis:r.hypothesis}))) : ""),
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: z.toJSONSchema(contentSchema),
          maxOutputTokens: 3500,
          temperature: 0.3,
        },
      });
      if (!response.text) throw new Error("Empty response");
      const content = contentSchema.parse(JSON.parse(response.text)),
        now = new Date().toISOString();
      results.push({
        key: c.key,
        idea: {
          id: randomUUID(),
          title: content.title,
          format: input.format,
          status: "draft",
          content,
          evidence,
          created_at: now,
          updated_at: now,
        },
      });
    } catch {
      results.push({
        key: c.key,
        error:
          "No se pudo generar esta idea. Las otras respuestas de la sesión se conservan.",
      });
    }
  }
  for (const result of results)
    if (result.idea)
      result.idea.proof = ideaProof(result.idea, ctx.orgId, ctx.userId);
  return { results };
}
export function marketingError(error: unknown) {
  if (error instanceof Error && (/statement timeout/i.test(error.message) || /statement timeout/i.test(String((error.cause as { message?: string } | undefined)?.message ?? "")))) return Response.json({ error: "Intel no alcanzó a completar la lectura de ventas. No se llamó a la IA ni se generaron ideas. Vuelve a consultar o reduce el período." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  const status =
    error instanceof MarketingError
      ? error.status
      : error instanceof z.ZodError || error instanceof SyntaxError
        ? 422
        : 500;
  return Response.json(
    {
      error:
        error instanceof MarketingError
          ? error.message
          : status === 422
            ? "Revisa las fechas y campos enviados."
            : "No pudimos consultar Intel o generar las ideas. Intenta nuevamente.",
    },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}
