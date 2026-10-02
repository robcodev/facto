'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { markPickingOrderPrinted, reprintPickingOrder } from './actions';

interface ReprintButtonProps {
    orderId: number;
    documentNumber: number;
    status?: string;
}

export default function ReprintButton({ orderId, documentNumber, status }: ReprintButtonProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [message, setMessage] = useState('');
    const isQueued = status === 'pending' || status === 'processing';

    function reprint() {
        if (!window.confirm(`¿Reimprimir la preventa #${documentNumber}?`)) return;
        setMessage('');
        startTransition(async () => {
            const result = await reprintPickingOrder(orderId);
            if (!result.success) {
                setMessage(result.error);
                return;
            }
            setMessage('Reimpresión enviada.');
            router.refresh();
        });
    }

    function markPrinted() {
        if (!window.confirm(`¿Confirmas que la preventa #${documentNumber} ya salió físicamente de la impresora?\n\nAl marcarla como impresa, el agente no volverá a imprimirla automáticamente.`)) return;
        setMessage('');
        startTransition(async () => {
            const result = await markPickingOrderPrinted(orderId);
            if (!result.success) {
                setMessage(result.error);
                return;
            }
            setMessage('Marcada como impresa.');
            router.refresh();
        });
    }

    return <div className="mt-2">
        <div className="flex flex-wrap gap-1.5">
            <button
                type="button"
                onClick={reprint}
                disabled={isPending || isQueued}
                className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {isPending ? 'Guardando…' : isQueued ? 'En cola' : 'Reimprimir'}
            </button>
            {isQueued && <button
                type="button"
                onClick={markPrinted}
                disabled={isPending}
                className="rounded-md border border-green-300 bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-800 hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
                Ya se imprimió
            </button>}
        </div>
        {message && <p className={`mt-1 max-w-xs text-xs ${message === 'Reimpresión enviada.' || message === 'Marcada como impresa.' ? 'text-green-700' : 'text-red-600'}`}>{message}</p>}
    </div>;
}
