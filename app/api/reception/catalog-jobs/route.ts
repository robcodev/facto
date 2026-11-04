import { z } from 'zod';
import { after } from 'next/server';
import { start, getRun } from 'workflow/api';
import { HookConflictError, WorkflowRunNotFoundError } from 'workflow/errors';
import { context, type Context } from '@/lib/reception-products/server';
import { ImportError } from '@/lib/reception-products/core';
import { getJob, listJobs, uploadJob, view, setRun, restart, markFailed } from '@/lib/catalog-reading/server';
import type { Job } from '@/lib/catalog-reading/core';
import { readCatalog } from '@/lib/catalog-reading/workflow';
export const runtime='nodejs';
export const maxDuration=90;
const headers={'Cache-Control':'private, no-store'};
function fail(error:unknown) { return Response.json({error:error instanceof ImportError?error.message:error instanceof z.ZodError?'Revisa la solicitud.':'No pudimos completar la solicitud de lectura.'},{status:error instanceof ImportError?error.status:400,headers}); }
async function dispatch(ctx:Context,job:Job) {
    const ref={id:job.id,orgId:ctx.orgId,userId:ctx.userId,generation:job.generation};
    try {
        let runId:string;
        try { const run=await start(readCatalog,[ref],{hook:{token:`catalog:${job.id}:${job.generation}`,experimental_minRetention:'7 days'}}); runId=run.runId; }
        catch(error) { if(HookConflictError.is(error) && error.conflictingRunId) runId=error.conflictingRunId; else throw error; }
        await setRun(ctx,job,runId);
    } catch { await markFailed(ref,'No pudimos confirmar el inicio de la tarea. El archivo quedó guardado; pulsa Reanudar lectura.'); }
    return getJob(ctx,job.id);
}
export async function GET(request:Request) {
    try {
        const ctx=await context(), id=new URL(request.url).searchParams.get('id');
        if(!id) return Response.json({jobs:await listJobs(ctx)},{headers});
        let job=await getJob(ctx,id);
        if(['queued','reading','grouping'].includes(job.status) && Date.now()-Date.parse(job.updated_at)>120000) {
            if(!job.run_id) {
                await markFailed({id:job.id,orgId:ctx.orgId,userId:ctx.userId,generation:job.generation},'El archivo está guardado, pero no se confirmó el inicio. Puedes reanudar la lectura.');
                job=await getJob(ctx,id);
            } else {
            try {
                const state=await getRun(job.run_id).status;
                if(['failed','cancelled','completed'].includes(state)) { await markFailed({id:job.id,orgId:ctx.orgId,userId:ctx.userId,generation:job.generation},'La ejecución se detuvo. Puedes reanudar las partes pendientes.'); job=await getJob(ctx,id); }
            } catch(error) {
                if(WorkflowRunNotFoundError.is(error)) {
                    await markFailed({id:job.id,orgId:ctx.orgId,userId:ctx.userId,generation:job.generation},'La ejecución ya no está disponible en este servidor. El avance sigue guardado y puedes reanudarlo.');
                    job=await getJob(ctx,id);
                }
                // A temporary status lookup must not erase a running task.
            }
            }
        }
        return Response.json({job:view(job)},{headers});
    } catch(error) { return fail(error); }
}
export async function POST(request:Request) {
    try {
        const ctx=await context();
        if(request.headers.get('content-type')?.includes('multipart/form-data')) {
            const form=await request.formData(), entries=form.getAll('files');
            if(entries.some(e=>!(e instanceof File))) throw new ImportError('La solicitud contiene archivos inválidos.');
            const result=await uploadJob(ctx,entries as File[]);
            // Only enqueue after responding; the durable workflow, not after(),
            // owns the long-running work and its retry checkpoints.
            if(result.fresh) after(()=>dispatch(ctx,result.job).then(()=>{}));
            return Response.json({job:view(result.job),reused:!result.fresh},{status:202,headers});
        }
        const body=z.object({action:z.literal('retry'),id:z.uuid()}).parse(await request.json());
        const job=await restart(ctx,await getJob(ctx,body.id));
        after(()=>dispatch(ctx,job).then(()=>{}));
        return Response.json({job:view(job)},{status:202,headers});
    } catch(error) { return fail(error); }
}
