import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
    let response = NextResponse.next({ request });
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        {
            cookies: {
                getAll: () => request.cookies.getAll(),
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
                    response = NextResponse.next({ request });
                    cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
                },
            },
        }
    );

    const { data } = await supabase.auth.getClaims();
    const isAuthenticated = Boolean(data?.claims);
    const pathname = request.nextUrl.pathname;
    const isLoginRoute = pathname === '/login';
    const isOwnerSetupRoute = pathname === '/register';
    const isAuthCallback = pathname === '/auth/callback';
    const isMachineRoute =
        pathname === '/api/bsale/webhooks/orders' ||
        pathname === '/api/picking/sync' ||
        pathname.startsWith('/api/printer/');

    if (isAuthCallback || isMachineRoute || isOwnerSetupRoute) return response;

    if (!isAuthenticated && !isLoginRoute) {
        if (pathname.startsWith('/api/')) {
            return NextResponse.json({ error: 'Debes iniciar sesión.' }, { status: 401 });
        }

        const loginUrl = request.nextUrl.clone();
        loginUrl.pathname = '/login';
        loginUrl.search = '';
        if (pathname !== '/') loginUrl.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
        return NextResponse.redirect(loginUrl);
    }

    if (isAuthenticated && isLoginRoute) {
        const destination = request.nextUrl.clone();
        destination.pathname = '/reception';
        destination.search = '';
        return NextResponse.redirect(destination);
    }

    return response;
}
