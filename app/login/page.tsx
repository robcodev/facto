import LoginForm from './LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
    const params = await searchParams;
    const nextPath = params.next?.startsWith('/') && !params.next.startsWith('//') ? params.next : '/reception';

    return (
        <main className="flex min-h-screen items-center justify-center bg-gray-100 px-4 py-10">
            <section className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold text-white">
                    F
                </div>
                <h1 className="mt-5 text-2xl font-bold text-gray-900">Ingresar a Facto</h1>
                <p className="mt-2 text-sm leading-6 text-gray-500">
                    Acceso exclusivo para el equipo. Las cuentas se habilitan únicamente por invitación.
                </p>
                {params.error === 'invite' ? (
                    <p role="alert" className="mt-5 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        La invitación no es válida o venció. Solicita una nueva invitación.
                    </p>
                ) : null}
                <LoginForm nextPath={nextPath} />
            </section>
        </main>
    );
}
