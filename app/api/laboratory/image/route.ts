import { createClient } from '@/lib/supabase/server';
import { fetchProductImage } from '@/lib/laboratory/image';
export const runtime = 'nodejs';
export const maxDuration = 20;
export async function GET(request: Request) {
    const auth = await createClient(), { data: { user } } = await auth.auth.getUser();
    if (!user) return new Response(null, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    try {
        const image = await fetchProductImage(new URL(request.url).searchParams.get('src') || '');
        return new Response(image.data, { headers: { 'Content-Type': image.type, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" } });
    } catch { return new Response(null, { status: 502, headers: { 'Cache-Control': 'no-store' } }); }
}
