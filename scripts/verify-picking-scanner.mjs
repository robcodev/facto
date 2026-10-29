import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const { outputText } = ts.transpileModule(readFileSync(new URL('../app/picking/document-number.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { parsePickingDocumentNumber: parse } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
test('accepts complete scanned numbers and the displayed # prefix without dropping leading zeros', () => {
    assert.equal(parse('12345'), '12345');
    assert.equal(parse('  #00123\r\n'), '00123');
});
test('does not silently convert malformed identifiers into another order', () => {
    for (const value of ['', 'abc123', '123abc', '12 34', '12-34', '12.34', '-123', '##123', '1e3']) assert.equal(parse(value), null, value);
});
