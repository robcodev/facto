import { z } from 'zod';
import { MAX_ROWS, type ExtractedRow } from '@/lib/reception-products/core';
export const PIPELINE = 1;
export const MAX_PAGES = 30;
export const GROUP_SIZE = 40;
const amount = z.number().finite().nonnegative().max(1e12).nullable();
export const rawRow = z.object({ code: z.string().max(100), description: z.string().max(500), quantity: amount, totalNet: amount, netUnitValue: amount, salePrice: amount, salePriceIncludesVat: z.boolean().nullable() });
export type RawRow = z.infer<typeof rawRow>;
export type Page = { file: number; page: number; text: string | null; done: boolean; rows: RawRow[]; count?: number; attempts: number };
export type Source = { path: string; mime: string; name: string };
export type Mapping = { index: number; productName: string; variantName: string };
export type Progress = { pages: Page[]; mappings: Mapping[]; number: string; prepared: boolean };
export type Job = { id: string; organization_id: number; created_by: string; generation: string; status: 'queued'|'reading'|'grouping'|'completed'|'failed'; sources: Source[]; progress: Progress; error: string | null; run_id: string | null; project_id: string | null; updated_at: string };
export type Ref = { id: string; orgId: number; userId: string; generation: string };
export type Outcome = { ok: true } | { ok: false; retryable: boolean; message: string };
export function parsePage(text: string) {
    const result = z.object({ documentNumber: z.string().max(30), complete: z.boolean(), rows: z.array(rawRow).max(200) }).parse(JSON.parse(text));
    if (!result.complete) throw new Error('La IA indicó que la página quedó incompleta.');
    return result;
}
export function rowsOf(job: Job) { return job.progress.pages.flatMap(p => p.rows); }
export function mappedRows(rows: RawRow[], mappings: Mapping[]): ExtractedRow[] {
    if (!rows.length || rows.length > MAX_ROWS) throw new Error(`El documento debe contener entre 1 y ${MAX_ROWS} variantes.`);
    const map = new Map(mappings.map(m => [m.index, m]));
    if (map.size !== rows.length || mappings.length !== rows.length || rows.some((_, i) => !map.has(i))) throw new Error('La agrupación no cubre todas las filas.');
    return rows.map((r, i) => ({ code: r.code.trim(), productName: map.get(i)!.productName, variantName: map.get(i)!.variantName, quantity: r.quantity,
        cost: r.totalNet !== null && r.quantity !== null && r.quantity > 0 ? r.totalNet / r.quantity : r.netUnitValue,
        priceGross: r.salePrice === null || r.salePriceIncludesVat === null ? null : r.salePriceIncludesVat ? r.salePrice : Math.round(r.salePrice * 1.19) }));
}
export type JobView = { id: string; status: Job['status']; pages: number; readPages: number; rows: number; groupedRows: number; error: string|null; projectId: string|null; updatedAt: string };
// Bound grouping context as large documents accumulate parent names. Financial
// data is never part of this step; only relevant, already proposed names help.
export function groupingContext(rows: RawRow[], prior: Mapping[]) {
    const terms = new Set(rows.flatMap(r => r.description.toLocaleUpperCase('es-CL').match(/[\p{L}\p{N}]{3,}/gu) ?? []));
    return [...new Set(prior.map(m => m.productName))].map((name,index) => ({ name,index,score:(name.toLocaleUpperCase('es-CL').match(/[\p{L}\p{N}]{3,}/gu) ?? []).reduce((n,t) => n + Number(terms.has(t)),0) }))
        .sort((a,b) => b.score-a.score || b.index-a.index).slice(0,80).map(r => r.name);
}
export function view(job: Job): JobView { return { id: job.id, status: job.status, pages: job.progress.pages.length, readPages: job.progress.pages.filter(p => p.done).length, rows: job.progress.pages.reduce((n,p) => n + (p.count ?? p.rows.length),0), groupedRows: job.progress.mappings.length, error: job.error, projectId: job.project_id, updatedAt: job.updated_at }; }
