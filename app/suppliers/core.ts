export type Supplier = { id: string; name: string; rut: string; terms: string };
export type Installment = { id: string; date: string; amount: number };
export type Invoice = {
    id: string; supplierId: string; type: string; folio: string; issued: string;
    baseDate: string; baseKind: string; net: number; tax: number; total: number;
    kind: 'Mercadería' | 'Servicio / gasto'; reconciled: boolean; notes: string;
    installments: Installment[]; bsaleId?: string;
};
export type Allocation = { invoiceId: string; amount: number };
export type PaymentStatus = 'Pendiente' | 'Entregado' | 'Confirmado' | 'Anulado' | 'Rechazado' | 'Reemplazado';
export type Payment = {
    id: string; supplierId: string; method: string; reference: string; bank: string;
    amount: number; scheduled: string; delivered: string; effective: string;
    status: PaymentStatus; allocations: Allocation[]; replaces?: string;
};
export type Event = { id: string; at: string; text: string };
export type State = { version: 1; suppliers: Supplier[]; invoices: Invoice[]; payments: Payment[]; events: Event[] };
export const uid = () => crypto.randomUUID();
export function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
export function addDays(date: string, days: number) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
export const money = (amount: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(amount);
export const active = (p: Payment) => p.status === 'Pendiente' || p.status === 'Entregado';
const amountOk = (n: number) => Number.isSafeInteger(n) && n > 0;
const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s;
export function amounts(invoice: Invoice, payments: Payment[], day = today()) {
    const applied = (predicate: (p: Payment) => boolean) => payments.filter(predicate).reduce((sum, p) => sum + p.allocations.filter(a => a.invoiceId === invoice.id).reduce((n, a) => n + a.amount, 0), 0);
    const paid = applied(p => p.status === 'Confirmado');
    const committed = applied(active);
    const balance = invoice.total - paid;
    const due = invoice.installments.filter(q => q.date < day).reduce((sum, q) => sum + q.amount, 0);
    return { paid, committed, balance, uncovered: balance - committed, overdue: Math.max(0, due - paid) };
}
export function invoiceStatus(invoice: Invoice, payments: Payment[]) {
    if (!invoice.reconciled) return 'Por conciliar';
    const a = amounts(invoice, payments);
    return a.balance === 0 ? 'Pagada' : a.overdue > 0 ? 'Vencida' : a.paid > 0 ? 'Abono parcial' : 'Pendiente';
}
export function validateInvoice(state: State, invoice: Invoice) {
    if (!state.suppliers.some(s => s.id === invoice.supplierId)) throw new Error('Selecciona un proveedor.');
    if (!invoice.folio.trim()) throw new Error('Ingresa el folio.');
    if (invoice.bsaleId && state.invoices.some(i => i.id !== invoice.id && i.bsaleId === invoice.bsaleId)) throw new Error('Ese identificador de Bsale ya está vinculado a otra factura.');
    if (state.invoices.some(i => i.id !== invoice.id && i.supplierId === invoice.supplierId && i.type === invoice.type && i.folio.trim().replace(/^0+(?=\d)/, '') === invoice.folio.trim().replace(/^0+(?=\d)/, ''))) throw new Error('Ya existe ese tipo y folio para el proveedor en esta empresa de prueba.');
    if (!validDate(invoice.issued) || !validDate(invoice.baseDate)) throw new Error('Revisa las fechas de emisión y base del plazo.');
    if (!amountOk(invoice.total) || !Number.isSafeInteger(invoice.net) || invoice.net < 0 || !Number.isSafeInteger(invoice.tax) || invoice.tax < 0 || invoice.net + invoice.tax !== invoice.total) throw new Error('Neto más impuestos debe coincidir con el total, en pesos enteros.');
    if (!invoice.installments.length || invoice.installments.some(q => !validDate(q.date) || !amountOk(q.amount))) throw new Error('Cada cuota debe tener fecha válida y monto positivo.');
    if (invoice.installments.reduce((s, q) => s + q.amount, 0) !== invoice.total) throw new Error('La suma de cuotas debe coincidir con el total.');
    const a = amounts(invoice, state.payments);
    if (a.uncovered < 0) throw new Error('El total no puede ser menor que los pagos y compromisos existentes.');
    if (!invoice.reconciled && state.payments.some(p => (active(p) || p.status === 'Confirmado') && p.allocations.some(a => a.invoiceId === invoice.id))) throw new Error('Una factura con pagos o compromisos vigentes debe permanecer conciliada.');
}
export function validatePayment(state: State, payment: Payment) {
    if (!state.suppliers.some(s => s.id === payment.supplierId)) throw new Error('Selecciona un proveedor.');
    if (!amountOk(payment.amount) || !validDate(payment.scheduled)) throw new Error('Revisa el monto y la fecha programada.');
    if (payment.method === 'Cheque' && (!payment.reference.trim() || !payment.bank.trim())) throw new Error('El cheque necesita número y banco / cuenta.');
    if (payment.method === 'Transferencia' && (!payment.reference.trim() || !payment.bank.trim())) throw new Error('La transferencia necesita referencia y banco / cuenta.');
    if (payment.method === 'Cheque' && state.payments.some(p => p.id !== payment.id && p.method === 'Cheque' && p.bank.trim().toLowerCase() === payment.bank.trim().toLowerCase() && p.reference === payment.reference)) throw new Error('Ese número de cheque ya está registrado para el banco / cuenta.');
    if (payment.status === 'Confirmado' && !validDate(payment.effective)) throw new Error('Indica la fecha efectiva para confirmar el pago.');
    if (payment.status === 'Entregado' && !validDate(payment.delivered)) throw new Error('Indica la fecha de entrega.');
    if (new Set(payment.allocations.map(a => a.invoiceId)).size !== payment.allocations.length) throw new Error('No repitas una factura en la distribución.');
    if (payment.allocations.reduce((s, a) => s + a.amount, 0) > payment.amount) throw new Error('La distribución supera el monto del pago.');
    for (const allocation of payment.allocations) {
        const invoice = state.invoices.find(i => i.id === allocation.invoiceId);
        if (!invoice || invoice.supplierId !== payment.supplierId || !invoice.reconciled || !amountOk(allocation.amount)) throw new Error('Aplica montos positivos a facturas conciliadas del mismo proveedor.');
        const available = amounts(invoice, state.payments.filter(p => p.id !== payment.id)).uncovered;
        if ((active(payment) || payment.status === 'Confirmado') && allocation.amount > available) throw new Error(`La aplicación supera el saldo sin cubrir de la factura ${invoice.folio}.`);
    }
}
export function record(state: State, text: string): State { return { ...state, events: [{ id: uid(), at: new Date().toISOString(), text }, ...state.events] }; }
export function saveSupplier(state: State, supplier: Supplier): State {
    const rutKey = (rut: string) => rut.replace(/[.\s-]/g, '').toUpperCase();
    if (!supplier.name.trim() || !/^\d{7,8}[0-9K]$/.test(rutKey(supplier.rut))) throw new Error('Ingresa nombre y RUT con dígito verificador (formato chileno).');
    if (state.suppliers.some(s => s.id !== supplier.id && rutKey(s.rut) === rutKey(supplier.rut))) throw new Error('Ya existe un proveedor con ese RUT.');
    return record({ ...state, suppliers: [...state.suppliers.filter(s => s.id !== supplier.id), supplier] }, `Proveedor ${supplier.name}: ficha guardada.`);
}
export function saveInvoice(state: State, invoice: Invoice): State {
    validateInvoice(state, invoice);
    return record({ ...state, invoices: [...state.invoices.filter(i => i.id !== invoice.id), invoice] }, `Factura ${invoice.folio}: datos y calendario guardados.`);
}
export function savePayment(state: State, payment: Payment): State {
    const existing = state.payments.find(p => p.id === payment.id);
    if (existing) {
        if (!active(existing) && existing.status !== 'Confirmado') throw new Error('Este pago no admite nuevas aplicaciones.');
        const header = (p: Payment) => JSON.stringify({ ...p, allocations: [] });
        if (header(existing) !== header(payment)) throw new Error('Solo puedes editar la distribución de un pago registrado.');
        validatePayment(state, payment);
        return record({ ...state, payments: state.payments.map(p => p.id === payment.id ? payment : p) }, `Pago ${payment.reference || payment.id.slice(0, 8)}: distribución actualizada.`);
    }
    const old = payment.replaces ? state.payments.find(p => p.id === payment.replaces) : undefined;
    if (payment.replaces && (!old || !active(old) || old.supplierId !== payment.supplierId)) throw new Error('Solo puedes reemplazar un compromiso vigente del mismo proveedor.');
    const base = old ? { ...state, payments: state.payments.map(p => p.id === old.id ? { ...p, status: 'Reemplazado' as const } : p) } : state;
    validatePayment(base, payment);
    return record({ ...base, payments: [...base.payments, payment] }, `Pago ${payment.reference || payment.id.slice(0, 8)} registrado${old ? `; reemplaza ${old.reference}` : ''}.`);
}
export function transition(state: State, id: string, status: PaymentStatus, date: string): State {
    const payment = state.payments.find(p => p.id === id);
    if (!payment || !active(payment) || !['Entregado', 'Confirmado', 'Anulado', 'Rechazado'].includes(status) || (status === 'Entregado' && payment.status !== 'Pendiente')) throw new Error('Ese cambio de estado no está permitido.');
    const next = { ...payment, status, effective: status === 'Confirmado' ? date : payment.effective, delivered: status === 'Entregado' ? date : payment.delivered };
    validatePayment(state, next);
    return record({ ...state, payments: state.payments.map(p => p.id === id ? next : p) }, `Pago ${payment.reference || id.slice(0, 8)}: ${payment.status} → ${status}${status === 'Confirmado' || status === 'Entregado' ? ` (${date})` : ''}.`);
}
export function seed(): State {
    const d = today();
    const suppliers: Supplier[] = [
        { id: 's1', name: 'Proveedor de pesca · DEMO', rut: '76.000.001-6', terms: '30 y 60 días desde emisión; editable por factura.' },
        { id: 's2', name: 'Distribuidora outdoor · DEMO', rut: '76.000.002-4', terms: '30 días desde recepción.' },
        { id: 's3', name: 'Servicios de mantención · DEMO', rut: '76.000.003-2', terms: '15 días desde emisión.' },
    ];
    const make = (id: string, supplierId: string, folio: string, total: number, age: number, kind: Invoice['kind'], reconciled = true): Invoice => {
        const issued = addDays(d, -age), net = Math.round(total / 1.19);
        return { id, supplierId, folio, type: '33', issued, baseDate: issued, baseKind: 'Emisión', net, tax: total - net, total, kind, reconciled, notes: 'Documento ficticio para prueba.', installments: [{ id: `${id}-q1`, date: addDays(issued, 30), amount: total }] };
    };
    const first = make('i1', 's1', '1001', 1190000, 40, 'Mercadería');
    first.installments = [{ id: 'q1', date: addDays(first.issued, 30), amount: 595000 }, { id: 'q2', date: addDays(first.issued, 60), amount: 595000 }];
    const service = make('i4', 's3', '4001', 119000, 5, 'Servicio / gasto');
    service.installments[0].date = addDays(service.issued, 15);
    return { version: 1, suppliers, invoices: [first, make('i2', 's1', '1002', 238000, 10, 'Mercadería'), make('i3', 's2', '2001', 357000, 50, 'Mercadería'), service, make('i5', 's2', '1990', 595000, 120, 'Mercadería', false)], payments: [
        { id: 'p1', supplierId: 's1', method: 'Cheque', reference: '00001234', bank: 'Banco DEMO · cuenta 001', amount: 595000, scheduled: addDays(d, 5), delivered: '', effective: '', status: 'Pendiente', allocations: [{ invoiceId: 'i1', amount: 595000 }] },
        { id: 'p2', supplierId: 's2', method: 'Transferencia', reference: 'TR-DEMO-01', bank: 'Banco DEMO · cuenta 002', amount: 119000, scheduled: addDays(d, -5), delivered: '', effective: addDays(d, -5), status: 'Confirmado', allocations: [{ invoiceId: 'i3', amount: 119000 }] },
    ], events: [{ id: 'e1', at: new Date().toISOString(), text: 'Se cargaron cinco facturas ficticias, un cheque pendiente y un abono confirmado.' }] };
}
