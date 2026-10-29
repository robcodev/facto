import { allRecords, context, errorResponse } from '@/lib/intel/server';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET() {
    try {
        const ctx = await context();
        const [records, settings, runs] = await Promise.all([allRecords(ctx), ctx.db.from('intel_category_settings').select('*').eq('organization_id', ctx.orgId), ctx.db.from('intel_sync_runs').select('*').eq('organization_id', ctx.orgId).eq('kind', 'catalog').order('started_at', { ascending: false }).limit(10)]);
        if (settings.error) throw settings.error;
        if (runs.error) throw runs.error;
        return Response.json({ schemaVersion: 1, exportedAt: new Date().toISOString(), source: 'bsale', organizationId: ctx.orgId, scope: 'current_catalog', imageFilesIncluded: false, records, categorySettings: settings.data, recentSyncRuns: runs.data }, {
            headers: { 'Content-Disposition': 'attachment; filename="facto-intel-catalogo.json"', 'Cache-Control': 'private, no-store' },
        });
    } catch (error) { return errorResponse(error); }
}
