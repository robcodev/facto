import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentPeriod, periodSchema } from "@/lib/marketing/server";
import Marketing from "./Marketing";
export default async function MarketingPage({searchParams}:{searchParams:Promise<{google?:string;from?:string;to?:string}>}) {
  const auth = await createClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) redirect("/login");
  const params=await searchParams;
  const result=params.google;
  const parsed=periodSchema.safeParse({from:params.from,to:params.to});
  const initialPeriod=parsed.success?parsed.data:currentPeriod();
  return <Marketing initialPeriod={initialPeriod} initialGoogleResult={result==="connected"||result==="failed"?result:undefined} />;
}
