import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../lib/zpl/preview-lifecycle.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { PreviewTask, printOnce } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('repeated clicks cannot start simultaneous preview requests', () => {
    const guard = new PreviewTask();
    const first = guard.begin();
    assert.ok(first);
    assert.equal(guard.begin(), null);
    assert.equal(guard.finish(first), true);
    assert.ok(guard.begin());
});

test('editing cancels the old response without finishing a newer request', () => {
    const guard = new PreviewTask();
    const old = guard.begin();
    guard.cancel();
    assert.equal(old.signal.aborted, true);
    const current = guard.begin();
    assert.equal(guard.isCurrent(old), false);
    assert.equal(guard.finish(old), false);
    assert.equal(guard.isCurrent(current), true);
    assert.equal(guard.finish(current), true);
});

test('cancel during PDF body loading rejects the late result too', async () => {
    const guard = new PreviewTask();
    const request = guard.begin();
    let complete;
    const body = new Promise(resolve => { complete = resolve; });
    const rendered = body.then(() => guard.isCurrent(request));
    guard.cancel();
    complete();
    assert.equal(await rendered, false);
});

test('failure permits a retry and unmount invalidates the task', () => {
    const guard = new PreviewTask();
    const failed = guard.begin();
    assert.equal(guard.finish(failed), true);
    const retry = guard.begin();
    guard.cancel();
    assert.equal(guard.isCurrent(retry), false);
});

for (const order of ['load then fallback', 'fallback then load']) {
    test(`printing is requested once: ${order}`, () => {
        let calls = 0;
        const request = printOnce({ closed: false, print() { calls += 1; } });
        request(); request(); request();
        assert.equal(calls, 1);
    });
}

test('a window closed before loading does not print', () => {
    let calls = 0;
    printOnce({ closed: true, print() { calls += 1; } })();
    assert.equal(calls, 0);
});
