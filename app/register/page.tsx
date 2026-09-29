import { notFound, redirect } from 'next/navigation';
import RegisterForm from './RegisterForm';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
    const { token } = await searchParams;
    if (!process.env.OWNER_SETUP_TOKEN || token !== process.env.OWNER_SETUP_TOKEN) notFound();

    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (!error && data.users.length > 0) redirect('/login');

    return (
        <main className="flex min-h-screen items-center justify-center bg-gray-100 px-4 py-10">
            <section className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold text-white">F</div>
                <h1 className="mt-5 text-2xl font-bold text-gray-900">Crea la cuenta propietaria</h1>
                <p className="mt-2 text-sm leading-6 text-gray-500">Este registro funciona una sola vez. Después, el acceso será exclusivamente por invitación.</p>
                <RegisterForm token={token} />
            </section>
        </main>
    );
}
