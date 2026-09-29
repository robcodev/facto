import { z } from 'zod';
import { finishPrintJob, matchesSecret } from '@/lib/picking/service';

export const runtime = 'nodejs';

const payloadSchema = z.object({ jobId: z.number().int().positive(), success: z.boolean(), error: z.string().max(1000).optional() });

export async function POST(request: Request) {
    try {
        const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null;
        if (!matchesSecret(token, 'PRINTER_AGENT_TOKEN')) return Response.json({ error: 'No autorizado.' }, { status: 401 });
        const payload = payloadSchema.parse(await request.json());
        await finishPrintJob(payload.jobId, payload.success, payload.error);
        return Response.json({ success: true });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No pudimos confirmar la impresión.';
        return Response.json({ error: message }, { status: 400 });
    }
}
