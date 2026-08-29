'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navigation = [
    { href: '/reception', label: 'Recepción de Stock' },
    { href: '/full', label: 'Mercado Libre Full' },
    { href: '/labels', label: 'Etiquetas ZPL' },
];

export default function Sidebar() {
    const pathname = usePathname();

    return (
        <aside className="border-b border-gray-200 bg-white md:fixed md:inset-y-0 md:left-0 md:w-64 md:border-b-0 md:border-r">
            <div className="flex h-full flex-col px-4 py-5">
                <div className="px-3 pb-5">
                    <p className="text-xl font-bold text-gray-900">Facto</p>
                    <p className="mt-1 text-xs font-medium uppercase tracking-wider text-gray-400">Operaciones</p>
                </div>

                <nav aria-label="Aplicaciones" className="flex gap-2 overflow-x-auto md:flex-col">
                    {navigation.map((item) => {
                        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                aria-current={isActive ? 'page' : undefined}
                                className={`whitespace-nowrap rounded-md px-3 py-2.5 text-sm font-medium transition ${
                                    isActive
                                        ? 'bg-blue-50 text-blue-700'
                                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                                }`}
                            >
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>
            </div>
        </aside>
    );
}
