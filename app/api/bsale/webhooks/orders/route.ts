import { importCheckout, matchesSecret } from '@/lib/picking/service';

export const runtime = 'nodejs';

const INVALID_CHECKOUT_MESSAGE = 'El checkout recibido desde Bsale no es válido.';

export async function GET(request: Request) {
    const url = new URL(request.url);
    if (!matchesSecret(url.searchParams.get('secret'), 'BSALE_WEBHOOK_SECRET')) return Response.json({ error: 'No autorizado.' }, { status: 401 });
    return Response.json({ success: true, service: 'Bsale Venta Online webhook' });
}

export async function POST(request: Request) {
    let notification: Record<string, unknown> = {};
    try {
        const url = new URL(request.url);
        if (!matchesSecret(url.searchParams.get('secret'), 'BSALE_WEBHOOK_SECRET')) return Response.json({ error: 'No autorizado.' }, { status: 401 });
        notification = await request.json() as Record<string, unknown>;
        const action = String(notification.action ?? '').toUpperCase();
        const resource = String(notification.resource ?? '').trim();
        console.info('Webhook Bsale Venta Online recibido', {
            cpnId: notification.cpnId ?? null,
            topic: notification.topic ?? null,
            action: action || null,
            resourceId: notification.resourceId ?? null,
            resource: resource || null,
        });

        if (action === 'DELETE') return Response.json({ success: true, ignored: true, reason: 'deleted-resource' });
        if (!resource) return Response.json({ success: true, ignored: true, reason: 'activation-or-empty-notification' });
        const result = await importCheckout(resource);
        return Response.json({ success: true, result });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No pudimos procesar la notificación.';
        if (message === INVALID_CHECKOUT_MESSAGE) {
            console.warn('Webhook Bsale recibido antes de que el checkout estuviera disponible', {
                cpnId: notification.cpnId ?? null,
                topic: notification.topic ?? null,
                resourceId: notification.resourceId ?? null,
                resource: notification.resource ?? null,
            });
            return Response.json(
                { error: 'El checkout todavía no está disponible. Reintente la notificación.' },
                { status: 503, headers: { 'Retry-After': '15' } },
            );
        }
        console.error('Error procesando webhook Bsale Venta Online', {
            cpnId: notification.cpnId ?? null,
            topic: notification.topic ?? null,
            resourceId: notification.resourceId ?? null,
            message,
        });
        return Response.json({ error: message }, { status: 500 });
    }
}
