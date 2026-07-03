export interface InvoiceItem {
    sku: string;
    quantity: number;
    netUnitValue: number;
    discount?: number;
    totalNet: number;
}

export interface InvoiceExtractionResponse {
    invoiceItems: InvoiceItem[];
}