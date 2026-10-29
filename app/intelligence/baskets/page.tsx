import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import HistoricalBaskets from '../HistoricalBaskets';
export default async function BasketHistoryPage(){const auth=await createClient();const {data:{user}}=await auth.auth.getUser();if(!user)redirect('/login');return <main className="mx-auto max-w-7xl space-y-5 p-5 md:p-8"><Link href="/intelligence" className="text-sm text-indigo-700 underline">Volver a inteligencia comercial</Link><header><p className="text-sm font-semibold text-indigo-700">Inteligencia comercial</p><h1 className="mt-1 text-3xl font-bold">Análisis histórico de compras conjuntas</h1><p className="mt-2 text-slate-600">Frecuencia, asociación y evolución de los productos presentes en una misma venta.</p></header><HistoricalBaskets/></main>;}
