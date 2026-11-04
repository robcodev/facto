import { sleep } from 'workflow';
import type { Ref } from './core';
import { prepareStep, extractStep, groupStep, countStep, finishStep, failStep } from './steps';
export async function readCatalog(ref:Ref) {
    'use workflow';
    try {
        const pages=await prepareStep(ref);
        for(let page=0;page<pages;page++) {
            for(let attempt=0;attempt<3;attempt++) {
                const result=await extractStep(ref,page,attempt);
                if(result.ok) break;
                if(!result.retryable || attempt===2) { await failStep(ref,`Página ${page+1}: ${result.message}`); return; }
                await sleep(attempt===0?'10s':'30s');
            }
        }
        const rows=await countStep(ref);
        for(let offset=0;offset<rows;offset+=40) {
            for(let attempt=0;attempt<3;attempt++) {
                const result=await groupStep(ref,offset,attempt);
                if(result.ok) break;
                if(!result.retryable || attempt===2) { await failStep(ref,`Agrupación de variantes: ${result.message}`); return; }
                await sleep(attempt===0?'10s':'30s');
            }
        }
        await finishStep(ref);
    } catch {
        await failStep(ref,'La tarea se interrumpió. Puedes reanudarla desde la última parte guardada.');
    }
}
