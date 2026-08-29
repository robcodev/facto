import { ApiError, GoogleGenAI, Type } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
        timeout: 15_000,
        // Evita que los reintentos internos del SDK agoten la duración de Vercel.
        retryOptions: { attempts: 1 },
    },
});

const MAX_FILES = 10;
const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_SIZE_BYTES = 4 * 1024 * 1024;
const TRANSIENT_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const MODEL_ATTEMPTS = [
    'gemini-3.1-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash-lite',
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
    return error instanceof ApiError ? error.status : 500;
}

function publicErrorMessage(status: number, error: unknown) {
    if (status === 503) {
        return 'El servicio de IA está temporalmente saturado. Intenta nuevamente en unos segundos.';
    }

    if (status === 429) {
        return 'El servicio de IA recibió demasiadas solicitudes. Espera unos segundos e inténtalo nuevamente.';
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

        const mediaParts = await Promise.all(
            files.map(async (file) => ({
                inlineData: {
                    mimeType: file.type,
                    data: Buffer.from(await file.arrayBuffer()).toString('base64'),
                },
            }))
        );

        const promptText = `Analiza los archivos adjuntos de la factura de compra (pueden ser una o más páginas).
Extrae todos los ítems de forma consolidada en un único listado.

REGLAS CRÍTICAS DE EXTRACCIÓN:
1. Para cada producto, identifica la cantidad y el monto TOTAL NETO del ítem en esa línea.
2. Calcula matemáticamente el 'netUnitValue' dividiendo el Total Neto por la Cantidad (Total Neto / Cantidad).
   Este valor DEBE ser el costo unitario real con todos los descuentos ya restados/aplicados.
3. Captura el número de la factura. Si contiene letras o caracteres no numéricos, extrae SOLO los dígitos numéricos.`;

        let lastError: unknown;

        for (let attempt = 0; attempt < MODEL_ATTEMPTS.length; attempt += 1) {
            const model = MODEL_ATTEMPTS[attempt];

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
                                    description: 'Número de la factura conteniendo únicamente dígitos numéricos',
                                },
                                invoiceItems: {
                                    type: Type.ARRAY,
                                    items: {
                                        type: Type.OBJECT,
                                        properties: {
                                            code: { type: Type.STRING, description: 'Código único o SKU del producto' },
                                            quantity: { type: Type.INTEGER, description: 'Cantidad de unidades' },
                                            netUnitValue: {
                                                type: Type.INTEGER,
                                                description: 'Valor unitario neto real final, con descuentos aplicados',
                                            },
                                            totalNet: { type: Type.INTEGER, description: 'Monto total neto final de la línea' },
                                        },
                                        required: ['code', 'quantity', 'netUnitValue', 'totalNet'],
                                    },
                                },
                            },
                            required: ['invoiceItems', 'documentNumber'],
                        },
                    },
                });

                if (!response.text) throw new Error('La IA no devolvió respuesta');
                return NextResponse.json(JSON.parse(response.text));
            } catch (error) {
                lastError = error;
                const status = getErrorStatus(error);
                const hasAnotherAttempt = attempt < MODEL_ATTEMPTS.length - 1;

                console.error(`Error procesando factura con ${model} (intento ${attempt + 1}):`, error);

                if (!hasAnotherAttempt || !TRANSIENT_STATUS_CODES.has(status)) throw error;

                const baseDelay = attempt === 0 ? 1_000 : 2_500;
                await wait(baseDelay + Math.floor(Math.random() * 500));
            }
        }

        throw lastError ?? new Error('No fue posible procesar la factura.');
    } catch (error) {
        console.error('Error procesando factura con IA:', error);
        const upstreamStatus = getErrorStatus(error);
        const responseStatus = TRANSIENT_STATUS_CODES.has(upstreamStatus) ? upstreamStatus : 500;

        return NextResponse.json(
            { error: publicErrorMessage(upstreamStatus, error) },
            { status: responseStatus }
        );
    }
}
