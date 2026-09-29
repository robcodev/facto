'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export type AuthActionState = { error?: string } | undefined;

function safeDestination(value: FormDataEntryValue | null, fallback: string) {
    if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return fallback;
    return value;
}

export async function login(_: AuthActionState, formData: FormData): Promise<AuthActionState> {
    const parsed = z
        .object({
            email: z.string().trim().email(),
            password: z.string().min(1),
        })
        .safeParse({ email: formData.get('email'), password: formData.get('password') });

    if (!parsed.success) return { error: 'Ingresa un correo y una contraseña válidos.' };

    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) return { error: 'El correo o la contraseña no son correctos.' };

    redirect(safeDestination(formData.get('next'), '/reception'));
}

export async function setPassword(_: AuthActionState, formData: FormData): Promise<AuthActionState> {
    const parsed = z
        .object({
            password: z.string().min(10, 'La contraseña debe tener al menos 10 caracteres.'),
            confirmation: z.string(),
        })
        .refine((values) => values.password === values.confirmation, {
            message: 'Las contraseñas no coinciden.',
            path: ['confirmation'],
        })
        .safeParse({ password: formData.get('password'), confirmation: formData.get('confirmation') });

    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Revisa la contraseña.' };

    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    if (!claims?.claims) return { error: 'La invitación venció. Solicita una nueva invitación.' };

    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (error) return { error: 'No fue posible guardar la contraseña. Inténtalo nuevamente.' };

    redirect('/reception');
}

export async function createInitialOwner(_: AuthActionState, formData: FormData): Promise<AuthActionState> {
    const configuredToken = process.env.OWNER_SETUP_TOKEN;
    const suppliedToken = formData.get('token');
    if (!configuredToken || typeof suppliedToken !== 'string' || suppliedToken !== configuredToken) {
        return { error: 'El enlace de registro no es válido.' };
    }

    const parsed = z
        .object({
            email: z.string().trim().toLowerCase().email(),
            password: z.string().min(10, 'La contraseña debe tener al menos 10 caracteres.'),
            confirmation: z.string(),
        })
        .refine((values) => values.password === values.confirmation, {
            message: 'Las contraseñas no coinciden.',
            path: ['confirmation'],
        })
        .safeParse({
            email: formData.get('email'),
            password: formData.get('password'),
            confirmation: formData.get('confirmation'),
        });

    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Revisa los datos ingresados.' };

    const admin = createAdminClient();
    const { data: existingUsers, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (listError) return { error: 'No fue posible comprobar el registro inicial.' };
    if (existingUsers.users.length > 0) {
        return { error: 'El registro inicial ya fue utilizado. Los demás usuarios deben entrar por invitación.' };
    }

    const { error: createError } = await admin.auth.admin.createUser({
        email: parsed.data.email,
        password: parsed.data.password,
        email_confirm: true,
        app_metadata: { role: 'owner' },
    });
    if (createError) return { error: 'No fue posible crear la cuenta inicial.' };

    const supabase = await createClient();
    const { error: loginError } = await supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
    });
    if (loginError) return { error: 'La cuenta fue creada, pero debes iniciar sesión desde la pantalla de acceso.' };

    redirect('/reception');
}

export async function logout() {
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect('/login');
}
