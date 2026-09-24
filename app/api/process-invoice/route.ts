import { ApiError, GoogleGenAI, Type } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_FILES = 10;
const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_SIZE_BYTES = 4 * 1024 * 1024;
const TRANSIENT_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const MODEL_ATTEMPTS = [
    { model: 'gemini-3.8-flash', timeout: 36_000 },
    { model: 'gemini-3.7-flash', timeout: 18_000 },
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
    if (error instanceof Error && (error.name === 'AbortError' || Number(record?.code) === 20)) return 504;
    if (message.includes('forbidden') || message.includes('permission_denied') || message.includes('permission denied')) return 403;
    if (message.includes('too many requests') || message.includes('resource_exhausted')) return 429;
    if (message.includes('service unavailable') || message.includes('unavailable')) return 503;
    if (message.includes('aborted') || message.includes('aborterror')) return 504;
    if (message.includes('timeout') || message.includes('timed out')) return 504;
    return 500;
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
        throw new Error('La IA devolvió una respuesta que no se pudo interpretar. Intenta nuevamente.');
    }

    if (!parsed || typeof parsed !== 'object') {
        throw new Error('La IA devolvió una respuesta vacía o inválida.');
    }

    const data = parsed as Record<string, unknown>;
    const rawItems = Array.isArray(data.invoiceItems) ? data.invoiceItems : [];
    const invoiceItems: InvoiceItem[] = rawItems.map((rawItem, index) => {
        if (!rawItem || typeof rawItem !== 'object') throw new Error(`El producto ${index + 1} tiene un formato inválido.`);
        const item = rawItem as Record<string, unknown>;
        const code = String(item.code ?? '').trim();
        const quantity = Number(item.quantity);
        const totalNet = Number(item.totalNet);
        const extractedUnitValue = Number(item.netUnitValue);
        const netUnitValue = Number.isFinite(totalNet) && Number.isFinite(quantity) && quantity > 0
            ? totalNet / quantity
            : extractedUnitValue;

        if (!code) throw new Error(`La IA no identificó el SKU del producto ${index + 1}.`);
        if (!Number.isInteger(quantity) || quantity <= 0) throw new Error(`La cantidad del SKU ${code} es inválida.`);
        if (!Number.isFinite(totalNet) || totalNet < 0) throw new Error(`El total neto del SKU ${code} es inválido.`);
        if (!Number.isFinite(netUnitValue) || netUnitValue < 0) throw new Error(`El costo unitario del SKU ${code} es inválido.`);

        return { code, quantity, totalNet, netUnitValue };
    });

    if (invoiceItems.length === 0) throw new Error('La IA no encontró productos en la factura.');

    return {
        documentNumber: String(data.documentNumber ?? '').replace(/\D/g, ''),
        invoiceItems,
    };
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
        return 'El procesamiento de la factura tardó demasiado. Intenta nuevamente.';
    }
    return error instanceof Error ? error.message : 'Error interno procesando la factura.';
}

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const entries = formData.getAll('files');

        if (entries.length === 0) {
            return NextResponse.json({ error: 'No se subieron archivos' }, { status: 400 });
        }
        if (entries.length > MAX_FILES) {
            return NextResponse.json(
                { error: `Puedes subir un máximo de ${MAX_FILES} archivos por factura.` },
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

        const mediaParts = await Promise.all(files.map(async (file) => ({
            inlineData: {
                mimeType: file.type,
                data: Buffer.from(await file.arrayBuffer()).toString('base64'),
            },
        })));

        const promptText = `Analiza los archivos adjuntos de la factura de compra (pueden ser una o más páginas).
Extrae todos los ítems de forma consolidada en un único listado.

REGLAS CRÍTICAS DE EXTRACCIÓN:
1. Para cada producto, identifica la cantidad y el monto TOTAL NETO del ítem en esa línea.
2. Calcula matemáticamente netUnitValue dividiendo el Total Neto por la Cantidad (Total Neto / Cantidad).
   Este valor debe ser el costo unitario real con todos los descuentos ya aplicados.
3. Captura el número de la factura. Si contiene letras u otros caracteres, devuelve solamente sus dígitos.`;

        let lastError: unknown;

        for (let attempt = 0; attempt < MODEL_ATTEMPTS.length; attempt += 1) {
            const { model, timeout } = MODEL_ATTEMPTS[attempt];
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
                        responseMimeType: 'application/json',
                        responseSchema: {
                            type: Type.OBJECT,
                            properties: {
                                documentNumber: {
                                    type: Type.STRING,
                                    description: 'Número de la factura conteniendo únicamente dígitos',
                                },
                                invoiceItems: {
                                    type: Type.ARRAY,
                                    items: {
                                        type: Type.OBJECT,
                                        properties: {
                                            code: { type: Type.STRING, description: 'Código único o SKU del producto' },
                                            quantity: { type: Type.INTEGER, description: 'Cantidad de unidades' },
                                            netUnitValue: { type: Type.NUMBER, description: 'Valor unitario neto final' },
                                            totalNet: { type: Type.NUMBER, description: 'Monto total neto final de la línea' },
                                        },
                                        required: ['code', 'quantity', 'netUnitValue', 'totalNet'],
                                    },
                                },
                            },
                            required: ['invoiceItems', 'documentNumber'],
                        },
                    },
                });

                if (!response.text) throw new Error('La IA no devolvió respuesta.');
                return NextResponse.json(normalizeAiResponse(response.text));
            } catch (error) {
                lastError = error;
                const status = getErrorStatus(error);
                const hasAnotherAttempt = attempt < MODEL_ATTEMPTS.length - 1;

                console.error(`Error procesando factura con ${model} (intento ${attempt + 1}):`, error);
                if (!hasAnotherAttempt || !TRANSIENT_STATUS_CODES.has(status)) throw error;
                await wait(1_000 + Math.floor(Math.random() * 300));
            }
        }

        throw lastError ?? new Error('No fue posible procesar la factura.');
    } catch (error) {
        console.error('Error procesando factura con IA:', error);
        const upstreamStatus = getErrorStatus(error);
        const responseStatus = upstreamStatus >= 400 && upstreamStatus < 500
            ? upstreamStatus
            : TRANSIENT_STATUS_CODES.has(upstreamStatus) ? upstreamStatus : 500;

        return NextResponse.json(
            { error: publicErrorMessage(upstreamStatus, error) },
            { status: responseStatus }
        );
    }
}
