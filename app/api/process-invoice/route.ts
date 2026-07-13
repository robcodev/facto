import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';

export const maxDuration = 60; // Le da hasta 60 segundos a la función para responder

//export const runtime = 'edge'; // Usa la infraestructura Edge que no tiene el límite de 10 segundos

// Forzamos el Edge Runtime para evitar el límite de 10 segundos de Vercel (Hobby)
export const runtime = 'edge';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        // Capturamos todos los archivos bajo la llave 'files' (soporte multipágina)
        const files = formData.getAll('files') as File[];

        if (!files || files.length === 0) {
            return NextResponse.json({ error: 'No se subieron archivos' }, { status: 400 });
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
            model: 'gemini-2.5-flash',
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
                                    sku: { type: Type.STRING, description: 'Código único o SKU del producto' },
                                    quantity: { type: Type.INTEGER, description: 'Cantidad de unidades' },
                                    netUnitValue: { type: Type.INTEGER, description: 'Valor unitario neto REAL final (Total Neto / Cantidad), con descuentos aplicados.' },
                                    totalNet: { type: Type.INTEGER, description: 'Monto total neto final de la línea' },
                                },
                                required: ['sku', 'quantity', 'netUnitValue', 'totalNet'],
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
    } catch (error: any) {
        console.error('Error procesando factura con IA:', error);
        return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
    }
}