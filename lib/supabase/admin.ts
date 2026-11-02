import 'server-only';
import { createClient } from '@supabase/supabase-js';

export function createAdminClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    // Production uses FACTO_BACKEND; newer local environments use the explicit
    // SECRET suffix. Both names refer to the same server-only backend credential.
    const secret = process.env.FACTO_BACKEND_SECRET?.trim()
        || process.env.FACTO_BACKEND?.trim()
        || process.env.SUPABASE_SECRET_KEY?.trim();
    if (!url) throw new Error('Falta configurar NEXT_PUBLIC_SUPABASE_URL en el servidor.');
    if (!secret) throw new Error('Falta configurar FACTO_BACKEND_SECRET, FACTO_BACKEND o SUPABASE_SECRET_KEY en el servidor.');
    return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}
