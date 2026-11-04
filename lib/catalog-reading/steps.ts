import { prepare, extract, group, finish, loadRef, markFailed } from './server';
import { rowsOf, type Ref } from './core';
export async function prepareStep(ref:Ref) {
    'use step';
    return prepare(ref);
}
export async function extractStep(ref:Ref,page:number,attempt:number) {
    'use step';
    return extract(ref,page,attempt);
}
export async function groupStep(ref:Ref,offset:number,attempt:number) {
    'use step';
    return group(ref,offset,attempt);
}
export async function countStep(ref:Ref) {
    'use step';
    return rowsOf((await loadRef(ref)).job).length;
}
export async function finishStep(ref:Ref) {
    'use step';
    return finish(ref);
}
export async function failStep(ref:Ref,message:string) {
    'use step';
    await markFailed(ref,message);
}
// AI retries are controlled by the workflow, rather than multiplied by SDK retries.
extractStep.maxRetries=0;
groupStep.maxRetries=0;
