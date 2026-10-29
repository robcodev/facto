'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { parsePickingDocumentNumber } from './document-number';

export default function PickingScanner() {
    const [value, setValue] = useState('');
    const router = useRouter();
    const [error, setError] = useState('');

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const documentNumber = parsePickingDocumentNumber(value);
        if (!documentNumber) {
            setError('Ingresa el número completo de la preventa, solo con dígitos (por ejemplo, 12345).');
            return;
        }
        setError('');
        router.push(`/picking/${documentNumber}`);
    }

    return <form onSubmit={submit} className="rounded-xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
        <label htmlFor="picking-code" className="font-bold text-blue-950">Escanear preventa para iniciar picking</label>
        <p id="picking-code-help" className="mt-1 text-sm text-blue-800">El lector ingresará el número impreso bajo el código de barras.</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input id="picking-code" autoFocus value={value} onChange={(event) => { setValue(event.target.value); setError(''); }} aria-invalid={!!error} aria-describedby={error ? 'picking-code-help picking-code-error' : 'picking-code-help'} inputMode="numeric" placeholder="Escanea o escribe la preventa" className="min-w-0 flex-1 rounded-md border border-blue-300 bg-white px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600" />
            <button className="rounded-md bg-blue-700 px-5 py-2 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Abrir pedido</button>
        </div>
        {error && <p id="picking-code-error" role="alert" className="mt-2 text-sm font-medium text-red-700">{error}</p>}
    </form>;
}
