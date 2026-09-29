import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function safeDestination(value: string | null) {
    return value?.startsWith('/') && !value.startsWith('//') ? value : '/set-password';
}

export async function GET(request: Request) {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const tokenHash = url.searchParams.get('token_hash');
    const type = url.searchParams.get('type');
    const destination = safeDestination(url.searchParams.get('next'));
    const supabase = await createClient();

    if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) return NextResponse.redirect(new URL(destination, url.origin));
    }

    if (tokenHash && type === 'invite') {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'invite' });
        if (!error) return NextResponse.redirect(new URL(destination, url.origin));
    }

    return NextResponse.redirect(new URL('/login?error=invite', url.origin));
}
