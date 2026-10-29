"use client";
import ProductLinks from "./ProductLinks";
import { useEffect, useState } from "react";
import type { Idea } from "@/lib/marketing/core";
async function api(url: string, options?: RequestInit) {
  const r = await fetch(url, { ...options, cache: "no-store" }),
    b = await r.json();
  if (!r.ok) throw Error(b.error ?? "No pudimos completar la operación.");
  return b;
}
const input = "rounded-lg border border-gray-300 p-2 text-sm w-full",
  button =
    "rounded-lg bg-blue-700 px-4 py-2 text-sm text-white disabled:opacity-40";
type Report = {
  id: string;
  source: string;
  report_kind: string;
  period_from: string;
  period_to: string;
  metadata: Record<string, unknown>;
};
type Publication = {
  id: string;
  channel: string;
  utm_campaign: string;
  idea_id: string;
};
type State = {
  google: {
    ga4PropertyId: string;
    searchConsoleSite: string;
    credentialsConfigured: boolean;
    oauthConfigured:boolean;oauthConnected:boolean;oauthStorageReady:boolean;canManage:boolean;
  };
  performance: {
    publicationId: string;
    channel: string;
    campaign: string;
    ga4: Record<string, number | null> | null;
    currency: string | null;
    declaredResults: unknown[];
  }[];
  storageReady: boolean;
  reports: Report[];
  publications: Publication[];
  results: {
    id: string;
    currency: string | null;
    spend: number | null;
    revenue: number | null;
    attribution_basis: string;
  }[];
  warning: string;
};
export default function Measurement({
  period,
}: {
  period: { from: string; to: string };
}) {
  const [data, setData] = useState<State | null>(null),
    [ideas, setIdeas] = useState<Idea[]>([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [kind, setKind] = useState("campaign");
  useEffect(() => {
    let live = true;
    api(`/api/marketing/measurement?from=${period.from}&to=${period.to}`)
      .then((x) => {
        if (live) setData(x);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    api("/api/marketing/ideas")
      .then((x) => {
        if (live) setIdeas(x.ideas);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [period.from, period.to]);
  async function connectGoogle(){setBusy(true);setError('');try{const r=await api('/api/marketing/google/start',{method:'POST'});window.location.assign(r.url);}catch(e){setError((e as Error).message);setBusy(false);}}
  async function submit(body: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await api("/api/marketing/measurement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setMessage(
        r.trackingUrl
          ? `Enlace de seguimiento: ${r.trackingUrl}`
          : r.summary
            ? `Reporte guardado. Resumen de esta vista: ${JSON.stringify(r.summary)}. No sumar distintas vistas como ventas adicionales.`
            : (r.warning ?? r.message ?? "Registro guardado."),
      );
      setData(await api("/api/marketing/measurement"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-5">
      <h2 className="text-xl font-semibold">Medición y fuentes</h2>
      <p className="text-sm text-gray-600">
        Período seleccionado: {period.from} al {period.to}. Bsale muestra ventas
        comerciales; GA4 registra actividad web; Search Console muestra búsqueda
        orgánica. Coincidir en fechas no demuestra causalidad.
      </p>
      {error && (
        <p role="alert" className="bg-red-50 p-3 text-red-800">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="break-words bg-green-50 p-3 text-green-900">
          {message}
        </p>
      )}
      {data && (
        <>
          <ProductLinks />
          <div className="rounded-xl border bg-white p-4 text-sm">
            <p>
              GA4: propiedad {data.google.ga4PropertyId} · Search Console:{" "}
              {data.google.searchConsoleSite}
            </p>
            <p className="mt-2">
              {data.google.oauthConnected?"Autorización de tu usuario Google guardada; cada consulta vuelve a comprobar el acceso.":data.google.credentialsConfigured
                ? "Credenciales configuradas; acceso a cada propiedad pendiente de comprobar al consultar."
                : "Tu usuario Google todavía no está conectado. Las propiedades están identificadas."}
            </p>
            <p>
              {data.storageReady
                ? "Base de medición disponible."
                : "Base de medición pendiente de activar."}
            </p>
            <p className="mt-2 text-amber-900">
              Meta Ads y Google Ads: gasto aún sin conexión automática. Puede
              registrarse manualmente con su fuente y criterio de atribución.
            </p>
          </div>
          <div className="rounded-xl border bg-white p-4 text-sm"><p>Conecta tu usuario de Google. Se pedirán permisos de lectura de Analytics y Search Console; Facto consultará las propiedades indicadas. La autorización renovable se guarda cifrada y se comparte con el equipo autorizado de Facto.</p><button className={button+' mt-3'} disabled={busy||!data.google.oauthConfigured||!data.google.oauthStorageReady||!data.google.canManage} onClick={()=>void connectGoogle()}>{data.google.oauthConnected?'Reconectar Google':'Conectar mi usuario de Google'}</button>{!data.google.oauthConfigured&&<p className="mt-2 text-amber-900">Falta configurar el cliente OAuth en Google Cloud y en el servidor de Facto.</p>}{!data.google.oauthStorageReady&&<p className="mt-2 text-amber-900">Falta activar el almacenamiento cifrado de la conexión.</p>}<p className="mt-2 text-xs text-gray-500">No se te pide la contraseña en Facto. Puedes revocar la autorización desde tu cuenta Google. En modo de pruebas, Google puede exigir volver a autorizar a los siete días.</p></div>
          <div className="flex flex-wrap gap-3">
            <select
              aria-label="Reporte de Google"
              className={input + " max-w-md"}
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="campaign">GA4 · sesiones y compras por UTM</option>
              <option value="landing">GA4 · páginas de entrada</option>
              <option value="search_page">
                Search Console · páginas y búsquedas orgánicas
              </option>
            </select>
            <button
              className={button}
              disabled={
                busy || !data.storageReady || !data.google.credentialsConfigured
              }
              onClick={() => void submit({ ...period, kind })}
            >
              Consultar Google y conservar reporte
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Acción manual; hasta 1.000 filas agregadas. Se conservan fechas,
            moneda, zona horaria, limitaciones y fecha de lectura. No se
            exportan contactos ni datos personales de usuarios.
          </p>
          <div className="space-y-2">
            <h3 className="font-semibold">
              Resultados por publicación: coincidencia exacta de UTM
            </h3>
            {data.performance?.map((p) => (
              <details
                key={p.publicationId}
                className="rounded-lg border p-3 text-sm"
              >
                <summary>
                  {p.channel} · {p.campaign}
                </summary>
                <p>
                  {p.ga4
                    ? "Actividad registrada por GA4 para esta combinación UTM."
                    : "Sin coincidencia verificada en el reporte de GA4; no equivale a cero ventas."}
                </p>
                <pre className="whitespace-pre-wrap text-xs">
                  {JSON.stringify(
                    {
                      ga4: p.ga4,
                      currency: p.currency,
                      declaredResults: p.declaredResults,
                    },
                    null,
                    2,
                  )}
                </pre>
                <p>
                  No sumar las compras de GA4 con las ventas de Bsale. No
                  demuestra causalidad.
                </p>
              </details>
            ))}
            {data.reports.map((r) => (
              <details key={r.id} className="rounded-lg border p-3 text-sm">
                <summary>
                  {r.source} · {r.report_kind} · {r.period_from} al{" "}
                  {r.period_to}
                </summary>
                <pre className="whitespace-pre-wrap text-xs">
                  {JSON.stringify(r.metadata, null, 2)}
                </pre>
              </details>
            ))}
          </div>
          <details className="rounded-xl border bg-white p-4">
            <summary className="cursor-pointer font-medium">
              Verificar correspondencia de una página con un producto
            </summary>
            <form
              className="mt-3 grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void submit({
                  action: "mapping",
                  productId: f.get("productId"),
                  source: f.get("source"),
                  externalKey: f.get("externalKey"),
                });
              }}
            >
              <label>
                ID original del producto en Bsale
                <input
                  required
                  name="productId"
                  pattern="[0-9]+"
                  className={input}
                />
              </label>
              <label>
                Fuente
                <select name="source" className={input}>
                  <option value="ga4">GA4: ruta exacta de landingPage</option>
                  <option value="search_console">
                    Search Console: URL completa exacta
                  </option>
                </select>
              </label>
              <label>
                Ruta o URL verificada
                <input required name="externalKey" className={input} />
              </label>
              <p className="text-xs text-gray-500">
                Verifica la correspondencia antes de guardarla. No usar nombre
                ni SKU como identidad. Solo se cruzan reportes del mismo período
                seleccionado.
              </p>
              <button className={button} disabled={busy || !data.storageReady}>
                Confirmar correspondencia
              </button>
            </form>
          </details>
          <details className="rounded-xl border bg-white p-4">
            <summary className="cursor-pointer font-medium">
              Registrar publicación y enlace de seguimiento
            </summary>
            <form
              className="mt-4 grid gap-3 md:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void submit({
                  action: "publication",
                  ideaId: f.get("ideaId"),
                  channel: f.get("channel"),
                  destinationUrl: f.get("destinationUrl"),
                  ...(f.get("publicationUrl")
                    ? { publicationUrl: f.get("publicationUrl") }
                    : {}),
                  publishedAt: new Date(
                    String(f.get("publishedAt")),
                  ).toISOString(),
                  source: f.get("source"),
                  medium: f.get("medium"),
                  campaign: f.get("campaign"),
                  content: f.get("content"),
                });
              }}
            >
              <label>
                Idea guardada
                <select required name="ideaId" className={input}>
                  <option value="">Seleccionar</option>
                  {ideas.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.title}
                    </option>
                  ))}
                </select>
              </label>
              {[
                ["channel", "Canal"],
                ["destinationUrl", "URL de destino"],
                ["publicationUrl", "URL de publicación (opcional)"],
                ["publishedAt", "Fecha de publicación"],
                ["source", "utm_source"],
                ["medium", "utm_medium"],
                ["campaign", "utm_campaign"],
                ["content", "utm_content: identificador único de pieza"],
              ].map(([name, label]) => (
                <label key={name} className="text-sm">
                  {label}
                  <input
                    name={name}
                    required={name !== "publicationUrl"}
                    type={
                      name === "publishedAt"
                        ? "datetime-local"
                        : name.includes("Url")
                          ? "url"
                          : "text"
                    }
                    className={input}
                  />
                </label>
              ))}
              <button className={button} disabled={busy || !data.storageReady}>
                Registrar y obtener enlace UTM
              </button>
            </form>
          </details>
          <details className="rounded-xl border bg-white p-4">
            <summary className="cursor-pointer font-medium">
              Registrar resultados y gasto de una pieza
            </summary>
            <form
              className="mt-4 grid gap-3 md:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget),
                  n = (k: string) =>
                    String(f.get(k) ?? "").trim() === ""
                      ? null
                      : Number(f.get(k));
                void submit({
                  action: "result",
                  publicationId: f.get("publicationId"),
                  from: period.from,
                  to: period.to,
                  currency: f.get("currency") || null,
                  spend: n("spend"),
                  impressions: n("impressions"),
                  reach: n("reach"),
                  clicks: n("clicks"),
                  purchases: n("purchases"),
                  revenue: n("revenue"),
                  attributionBasis: f.get("attributionBasis"),
                  notes: f.get("notes") ?? "",
                });
              }}
            >
              <label>
                Publicación
                <select name="publicationId" required className={input}>
                  <option value="">Seleccionar</option>
                  {data.publications.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.channel} · {p.utm_campaign}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Moneda
                <input
                  name="currency"
                  maxLength={3}
                  placeholder="Código ISO, por ejemplo CLP"
                  className={input}
                />
              </label>
              {[
                ["spend", "Gasto"],
                ["impressions", "Impresiones"],
                ["reach", "Alcance"],
                ["clicks", "Clics"],
                ["purchases", "Compras atribuidas"],
                ["revenue", "Ingresos atribuidos"],
              ].map(([name, label]) => (
                <label key={name} className="text-sm">
                  {label}
                  <input
                    name={name}
                    type="number"
                    min="0"
                    step="any"
                    className={input}
                  />
                </label>
              ))}
              <label>
                Criterio de atribución y fuente
                <input
                  required
                  name="attributionBasis"
                  maxLength={1000}
                  className={input}
                />
              </label>
              <label>
                Observaciones
                <textarea name="notes" className={input} />
              </label>
              <p className="text-xs text-gray-500">
                Los campos vacíos quedan desconocidos, no como cero. Se registra
                el intervalo seleccionado; no sumar capturas de períodos
                superpuestos. El retorno declarado no demuestra ventas
                adicionales.
              </p>
              <button className={button} disabled={busy || !data.storageReady}>
                Registrar resultados
              </button>
            </form>
          </details>
          <p className="text-xs text-gray-500">
            {data.results.length} registros de resultados recientes. Para cruzar
            una página con un producto se exige una correspondencia verificada,
            no coincidencia de nombre o SKU.
          </p>
        </>
      )}
    </section>
  );
}
