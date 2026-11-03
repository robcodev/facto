import { z } from 'zod';

export const workflowStages = { proposed: 'Propuesto', preparing: 'En preparación', ready: 'Listo para publicar' } as const;
export const channels = { instagram: 'Instagram', facebook: 'Facebook', email: 'Emailing', web: 'Banner web', blog: 'Blog' } as const;
export const httpsUrl = z.url().max(2000).refine(value => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password;
}, 'Usa un enlace HTTPS sin credenciales.');
export const taskSchema = z.object({
  entryId: z.uuid(), expectedVersion: z.number().int().nonnegative(),
  stage: z.enum(['proposed', 'preparing', 'ready']),
  owner: z.string().trim().max(120), assetUrl: httpsUrl.nullable(), notes: z.string().trim().max(2000),
});
export const executionSchema = z.object({
  id: z.uuid(), entryId: z.uuid(), expectedVersion: z.number().int().nonnegative(),
  channel: z.enum(['instagram', 'facebook', 'email', 'web', 'blog']),
  publishedAt: z.iso.datetime({ offset: true }), activeUntil: z.iso.datetime({ offset: true }).nullable(),
  publicationUrl: httpsUrl.nullable(), assetUrl: httpsUrl,
  destinationUrl: httpsUrl, notes: z.string().trim().max(2000),
  productIds: z.array(z.string().regex(/^\d+$/)).min(1).max(6),
}).superRefine((p, ctx) => {
  if (Date.parse(p.publishedAt) > Date.now()) ctx.addIssue({ code: 'custom', message: 'La publicación debe haber ocurrido.', path: ['publishedAt'] });
  if (p.activeUntil && Date.parse(p.activeUntil) < Date.parse(p.publishedAt)) ctx.addIssue({ code: 'custom', message: 'El fin de vigencia debe ser posterior al inicio.', path: ['activeUntil'] });
  if (new Set(p.productIds).size !== p.productIds.length) ctx.addIssue({ code: 'custom', message: 'Hay productos repetidos.', path: ['productIds'] });
});
export function tracking(id: string, channel: keyof typeof channels, destination: string, internal = false) {
  const fields = { utm_source: channel, utm_medium: channel === 'email' ? 'email' : internal ? 'internal' : 'social', utm_campaign: 'facto_contenido', utm_content: id+'-'+channel };
  const url = new URL(destination);
  if (internal) for (const key of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','utm_id']) url.searchParams.delete(key);
  if (!internal) for (const [key, value] of Object.entries(fields)) url.searchParams.set(key, value);
  return { ...fields, url: url.href, internal };
}
export const chileDay = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
