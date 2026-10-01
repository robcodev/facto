import Link from 'next/link';
import { getPickingOrder } from '../actions';

const money = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });

export default async function PickingOrderPage({ params }: PageProps<'/picking/[documentNumber]'>) {
    const documentNumber = Number((await params).documentNumber);
    const result = await getPickingOrder(documentNumber);

    if (!result.success) return <div className="mx-auto max-w-3xl space-y-5 p-6"><Link href="/picking" className="font-semibold text-blue-700">← Volver</Link><div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-800">{result.error}</div></div>;

    const order = result.order;
    const items = Array.isArray(order.web_order_items) ? order.web_order_items : [];
    const totalUnits = items.reduce((sum, item) => sum + Number(item.quantity), 0);
    return <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
        <Link href="/picking" className="font-semibold text-blue-700">← Volver a pedidos</Link>
        <header className="rounded-xl border bg-white p-5 shadow-sm"><p className="text-sm font-semibold uppercase text-blue-600">Picking en preparación</p><h1 className="mt-1 text-3xl font-bold">Preventa #{order.document_number}</h1><p className="mt-2 text-gray-600">Checkout #{order.bsale_checkout_id} · {order.shipping_method || 'Sin información de entrega'}</p><div className="mt-4 flex justify-between border-t pt-4"><strong>{totalUnits} unidades</strong><strong>{money.format(Number(order.total))}</strong></div></header>
        <section className="overflow-hidden rounded-xl border bg-white shadow-sm"><div className="border-b bg-gray-50 px-4 py-3"><h2 className="font-bold">Productos por preparar</h2></div><ul className="divide-y">{items.map((item) => <li key={item.id} className="flex items-start gap-4 p-4"><div className="mt-1 h-6 w-6 rounded border-2 border-gray-400" aria-hidden="true" /><div className="min-w-0 flex-1"><div className="flex flex-wrap justify-between gap-2"><strong>{item.sku}</strong><strong>{item.quantity} unidad{Number(item.quantity) === 1 ? '' : 'es'}</strong></div><p className="mt-1 text-sm text-gray-600">{item.item_name}</p></div></li>)}</ul></section>
        <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">Esta primera etapa abre el pedido mediante el código de barras. El siguiente paso será validar cada producto con su propio código y guardar el avance.</p>
    </div>;
}
