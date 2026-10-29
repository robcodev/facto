"use client";
import Link from "next/link";
import Measurement from "./Measurement";
import ProductDecisions from "./ProductDecisions";
import { useEffect, useState } from "react";
import {
  formats,
  priority,
  warningsFor,
  type Candidate,
  type Content,
  type Format,
  type Idea,
  type Opportunities,
} from "@/lib/marketing/core";
const labels: Record<Format, string> = {
  reel: "Reel",
  historias: "Historias",
  carrusel: "Carrusel o publicación",
  banner: "Banner",
  email: "Email",
};
const fieldLabels: Record<keyof Content, string> = {
  title: "Título",
  objective: "Objetivo",
  audience: "Público sugerido (hipótesis)",
  hook: "Gancho",
  message: "Mensaje principal",
  copy: "Borrador de texto",
  action: "Acción esperada",
  outline: "Guion o estructura",
  materials: "Material necesario",
  warnings: "Advertencias editoriales",
};
function date(value: string | null) {
  if (!value) return "Sin fecha";
  return new Date(value).toLocaleString("es-CL", {
    timeZone: "America/Santiago",
  });
}
async function api(url: string, options?: RequestInit) {
  const r = await fetch(url, { ...options, cache: "no-store" });
  const body = await r.json();
  if (!r.ok)
    throw new Error(body.error ?? "No pudimos completar la operación.");
  return body;
}
const button =
  "rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 hover:bg-blue-800";
const input =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm";
function Evidence({
  c,
  from,
  to,
  warnings,
}: {
  c: Candidate;
  from: string;
  to: string;
  warnings: string[];
}) {
  return (
    <div className="space-y-2 text-sm text-gray-700">
      <p>
        <strong>
          {c.signal === "receipt" ? "Ingreso detectado" : "Ventas documentadas"}
        </strong>{" "}
        · {from} al {to}
      </p>
      <p>
        {c.quantity} unidades{" "}
        {c.signal === "receipt" ? "recibidas" : "en documentos finales activos"}{" "}
        · {c.documentCount} documentos. No es facturación neta.
      </p>
      <p>
        Último evento: {c.eventDate.slice(0, 10)} · Datos observados:{" "}
        {date(c.observedAt)}
      </p>
      <p>
        Disponible observado:{" "}
        <strong>{c.available === null ? "Desconocido" : c.available}</strong> ·{" "}
        {date(c.stockObservedAt)}. Suma de las sucursales observadas; no
        garantiza disponibilidad para un canal.
      </p>
      <p>
        Producto Bsale {c.productId} · Variante {c.variantId}. Catálogo
        observado: {date(c.catalogObservedAt)}
      </p>
      {c.url && /^https?:\/\//i.test(c.url) && (
        <a
          className="text-blue-700 underline"
          href={c.url}
          target="_blank"
          rel="noreferrer"
        >
          Enlace guardado del producto
        </a>
      )}
      <ul className="list-disc space-y-1 pl-5 text-amber-900">
        {warnings.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
      <details>
        <summary className="cursor-pointer">Referencias de Intel</summary>
        <pre className="overflow-auto whitespace-pre-wrap text-xs">
          {JSON.stringify(
            { records: c.recordIds, offices: c.offices },
            null,
            2,
          )}
        </pre>
      </details>
      {c.webSignals && c.webSignals.length > 0 && (
        <details>
          <summary>Señales web verificadas</summary>
          <pre className="whitespace-pre-wrap text-xs">
            {JSON.stringify(c.webSignals, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
function Editor({
  idea,
  onSave,
  busy,
}: {
  idea: Idea;
  onSave: (content: Content, status: Idea["status"]) => void;
  busy: boolean;
}) {
  const [content, setContent] = useState(idea.content);
  const [status, setStatus] = useState(idea.status);
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        {labels[idea.format]} · Evidencia del {date(idea.evidence.checkedAt)} ·
        Prioridad {idea.evidence.score}/10
      </p>
      <p className="text-xs text-gray-500">{idea.evidence.scoreReason}</p>
      {(Object.keys(fieldLabels) as (keyof Content)[]).map((key) => (
        <label key={key} className="block text-sm font-medium">
          {fieldLabels[key]}
          <textarea
            className={`${input} mt-1`}
            rows={key === "copy" || Array.isArray(content[key]) ? 5 : 2}
            maxLength={
              key === "copy"
                ? 5000
                : key === "message"
                  ? 2000
                  : key === "title"
                    ? 240
                    : undefined
            }
            value={
              Array.isArray(content[key])
                ? (content[key] as string[]).join("\n")
                : (content[key] as string)
            }
            onChange={(e) =>
              setContent({
                ...content,
                [key]: Array.isArray(content[key])
                  ? e.target.value.split("\n")
                  : e.target.value,
              })
            }
          />
          {Array.isArray(content[key]) && (
            <span className="text-xs font-normal text-gray-500">
              Un elemento por línea.
            </span>
          )}
        </label>
      ))}
      <label className="block text-sm">
        Estado
        <select
          className={`${input} mt-1`}
          value={status}
          onChange={(e) => setStatus(e.target.value as Idea["status"])}
        >
          <option value="draft">Borrador</option>
          <option value="reviewed">Revisado</option>
          <option value="discarded">Descartado</option>
        </select>
      </label>
      <button
        className={button}
        disabled={busy}
        onClick={() => {
          const clean = { ...content };
          for (const k of ["outline", "materials", "warnings"] as const)
            clean[k] = clean[k].map((x) => x.trim()).filter(Boolean);
          onSave(clean, status);
        }}
      >
        Guardar idea y cambios
      </button>
      <details className="rounded-lg bg-gray-50 p-4">
        <summary className="cursor-pointer font-medium">
          Evidencia original (se conserva al editar)
        </summary>
        <div className="mt-3">
          <Evidence
            c={idea.evidence.candidate}
            from={idea.evidence.from}
            to={idea.evidence.to}
            warnings={idea.evidence.warnings}
          />
        </div>
      </details>
    </div>
  );
}
export default function Marketing({
  initialPeriod,initialGoogleResult,
}: {
  initialPeriod: { from: string; to: string };
  initialGoogleResult?:string;
}) {
  const [period, setPeriod] = useState(initialPeriod),
    [data, setData] = useState<Opportunities | null>(null),
    [ideas, setIdeas] = useState<Idea[]>([]);
  const [tab, setTab] = useState<"opportunities" | "ideas" | "measurement">(
      "opportunities",
    ),
    [keys, setKeys] = useState<string[]>([]),
    [format, setFormat] = useState<Format>("reel");
  const [analysisId,setAnalysisId]=useState<string|null>(null);
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [message, setMessage] = useState(initialGoogleResult==="connected"?"Conexión Google autorizada y acceso a ambas propiedades verificado.":initialGoogleResult==="failed"?"No se completó la conexión Google. Revisa permisos, cuenta y configuración; no se guardó una nueva autorización.":""),
    [error, setError] = useState(""),
    [signal, setSignal] = useState("all"),
    [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("google"))
      window.history.replaceState(null, "", window.location.pathname);
  }, []);
  const [savedPage, setSavedPage] = useState(0),
    [hasMoreSaved, setHasMoreSaved] = useState(false);
  async function loadSaved(page = 0) {
    setBusy(true);
    setError("");
    try {
      const r = await api(`/api/marketing/ideas?page=${page}`);
      setSavedPage(page);
      setHasMoreSaved(r.hasMore);
      setIdeas((old) => [
        ...old.filter((i) => !i.saved),
        ...r.ideas.map((i: Idea) => ({ ...i, saved: true })),
      ]);
      setTab("ideas");
      setActive(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function explore(selectedPeriod: { from: string; to: string }) {
    setPeriod(selectedPeriod);
    setAnalysisId(null);
    setMessage("");
    setLoading(true);
    setError("");
    setKeys([]);
    setData(null);
    try {
      setData(await api(`/api/marketing?${new URLSearchParams(selectedPeriod)}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function generate() {
    if (!data) return;
    const pendingKeys = keys.filter(
      (key) =>
        !ideas.some(
          (i) =>
            i.evidence.candidate.key === key &&
            i.format === format &&
            i.evidence.from === data.from &&
            i.evidence.to === data.to,
        ),
    );
    if (!pendingKeys.length) {
      setMessage(
        "Esa propuesta ya está en Ideas; puedes abrirla sin otra llamada a IA.",
      );
      setTab("ideas");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const x = await api("/api/marketing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: data.from,
          to: data.to,
          keys: pendingKeys,
          analysisId:analysisId??undefined,
          format,
        }),
      });
      const successful = x.results
        .filter((r: { idea?: Idea }) => r.idea)
        .map((r: { idea: Idea }) => r.idea);
      setIdeas((items) => [...successful, ...items]);
      const failed = x.results.length - successful.length;
      setMessage(
        `${successful.length} ideas en esta sesión.${failed ? ` ${failed} no pudieron generarse.` : ""} No se guardan en la base.`,
      );
      setKeys(
        x.results
          .filter((r: { error?: string }) => r.error)
          .map((r: { key: string }) => r.key),
      );
      if (successful.length) {
        setTab("ideas");
        setActive(successful[0].id);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(idea: Idea, content: Content, status: Idea["status"]) {
    setBusy(true);
    setError("");
    try {
      const r = await api("/api/marketing/ideas", {
        method: idea.saved ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          idea.saved
            ? { id: idea.id, updatedAt: idea.updated_at, content, status }
            : { idea: { ...idea, title: content.title, content, status } },
        ),
      });
      setIdeas((items) =>
        items
          .filter((i) => i.id !== r.idea.id || i.id === idea.id)
          .map((i) => (i.id === idea.id ? { ...r.idea, saved: true } : i)),
      );
      setActive(r.idea.id);
      setMessage(
        r.existing
          ? "Esta idea ya estaba guardada; se abrió su versión existente."
          : "Idea guardada con su evidencia original.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-5 md:p-8">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
          Marketing
        </p>
        <h1 className="mt-1 text-3xl font-bold text-gray-900">
          Ideas de contenido
        </h1>
        <p className="mt-2 max-w-3xl text-gray-600">
          Encuentra motivos concretos para comunicar productos. Revisa la
          evidencia y genera una tanda pequeña de borradores.
        </p>
        <p className="mt-2 text-xs text-gray-500">
          Genera borradores, guarda los que elijas y registra resultados. Sin
          publicación ni envíos automáticos.
        </p>
      </header>
      <nav className="flex flex-wrap gap-3 border-b pb-3" aria-label="Marketing">
        <Link href="/marketing/calendar" className="font-semibold text-blue-700">Calendario de contenido</Link>
        <button
          disabled={busy}
          className={
            tab === "opportunities"
              ? "font-semibold text-blue-700"
              : "text-gray-500"
          }
          onClick={() => setTab("opportunities")}
        >
          Oportunidades
        </button>
        <button
          disabled={busy}
          className={
            tab === "ideas" ? "font-semibold text-blue-700" : "text-gray-500"
          }
          onClick={() => {
            setTab("ideas");
          }}
        >
          Ideas
        </button>
        <button
          disabled={busy}
          className="text-blue-700"
          onClick={() => void loadSaved()}
        >
          Abrir guardadas
        </button>
        <button
          disabled={busy}
          className="text-blue-700"
          onClick={() => setTab("measurement")}
        >
          Medición y fuentes
        </button>
      </nav>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800"
        >
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="rounded-lg bg-green-50 p-4 text-green-900">
          {message}
        </p>
      )}
      {tab === "measurement" ? (
        <Measurement period={period} />
      ) : tab === "opportunities" ? (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fields = new FormData(e.currentTarget);
              void explore({ from: String(fields.get("from")), to: String(fields.get("to")) });
            }}
            className="flex flex-wrap items-end gap-4 rounded-xl border bg-white p-4"
          >
            <label className="text-sm">
              Desde
              <input
                type="date"
                required
                name="from"
                defaultValue={period.from}
                max={initialPeriod.to}
                className={`${input} mt-1`}

              />
            </label>
            <label className="text-sm">
              Hasta
              <input
                type="date"
                required
                name="to"
                defaultValue={period.to}
                max={initialPeriod.to}
                className={`${input} mt-1`}

              />
            </label>
            <button className={button} disabled={busy || loading}>
              Consultar Intel
            </button>
            <p className="text-xs text-gray-500">
              Hasta 91 días cerrados. Consultar no utiliza IA.
            </p>
          </form>
          {!loading && !data && !error && <p className="rounded-xl border bg-white p-6 text-gray-600">Selecciona las fechas y pulsa Consultar Intel para cargar resultados.</p>}
          {loading && <p role="status">Consultando evidencia…</p>}
          {data && (
            <>
              <details className="rounded-xl border bg-slate-50 p-4 text-sm">
                <summary className="cursor-pointer font-medium">{data.coverage.salesCovered&&!data.coverage.adjustmentsPending&&!data.coverage.invalidLines?"Ventas con cobertura verificada":"Revisar cobertura antes de decidir"} · {data.from} al {data.to}</summary>
                <p className="mt-3">Unidades brutas de ventas finales activas; notas de crédito separadas. Stock observado, sin disponibilidad histórica. Recepciones no confirman novedades.</p>
                <p className="mt-2 text-xs">Leído: {date(data.checkedAt)}.</p>
                {data.notices?.map(notice=><p className="mt-2 text-amber-900" key={notice}>{notice}</p>)}
              </details>
              <ProductDecisions data={data} selectedKeys={keys} selectedAnalysisId={analysisId} disabled={busy} onChoose={(chosen,recommendedFormat,id)=>{setKeys(chosen);if(recommendedFormat)setFormat(recommendedFormat as Format);setAnalysisId(id);setMessage("");}} />
              <section aria-label="Oportunidades seleccionadas" className="rounded-xl border border-blue-200 bg-white p-4"><div className="mb-3"><h3 className="font-semibold">{keys.length ? `${keys.length} ${keys.length === 1 ? "oportunidad seleccionada" : "oportunidades seleccionadas"}` : "Selecciona las prioridades que quieras desarrollar"}</h3>{keys.length > 0 && <p className="mt-1 text-sm text-slate-600">{keys.map(key=>data.candidates.find(c=>c.key===key)?.productName).filter(Boolean).join(" · ")}</p>}</div><div className="flex flex-wrap items-end gap-4">
                <label className="text-sm">
                  Formato para los borradores
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value as Format)}
                    className={`${input} mt-1`}
                  >
                    {formats.map((f) => (
                      <option key={f} value={f}>
                        {labels[f]}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className={button}
                  disabled={busy || keys.length === 0}
                  onClick={() => void generate()}
                >
                  {busy
                    ? "Generando…"
                    : `Generar ${keys.length || ""} ${keys.length === 1 ? "idea" : "ideas"} con IA`}
                </button>
                <span className="text-xs text-gray-500">
                  Selecciona hasta 5. Se envían a Google Gemini los nombres de
                  producto, variantes, fechas y evidencia editorial acotada, sin
                  datos de clientes. Los borradores no se guardan: se pierden al
                  recargar o salir.
                </span>
                {keys.length > 0 && <button className="text-sm underline" disabled={busy} onClick={()=>{setKeys([]);setAnalysisId(null);}}>Limpiar selección</button>}
              </div></section>

              {data.candidates.length === 0 && (
                <p className="rounded-xl border bg-white p-6">
                  No hay oportunidades respaldadas en este intervalo. Prueba
                  otro período o revisa la cobertura en Intel. La ausencia de
                  datos no significa ausencia de ventas.
                </p>
              )}
              <details className="rounded-xl border bg-white p-4"><summary className="cursor-pointer text-sm font-medium">Selección manual por variante ({data.candidates.length})</summary><p className="my-3 text-sm text-slate-600">Usa esta opción si quieres elegir otra variante. Al comenzar una selección manual se reemplaza la selección del análisis.</p>
                <label className="text-sm">
                  Señal
                  <select
                    value={signal}
                    onChange={(e) => setSignal(e.target.value)}
                    className={`${input} mt-1`}
                  >
                    <option value="all">Todas</option>
                    <option value="receipt">Ingresos detectados</option>
                    <option value="sales">Ventas documentadas</option>
                  </select>
                </label>
              <div className="grid gap-4 lg:grid-cols-2">
                {data.candidates
                  .filter((c) => signal === "all" || c.signal === signal)
                  .map((c) => (
                    <article
                      key={c.key}
                      className="space-y-3 rounded-xl border bg-white p-5"
                    >
                      <label className="flex cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={!analysisId && keys.includes(c.key)}
                          disabled={
                            busy || (!keys.includes(c.key) && keys.length >= 5)
                          }
                          onChange={(e) => {setAnalysisId(null);setKeys(k=>{const current=analysisId?[]:k;return e.target.checked?[...current,c.key]:current.filter(x=>x!==c.key);});}}
                        />
                        <span>
                          <strong className="block text-lg">
                            {c.productName}
                          </strong>
                          <span className="text-sm text-gray-500">
                            {c.variantName} · {c.brand || "Marca no informada"}
                          </span>
                        </span>
                      </label>
                      <p className="text-xs text-gray-500">
                        Prioridad {priority(c).score}/10 ·{" "}
                        {priority(c).scoreReason}
                      </p>
                      <Evidence
                        c={c}
                        from={data.from}
                        to={data.to}
                        warnings={warningsFor(c, data.to)}
                      />
                    </article>
                  ))}
              </div>
              </details>
              <p className="text-xs text-gray-500">
                Selección acotada a 20 productos por movimiento distribuido y 10 por recepción reciente; sus variantes con movimiento se incluyen completas. No es una recomendación de promocionar todo el catálogo.
              </p>
            </>
          )}
        </>
      ) : (
        <section className="space-y-4">
          {loading ? (
            <p role="status">Cargando ideas…</p>
          ) : (
            <>
              <p className="text-sm text-gray-500">
                Los borradores sin guardar se pierden al salir. Las ideas
                guardadas conservan su evidencia. Revisado no equivale a
                publicado.
              </p>
              {ideas.length === 0 && (
                <p className="rounded-xl border bg-white p-6">
                  Aún no has generado ideas en esta sesión.
                </p>
              )}
              <div className="flex gap-3">
                <button
                  className={button}
                  disabled={busy || savedPage === 0}
                  onClick={() => void loadSaved(savedPage - 1)}
                >
                  Guardadas anteriores
                </button>
                <button
                  className={button}
                  disabled={busy || !hasMoreSaved}
                  onClick={() => void loadSaved(savedPage + 1)}
                >
                  Más guardadas
                </button>
              </div>
              {ideas.map((i) => (
                <article key={i.id} className="rounded-xl border bg-white p-5">
                  <button
                    className="flex w-full items-center justify-between gap-3 text-left"
                    disabled={busy}
                    onClick={() => setActive(active === i.id ? null : i.id)}
                    aria-expanded={active === i.id}
                  >
                    <strong>{i.title}</strong>
                    <span className="text-xs text-gray-500">
                      {i.saved ? "Guardada · " : "Sin guardar · "}
                      {labels[i.format]} ·{" "}
                      {i.status === "draft"
                        ? "Borrador"
                        : i.status === "reviewed"
                          ? "Revisado"
                          : "Descartado"}
                    </span>
                  </button>
                  {active === i.id && (
                    <div className="mt-5">
                      <Editor
                        key={`${i.id}:${i.updated_at}`}
                        idea={i}
                        onSave={(c, s) => void save(i, c, s)}
                        busy={busy}
                      />
                    </div>
                  )}
                </article>
              ))}
            </>
          )}
        </section>
      )}
    </main>
  );
}
