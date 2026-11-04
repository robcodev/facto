import 'server-only';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ImportError, editDocument, inputRow, MAX_ROWS, newDocument, normalized, problems, requireReady, type ImportDocument, type ImportProject, type ImportRow } from './core';

type Json = Record<string, unknown>;
const table = 'reception_product_imports';
export async function context() {
    const auth = await createClient();
    const { data: { user }, error } = await auth.auth.getUser();
    if (error || !user) throw new ImportError('Debes iniciar sesión.', 401);
    const db = createAdminClient(), org = await db.from('organizations').select('id').eq('slug', 'facto-compartido').single();
    if (org.error || !org.data) throw new ImportError('No pudimos comprobar la empresa de Facto.', 403);
    return { db, orgId: Number(org.data.id), userId: user.id };
}
export type Context = Awaited<ReturnType<typeof context>>;
function storage(error: { message?: string } | null) { if (error) throw new ImportError('No pudimos guardar el avance. Revisa que esté aplicada la migración de altas masivas.', 503); }
function scope(ctx: Context) { return ctx.db.from(table).select('*').eq('organization_id', ctx.orgId).eq('created_by', ctx.userId); }
export async function load(ctx: Context, id: string) {
    const r = await scope(ctx).eq('id', z.uuid().parse(id)).maybeSingle(); storage(r.error);
    if (!r.data) throw new ImportError('Importación no encontrada.', 404);
    return r.data as ImportProject;
}
class UncertainWrite extends ImportError { constructor() { super('Bsale no confirmó la operación. El avance quedó guardado; comprueba el resultado antes de reintentar para evitar duplicados.', 503); } }
async function bsale(path: string, method: 'GET' | 'POST' | 'PUT' = 'GET', body?: unknown): Promise<Json> {
    const token = process.env.BSALE_TOKEN;
    if (!token) throw new ImportError('Falta configurar BSALE_TOKEN.', 503);
    let response: Response;
    try {
        response = await fetch('https://api.bsale.io/v1' + path, { method, headers: { access_token: token, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(method === 'GET' ? 10000 : 20000) });
    } catch { if (method !== 'GET') throw new UncertainWrite(); throw new ImportError('Bsale tardó demasiado al consultar. Puedes reanudar el paso.', 503); }
    let data: Json;
    try { data = await response.json() as Json; } catch { if (method !== 'GET') throw new UncertainWrite(); throw new ImportError('Bsale devolvió una respuesta ilegible.', 503); }
    if (!response.ok) {
        if (method !== 'GET' && response.status >= 500) throw new UncertainWrite();
        const message = [data.description, data.message, data.error].find(v => typeof v === 'string');
        throw new ImportError(`Bsale (${response.status}): ${message || 'no pudo completar este paso.'}`, response.status === 429 ? 429 : 400);
    }
    return data;
}
const items = (data: Json) => Array.isArray(data.items) ? data.items as Json[] : [];
async function all(path: string, cap = 500) {
    const result: Json[] = [];
    for (let offset = 0; offset < cap; offset += 50) {
        const page = await bsale(path + (path.includes('?') ? '&' : '?') + `limit=50&offset=${offset}`);
        result.push(...items(page));
        if (Number(page.count) > cap) throw new ImportError('Hay demasiadas coincidencias. Usa una búsqueda más precisa o el ID del producto.');
        if (items(page).length < 50 || result.length >= Number(page.count)) return result;
    }
    throw new ImportError('No se pudo comprobar la lista completa de Bsale.');
}
export async function metadata(ctx: Context) {
    const [types, lists, offices, drafts] = await Promise.all([
        all('/product_types.json?state=0'), all('/price_lists.json?state=0&expand=[coin]'), all('/offices.json?state=0'),
        ctx.db.from(table).select('id,version,updated_at,number:document->>number,phase:document->>phase').eq('organization_id', ctx.orgId).eq('created_by', ctx.userId).order('updated_at', { ascending: false }).limit(50),
    ]);
    storage(drafts.error);
    const options = (rows: Json[]) => rows.map(row => ({ id: Number(row.id), name: String(row.name) }));
    return { types: options(types), lists: options(lists.filter(row => (row.coin as Json)?.isoCode === 'CLP')), offices: options(offices), drafts: drafts.data };
}
export async function findParents(term: string) {
    return (await all('/products.json?name=' + encodeURIComponent(z.string().trim().min(2).max(200).parse(term)), 200))
        .map(p => ({ id: Number(p.id), name: String(p.name), active: Number(p.state) === 0 }));
}
async function exactSku(code: string) {
    const response = await bsale('/variants.json?limit=50&expand=[product]&code=' + encodeURIComponent(code));
    if (Number(response.count) > 50) throw new ImportError(`Demasiadas coincidencias para el SKU ${code}. Revisa el código.`);
    const matches = items(response).filter(v => normalized(String(v.code)) === normalized(code));
    if (matches.length > 1) throw new ImportError(`El SKU ${code} tiene más de una coincidencia en Bsale; resuélvelo antes de continuar.`);
    if (matches[0] && String(matches[0].code).trim() !== code.trim()) throw new ImportError(`El SKU ${code} difiere en mayúsculas o formato del código de Bsale. Usa el código exacto.`);
    return matches[0] ?? null;
}
async function validParent(id: number) {
    const product = await bsale(`/products/${id}.json`);
    if (Number(product.state) !== 0 || Number(product.classification) !== 0 || Number(product.stockControl) !== 1 || Number(product.serialNumber ?? 0) !== 0) throw new ImportError('El producto padre debe estar activo, controlar stock y no ser un servicio, pack ni producto con series.');
    return product;
}
async function canReceive(variant: Json) {
    if (Number(variant.state) !== 0) return false;
    const id = Number((variant.product as Json)?.id);
    if (!Number.isSafeInteger(id) || id <= 0) return false;
    try { await validParent(id); return true; }
    catch (error) { if (error instanceof ImportError && error.status === 400) return false; throw error; }
}
function samePrice(detail: Json, gross: number) {
    return detail.variantValueWithTaxes !== null && detail.variantValueWithTaxes !== undefined && Number.isFinite(Number(detail.variantValueWithTaxes)) && Math.abs(Number(detail.variantValueWithTaxes) - gross) <= 0.51;
}
function assertId(data: Json) { const id = Number(data.id); if (!Number.isInteger(id) || id <= 0) throw new UncertainWrite(); return id; }
async function priceDetail(listId: number, variantId: number) {
    const matches = items(await bsale(`/price_lists/${listId}/details.json?variantid=${variantId}`)).filter(d => Number((d.variant as Json)?.id) === variantId);
    if (matches.length !== 1) throw new ImportError('El precio de la variante aún no está disponible o es ambiguo en la lista. Espera y reanuda este paso.', 503);
    return matches[0];
}
async function assertTax19(productId: number) {
    const taxes = await all(`/products/${productId}/product_taxes.json`, 50);
    if (taxes.length !== 1) throw new ImportError('El producto no tiene un único IVA de 19 %. Revisa sus impuestos en Bsale antes de guardar el precio.');
    const tax = await bsale(`/taxes/${Number((taxes[0].tax as Json)?.id)}.json`);
    if (Number(tax.percentage) !== 19 || Number(tax.overTax ?? 0) !== 0 || Number(tax.amountTax ?? 0) !== 0) throw new ImportError('Este flujo utiliza precios de venta con IVA de 19 %. El impuesto del producto no coincide.');
}
async function validateList(listId: number) {
    const list = await bsale(`/price_lists/${listId}.json?expand=[coin]`);
    if (Number(list.state) !== 0 || (list.coin as Json)?.isoCode !== 'CLP') throw new ImportError('Selecciona una lista activa en pesos chilenos.');
}
async function locked<T>(ctx: Context, id: string, work: (journal: { project: ImportProject; save: () => Promise<void> }) => Promise<T>) {
    const project = await load(ctx, id), token = crypto.randomUUID(), now = new Date().toISOString();
    const claim = await ctx.db.from(table).update({ lease_token: token, lease_until: new Date(Date.now() + 120000).toISOString() })
        .eq('organization_id', ctx.orgId).eq('created_by', ctx.userId).eq('id', id).eq('version', project.version)
        .or(`lease_until.is.null,lease_until.lt.${now}`).select('id').maybeSingle();
    storage(claim.error); if (!claim.data) throw new ImportError('Esta importación está trabajando en otra solicitud. Espera y vuelve a abrirla.', 409);
    const journal = { project, save: async () => {
        const p = journal.project;
        const r = await ctx.db.from(table).update({ document: p.document, version: p.version + 1, updated_at: new Date().toISOString() })
            .eq('organization_id', ctx.orgId).eq('created_by', ctx.userId).eq('id', id).eq('lease_token', token).eq('version', p.version).select('*').maybeSingle();
        storage(r.error); if (!r.data) throw new ImportError('El avance cambió. Abre de nuevo la importación antes de continuar.', 409);
        journal.project = r.data as ImportProject;
    } };
    try { return await work(journal); }
    finally { await ctx.db.from(table).update({ lease_token: null, lease_until: null }).eq('organization_id', ctx.orgId).eq('created_by', ctx.userId).eq('id', id).eq('lease_token', token); }
}
export const actionSchema = z.discriminatedUnion('action', [
    z.object({ action: z.literal('create'), items: z.array(inputRow).max(MAX_ROWS), number: z.string().max(30).default('') }),
    z.object({ action: z.literal('save'), id: z.uuid(), version: z.number().int().nonnegative(), document: z.unknown() }),
    z.object({ action: z.enum(['check', 'start', 'step', 'receive', 'retry', 'recheck']), id: z.uuid(), version: z.number().int().nonnegative() }),
    z.object({ action: z.literal('link_parent'), id: z.uuid(), version: z.number().int().nonnegative(), groupId: z.uuid(), productId: z.number().int().positive() }),
    z.object({ action: z.literal('resolve_parent'), id: z.uuid(), version: z.number().int().nonnegative(), productId: z.number().int().positive() }),
    z.object({ action: z.literal('resolve_receipt'), id: z.uuid(), version: z.number().int().nonnegative(), receiptId: z.number().int().positive() }),
]);
export async function action(ctx: Context, input: z.infer<typeof actionSchema>) {
    if (input.action === 'create') {
        const r = await ctx.db.from(table).insert({ organization_id: ctx.orgId, created_by: ctx.userId, document: newDocument(input.items, input.number) }).select('*').single(); storage(r.error); return r.data as ImportProject;
    }
    return locked(ctx, input.id, async journal => {
        let d = journal.project.document;
        const pendingBefore = d.pending;
        if (journal.project.version !== input.version) throw new ImportError('La pantalla no tiene el último avance. Abre de nuevo la importación.', 409);
        try {
            if (input.action === 'save') { journal.project.document = editDocument(d, input.document); await journal.save(); return journal.project; }
            if (input.action === 'check') {
                if (!['draft', 'review'].includes(d.phase)) throw new ImportError('La creación ya comenzó.');
                const errors = problems(d); if (errors.length) throw new ImportError(errors.slice(0, 8).join(' '));
                d.rows.forEach(r => { r.checked = false; r.issue = null; }); d.phase = 'checking'; d.lastError = null;
            } else if (input.action === 'start') {
                if (d.phase !== 'review') throw new ImportError('Valida el catálogo antes de crear productos.');
                const errors = problems(d, true); if (errors.length) throw new ImportError(errors.slice(0, 8).join(' '));
                if (d.rows.some(r => !r.existing)) await validateList(d.priceListId!);
                d.phase = 'creating'; d.lastError = null;
            } else if (input.action === 'recheck') {
                if (!['ready', 'verifying'].includes(d.phase) || d.pending) throw new ImportError('Primero termina la creación.');
                beginVerification(d);
            } else if (input.action === 'link_parent') {
                const group = d.groups.find(g => g.id === input.groupId);
                if (d.phase !== 'creating' || !group || group.productId || d.pending) throw new ImportError('Este producto padre no se puede cambiar en este paso.');
                await validParent(input.productId); group.selectedParentId = input.productId; d.lastError = null;
            } else if (input.action === 'retry') {
                if (!d.pending || !['product', 'variant', 'price'].includes(d.pending.kind)) throw new ImportError('No hay una creación pendiente para reintentar.');
                // Explicit user confirmation only. Product name and SKU checks run
                // again before any POST; receipts never use this path.
                d.pending = null; d.lastError = null;
            } else if (input.action === 'resolve_parent') {
                if (d.pending?.kind !== 'product') throw new ImportError('No hay un producto padre sin confirmar.');
                const group = d.groups.find(g => g.id === d.pending!.id)!;
                const parent = await validParent(input.productId);
                if (normalized(String(parent.name)) !== normalized(group.name) || Number((parent.product_type as Json)?.id) !== group.typeId) throw new ImportError('El producto no coincide con el nombre y tipo que se intentaron crear.');
                group.productId = input.productId; d.pending = null; d.lastError = null;
            } else if (input.action === 'resolve_receipt') {
                if (d.pending?.kind !== 'receipt') throw new ImportError('No hay una recepción sin confirmar.');
                await verifyReceipt(d, input.id, input.receiptId); d.receiptId = input.receiptId; d.pending = null; d.phase = 'received'; d.lastError = null;
            } else if (input.action === 'receive') {
                if (d.receiptId) return journal.project;
                requireReady(d);
                if (!d.readyAt || Date.now() - Date.parse(d.readyAt) > 300000) { beginVerification(d); await journal.save(); return journal.project; }
                const office = await bsale(`/offices/${d.officeId}.json`);
                if (Number(office.state) !== 0) throw new ImportError('La sucursal seleccionada está inactiva.');
                // The preceding incremental verification checked every SKU. An
                // expired verification returns to that phase instead of posting.
                for (const row of d.rows) { if (!row.checked) throw new ImportError('La revisión final del catálogo quedó pendiente.'); }
                d.pending = { kind: 'receipt', id: input.id }; await journal.save(); d = journal.project.document;
                const receipt = await bsale('/stocks/receptions.json', 'POST', { document: d.documentType, officeId: d.officeId, documentNumber: Number(d.number), note: receiptNote(d, input.id), details: d.rows.map(r => ({ code: r.code, quantity: r.quantity, cost: r.cost })) });
                d.receiptId = assertId(receipt); d.phase = 'received'; d.pending = null; d.lastError = null;
            } else if (input.action === 'step') {
                d.lastError = null;
                await step(d, journal.save, () => journal.project.document);
                // save() replaces project.document with the stored snapshot.
                d = journal.project.document;
            }
            await journal.save(); return journal.project;
        } catch (error) {
            const current = journal.project.document;
            if (!pendingBefore && !(error instanceof UncertainWrite) && error instanceof ImportError && error.status < 500) current.pending = null;
            current.lastError = error instanceof Error ? error.message : 'No se pudo completar el paso.';
            try { await journal.save(); } catch { throw new ImportError('No pudimos confirmar el avance guardado. Abre de nuevo esta importación antes de reintentar.', 503); }
            return journal.project;
        }
    });
}
async function recoverVariant(d: ImportDocument, row: ImportRow) {
    const variant = await exactSku(row.code), group = d.groups.find(g => g.id === row.groupId)!;
    if (!variant || Number((variant.product as Json)?.id) !== group.productId || Number(variant.state) !== 0 || String(variant.description).trim() !== row.variantName.trim()) throw new ImportError('No pudimos confirmar la variante. Comprueba en Bsale si se creó antes de autorizar otro intento.', 503);
    row.variantId = assertId(variant); row.active = true; d.pending = null;
}
async function step(initial: ImportDocument, save: () => Promise<void>, current: () => ImportDocument) {
    let d = initial;
    if (d.pending) {
        if (d.pending.kind === 'variant') { await recoverVariant(d, d.rows.find(r => r.id === d.pending!.id)!); return; }
        if (d.pending.kind === 'price') {
            const row = d.rows.find(r => r.id === d.pending!.id)!;
            const detail = await priceDetail(d.priceListId!, row.variantId!);
            if (!samePrice(detail, row.priceGross!)) throw new ImportError('El precio no está confirmado. Comprueba Bsale y autoriza el reintento del mismo precio.', 503);
            row.priceSaved = true; d.pending = null; return;
        }
        throw new ImportError('Hay una operación sin confirmar. Resuélvela antes de continuar.', 503);
    }
    if (d.phase === 'checking') {
        const row = d.rows.find(r => !r.checked);
        if (!row) { d.phase = 'review'; return; }
        const variant = await exactSku(row.code);
        const active = variant ? await canReceive(variant) : null;
        row.checked = true; row.existing = !!variant; row.variantId = variant ? assertId(variant) : null;
        row.active = active;
        row.matchedName = variant ? [String((variant.product as Json)?.name ?? ''), String(variant.description ?? '')].join(' · ') : null;
        row.priceSaved = !!variant; row.issue = variant && !row.active ? 'La variante o su producto están desactivados o no admiten esta recepción en Bsale.' : null;
        if (d.rows.every(r => r.checked)) d.phase = 'review'; return;
    }
    if (d.phase === 'verifying') {
        const row = d.rows.find(r => !r.checked);
        if (row) {
            const variant = await exactSku(row.code);
            row.active = !!variant && Number(variant.id) === row.variantId && await canReceive(variant); row.checked = true;
            row.issue = row.active ? null : 'La variante cambió o quedó desactivada. Corrige Bsale y vuelve a comprobar el catálogo.';
        }
        if (d.rows.every(r => r.checked)) { d.phase = 'ready'; d.readyAt = new Date().toISOString(); }
        return;
    }
    if (d.phase !== 'creating') return;
    const group = d.groups.find(g => !g.productId && d.rows.some(r => r.groupId === g.id && !r.existing));
    if (group) {
        if (group.selectedParentId) { await validParent(group.selectedParentId); group.productId = group.selectedParentId; return; }
        const matches = (await findParents(group.name)).filter(p => normalized(p.name) === normalized(group.name));
        if (matches.length) throw new ImportError(`Ya existe un producto con ese nombre (ID ${matches.map(p => p.id).join(', ')}). Usa su ID de padre en una nueva revisión para no duplicarlo.`, 503);
        const type = await bsale(`/product_types/${group.typeId}.json`); if (Number(type.state) !== 0) throw new ImportError('El tipo de producto está desactivado.');
        d.pending = { kind: 'product', id: group.id }; await save(); d = current();
        const target = d.groups.find(g => g.id === group.id)!;
        const created = await bsale('/products.json', 'POST', { name: target.name, productTypeId: target.typeId, classification: 0, stockControl: 1, allowDecimal: 0, serialNumber: 0 });
        target.productId = assertId(created); d.pending = null; return;
    }
    const row = d.rows.find(r => !r.existing && !r.variantId);
    if (row) {
        const parent = d.groups.find(g => g.id === row.groupId)!;
        const found = await exactSku(row.code);
        if (found) {
            if (Number((found.product as Json)?.id) !== parent.productId || Number(found.state) !== 0 || String(found.description).trim() !== row.variantName.trim()) throw new ImportError('El SKU apareció en otro producto o variante. Revisa Bsale antes de continuar.', 503);
            row.variantId = assertId(found); row.active = true; row.existing = true; row.priceSaved = true; return;
        }
        d.pending = { kind: 'variant', id: row.id }; await save(); d = current();
        const target = d.rows.find(r => r.id === row.id)!;
        const variant = await bsale('/variants.json', 'POST', { productId: parent.productId, description: target.variantName, code: target.code, unlimitedStock: 0, allowNegativeStock: 0 });
        target.variantId = assertId(variant); target.active = true; d.pending = null; return;
    }
    const price = d.rows.find(r => !r.existing && !r.priceSaved);
    if (price) {
        const parent = d.groups.find(g => g.id === price.groupId)!;
        await assertTax19(parent.productId!);
        const detail = await priceDetail(d.priceListId!, price.variantId!);
        d.pending = { kind: 'price', id: price.id }; await save(); d = current();
        const target = d.rows.find(r => r.id === price.id)!;
        const detailId = assertId(detail);
        await bsale(`/price_lists/${d.priceListId}/details/${detailId}.json`, 'PUT', { id: detailId, variantValue: target.priceGross! / 1.19 });
        const verified = await priceDetail(d.priceListId!, target.variantId!);
        if (!samePrice(verified, target.priceGross!)) throw new UncertainWrite();
        target.priceSaved = true; d.pending = null; return;
    }
    beginVerification(d);
}
function beginVerification(d: ImportDocument) { d.phase = 'verifying'; d.readyAt = null; d.lastError = null; d.rows.forEach(r => { r.checked = false; r.issue = null; }); }
const receiptNote = (d: ImportDocument, id: string) => `${d.note.trim()} [Facto alta ${id}]`.trim();
async function verifyReceipt(d: ImportDocument, id: string, receiptId: number) {
    const header = await bsale(`/stocks/receptions/${receiptId}.json`);
    if (Number((header.office as Json)?.id) !== d.officeId || String(header.documentNumber) !== String(Number(d.number)) || !String(header.note).includes(`[Facto alta ${id}]`)) throw new ImportError('La recepción no corresponde a esta importación.');
    const lines = await all(`/stocks/receptions/${receiptId}/details.json`, MAX_ROWS);
    if (lines.length !== d.rows.length || d.rows.some(r => !lines.some(l => Number((l.variant as Json)?.id) === r.variantId && Number(l.quantity) === r.quantity && Math.abs(Number(l.cost) - r.cost!) < 0.00001))) throw new ImportError('Las cantidades o costos de la recepción no coinciden.');
}
