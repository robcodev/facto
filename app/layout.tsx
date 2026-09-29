import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import AppShell from '@/components/AppShell';
import './globals.css';

export const metadata: Metadata = {
    title: 'Facto',
    description: 'Herramientas de operación para Facto',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
    return (
        <html lang="es">
            <body>
                <AppShell>{children}</AppShell>
            </body>
        </html>
    );
}
