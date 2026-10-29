import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import ProductHealth from './ProductHealth';
export default async function IntelligencePage(){const auth=await createClient();const {data:{user}}=await auth.auth.getUser();if(!user)redirect('/login');return <ProductHealth/>;}
