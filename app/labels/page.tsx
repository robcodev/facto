'use client';

import { useEffect, useMemo, useState } from 'react';
import { DOTS_PER_MM, getLabelSize, setLabelSize, summarizeZpl } from '@/lib/zpl/parser';
import type { RenderLabelError, RenderLabelRequest, ZplDocumentSummary } from './types';

const INITIAL_WIDTH_MM = 60;
const INITIAL_HEIGHT_MM = 40;
const INITIAL_CONTENT_SCALE_PERCENT = 100;
const INITIAL_ZPL = `^XA
^PW720
^LL480
^FO60,60^A0N,55,55^FDEtiqueta de ejemplo^FS
^FO60,145^BY3^BCN,120,Y,N,N^FD123456789^FS
^XZ`;

export default function LabelsPage() {
    const [zpl, setZpl] = useState(INITIAL_ZPL);
    const [widthMm, setWidthMm] = useState(INITIAL_WIDTH_MM);
    const [heightMm, setHeightMm] = useState(INITIAL_HEIGHT_MM);
    const [contentScalePercent, setContentScalePercent] = useState(INITIAL_CONTENT_SCALE_PERCENT);
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const analysis = useMemo<{ summary: ZplDocumentSummary | null; error: string | null }>(() => {
        try {
            return { summary: summarizeZpl(zpl), error: null };
        } catch (analysisError) {
            return {
                summary: null,
                error: analysisError instanceof Error ? analysisError.message : 'El ZPL no es válido.',
            };
        }
    }, [zpl]);

    useEffect(() => {
        return () => {
            if (pdfUrl) URL.revokeObjectURL(pdfUrl);
        };
    }, [pdfUrl]);

    const updateDimensions = (nextWidthMm: number, nextHeightMm: number) => {
        setWidthMm(nextWidthMm);
        setHeightMm(nextHeightMm);
        setPdfUrl(null);

        if (nextWidthMm > 0 && nextHeightMm > 0) {
            try {
                setZpl((current) => setLabelSize(current, nextWidthMm, nextHeightMm));
            } catch {
                // Mientras el usuario edita un valor numérico incompleto, conservamos el ZPL actual.
            }
        }
    };

    const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const contents = await file.text();
            const detected = getLabelSize(contents);

            if (detected.widthDots && detected.heightDots) {
                setWidthMm(Number((detected.widthDots / DOTS_PER_MM).toFixed(2)));
                setHeightMm(Number((detected.heightDots / DOTS_PER_MM).toFixed(2)));
            }

            setZpl(contents);
            setPdfUrl(null);
            setError(null);
        } catch {
            setError('No se pudo leer el archivo seleccionado.');
        }
    };

    const generatePreview = async () => {
        setLoading(true);
        setError(null);

        try {
            const payload: RenderLabelRequest = { zpl, widthMm, heightMm, contentScalePercent };
            const response = await fetch('/api/labels/render', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const result = (await response.json().catch(() => null)) as RenderLabelError | null;
                throw new Error(result?.error || 'No se pudo generar el PDF.');
            }

            const nextPdfUrl = URL.createObjectURL(await response.blob());
            setPdfUrl(nextPdfUrl);
        } catch (previewError) {
            setError(previewError instanceof Error ? previewError.message : 'No se pudo generar el PDF.');
        } finally {
            setLoading(false);
        }
    };

    const printLabel = () => {
        if (!pdfUrl) return;

        const printWindow = window.open(pdfUrl, '_blank');
        if (!printWindow) {
            setError('El navegador bloqueó la ventana de impresión. Habilita las ventanas emergentes e inténtalo otra vez.');
            return;
        }

        printWindow.addEventListener('load', () => printWindow.print(), { once: true });
        window.setTimeout(() => printWindow.print(), 1000);
    };

    return (
        <div className="mx-auto max-w-7xl space-y-6 p-6">
            <header className="border-b pb-4">
                <h1 className="text-2xl font-bold text-gray-800">Etiquetas ZPL</h1>
                <p className="mt-1 text-sm text-gray-500">Edita, previsualiza e imprime etiquetas para una impresora de 300 dpi.</p>
            </header>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
                <section className="space-y-5 rounded-lg border bg-white p-6 shadow-sm">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-700">Configuración</h2>
                        <p className="mt-1 text-sm text-gray-500">Las medidas actualizan ^PW/^LL y la escala amplía o reduce el contenido.</p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-3">
                        <label className="space-y-1.5 text-sm font-medium text-gray-700">
                            Ancho (mm)
                            <input
                                type="number"
                                min="1"
                                step="0.1"
                                value={widthMm}
                                onChange={(event) => updateDimensions(Number(event.target.value), heightMm)}
                                className="w-full rounded-md border px-3 py-2 text-gray-800 outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </label>
                        <label className="space-y-1.5 text-sm font-medium text-gray-700">
                            Alto (mm)
                            <input
                                type="number"
                                min="1"
                                step="0.1"
                                value={heightMm}
                                onChange={(event) => updateDimensions(widthMm, Number(event.target.value))}
                                className="w-full rounded-md border px-3 py-2 text-gray-800 outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </label>
                        <label className="space-y-1.5 text-sm font-medium text-gray-700">
                            Escala contenido (%)
                            <input
                                type="number"
                                min="25"
                                max="300"
                                step="5"
                                value={contentScalePercent}
                                onChange={(event) => {
                                    setContentScalePercent(Number(event.target.value));
                                    setPdfUrl(null);
                                }}
                                className="w-full rounded-md border px-3 py-2 text-gray-800 outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </label>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                        <span>Escalas rápidas:</span>
                        {[100, 125, 150, 160, 200].map((scale) => (
                            <button
                                key={scale}
                                type="button"
                                onClick={() => {
                                    setContentScalePercent(scale);
                                    setPdfUrl(null);
                                }}
                                className={`rounded border px-2 py-1 transition ${
                                    contentScalePercent === scale
                                        ? 'border-blue-300 bg-blue-50 font-semibold text-blue-700'
                                        : 'bg-white hover:bg-gray-50'
                                }`}
                            >
                                {scale} %
                            </button>
                        ))}
                    </div>

                    <label className="block space-y-2 text-sm font-medium text-gray-700">
                        Cargar archivo ZPL
                        <input
                            type="file"
                            accept=".txt,text/plain"
                            onChange={handleFile}
                            className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
                        />
                    </label>

                    <label className="block space-y-2 text-sm font-medium text-gray-700">
                        Código ZPL
                        <textarea
                            value={zpl}
                            onChange={(event) => {
                                setZpl(event.target.value);
                                setPdfUrl(null);
                            }}
                            spellCheck={false}
                            rows={16}
                            className="w-full resize-y rounded-md border bg-gray-950 p-4 font-mono text-sm text-green-300 outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="^XA ... ^XZ"
                        />
                    </label>

                    {analysis.summary && (
                        <div className="grid grid-cols-3 gap-3 rounded-md border bg-gray-50 p-4 text-center">
                            <div>
                                <p className="text-xl font-bold text-gray-800">{analysis.summary.definitionCount}</p>
                                <p className="text-xs text-gray-500">diseños</p>
                            </div>
                            <div className="border-x">
                                <p className="text-xl font-bold text-gray-800">{analysis.summary.totalLabelCount}</p>
                                <p className="text-xs text-gray-500">etiquetas</p>
                            </div>
                            <div>
                                <p className="text-xl font-bold text-gray-800">{analysis.summary.batchCount}</p>
                                <p className="text-xs text-gray-500">lotes</p>
                            </div>
                        </div>
                    )}

                    {analysis.error && (
                        <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-700">{analysis.error}</p>
                    )}

                    {error && <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

                    <div className="flex flex-wrap gap-3">
                        <button
                            type="button"
                            onClick={generatePreview}
                            disabled={
                                loading ||
                                !analysis.summary ||
                                widthMm <= 0 ||
                                heightMm <= 0 ||
                                contentScalePercent < 25 ||
                                contentScalePercent > 300
                            }
                            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {loading && analysis.summary
                                ? `Generando PDF de ${analysis.summary.totalLabelCount} etiquetas…`
                                : 'Generar preview'}
                        </button>
                        <button
                            type="button"
                            onClick={printLabel}
                            disabled={!pdfUrl || loading}
                            className="rounded-md bg-gray-800 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            Imprimir
                        </button>
                    </div>
                </section>

                <section className="flex min-h-[620px] flex-col overflow-hidden rounded-lg border bg-white shadow-sm">
                    <div className="border-b bg-gray-50 px-5 py-4">
                        <h2 className="font-semibold text-gray-700">Preview PDF</h2>
                        <p className="mt-1 text-xs text-gray-500">
                            Papel {widthMm || 0} × {heightMm || 0} mm · contenido {contentScalePercent || 0} % · impresión 100 %.
                        </p>
                    </div>
                    {pdfUrl ? (
                        <iframe title="Vista previa de la etiqueta" src={pdfUrl} className="min-h-[560px] flex-1 bg-gray-100" />
                    ) : (
                        <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-gray-400">
                            Genera un preview para ver aquí la etiqueta renderizada.
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
