import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Quotations from './Quotations';
export default async function Page() {
  const db = await createClient(); const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/login'); return <Quotations />;
}
