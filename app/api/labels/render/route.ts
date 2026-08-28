import { NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import { scaleZplContent, setLabelSize, splitZplIntoBatches, summarizeZpl } from '@/lib/zpl/parser';
import type { RenderLabelRequest } from '@/app/labels/types';

const MILLIMETERS_PER_INCH = 25.4;
const MAX_ZPL_LENGTH = 1_000_000;
const MAX_TOTAL_LABELS = 2_000;
const MIN_REQUEST_INTERVAL_MS = 350;
const MAX_RATE_LIMIT_RETRIES = 3;

export const maxDuration = 60;

class LabelaryError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
    }
}

function wait(milliseconds: number) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryDelay(response: Response) {
    const retryAfter = response.headers.get('Retry-After');
    if (!retryAfter) return 1_000;

    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);

    const date = Date.parse(retryAfter);
    return Number.isNaN(date) ? 1_000 : Math.max(0, date - Date.now());
}

async function mergePdfs(pdfs: ArrayBuffer[]) {
    const merged = await PDFDocument.create();

    for (const pdf of pdfs) {
        const source = await PDFDocument.load(pdf);
        const pages = await merged.copyPages(source, source.getPageIndices());
        pages.forEach((page) => merged.addPage(page));
    }

    const bytes = await merged.save();
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function POST(request: Request) {
    try {
        const body = (await request.json()) as Partial<RenderLabelRequest>;
        const zpl = typeof body.zpl === 'string' ? body.zpl.trim() : '';
        const widthMm = Number(body.widthMm);
        const heightMm = Number(body.heightMm);
        const contentScalePercent = Number(body.contentScalePercent ?? 100);

        if (!zpl) {
            return NextResponse.json({ error: 'Debes ingresar código ZPL.' }, { status: 400 });
        }

        if (zpl.length > MAX_ZPL_LENGTH) {
            return NextResponse.json({ error: 'El código ZPL supera el tamaño permitido.' }, { status: 413 });
        }

        if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm) || widthMm <= 0 || heightMm <= 0) {
            return NextResponse.json({ error: 'El ancho y el alto deben ser mayores que cero.' }, { status: 400 });
        }

        if (!Number.isFinite(contentScalePercent) || contentScalePercent < 25 || contentScalePercent > 300) {
            return NextResponse.json({ error: 'La escala del contenido debe estar entre 25 % y 300 %.' }, { status: 400 });
        }

        const summary = summarizeZpl(zpl);
        if (summary.totalLabelCount > MAX_TOTAL_LABELS) {
            return NextResponse.json(
                { error: `Este trabajo contiene ${summary.totalLabelCount} etiquetas. El máximo por operación es ${MAX_TOTAL_LABELS}.` },
                { status: 413 }
            );
        }

        const scaledZpl = scaleZplContent(zpl, contentScalePercent);
        const sizedZpl = setLabelSize(scaledZpl, widthMm, heightMm);
        const batches = splitZplIntoBatches(sizedZpl);
        const widthInches = (widthMm / MILLIMETERS_PER_INCH).toFixed(4);
        const heightInches = (heightMm / MILLIMETERS_PER_INCH).toFixed(4);
        const labelaryUrl = `https://api.labelary.com/v1/printers/12dpmm/labels/${widthInches}x${heightInches}/`;
        const renderedBatches: ArrayBuffer[] = [];
        let lastRequestStartedAt = 0;

        for (const batch of batches) {
            let retries = 0;

            while (true) {
                const elapsed = Date.now() - lastRequestStartedAt;
                if (elapsed < MIN_REQUEST_INTERVAL_MS) await wait(MIN_REQUEST_INTERVAL_MS - elapsed);
                lastRequestStartedAt = Date.now();

                const labelaryResponse = await fetch(labelaryUrl, {
                    method: 'POST',
                    headers: {
                        Accept: 'application/pdf',
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: batch.zpl,
                    cache: 'no-store',
                });

                if (labelaryResponse.ok) {
                    renderedBatches.push(await labelaryResponse.arrayBuffer());
                    break;
                }

                if (labelaryResponse.status === 429 && retries < MAX_RATE_LIMIT_RETRIES) {
                    retries += 1;
                    await wait(Math.min(retryDelay(labelaryResponse), 10_000));
                    continue;
                }

                const detail = (await labelaryResponse.text()).trim();
                throw new LabelaryError(detail || 'Labelary no pudo renderizar la etiqueta.', labelaryResponse.status);
            }
        }

        const pdf = renderedBatches.length === 1 ? renderedBatches[0] : await mergePdfs(renderedBatches);

        return new Response(pdf, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'inline; filename="etiquetas.pdf"',
                'Cache-Control': 'no-store',
                'X-Label-Count': String(summary.totalLabelCount),
                'X-Label-Batch-Count': String(summary.batchCount),
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No fue posible generar la etiqueta.';
        const status = error instanceof LabelaryError ? error.status : 500;
        return NextResponse.json({ error: message }, { status });
    }
}
