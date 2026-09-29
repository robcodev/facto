import { importCheckout, matchesSecret } from '@/lib/picking/service';

export const runtime = 'nodejs';

export async function POST(request: Request) {
    try {
        const url = new URL(request.url);
        if (!matchesSecret(url.searchParams.get('secret'), 'BSALE_WEBHOOK_SECRET')) return Response.json({ error: 'No autorizado.' }, { status: 401 });
        const body = await request.json() as Record<string, unknown>;
        if (String(body.action ?? '').toUpperCase() === 'DELETE') return Response.json({ ignored: true });
        const resource = String(body.resource ?? '');
        if (!resource) return Response.json({ error: 'La notificación no contiene un recurso.' }, { status: 400 });
        const result = await importCheckout(resource);
        return Response.json({ success: true, result });
    } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : 'No pudimos procesar la notificación.' }, { status: 500 });
    }
}
