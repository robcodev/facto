export interface InvoiceItem {
    code: string;
    quantity: number;
    netUnitValue: number;
    discount?: number;
    totalNet: number;
}

export interface InvoiceExtractionResponse {
    invoiceItems: InvoiceItem[];
}