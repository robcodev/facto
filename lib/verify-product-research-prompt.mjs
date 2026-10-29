// Offline prompt regression checks. No Gemini, Bsale or database calls.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import ts from 'typescript';

const source = await readFile(new URL('./product-research-prompt.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { MULTISPORT_TABLE_STANDARD: standard, PRODUCT_RESEARCH_RULES: rules, PRODUCT_RESEARCH_PROMPT_VERSION: version } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

// Exact user-supplied standard, normalizing only CRLF and outer whitespace.
const standardHash = createHash('sha256').update(standard).digest('hex');
assert.equal(standardHash, 'bc11f238d17c9db518d7a3f28316d3657317eda15030a100e50a9c60bec0a69c');
assert.equal(version, 'multisport-v2-tables-20261022');
assert.ok(rules.includes(standard));
for (const clause of [
    'exactamente un <h2> en mayúsculas y exactamente dos <p>',
    'Sin listas, tablas ni <h3>',
    'tabla técnica Tipo A',
    'Después incluye Tipo B solo cuando corresponda',
    'table table-borderless mb-0',
    'table table-sm table-bordered text-center my-1',
    'style="font-size:13px;"',
    '<th class="w-25" scope="row">',
    '<thead class="thead-light">',
    'NO son evidencia sobre el producto investigado',
    'No generes galerías ni imágenes sin solicitud expresa',
    'accepted debe ser false',
    'prohibida su reproducci&oacute;n.',
]) assert.ok(rules.includes(clause), `Missing prompt requirement: ${clause}`);
assert.ok(!rules.includes('puedes agregar primero una tabla comparativa'));
const route = await readFile(new URL('../app/api/web-catalog/research/route.ts', import.meta.url), 'utf8');
assert.ok(route.includes('const prompt = `${PRODUCT_RESEARCH_RULES}'));
assert.ok(route.includes('prompt_version: PRODUCT_RESEARCH_PROMPT_VERSION'));
assert.ok(route.includes('generateResearch(process.env.GEMINI_API_KEY, prompt)'));
console.log('Product research prompt: original standard preserved, table rules and route integration OK.');
