import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { fetchShimano } from '@/lib/laboratory/shimano';
export const runtime = 'nodejs';
export const maxDuration = 35;
const headers = { 'Cache-Control': 'private, no-store' };
export async function POST(request: Request) {
    try {
        const auth = await createClient(), { data: { user } } = await auth.auth.getUser();
        if (!user) return Response.json({ error: 'Debes iniciar sesión.' }, { status: 401, headers });
        const text = await request.text();
        if (text.length > 4000) return Response.json({ error: 'El enlace es demasiado largo.' }, { status: 413, headers });
        const body = z.object({ url: z.string().trim().min(1).max(2500) }).parse(JSON.parse(text));
        return Response.json({ view: await fetchShimano(body.url) }, { headers });
    } catch (error) {
        const timeout = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
        const message = timeout ? 'Shimano tardó demasiado en responder. La vista anterior sigue disponible; puedes reintentar.' : error instanceof z.ZodError || error instanceof SyntaxError ? 'No pudimos interpretar la ficha. Revisa el enlace y vuelve a intentarlo.' : error instanceof Error ? error.message : 'No pudimos preparar la vista.';
        return Response.json({ error: message }, { status: timeout ? 504 : 400, headers });
    }
}
