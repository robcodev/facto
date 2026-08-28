import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';

export const maxDuration = 60; // Le da hasta 60 segundos a la función para responder

export const runtime = 'edge';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MAX_FILES = 10;
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_SIZE_BYTES = 50 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
]);

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        // Capturamos todos los archivos bajo la llave 'files' (soporte multipágina)
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
                { error: `El archivo "${oversizedFile.name}" supera el máximo de 20 MB.` },
                { status: 413 }
            );
        }

        const totalSize = files.reduce((total, file) => total + file.size, 0);
        if (totalSize > MAX_TOTAL_SIZE_BYTES) {
            return NextResponse.json(
                { error: 'El conjunto de archivos supera el máximo total de 50 MB.' },
                { status: 413 }
            );
        }

        // Convertimos cada archivo a la estructura que exige el SDK de Gemini de forma compatible con Edge (Sin Buffer de Node)
        const mediaParts = await Promise.all(
            files.map(async (file) => {
                const arrayBuffer = await file.arrayBuffer();

                const uint8Array = new Uint8Array(arrayBuffer);
                let binary = '';
                const len = uint8Array.byteLength;
                for (let i = 0; i < len; i++) {
                    binary += String.fromCharCode(uint8Array[i]);
                }
                const base64Data = btoa(binary);

                return {
                    inlineData: {
                        mimeType: file.type,
                        data: base64Data,
                    },
                };
            })
        );

        // Prompt estricto con las reglas de negocio
        const promptText = `Analiza los archivos adjuntos de la factura de compra (pueden ser una o más páginas). 
     Extrae todos los ítems de forma consolidada en un único listado.
     
     REGLAS CRÍTICAS DE EXTRACCIÓN:
     1. Para cada producto, identifica la cantidad y el monto TOTAL NETO del ítem en esa línea.
     2. Calcula matemáticamente el 'netUnitValue' dividiendo el Total Neto por la Cantidad (Total Neto / Cantidad). 
        Este valor DEBE ser el costo unitario real con todos los descuentos ya restados/aplicados.
     3. Captura el número de la factura. Si contiene letras o caracteres no numéricos, extrae SOLO los dígitos numéricos.`;

        const response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            // Pasamos todas las imágenes y el prompt en el mismo arreglo de contenidos
            contents: [...mediaParts, promptText],
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        // TODO adicional: Ahora la IA también nos extrae el número de factura limpio de raíz
                        documentNumber: { type: Type.STRING, description: 'Número de la factura conteniendo únicamente dígitos numéricos' },
                        invoiceItems: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    code: { type: Type.STRING, description: 'Código único o SKU del producto' },
                                    quantity: { type: Type.INTEGER, description: 'Cantidad de unidades' },
                                    netUnitValue: { type: Type.INTEGER, description: 'Valor unitario neto REAL final (Total Neto / Cantidad), con descuentos aplicados.' },
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

        const resultText = response.text;
        if (!resultText) throw new Error('La IA no devolvió respuesta');

        return NextResponse.json(JSON.parse(resultText));
    } catch (error) {
        console.error('Error procesando factura con IA:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Error interno' },
            { status: 500 }
        );
    }
}
