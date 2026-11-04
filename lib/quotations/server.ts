import 'server-only';
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { AI_RULES, QuoteError, acceptProposal, activateInterpretations, alternativeSchema, automaticCandidate, commonUnitCandidates, explicitUnit, geminiSchema, importProgress, kitSummary, normalizeRequirements, parseRequest, ready, registerImport, replaceRequirements, requirementSchema, syncKit, undo, verifyAlternatives, type Document, type Project } from './core';
import { extractionPrompt, interpretationPrompt, researchData, researchPrompt, reviewPrompt } from './prompts';

export async function context() {
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) throw new QuoteError('Debes iniciar sesión.', 401);
  const org = await db.from('organizations').select('id').eq('slug', 'facto-compartido').single();
  if (org.error || !org.data) throw new QuoteError('No tienes acceso a la empresa compartida.', 403);
  return { db, orgId: Number(org.data.id), userId: user.id };
}
type Context = Awaited<ReturnType<typeof context>>;
function storageError() { return new QuoteError('No pudimos guardar o leer cotizaciones. Revisa que esté aplicada la migración del módulo. Tu edición permanece en pantalla.', 503); }
export async function load(ctx: Context, id: string): Promise<Project> {
  const r = await ctx.db.from('quotation_projects').select('*').eq('organization_id', ctx.orgId).eq('id', z.uuid().parse(id)).maybeSingle();
  if (r.error) throw storageError(); if (!r.data) throw new QuoteError('Cotización no encontrada.', 404); return r.data as Project;
}
export async function list(ctx: Context) {
  const r = await ctx.db.from('quotation_projects').select('id,version,updated_at,name:document->>name').eq('organization_id', ctx.orgId).order('updated_at', { ascending: false }).limit(100);
  if (r.error) throw storageError(); return r.data;
}
async function save(ctx: Context, p: Project) {
  if (Buffer.byteLength(JSON.stringify(p.document)) > 3500000) throw new QuoteError('El proyecto alcanzó su límite de tamaño. Crea otro proyecto para continuar.', 413);
  const r = await ctx.db.from('quotation_projects').update({ document: p.document, version: p.version + 1, updated_at: new Date().toISOString() }).eq('organization_id', ctx.orgId).eq('id', p.id).eq('version', p.version).select('*').maybeSingle();
  if (r.error) throw storageError(); if (!r.data) throw new QuoteError('Otra sesión guardó cambios. Recarga la cotización antes de continuar; tu edición sigue en pantalla.', 409); return r.data as Project;
}
export async function create(ctx: Context, name: unknown) {
  const document: Document = { name: z.string().trim().min(2).max(160).parse(name), market: 'undefined', sources: [], items: [], proposals: [], messages: [], history: [] };
  const r = await ctx.db.from('quotation_projects').insert({ organization_id: ctx.orgId, created_by: ctx.userId, document }).select('*').single();
  if (r.error) throw storageError(); return r.data as Project;
}
async function mutate(ctx: Context, id: string, change: (d: Document) => void, version?: number) {
  const p = await load(ctx, id); if (version !== undefined && p.version !== version) throw new QuoteError('Hay cambios más recientes. Recarga antes de guardar.', 409);
  change(p.document); return save(ctx, p);
}
function message(d: Document, role: 'user' | 'assistant', text: string, itemIds: string[] = []) { d.messages.push({ id: crypto.randomUUID(), role, text, itemIds, at: new Date().toISOString() }); }
export const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), name: z.string().min(2).max(160) }),
  z.object({ action: z.literal('edit'), id: z.uuid(), version: z.number().int(), itemId: z.uuid(), requirements: requirementSchema }),
  z.object({ action: z.literal('accept'), id: z.uuid(), version: z.number().int(), proposalId: z.uuid() }),
  z.object({ action: z.literal('reject'), id: z.uuid(), version: z.number().int(), proposalId: z.uuid() }),
  z.object({ action: z.literal('undo'), id: z.uuid(), version: z.number().int(), historyId: z.uuid() }),
  z.object({ action: z.literal('market'), id: z.uuid(), version: z.number().int(), market: z.enum(['undefined', 'chile', 'international']) }),
  z.object({ action: z.literal('select'), id: z.uuid(), version: z.number().int(), itemId: z.uuid(), alternativeId: z.uuid().nullable(), componentId: z.uuid().optional() }),
  z.object({ action: z.literal('chat'), id: z.uuid(), version: z.number().int(), text: z.string().trim().min(1).max(50000), itemIds: z.array(z.uuid()).max(10), sourceId: z.uuid().optional() }),
  z.object({ action: z.literal('research'), id: z.uuid(), itemId: z.uuid(), refresh: z.boolean().default(false), componentId: z.uuid().optional() }),
  z.object({ action: z.literal('import_source'), id: z.uuid(), version: z.number().int(), sourceId: z.uuid() }),
  z.object({ action: z.literal('import_next'), id: z.uuid(), version: z.number().int(), sourceId: z.uuid(), retry: z.boolean().default(false), itemId: z.uuid().optional() }),
  z.object({ action: z.literal('activate'), id: z.uuid(), version: z.number().int() }),
  z.object({ action: z.literal('select_assembled'), id: z.uuid(), version: z.number().int(), itemId: z.uuid() }),
  z.object({ action: z.literal('accept_many'), id: z.uuid(), version: z.number().int(), proposalIds: z.array(z.uuid()).min(1).max(500) }),
  z.object({ action: z.literal('common_unit'), id: z.uuid(), version: z.number().int(), unit: z.string().trim().min(1).max(80) }),
]);
export async function action(ctx: Context, input: z.infer<typeof actionSchema>) {
  if (input.action === 'create') return create(ctx, input.name);
  if (input.action === 'chat') return chat(ctx, input);
  if (input.action === 'research') return research(ctx, input.id, input.itemId, input.refresh, input.componentId);
  if (input.action === 'import_next') return interpretNext(ctx, input);
  if (input.action === 'import_source') return mutate(ctx, input.id, d => {
    const source = d.sources.find(s => s.id === input.sourceId); if (!source) throw new QuoteError('Solicitud original no encontrada.', 404);
    const rows = parseRequest(source.text); if (!rows) throw new QuoteError('Este archivo no tiene filas de descripción y cantidad reconocibles.');
    registerImport(d, source, rows);
    message(d, 'assistant', `Solicitud completa registrada: ${rows.length} ítems. Cada ficha se preparará por separado al buscar; ninguna fila se omite.`, source.importRows!.map(r => r.itemId));
  }, input.version);
  return mutate(ctx, input.id, d => {
    if (input.action === 'activate') { activateInterpretations(d); return; }
    if (input.action === 'accept_many') {
      for (const id of new Set(input.proposalIds)) acceptProposal(d, id);
      return;
    }
    if (input.action === 'common_unit') {
      const items = commonUnitCandidates(d);
      for (const item of items) {
        const next = { ...item.requirements, unit: input.unit, status: 'ready' as const };
        replaceRequirements(d, item, ready(next) ? next : { ...next, status: 'clarify' });
      }
      message(d, 'assistant', `Confirmaste «${input.unit}» como unidad de compra en ${items.length} ítems. Los sets, kits y pares conservan su presentación; las demás dudas siguen pendientes.`, items.map(i => i.id));
      return;
    }
    if (input.action === 'market') {
      if (d.market !== input.market) { d.market = input.market; for (const item of d.items) { item.revision++; item.search = { state: 'idle', attempts: 0 }; syncKit(item); } }
      return;
    }
    if (input.action === 'accept') { acceptProposal(d, input.proposalId); return; }
    if (input.action === 'reject') { d.proposals = d.proposals.filter(p => p.id !== input.proposalId); return; }
    if (input.action === 'undo') { undo(d, input.historyId); return; }
    const item = d.items.find(i => i.id === input.itemId); if (!item) throw new QuoteError('Ítem no encontrado.', 404);
    if (input.action === 'select_assembled') {
      if (!kitSummary(item).complete) throw new QuoteError('Selecciona una alternativa vigente para cada componente antes de elegir el set armado.');
      item.selectedMode = 'assembled'; item.selectedId = null; return;
    }
    if (input.action === 'edit') replaceRequirements(d, item, input.requirements);
    if (input.action === 'select') {
      const target = input.componentId ? item.kit?.components.find(c => c.id === input.componentId) : item;
      if (!target) throw new QuoteError('Componente no encontrado.', 404);
      if (input.alternativeId) {
        const a = target.alternatives.find(a => a.id === input.alternativeId);
        if (!a || a.match === 'insufficient' || a.requirementRevision !== item.revision || !ready(item.requirements)) throw new QuoteError('Esta alternativa no cumple las condiciones para selección. Revisa los requisitos y vuelve a buscar.');
      }
      target.selectedId = input.alternativeId;
      if (!input.componentId) item.selectedMode = 'product';
    }
  }, input.version);
}
function ai(timeout = 65000) { if (!process.env.GEMINI_API_KEY) throw new QuoteError('Falta configurar Gemini en el servidor.', 503); return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { timeout } }); }
const model = process.env.QUOTATIONS_GEMINI_MODEL || 'gemini-3.8-flash';
async function settle(ctx: Context, id: string, change: (d: Document) => void) {
  for (let n = 0; n < 4; n++) { try { return await mutate(ctx, id, change); } catch (e) { if (!(e instanceof QuoteError) || e.status !== 409 || n === 3) throw e; } }
  throw new QuoteError('No pudimos guardar el resultado por ediciones simultáneas.', 409);
}
async function chat(ctx: Context, input: Extract<z.infer<typeof actionSchema>, { action: 'chat' }>) {
  const original = input.sourceId ? (await load(ctx, input.id)).document.sources.find(s => s.id === input.sourceId) : null;
  const rows = parseRequest(input.text) || (original && !original.importRows && /^(?:interpreta|prepara|importa|procesa|contin[uú]a)/i.test(input.text) ? parseRequest(original.text) : null);
  if (rows) return mutate(ctx, input.id, d => {
    if (d.aiLease && d.aiLease.expires > Date.now()) throw new QuoteError('Ya hay una interpretación en curso.', 423);
    let source = input.sourceId ? d.sources.find(s => s.id === input.sourceId) : d.sources.find(s => s.text === input.text);
    if (input.sourceId && !source) throw new QuoteError('Archivo no encontrado.', 404);
    if (!source) { source = { id: crypto.randomUUID(), name: 'Texto pegado en el chat', text: input.text, processed: false }; d.sources.push(source); }
    if (source.importRows) return;
    registerImport(d, source, rows);
    message(d, 'user', input.text);
    message(d, 'assistant', `Detecté y guardé los ${rows.length} ítems de la solicitud completa. Puedes buscar un producto o todos los identificables. Cada ficha se prepara e investiga por separado; cantidad y unidad pendientes no impiden buscar.`, []);
  }, input.version);
  const token = crypto.randomUUID();
  const p = await mutate(ctx, input.id, d => {
    if (d.aiLease && d.aiLease.expires > Date.now()) throw new QuoteError('Ya hay una interpretación en curso. Espera o recarga más tarde.', 423);
    if (input.itemIds.some(id => !d.items.some(i => i.id === id))) throw new QuoteError('La selección contiene ítems ajenos.');
    if (input.sourceId && !d.sources.some(s => s.id === input.sourceId)) throw new QuoteError('Archivo no encontrado.');
    d.aiLease = { token, expires: Date.now() + 100000 }; message(d, 'user', input.text, input.itemIds);
  }, input.version);
  try {
    const source = input.sourceId ? p.document.sources.find(s => s.id === input.sourceId)! : null;
    const reference = input.text.match(/(?:[ií]tem|fila|l[ií]nea)\s*(\d+)/i);
    const scope = input.itemIds.length ? p.document.items.filter(i => input.itemIds.includes(i.id)) : reference ? p.document.items.filter(i => i.order === Number(reference[1])) : [];
    const contents: import('@google/genai').Part[] = [{ text: `DATOS: ${JSON.stringify({ instruction: input.text, source: source && !source.importRows ? { id: source.id, name: source.name, text: source.text } : null, items: scope.map(i => ({ id: i.id, order: i.order, original: i.original, requirements: i.requirements })), market: p.document.market })}` }];
    if (source?.data && source.mime) contents.push({ inlineData: { data: source.data, mimeType: source.mime } });
    const schema = z.object({ reply: z.string().max(14000), proposals: z.array(z.object({ itemId: z.uuid().nullable(), original: z.string().max(6000), requirements: requirementSchema })).max(10) });
    const response = await ai().models.generateContent({ model, contents: [{ role: 'user', parts: contents }], config: { systemInstruction: AI_RULES + '\nPropón como máximo 10 filas por turno. itemId es null solo para nuevas filas. Para correcciones usa únicamente identificadores de items proporcionados. Para archivos largos interpreta el siguiente bloque de hasta 10 ítems aún no propuestos, e indica si faltan bloques. Debes conservar literalmente original desde la solicitud. Si hay dudas status=clarify. Usa unit vacía y quantity=null cuando falten. Cada propuesta debe contener todos los campos. No agregues filas nuevas ante un pedido de corrección. Las preguntas deben mencionar los números de fila. Si te piden buscar, indica que deben usar Buscar productos.', responseMimeType: 'application/json', responseJsonSchema: geminiSchema(schema), thinkingConfig: { thinkingLevel: 'LOW' as import('@google/genai').ThinkingLevel }, maxOutputTokens: 16000 } });
    const parsed = schema.parse(JSON.parse(response.text || ''));
    for (const proposal of parsed.proposals) {
      if (proposal.itemId && !scope.some(i => i.id === proposal.itemId)) throw new QuoteError('La IA propuso modificar una fila fuera de la selección.', 502);
      if (!proposal.itemId) proposal.requirements = normalizeRequirements(proposal.original, proposal.requirements);
      if (proposal.requirements.status === 'ready' && !ready(proposal.requirements)) proposal.requirements.status = 'clarify';
    }
    return await settle(ctx, p.id, d => {
      if (d.aiLease?.token !== token) throw new QuoteError('La interpretación venció. Reintenta.', 410);
      const sourceId = source?.id || crypto.randomUUID();
      if (!source) d.sources.push({ id: sourceId, name: 'Texto pegado en el chat', text: input.text, processed: true });
      let order = Math.max(0, ...d.items.map(i => i.order), ...d.proposals.map(i => i.order));
      for (const proposal of parsed.proposals) {
        const prior = proposal.itemId && scope.find(i => i.id === proposal.itemId);
        const candidate = { ...proposal, id: crypto.randomUUID(), order: prior ? prior.order : ++order, sourceId: prior ? p.document.items.find(i => i.id === proposal.itemId)!.sourceId : sourceId, baseRevision: prior ? prior.revision : 0 };
        d.proposals.push(candidate);
        if (!proposal.itemId) { acceptProposal(d, candidate.id); const added = d.items.find(i => i.order === candidate.order)!; added.requirementsOrigin = 'ai'; syncKit(added); }
      }
      if (source) d.sources.find(s => s.id === source.id)!.processed = true;
      message(d, 'assistant', parsed.reply, scope.map(i => i.id)); delete d.aiLease;
    });
  } catch (e) {
    await settle(ctx, p.id, d => { if (d.aiLease?.token === token) { delete d.aiLease; message(d, 'assistant', 'No se completó la interpretación. Tu mensaje y archivos están guardados. Reintenta; las filas existentes se conservan.'); } }).catch(() => undefined);
    throw e instanceof QuoteError ? e : new QuoteError('Gemini no pudo completar la interpretación. Puedes reintentar.', 502);
  }
}
async function interpretNext(ctx: Context, input: Extract<z.infer<typeof actionSchema>, { action: 'import_next' }>) {
  const token = crypto.randomUUID();
  const p = await mutate(ctx, input.id, d => {
    if (d.aiLease && d.aiLease.expires > Date.now()) throw new QuoteError('Ya hay una interpretación en curso. Espera antes de reanudar.', 423);
    // Recover abandoned batches after their lease expires, including after a page reload.
    for (const source of d.sources) for (const row of source.importRows || []) if (row.state === 'running') row.state = 'pending';
    const source = d.sources.find(s => s.id === input.sourceId);
    if (!source?.importRows) throw new QuoteError('Esta solicitud todavía no tiene filas registradas.', 404);
    const batch = source.importRows.filter(r => (!input.itemId || r.itemId === input.itemId) && (r.state === 'pending' || input.retry && r.state === 'failed') && r.attempts < 3).slice(0, 1);
    if (!batch.length) throw new QuoteError('No quedan filas pendientes de interpretar en esta solicitud.', 409);
    for (const row of batch) { row.state = 'running'; row.attempts++; delete row.error; }
    d.aiLease = { token, expires: Date.now() + 100000 };
  }, input.version);
  const source = p.document.sources.find(s => s.id === input.sourceId)!;
  const batchRows = source.importRows!.filter(r => r.state === 'running');
  const batch = batchRows.map(r => p.document.items.find(i => i.id === r.itemId)!);
  try {
    const schema = z.object({ proposals: z.array(z.object({ itemId: z.uuid(), requirements: requirementSchema })).length(1) });
    const response = await ai().models.generateContent({ model, contents: `Interpreta exactamente las ${batch.length} filas de DATOS. Devuelve una propuesta por identificador sin omitir ni fusionar filas. Conserva la cantidad dada, incluso null. DATOS: ${JSON.stringify(batch.map(i => ({ itemId: i.id, order: i.order, original: i.original, quantity: i.requirements.quantity, confirmedUnit: i.requirements.unit })))}`, config: {
      systemInstruction: interpretationPrompt(),
      responseMimeType: 'application/json', responseJsonSchema: geminiSchema(schema), maxOutputTokens: 5000, thinkingConfig: { thinkingLevel: 'LOW' as import('@google/genai').ThinkingLevel },
    } });
    const parsed = schema.parse(JSON.parse(response.text || ''));
    if (parsed.proposals.length !== batch.length || new Set(parsed.proposals.map(p => p.itemId)).size !== batch.length || parsed.proposals.some(p => !batch.some(i => i.id === p.itemId))) throw new QuoteError('La IA no devolvió todas las filas de esta tanda. Puedes reintentarla sin perder el resto.', 502);
    return await settle(ctx, input.id, d => {
      if (d.aiLease?.token !== token) throw new QuoteError('La interpretación venció. Puedes reanudarla.', 410);
      const currentSource = d.sources.find(s => s.id === source.id)!;
      for (const proposal of parsed.proposals) {
        const item = batch.find(i => i.id === proposal.itemId)!;
        let requirements = normalizeRequirements(item.original, { ...proposal.requirements, searchBlockers: proposal.requirements.searchBlockers || [], quantity: item.requirements.quantity, unit: item.requirements.unit || explicitUnit(item.original) });
        if (requirements.quantity === null && !/cantidad/i.test(requirements.questions)) requirements.questions = [requirements.questions, 'Confirma la cantidad solicitada; no aparece en el original.'].filter(Boolean).join('\n');
        if (!ready(requirements)) requirements = { ...requirements, status: 'clarify' };
        d.proposals = d.proposals.filter(p => !(p.origin === 'import' && p.itemId === item.id));
        const current = d.items.find(i => i.id === item.id)!;
        if (current.revision === item.revision && automaticCandidate(current)) replaceRequirements(d, current, requirements, 'ai');
        else d.proposals.push({ id: crypto.randomUUID(), itemId: item.id, sourceId: source.id, original: item.original, order: item.order, baseRevision: item.revision, requirements, origin: 'import' });
        const row = currentSource.importRows!.find(r => r.itemId === item.id)!; row.state = 'done'; delete row.error;
      }
      currentSource.processed = currentSource.importRows!.every(r => r.state === 'done');
      const progress = importProgress(currentSource);
      message(d, 'assistant', `Requisitos interpretados: ${progress.done} de ${progress.total} ítems. ${progress.pending ? `Quedan ${progress.pending} por interpretar.` : 'Las fichas están preparadas y son editables. Puedes buscar las opciones.'}`, batch.map(i => i.id));
      delete d.aiLease;
    });
  } catch (e) {
    const reason = e instanceof QuoteError ? e.message : 'No se completó esta tanda de interpretación. Puedes reanudarla; todas las filas están guardadas.';
    await settle(ctx, input.id, d => {
      if (d.aiLease?.token !== token) return;
      const current = d.sources.find(s => s.id === source.id)!;
      for (const row of current.importRows || []) if (batch.some(i => i.id === row.itemId) && row.state === 'running') { row.state = 'failed'; row.error = reason; }
      message(d, 'assistant', reason, batch.map(i => i.id)); delete d.aiLease;
    }).catch(() => undefined);
    throw new QuoteError(reason, 502);
  }
}
async function research(ctx: Context, id: string, itemId: string, refresh: boolean, componentId?: string) {
  const token = crypto.randomUUID();
  const p = await mutate(ctx, id, d => {
    activateInterpretations(d);
    const item = d.items.find(i => i.id === itemId); if (!item) throw new QuoteError('Ítem no encontrado.', 404);
    if (!ready(item.requirements)) throw new QuoteError('Hay una contradicción sobre qué producto buscar. Aclara esa fila primero.');
    const target = componentId ? item.kit?.components.find(c => c.id === componentId) : item;
    if (!target) throw new QuoteError('Componente no encontrado.', 404);
    if (target.search.state === 'running' && (target.search.expires || 0) > Date.now()) throw new QuoteError('Este producto ya se está investigando.', 423);
    if (target.search.state === 'done' && !refresh) throw new QuoteError('Ya fue investigado. Usa Actualizar búsqueda.', 409);
    if (target.search.attempts >= 3 && !refresh) throw new QuoteError('Se alcanzaron tres intentos. Revisa el error y usa Actualizar búsqueda.');
    target.search = { state: 'running', token, expires: Date.now() + 180000, attempts: refresh ? 1 : target.search.attempts + 1 };
  });
  const item = p.document.items.find(i => i.id === itemId)!;
  const part = componentId ? item.kit!.components.find(c => c.id === componentId)! : null;
  const requirements = part ? { name: part.name, brandModel: part.brandModel, quantity: item.requirements.quantity === null ? null : item.requirements.quantity * part.quantityPerSet, unit: part.unit, mandatory: part.mandatory, sizeCapacity: '', allowedAlternatives: '', links: [], questions: '', status: 'ready' as const, searchBlockers: [] } : item.requirements;
  const task = researchData(item, requirements, p.document.market, componentId);
  try {
    const response = await ai(55000).models.generateContent({ model, contents: `DATOS: ${JSON.stringify(task)}`, config: { tools: [{ googleSearch: {} }], systemInstruction: researchPrompt(), maxOutputTokens: 5000, thinkingConfig: { thinkingLevel: 'LOW' as import('@google/genai').ThinkingLevel } } });
    const grounding = response.candidates?.[0]?.groundingMetadata;
    if (!grounding?.webSearchQueries?.length || !grounding.groundingChunks?.length) throw new QuoteError('Google no entregó evidencia de búsqueda real. No guardamos opciones sin fuentes.', 502);
    const uniqueSources = [...new Map(grounding.groundingChunks.flatMap(c => c.web?.uri ? [{ uri: c.web.uri, title: c.web.title || 'Fuente Google' }] : []).map(s => [s.uri, s])).values()];
    const resolved = await Promise.allSettled(uniqueSources.map(async s => ({ ...s, directUrl: await directSource(s.uri) })));
    const sources = resolved.flatMap(r => r.status === 'fulfilled' ? [r.value] : []);
    if (!sources.length) throw new QuoteError('No pudimos verificar los enlaces de las fuentes encontradas.', 502);
    const extractionSchema = z.object({ alternatives: z.array(alternativeSchema).max(3) });
    const extraction = await ai(25000).models.generateContent({ model, contents: `DATOS: ${JSON.stringify({ task, report: response.text, sources })}`, config: { systemInstruction: extractionPrompt(), responseMimeType: 'application/json', responseJsonSchema: geminiSchema(extractionSchema), maxOutputTokens: 6000, thinkingConfig: { thinkingLevel: 'LOW' as import('@google/genai').ThinkingLevel } } });
    const alternatives = verifyAlternatives(JSON.parse(extraction.text || ''), sources, item.revision);
    if (alternatives.length) {
      const reviewSchema = z.object({ reviews: z.array(z.object({ index: z.number().int().nonnegative(), identitySupported: z.boolean(), priceSupported: z.boolean(), presentationSupported: z.boolean(), vatSupported: z.boolean(), availabilitySupported: z.boolean(), issues: z.array(z.string().max(1200)).max(12) })).max(3) });
      const reviewed = await ai(20000).models.generateContent({ model, contents: `DATOS: ${JSON.stringify({ task, report: response.text, sources, alternatives: alternatives.map((a,index) => ({ index, ...a })) })}`, config: { systemInstruction: reviewPrompt(), responseMimeType: 'application/json', responseJsonSchema: geminiSchema(reviewSchema), maxOutputTokens: 3000, thinkingConfig: { thinkingLevel: 'LOW' as import('@google/genai').ThinkingLevel } } });
      const checks = reviewSchema.parse(JSON.parse(reviewed.text || '')).reviews;
      if (checks.length !== alternatives.length || new Set(checks.map(c => c.index)).size !== alternatives.length || checks.some(c => c.index >= alternatives.length)) throw new QuoteError('La revisión no cubrió todas las alternativas. Reintenta este producto.', 502);
      for (const check of checks) {
        const a = alternatives[check.index];
        if (!check.identitySupported) a.match = 'insufficient';
        if (!check.priceSupported || !check.presentationSupported) { a.price = null; a.currency = null; a.unitsPerPrice = null; }
        if (!check.vatSupported) a.vat = 'unknown';
        if (!check.availabilitySupported) a.availability = 'Por confirmar';
        a.pending = [a.pending, ...check.issues].filter(Boolean).join('\n');
        a.review = { checked: true, issues: [...check.issues] };
        if (!componentId && item.kit && !item.kit.components.every(c => a.kitCoverage?.some(k => k.componentId === c.id && k.quantity === c.quantityPerSet))) {
          a.match = 'insufficient'; a.pending += '\nLa fuente no confirma toda la composición y proporción del set.';
        }
      }
    }
    return await settle(ctx, id, d => {
      const current = d.items.find(i => i.id === itemId)!;
      const target = componentId ? current.kit?.components.find(c => c.id === componentId) : current;
      if (!target || target.search.token !== token || current.revision !== item.revision || d.market !== p.document.market) throw new QuoteError('Los requisitos o el país cambiaron durante la búsqueda. Repite la búsqueda.', 410);
      if (target.alternatives.length) (target.researchHistory ||= []).push({ at: new Date().toISOString(), alternatives: structuredClone(target.alternatives) });
      const selected = target.alternatives.find(a => a.id === target.selectedId);
      target.alternatives = [...(selected ? [selected] : []), ...alternatives];
      target.search = { state: 'done', attempts: target.search.attempts, queries: grounding.webSearchQueries, support: grounding.groundingSupports, report: response.text, sources };
      message(d, 'assistant', `Ítem ${current.order}${part ? ` · ${part.name}` : ''}: ${alternatives.length} alternativa(s) investigada(s) y revisada(s). Confirma condiciones con el proveedor antes de elegir.`, [itemId]);
    });
  } catch (e) {
    const reason = e instanceof QuoteError ? e.message : 'Falló la investigación o la revisión de este producto. Puedes reintentarlo.';
    await settle(ctx, id, d => { const current = d.items.find(i => i.id === itemId); const target = componentId ? current?.kit?.components.find(c => c.id === componentId) : current; if (target?.search.token === token) target.search = { state: 'failed', attempts: target.search.attempts, error: reason }; }).catch(() => undefined);
    throw new QuoteError(reason, 502);
  }
}

async function directSource(uri: string) {
  const url = new URL(uri);
  if (url.protocol !== 'https:') throw new QuoteError('Google devolvió un enlace inseguro.', 502);
  if (url.hostname !== 'vertexaisearch.cloud.google.com') return uri;
  // Only request Google's own grounding redirect, never an arbitrary supplier URL on the server.
  const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10000), cache: 'no-store' });
  const location = r.headers.get('location');
  if (!location) throw new QuoteError('No pudimos resolver el enlace directo de la fuente. Reintenta el ítem.', 502);
  const target = new URL(location, url);
  if (target.protocol !== 'https:' || target.username || target.password || target.hostname === 'vertexaisearch.cloud.google.com') throw new QuoteError('La fuente no entregó un enlace directo verificable.', 502);
  return target.href;
}
export async function attach(ctx: Context, id: string, version: number, file: File) {
  if (file.size > 1500000) throw new QuoteError('Usa archivos de hasta 1,5 MB.', 413);
  const ext = file.name.split('.').pop()?.toLowerCase(), buffer = Buffer.from(await file.arrayBuffer());
  let text = '', data: string | undefined, mime: string | undefined;
  if (['txt', 'csv', 'tsv', 'md'].includes(ext || '')) text = buffer.toString('utf8');
  else if (ext === 'xlsx') {
    const { readSheet } = await import('read-excel-file/node');
    const rows = await readSheet(buffer, 1); text = rows.map(row => row.map(cell => String(cell ?? '')).join('\t')).join('\n');
  } else {
    mime = ({ pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' } as Record<string, string>)[ext || ''];
    if (!mime) throw new QuoteError('Usa TXT, CSV, TSV, XLSX, PDF o imágenes PNG/JPG/WebP.'); data = buffer.toString('base64');
  }
  if (text.length > 120000) throw new QuoteError('El archivo contiene demasiado texto; divídelo en partes.', 413);
  return mutate(ctx, z.uuid().parse(id), d => { d.sources.push({ id: crypto.randomUUID(), name: file.name.slice(0, 240), text, data, mime, ...(ext === 'xlsx' ? { originalData: buffer.toString('base64'), originalMime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } : {}), processed: false }); }, version);
}
