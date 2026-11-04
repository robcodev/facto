import Link from 'next/link';
import ProductImport from './ProductImport';

export default function Page() {
    return <main className="mx-auto max-w-[1500px] space-y-5 p-4 md:p-8">
        <Link href="/reception" className="text-sm font-medium text-blue-700">← Ingreso de facturas</Link>
        <header><h1 className="text-2xl font-bold text-slate-900">Crear productos y recepcionar</h1><p className="mt-2 text-sm text-slate-600">Carga un documento, revisa cómo se agrupan sus variantes y completa costos y precios antes de enviarlos a Bsale.</p></header>
        <ProductImport />
    </main>;
}
