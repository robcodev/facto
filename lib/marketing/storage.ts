import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { contentSchema, formats, PROMPT_VERSION, type Idea } from "./core";
import { marketingContext, MarketingError } from "./server";
import { validProof } from "./signing";
type Context = Awaited<ReturnType<typeof marketingContext>>;
function checked<T>(data: T, error: { code?: string } | null): T {
  if (error)
    throw new MarketingError(
      ["42P01", "PGRST205"].includes(error.code ?? "")
        ? "La base de Marketing aún no está activada. Puedes seguir explorando; falta aplicar la migración de ideas y medición."
        : "No pudimos guardar o consultar Marketing.",
      503,
    );
  return data;
}
const columns = "id,title,format,status,content,evidence,created_at,updated_at";
export const saveSchema = z.object({
  idea: z.object({
    id: z.uuid(),
    title: z.string().max(240),
    format: z.enum(formats),
    status: z.enum(["draft", "reviewed", "discarded"]),
    content: contentSchema,
    evidence: z.record(z.string(), z.unknown()),
    created_at: z.iso.datetime({ offset: true }),
    updated_at: z.iso.datetime({ offset: true }),
    proof: z.string().regex(/^[a-f0-9]{64}$/),
  }),
});
export async function saveIdea(ctx: Context, raw: z.infer<typeof saveSchema>) {
  const idea = raw.idea as unknown as Idea;
  if (!validProof(idea, ctx.orgId, ctx.userId))
    throw new MarketingError(
      "No se pudo verificar la evidencia original. Genera la propuesta nuevamente.",
      422,
    );
  const c = idea.evidence.candidate,
    fingerprint = createHash("sha256")
      .update(
        JSON.stringify([
          idea.format,
          c.key,
          idea.evidence.from,
          idea.evidence.to,
          idea.evidence.ruleVersion,
        ]),
      )
      .digest("hex");
  const r = await ctx.db
    .from("marketing_ideas")
    .insert({
      id: idea.id,
      organization_id: ctx.orgId,
      fingerprint,
      product_id: c.productId,
      variant_id: c.variantId,
      title: idea.content.title,
      format: idea.format,
      status: idea.status,
      content: idea.content,
      evidence: idea.evidence,
      model: "gemini-3.8-flash",
      prompt_version: PROMPT_VERSION,
      created_by: ctx.userId,
      created_at: idea.created_at,
    })
    .select(columns)
    .single();
  if (r.error?.code === "23505") {
    const existing = await ctx.db
      .from("marketing_ideas")
      .select(columns)
      .eq("organization_id", ctx.orgId)
      .eq("fingerprint", fingerprint)
      .single();
    return { idea: checked(existing.data, existing.error), existing: true };
  }
  return { idea: checked(r.data, r.error), existing: false };
}
export async function listIdeas(ctx: Context, page: number) {
  const r = await ctx.db
    .from("marketing_ideas")
    .select(columns)
    .eq("organization_id", ctx.orgId)
    .order("created_at", { ascending: false })
    .order("id")
    .range(page * 20, page * 20 + 20);
  const rows = checked(r.data, r.error) ?? [];
  return { ideas: rows.slice(0, 20), hasMore: rows.length > 20, page };
}
export const editSchema = z.object({
  id: z.uuid(),
  updatedAt: z.iso.datetime({ offset: true }),
  content: contentSchema,
  status: z.enum(["draft", "reviewed", "discarded"]),
});
export async function editSavedIdea(
  ctx: Context,
  input: z.infer<typeof editSchema>,
) {
  const r = await ctx.db
    .from("marketing_ideas")
    .update({
      title: input.content.title,
      content: input.content,
      status: input.status,
    })
    .eq("organization_id", ctx.orgId)
    .eq("id", input.id)
    .eq("updated_at", input.updatedAt)
    .select(columns)
    .maybeSingle();
  const idea = checked(r.data, r.error);
  if (!idea)
    throw new MarketingError(
      "La idea cambió en otra sesión. Recarga antes de guardar.",
      409,
    );
  return { idea };
}
export const publicationSchema = z.object({
  ideaId: z.uuid(),
  channel: z.string().trim().min(1).max(100),
  destinationUrl: z.url().refine((x) => x.startsWith("https://")),
  publicationUrl: z
    .url()
    .refine((x) => x.startsWith("https://"))
    .optional(),
  publishedAt: z.iso.datetime({ offset: true }),
  source: z.string().trim().min(1).max(200),
  medium: z.string().trim().min(1).max(200),
  campaign: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(200),
});
export async function addPublication(
  ctx: Context,
  p: z.infer<typeof publicationSchema>,
) {
  const r = await ctx.db
    .from("marketing_publications")
    .insert({
      organization_id: ctx.orgId,
      idea_id: p.ideaId,
      channel: p.channel,
      destination_url: p.destinationUrl,
      publication_url: p.publicationUrl ?? null,
      published_at: p.publishedAt,
      utm_source: p.source,
      utm_medium: p.medium,
      utm_campaign: p.campaign,
      utm_content: p.content,
      created_by: ctx.userId,
    })
    .select("*")
    .single();
  const row = checked(r.data, r.error);
  const url = new URL(p.destinationUrl);
  for (const [k, v] of Object.entries({
    utm_source: p.source,
    utm_medium: p.medium,
    utm_campaign: p.campaign,
    utm_content: p.content,
  }))
    url.searchParams.set(k, v);
  return { publication: row, trackingUrl: url.href };
}
export const resultSchema = z
  .object({
    publicationId: z.uuid(),
    from: z.iso.date(),
    to: z.iso.date(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    spend: z.number().nonnegative().nullable(),
    impressions: z.number().int().nonnegative().nullable(),
    reach: z.number().int().nonnegative().nullable(),
    clicks: z.number().int().nonnegative().nullable(),
    purchases: z.number().nonnegative().nullable(),
    revenue: z.number().nonnegative().nullable(),
    attributionBasis: z.string().trim().min(1).max(1000),
    notes: z.string().max(2000),
  })
  .refine(
    (p) =>
      p.from <= p.to &&
      ((p.spend === null && p.revenue === null) || p.currency !== null),
  );
export async function addResult(ctx: Context, p: z.infer<typeof resultSchema>) {
  const r = await ctx.db
    .from("marketing_results")
    .upsert(
      {
        organization_id: ctx.orgId,
        publication_id: p.publicationId,
        period_from: p.from,
        period_to: p.to,
        source: "manual",
        currency: p.currency,
        spend: p.spend,
        impressions: p.impressions,
        reach: p.reach,
        clicks: p.clicks,
        purchases: p.purchases,
        revenue: p.revenue,
        attribution_basis: p.attributionBasis,
        notes: p.notes,
        created_by: ctx.userId,
        observed_at: new Date().toISOString(),
      },
      {
        onConflict:
          "organization_id,publication_id,source,period_from,period_to",
      },
    )
    .select("*")
    .single();
  return {
    result: checked(r.data, r.error),
    roas:
      p.spend !== null && p.spend > 0 && p.revenue !== null
        ? p.revenue / p.spend
        : null,
    warning:
      "Retorno según importes y atribución declarados. No demuestra ventas incrementales ni concilia Bsale.",
  };
}
