'use client';

import { useActionState } from 'react';
import { createInitialOwner, type AuthActionState } from '@/app/auth/actions';

export default function RegisterForm({ token }: { token: string }) {
    const [state, action, pending] = useActionState<AuthActionState, FormData>(createInitialOwner, undefined);

    return (
        <form action={action} className="mt-8 space-y-5">
            <input type="hidden" name="token" value={token} />
            <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-700">Correo electrónico</label>
                <input id="email" name="email" type="email" autoComplete="email" required autoFocus className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
            </div>
            <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-gray-700">Contraseña</label>
                <input id="password" name="password" type="password" minLength={10} autoComplete="new-password" required className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                <p className="mt-1.5 text-xs text-gray-500">Usa al menos 10 caracteres.</p>
            </div>
            <div>
                <label htmlFor="confirmation" className="mb-1.5 block text-sm font-medium text-gray-700">Repetir contraseña</label>
                <input id="confirmation" name="confirmation" type="password" minLength={10} autoComplete="new-password" required className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
            </div>
            {state?.error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p> : null}
            <button type="submit" disabled={pending} className="w-full rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60">
                {pending ? 'Creando cuenta…' : 'Crear mi cuenta'}
            </button>
        </form>
    );
}
