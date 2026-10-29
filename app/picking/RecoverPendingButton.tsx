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
        if (isPending) return;
        if (!window.confirm('Esta acción revisa los 50 pedidos más recientes de Bsale y reintenta comandas fallidas o atascadas. Envía trabajos a la cola de impresión real, incluso fuera de esta tabla. Si una comanda ya salió pero su estado no se confirmó, podría volver a imprimirse. ¿Continuar?')) return;
        setMessage('');
        setIsError(false);
        startTransition(async () => {
            try {
            const result = await recoverPendingOrders();
            if (!result.success) {
                setIsError(true);
                setMessage(result.error);
                return;
            }
            setMessage(`Listo: ${result.found} pedidos pendientes revisados${result.recovered ? ` y ${result.recovered} impresiones recuperadas` : ''}.`);
            router.refresh();
            } catch {
                setIsError(true);
                setMessage('No se pudo confirmar el resultado. Revisa los estados antes de reintentar para evitar impresiones repetidas.');
            }
        });
    }

    return <div className="flex flex-col items-start gap-1 sm:items-end">
        <button
            type="button"
            onClick={recover}
            disabled={isPending}
            className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
            {isPending ? 'Buscando pedidos…' : 'Imprimir pedidos pendientes'}
        </button>
        <p className="max-w-md text-xs text-gray-600">Revisa los 50 pedidos más recientes de Bsale y reintenta comandas fallidas o atascadas. Envía trabajos reales a la impresora cuando el agente está conectado.</p>
        {message && <p role={isError ? 'alert' : 'status'} className={`max-w-md text-xs ${isError ? 'text-red-600' : 'text-green-700'}`}>{message}</p>}
    </div>;
}
