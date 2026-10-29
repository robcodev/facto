import 'server-only';
import { createHash } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalize, object, rows, type SourceRow } from './normalize';

export const stages = ['types', 'brands', 'offices', 'price_lists', 'products', 'variants', 'web', 'collections', 'stocks', 'prices'] as const;
export type IntelContext = Awaited<ReturnType<typeof context>>;
export async function context() {
    const auth = await createClient();
    const { data: { user }, error } = await auth.auth.getUser();
    if (error || !user) throw new Error('Debes iniciar sesión.');
    const db = createAdminClient();
    const { data: org, error: orgError } = await db.from('organizations').select('id').eq('slug', 'facto-compartido').single();
    if (orgError || !org) throw new Error('No encontramos la empresa de Facto.');
    // Temporary single-company policy requested by the owner: every signed-in user
    // can use Intel. Keep getUser above; this does not enable anonymous access.
    return { db, orgId: Number(org.id), canEdit: true };
}
export async function bsale(path: string) {
    const token = process.env.BSALE_TOKEN;
    if (!token) throw new Error('Falta configurar BSALE_TOKEN.');
    for (let attempt = 0; attempt < 3; attempt++) {
        const response = await fetch(`https://api.bsale.io${path}`, { headers: { access_token: token }, cache: 'no-store', signal: AbortSignal.timeout(15_000) });
        if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 2) {
            await new Promise(resolve => setTimeout(resolve, 700 * (attempt + 1))); continue;
        }
        if (!response.ok) throw new Error(`Bsale respondió ${response.status} al consultar ${path.split('?')[0]}. Puedes reanudar la sincronización.`);
        const body = object(await response.json());
        if (Number(body.code ?? 200) >= 400) throw new Error(`Bsale rechazó la consulta (${body.code}).`);
        return body;
    }
    throw new Error('Bsale no está disponible.');
}
export async function allRecords(ctx: IntelContext, resource?: string) {
    const result: SourceRow[] = [];
    for (let offset = 0; ; offset += 500) {
        let query = ctx.db.from('intel_records').select('*').eq('organization_id', ctx.orgId).order('id').range(offset, offset + 499);
        if (resource) query = query.eq('resource', resource);
        else query = query.in('resource', [...stages, 'catalog_checks']);
        const { data, error } = await query;
        if (error) throw error;
        result.push(...data);
        if (data.length < 500) break;
    }
    return result;
}
// Small catalog index only: never raw payloads, descriptions or image arrays.
async function catalogIndex(ctx: IntelContext) {
    const projections: Record<string, string> = {
        products: 'state:data->state', variants: 'state:data->state,sku:data->>sku',
        web: 'url:data->>url', stocks: 'variantId:data->>variantId,available:data->available',
    };
    return (await Promise.all(Object.entries(projections).map(async ([resource, projection]) => {
        const result: SourceRow[] = [];
        for (let offset = 0; ; offset += 1000) {
            const { data, error } = await ctx.db.from('intel_records')
                .select(`id,resource,external_id,product_id,category_id,name,observed_at,run_id,${projection}`)
                .eq('organization_id', ctx.orgId).eq('resource', resource).order('id').range(offset, offset + 999);
            if (error) throw error;
            const page = data as unknown as SourceRow[];
            result.push(...page.map(row => ({ ...row, data: Object.fromEntries(Object.entries(row).filter(([key]) => ['state', 'sku', 'url', 'variantId', 'available'].includes(key))) })));
            if (page.length < 1000) return result;
        }
    }))).flat();
}
// Short, bounded, company-scoped cache. Callers authenticate on every request.
const indexes = new Map<number, { expires: number; value: ReturnType<typeof catalogIndex> }>();
export function invalidateCatalog(orgId: number) { indexes.delete(orgId); }
async function indexFor(ctx: IntelContext) {
    const cached = indexes.get(ctx.orgId);
    if (cached && cached.expires > Date.now()) return cached.value;
    if (indexes.size >= 8) indexes.delete(indexes.keys().next().value!);
    const entry = { expires: Date.now() + 30_000, value: catalogIndex(ctx) };
    indexes.set(ctx.orgId, entry);
    try { return await entry.value; } catch (error) { if (indexes.get(ctx.orgId) === entry) indexes.delete(ctx.orgId); throw error; }
}
export async function productDetail(ctx: IntelContext, id: string) {
    const records: SourceRow[] = [];
    for (let offset = 0; ; offset += 500) {
        const { data, error } = await ctx.db.from('intel_records')
            .select('id,resource,external_id,product_id,category_id,name,data,observed_at,run_id')
            .eq('organization_id', ctx.orgId).eq('product_id', id)
            .in('resource', ['products', 'variants', 'web']).order('id').range(offset, offset + 499);
        if (error) throw error;
        records.push(...data);
        if (data.length < 500) break;
    }
    // Legacy price observations have no product_id; join by variant and only
    // use the same completed capture the screen previously used.
    const { data: runs, error: runError } = await ctx.db.from('intel_sync_runs').select('id,config')
        .eq('organization_id', ctx.orgId).eq('kind', 'catalog').eq('status', 'completed')
        .order('started_at', { ascending: false }).limit(10);
    if (runError) throw runError;
    const latest = runs.find(run => run.config?.scope !== 'catalog');
    const variants = records.filter(row => row.resource === 'variants').map(row => row.external_id);
    if (latest) for (let batch = 0; batch < variants.length; batch += 100) {
        for (let offset = 0; ; offset += 500) {
            const { data, error } = await ctx.db.from('intel_records')
                .select('id,resource,external_id,product_id,category_id,name,data,observed_at,run_id')
                .eq('organization_id', ctx.orgId).eq('resource', 'prices').eq('run_id', latest.id)
                .in('data->>variantId', variants.slice(batch, batch + 100)).order('id').range(offset, offset + 499);
            if (error) throw error;
            records.push(...data);
            if (data.length < 500) break;
        }
    }
    return { records };
}
async function catalogMetadata(ctx: IntelContext) {
    const result: SourceRow[] = [];
    for (let offset = 0; ; offset += 500) {
        const { data, error } = await ctx.db.from('intel_records')
            .select('id,resource,external_id,product_id,category_id,name,data,observed_at,run_id')
            .eq('organization_id', ctx.orgId).in('resource', ['types', 'catalog_checks']).order('id').range(offset, offset + 499);
        if (error) throw error;
        result.push(...data);
        if (data.length < 500) return result;
    }
}
export async function dashboard(ctx: IntelContext, params = new URLSearchParams()) {
    if (params.get('fresh') === '1') invalidateCatalog(ctx.orgId);
    const [index, metadata, settings, runs] = await Promise.all([
        indexFor(ctx),
        catalogMetadata(ctx),
        ctx.db.from('intel_category_settings').select('*').eq('organization_id', ctx.orgId),
        ctx.db.from('intel_sync_runs').select('*').eq('organization_id', ctx.orgId).eq('kind', 'catalog').order('started_at', { ascending: false }).limit(10),
    ]);
    if (settings.error) throw settings.error;
    if (runs.error) throw runs.error;
    const latest = runs.data.find(run => run.status === 'completed' && run.config?.scope !== 'catalog');
    const children = new Map<string, SourceRow[]>();
    const stocks = new Map<string, number>();
    for (const item of index) {
        if (item.resource === 'variants') {
            const id = String(item.product_id ?? '');
            const group = children.get(id) ?? []; group.push(item); children.set(id, group);
        }
        if (item.resource === 'stocks' && item.run_id === latest?.id) stocks.set(String(object(item.data).variantId), Number(object(item.data).available));
    }
    const search = (params.get('search') || '').slice(0, 200).toLocaleLowerCase('es');
    const category = params.get('category');
    const excluded = new Set(settings.data.filter(setting => !setting.included).map(setting => setting.category_id));
    const products = index.filter(item => item.resource === 'products');
    const filtered = products.filter(product => {
        const variants = children.get(String(product.external_id)) ?? [];
        const quantities = variants.filter(item => Number(object(item.data).state) === 0).map(item => stocks.get(String(item.external_id)));
        const available = quantities.length && quantities.every(value => value !== undefined) ? quantities.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null;
        const text = `${product.name} ${product.external_id} ${variants.map(item => `${object(item.data).sku} ${item.name}`).join(' ')}`.toLocaleLowerCase('es');
        return text.includes(search) && (!category || product.category_id === category)
            && (params.get('active') !== '1' || Number(object(product.data).state) === 0)
            && (params.get('stock') !== '1' || (available ?? 0) > 0)
            && (params.get('included') !== '1' || !excluded.has(product.category_id));
    });
    const requested = Number(params.get('page') || 0);
    const page = Math.min(Number.isSafeInteger(requested) && requested >= 0 ? requested : 0, Math.max(0, Math.ceil(filtered.length / 50) - 1));
    const ids = new Set(filtered.slice(page * 50, page * 50 + 50).map(item => item.external_id));
    const variantIds = new Set(index.filter(item => item.resource === 'variants' && ids.has(item.product_id)).map(item => item.external_id));
    const records = index.filter(item => item.resource === 'stocks'
        ? item.run_id === latest?.id && variantIds.has(object(item.data).variantId)
        : ids.has(item.resource === 'products' ? item.external_id : item.product_id));
    return { records: [...records, ...metadata], settings: settings.data, runs: runs.data, canEdit: ctx.canEdit,
        total: filtered.length, page, counts: { products: products.length, variants: index.filter(item => item.resource === 'variants').length, web: index.filter(item => item.resource === 'web').length, types: metadata.filter(item => item.resource === 'types').length } };
}
export async function syncPage(ctx: IntelContext, runId: string) {
    const { data: run, error } = await ctx.db.from('intel_sync_runs').select('*').eq('organization_id', ctx.orgId).eq('kind', 'catalog').eq('id', runId).single();
    if (error) throw error;
    if (run.status !== 'running') return run;
    if (run.config?.purpose === 'historical_references') throw new Error('La recuperación de fichas históricas continúa en el proceso independiente.');
    // Preserve stage numbering for existing resumable full captures.
    const catalogOnly = run.config?.scope === 'catalog';
    const stageLimit = catalogOnly ? stages.indexOf('stocks') : stages.length;
    const resource = stages[run.stage];
    // Price lists are not a source for Intel analytics. Preserve old checkpoints,
    // skipping these stages atomically without making any Bsale request.
    // Bsale does not expose /v1/brands.json for this account. Brand references
    // are retained from products and web payloads instead of blocking the run.
    if (resource === 'brands' || resource === 'price_lists' || resource === 'prices' || (catalogOnly && resource === 'offices')) {
        const next = resource === 'offices' ? 4 : run.stage + 1;
        const { error: skipError } = await ctx.db.rpc('intel_commit_page', {
            p_org: ctx.orgId, p_run: run.id, p_stage: run.stage, p_offset: run.page_offset,
            p_rows: [], p_next_stage: next, p_next_offset: 0, p_done: next >= stageLimit,
        });
        if (skipError) throw skipError;
        const { data: updated, error: readError } = await ctx.db.from('intel_sync_runs').select('*').eq('organization_id', ctx.orgId).eq('id', run.id).single();
        if (readError) throw readError;
        return updated;
    }
    const paths: Record<string, string> = {
        types: '/v1/product_types.json', offices: '/v1/offices.json', price_lists: '/v1/price_lists.json',
        products: '/v1/products.json?expand=[product_type,brand]', variants: '/v1/variants.json?expand=[product]',
        web: '/v2/products/list/market_info.json?expand=[collections,descriptions,images,brand]',
        collections: '/v1/markets/collections/list.json', stocks: `/v1/stocks.json?officeid=${run.office_id}`,
        prices: `/v1/price_lists/${run.price_list_id}/details.json`,
    };
    if (!resource) throw new Error('La etapa de sincronización no es válida.');
    try {
        const path = paths[resource];
        const body = await bsale(`${path}${path.includes('?') ? '&' : '?'}limit=50&offset=${run.page_offset}`);
        if (!Array.isArray(body.items) && !Array.isArray(body.data)) throw new Error(`Bsale devolvió un formato inesperado para ${resource}.`);
        const batch = rows(body.items ?? body.data);
        const normalized = batch.map(raw => {
            const record = normalize(resource, raw, run.office_id, run.price_list_id, process.env.INTEL_STORE_URL || 'https://www.dmultisport.cl/');
            return { ...record, content_hash: createHash('sha256').update(JSON.stringify({ raw, data: record.data })).digest('hex') };
        });
        const count = Number(body.count);
        if (body.count == null || !Number.isSafeInteger(count) || count < 0) throw new Error(`Bsale no informó un total válido para ${resource}. No avanzamos para evitar una importación incompleta.`);
        const nextOffset = run.page_offset + batch.length;
        if (!batch.length && Number.isFinite(count) && nextOffset < count) throw new Error('Bsale devolvió una página vacía antes de completar el catálogo. Reintenta.');
        const end = Number.isFinite(count) ? nextOffset >= count : batch.length < 50;
        const nextStage = end ? run.stage + 1 : run.stage;
        if (end) {
            const identifiers = new Set(normalized.map(item => item.external_id));
            for (let offset = 0; ; offset += 500) {
                const { data: saved, error: savedError } = await ctx.db.from('intel_records').select('external_id').eq('organization_id', ctx.orgId).eq('resource', resource).eq('run_id', run.id).order('id').range(offset, offset + 499);
                if (savedError) throw savedError;
                for (const item of saved) identifiers.add(item.external_id);
                if (saved.length < 500) break;
            }
            if (identifiers.size !== count) throw new Error(`${resource}: Bsale informa ${count} registros, pero recibimos ${identifiers.size} identificadores únicos. No marcamos este bloque como completo.`);
            const check = { resource, sourceCount: count, importedCount: identifiers.size, checkedAt: new Date().toISOString(), verification: 'unique_id_count' };
            normalized.push({ resource: 'catalog_checks', external_id: resource, name: resource, product_id: null, category_id: null, data: check, raw: check, content_hash: createHash('sha256').update(JSON.stringify(check)).digest('hex') });
        }
        const { error: commitError } = await ctx.db.rpc('intel_commit_page', {
            p_org: ctx.orgId, p_run: run.id, p_stage: run.stage, p_offset: run.page_offset, p_rows: normalized,
            p_next_stage: nextStage, p_next_offset: end ? 0 : nextOffset, p_done: nextStage === stageLimit,
        });
        if (commitError) throw commitError;
        invalidateCatalog(ctx.orgId);
    } catch (cause) {
        await ctx.db.from('intel_sync_runs').update({ last_error: cause instanceof Error ? cause.message : 'Error guardando la página.', updated_at: new Date().toISOString() }).eq('organization_id', ctx.orgId).eq('id', run.id).eq('stage', run.stage).eq('page_offset', run.page_offset);
        throw cause;
    }
    const { data: updated, error: readError } = await ctx.db.from('intel_sync_runs').select('*').eq('organization_id', ctx.orgId).eq('id', run.id).single();
    if (readError) throw readError;
    return updated;
}
export function errorResponse(cause: unknown) {
    console.error('Intel:', cause);
    const message = cause instanceof Error ? cause.message : String(object(cause).message ?? 'No pudimos completar la operación.');
    const schemaMissing = /intel_|schema cache|relation .* does not exist/.test(message);
    return Response.json({ error: schemaMissing ? 'No pudimos acceder a las tablas de Intel. Comprueba que sus migraciones estén aplicadas.' : message }, { status: message.includes('sesión') ? 401 : message.includes('permisos') ? 403 : 500 });
}
