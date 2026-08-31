'use client';

import { useEffect, useMemo, useState } from 'react';
import { getBsaleOffices } from '@/app/reception/actions';
import type { BsaleOffice } from '@/app/reception/types';
import { submitFullPresale, submitFullReception, validateFullSku, validateFullSkus } from './actions';
import type { FullBsaleValidation, FullReportAnalysis } from './types';

type ValidationMap = Record<string, FullBsaleValidation>;

const formatClp = (value: number) => new Intl.NumberFormat('es-CL', {
    style: 'currency', currency: 'CLP', maximumFractionDigits: 0,
}).format(value);
const formatClpDetailed = (value: number) => new Intl.NumberFormat('es-CL', {
    style: 'currency', currency: 'CLP', minimumFractionDigits: 0, maximumFractionDigits: 2,
}).format(value);

export default function FullPage() {
    const [workflow, setWorkflow] = useState<'reception' | 'presale' | null>(null);
    const [analysis, setAnalysis] = useState<FullReportAnalysis | null>(null);
    const [validations, setValidations] = useState<ValidationMap>({});
    const [editedSkus, setEditedSkus] = useState<Record<string, string>>({});
    const [validatingRows, setValidatingRows] = useState<Record<string, boolean>>({});
    const [offices, setOffices] = useState<BsaleOffice[]>([]);
    const [selectedOffice, setSelectedOffice] = useState('');
    const [documentNumber, setDocumentNumber] = useState('');
    const [loading, setLoading] = useState(false);
    const [validating, setValidating] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [receptionId, setReceptionId] = useState<number | null>(null);
    const [presalePrices, setPresalePrices] = useState<Record<string, number>>({});
    const [creatingPresale, setCreatingPresale] = useState(false);
    const [presaleResult, setPresaleResult] = useState<{ number: number | null; url: string | null } | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    useEffect(() => {
        getBsaleOffices().then((result) => {
            if (result.success) setOffices(result.offices);
        });
    }, []);

    const validationList = useMemo(() => Object.values(validations), [validations]);
    const hasRowsValidating = Object.keys(validatingRows).length > 0;
    const allValidated = Boolean(
        analysis?.items.length &&
        !hasRowsValidating &&
        validationList.length === analysis.items.length &&
        validationList.every((item) => item.originalExists && item.fullExists && Number(item.averageCost) > 0 && !item.error)
    );
    const productsValidated = Boolean(
        analysis?.items.length &&
        !hasRowsValidating &&
        validationList.length === analysis.items.length &&
        validationList.every((item) => item.originalExists && item.fullExists && !item.error)
    );

    const selectWorkflow = (next: 'reception' | 'presale') => {
        if (workflow === next) return;
        setWorkflow(next);
        setAnalysis(null);
        setValidations({});
        setEditedSkus({});
        setReceptionId(null);
        setPresaleResult(null);
        setPresalePrices({});
        setMessage(null);
    };

    const totalCost = analysis?.items.reduce((sum, item) => {
        const cost = validations[item.originalSku]?.averageCost ?? 0;
        return sum + cost * item.quantity;
    }, 0) ?? 0;
    const presaleCalculatedWithTax = analysis?.items.reduce((sum, item) => {
        const sku = `FULL${(editedSkus[item.originalSku] ?? item.originalSku).trim()}`;
        return sum + (presalePrices[sku] ?? 0) * item.quantity * 1.19;
    }, 0) ?? 0;
    const presaleDifference = presaleCalculatedWithTax - (analysis?.totalReceivedWithTax ?? 0);

    const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setLoading(true);
        setMessage(null);
        setAnalysis(null);
        setValidations({});
        setEditedSkus({});
        setValidatingRows({});
        setReceptionId(null);
        setPresalePrices({});
        setPresaleResult(null);

        try {
            const formData = new FormData();
            formData.append('file', file);
            const response = await fetch('/api/full/analyze', { method: 'POST', body: formData });
            const result = await response.json() as FullReportAnalysis & { error?: string };
            if (!response.ok) throw new Error(result.error || 'No pudimos analizar el reporte.');
            setAnalysis(result);
            setPresalePrices(Object.fromEntries(result.items.map((item) => [item.fullSku, item.presaleNetUnitValue])));
            setDocumentNumber(new Date().toISOString().slice(0, 7).replace('-', ''));
            if (workflow === 'presale') {
                setValidating(true);
                const validationResults = await validateFullSkus(result.items.map((item) => item.originalSku));
                setValidations(Object.fromEntries(result.items.map((item, index) => [item.originalSku, validationResults[index]])));
            }
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'No pudimos analizar el reporte.');
        } finally {
            setLoading(false);
            setValidating(false);
        }
    };

    const handleValidate = async () => {
        if (!analysis) return;
        setValidating(true);
        setMessage(null);
        setValidations({});

        const reportSkus = analysis.items.map((item) => item.originalSku);
        const currentSkus = reportSkus.map((reportSku) => (editedSkus[reportSku] ?? reportSku).trim());
        const results = await validateFullSkus(currentSkus);
        setValidations(Object.fromEntries(reportSkus.map((reportSku, index) => [reportSku, results[index]])));
        setValidating(false);
    };

    const handleSkuChange = (reportSku: string, value: string) => {
        const nextSku = value.trimStart();
        const previousFullSku = `FULL${(editedSkus[reportSku] ?? reportSku).trim()}`;
        const nextFullSku = `FULL${nextSku.trim()}`;
        setEditedSkus((current) => ({ ...current, [reportSku]: nextSku }));
        setPresalePrices((current) => {
            if (previousFullSku === nextFullSku) return current;
            const next = { ...current, [nextFullSku]: current[previousFullSku] ?? 0 };
            delete next[previousFullSku];
            return next;
        });
        setValidations((current) => {
            const next = { ...current };
            delete next[reportSku];
            return next;
        });
    };

    const handleValidateOne = async (reportSku: string) => {
        const currentSku = (editedSkus[reportSku] ?? reportSku).trim();
        if (!currentSku) {
            setMessage('El SKU original no puede estar vacío.');
            return;
        }

        setMessage(null);
        setValidatingRows((current) => ({ ...current, [reportSku]: true }));
        const validation = await validateFullSku(currentSku);
        setValidations((current) => ({ ...current, [reportSku]: validation }));
        setValidatingRows((current) => {
            const next = { ...current };
            delete next[reportSku];
            return next;
        });
    };

    const handleCostChange = (originalSku: string, value: string) => {
        const cost = Number(value);
        setValidations((current) => {
            const validation = current[originalSku];
            if (!validation) return current;
            return {
                ...current,
                [originalSku]: {
                    ...validation,
                    averageCost: Number.isFinite(cost) ? cost : 0,
                    costSource: 'manual',
                    error: undefined,
                },
            };
        });
    };

    const handleSubmit = async () => {
        if (!analysis || !allValidated) return;
        if (!selectedOffice) return setMessage('Selecciona la sucursal donde se registrará la recepción.');
        if (!/^\d+$/.test(documentNumber) || Number(documentNumber) <= 0) {
            return setMessage('Ingresa una referencia numérica válida para la recepción.');
        }
        if (!window.confirm(`Se ingresarán ${analysis.includedUnits} unidades en ${analysis.items.length} productos FULL. ¿Continuar?`)) return;

        setSubmitting(true);
        setMessage(null);
        const result = await submitFullReception({
            officeId: Number(selectedOffice),
            documentNumber,
            details: analysis.items.map((item) => ({
                code: `FULL${(editedSkus[item.originalSku] ?? item.originalSku).trim()}`,
                quantity: item.quantity,
                netUnitValue: Math.round(validations[item.originalSku].averageCost ?? 0),
            })),
        });
        setSubmitting(false);

        if (result.success) {
            setReceptionId(result.receptionId ?? null);
            setPresalePrices(Object.fromEntries(analysis.items.map((item) => [finalFullSku(item.originalSku), item.presaleNetUnitValue])));
            setMessage(`Recepción creada correctamente en Bsale. ID: ${result.receptionId ?? 'sin ID'}`);
        } else {
            setMessage(result.error ?? 'Bsale rechazó la recepción.');
        }
    };

    const finalFullSku = (reportSku: string) => `FULL${(editedSkus[reportSku] ?? reportSku).trim()}`;

    const handlePresalePriceChange = (sku: string, value: string) => {
        const price = Number(value);
        setPresalePrices((current) => ({ ...current, [sku]: Number.isFinite(price) ? price : 0 }));
    };

    const handlePresaleGrossPriceChange = (sku: string, value: string) => {
        const grossPrice = Number(value);
        handlePresalePriceChange(sku, Number.isFinite(grossPrice) ? String(grossPrice / 1.19) : '0');
    };

    const handleCreatePresale = async () => {
        if (!analysis || !selectedOffice) return setMessage('Selecciona la sucursal.');
        if (!/^\d+$/.test(documentNumber) || Number(documentNumber) <= 0) return setMessage('Ingresa una referencia numérica válida.');
        const details = analysis.items.map((item) => ({
            code: finalFullSku(item.originalSku),
            quantity: item.quantity,
            netUnitValue: presalePrices[finalFullSku(item.originalSku)] ?? 0,
        }));
        if (details.some((item) => item.netUnitValue <= 0)) return setMessage('Corrige los precios marcados en rojo antes de crear la preventa.');
        if (!window.confirm(`Se creará la preventa final en Bsale con ${details.length} productos y ${analysis.includedUnits} unidades. No descontará stock. ¿Continuar?`)) return;

        setCreatingPresale(true);
        setMessage(null);
        const result = await submitFullPresale({
            officeId: Number(selectedOffice),
            details,
        });
        setCreatingPresale(false);
        if (!result.success) return setMessage(result.error ?? 'Bsale rechazó la preventa.');
        setPresaleResult({ number: result.documentNumber, url: result.url });
        setMessage(`Preventa creada correctamente. Número: ${result.documentNumber ?? 'sin número'}`);
    };

    return (
        <div className="mx-auto max-w-7xl space-y-6 p-6">
            <header className="border-b pb-4">
                <h1 className="text-2xl font-bold text-gray-900">Mercado Libre Full</h1>
                <p className="mt-1 text-sm text-gray-600">Elige qué proceso quieres preparar y carga su reporte de Mercado Libre.</p>
            </header>

            <section className="grid gap-4 sm:grid-cols-2">
                <button type="button" onClick={() => selectWorkflow('reception')} className={`rounded-lg border-2 p-6 text-left shadow-sm transition ${workflow === 'reception' ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white hover:border-green-300'}`}><span className="text-lg font-bold text-gray-900">Recepción Full</span><span className="mt-2 block text-sm text-gray-600">Sube un Excel para revisar SKU, cantidades y costos antes de ingresar stock.</span></button>
                <button type="button" onClick={() => selectWorkflow('presale')} className={`rounded-lg border-2 p-6 text-left shadow-sm transition ${workflow === 'presale' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-blue-300'}`}><span className="text-lg font-bold text-gray-900">Preventa Full</span><span className="mt-2 block text-sm text-gray-600">Sube un Excel para revisar SKU, cantidades e importes finales antes de crear la preventa.</span></button>
            </section>

            {workflow && <section className="space-y-4 rounded-lg border bg-white p-6 shadow-sm">
                <div>
                    <h2 className="font-semibold text-gray-800">1. Carga el Excel para {workflow === 'reception' ? 'la recepción' : 'la preventa'}</h2>
                    <p className="mt-1 text-sm text-gray-500">Se aceptan archivos .xlsx de hasta 5 MB. Las compras con varios productos se separan por SKU.</p>
                </div>
                <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleFile} disabled={loading || validating || submitting} className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:font-semibold file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50" />
                {loading && <p className="text-sm font-medium text-blue-600">Analizando reporte…</p>}
                {message && <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">{message}</p>}
            </section>}

            {analysis && (
                <>
                    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <Summary label="Filas del reporte" value={analysis.sourceRows} />
                        <Summary label="Ventas entregadas" value={analysis.includedRows} />
                        <Summary label={workflow === 'reception' ? 'Unidades a recibir' : 'Unidades en preventa'} value={analysis.includedUnits} />
                        <Summary label="SKU distintos" value={analysis.items.length} />
                    </section>
                    <section className="grid gap-4 sm:grid-cols-2">
                        <div className="rounded-lg border bg-white p-4 shadow-sm"><p className="text-xs font-medium uppercase tracking-wide text-gray-500">Importe final recibido según Excel</p><p className="mt-2 text-2xl font-bold text-gray-900">{formatClpDetailed(analysis.totalReceivedWithTax)}</p></div>
                        <div className="rounded-lg border bg-white p-4 shadow-sm"><p className="text-xs font-medium uppercase tracking-wide text-gray-500">Importe distribuido desde compras combinadas</p><p className="mt-2 text-2xl font-bold text-gray-900">{formatClpDetailed(analysis.combinedAllocatedWithTax)}</p><p className="mt-1 text-xs text-gray-500">Asignado proporcionalmente según el precio publicado de cada producto.</p></div>
                    </section>

                    {workflow === 'reception' && <section className="space-y-4 rounded-lg border bg-white p-6 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h2 className="font-semibold text-gray-800">2. Valida {workflow === 'reception' ? 'productos y costos' : 'productos'} en Bsale</h2>
                                <p className="mt-1 text-sm text-gray-500">{workflow === 'reception' ? 'Se revisa el SKU original, el SKU con prefijo FULL y el costo de su recepción más reciente.' : 'Se revisa que el SKU original y su SKU con prefijo FULL existan. Los precios se calculan desde el Excel.'}</p>
                            </div>
                            <button onClick={handleValidate} disabled={validating || analysis.items.length === 0} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                                {validating ? (workflow === 'reception' ? 'Validando productos y buscando costos…' : 'Validando productos…') : 'Validar en Bsale'}
                            </button>
                        </div>

                        <div className="overflow-x-auto rounded-md border">
                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                                    <tr><th className="px-3 py-3">SKU original</th><th className="px-3 py-3">SKU FULL</th><th className="px-3 py-3 text-right">Cantidad</th>{workflow === 'reception' && <th className="px-3 py-3 text-right">Último costo</th>}<th className="px-3 py-3">Validación</th><th className="px-3 py-3">Acción</th></tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {analysis.items.map((item) => {
                                        const currentSku = editedSkus[item.originalSku] ?? item.originalSku;
                                        const wasEdited = currentSku.trim() !== item.originalSku;
                                        const currentFullSku = `FULL${currentSku.trim()}`;
                                        const validation = validations[item.originalSku];
                                        const hasValidCost = Number(validation?.averageCost) > 0;
                                        const ok = validation?.originalExists && validation?.fullExists && hasValidCost && !validation.error;
                                        const hasProblem = Boolean(validation && !ok);
                                        return <tr key={item.originalSku} className={hasProblem ? 'bg-red-50' : undefined}>
                                            <td className="px-3 py-3">
                                                <input
                                                    type="text"
                                                    value={currentSku}
                                                    onChange={(event) => handleSkuChange(item.originalSku, event.target.value)}
                                                    disabled={validating || Boolean(validatingRows[item.originalSku]) || submitting}
                                                    aria-label={`SKU original de ${item.originalSku}`}
                                                    className={`w-44 rounded-md border px-2 py-1.5 font-medium ${wasEdited ? 'border-amber-400 bg-amber-50 text-amber-900' : 'border-gray-300 bg-white text-gray-900'}`}
                                                />
                                                {wasEdited && <div className="mt-1 text-xs font-medium text-amber-700">Modificado manualmente · antes: {item.originalSku}</div>}
                                                <div className="mt-1 max-w-xs truncate text-xs text-gray-500" title={item.title}>{item.title}</div>
                                            </td>
                                            <td className="px-3 py-3 font-medium text-gray-700">{currentFullSku}</td>
                                            <td className="px-3 py-3 text-right tabular-nums">{item.quantity}</td>
                                            {workflow === 'reception' && <td className="px-3 py-3 text-right">
                                                {validation ? <div>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="1"
                                                        value={validation.averageCost ?? 0}
                                                        onChange={(event) => handleCostChange(item.originalSku, event.target.value)}
                                                        aria-label={`Costo de ${item.originalSku}`}
                                                        className={`w-32 rounded-md border px-2 py-1.5 text-right tabular-nums ${hasValidCost ? 'border-gray-300 bg-white' : 'border-red-500 bg-red-50 text-red-800'}`}
                                                    />
                                                    <div className="mt-1 text-xs text-gray-500">
                                                        {validation.costSource === 'manual' ? 'Corregido manualmente' : validation.costSource === 'last_reception' ? `Última recepción${validation.costDate ? ` · ${validation.costDate}` : ''}` : validation.costSource === 'average' ? 'Promedio disponible' : 'Sin costo disponible'}
                                                    </div>
                                                </div> : '—'}
                                            </td>}
                                            <td className="px-3 py-3"><span className={ok ? 'text-green-700' : validation ? 'text-red-700' : 'text-gray-400'}>{ok ? 'Listo' : validation?.error || (validation ? `${!validation.originalExists ? 'Falta original. ' : ''}${!validation.fullExists ? 'Falta FULL. ' : ''}${!hasValidCost ? 'Costo pendiente.' : ''}`.trim() : wasEdited ? 'SKU modificado: vuelve a validar' : 'Pendiente')}</span></td>
                                            <td className="px-3 py-3">
                                                <button
                                                    type="button"
                                                    onClick={() => handleValidateOne(item.originalSku)}
                                                    disabled={validating || Boolean(validatingRows[item.originalSku]) || !currentSku.trim()}
                                                    className="whitespace-nowrap rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                                                >
                                                    {validatingRows[item.originalSku] ? 'Validando…' : validation ? 'Revalidar' : 'Validar'}
                                                </button>
                                            </td>
                                        </tr>;
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </section>}

                    {analysis.exclusions.length > 0 && (
                        <section className="rounded-lg border border-amber-200 bg-amber-50 p-5">
                            <h2 className="font-semibold text-amber-900">Filas no incluidas en esta prueba</h2>
                            <p className="mt-1 text-sm text-amber-800">Por seguridad, el MVP incluye únicamente ventas con estado “Entregado”.</p>
                            <div className="mt-3 flex flex-wrap gap-2">{analysis.exclusions.map((entry) => <span key={entry.status} className="rounded-full bg-white px-3 py-1 text-xs text-amber-900 ring-1 ring-amber-200">{entry.status}: {entry.rows} filas / {entry.units} unidades</span>)}</div>
                        </section>
                    )}

                    <div>
                    {workflow === 'reception' && <section className="space-y-4 rounded-lg border border-green-200 bg-white p-6 shadow-sm">
                        <div><h2 className="font-semibold text-gray-800">3. Crear recepción Full</h2><p className="mt-1 text-sm text-gray-500">Usa las cantidades del Excel y el último costo validado de cada producto original.</p></div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <label className="text-sm font-medium text-gray-700">Sucursal<select value={selectedOffice} onChange={(event) => setSelectedOffice(event.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"><option value="">Seleccionar…</option>{offices.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}</select></label>
                            <label className="text-sm font-medium text-gray-700">Referencia numérica<input value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value.replace(/\D/g, ''))} inputMode="numeric" className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2" /></label>
                        </div>
                        <div className="rounded-md bg-gray-50 p-3"><p className="text-xs uppercase text-gray-500">Costo total estimado</p><p className="mt-1 text-lg font-semibold text-gray-900">{formatClp(totalCost)}</p></div>
                        {receptionId ? <div className="rounded-md bg-green-50 px-4 py-3 text-sm font-medium text-green-800">Recepción creada correctamente. ID: {receptionId}</div> : <button onClick={handleSubmit} disabled={!allValidated || submitting || validating || hasRowsValidating} className="rounded-md bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40">{submitting ? 'Creando recepción…' : 'Crear recepción Full'}</button>}
                    </section>}

                    {workflow === 'presale' && (
                        <section className="space-y-4 rounded-lg border border-blue-200 bg-white p-6 shadow-sm">
                            <div>
                                <h2 className="font-semibold text-gray-800">3. Crear preventa Full</h2>
                                <p className="mt-1 text-sm text-gray-500">Revisa los SKU FULL, el precio unitario efectivamente recibido y las cantidades del Excel.</p>
                            </div>
                            {!productsValidated && <div className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">La tabla ya está calculada. Valida los productos en Bsale antes de habilitar la creación de la preventa.</div>}
                            <div className="grid gap-4 sm:grid-cols-2">
                                <label className="text-sm font-medium text-gray-700">Sucursal
                                    <select value={selectedOffice} onChange={(event) => setSelectedOffice(event.target.value)} disabled={Boolean(presaleResult)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"><option value="">Seleccionar…</option>{offices.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}</select>
                                </label>
                                <div className="rounded-md bg-gray-50 p-3 text-sm text-gray-700"><p className="text-xs font-medium uppercase text-gray-500">Cliente obligatorio</p><p className="mt-1 font-semibold">Mercado Libre S.A. (Full)</p><p className="text-xs text-gray-500">RUT 77.398.220-1</p></div>
                            </div>

                            {Object.keys(presalePrices).length > 0 && <div className="overflow-x-auto rounded-md border">
                                <table className="min-w-full divide-y divide-gray-200 text-sm">
                                    <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-3 py-3">SKU FULL</th><th className="px-3 py-3 text-right">Precio venta recibido</th><th className="px-3 py-3 text-right">Cantidad</th></tr></thead>
                                    <tbody className="divide-y divide-gray-100">{analysis.items.map((item) => {
                                        const sku = finalFullSku(item.originalSku);
                                        const price = presalePrices[sku] ?? 0;
                                        const validation = validations[item.originalSku];
                                        const skuReady = Boolean(validation?.originalExists && validation?.fullExists && !validation.error);
                                        const grossUnitPrice = price * 1.19;
                                        return <tr key={item.originalSku} className={price > 0 && skuReady ? undefined : 'bg-red-50'}><td className="px-3 py-3"><input value={sku} onChange={(event) => handleSkuChange(item.originalSku, event.target.value.replace(/^FULL/i, ''))} disabled={Boolean(presaleResult) || Boolean(validatingRows[item.originalSku])} className={`w-48 rounded-md border px-2 py-1.5 font-medium ${skuReady ? 'border-gray-300 bg-white' : 'border-red-400 bg-red-50'}`} /><div className={`mt-1 text-xs ${skuReady ? 'text-green-700' : 'text-red-700'}`}>{validatingRows[item.originalSku] ? 'Validando…' : skuReady ? 'SKU validado' : validation?.error || 'Pendiente de validar'} {!skuReady && <button type="button" onClick={() => handleValidateOne(item.originalSku)} className="ml-2 font-semibold underline">Validar</button>}</div></td><td className="px-3 py-3 text-right"><input type="number" min="0" step="0.01" value={Math.round(grossUnitPrice * 100) / 100} onChange={(event) => handlePresaleGrossPriceChange(sku, event.target.value)} disabled={Boolean(presaleResult)} aria-label={`Precio de venta recibido de ${sku}`} className={`w-40 rounded-md border px-2 py-1.5 text-right tabular-nums ${price > 0 ? 'border-gray-300' : 'border-red-500 bg-red-50 text-red-800'}`} /><div className="mt-1 text-xs text-gray-500">Total: {formatClpDetailed(item.finalAmountWithTax)}</div></td><td className="px-3 py-3 text-right tabular-nums">{item.quantity}</td></tr>;
                                    })}</tbody>
                                </table>
                            </div>}

                            {Object.keys(presalePrices).length > 0 && <div className="grid gap-3 sm:grid-cols-3">
                                <div className="rounded-md bg-gray-50 p-3"><p className="text-xs uppercase text-gray-500">Total Excel</p><p className="font-semibold">{formatClpDetailed(analysis.totalReceivedWithTax)}</p></div>
                                <div className="rounded-md bg-gray-50 p-3"><p className="text-xs uppercase text-gray-500">Total calculado</p><p className="font-semibold">{formatClpDetailed(presaleCalculatedWithTax)}</p></div>
                                <div className={`rounded-md p-3 ${Math.abs(presaleDifference) <= 0.01 ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}><p className="text-xs uppercase">Diferencia</p><p className="font-semibold">{formatClpDetailed(presaleDifference)}</p></div>
                            </div>}

                            {presaleResult ? <div className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">Preventa {presaleResult.number ?? 'creada'} lista.{presaleResult.url && <> <a href={presaleResult.url} target="_blank" rel="noreferrer" className="font-semibold underline">Abrir en Bsale</a></>}</div> : <button type="button" onClick={handleCreatePresale} disabled={!productsValidated || creatingPresale || !selectedOffice || Math.abs(presaleDifference) > 0.01 || Object.keys(presalePrices).length !== analysis.items.length || Object.values(presalePrices).some((price) => price <= 0)} className="rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40">{creatingPresale ? 'Creando preventa…' : 'Crear preventa final'}</button>}
                        </section>
                    )}
                    </div>
                </>
            )}
        </div>
    );
}

function Summary({ label, value }: { label: string; value: number }) {
    return <div className="rounded-lg border bg-white p-4 shadow-sm"><p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p><p className="mt-2 text-2xl font-bold text-gray-900">{value}</p></div>;
}
