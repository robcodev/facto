'use client';

import { useState, useEffect } from 'react';
import { checkSkuInBsale, submitStockReception, getBsaleOffices } from './actions';
import type { BsaleOffice } from './types';

interface UiItem {
    code: string;
    quantity: number;
    netUnitValue: number; // Costo base de lista extraído
    totalNet: number;
    exists: boolean | null;
    variantId: number | null;
    bsaleName: string | null;
    variantActive: boolean | null;
}

interface InvoiceProcessResponse {
    documentNumber?: string;
    invoiceItems?: Array<Pick<UiItem, 'code' | 'quantity' | 'netUnitValue' | 'totalNet'>>;
}

type InvoiceDiscount = {
    id: number;
    type: 'percentage' | 'amount';
    value: number;
};

type PurchaseDocumentType = 'FACTURA' | 'GUÍA' | 'OTRO';

const MAX_UPLOAD_SIZE_BYTES = 4 * 1024 * 1024;

export default function RecepcionPage() {
    const [loading, setLoading] = useState(false);
    const [offices, setOffices] = useState<BsaleOffice[]>([]);
    const [selectedOffice, setSelectedOffice] = useState<string>('');
    const [documentNumber, setDocumentNumber] = useState<string>('');
    const [documentType, setDocumentType] = useState<PurchaseDocumentType>('FACTURA');
    const [documentNote, setDocumentNote] = useState('');
    const [items, setItems] = useState<UiItem[]>([]);
    const [processError, setProcessError] = useState<string | null>(null);

    const [discounts, setDiscounts] = useState<InvoiceDiscount[]>([
        { id: 1, type: 'percentage', value: 0 },
    ]);

    useEffect(() => {
        async function fetchOffices() {
            const res = await getBsaleOffices();
            if (res.success && res.offices) setOffices(res.offices);
        }
        fetchOffices();
    }, []);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const fileList = e.target.files;
        if (!fileList || fileList.length === 0) return;

        const totalSize = Array.from(fileList).reduce((total, file) => total + file.size, 0);
        if (totalSize > MAX_UPLOAD_SIZE_BYTES) {
            alert('El conjunto de archivos supera el máximo de 4 MB permitido en la versión alojada.');
            e.target.value = '';
            return;
        }

        setLoading(true);
        setProcessError(null);
        setItems([]);
        setDiscounts([{ id: 1, type: 'percentage', value: 0 }]);

        const formData = new FormData();
        formData.append('documentType', documentType);
        Array.from(fileList).forEach((file) => {
            formData.append('files', file);
        });

        try {
            const response = await fetch('/api/process-invoice', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorResponse = (await response.json().catch(() => null)) as { error?: unknown } | null;
                const message = typeof errorResponse?.error === 'string'
                    ? errorResponse.error
                    : 'Error al procesar el documento con IA';
                throw new Error(message);
            }
            const data = (await response.json()) as InvoiceProcessResponse;

            if (data.documentNumber) {
                setDocumentNumber(data.documentNumber.replace(/\D/g, ''));
            }

            if (data.invoiceItems && data.invoiceItems.length > 0) {
                const initialItems: UiItem[] = data.invoiceItems.map((item) => ({
                    ...item,
                    exists: null,
                    variantId: null,
                    bsaleName: 'Validando con Bsale...',
                    variantActive: null,
                }));
                setItems(initialItems);

                await Promise.all(
                    initialItems.map(async (item, index) => {
                        const validation = await checkSkuInBsale(item.code);
                        setItems(prev => {
                            const updated = [...prev];
                            if (!updated[index]) return prev;
                            if (validation.exists) {
                                updated[index].exists = true;
                                updated[index].variantId = validation.variantId ?? null;
                                updated[index].bsaleName = validation.name ?? 'Encontrado';
                                updated[index].variantActive = validation.active;
                            } else {
                                updated[index].exists = false;
                                updated[index].bsaleName = 'Producto No Existe';
                                updated[index].variantActive = null;
                            }
                            return updated;
                        });
                    })
                );
            }
        } catch (error) {
            setProcessError(error instanceof Error ? error.message : 'Ocurrió un error procesando el documento.');
        } finally {
            setLoading(false);
        }
    };

    const handleSkuChange = async (index: number, newSku: string) => {
        if (!newSku.trim()) return;

        setItems(prev => {
            const updated = [...prev];
            updated[index].code = newSku;
            updated[index].exists = null;
            updated[index].bsaleName = 'Validando corrección...';
            updated[index].variantActive = null;
            return updated;
        });

        const validation = await checkSkuInBsale(newSku);

        setItems(prev => {
            const updated = [...prev];
            if (updated[index] && updated[index].code === newSku) {
                if (validation.exists) {
                    updated[index].exists = true;
                    updated[index].variantId = validation.variantId ?? null;
                    updated[index].bsaleName = validation.name ?? 'Encontrado';
                    updated[index].variantActive = validation.active;
                } else {
                    updated[index].exists = false;
                    updated[index].variantId = null;
                    updated[index].bsaleName = 'Producto No Existe';
                    updated[index].variantActive = null;
                }
            }
            return updated;
        });
    };

    const handleCostChange = (index: number, newCost: number) => {
        setItems(prev => {
            const updated = [...prev];
            updated[index].netUnitValue = newCost;
            updated[index].totalNet = newCost * updated[index].quantity;
            return updated;
        });
    };

    const handleQuantityChange = (index: number, newQty: number) => {
        setItems(prev => {
            const updated = [...prev];
            updated[index].quantity = newQty;
            updated[index].totalNet = updated[index].netUnitValue * newQty;
            return updated;
        });
    };

    const invoiceSubtotalNet = items.reduce((acc, item) => acc + item.totalNet, 0);
    const invoiceTotalNetFinal = Math.round(discounts.reduce((currentTotal, discount) => {
        const value = Math.max(0, Number(discount.value) || 0);
        if (discount.type === 'percentage') {
            return currentTotal * (1 - Math.min(100, value) / 100);
        }
        return Math.max(0, currentTotal - value);
    }, invoiceSubtotalNet));
    const compositeDiscountFactor = invoiceSubtotalNet > 0 ? invoiceTotalNetFinal / invoiceSubtotalNet : 1;
    const appliedDiscount = Math.max(0, invoiceSubtotalNet - invoiceTotalNetFinal);

    const addDiscount = () => {
        setDiscounts(current => [
            ...current,
            { id: Math.max(0, ...current.map(discount => discount.id)) + 1, type: 'percentage', value: 0 },
        ]);
    };

    const updateDiscount = (id: number, changes: Partial<Pick<InvoiceDiscount, 'type' | 'value'>>) => {
        setDiscounts(current => current.map(discount => discount.id === id ? { ...discount, ...changes } : discount));
    };

    const removeDiscount = (id: number) => {
        setDiscounts(current => current.length === 1
            ? [{ id: 1, type: 'percentage', value: 0 }]
            : current.filter(discount => discount.id !== id));
    };

    const handleFinalSubmit = async () => {
        if (!selectedOffice) return alert('Debes seleccionar una sucursal.');
        if (!documentNumber.trim()) return alert('Debes ingresar el número del documento.');

        setLoading(true);

        const payload = {
            officeId: Number(selectedOffice),
            documentNumber: documentNumber,
            documentType,
            note: documentNote,
            details: items.map(item => ({
                code: item.code,
                quantity: item.quantity,
                netUnitValue: Math.round(item.netUnitValue * compositeDiscountFactor),
            }))
        };

        const res = await submitStockReception(payload);
        setLoading(false);

        if (res.success) {
            alert(`¡Recepción de Stock creada exitosamente en Bsale! ID: ${res.receptionId}`);
            setItems([]);
            setDocumentNumber('');
            setDocumentNote('');
            setDiscounts([{ id: 1, type: 'percentage', value: 0 }]);
        } else {
            alert(`Error al guardar la recepción: ${res.error}`);
        }
    };

    const allSkusResolved = items.length > 0 && items.every(item => item.exists === true && item.variantActive === true && item.code.trim() !== '');

    return (
        <div className="max-w-5xl mx-auto p-6 space-y-8">
            <header className="border-b pb-4">
                <h1 className="text-2xl font-bold text-gray-800">Recepción de Stock </h1>
            </header>

            {/* PASO 1: Subida de Archivos y Botón de Inicio Manual siempre visible */}
            <section className="bg-white p-6 rounded-lg border shadow-sm space-y-4">
                <div className="flex justify-between items-center">
                    <h2 className="text-lg font-semibold text-gray-700">1. Carga el documento</h2>
                </div>
                <label className="block max-w-sm text-sm font-medium text-gray-700">Tipo de documento en Bsale
                    <select value={documentType} onChange={(event) => setDocumentType(event.target.value as PurchaseDocumentType)} disabled={loading} className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2">
                        <option value="FACTURA">Factura</option>
                        <option value="GUÍA">Guía</option>
                        <option value="OTRO">Otro</option>
                    </select>
                </label>
                <div className="flex items-center space-x-4">
                    <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
                        multiple
                        onChange={handleFileUpload}
                        disabled={loading}
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
                    />
                    {loading && <span className="text-sm text-blue-600 animate-pulse font-medium">Procesando...</span>}
                </div>
                {processError && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{processError}</div>}
            </section>

            {/* PASO 2: Tabla de Ítems */}
            {items.length > 0 && (
                <section className="bg-white rounded-lg border shadow-sm overflow-hidden">
                    <div className="p-6 bg-gray-50 border-b flex justify-between items-center">
                        <h2 className="text-lg font-semibold text-gray-700">2. Validación de Productos (SKU) y Costos</h2>
                        {/* Se mantiene una réplica rápida opcional aquí para comodidad */}

                    </div>
                    <table className="w-full text-left border-collapse">
                        <thead>
                        <tr className="bg-gray-100 text-xs font-semibold text-gray-600 uppercase border-b">
                            <th className="p-4 text-left w-[50px]">#</th>
                            <th className="p-4">SKU documento</th>
                            <th className="p-4 w-[90px]">Cantidad</th>
                            <th className="p-4">Costo Lista (Neto)</th>
                            <th className="p-4 text-blue-700">Costo Real Prorrateado</th>
                            <th className="p-4">Total Línea (Lista)</th>
                            <th className="p-4">Estado Bsale</th>
                            <th className="p-4 text-center">Estado</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y text-sm text-gray-600">
                        {items.map((item, index) => {
                            const proratedUnitCost = Math.round(item.netUnitValue * compositeDiscountFactor);

                            return (
                                <tr key={index} className="hover:bg-gray-50">
                                    <td className="p-4 font-medium text-gray-400">{index + 1}</td>
                                    <td className="p-4">
                                        <input
                                            type="text"
                                            value={item.code}
                                            onChange={(e) => {
                                                setItems(prev => {
                                                    const updated = [...prev];
                                                    updated[index].code = e.target.value;
                                                    return updated;
                                                });
                                            }}
                                            onBlur={(e) => handleSkuChange(index, e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    handleSkuChange(index, (e.target as HTMLInputElement).value);
                                                }
                                            }}
                                            className="font-mono font-medium px-2 py-1 border rounded bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full max-w-[150px]"
                                            placeholder="Ingresar SKU"
                                            disabled={loading}
                                        />
                                    </td>
                                    <td className="p-4">
                                        <input
                                            type="number"
                                            min="1"
                                            value={item.quantity}
                                            onChange={(e) => handleQuantityChange(index, Number(e.target.value) || 1)}
                                            className="px-2 py-1 border rounded bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
                                            disabled={loading}
                                        />
                                    </td>
                                    <td className="p-4">
                                        <div className="flex items-center space-x-1">
                                            <span className="text-gray-400">$</span>
                                            <input
                                                type="number"
                                                min="0"
                                                value={item.netUnitValue}
                                                onChange={(e) => handleCostChange(index, Number(e.target.value) || 0)}
                                                className="px-2 py-1 border rounded bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full max-w-[100px]"
                                                placeholder="Costo"
                                                disabled={loading}
                                            />
                                        </div>
                                    </td>
                                    <td className="p-4 font-semibold text-blue-700 bg-blue-50/30">
                                        ${proratedUnitCost.toLocaleString('es-CL')}
                                    </td>
                                    <td className="p-4">${item.totalNet.toLocaleString('es-CL')}</td>
                                    <td className="p-4">
                                        {item.code === '' && <span className="text-amber-500 font-medium">Falta SKU</span>}
                                        {item.code !== '' && item.exists === null && <span className="text-gray-400 animate-pulse">Validando...</span>}
                                        {item.code !== '' && item.exists === true && <span className="text-green-600 font-medium">✓ {item.bsaleName}</span>}
                                        {item.code !== '' && item.exists === false && <span className="text-red-500 font-medium">✗ No existe</span>}
                                    </td>
                                    <td className="p-4 text-center">
                                        {item.exists === null && <span className="inline-flex items-center gap-2 text-gray-500"><span className="h-2.5 w-2.5 rounded-full bg-gray-300" />Validando</span>}
                                        {item.exists === false && <span className="inline-flex items-center gap-2 font-medium text-red-600"><span className="h-2.5 w-2.5 rounded-full bg-red-500" />No disponible</span>}
                                        {item.exists === true && item.variantActive === true && <span title="Variante activa" aria-label="Variante activa" className="inline-block h-3 w-3 rounded-full bg-green-500" />}
                                        {item.exists === true && item.variantActive === false && <span title="Variante desactivada" aria-label="Variante desactivada" className="inline-block h-3 w-3 rounded-full bg-red-500" />}
                                    </td>
                                </tr>
                            );
                        })}
                        </tbody>
                    </table>

                    <div className="p-6 bg-gray-50 border-t flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="space-y-3 rounded-md border bg-white p-3 shadow-sm">
                            <div className="flex items-center justify-between gap-4">
                                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Descuentos documento</span>
                                <button type="button" onClick={addDiscount} className="rounded-md border border-blue-200 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50">+ Agregar descuento</button>
                            </div>
                            <div className="space-y-2">
                                {discounts.map((discount, index) => <div key={discount.id} className="flex flex-wrap items-center gap-2">
                                    <span className="w-14 text-xs text-gray-500">Desc {index + 1}</span>
                                    <select value={discount.type} onChange={(event) => { const type = event.target.value as InvoiceDiscount['type']; updateDiscount(discount.id, { type, value: type === 'percentage' ? Math.min(100, discount.value) : discount.value }); }} className="rounded border bg-white px-2 py-1.5 text-sm">
                                        <option value="percentage">Porcentaje</option>
                                        <option value="amount">Monto</option>
                                    </select>
                                    <div className="flex overflow-hidden rounded border bg-white focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
                                        {discount.type === 'amount' && <span className="border-r bg-gray-50 px-2 py-1.5 text-sm text-gray-500">$</span>}
                                        <input
                                            aria-label={`Valor descuento ${index + 1}`}
                                            type="number"
                                            min="0"
                                            max={discount.type === 'percentage' ? 100 : undefined}
                                            value={discount.value}
                                            onFocus={(event) => event.currentTarget.select()}
                                            onChange={(event) => { const value = Math.max(0, Number(event.target.value) || 0); updateDiscount(discount.id, { value: discount.type === 'percentage' ? Math.min(100, value) : value }); }}
                                            className="w-24 px-2 py-1.5 text-right text-sm font-medium outline-none"
                                        />
                                        {discount.type === 'percentage' && <span className="border-l bg-gray-50 px-2 py-1.5 text-sm text-gray-500">%</span>}
                                    </div>
                                    <button type="button" onClick={() => removeDiscount(discount.id)} aria-label={`Quitar descuento ${index + 1}`} title="Quitar descuento" className="px-1.5 text-gray-400 hover:text-red-600">×</button>
                                </div>)}
                            </div>
                            <p className="text-xs text-gray-500">Se aplican en orden sobre el saldo restante.</p>
                        </div>

                        <div className="text-right space-y-1 font-medium text-sm text-gray-600 w-full md:w-auto">
                            <div className="flex justify-between md:justify-end gap-8">
                                <span>Subtotal Neto:</span>
                                <span className="font-mono">${invoiceSubtotalNet.toLocaleString('es-CL')}</span>
                            </div>
                            {appliedDiscount > 0 && (
                                <div className="flex justify-between md:justify-end gap-8 text-amber-600 text-xs">
                                    <span>Descuento aplicado en cascada:</span>
                                    <span className="font-mono">-${appliedDiscount.toLocaleString('es-CL')}</span>
                                </div>
                            )}
                            <div className="flex justify-between md:justify-end gap-8 border-t pt-1 font-bold text-gray-800 text-base">
                                <span>Total neto documento (control):</span>
                                <span className="text-blue-700 font-mono">${invoiceTotalNetFinal.toLocaleString('es-CL')}</span>
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {/* PASO 3 */}
            {items.length > 0 && (
                <section className={`p-6 rounded-lg border shadow-sm space-y-6 transition ${allSkusResolved ? 'bg-green-50/40 border-green-200' : 'bg-gray-50 border-gray-200 opacity-60'}`}>
                    <h2 className="text-lg font-semibold text-gray-700">3. Datos de Ingreso de Stock</h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="flex flex-col space-y-2">
                            <label className="text-sm font-medium text-gray-600">Sucursal de Destino</label>
                            <select
                                value={selectedOffice}
                                onChange={(e) => setSelectedOffice(e.target.value)}
                                disabled={!allSkusResolved || loading}
                                className="p-2 border rounded-md bg-white text-sm"
                            >
                                <option value="">-- Selecciona una sucursal --</option>
                                {offices.map(off => (
                                    <option key={off.id} value={off.id}>{off.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex flex-col space-y-2">
                            <label className="text-sm font-medium text-gray-600">Número del documento (solo números)</label>
                            <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                placeholder="Ej: 14850"
                                value={documentNumber}
                                onChange={(e) => setDocumentNumber(e.target.value.replace(/\D/g, ''))}
                                disabled={!allSkusResolved || loading}
                                className="p-2 border rounded-md bg-white text-sm"
                            />
                        </div>
                        <div className="flex flex-col space-y-2 md:col-span-2">
                            <label className="text-sm font-medium text-gray-600">Comentario de la recepción</label>
                            <textarea value={documentNote} onChange={(event) => setDocumentNote(event.target.value)} disabled={!allSkusResolved || loading} maxLength={500} rows={3} placeholder="Ej: Nota de venta del proveedor pendiente de factura" className="resize-y rounded-md border bg-white p-2 text-sm" />
                            <span className="text-right text-xs text-gray-400">{documentNote.length}/500</span>
                        </div>
                    </div>

                    <div className="pt-4 border-t flex justify-end">
                        <button
                            onClick={handleFinalSubmit}
                            disabled={!allSkusResolved || loading}
                            className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-md shadow hover:bg-blue-700 disabled:bg-gray-300 transition"
                        >
                            {loading ? 'Procesando Ingreso...' : 'Confirmar e Ingresar Stock'}
                        </button>
                    </div>
                </section>
            )}
        </div>
    );
}
