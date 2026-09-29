import { getPickingDashboard } from './actions';

const money = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });

function printLabel(status?: string) {
    if (status === 'printed') return { text: 'Impresa', classes: 'bg-green-100 text-green-800' };
    if (status === 'processing') return { text: 'Imprimiendo', classes: 'bg-blue-100 text-blue-800' };
    if (status === 'failed') return { text: 'Error', classes: 'bg-red-100 text-red-800' };
    return { text: 'Pendiente', classes: 'bg-amber-100 text-amber-800' };
}

export default async function PickingPage() {
    const result = await getPickingDashboard();
    return <div className="mx-auto max-w-[1400px] space-y-6 p-4 sm:p-6 lg:p-8">
        <header><p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Pedidos web</p><h1 className="mt-1 text-3xl font-bold text-gray-900">Picking e impresión</h1><p className="mt-2 text-sm text-gray-600">Pedidos pagados por generar DTE y estado de sus comandas.</p></header>
        {!result.success && <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-amber-900"><h2 className="font-bold">Configuración pendiente</h2><p className="mt-1 text-sm">{result.error}</p><p className="mt-2 text-sm">Aplica la migración de picking y configura la llave privada de Supabase para habilitar esta pantalla.</p></div>}
        {result.success && result.orders.length === 0 && <div className="rounded-xl border bg-white p-8 text-center shadow-sm"><h2 className="font-bold text-gray-900">Todavía no hay pedidos sincronizados</h2><p className="mt-2 text-sm text-gray-600">Cuando Bsale notifique un pedido pagado por generar DTE, aparecerá aquí y se creará su comanda.</p></div>}
        {result.success && result.orders.length > 0 && <div className="overflow-auto rounded-xl border bg-white shadow-sm"><table className="w-full min-w-[950px] text-sm"><thead className="bg-gray-50 text-left text-xs uppercase text-gray-500"><tr><th className="px-4 py-3">Preventa</th><th>Fecha</th><th>Productos</th><th>Picking</th><th>Impresión</th><th>Intentos</th><th>Entrega</th><th className="px-4 text-right">Total</th></tr></thead><tbody className="divide-y">{result.orders.map((order) => { const job = Array.isArray(order.print_jobs) ? order.print_jobs[0] : undefined; const badge = printLabel(job?.status); const items = Array.isArray(order.web_order_items) ? order.web_order_items : []; const totalUnits = items.reduce((sum, item) => sum + Number(item.quantity), 0); const picked = items.reduce((sum, item) => sum + Number(item.picked_quantity), 0); return <tr key={order.id}><td className="px-4 py-4"><strong className="block text-gray-900">#{order.document_number}</strong><span className="text-xs text-gray-500">Checkout {order.bsale_checkout_id}</span></td><td>{new Date(order.source_created_at).toLocaleString('es-CL')}</td><td>{totalUnits} unidades</td><td>{picked}/{totalUnits}</td><td><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badge.classes}`}>{badge.text}</span>{job?.last_error && <p className="mt-1 max-w-xs text-xs text-red-600">{job.last_error}</p>}</td><td>{job?.attempts ?? 0}</td><td>{order.shipping_method || 'Sin información'}</td><td className="px-4 text-right font-semibold">{money.format(Number(order.total))}</td></tr>; })}</tbody></table></div>}
    </div>;
}
