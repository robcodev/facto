import 'server-only';
import { createHash } from 'node:crypto';
import { bsale, type IntelContext } from './server';
import { identifier, object, type SourceRow } from './normalize';
import { dayAfter, windowEnd, salesMasters, salesRelations, sourcePage, salesRecord, isPreSale, type SalesCursor } from './sales-core';
import { prepareSalesBatch } from './sales-batch';

export async function readSalesRun(ctx: IntelContext, id: string) {
    const result = await ctx.db.from('intel_sync_runs').select('*').eq('organization_id', ctx.orgId).eq('kind', 'sales').eq('id', id).single();
    if (result.error) throw result.error;
    return result.data;
}
export function publicSalesRun(run: SourceRow) {
    const c = object(run.cursor);
    const config = object(run.config), worker = object(config.worker);
    return { id: run.id, status: run.status, config: { from: config.from, to: config.to, background: config.background === true,
        worker: { state: worker.state, heartbeatAt: worker.heartbeatAt, retryAt: worker.retryAt, failures: worker.failures } }, processed: run.processed, started_at: run.started_at, completed_at: run.completed_at, last_error: run.last_error,
        progress: { phase: c.clientsComplete ? c.phase : 'clients', clientsImported: c.clientsOffset ?? 0, clientsExpected: c.clientsExpected ?? null, from: c.from, to: c.to, documentId: c.documentId, completedDocuments: c.completedDocuments, completedWindows: c.completedWindows } };
}
export async function syncSalesPage(ctx: IntelContext, id: string) {
    const run = await readSalesRun(ctx, id);
    if (run.status !== 'running') return publicSalesRun(run);
    const c = structuredClone(run.cursor) as SalesCursor;
    let batch: ReturnType<typeof salesRecord>[] = [];
    try {
        // Independent offset keeps older in-progress document checkpoints intact.
        if (!c.clientsComplete) {
            const offset = c.clientsOffset ?? 0;
            const page = sourcePage(await bsale(`/v1/clients.json?limit=50&offset=${offset}`), offset);
            if (page.count === null) throw new Error('Bsale no informó el total de clientes.');
            if (c.clientsExpected != null && c.clientsExpected !== page.count) throw new Error('Cambió el total de clientes durante la importación. Revisa la captura antes de continuar.');
            c.clientsExpected = page.count;
            batch = page.items.map(raw => salesRecord('sales_clients', raw));
            c.clientsOffset = offset + page.items.length;
            c.clientsComplete = page.end;
        } else if (c.phase === 'masters') {
            const resource = salesMasters[c.master];
            if (!resource) throw new Error('Etapa de importación inválida.');
            const page = sourcePage(await bsale(`/v1/${resource}.json?limit=50&offset=${c.offset}`), c.offset);
            batch = page.items.map(raw => salesRecord(`sales_${resource}`, raw));
            c.offset += page.items.length;
            if (page.end) { c.master++; c.offset = 0; if (c.master === salesMasters.length) c.phase = 'list'; }
        } else if (c.phase === 'list') {
            const from = Date.parse(c.from) / 1000, to = Date.parse(dayAfter(c.to)) / 1000 - 1;
            const page = sourcePage(await bsale(`/v1/documents.json?emissiondaterange=[${from},${to}]&limit=10&offset=${c.offset}&expand=[document_type,client,office,user,coin,priceList,${salesRelations.join(',')}]`), c.offset, 10);
            if (page.count === null) throw new Error('Bsale no informó la cantidad de documentos. No podemos verificar este periodo.');
            if (c.expected !== null && page.count !== c.expected) throw new Error('Cambió la cantidad de documentos del periodo durante la lectura. Revisa el periodo antes de continuar.');
            c.expected = page.count;
            const prepared = await prepareSalesBatch(page.items, c, bsale);
            batch = prepared.records; c.queue = prepared.queue;
            c.completedDocuments += prepared.completed;
            c.offset += page.items.length; c.listEnd = page.end;
            c.phase = c.queue.length ? 'document' : c.listEnd ? 'finish_window' : 'list';
        } else if (c.phase === 'document') {
            c.documentId = c.queue[0];
            if (!identifier(c.documentId)) throw new Error('Documento pendiente inválido.');
            const raw = await bsale(`/v1/documents/${c.documentId}.json?expand=[document_type,client,office,user,coin,priceList,${salesRelations.join(',')}]`);
            if (isPreSale(raw)) {
                // Only a minimal reconciliation marker, never the presale or its lines.
                const emissionDay = new Date(Number(raw.emissionDate) * 1000).toISOString().slice(0, 10);
                if (String(raw.id) !== c.documentId || emissionDay < c.from || emissionDay > c.to) throw new Error('Preventa fuera del periodo solicitado.');
                batch = [salesRecord('sales_excluded', { id: raw.id, emissionDay, reason: 'preventa' })];
                c.queue.shift(); delete c.documentId;
                c.phase = c.queue.length ? 'document' : c.listEnd ? 'finish_window' : 'list';
            } else {
            const record = salesRecord('sales_documents', raw);
            if (record.external_id !== c.documentId || String(record.data.emissionDay) < c.from || String(record.data.emissionDay) > c.to) throw new Error('El documento no corresponde al periodo solicitado.');
            batch = [record]; c.childOffset = 0; c.sellers = []; c.pendingRelations = [];
            // Only trust expanded collections with explicit, complete pagination metadata.
            // Bare arrays (notably payments) are preserved raw and verified through their endpoint.
            salesRelations.forEach((relation, index) => {
                const expanded = object(raw[relation]);
                if (Array.isArray(expanded.items) && expanded.count != null && Number(expanded.offset ?? 0) === 0 && Number(expanded.count) === expanded.items.length) {
                    const page = sourcePage(expanded, 0);
                    batch.push(...page.items.map((child, i) => salesRecord(`sales_${relation}`, child, c.documentId, i)));
                    if (relation === 'sellers') c.sellers = page.items.map(child => ({ id: identifier(child.id), name: [child.firstName, child.lastName].filter(Boolean).join(' ') }));
                } else c.pendingRelations!.push(index);
            });
            c.relation = c.pendingRelations[0];
            c.phase = c.pendingRelations.length ? 'relations' : 'finish_document';
            }
        } else if (c.phase === 'relations') {
            const relation = salesRelations[c.relation ?? 0];
            if (!relation || !identifier(c.documentId)) throw new Error('Relación de documento inválida.');
            const offset = c.childOffset ?? 0;
            const page = sourcePage(await bsale(`/v1/documents/${c.documentId}/${relation}.json?limit=50&offset=${offset}`), offset);
            batch = page.items.map((raw, i) => salesRecord(`sales_${relation}`, raw, c.documentId, offset + i));
            if (relation === 'sellers') c.sellers = [...(c.sellers ?? []), ...page.items.map(raw => ({ id: identifier(raw.id), name: [raw.firstName, raw.lastName].filter(Boolean).join(' ') }))];
            c.childOffset = offset + page.items.length;
            if (page.end) {
                c.childOffset = 0;
                if (c.pendingRelations) { c.pendingRelations.shift(); c.relation = c.pendingRelations[0]; if (!c.pendingRelations.length) c.phase = 'finish_document'; }
                else { c.relation = (c.relation ?? 0) + 1; if (c.relation === salesRelations.length) c.phase = 'finish_document'; }
            }
        } else if (c.phase === 'finish_document') {
            const { data, error } = await ctx.db.from('intel_records').select('raw').eq('organization_id', ctx.orgId).eq('resource', 'sales_documents').eq('external_id', c.documentId).eq('run_id', run.id).single();
            if (error) throw error;
            const record = salesRecord('sales_documents', object(data.raw));
            record.data.complete = true; record.data.sellers = c.sellers;
            batch = [record]; c.completedDocuments++; c.queue.shift(); delete c.documentId; delete c.sellers;
            c.phase = c.queue.length ? 'document' : c.listEnd ? 'finish_window' : 'list';
        } else if (c.phase === 'finish_window') {
            // Count distinct, fully hydrated documents; source totals are NOT revenue reconciliation.
            const result = await ctx.db.from('intel_records').select('id', { count: 'exact', head: true }).eq('organization_id', ctx.orgId).eq('source','bsale').eq('resource', 'sales_documents').eq('run_id', run.id)
                .eq('data->>complete', 'true').gte('data->>emissionDay', c.from).lte('data->>emissionDay', c.to);
            if (result.error) throw result.error;
            const excluded = await ctx.db.from('intel_records').select('id', { count: 'exact', head: true }).eq('organization_id', ctx.orgId).eq('source','bsale').eq('resource', 'sales_excluded').eq('run_id', run.id).gte('data->>emissionDay', c.from).lte('data->>emissionDay', c.to);
            if (excluded.error) throw excluded.error;
            if (c.expected !== null && (result.count ?? 0) + (excluded.count ?? 0) !== c.expected) throw new Error('La cantidad importada más las preventas omitidas no coincide con Bsale. El periodo no se marcará completo.');
            const window = salesRecord('sales_windows', { id: Date.parse(c.from) / 1000, from: c.from, to: c.to, sourceCount: c.expected, importedCount: result.count, excludedCount: excluded.count, checkedAt: new Date().toISOString(), reconciliation: 'document_count_only' });
            window.external_id = `${c.from}:${c.to}`; batch = [window]; c.completedWindows++;
            if (c.to === c.end) c.phase = 'done';
            else { c.from = dayAfter(c.to); c.to = windowEnd(c.from, c.end); c.offset = 0; c.expected = null; c.listEnd = false; c.phase = 'list'; }
        } else throw new Error('Cursor de importación no reconocido.');
        const records = batch.map(record => ({ ...record, content_hash: createHash('sha256').update(JSON.stringify({ raw: record.raw, data: record.data })).digest('hex') }));
        const result = await ctx.db.rpc('intel_commit_sales_page', { p_org: ctx.orgId, p_run: id, p_revision: run.stage, p_rows: records, p_cursor: c, p_done: c.phase === 'done' });
        if (result.error) throw result.error;
        return publicSalesRun(await readSalesRun(ctx, id));
    } catch (error) {
        await ctx.db.from('intel_sync_runs').update({ last_error: error instanceof Error ? error.message : String(object(error).message ?? 'No se guardó el lote. Puedes reanudar.'), updated_at: new Date().toISOString() }).eq('organization_id', ctx.orgId).eq('id', id).eq('stage', run.stage);
        throw error;
    }
}
