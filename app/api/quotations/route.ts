import { z } from 'zod';
import { QuoteError } from '@/lib/quotations/core';
import { action, actionSchema, attach, context, list, load } from '@/lib/quotations/server';
import { start, getRun } from 'workflow/api';
import { researchProject } from '@/lib/quotations/workflow';
import { updateDocument } from '@/lib/quotations/server';
export const runtime = 'nodejs';
export const maxDuration = 150;
const headers = { 'Cache-Control': 'private, no-store' };
function error(e: unknown) {
  return Response.json({ error: e instanceof z.ZodError ? 'Revisa los campos enviados.' : e instanceof QuoteError ? e.message : 'No pudimos completar la operación. El trabajo guardado se conserva.' }, { status: e instanceof QuoteError ? e.status : e instanceof z.ZodError || e instanceof SyntaxError ? 422 : 503, headers });
}
export async function GET(request: Request) {
  try { const ctx = await context(), id = new URL(request.url).searchParams.get('id'); if(!id) return Response.json({projects:await list(ctx)},{headers});
    let project=await load(ctx,id); const run=project.document.researchRun;
    if(run && ['queued','running'].includes(run.state) && Date.now()-Date.parse(run.updatedAt)>240000) {
      let stopped=!run.runId;
      if(run.runId) { try {stopped=['failed','cancelled','completed'].includes(await getRun(run.runId).status);} catch {stopped=true;} }
      if(stopped) project=await updateDocument(ctx,id,d=>{if(d.researchRun?.token===run.token){d.researchRun.state='failed';d.researchRun.error='La ejecución se interrumpió. Puedes investigar nuevamente las necesidades pendientes; los resultados guardados se conservan.';}});
    }
    return Response.json({project},{headers}); } catch (e) { return error(e); }
}
export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) throw new QuoteError('Origen no permitido.', 403);
    if (Number(request.headers.get('content-length')) > 2200000) throw new QuoteError('Solicitud demasiado grande.', 413);
    const ctx = await context();
    if (request.headers.get('content-type')?.startsWith('multipart/form-data')) {
      const form = await request.formData(), file = form.get('file'); if (!(file instanceof File)) throw new QuoteError('Falta el archivo.');
      return Response.json({ project: await attach(ctx, String(form.get('id')), z.coerce.number().int().nonnegative().parse(form.get('version')), file) }, { headers });
    }
    const text = await request.text(); if (text.length > 150000) throw new QuoteError('El texto es demasiado largo.', 413);
    const input=actionSchema.parse(JSON.parse(text));
    let project=await action(ctx,input);
    if(input.action==='enqueue' && project.document.researchRun) {
      const token=project.document.researchRun.token;
      try {
        const run=await start(researchProject,[{id:project.id,orgId:ctx.orgId,userId:ctx.userId,token}]);
        project=await updateDocument(ctx,project.id,d=>{if(d.researchRun?.token===token)d.researchRun.runId=run.runId;});
      } catch {
        project=await updateDocument(ctx,project.id,d=>{if(d.researchRun?.token===token){d.researchRun.state='failed';d.researchRun.error='No pudimos iniciar la investigación. Vuelve a intentar; la solicitud está guardada.';}});
      }
    }
    return Response.json({project},{headers});
  } catch (e) { return error(e); }
}
