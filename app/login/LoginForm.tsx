'use client';

import { useActionState } from 'react';
import { login, type AuthActionState } from '@/app/auth/actions';

export default function LoginForm({ nextPath }: { nextPath: string }) {
    const [state, action, pending] = useActionState<AuthActionState, FormData>(login, undefined);

    return (
        <form action={action} className="mt-8 space-y-5">
            <input type="hidden" name="next" value={nextPath} />
            <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-700">
                    Correo electrónico
                </label>
                <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    autoFocus
                    className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
            </div>
            <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-gray-700">
                    Contraseña
                </label>
                <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
            </div>
            {state?.error ? (
                <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                    {state.error}
                </p>
            ) : null}
            <button
                type="submit"
                disabled={pending}
                className="w-full rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
            >
                {pending ? 'Ingresando…' : 'Ingresar'}
            </button>
        </form>
    );
}
