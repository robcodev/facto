'use client';

import { FormEvent, useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { scanPickingProduct } from '../actions';

type Item = { id: number; sku: string; barcode: string | null; item_name: string; quantity: number; picked_quantity: number };

export default function PickingSession({ orderId, initialItems, initialStatus }: { orderId: number; initialItems: Item[]; initialStatus: string }) {
    const [items, setItems] = useState(initialItems);
    const [status, setStatus] = useState(initialStatus);
    const [code, setCode] = useState('');
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
    const [cameraOpen, setCameraOpen] = useState(false);
    const [pending, startTransition] = useTransition();
    const videoRef = useRef<HTMLVideoElement>(null);
    const controlsRef = useRef<IScannerControls | null>(null);
    const lastScanRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });
    const processingRef = useRef(false);

    const total = items.reduce((sum, item) => sum + Number(item.quantity), 0);
    const picked = items.reduce((sum, item) => sum + Number(item.picked_quantity), 0);

    const processCode = useCallback((rawCode: string) => {
        const cleanCode = rawCode.trim();
        if (!cleanCode || processingRef.current) return;
        const now = Date.now();
        if (lastScanRef.current.code === cleanCode && now - lastScanRef.current.at < 1200) return;
        lastScanRef.current = { code: cleanCode, at: now };
        processingRef.current = true;
        setCode('');
        startTransition(async () => {
            try {
                const response = await scanPickingProduct(orderId, cleanCode);
                if (!response.success) return setMessage({ ok: false, text: response.error });
                const result = response.result;
                if (result.status === 'not_in_order') return setMessage({ ok: false, text: `El código ${cleanCode} no pertenece a este pedido.` });
                if (result.status === 'already_complete') return setMessage({ ok: false, text: 'Ese producto ya tiene completa su cantidad.' });
                if (result.status !== 'accepted' || result.itemId == null) return setMessage({ ok: false, text: 'No pudimos reconocer el código.' });
                setItems((current) => current.map((item) => item.id === Number(result.itemId) ? { ...item, picked_quantity: Number(result.pickedQuantity) } : item));
                setStatus(result.completed ? 'completed' : 'in_progress');
                setMessage({ ok: true, text: result.completed ? 'Pedido completo. Ya está listo para empacar.' : 'Producto correcto.' });
            } finally {
                processingRef.current = false;
            }
        });
    }, [orderId]);

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        processCode(code);
    }

    async function openCamera() {
        setCameraOpen(true); setMessage(null);
    }

    function closeCamera() {
        controlsRef.current?.stop(); controlsRef.current = null; setCameraOpen(false);
    }

    useEffect(() => {
        if (!cameraOpen || !videoRef.current) return;
        const reader = new BrowserMultiFormatReader();
        let cancelled = false;
        reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } }, audio: false }, videoRef.current, (result) => {
            if (result && !cancelled) processCode(result.getText());
        }).then((controls) => { if (cancelled) controls.stop(); else controlsRef.current = controls; }).catch((error) => {
            setMessage({ ok: false, text: `No pudimos abrir la cámara: ${error instanceof Error ? error.message : 'permiso denegado'}` });
            setCameraOpen(false);
        });
        return () => { cancelled = true; controlsRef.current?.stop(); controlsRef.current = null; };
    }, [cameraOpen, processCode]);

    return <div className="space-y-5">
        <div className={`rounded-xl border p-5 ${status === 'completed' ? 'border-green-300 bg-green-50' : 'bg-white'}`}><div className="flex items-center justify-between gap-4"><div><p className="text-sm font-semibold uppercase text-gray-500">Avance</p><p className="mt-1 text-2xl font-bold">{picked} de {total} unidades</p></div><span className={`rounded-full px-3 py-1 text-sm font-bold ${status === 'completed' ? 'bg-green-600 text-white' : status === 'in_progress' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700'}`}>{status === 'completed' ? 'Listo para empacar' : status === 'in_progress' ? 'Preparando' : 'Pendiente'}</span></div><div className="mt-3 h-3 overflow-hidden rounded-full bg-gray-200"><div className="h-full bg-green-600 transition-all" style={{ width: `${total ? Math.round(picked / total * 100) : 0}%` }} /></div></div>
        <form onSubmit={submit} className="rounded-xl border border-blue-200 bg-blue-50 p-5"><label htmlFor="product-code" className="font-bold text-blue-950">Escanear producto</label><p className="mt-1 text-sm text-blue-800">Usa un lector o escribe el SKU/código de barras.</p><div className="mt-4 flex flex-wrap gap-2"><input id="product-code" autoFocus value={code} onChange={(event) => setCode(event.target.value)} disabled={pending || status === 'completed'} className="min-w-48 flex-1 rounded-md border border-blue-300 bg-white px-3 py-2" placeholder="Código del producto" /><button disabled={pending || status === 'completed'} className="rounded-md bg-blue-700 px-5 py-2 font-semibold text-white disabled:opacity-40">Validar</button><button type="button" onClick={openCamera} disabled={cameraOpen || status === 'completed'} className="rounded-md border border-blue-700 bg-white px-5 py-2 font-semibold text-blue-700 disabled:opacity-40">Usar cámara</button></div></form>
        {message && <div className={`rounded-lg p-4 font-semibold ${message.ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{message.text}</div>}
        {cameraOpen && <div className="rounded-xl bg-black p-3"><div className="mb-3 flex items-center justify-between text-white"><strong>Apunta al código de barras</strong><button onClick={closeCamera} className="rounded bg-white/20 px-3 py-1">Cerrar</button></div><video ref={videoRef} className="max-h-[60vh] w-full rounded-lg object-cover" muted playsInline /></div>}
        <section className="overflow-hidden rounded-xl border bg-white shadow-sm"><div className="border-b bg-gray-50 px-4 py-3"><h2 className="font-bold">Productos</h2></div><ul className="divide-y">{items.map((item) => { const complete = Number(item.picked_quantity) >= Number(item.quantity); return <li key={item.id} className={`flex items-start gap-4 p-4 ${complete ? 'bg-green-50' : ''}`}><div className={`mt-1 flex h-7 w-7 items-center justify-center rounded-full font-bold ${complete ? 'bg-green-600 text-white' : 'border-2 border-gray-300'}`}>{complete ? '✓' : ''}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap justify-between gap-2"><strong>{item.sku}</strong><strong className={complete ? 'text-green-700' : ''}>{item.picked_quantity} / {item.quantity}</strong></div><p className="mt-1 text-sm text-gray-600">{item.item_name}</p>{item.barcode && <p className="mt-1 text-xs text-gray-500">Código: {item.barcode}</p>}</div></li>; })}</ul></section>
    </div>;
}
