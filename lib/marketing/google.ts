import "server-only";
import { createSign } from "node:crypto";
import { z } from "zod";
import { GOOGLE_MARKETING } from "./google-config";
export type ReportKind = "campaign" | "landing" | "search_page";
export type WebRow = {
  dimensions: Record<string, string>;
  metrics: Record<string, number | null>;
};
export type WebReport = {
  source: "ga4" | "search_console";
  property_id: string;
  report_kind: ReportKind;
  period_from: string;
  period_to: string;
  rows: WebRow[];
  metadata: Record<string, unknown>;
  observed_at: string;
};
export function googleStatus() {
  return {
    ...GOOGLE_MARKETING,
    credentialsConfigured:
      !!process.env.GOOGLE_MARKETING_CLIENT_EMAIL &&
      !!process.env.GOOGLE_MARKETING_PRIVATE_KEY,
    state: "access_not_verified",
    scope: "read_only",
    adsSpendConnected: false,
  };
}
export async function accessToken() {
  const email = process.env.GOOGLE_MARKETING_CLIENT_EMAIL,
    key = process.env.GOOGLE_MARKETING_PRIVATE_KEY?.split(
      String.fromCharCode(92, 110),
    ).join(String.fromCharCode(10));
  if (!email || !key)
    throw new Error("Falta configurar el acceso de solo lectura de Google.");
  const now = Math.floor(Date.now() / 1000),
    b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned =
    b64({ alg: "RS256", typ: "JWT" }) +
    "." +
    b64({
      iss: email,
      scope:
        "https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/webmasters.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    });
  const assertion =
    unsigned +
    "." +
    createSign("RSA-SHA256").update(unsigned).sign(key).toString("base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  if (!r.ok)
    throw Error(
      "Google rechazó la autenticación. Revisa la configuración de la cuenta de servicio.",
    );
  return z.object({ access_token: z.string().min(1) }).parse(await r.json())
    .access_token;
}
async function query(url: string, body: unknown, token: string) {
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok)
    throw Error(
      r.status === 403
        ? "Google denegó la lectura: confirma permisos de la propiedad y API habilitada."
        : r.status === 429
          ? "Se alcanzó la cuota de Google. Reintenta más tarde."
          : `Google no pudo entregar el reporte (HTTP ${r.status}).`,
    );
  return r.json();
}
const number = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value)
    ? value
    : typeof value === "string" &&
        value.trim() !== "" &&
        Number.isFinite(Number(value))
      ? Number(value)
      : null;
const gaSchema = z.object({
  dimensionHeaders: z.array(z.object({ name: z.string() })),
  metricHeaders: z.array(z.object({ name: z.string() })),
  rows: z
    .array(
      z.object({
        dimensionValues: z.array(z.object({ value: z.string().optional() })),
        metricValues: z.array(z.object({ value: z.string().optional() })),
      }),
    )
    .optional(),
  rowCount: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export function parseGa4(
  raw: unknown,
  kind: "campaign" | "landing",
  from: string,
  to: string,
): WebReport {
  const b = gaSchema.parse(raw),
    meta = b.metadata ?? {},
    rows = (b.rows ?? []).map((r) => ({
      dimensions: Object.fromEntries(
        b.dimensionHeaders.map((h, i) => [
          h.name,
          r.dimensionValues[i]?.value ?? "",
        ]),
      ),
      metrics: Object.fromEntries(
        b.metricHeaders.map((h, i) => [
          h.name,
          number(r.metricValues[i]?.value),
        ]),
      ),
    }));
  if (rows.length > 1000) throw Error("Google excedió el límite del reporte.");
  return {
    source: "ga4",
    property_id: GOOGLE_MARKETING.ga4PropertyId,
    report_kind: kind,
    period_from: from,
    period_to: to,
    rows,
    metadata: {
      timeZone: meta.timeZone ?? null,
      currencyCode: meta.currencyCode ?? null,
      subjectToThresholding: meta.subjectToThresholding ?? false,
      dataLossFromOtherRow: meta.dataLossFromOtherRow ?? false,
      samplingMetadatas: meta.samplingMetadatas ?? [],
      rowCount: b.rowCount ?? rows.length,
      truncated: (b.rowCount ?? rows.length) > rows.length,
      attribution:
        "Métricas de sesión registradas por GA4; no ventas incrementales ni conciliación con Bsale.",
      limits:
        "No sumar reportes campaign y landing: son vistas del mismo tráfico. Ceros de compra no certifican que ecommerce esté instrumentado correctamente.",
    },
    observed_at: new Date().toISOString(),
  };
}
export function parseSearch(raw: unknown, from: string, to: string): WebReport {
  const b = z
    .object({
      rows: z
        .array(
          z.object({
            keys: z.array(z.string()).length(2),
            clicks: z.number().nonnegative(),
            impressions: z.number().nonnegative(),
            ctr: z.number().min(0).max(1),
            position: z.number().nonnegative(),
          }),
        )
        .max(1000)
        .optional(),
    })
    .parse(raw);
  return {
    source: "search_console",
    property_id: GOOGLE_MARKETING.searchConsoleSite,
    report_kind: "search_page",
    period_from: from,
    period_to: to,
    rows: (b.rows ?? []).map((r) => ({
      dimensions: { date: r.keys[0], page: r.keys[1] },
      metrics: {
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
      },
    })),
    metadata: {
      timeZone: "America/Los_Angeles",
      dataState: "final",
      searchType: "web",
      truncated: (b.rows?.length ?? 0) >= 1000,
      limits:
        "Search Console devuelve filas principales y no garantiza cobertura completa. Un día ausente no se interpreta como cero. Es tráfico orgánico; no gasto ni conversiones de anuncios.",
    },
    observed_at: new Date().toISOString(),
  };
}
export async function fetchWebReport(
  kind: ReportKind,
  from: string,
  to: string,
  providedToken?: string,
) {
  const token = providedToken ?? await accessToken();
  if (kind === "search_page")
    return parseSearch(
      await query(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GOOGLE_MARKETING.searchConsoleSite)}/searchAnalytics/query`,
        {
          startDate: from,
          endDate: to,
          dimensions: ["date", "page"],
          type: "web",
          dataState: "final",
          rowLimit: 1000,
          startRow: 0,
        },
        token,
      ),
      from,
      to,
    );
  const dimensions =
    kind === "campaign"
      ? [
          "date",
          "sessionManualSource",
          "sessionManualMedium",
          "sessionManualCampaignName",
          "sessionManualAdContent",
        ]
      : ["date", "landingPage"];
  return parseGa4(
    await query(
      `https://analyticsdata.googleapis.com/v1beta/properties/${GOOGLE_MARKETING.ga4PropertyId}:runReport`,
      {
        dateRanges: [{ startDate: from, endDate: to }],
        dimensions: dimensions.map((name) => ({ name })),
        metrics: [
          "sessions",
          "engagedSessions",
          "ecommercePurchases",
          "purchaseRevenue",
        ].map((name) => ({ name })),
        limit: 1000,
        offset: 0,
        orderBys: [{ dimension: { dimensionName: "date" } }],
      },
      token,
    ),
    kind,
    from,
    to,
  );
}
export function summarizeWeb(
  report: Pick<WebReport, "source" | "rows">,
): Record<string, number | null> {
  const sum = (key: string) =>
    report.rows.length === 0 ||
    report.rows.some(
      (r) => r.metrics[key] === null || r.metrics[key] === undefined,
    )
      ? null
      : report.rows.reduce((s, r) => s + r.metrics[key]!, 0);
  if (report.source === "search_console") {
    const clicks = sum("clicks"),
      impressions = sum("impressions");
    return {
      clicks,
      impressions,
      ctr: impressions && clicks !== null ? clicks / impressions : null,
      position:
        impressions &&
        report.rows.every(
          (r) =>
            r.metrics.position !== null && r.metrics.position !== undefined,
        )
          ? report.rows.reduce(
              (s, r) => s + r.metrics.position! * r.metrics.impressions!,
              0,
            ) / impressions
          : null,
    };
  }
  return {
    sessions: sum("sessions"),
    purchases: sum("ecommercePurchases"),
    revenue: sum("purchaseRevenue"),
  };
}
export function matchCampaign(
  rows: WebRow[],
  publication: {
    utm_source: string;
    utm_medium: string;
    utm_campaign: string;
    utm_content: string;
  },
) {
  const matched = rows.filter(
    (r) =>
      r.dimensions.sessionManualSource === publication.utm_source &&
      r.dimensions.sessionManualMedium === publication.utm_medium &&
      r.dimensions.sessionManualCampaignName === publication.utm_campaign &&
      r.dimensions.sessionManualAdContent === publication.utm_content,
  );
  return matched.length ? summarizeWeb({ source: "ga4", rows: matched }) : null;
}
