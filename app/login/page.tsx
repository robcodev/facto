'use client';

import { FormEvent, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from './actions';

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isPending, startTransition] = useTransition();

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError('');
        startTransition(async () => {
            const result = await signIn(email, password);
            if (!result.success) return setError(result.error);
            router.replace('/prices');
            router.refresh();
        });
    }

    return (
        <div className="mx-auto flex min-h-screen max-w-md items-center p-6">
            <form onSubmit={submit} className="w-full space-y-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <div>
                    <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Facto</p>
                    <h1 className="mt-1 text-2xl font-bold text-gray-900">Ingresar</h1>
                    <p className="mt-2 text-sm text-gray-600">Usa el usuario que creaste en Supabase.</p>
                </div>
                <label className="block text-sm font-medium text-gray-700">Correo
                    <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2" />
                </label>
                <label className="block text-sm font-medium text-gray-700">Contraseña
                    <input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2" />
                </label>
                {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
                <button disabled={isPending} className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                    {isPending ? 'Ingresando…' : 'Ingresar'}
                </button>
            </form>
        </div>
    );
}
