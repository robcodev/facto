'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { logout } from '@/app/auth/actions';

type NavItem = { href: string; label: string; icon: string };
const operational: NavItem[] = [
    { href: '/reception', label: 'Recepción de stock', icon: 'box' },
    { href: '/full', label: 'Mercado Libre Full', icon: 'truck' },
    { href: '/prices', label: 'Precios por lotes', icon: 'tag' },
    { href: '/web-catalog', label: 'Publicación web', icon: 'globe' },
    { href: '/picking', label: 'Picking pedidos web', icon: 'check' },
    { href: '/labels', label: 'Etiquetas ZPL', icon: 'printer' },
];
const commercial: NavItem[] = [
    { href: '/intel', label: 'Intel', icon: 'database' },
    { href: '/intelligence', label: 'Inteligencia comercial', icon: 'chart' },
    { href: '/rotation', label: 'Rotación e inventario', icon: 'box' },
    { href: '/marketing', label: 'Marketing', icon: 'spark' },
];
const finance: NavItem[] = [
    { href: '/suppliers', label: 'Proveedores y pagos', icon: 'people' },
    { href: '/cash', label: 'Caja y gastos', icon: 'wallet' },
];
const activePath = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);
const paths: Record<string, string> = {
    box: 'M3 7 12 3l9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4M12 11v10M7.5 5l9 4',
    truck: 'M3 6h11v11H3V6Zm11 4h4l3 4v3h-7M7 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm11 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',
    tag: 'M3 3h8l10 10-8 8L3 11V3Zm4 4h.01',
    globe: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z',
    check: 'M8 4H5v17h14V4h-3M8 3h8v4H8V3Zm0 11 3 3 5-6',
    printer: 'M7 8V3h10v5M7 17H4V9h16v8h-3M7 14h10v7H7v-7Zm10-2h.01',
    database: 'M20 6c0 2-4 3-8 3S4 8 4 6s4-3 8-3 8 1 8 3ZM4 6v12c0 2 4 3 8 3s8-1 8-3V6M4 12c0 2 4 3 8 3s8-1 8-3',
    chart: 'M4 3v17h17M8 16v-4m5 4V8m5 8V4',
    spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z',
    people: 'M16 21v-3c0-3-2-5-6-5s-6 2-6 5v3M14 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm3-3c4 0 4 6 0 6m2 4c2 1 3 3 3 6',
    wallet: 'M3 6h16v15H3V6Zm0 0V3h13v3m0 6h5v5h-5v-5Z',
    money: 'M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
    logout: 'M9 3H4v18h5m5-14 5 5-5 5m-6-5h11',
};
function Icon({ name }: { name: string }) {
    return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] shrink-0"><path d={paths[name] || paths.box} /></svg>;
}
function NavigationLink({ item, pathname }: { item: NavItem; pathname: string }) {
    return <Link href={item.href} aria-current={activePath(pathname, item.href) ? 'page' : undefined} className="facto-nav-link"><Icon name={item.icon} /><span>{item.label}</span></Link>;
}
function Collection({ id, label, icon, items, pathname }: { id: string; label: string; icon: string; items: NavItem[]; pathname: string }) {
    const active = items.some(item => activePath(pathname, item.href));
    const [expansion, setExpansion] = useState({ pathname, open: active });
    if (expansion.pathname !== pathname) setExpansion({ pathname, open: active || expansion.open });
    return <div className="facto-collection">
        <button type="button" className="facto-nav-link facto-collection-toggle" aria-expanded={expansion.open} aria-controls={id} onClick={() => setExpansion(value => ({ pathname, open: !value.open }))}>
            <Icon name={icon} /><span>{label}</span>
            <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={`ml-auto h-3 w-3 transition-transform ${expansion.open ? 'rotate-180' : ''}`}><path d="m4 6 4 4 4-4" /></svg>
        </button>
        <div id={id} hidden={!expansion.open} role="group" aria-label={label} className="facto-nav-children">{items.map(item => <NavigationLink key={item.href} item={item} pathname={pathname} />)}</div>
    </div>;
}
export default function Sidebar() {
    const pathname = usePathname();
    const [mobileOpen, setMobileOpen] = useState(false);
    if (pathname === '/login' || pathname === '/register' || pathname.startsWith('/auth/') || pathname === '/set-password') return null;
    return <aside className="facto-sidebar md:fixed md:inset-y-0 md:left-0 md:w-64">
        <div className="facto-brand-row">
            <div className="flex items-center gap-3"><span aria-hidden="true" className="facto-monogram">f.</span><div><p className="text-xl font-bold tracking-tight text-white">Facto</p><p className="mt-0.5 text-[11px] tracking-wide text-slate-400">Gestión y operaciones</p></div></div>
            <button type="button" className="facto-menu-button md:hidden" aria-expanded={mobileOpen} aria-controls="facto-navigation" onClick={() => setMobileOpen(value => !value)} aria-label={mobileOpen ? 'Cerrar menú' : 'Abrir menú'}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d={mobileOpen ? 'm6 6 12 12M6 18 18 6' : 'M4 6h16M4 12h16M4 18h16'} /></svg><span>Menú</span></button>
        </div>
        <div id="facto-navigation" className={`${mobileOpen ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col md:flex`}>
            <nav aria-label="Aplicaciones" className="facto-navigation" onClick={event => { if ((event.target as Element).closest('a')) setMobileOpen(false); }}>
                <p className="facto-nav-heading">Operaciones</p>
                {operational.map(item => <NavigationLink key={item.href} item={item} pathname={pathname} />)}
                <p className="facto-nav-heading mt-6">Gestión del negocio</p>
                <Collection id="commercial-data-navigation" label="Datos comerciales" icon="chart" items={commercial} pathname={pathname} />
                <Collection id="finance-navigation" label="Finanzas" icon="money" items={finance} pathname={pathname} />
                <p className="facto-nav-heading mt-6">Herramientas</p>
                <NavigationLink item={{ href: '/sandbox', label: 'Laboratorio', icon: 'spark' }} pathname={pathname} />
            </nav>
            <form action={logout} className="facto-sidebar-footer"><button type="submit" className="facto-nav-link w-full"><Icon name="logout" /><span>Cerrar sesión</span></button></form>
        </div>
    </aside>;
}
