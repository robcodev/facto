import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';

const BSALE_API = 'https://api.bsale.io/v1';
const ORGANIZATION_SLUG = 'facto-compartido';

type Json = Record<string, unknown>;

function requiredEnv(name: string) {
    const value = process.env[name];
    if (!value) throw new Error(`Falta configurar ${name}.`);
    return value;
}

export function matchesSecret(actual: string | null, expectedName: string) {
    const expected = requiredEnv(expectedName);
    if (!actual) return false;
    const actualBytes = Buffer.from(actual);
    const expectedBytes = Buffer.from(expected);
    return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

async function bsaleGet(pathOrUrl: string) {
    const url = pathOrUrl.startsWith('https://') ? pathOrUrl : `${BSALE_API}${pathOrUrl}`;
    if (!url.startsWith(`${BSALE_API}/`)) throw new Error('Bsale entregó una URL de recurso no permitida.');
    const response = await fetch(url, { headers: { access_token: requiredEnv('BSALE_TOKEN') }, cache: 'no-store', signal: AbortSignal.timeout(15000) });
    const text = await response.text();
    let body: Json = {};
    try { body = text ? JSON.parse(text) as Json : {}; } catch { body = { raw: text }; }
    if (!response.ok) throw new Error(String(body.message ?? body.error ?? body.raw ?? response.statusText));
    return body;
}

function responseData(body: Json) {
    if (Array.isArray(body.data)) return body.data as Json[];
    if (body.data && typeof body.data === 'object') return [body.data as Json];
    if (Array.isArray(body.items)) return body.items as Json[];
    return [body];
}

async function checkoutFromResource(resource: string) {
    try {
        return responseData(await bsaleGet(resource))[0];
    } catch (resourceError) {
        const checkoutId = Number(resource.match(/\/checkout\/(\d+)\.json(?:\?.*)?$/)?.[1]);
        if (!Number.isInteger(checkoutId) || checkoutId <= 0) throw resourceError;

        const first = await bsaleGet('/markets/checkout/list.json?limit=1&offset=0');
        const count = Number(first.count ?? 0);
        const offset = Math.max(0, count - 50);
        const latest = await bsaleGet(`/markets/checkout/list.json?limit=50&offset=${offset}`);
        const checkout = responseData(latest).find((item) => Number(item.id) === checkoutId);
        if (!checkout) throw resourceError;
        return checkout;
    }
}

async function organizationId() {
    const supabase = createAdminClient();
    const { data, error } = await supabase.from('organizations').select('id').eq('slug', ORGANIZATION_SLUG).single();
    if (error) throw new Error(error.message);
    return { supabase, organizationId: Number(data.id) };
}

export async function importCheckout(resource: string) {
    const checkout = await checkoutFromResource(resource);
    const checkoutId = Number(checkout.id);
    const cartId = Number(checkout.cartId);
    const documentNumber = Number(checkout.documentNumber ?? 0);
    if (!Number.isInteger(checkoutId) || !Number.isInteger(cartId)) throw new Error('El checkout recibido desde Bsale no es válido.');

    const cartBody = await bsaleGet(`/cart/${cartId}/detail.json`);
    const cartItems = responseData(cartBody);
    const { supabase, organizationId: orgId } = await organizationId();
    const sourceCreatedAt = new Date(Number(checkout.createAt) * 1000).toISOString();
    const { data: order, error: orderError } = await supabase.from('web_orders').upsert({
        organization_id: orgId,
        bsale_checkout_id: checkoutId,
        document_number: documentNumber,
        cart_id: cartId,
        pay_process: String(checkout.payProcess ?? ''),
        order_status: checkout.orderStatus == null ? null : Number(checkout.orderStatus),
        payment_type_id: checkout.ptId == null ? null : Number(checkout.ptId),
        shipping_method: checkout.stName == null ? null : String(checkout.stName),
        total: Number(checkout.total ?? 0),
        source_created_at: sourceCreatedAt,
        updated_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,bsale_checkout_id' }).select('id').single();
    if (orderError) throw new Error(orderError.message);

    const items = cartItems.map((item) => ({
        order_id: Number(order.id),
        bsale_cart_detail_id: Number(item.id ?? item.cd_id),
        bsale_variant_id: Number(item.idVarianteProducto ?? item.id_variante_producto),
        sku: String(item.sku ?? item.codigo_variante_producto ?? '').trim(),
        item_name: String(item.itemName ?? item.name ?? '').trim(),
        quantity: Math.max(1, Math.round(Number(item.quantity ?? item.cd_q ?? 1))),
    })).filter((item) => Number.isInteger(item.bsale_cart_detail_id) && Number.isInteger(item.bsale_variant_id) && item.sku);
    if (items.length === 0) throw new Error('El pedido no contiene productos con SKU válidos.');
    const { error: itemError } = await supabase.from('web_order_items').upsert(items, { onConflict: 'order_id,bsale_cart_detail_id' });
    if (itemError) throw new Error(itemError.message);

    const orderStatus = Number(checkout.orderStatus);
    const eligible = String(checkout.payProcess) === 'success'
        && documentNumber > 0
        && ![6, 7].includes(orderStatus);
    if (eligible) {
        const { error: jobError } = await supabase.from('print_jobs').upsert({ organization_id: orgId, order_id: Number(order.id) }, { onConflict: 'order_id', ignoreDuplicates: true });
        if (jobError) throw new Error(jobError.message);
    }
    return { checkoutId, documentNumber, itemCount: items.length, queued: eligible };
}

export async function importRecentPendingOrders() {
    const first = await bsaleGet('/markets/checkout/list.json?limit=50&offset=0');
    const count = Number(first.count ?? 0);
    const offset = Math.max(0, count - 50);
    const latest = offset === 0 ? first : await bsaleGet(`/markets/checkout/list.json?limit=50&offset=${offset}`);
    const pending = responseData(latest).filter((item) => String(item.payProcess) === 'success'
        && Number(item.documentNumber ?? 0) > 0
        && ![6, 7].includes(Number(item.orderStatus)));
    const results = [];
    for (const checkout of pending) results.push(await importCheckout(String(checkout.url ?? `${BSALE_API}/checkout/${checkout.id}.json`)));
    return results;
}

export async function claimNextPrintJob(deviceName: string) {
    const { supabase, organizationId: orgId } = await organizationId();
    const stale = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    await supabase.from('print_jobs').update({ status: 'pending', locked_by: null, locked_at: null }).eq('organization_id', orgId).eq('status', 'processing').lt('locked_at', stale);
    const { data: candidate, error } = await supabase.from('print_jobs').select('id, attempts').eq('organization_id', orgId).in('status', ['pending', 'failed']).lt('attempts', 5).order('created_at').limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    if (!candidate) return null;
    const { data: claimed, error: claimError } = await supabase.from('print_jobs').update({ status: 'processing', locked_by: deviceName, locked_at: new Date().toISOString(), attempts: Number(candidate.attempts) + 1, updated_at: new Date().toISOString() }).eq('id', candidate.id).in('status', ['pending', 'failed']).select('id, order_id').maybeSingle();
    if (claimError) throw new Error(claimError.message);
    if (!claimed) return null;
    const { data: order, error: orderError } = await supabase.from('web_orders').select('bsale_checkout_id, document_number, payment_type_id, shipping_method, total, source_created_at, web_order_items(sku,item_name,quantity)').eq('id', claimed.order_id).single();
    if (orderError) throw new Error(orderError.message);
    return { jobId: Number(claimed.id), order: { checkoutId: Number(order.bsale_checkout_id), documentNumber: Number(order.document_number), paymentTypeId: order.payment_type_id == null ? null : Number(order.payment_type_id), shippingMethod: order.shipping_method, total: Number(order.total), createdAt: order.source_created_at, items: order.web_order_items } };
}

export async function finishPrintJob(jobId: number, success: boolean, errorMessage?: string) {
    const { supabase, organizationId: orgId } = await organizationId();
    const values = success ? { status: 'printed', printed_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() } : { status: 'failed', last_error: (errorMessage ?? 'Error de impresión').slice(0, 1000), updated_at: new Date().toISOString() };
    const { data, error } = await supabase.from('print_jobs').update(values).eq('id', jobId).eq('organization_id', orgId).eq('status', 'processing').select('id').maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('El trabajo ya no está en proceso o no existe.');
}
