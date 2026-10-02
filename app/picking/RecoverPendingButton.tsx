'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { recoverPendingOrders } from './actions';

export default function RecoverPendingButton() {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [message, setMessage] = useState('');
    const [isError, setIsError] = useState(false);

    function recover() {
        if (!window.confirm('Se buscarán los pedidos pendientes y se enviarán a la cola. Los que ya fueron impresos no se repetirán. ¿Continuar?')) return;
        setMessage('');
        setIsError(false);
        startTransition(async () => {
            const result = await recoverPendingOrders();
            if (!result.success) {
                setIsError(true);
                setMessage(result.error);
                return;
            }
            setMessage(`Listo: ${result.found} pedidos pendientes revisados${result.recovered ? ` y ${result.recovered} impresiones recuperadas` : ''}.`);
            router.refresh();
        });
    }

    return <div className="flex flex-col items-start gap-1 sm:items-end">
        <button
            type="button"
            onClick={recover}
            disabled={isPending}
            className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60"
        >
            {isPending ? 'Buscando pedidos…' : 'Imprimir pedidos pendientes'}
        </button>
        {message && <p className={`max-w-md text-xs ${isError ? 'text-red-600' : 'text-green-700'}`}>{message}</p>}
    </div>;
}
