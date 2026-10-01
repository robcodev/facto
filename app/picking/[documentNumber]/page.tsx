import Link from 'next/link';
import { getPickingOrder } from '../actions';
import PickingSession from './PickingSession';

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
        <PickingSession orderId={Number(order.id)} initialItems={items} initialStatus={String(order.picking_status)} />
    </div>;
}
