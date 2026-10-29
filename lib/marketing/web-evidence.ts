import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Opportunities } from "./core";
import { GOOGLE_MARKETING } from "./google-config";
import { summarizeWeb, type WebRow } from "./google";
export async function enrichWithWeb(
  db: SupabaseClient,
  org: number,
  data: Opportunities,
) {
  if (!data.candidates.length) return data;
  const r = await db
    .from("intel_web_reports")
    .select(
      "id,source,property_id,report_kind,period_from,period_to,metadata,rows,observed_at",
    )
    .eq("organization_id", org)
    .eq("period_from", data.from)
    .eq("period_to", data.to)
    .order("observed_at", { ascending: false })
    .limit(6);
  if (r.error) {
    if (["42P01", "PGRST205"].includes(r.error.code)) return data;
    throw Error("No pudimos consultar la evidencia web.");
  }
  const reports = (r.data ?? []).filter(
    (r) =>
      (r.source === "ga4" &&
        r.property_id === GOOGLE_MARKETING.ga4PropertyId &&
        r.report_kind === "landing") ||
      (r.source === "search_console" &&
        r.property_id === GOOGLE_MARKETING.searchConsoleSite &&
        r.report_kind === "search_page"),
  );

  const links = await db
    .from("marketing_product_links")
    .select("product_id,source,property_id,external_key,verified_at,verification")
    .eq("organization_id", org)
    .in("product_id", [...new Set(data.candidates.map((c) => c.productId))])
    .limit(500);
  if (links.error)
    throw Error("No pudimos verificar las correspondencias web.");
  const verified=(links.data??[]).filter(l=>l.verification?.method==="store_product_identity_v1"&&l.verification?.bsaleProductId===l.product_id&&l.verification?.httpStatus===200&&((l.source==="ga4"&&l.property_id===GOOGLE_MARKETING.ga4PropertyId)||(l.source==="search_console"&&l.property_id===GOOGLE_MARKETING.searchConsoleSite)));
  return {
    ...data,
    candidates: data.candidates.map((c) => ({
      ...c,
      urlVerification: (()=>{const link=verified.find(l=>l.product_id===c.productId&&c.url&&(l.verification.canonicalUrl===c.url||(Array.isArray(l.verification.aliases)&&l.verification.aliases.includes(c.url))));return link?{status:"verified" as const,checkedAt:link.verified_at,canonicalUrl:String(link.verification.canonicalUrl),method:String(link.verification.method)}:{status:c.url?"pending" as const:"unavailable" as const};})(),
      webSignals: reports.flatMap((report) => {
        const keys = verified
          .filter(
            (l) =>
              l.product_id === c.productId &&
              l.source === report.source &&
              l.property_id === report.property_id,
          )
          .map((l) => l.external_key);
        const rows = (report.rows as WebRow[]).filter((r) =>
          keys.includes(
            r.dimensions[report.source === "ga4" ? "landingPage" : "page"],
          ),
        );
        return rows.length
          ? [
              {
                source: report.source,
                reportId: report.id,
                from: report.period_from,
                to: report.period_to,
                observedAt: report.observed_at,
                metrics: report.source === "ga4" ? { sessions: summarizeWeb({ source: report.source, rows }).sessions } : summarizeWeb({ source: report.source, rows }),
                limitations: {...report.metadata, ...(report.source === "ga4" ? {scope:"Solo visitas por página de entrada. Las compras e ingresos por artículo no se asignan al producto: identificador GA4 pendiente de validar."} : {})},
              },
            ]
          : [];
      }),
    })),
  };
}
