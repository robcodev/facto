import 'server-only';
import { createClient } from '@supabase/supabase-js';

export function createAdminClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.FACTO_BACKEND ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !secret) throw new Error('Falta configurar FACTO_BACKEND o SUPABASE_SECRET_KEY en el servidor.');
    return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}
