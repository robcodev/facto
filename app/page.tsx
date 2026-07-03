'use client';

import { useState, useEffect } from 'react';
import {
    checkSkuInBsale,
    createBsaleProduct,
    submitStockReception,
    getBsaleOffices
} from './reception/actions';

// Definición de tipos para el estado local
interface UiItem {
    sku: string;
    quantity: number;
    netUnitValue: number;
    totalNet: number;
    exists: boolean | null; // null = cargando/no validado, true = existe, false = no existe
    variantId: number | null;
    bsaleName: string | null;
    isCreating?: boolean;
}

interface Office {
    id: number;
    name: string;
}

export default function RecepcionPage() {
    // Estados de carga e información de Bsale
    const [loading, setLoading] = useState(false);
    const [offices, setOffices] = useState<Office[]>([]);

    // Datos del Paso 3
    const [selectedOffice, setSelectedOffice] = useState<string>('');
    const [documentNumber, setDocumentNumber] = useState<string>('');

    // Tabla de productos extraídos y validados
    const [items, setItems] = useState<UiItem[]>([]);

    // Cargar sucursales al montar la pantalla
    useEffect(() => {
        async function fetchOffices() {
            const res = await getBsaleOffices();
            if (res.success && res.offices) {
                setOffices(res.offices);
            }
        }
        fetchOffices();
    }, []);

    // PASO 1: Subir imagen y procesar con el Route Handler de Gemini
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading(true);
        setItems([]);

        const formData = new FormData();
        formData.append('file', file);

        try {
            // Le pegamos al backend que creamos en el paso 1
            const response = await fetch('/api/process-invoice', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) throw new Error('Error al procesar la factura con IA');

            const data = await response.json(); // { invoiceItems: [...] }

            if (data.invoiceItems && data.invoiceItems.length > 0) {
                // Inicializamos los ítems en la interfaz
                const initialItems: UiItem[] = data.invoiceItems.map((item: any) => ({
                    ...item,
                    exists: null,
                    variantId: null,
                    bsaleName: 'Validando con Bsale...'
                }));
                setItems(initialItems);

                // PASO 2: Validar de inmediato cada SKU en paralelo contra Bsale
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
            alert(error.message || 'Ocurrió un error en el procesamiento.');
        } finally {
            setLoading(false);
        }
    };

    // SUBPASO OPCIONAL: Crear el producto en caliente si no existe
    const handleCreateProduct = async (index: number) => {
        const item = items[index];
        // Solicitamos un nombre al usuario de forma sencilla vía prompt
        const nameInput = prompt(`Ingresa el nombre para el SKU: ${item.sku}`, `Producto Nuevo ${item.sku}`);
        if (!nameInput) return;

        // Solicitamos el precio final de venta
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

    // PASO 3: Enviar la recepción final de stock consolidada a Bsale
    const handleFinalSubmit = async () => {
        if (!selectedOffice) return alert('Debes seleccionar una sucursal.');
        if (!documentNumber.trim()) return alert('Debes ingresar el número de factura.');

        // Validar que no queden productos pendientes en rojo (sin variantId)
        const hasMissingProducts = items.some(item => !item.variantId);
        if (hasMissingProducts) {
            return alert('Debes resolver o crear todos los productos faltantes antes de ingresar el stock.');
        }

        setLoading(true);

        // Dentro de tu handleFinalSubmit en page.tsx:
        const payload = {
            officeId: Number(selectedOffice),
            documentNumber: documentNumber,
            details: items.map(item => ({
                sku: item.sku,
                quantity: item.quantity,
                netUnitValue: item.netUnitValue,
            }))
        };

        const res = await submitStockReception(payload);
        setLoading(false);

        if (res.success) {
            alert(`¡Recepción de Stock creada exitosamente en Bsale! ID: ${res.receptionId}`);
            // Limpiamos la pantalla
            setItems([]);
            setDocumentNumber('');
        } else {
            alert(`Error al guardar la recepción: ${res.error}`);
        }
    };

    // Verificar si todo está listo para proceder con el Paso 3
    const allSkusResolved = items.length > 0 && items.every(item => item.exists === true);

    return (
        <div className="max-w-5xl mx-auto p-6 space-y-8">
            <header className="border-b pb-4">
                <h1 className="text-2xl font-bold text-gray-800">Recepción de Stock</h1>
            </header>

            {/* PASO 1: Subida de archivo */}
            <section className="bg-white p-6 rounded-lg border shadow-sm space-y-4">
                <h2 className="text-lg font-semibold text-gray-700">1. Carga la Factura</h2>
                <div className="flex items-center space-x-4">
                    <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={handleFileUpload}
                        disabled={loading}
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
                    />
                    {loading && <span className="text-sm text-blue-600 animate-pulse font-medium">Procesando con IA...</span>}
                </div>
            </section>

            {/* PASO 2: Tabla de Validación */}
            {items.length > 0 && (
                <section className="bg-white rounded-lg border shadow-sm overflow-hidden">
                    <div className="p-6 bg-gray-50 border-b">
                        <h2 className="text-lg font-semibold text-gray-700">2. Validación de Productos (SKU)</h2>
                    </div>
                    <table className="w-full text-left border-collapse">
                        <thead>
                        <tr className="bg-gray-100 text-xs font-semibold text-gray-600 uppercase border-b">
                            <th className="p-4">SKU Factura</th>
                            <th className="p-4">Cantidad</th>
                            <th className="p-4">Costo Unitario Net</th>
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
                                    {item.exists === null && (
                                        <span className="text-gray-400 animate-pulse">Validando...</span>
                                    )}
                                    {item.exists === true && (
                                        <span className="text-green-600 font-medium">✓ {item.bsaleName}</span>
                                    )}
                                    {item.exists === false && (
                                        <span className="text-red-500 font-medium">✗ No existe en sistema</span>
                                    )}
                                </td>
                                <td className="p-4 text-right">
                                    {item.exists === false && (
                                        <button
                                            onClick={() => handleCreateProduct(index)}
                                            disabled={item.isCreating}
                                            className="px-3 py-1 text-xs bg-amber-500 text-white rounded hover:bg-amber-600 transition disabled:opacity-50"
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

            {/* PASO 3: Datos de Destino y Confirmación Final */}
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
                                className="p-2 border rounded-md bg-white text-sm disabled:bg-gray-100"
                            >
                                <option value="">-- Selecciona una sucursal --</option>
                                {offices.map(off => (
                                    <option key={off.id} value={off.id}>{off.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex flex-col space-y-2">
                            <label className="text-sm font-medium text-gray-600">Número de Factura</label>
                            <input
                                type="text"
                                placeholder="Ej: 14850"
                                value={documentNumber}
                                onChange={(e) => setDocumentNumber(e.target.value)}
                                disabled={!allSkusResolved || loading}
                                className="p-2 border rounded-md bg-white text-sm disabled:bg-gray-100"
                            />
                        </div>
                    </div>

                    <div className="pt-4 border-t flex justify-end">
                        <button
                            onClick={handleFinalSubmit}
                            disabled={!allSkusResolved || loading}
                            className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-md shadow hover:bg-blue-700 transition disabled:bg-gray-300 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Procesando Ingreso...' : 'Confirmar e Ingresar Stock'}
                        </button>
                    </div>
                </section>
            )}
        </div>
    );
}