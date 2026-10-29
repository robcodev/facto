import { GOOGLE_MARKETING } from "@/lib/marketing/google-config";
import {verifyProductLink} from "@/lib/marketing/product-links-server";
import {connectionStatus,oauthConfigured,userAccessToken} from "@/lib/marketing/oauth";
import { z } from "zod";
import {
  marketingContext,
  marketingError,
  MarketingError,
  periodSchema,
  currentPeriod,
} from "@/lib/marketing/server";
import {
  googleStatus,
  fetchWebReport,
  summarizeWeb,
  matchCampaign,
  type WebRow,
} from "@/lib/marketing/google";

import {
  addPublication,
  publicationSchema,
  addResult,
  resultSchema,
} from "@/lib/marketing/storage";
export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  try {
    const ctx = await marketingContext();
    const oauth = await connectionStatus(ctx);
    const params = new URL(request.url).searchParams,
      defaults = currentPeriod(),
      period = periodSchema.parse({
        from: params.get("from") ?? defaults.from,
        to: params.get("to") ?? defaults.to,
      });
    const [reports, pubs, results] = await Promise.all([
      ctx.db
        .from("intel_web_reports")
        .select(
          "id,source,property_id,report_kind,period_from,period_to,metadata,rows,observed_at",
        )
        .eq("organization_id", ctx.orgId)
        .eq("period_from", period.from)
        .eq("period_to", period.to)
        .order("observed_at", { ascending: false })
        .limit(20),
      ctx.db
        .from("marketing_publications")
        .select("*")
        .eq("organization_id", ctx.orgId)
        .order("published_at", { ascending: false })
        .limit(20),
      ctx.db
        .from("marketing_results")
        .select("*")
        .eq("organization_id", ctx.orgId)
        .eq("period_from", period.from)
        .eq("period_to", period.to)
        .order("observed_at", { ascending: false })
        .limit(20),
    ]);
    for (const result of [reports, pubs, results])
      if (
        result.error &&
        !["42P01", "PGRST205"].includes(result.error.code ?? "")
      )
        throw new MarketingError(
          "No pudimos consultar la medición. Revisa la conexión con Supabase.",
          503,
        );
    const campaign = reports.data?.find(
      (r) =>
        r.source === "ga4" &&
        r.property_id === GOOGLE_MARKETING.ga4PropertyId &&
        r.report_kind === "campaign",
    );
    const performance = (pubs.data ?? []).map((p) => ({
      publicationId: p.id,
      channel: p.channel,
      campaign: p.utm_campaign,
      ga4: campaign ? matchCampaign(campaign.rows as WebRow[], p) : null,
      reportId: campaign?.id ?? null,
      currency: campaign?.metadata?.currencyCode ?? null,
      limitations: campaign?.metadata ?? null,
      declaredResults: (results.data ?? []).filter(
        (r) => r.publication_id === p.id,
      ),
    }));
    return Response.json(
      {
        performance,
        google: {...googleStatus(),credentialsConfigured:googleStatus().credentialsConfigured||oauth.connected,oauthConfigured:oauthConfigured(),oauthConnected:oauth.connected,oauthStorageReady:oauth.storageReady,canManage:oauth.canManage},
        storageReady: !reports.error && !pubs.error && !results.error,
        reports: (reports.data ?? []).map(({ rows, ...r }) => ({
          ...r,
          summary: summarizeWeb({ source: r.source, rows: rows as WebRow[] }),
        })),
        publications: pubs.data ?? [],
        results: results.data ?? [],
        warning:
          "GA4, Bsale y Search Console no se suman como ventas adicionales. Gasto de Meta y Google Ads aún sin conexión.",
      },
      { headers },
    );
  } catch (e) {
    return marketingError(e);
  }
}
const inputSchema = periodSchema.safeExtend({
  kind: z.enum(["campaign", "landing", "search_page"]),
});
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      throw new MarketingError("Origen no permitido.", 403);
    const ctx = await marketingContext(),
      body = await request.text();
    if (body.length > 20000)
      throw new MarketingError("Solicitud demasiado grande.", 413);
    const input = JSON.parse(body);
    if (input.action === "publication")
      return Response.json(
        await addPublication(ctx, publicationSchema.parse(input)),
        { headers },
      );
    if (input.action === "result")
      return Response.json(await addResult(ctx, resultSchema.parse(input)), {
        headers,
      });
    if(input.action==='mapping'){
      const m=z.object({productId:z.string().regex(/^\d+$/),source:z.enum(['ga4','search_console']),externalKey:z.string().min(1).max(2000)}).parse(input);
      const url=m.source==='ga4'?'https://www.dmultisport.cl'+m.externalKey:m.externalKey;
      await verifyProductLink(ctx,{productId:m.productId,url});
      return Response.json({message:'Identidad de la página y correspondencia verificadas.'},{headers});
    }
    const p = inputSchema.parse(input);
    if (p.to > currentPeriod().to)
      throw new MarketingError("Selecciona días cerrados.");
    const oauth=await connectionStatus(ctx);
    if (!googleStatus().credentialsConfigured&&!oauth.connected)
      throw new MarketingError(
        "Falta acceso de solo lectura de Google. Las propiedades están identificadas, pero todavía no conectadas.",
        503,
      );
    const ready = await ctx.db
      .from("intel_web_reports")
      .select("id")
      .eq("organization_id", ctx.orgId)
      .limit(1);
    if (ready.error)
      throw new MarketingError(
        "Falta activar la base de ideas y medición antes de importar.",
        503,
      );
    const report = await fetchWebReport(p.kind, p.from, p.to,oauth.connected?await userAccessToken(ctx):undefined);
    const r = await ctx.db
      .from("intel_web_reports")
      .upsert(
        { organization_id: ctx.orgId, ...report },
        {
          onConflict:
            "organization_id,source,property_id,report_kind,period_from,period_to",
        },
      )
      .select("id")
      .single();
    if (r.error)
      throw new MarketingError(
        "Google respondió, pero no se pudo conservar el reporte. No se cambió el reporte anterior.",
        503,
      );
    return Response.json(
      { report: { id: r.data.id, ...report }, summary: summarizeWeb(report) },
      { headers },
    );
  } catch (e) {
    if (
      e instanceof Error &&
      !(e instanceof MarketingError) &&
      !(e instanceof z.ZodError)
    )
      return marketingError(
        new MarketingError(
          e.message.startsWith("Google") ||
            e.message.startsWith("Falta configurar")
            ? e.message
            : "No pudimos consultar Google.",
          503,
        ),
      );
    return marketingError(e);
  }
}
