'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function PickingScanner() {
    const [value, setValue] = useState('');
    const router = useRouter();

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const documentNumber = value.replace(/\D/g, '');
        if (!documentNumber) return;
        router.push(`/picking/${documentNumber}`);
    }

    return <form onSubmit={submit} className="rounded-xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
        <label htmlFor="picking-code" className="font-bold text-blue-950">Escanear preventa para iniciar picking</label>
        <p className="mt-1 text-sm text-blue-800">El lector ingresará el número impreso bajo el código de barras.</p>
        <div className="mt-4 flex gap-2">
            <input id="picking-code" autoFocus value={value} onChange={(event) => setValue(event.target.value)} inputMode="numeric" placeholder="Escanea o escribe la preventa" className="min-w-0 flex-1 rounded-md border border-blue-300 bg-white px-3 py-2" />
            <button className="rounded-md bg-blue-700 px-5 py-2 font-semibold text-white">Abrir pedido</button>
        </div>
    </form>;
}
