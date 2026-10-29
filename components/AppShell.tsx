'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';

const sections = [
    ['/reception', 'Operaciones', 'Recepción de stock'], ['/full', 'Operaciones', 'Mercado Libre Full'],
    ['/prices', 'Operaciones', 'Precios por lotes'], ['/web-catalog', 'Operaciones', 'Publicación web'],
    ['/picking', 'Operaciones', 'Picking pedidos web'], ['/labels', 'Operaciones', 'Etiquetas ZPL'],
    ['/intel', 'Datos comerciales', 'Intel'], ['/intelligence', 'Datos comerciales', 'Inteligencia comercial'],
    ['/marketing', 'Datos comerciales', 'Marketing'], ['/suppliers', 'Finanzas', 'Proveedores y pagos'], ['/cash', 'Finanzas', 'Caja y gastos'],
];
export default function AppShell({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const isAuthPage = pathname === '/login' || pathname === '/register' || pathname === '/set-password' || pathname.startsWith('/auth/');
    if (isAuthPage) return children;
    const section = sections.find(([href]) => pathname === href || pathname.startsWith(`${href}/`));
    return <div className="facto-workspace min-h-screen md:flex">
        <a href="#main-content" className="facto-skip-link">Saltar al contenido principal</a>
        <Sidebar />
        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 md:ml-64">
            <div className="facto-workspace-bar"><div className="flex min-w-0 items-center gap-2 text-xs sm:text-sm"><span className="shrink-0 text-slate-500">{section?.[1] || 'Facto'}</span><span aria-hidden="true" className="text-slate-300">/</span><span className="truncate font-semibold text-slate-700">{section?.[2] || 'Espacio de trabajo'}</span></div><span className="hidden text-xs text-slate-400 lg:block">Gestión interna</span></div>
            <div className="facto-content">{children}</div>
        </main>
    </div>;
}
