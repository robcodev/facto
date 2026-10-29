import { z } from 'zod';

export const withdrawalKinds = { advance: 'Compra / rendición', bank_deposit: 'Depósito bancario', transfer: 'Traslado de efectivo', supplier_payment: 'Pago a proveedor', other: 'Otro retiro' } as const;
export const categories = ['Aseo', 'Embalaje', 'Transporte', 'Oficina', 'Mantención', 'Otros'] as const;
export const settlements = { pending: 'Pendiente de rendir', partial: 'Rendición parcial', settled: 'Rendida', void: 'Anulada', recorded: 'Retiro registrado' } as const;
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const money = (value: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value);
const amount = z.number().int().positive().max(10000000000);
const date = z.iso.date().refine(value => value <= today(), 'La fecha no puede ser futura.');
const text = (max: number) => z.string().trim().max(max);
export const mutationSchema = z.discriminatedUnion('action', [
    z.object({ action: z.literal('withdrawal'), id: z.uuid(), date, kind: z.enum(Object.keys(withdrawalKinds) as [keyof typeof withdrawalKinds, ...Array<keyof typeof withdrawalKinds>]), amount, recipient: text(160).min(1), purpose: text(500).min(1), reference: text(160).default(''), cashBox: text(120).min(1).default('Casa matriz') }).strict(),
    z.object({ action: z.literal('entry'), id: z.uuid(), withdrawalId: z.uuid(), date, kind: z.enum(['expense', 'return']), amount, category: z.union([z.enum(categories), z.literal('')]), description: text(500).min(1), merchant: text(160).default(''), receiptReference: text(160).default('') }).strict().refine(x => x.kind === 'expense' ? x.category !== '' : x.category === '', 'Selecciona una categoría para el gasto; el vuelto no lleva categoría.'),
    z.object({ action: z.literal('void_entry'), id: z.uuid(), reason: text(500).min(3) }).strict(),
    z.object({ action: z.literal('void_withdrawal'), id: z.uuid(), reason: text(500).min(3) }).strict(),
]);
export type CashMutation = z.infer<typeof mutationSchema>;
export const filtersSchema = z.object({
    from: z.iso.date(), to: z.iso.date(), view: z.enum(['withdrawals', 'expenses']).default('withdrawals'),
    status: z.enum(['', 'pending', 'partial', 'settled', 'void', 'recorded']).default(''),
    search: text(160).default(''), category: z.union([z.enum(categories), z.literal('')]).default(''), page: z.coerce.number().int().min(0).max(5000).default(0),
}).refine(x => x.from <= x.to && Date.parse(x.to) - Date.parse(x.from) <= 366 * 86400000, 'Selecciona un período de hasta un año.');
export type CashFilters = z.infer<typeof filtersSchema>;
export type Withdrawal = { id: string; movement_date: string; kind: keyof typeof withdrawalKinds; amount: number; recipient: string; purpose: string; reference: string; cash_box: string; status: string; created_at: string; created_by_label: string; void_reason: string | null; voided_at: string | null; spent: number; returned: number; pending: number; settlement: keyof typeof settlements };
export type CashEntry = { id: string; withdrawal_id: string; entry_date: string; kind: 'expense' | 'return'; amount: number; category: string; description: string; merchant: string; receipt_reference: string; status: string; created_at: string; created_by_label: string; void_reason: string | null; voided_at: string | null };
export type CashReport = { summary: { withdrawn: number; expenses: number; returned: number; pendingAllDates: number; categories: { category: string; amount: number }[] }; withdrawals: Withdrawal[]; expenses: Array<Pick<CashEntry, 'id' | 'withdrawal_id' | 'entry_date' | 'amount' | 'category' | 'description' | 'merchant' | 'receipt_reference' | 'created_at' | 'created_by_label'> & { recipient: string }>; total: number; page: number };
