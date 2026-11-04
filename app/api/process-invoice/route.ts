import { ApiError, GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_FILES = 10;
const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_SIZE_BYTES = 4 * 1024 * 1024;
// Leave time to return a controlled error before Vercel ends the function.
const PROCESSING_BUDGET_MS = 105_000;
const TRANSIENT_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const MODEL_ATTEMPTS = [
    { model: 'gemini-3.8-flash', timeout: 70_000 },
    { model: 'gemini-3.7-flash', timeout: 30_000 },
] as const;
const ALLOWED_MIME_TYPES = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
]);

function wait(milliseconds: number) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function getErrorStatus(error: unknown) {
    const record = error && typeof error === 'object' ? error as Record<string, unknown> : null;
    const directStatus = error instanceof ApiError
        ? Number(error.status)
        : Number(record?.status ?? record?.statusCode ?? record?.code);
    if (Number.isInteger(directStatus) && directStatus >= 400 && directStatus <= 599) return directStatus;

    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError' || Number(record?.code) === 20)) return 504;
    if (message.includes('forbidden') || message.includes('permission_denied') || message.includes('permission denied')) return 403;
    if (message.includes('too many requests') || message.includes('resource_exhausted')) return 429;
    if (message.includes('service unavailable') || message.includes('unavailable')) return 503;
    if (message.includes('aborted') || message.includes('aborterror')) return 504;
    if (message.includes('timeout') || message.includes('timed out')) return 504;
    return 500;
}

class InvoiceResponseError extends Error {
    readonly status = 422;
}

type InvoiceItem = {
    code: string;
    quantity: number;
    netUnitValue: number;
    totalNet: number;
};

function normalizeAiResponse(text: string) {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new InvoiceResponseError('La IA devolvió una respuesta que no se pudo interpretar. Intenta nuevamente.');
    }

    if (!parsed || typeof parsed !== 'object') {
        throw new InvoiceResponseError('La IA devolvió una respuesta vacía o inválida.');
    }

    const data = parsed as Record<string, unknown>;
    const rawItems = Array.isArray(data.invoiceItems) ? data.invoiceItems : [];
    const invoiceItems: InvoiceItem[] = rawItems.map((rawItem, index) => {
        if (!rawItem || typeof rawItem !== 'object') throw new InvoiceResponseError(`El producto ${index + 1} tiene un formato inválido.`);
        const item = rawItem as Record<string, unknown>;
        const code = String(item.code ?? '').trim();
        const quantity = Number(item.quantity);
        const totalNet = Number(item.totalNet);
        const netUnitValue = totalNet / quantity;

        if (!code) throw new InvoiceResponseError(`La IA no identificó el SKU del producto ${index + 1}.`);
        if (!Number.isInteger(quantity) || quantity <= 0) throw new InvoiceResponseError(`La cantidad del SKU ${code} es inválida.`);
        if (item.totalNet === null || item.totalNet === undefined || item.totalNet === '' || !Number.isFinite(totalNet) || totalNet < 0) throw new InvoiceResponseError(`El total neto del SKU ${code} es inválido.`);
        if (!Number.isFinite(netUnitValue) || netUnitValue < 0) throw new InvoiceResponseError(`El costo unitario del SKU ${code} es inválido.`);

        return { code, quantity, totalNet, netUnitValue };
    });

    if (invoiceItems.length === 0) throw new InvoiceResponseError('La IA no encontró productos en el documento.');

    return {
        documentNumber: String(data.documentNumber ?? '').replace(/\D/g, ''),
        invoiceItems,
    };
}

function normalizeCatalogResponse(text: string) {
    let data: Record<string, unknown>;
    try { data = JSON.parse(text); } catch { throw new InvoiceResponseError('No pudimos interpretar la propuesta de productos.'); }
    if (!data || typeof data !== 'object' || !Array.isArray(data.invoiceItems) || !data.invoiceItems.length) throw new InvoiceResponseError('No encontramos productos en el documento.');
    if (data.hasMoreItems === true || data.invoiceItems.length > 200) throw new InvoiceResponseError('El documento supera 200 variantes. Divídelo antes de continuar.');
    const amount = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
    const catalogItems = data.invoiceItems.map(value => {
        if (!value || typeof value !== 'object') throw new InvoiceResponseError('Una fila del documento tiene un formato inválido.');
        const row = value as Record<string, unknown>, quantity = amount(row.quantity), total = amount(row.totalNet), price = amount(row.salePrice);
        return { code: String(row.code ?? '').trim(), productName: String(row.productName ?? '').trim(), variantName: String(row.variantName ?? '').trim(), quantity,
            cost: total !== null && quantity !== null && quantity > 0 ? total / quantity : amount(row.netUnitValue),
            priceGross: price === null || typeof row.salePriceIncludesVat !== 'boolean' ? null : row.salePriceIncludesVat ? price : Math.round(price * 1.19) };
    });
    return { documentNumber: String(data.documentNumber ?? '').replace(/\D/g, ''), catalogItems };
}

function publicErrorMessage(status: number, error: unknown) {
    if (status === 403) {
        return 'El proyecto asociado a GEMINI_API_KEY no tiene permiso para generar contenido. Configura otra clave habilitada o solicita acceso a Google AI.';
    }
    if (status === 503) {
        return 'Gemini está temporalmente no disponible. Intenta nuevamente en unos segundos.';
    }
    if (status === 429) {
        return 'Gemini recibió demasiadas solicitudes o alcanzó su cuota. Espera unos segundos e inténtalo nuevamente.';
    }
    if (status === 408 || status === 504) {
        return 'El procesamiento del documento tardó demasiado. Intenta nuevamente.';
    }
    return error instanceof Error ? error.message : 'Error interno procesando el documento.';
}

export async function POST(req: NextRequest) {
    const startedAt = Date.now();
    try {
        const formData = await req.formData();
        const entries = formData.getAll('files');

        if (entries.length === 0) {
            return NextResponse.json({ error: 'No se subieron archivos' }, { status: 400 });
        }
        if (entries.length > MAX_FILES) {
            return NextResponse.json(
                { error: `Puedes subir un máximo de ${MAX_FILES} archivos por documento.` },
                { status: 400 }
            );
        }
        if (entries.some((entry) => !(entry instanceof File))) {
            return NextResponse.json({ error: 'La solicitud contiene datos que no son archivos.' }, { status: 400 });
        }

        const files = entries as File[];
        const unsupportedFile = files.find((file) => !ALLOWED_MIME_TYPES.has(file.type.toLowerCase()));
        if (unsupportedFile) {
            return NextResponse.json(
                { error: `El archivo "${unsupportedFile.name}" no es una imagen compatible ni un PDF.` },
                { status: 415 }
            );
        }

        const oversizedFile = files.find((file) => file.size > MAX_FILE_SIZE_BYTES);
        if (oversizedFile) {
            return NextResponse.json(
                { error: `El archivo "${oversizedFile.name}" supera el máximo de 4 MB permitido para la subida.` },
                { status: 413 }
            );
        }

        const totalSize = files.reduce((total, file) => total + file.size, 0);
        if (totalSize > MAX_TOTAL_SIZE_BYTES) {
            return NextResponse.json(
                { error: 'El conjunto de archivos supera el máximo total de 4 MB permitido para la subida.' },
                { status: 413 }
            );
        }

        if (!process.env.GEMINI_API_KEY?.trim()) {
            return NextResponse.json({ error: 'Falta configurar GEMINI_API_KEY en el servidor.' }, { status: 503 });
        }

        const mediaParts = await Promise.all(files.map(async (file) => ({
            inlineData: {
                mimeType: file.type,
                data: Buffer.from(await file.arrayBuffer()).toString('base64'),
            },
        })));

        const requestedDocumentType = ['FACTURA', 'GUÍA', 'OTRO'].includes(String(formData.get('documentType')))
            ? String(formData.get('documentType')).toLocaleLowerCase('es-CL')
            : 'factura';
        const catalogMode = formData.get('mode') === 'catalog';
        const promptText = catalogMode ? `Lee el documento y propone productos padre y variantes para una revisión humana antes de crear un catálogo en Bsale.
Cada SKU corresponde a una variante. Variantes del mismo modelo pueden compartir productName y diferir en variantName (talla, color, tamaño o presentación). No agrupes modelos distintos. Si no puedes separar el nombre, conserva la descripción completa en productName y deja variantName vacío para revisión; no inventes variantes.
Conserva cada SKU como texto, incluidos ceros iniciales. Si falta SKU, cantidad, costo o precio, devuelve null para números y cadena vacía para textos. Nunca inventes costos, cantidades ni precios. La cantidad es la cantidad a recepcionar, no dimensiones o capacidad del producto.
Extrae costo unitario NETO en netUnitValue o total NETO final de la línea en totalNet cuando estén claramente identificados, después de los descuentos de esa línea. Un precio de venta no es un costo. No confundas el total de la factura con el total de una línea.
Devuelve salePrice únicamente si hay un precio de VENTA explícito. salePriceIncludesVat será true si incluye IVA, false si el documento dice que es neto, y null si no está aclarado. No calcules ni sugieras márgenes.
Lee todas las páginas. Devuelve como máximo 200 filas; si hay más, hasMoreItems=true. Devuelve solo el JSON solicitado.` : `Analiza los archivos adjuntos del documento de compra seleccionado como “${requestedDocumentType}” (pueden ser una o más páginas).
Extrae todos los ítems de forma consolidada en un único listado.

REGLAS CRÍTICAS DE EXTRACCIÓN:
1. Para cada producto, identifica la cantidad y el monto TOTAL NETO del ítem en esa línea.
2. Extrae el total neto final de cada línea con sus descuentos ya aplicados. No calcules costos unitarios: el servidor hará esa división.
3. Captura el número del documento. Si contiene letras u otros caracteres, devuelve solamente sus dígitos.
4. Devuelve únicamente el JSON solicitado, sin explicaciones ni cálculos intermedios. Incluye las líneas de todas las páginas y conserva cada SKU como texto.`;

        let lastError: unknown;

        for (let attempt = 0; attempt < MODEL_ATTEMPTS.length; attempt += 1) {
            const { model } = MODEL_ATTEMPTS[attempt];
            const remaining = PROCESSING_BUDGET_MS - (Date.now() - startedAt);
            if (remaining < 2_000 || req.signal.aborted) throw lastError ?? new DOMException('El análisis superó su tiempo disponible.', 'TimeoutError');
            const timeout = Math.min(MODEL_ATTEMPTS[attempt].timeout, remaining);
            const ai = new GoogleGenAI({
                apiKey: process.env.GEMINI_API_KEY,
                httpOptions: {
                    timeout,
                    retryOptions: { attempts: 1 },
                },
            });

            try {
                const response = await ai.models.generateContent({
                    model,
                    contents: [...mediaParts, promptText],
                    config: {
                        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW, includeThoughts: false },
                        abortSignal: AbortSignal.any([req.signal, AbortSignal.timeout(timeout)]),
                        responseMimeType: 'application/json',
                        ...(catalogMode ? { responseJsonSchema: {
                            type: 'object',
                            properties: {
                                documentNumber: { type: 'string' }, hasMoreItems: { type: 'boolean' },
                                invoiceItems: { type: 'array', items: {
                                    type: 'object', properties: {
                                        code: { type: 'string' }, productName: { type: 'string' }, variantName: { type: 'string' },
                                        quantity: { type: ['number', 'null'] }, netUnitValue: { type: ['number', 'null'] }, totalNet: { type: ['number', 'null'] },
                                        salePrice: { type: ['number', 'null'] }, salePriceIncludesVat: { type: ['boolean', 'null'] },
                                    }, required: ['code', 'productName', 'variantName', 'quantity', 'netUnitValue', 'totalNet', 'salePrice', 'salePriceIncludesVat'],
                                } },
                            }, required: ['documentNumber', 'hasMoreItems', 'invoiceItems'],
                        } } : { responseSchema: {
                            type: Type.OBJECT,
                            properties: {
                                documentNumber: {
                                    type: Type.STRING,
                                    description: 'Número del documento conteniendo únicamente dígitos',
                                },
                                invoiceItems: {
                                    type: Type.ARRAY,
                                    items: {
                                        type: Type.OBJECT,
                                        properties: {
                                            code: { type: Type.STRING, description: 'Código único o SKU del producto' },
                                            quantity: { type: Type.INTEGER, description: 'Cantidad de unidades' },
                                            totalNet: { type: Type.NUMBER, description: 'Monto total neto final de la línea' },
                                        },
                                        required: ['code', 'quantity', 'totalNet'],
                                    },
                                },
                            },
                            required: ['invoiceItems', 'documentNumber'],
                        } }),
                    },
                });

                if (response.candidates?.some(candidate => candidate.finishReason === 'MAX_TOKENS')) {
                    throw new InvoiceResponseError('La respuesta quedó incompleta. Divide el documento en grupos de páginas más pequeños e intenta nuevamente.');
                }
                if (!response.text) throw new InvoiceResponseError('La IA no devolvió productos legibles. Revisa la claridad del documento e intenta nuevamente.');
                const result = catalogMode ? normalizeCatalogResponse(response.text) : normalizeAiResponse(response.text);
                console.info('Documento leído con IA', { model, attempt: attempt + 1, elapsedMs: Date.now() - startedAt, files: files.length, items: 'invoiceItems' in result ? result.invoiceItems.length : result.catalogItems.length });
                return NextResponse.json(result);
            } catch (error) {
                lastError = error;
                const status = getErrorStatus(error);
                const hasAnotherAttempt = attempt < MODEL_ATTEMPTS.length - 1;

                console.error('Error leyendo documento con IA', { model, attempt: attempt + 1, status, elapsedMs: Date.now() - startedAt });
                if (!hasAnotherAttempt || !TRANSIENT_STATUS_CODES.has(status) || req.signal.aborted) throw error;
                await wait(1_000 + Math.floor(Math.random() * 300));
            }
        }

        throw lastError ?? new Error('No fue posible procesar el documento.');
    } catch (error) {
        const upstreamStatus = getErrorStatus(error);
        console.error('No se pudo leer el documento con IA', { status: upstreamStatus, elapsedMs: Date.now() - startedAt });
        const responseStatus = upstreamStatus >= 400 && upstreamStatus < 500
            ? upstreamStatus
            : TRANSIENT_STATUS_CODES.has(upstreamStatus) ? upstreamStatus : 500;

        return NextResponse.json(
            { error: publicErrorMessage(upstreamStatus, error) },
            { status: responseStatus }
        );
    }
}
