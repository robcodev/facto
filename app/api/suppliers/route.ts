import { receptionReport } from '@/app/suppliers/receptions-server';
import { z } from 'zod';
import { sourceInvoice, sourcePage } from '@/app/suppliers/server';
import { paymentContext, PaymentError, readPayments, writePayment } from '@/app/suppliers/payments-server';

export const runtime = 'nodejs';
export const maxDuration = 60;
const headers = { 'Cache-Control': 'private, no-store' };
function failure(error: unknown) {
    if (error instanceof z.ZodError) return Response.json({ error: 'Revisa la forma de pago y el número de cheque.' }, { status: 400, headers });
    if (error instanceof PaymentError) return Response.json({ error: error.message }, { status: error.status, headers });
    const text = error instanceof Error && error.message.startsWith('Bsale ') ? error.message : 'No pudimos completar la consulta. Reintenta en unos momentos.';
    return Response.json({ error: text }, { status: 502, headers });
}
export async function GET(request: Request) {
    try {
        const ctx = await paymentContext();
        const params = new URL(request.url).searchParams;
        const receptions = params.get('receptions');
        if (receptions !== null) {
            if (!/^\d+$/.test(receptions)) return Response.json({ error: 'Factura inválida.' }, { status: 400, headers });
            return Response.json(await receptionReport(ctx, receptions), { headers });
        }
        const month = params.get('month') || '', offset = Number(params.get('offset') || 0);
        if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month) || !Number.isInteger(offset) || offset < 0 || offset > 10000 || offset % 25 !== 0) return Response.json({ error: 'Periodo o página inválidos.' }, { status: 400, headers });
        const page = await sourcePage(month, offset);
        return Response.json({ ...page, ...await readPayments(ctx, page.invoices), scope: ctx.userId }, { headers });
    } catch (error) { return failure(error); }
}
export async function PATCH(request: Request) {
    try {
        const origin = request.headers.get('origin');
        if (origin && origin !== new URL(request.url).origin) return Response.json({ error: 'Origen no permitido.' }, { status: 403, headers });
        const ctx = await paymentContext();
        const input = z.object({ id: z.string().regex(/^\d+$/), method: z.enum(['Cheque', 'Transferencia', 'Efectivo', 'Otro']), cheque: z.string().max(80), revision: z.number().int().min(0), sourceTotal: z.number().finite().nonnegative() }).strict().parse(await request.json());
        if (input.method === 'Cheque' && !input.cheque.trim()) throw new PaymentError('Ingresa el número del cheque.');
        const invoice = await sourceInvoice(input.id);
        if (invoice.total !== input.sourceTotal) throw new PaymentError('Bsale cambió el total de esta factura. Actualiza antes de registrar el pago.', 409);
        const payment = await writePayment(ctx, invoice, { method: input.method, cheque: input.cheque }, input.revision);
        return Response.json({ key: invoice.key, payment }, { headers });
    } catch (error) { return failure(error); }
}
