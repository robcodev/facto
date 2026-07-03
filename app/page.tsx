'use client';

import { useState, useEffect } from 'react';
import { checkSkuInBsale, createBsaleProduct, submitStockReception, getBsaleOffices } from './reception/actions';

interface UiItem {
    sku: string;
    quantity: number;
    netUnitValue: number;
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

    useEffect(() => {
        async function fetchOffices() {
            const res = await getBsaleOffices();
            if (res.success && res.offices) setOffices(res.offices);
        }
        fetchOffices();
    }, []);

    // PASO 1: Subir una o más páginas/imágenes de la factura
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const fileList = e.target.files;
        if (!fileList || fileList.length === 0) return;

        setLoading(true);
        setItems([]);

        const formData = new FormData();
        // Metemos todos los archivos seleccionados bajo la misma llave 'files'
        Array.from(fileList).forEach((file) => {
            formData.append('files', file);
        });

        try {
            const response = await fetch('/api/process-invoice', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) throw new Error('Error al procesar la factura con IA');

            const data = await response.json(); // { documentNumber: "...", invoiceItems: [...] }

            // Si la IA logró extraer un número de factura, lo autocompletamos
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

                // PASO 2: Validar SKUs en paralelo
                await Promise.all(
                    initialItems.map(async (item, index) => {
                        const validation = await checkSkuInBsale(item.sku);
                        setItems(prev => {
                            const updated = [...prev];
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

        const res = await createBsaleProduct({
            name: nameInput,
            sku: item.sku,
            netUnitValue: item.netUnitValue,
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

    // PASO 3: Enviar la recepción final adaptada a la documentación oficial
    const handleFinalSubmit = async () => {
        if (!selectedOffice) return alert('Debes seleccionar una sucursal.');
        if (!documentNumber.trim()) return alert('Debes ingresar el número de factura.');

        setLoading(true);

        const payload = {
            officeId: Number(selectedOffice),
            documentNumber: documentNumber, // Va limpio como string de puros números
            details: items.map(item => ({
                sku: item.sku, // Mandamos el SKU al campo 'code' del backend
                quantity: item.quantity,
                netUnitValue: item.netUnitValue, // Costo unitario neto ya calculado con descuento
            }))
        };

        const res = await submitStockReception(payload);
        setLoading(false);

        if (res.success) {
            alert(`¡Recepción de Stock creada exitosamente en Bsale! ID: ${res.receptionId}`);
            setItems([]);
            setDocumentNumber('');
        } else {
            alert(`Error al guardar la recepción: ${res.error}`);
        }
    };

    const allSkusResolved = items.length > 0 && items.every(item => item.exists === true);

    return (
        <div className="max-w-5xl mx-auto p-6 space-y-8">
            <header className="border-b pb-4">
                <h1 className="text-2xl font-bold text-gray-800">Recepción de Stock Automatizada</h1>
                <p className="text-sm text-gray-500">Sube una o más páginas de tu factura. La IA calculará los costos con descuento real.</p>
            </header>

            {/* PASO 1: Subida de múltiples archivos */}
            <section className="bg-white p-6 rounded-lg border shadow-sm space-y-4">
                <h2 className="text-lg font-semibold text-gray-700">1. Carga la Factura (Soporta múltiples páginas)</h2>
                <div className="flex items-center space-x-4">
                    <input
                        type="file"
                        accept="image/*,application/pdf"
                        multiple // PERMITE SELECCIONAR MÚLTIPLES IMÁGENES
                        onChange={handleFileUpload}
                        disabled={loading}
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
                    />
                    {loading && <span className="text-sm text-blue-600 animate-pulse font-medium">Procesando con IA...</span>}
                </div>
            </section>

            {/* PASO 2: Tabla de Ítems */}
            {items.length > 0 && (
                <section className="bg-white rounded-lg border shadow-sm overflow-hidden">
                    <div className="p-6 bg-gray-50 border-b">
                        <h2 className="text-lg font-semibold text-gray-700">2. Validación de Productos (SKU) y Costo Real Neto</h2>
                    </div>
                    <table className="w-full text-left border-collapse">
                        <thead>
                        <tr className="bg-gray-100 text-xs font-semibold text-gray-600 uppercase border-b">
                            <th className="p-4">SKU Factura</th>
                            <th className="p-4">Cantidad</th>
                            <th className="p-4">Costo Real Unitario (Neto)</th>
                            <th className="p-4">Total Neto</th>
                            <th className="p-4">Estado Bsale</th>
                            <th className="p-4 text-right">Acción</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y text-sm text-gray-600">
                        {items.map((item, index) => (
                            <tr key={index} className="hover:bg-gray-50">
                                <td className="p-4 font-mono font-medium">{item.sku}</td>
                                <td className="p-4">{item.quantity}</td>
                                <td className="p-4">${item.netUnitValue.toLocaleString('es-CL')}</td>
                                <td className="p-4">${item.totalNet.toLocaleString('es-CL')}</td>
                                <td className="p-4">
                                    {item.exists === null && <span className="text-gray-400 animate-pulse">Validando...</span>}
                                    {item.exists === true && <span className="text-green-600 font-medium">✓ {item.bsaleName}</span>}
                                    {item.exists === false && <span className="text-red-500 font-medium">✗ No existe</span>}
                                </td>
                                <td className="p-4 text-right">
                                    {item.exists === false && (
                                        <button
                                            onClick={() => handleCreateProduct(index)}
                                            disabled={item.isCreating}
                                            className="px-3 py-1 text-xs bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-50"
                                        >
                                            {item.isCreating ? 'Creando...' : '+ Crear Producto'}
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </section>
            )}

            {/* PASO 3: Sucursal y Validación estricta de números */}
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
                                // SEGUNDO TODO: Remueve inmediatamente cualquier carácter que no sea número
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
                            className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-md shadow hover:bg-blue-700 disabled:bg-gray-300"
                        >
                            {loading ? 'Procesando Ingreso...' : 'Confirmar e Ingresar Stock'}
                        </button>
                    </div>
                </section>
            )}
        </div>
    );
}