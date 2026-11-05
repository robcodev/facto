import { createAdminClient } from '@/lib/supabase/admin';
import { action, load, updateDocument } from './server';
import { ready, type ResearchJob } from './core';
export async function researchNext(ref: { id: string; orgId: number; userId: string; token: string }) {
  'use step';
  const db = createAdminClient();
  const org = await db.from('organizations').select('id').eq('id',ref.orgId).eq('slug','facto-compartido').maybeSingle();
  if (!org.data) return false;
  const ctx = { db, orgId: ref.orgId, userId: ref.userId };
  let p = await load(ctx,ref.id);
  const run = p.document.researchRun;
  if (!run || run.token !== ref.token || !['queued','running'].includes(run.state)) return false;
  const job = run.jobs.find(j => j.state === 'queued' || j.state === 'running');
  if (!job) { await updateDocument(ctx,ref.id,d=>{if(d.researchRun?.token===ref.token){d.researchRun.state='done';d.researchRun.updatedAt=new Date().toISOString();}}); return false; }
  const same = (j: ResearchJob) => j.itemId===job.itemId && j.componentId===job.componentId;
  await updateDocument(ctx,ref.id,d=>{if(d.researchRun?.token===ref.token){d.researchRun.state='running';d.researchRun.jobs.find(same)!.state='running';d.researchRun.updatedAt=new Date().toISOString();}});
  p=await load(ctx,ref.id);
  let state: ResearchJob['state']='done', error: string | undefined;
  try {
    const item=p.document.items.find(i=>i.id===job.itemId)!;
    const source=p.document.sources.find(s=>s.id===item.sourceId);
    if (!job.componentId && source?.importRows?.some(r=>r.itemId===item.id && r.state!=='done')) {
      p=await action(ctx,{action:'import_next',id:p.id,version:p.version,sourceId:source.id,itemId:item.id,retry:true});
    }
    p=await load(ctx,ref.id);
    const latest=p.document.items.find(i=>i.id===job.itemId)!;
    if (!ready(latest.requirements)) {state='clarify';error=latest.requirements.searchBlockers?.join('\n') || latest.requirements.questions;}
    else {
      const target=job.componentId?latest.kit?.components.find(c=>c.id===job.componentId):latest;
      if (!(target?.search.state==='done' && !job.refresh && target.alternatives.some(a=>a.review?.chileSupported))) await action(ctx,{action:'research',id:p.id,itemId:job.itemId,componentId:job.componentId,refresh:job.refresh || target?.search.state==='done'});
    }
  } catch(e) {state='failed';error=e instanceof Error?e.message:'No se pudo investigar esta necesidad.';}
  await updateDocument(ctx,ref.id,d=>{
    if(d.researchRun?.token!==ref.token)return;
    Object.assign(d.researchRun.jobs.find(same)!,{state,error});
    const item=d.items.find(i=>i.id===job.itemId);
    if(!job.componentId && state!=='clarify' && item?.kit && !item.alternatives.some(a=>a.match==='exact' && a.review?.chileSupported && a.requirementRevision===item.revision)) {
      for(const c of item.kit.components) if(!d.researchRun.jobs.some(j=>j.itemId===item.id && j.componentId===c.id)) d.researchRun.jobs.push({itemId:item.id,componentId:c.id,refresh:false,state:'queued'});
    }
    d.researchRun.updatedAt=new Date().toISOString();
  });
  return true;
}
researchNext.maxRetries=0;
