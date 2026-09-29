import SetPasswordForm from './SetPasswordForm';

export const dynamic = 'force-dynamic';

export default function SetPasswordPage() {
    return (
        <main className="flex min-h-screen items-center justify-center bg-gray-100 px-4 py-10">
            <section className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
                <h1 className="text-2xl font-bold text-gray-900">Crea tu contraseña</h1>
                <p className="mt-2 text-sm leading-6 text-gray-500">Completa la invitación para comenzar a usar Facto.</p>
                <SetPasswordForm />
            </section>
        </main>
    );
}
