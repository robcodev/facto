'use server';

import { createClient } from '@/lib/supabase/server';

export async function signIn(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
        return { success: false as const, error: 'Ingresa tu correo y contraseña.' };
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
    });

    if (error) return { success: false as const, error: 'Correo o contraseña incorrectos.' };
    return { success: true as const };
}

export async function signOut() {
    const supabase = await createClient();
    await supabase.auth.signOut();
    return { success: true as const };
}
