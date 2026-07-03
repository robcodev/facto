import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';

// Inicializa el SDK con tu clave de entorno
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json({ error: 'No se subió ningún archivo' }, { status: 400 });
        }

        // Convertir el archivo a Buffer y luego a Base64 para que Gemini lo procese
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const base64Data = buffer.toString('base64');

        // Llamamos al modelo multimodal (gemini-2.5-flash es ideal para velocidad y OCR)
        // ... (Código anterior de base64 y buffer se mantiene igual)

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
                {
                    inlineData: {
                        mimeType: file.type,
                        data: base64Data,
                    },
                },
                `Analiza esta imagen de factura de compra. Extrae todos los ítems listados. 
     REGLA CRÍTICA PARA EL COSTO: Para cada producto, identifica la cantidad y el monto TOTAL NETO del ítem. 
     Calcula matemáticamente el 'netUnitValue' dividiendo el Total Neto por la Cantidad (Total Neto / Cantidad). 
     Este valor DEBE ser el costo unitario real con todos los descuentos ya restados/aplicados.`,
            ],
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        invoiceItems: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    sku: { type: Type.STRING, description: 'Código único o SKU del producto' },
                                    quantity: { type: Type.INTEGER, description: 'Cantidad de unidades' },
                                    // Cambiamos la descripción para guiar el comportamiento de la IA
                                    netUnitValue: {
                                        type: Type.INTEGER,
                                        description: 'Valor unitario neto REAL final, calculado como (Total Neto del ítem / Cantidad), es decir, con los descuentos ya aplicados.'
                                    },
                                    totalNet: { type: Type.INTEGER, description: 'Monto total neto final de la línea' },
                                },
                                required: ['sku', 'quantity', 'netUnitValue', 'totalNet'],
                            },
                        },
                    },
                    required: ['invoiceItems'],
                },
            },
        });

        const jsonText = response.text;
        if (!jsonText) {
            throw new Error('La IA no devolvió un texto procesable.');
        }

        // Retornamos el JSON limpio directo a nuestra interfaz de Next.js
        const extractedData = JSON.parse(jsonText);
        return NextResponse.json(extractedData);

    } catch (error: any) {
        console.error('Error al procesar factura con Gemini:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}