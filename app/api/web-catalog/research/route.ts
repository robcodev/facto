import { GoogleGenAI, Type } from '@google/genai';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const requestSchema = z.object({
    productId: z.number().int().positive(), productName: z.string().trim().min(2).max(240),
    brandName: z.string().trim().max(160), productTypeName: z.string().trim().max(160),
    currentDescription: z.string().max(30_000),
    variants: z.array(z.object({ id: z.number().int().positive(), sku: z.string().trim().max(100), name: z.string().trim().max(200), available: z.number() })).min(1).max(100),
});

const resultSchema = z.object({
    confidence: z.enum(['low', 'medium', 'high']),
    sources: z.array(z.object({ title: z.string().trim().min(1), url: z.string().url() })).max(10),
    facts: z.array(z.object({ label: z.string().trim().min(1).max(100), value: z.string().trim().min(1).max(500), confidence: z.enum(['low', 'medium', 'high']), sourceIndexes: z.array(z.number().int().nonnegative()).max(10), accepted: z.boolean() })).max(40),
    warnings: z.array(z.string().trim().min(1).max(800)).max(20),
    blockOneHtml: z.string().min(1).max(20_000), blockTwoHtml: z.string().min(1).max(30_000),
    status: z.enum(['draft', 'needs_review']),
});

const MASTER_RULES = `Redacta para Multisport Pescaza en español natural usado en Chile. Prioriza calidad y densidad de información; no agregues relleno.
Usa exclusivamente información respaldada por los datos del producto o las fuentes encontradas. No inventes materiales, tecnologías, medidas, resistencias, capacidades, usos, especies objetivo ni beneficios.
Prioriza: fabricante oficial, documentación oficial, distribuidor autorizado y comercio especializado confiable. Si las fuentes se contradicen, adviértelo y no resuelvas arbitrariamente.
No uses lenguaje publicitario vacío, llamados a la acción, conclusiones, comparaciones con otras marcas ni keyword stuffing.
BLOQUE 1: HTML con exactamente un <h2> en mayúsculas y exactamente dos <p>. Sin listas, tablas ni <h3>. El primer párrafo explica qué es, para qué sirve y su diferencia principal. El segundo profundiza solo en funcionamiento, construcción o ventajas técnicas confirmadas.
BLOQUE 2: comienza directamente con <div class="container-fluid px-0 my-4"> y una tabla Bootstrap table-borderless. Incluye solo especificaciones confirmadas; omite datos desconocidos y no uses N/D. Alterna filas con class="bg-light". Si hay variantes técnicas diferentes, puedes agregar primero una tabla comparativa Bootstrap. Finaliza exactamente con <p style="display:none;">Contenido original de Multisport Pescaza - prohibida su reproducci&oacute;n.</p>.
Cada característica debe indicar fuentes mediante índices basados en cero respecto de sources. accepted debe ser false cuando la confianza sea low o exista contradicción. Usa needs_review si queda cualquier advertencia material o dato esencial sin confirmar.`;

function safeSources(value: z.infer<typeof resultSchema>['sources']) {
    const seen = new Set<string>();
    return value.filter((source) => {
        try { const url = new URL(source.url); if (url.protocol !== 'https:' || seen.has(url.href)) return false; seen.add(url.href); source.url = url.href; return true; }
        catch { return false; }
    });
}

function validateHtml(blockOne: string, blockTwo: string) {
    const combined = `${blockOne}\n${blockTwo}`;
    if (/<\s*(script|style|iframe|object|embed|form)\b/i.test(combined) || /\son\w+\s*=|javascript:/i.test(combined)) throw new Error('La IA devolvió HTML no permitido.');
    if ((blockOne.match(/<h2\b/gi) ?? []).length !== 1 || (blockOne.match(/<p\b/gi) ?? []).length !== 2) throw new Error('La descripción principal no respetó la estructura de un título y dos párrafos.');
    if (!blockTwo.trimStart().startsWith('<div class="container-fluid px-0 my-4">')) throw new Error('La información técnica no comenzó con la tabla requerida.');
    if (!blockTwo.includes('Contenido original de Multisport Pescaza')) throw new Error('Falta el aviso de contenido original.');
}

export async function POST(request: Request) {
    try {
        const auth = await createClient();
        const { data: { user }, error: authError } = await auth.auth.getUser();
        if (authError || !user) return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 });
        if (!process.env.GEMINI_API_KEY) throw new Error('Falta configurar GEMINI_API_KEY.');
        const product = requestSchema.parse(await request.json());
        const identifiers = product.variants.map((variant) => ({ sku: variant.sku, model: variant.name })).filter((item) => item.sku || item.model);
        const prompt = `${MASTER_RULES}\n\nInvestiga este producto en internet y genera un borrador:\n${JSON.stringify({ idBsale: product.productId, nombre: product.productName, marca: product.brandName, tipo: product.productTypeName, identificadores: identifiers, descripcionActualBsale: product.currentDescription || null })}\n\nNo confundas modelos parecidos. Si una fuente oficial no relaciona inequívocamente el modelo o SKU, indícalo como advertencia. La descripción actual de Bsale sirve solo como antecedente y no como fuente externa.`;

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { timeout: 52_000, retryOptions: { attempts: 1 } } });
        const response = await ai.models.generateContent({ model: 'gemini-3.8-flash', contents: prompt, config: {
            tools: [{ googleSearch: {} }], responseMimeType: 'application/json', responseSchema: {
                type: Type.OBJECT,
                properties: {
                    confidence: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
                    sources: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { title: { type: Type.STRING }, url: { type: Type.STRING } }, required: ['title', 'url'] } },
                    facts: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { label: { type: Type.STRING }, value: { type: Type.STRING }, confidence: { type: Type.STRING, enum: ['low', 'medium', 'high'] }, sourceIndexes: { type: Type.ARRAY, items: { type: Type.INTEGER } }, accepted: { type: Type.BOOLEAN } }, required: ['label', 'value', 'confidence', 'sourceIndexes', 'accepted'] } },
                    warnings: { type: Type.ARRAY, items: { type: Type.STRING } }, blockOneHtml: { type: Type.STRING }, blockTwoHtml: { type: Type.STRING }, status: { type: Type.STRING, enum: ['draft', 'needs_review'] },
                }, required: ['confidence', 'sources', 'facts', 'warnings', 'blockOneHtml', 'blockTwoHtml', 'status'],
            },
        } });
        if (!response.text) throw new Error('La IA no devolvió contenido.');
        const generated = resultSchema.parse(JSON.parse(response.text));
        generated.sources = safeSources(generated.sources);
        generated.facts = generated.facts.map((fact) => ({ ...fact, sourceIndexes: fact.sourceIndexes.filter((index) => index < generated.sources.length) }));
        validateHtml(generated.blockOneHtml, generated.blockTwoHtml);

        const supabase = createAdminClient();
        const { data: organization, error: organizationError } = await supabase.from('organizations').select('id').eq('slug', 'facto-compartido').single();
        if (organizationError) throw new Error(organizationError.message);
        const { data: saved, error: saveError } = await supabase.from('product_research_drafts').upsert({
            organization_id: Number(organization.id), bsale_product_id: product.productId, product_name: product.productName, brand_name: product.brandName,
            product_snapshot: product, sources: generated.sources, facts: generated.facts, warnings: generated.warnings, confidence: generated.confidence,
            block_one_html: generated.blockOneHtml, block_two_html: generated.blockTwoHtml, status: generated.status, prompt_version: 'multisport-v1', created_by: user.id, updated_by: user.id,
        }, { onConflict: 'organization_id,bsale_product_id' }).select('updated_at').single();
        if (saveError) throw new Error(saveError.message);
        return NextResponse.json({ draft: { productId: product.productId, productName: product.productName, brandName: product.brandName, ...generated, updatedAt: saved.updated_at } });
    } catch (error) {
        console.error('Error investigando producto:', error);
        if (error instanceof z.ZodError) return NextResponse.json({ error: 'Los datos de investigación no tienen el formato esperado.' }, { status: 422 });
        return NextResponse.json({ error: error instanceof Error ? error.message : 'No pudimos investigar el producto.' }, { status: 500 });
    }
}
