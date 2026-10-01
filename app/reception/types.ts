export interface ReceptionDetail {
    code: string;
    quantity: number;
    netUnitValue: number;
}

export interface StockReceptionPayload {
    officeId: number;
    documentNumber: string;
    documentType?: 'FACTURA' | 'GUÍA' | 'OTRO';
    details: ReceptionDetail[];
    note?: string;
}

export interface BsaleOffice {
    id: number;
    name: string;
}
