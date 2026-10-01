'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PickingAutoRefresh() {
    const router = useRouter();

    useEffect(() => {
        const interval = window.setInterval(() => router.refresh(), 5000);
        return () => window.clearInterval(interval);
    }, [router]);

    return <p className="text-xs text-gray-500">Los estados se actualizan automáticamente.</p>;
}
