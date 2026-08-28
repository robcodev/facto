import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Sidebar from '@/components/Sidebar';
import './globals.css';

export const metadata: Metadata = {
    title: 'Facto',
    description: 'Herramientas de operación para Facto',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
    return (
        <html lang="es">
            <body>
                <div className="min-h-screen bg-gray-50 md:flex">
                    <Sidebar />
                    <main className="min-w-0 flex-1 md:ml-64">{children}</main>
                </div>
            </body>
        </html>
    );
}
