import { claimNextPrintJob, matchesSecret } from '@/lib/picking/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null;
        if (!matchesSecret(token, 'PRINTER_AGENT_TOKEN')) return Response.json({ error: 'No autorizado.' }, { status: 401 });
        const deviceName = (request.headers.get('x-device-name') ?? 'POS-8360').slice(0, 100);
        const job = await claimNextPrintJob(deviceName);
        return job ? Response.json(job) : new Response(null, { status: 204 });
    } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : 'No pudimos obtener el trabajo.' }, { status: 500 });
    }
}
