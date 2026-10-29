import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { nextMonday } from '@/lib/marketing/calendar-core';
import ContentCalendar from '../ContentCalendar';
export default async function CalendarPage(){const auth=await createClient();const {data:{user}}=await auth.auth.getUser();if(!user)redirect('/login');const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());return <ContentCalendar initialFrom={nextMonday(today)}/>;}
