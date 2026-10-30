import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Rotation from './Rotation';
export default async function RotationPage() {
  const auth = await createClient(); const { data: { user } } = await auth.auth.getUser(); if (!user) redirect('/login'); return <Rotation />;
}
