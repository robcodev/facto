import { importRecentPendingOrders, matchesSecret } from '@/lib/picking/service';

export const runtime = 'nodejs';

export async function POST(request: Request) {
    try {
        const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null;
        if (!matchesSecret(token, 'PICKING_SYNC_TOKEN')) return Response.json({ error: 'No autorizado.' }, { status: 401 });
        const imported = await importRecentPendingOrders();
        return Response.json({ success: true, imported });
    } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : 'No pudimos sincronizar pedidos.' }, { status: 500 });
    }
}
