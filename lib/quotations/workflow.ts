import { researchNext } from './worker';
export async function researchProject(ref: { id: string; orgId: number; userId: string; token: string }) {
  'use workflow';
  for (let n = 0; n < 6500; n++) if (!(await researchNext(ref))) return;
}
