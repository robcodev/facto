'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';

export default function AppShell({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const isAuthPage = pathname === '/login' || pathname === '/register' || pathname === '/set-password' || pathname.startsWith('/auth/');

    if (isAuthPage) return children;

    return (
        <div className="min-h-screen bg-gray-50 md:flex">
            <Sidebar />
            <main className="min-w-0 flex-1 md:ml-64">{children}</main>
        </div>
    );
}
