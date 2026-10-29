// Offline regression checks for the actual catalog syncPage implementation.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const compile = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`;
const normalize = compile(await readFile(new URL('./normalize.ts', import.meta.url), 'utf8'));
const source = (await readFile(new URL('./server.ts', import.meta.url), 'utf8'))
    .replace("import 'server-only';", '')
    .replace("import { createClient } from '@/lib/supabase/server';", 'const createClient = () => { throw new Error("Not used"); };')
    .replace("import { createAdminClient } from '@/lib/supabase/admin';", 'const createAdminClient = () => { throw new Error("Not used"); };')
    .replace("'./normalize'", JSON.stringify(normalize));
const { syncPage } = await import(compile(source));
process.env.BSALE_TOKEN = 'offline-test';
let run, saved, calls, commits, count;
function reset(scope = 'catalog') {
    run = { id: 'test', status: 'running', stage: 7, page_offset: 0, config: { scope } };
    saved = []; calls = []; commits = []; count = 1;
}
const db = {
    from(table) {
        const q = { select() { return q; }, eq() { return q; }, order() { return q; }, update() { return q; },
            range: async () => ({ data: saved, error: null }), single: async () => ({ data: { ...run }, error: null }) };
        assert.ok(['intel_sync_runs', 'intel_records'].includes(table));
        return q;
    },
    async rpc(name, args) {
        assert.equal(name, 'intel_commit_page');
        commits.push(args);
        run = { ...run, stage: args.p_next_stage, page_offset: args.p_next_offset, status: args.p_done ? 'completed' : 'running' };
        return { error: null };
    },
};
const originalFetch = globalThis.fetch;
globalThis.fetch = async url => {
    calls.push(String(url));
    return Response.json({ count, items: [{ id: 1, name: 'Collection' }] });
};
try {
    reset();
    assert.equal((await syncPage({ db, orgId: 1 }, 'test')).status, 'completed');
    assert.equal(commits[0].p_rows[1].data.importedCount, 1);
    assert.ok(calls.every(url => !url.includes('stocks') && !url.includes('/details')));
    await syncPage({ db, orgId: 1 }, 'test');
    assert.equal(calls.length, 1, 'completed runs do not fetch again');
    reset('full');
    assert.equal((await syncPage({ db, orgId: 1 }, 'test')).status, 'running', 'legacy full runs continue to stock');
    for (const stage of [1, 2, 3, 9]) {
        reset(); run.stage = stage;
        await syncPage({ db, orgId: 1 }, 'test');
        assert.equal(calls.length, 0, 'excluded stages never call Bsale');
        assert.equal(commits[0].p_rows.length, 0, 'skipping preserves previously stored data');
    }
    reset(); count = 2; run.page_offset = 1; saved = [{ external_id: '1' }];
    await assert.rejects(() => syncPage({ db, orgId: 1 }, 'test'), /identificadores únicos/);
    assert.equal(commits.length, 0, 'duplicate page IDs cannot complete a block');
    reset(); count = null;
    await assert.rejects(() => syncPage({ db, orgId: 1 }, 'test'), /total válido/);
    assert.equal(commits.length, 0);
    console.log('Catalog: initial-only completion, legacy continuation, replay, unique counts and missing totals passed.');
} finally { globalThis.fetch = originalFetch; }
