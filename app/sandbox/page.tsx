import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import ProductWorkspace from './ProductWorkspace';
export default async function Page() {
    const auth = await createClient(), { data: { user } } = await auth.auth.getUser();
    if (!user) redirect('/login?next=/sandbox');
    return <ProductWorkspace userId={user.id} />;
}
