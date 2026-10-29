'use client';
import { useEffect, useState } from 'react';

type Client = { external_id: string; name: string; data: { code?: string; company?: string; city?: string; municipality?: string } };
export default function IntelClientsPage() {
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(0);
    const [result, setResult] = useState<{ clients: Client[]; total: number }>({ clients: [], total: 0 });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        const abort = new AbortController();
        fetch(`/api/intel/sales?${new URLSearchParams({ clients: '1', search, page: String(page) })}`, { cache: 'no-store', signal: abort.signal })
            .then(async response => {
                if (response.redirected) throw new Error('Vuelve a iniciar sesión.');
                const body = await response.json();
                if (!response.ok) throw new Error(body.error || 'No pudimos consultar los clientes.');
                setResult(body);
            })
            .catch(cause => { if (!abort.signal.aborted) setError(cause.message); })
            .finally(() => { if (!abort.signal.aborted) setLoading(false); });
        return () => abort.abort();
    }, [page, search]);
    return <main className="mx-auto max-w-6xl space-y-5 p-6">
        <a href="/intel/sales" className="text-indigo-700 underline">← Ventas históricas</a>
        <h1 className="text-3xl font-bold">Clientes</h1>
        <p>Los clientes se descargan al iniciar o reanudar la importación de ventas. Sus documentos se enlazan por el ID de Bsale, no por nombre ni RUT.</p>
        <p className="text-sm text-slate-600">El historial excluye preventas, pero no equivale todavía a compras netas conciliadas. Puede incluir cotizaciones, guías, anulaciones y notas de crédito.</p>
        <input aria-label="Buscar cliente por nombre" placeholder="Buscar por nombre…" className="rounded border p-2" value={search} onChange={e => { setLoading(true); setError(''); setSearch(e.target.value); setPage(0); }} />
        {error && <p role="alert" className="text-red-700">{error}</p>}
        {loading ? <p>Cargando…</p> : <><p>{result.total} clientes guardados</p>
            <div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{['Cliente', 'RUT', 'Comuna / ciudad', 'Historial'].map(title => <th className="p-3" key={title}>{title}</th>)}</tr></thead>
                <tbody>{result.clients.map(client => <tr key={client.external_id} className="border-t"><td className="p-3">{client.name || client.data.company || `Cliente #${client.external_id}`}<p className="text-xs text-slate-500">ID {client.external_id}</p></td><td className="p-3">{client.data.code || 'Sin información'}</td><td className="p-3">{client.data.municipality || client.data.city || 'Sin información'}</td><td className="p-3"><a className="text-indigo-700 underline" href={`/intel/sales?client=${encodeURIComponent(client.external_id)}`}>Ver documentos y productos</a></td></tr>)}</tbody>
            </table></div>
            {!result.total && <p>No hay clientes para mostrar. Reanuda la importación desde Ventas históricas o revisa el filtro.</p>}</>}
        <div className="flex gap-4"><button disabled={loading || page === 0} onClick={() => { setLoading(true); setError(''); setPage(page - 1); }}>Anterior</button><span>Página {page + 1}</span><button disabled={loading || (page + 1) * 50 >= result.total} onClick={() => { setLoading(true); setError(''); setPage(page + 1); }}>Siguiente</button></div>
    </main>;
}
