'use client';

import { useState, useEffect } from 'react';
import { checkSkuInBsale, createBsaleProduct, submitStockReception, getBsaleOffices } from './reception/actions';

interface UiItem {
    sku: string;
    quantity: number;
    netUnitValue: number; // Costo base de lista extraído
    totalNet: number;
    exists: boolean | null;
    variantId: number | null;
    bsaleName: string | null;
    isCreating?: boolean;
}

interface Office {
    id: number;
    name: string;
}

export default function RecepcionPage() {
    const [loading, setLoading] = useState(false);
    const [offices, setOffices] = useState<Office[]>([]);
    const [selectedOffice, setSelectedOffice] = useState<string>('');
    const [documentNumber, setDocumentNumber] = useState<string>('');
    const [items, setItems] = useState<UiItem[]>([]);

    // Estados para los descuentos globales en cascada
    const [discount1, setDiscount1] = useState<number>(0);
    const [discount2, setDiscount2] = useState<number>(0);

    useEffect(() => {
        async function fetchOffices() {
            const res = await getBsaleOffices();
            if (res.success && res.offices) setOffices(res.offices);
        }
        fetchOffices();
    }, []);

    // Factor dinámico compuesto de descuento (Ej: 7% y 10% -> 0.93 * 0.90 = 0.837)
    const factorDiscount1 = 1 - (discount1 / 100);
    const factorDiscount2 = 1 - (discount2 / 100);
    const compositeDiscountFactor = factorDiscount1 * factorDiscount2;

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const fileList = e.target.files;
        if (!fileList || fileList.length === 0) return;

        setLoading(true);
        setItems([]);
        setDiscount1(0);
        setDiscount2(0);

        const formData = new FormData();
        Array.from(fileList).forEach((file) => {
            formData.append('files', file);
        });

        try {
            const response = await fetch('/api/process-invoice', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) throw new Error('Error al procesar la factura con IA');
            const data = await response.json();

            if (data.documentNumber) {
                setDocumentNumber(data.documentNumber.replace(/\D/g, ''));
            }

            if (data.invoiceItems && data.invoiceItems.length > 0) {
                const initialItems: UiItem[] = data.invoiceItems.map((item: any) => ({
                    ...item,
                    exists: null,
                    variantId: null,
                    bsaleName: 'Validando con Bsale...'
                }));
                setItems(initialItems);

                await Promise.all(
                    initialItems.map(async (item, index) => {
                        const validation = await checkSkuInBsale(item.sku);
                        setItems(prev => {
                            const updated = [...prev];
                            if (!updated[index]) return prev;
                            if (validation.exists) {
                                updated[index].exists = true;
                                updated[index].variantId = validation.variantId ?? null;
                                updated[index].bsaleName = validation.name ?? 'Encontrado';
                            } else {
                                updated[index].exists = false;
                                updated[index].bsaleName = 'Producto No Existe';
                            }
                            return updated;
                        });
                    })
                );
            }
        } catch (error: any) {
            alert(error.message || 'Ocurrió un error.');
        } finally {
            setLoading(false);
        }
    };

    const handleAddItemManual = () => {
        setItems(prev => [...prev, {
            sku: '',
            quantity: 1,
            netUnitValue: 0,
            totalNet: 0,
            exists: false,
            variantId: null,
            bsaleName: 'Digita un SKU para buscar'
        }]);
    };

    const handleSkuChange = async (index: number, newSku: string) => {
        if (!newSku.trim()) return;

        setItems(prev => {
            const updated = [...prev];
            updated[index].sku = newSku;
            updated[index].exists = null;
            updated[index].bsaleName = 'Validando corrección...';
            return updated;
        });

        const validation = await checkSkuInBsale(newSku);

        setItems(prev => {
            const updated = [...prev];
            if (updated[index] && updated[index].sku === newSku) {
                if (validation.exists) {
                    updated[index].exists = true;
                    updated[index].variantId = validation.variantId ?? null;
                    updated[index].bsaleName = validation.name ?? 'Encontrado';
                } else {
                    updated[index].exists = false;
                    updated[index].variantId = null;
                    updated[index].bsaleName = 'Producto No Existe';
                }
            }
            return updated;
        });
    };

    const handleCreateProduct = async (index: number) => {
        const item = items[index];
        const nameInput = prompt(`Ingresa el nombre para el SKU: ${item.sku}`, `Producto Nuevo ${item.sku}`);
        if (!nameInput) return;

        const priceInput = prompt(`Precio de venta final para ${item.sku}:`, '1990');
        if (!priceInput) return;

        setItems(prev => {
            const updated = [...prev];
            updated[index].isCreating = true;
            return updated;
        });

        const realProratedCost = Math.round(item.netUnitValue * compositeDiscountFactor);

        const res = await createBsaleProduct({
            name: nameInput,
            code: item.sku,
            netUnitValue: realProratedCost,
            priceValue: Number(priceInput)
        });

        setItems(prev => {
            const updated = [...prev];
            updated[index].isCreating = false;
            if (res.success && res.variantId) {
                updated[index].exists = true;
                updated[index].variantId = res.variantId;
                updated[index].bsaleName = nameInput;
            } else {
                alert(`Error al crear producto: ${res.error}`);
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

    const handleRemoveItem = (index: number) => {
        setItems(prev => prev.filter((_, i) => i !== index));
    };

    const invoiceSubtotalNet = items.reduce((acc, item) => acc + item.totalNet, 0);
    const invoiceTotalNetFinal = Math.round(invoiceSubtotalNet * compositeDiscountFactor);

    const handleFinalSubmit = async () => {
        if (!selectedOffice) return alert('Debes seleccionar una sucursal.');
        if (!documentNumber.trim()) return alert('Debes ingresar el número de factura.');

        setLoading(true);

        const payload = {
            officeId: Number(selectedOffice),
            documentNumber: documentNumber,
            details: items.map(item => ({
                code: item.sku,
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
            setDiscount1(0);
            setDiscount2(0);
        } else {
            alert(`Error al guardar la recepción: ${res.error}`);
        }
    };

    const allSkusResolved = items.length > 0 && items.every(item => item.exists === true && item.sku.trim() !== '');

    return (
        <div className="max-w-5xl mx-auto p-6 space-y-8">
            <header className="border-b pb-4">
                <h1 className="text-2xl font-bold text-gray-800">Recepción de Stock Automatizada</h1>
            </header>

            {/* PASO 1: Subida de Archivos y Botón de Inicio Manual siempre visible */}
            <section className="bg-white p-6 rounded-lg border shadow-sm space-y-4">
                <div className="flex justify-between items-center">
                    <h2 className="text-lg font-semibold text-gray-700">1. Carga la Factura u Operación Manual</h2>
                    <button
                        type="button"
                        onClick={handleAddItemManual}
                        className="px-4 py-2 text-sm bg-gray-800 text-white rounded-md hover:bg-gray-700 font-medium shadow-sm transition"
                    >
                        ➕ Agregar Ítem Manual
                    </button>
                </div>
                <div className="flex items-center space-x-4">
                    <input
                        type="file"
                        accept="image/*,application/pdf"
                        multiple
                        onChange={handleFileUpload}
                        disabled={loading}
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
                    />
                    {loading && <span className="text-sm text-blue-600 animate-pulse font-medium">Procesando...</span>}
                </div>
            </section>

            {/* PASO 2: Tabla de Ítems */}
            {items.length > 0 && (
                <section className="bg-white rounded-lg border shadow-sm overflow-hidden">
                    <div className="p-6 bg-gray-50 border-b flex justify-between items-center">
                        <h2 className="text-lg font-semibold text-gray-700">2. Validación de Productos (SKU) y Prorrateo de Costos</h2>
                        {/* Se mantiene una réplica rápida opcional aquí para comodidad */}
                        <button
                            type="button"
                            onClick={handleAddItemManual}
                            className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300 font-medium transition"
                        >
                            ➕ Otro Ítem Manual
                        </button>
                    </div>
                    <table className="w-full text-left border-collapse">
                        <thead>
                        <tr className="bg-gray-100 text-xs font-semibold text-gray-600 uppercase border-b">
                            <th className="p-4 text-left w-[50px]">#</th>
                            <th className="p-4">SKU Factura</th>
                            <th className="p-4 w-[90px]">Cantidad</th>
                            <th className="p-4">Costo Lista (Neto)</th>
                            <th className="p-4 text-blue-700">Costo Real Prorrateado</th>
                            <th className="p-4">Total Línea (Lista)</th>
                            <th className="p-4">Estado Bsale</th>
                            <th className="p-4 text-right">Acción</th>
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
                                            value={item.sku}
                                            onChange={(e) => {
                                                setItems(prev => {
                                                    const updated = [...prev];
                                                    updated[index].sku = e.target.value;
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
                                        {item.sku === '' && <span className="text-amber-500 font-medium">Falta SKU</span>}
                                        {item.sku !== '' && item.exists === null && <span className="text-gray-400 animate-pulse">Validando...</span>}
                                        {item.sku !== '' && item.exists === true && <span className="text-green-600 font-medium">✓ {item.bsaleName}</span>}
                                        {item.sku !== '' && item.exists === false && <span className="text-red-500 font-medium">✗ No existe</span>}
                                    </td>
                                    <td className="p-4 text-right space-x-2">
                                        {item.exists === false && item.sku !== '' && (
                                            <button
                                                onClick={() => handleCreateProduct(index)}
                                                disabled={item.isCreating}
                                                className="px-3 py-1 text-xs bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-50"
                                            >
                                                {item.isCreating ? 'Creando...' : '+ Crear'}
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleRemoveItem(index)}
                                            className="text-xs text-gray-400 hover:text-red-500 font-medium p-1"
                                            title="Eliminar fila"
                                        >
                                            ✕
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                        </tbody>
                    </table>

                    <div className="p-6 bg-gray-50 border-t flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex flex-wrap gap-4 items-center bg-white p-3 border rounded-md shadow-sm">
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Descuentos Factura:</span>
                            <div className="flex items-center space-x-1">
                                <label className="text-xs text-gray-600">Desc 1:</label>
                                <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={discount1}
                                    onChange={(e) => setDiscount1(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                                    className="w-14 px-1 py-0.5 border rounded text-center text-sm font-medium focus:ring-2 focus:ring-blue-500"
                                    placeholder="0"
                                />
                                <span className="text-sm text-gray-500">%</span>
                            </div>
                            <div className="flex items-center space-x-1">
                                <label className="text-xs text-gray-600">Desc 2:</label>
                                <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={discount2}
                                    onChange={(e) => setDiscount2(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                                    className="w-14 px-1 py-0.5 border rounded text-center text-sm font-medium focus:ring-2 focus:ring-blue-500"
                                    placeholder="0"
                                />
                                <span className="text-sm text-gray-500">%</span>
                            </div>
                        </div>

                        <div className="text-right space-y-1 font-medium text-sm text-gray-600 w-full md:w-auto">
                            <div className="flex justify-between md:justify-end gap-8">
                                <span>Subtotal Neto:</span>
                                <span className="font-mono">${invoiceSubtotalNet.toLocaleString('es-CL')}</span>
                            </div>
                            {(discount1 > 0 || discount2 > 0) && (
                                <div className="flex justify-between md:justify-end gap-8 text-amber-600 text-xs">
                                    <span>Descuento aplicado en cascada:</span>
                                    <span className="font-mono">-${(invoiceSubtotalNet - invoiceTotalNetFinal).toLocaleString('es-CL')}</span>
                                </div>
                            )}
                            <div className="flex justify-between md:justify-end gap-8 border-t pt-1 font-bold text-gray-800 text-base">
                                <span>Total Neto Factura (Control):</span>
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
                            <label className="text-sm font-medium text-gray-600">Número de Factura (Solo Números)</label>
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