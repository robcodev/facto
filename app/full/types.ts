export type FullReportItem = {
    originalSku: string;
    fullSku: string;
    quantity: number;
    title: string;
    saleCount: number;
    finalAmountWithTax: number;
    presaleNetUnitValue: number;
};

export type FullReportExclusion = {
    status: string;
    rows: number;
    units: number;
};

export type FullReportAnalysis = {
    sheetName: string;
    sourceRows: number;
    includedRows: number;
    includedUnits: number;
    combinedPurchaseRows: number;
    totalReceivedWithTax: number;
    combinedAllocatedWithTax: number;
    items: FullReportItem[];
    exclusions: FullReportExclusion[];
};

export type FullBsaleValidation = {
    originalSku: string;
    fullSku: string;
    originalExists: boolean;
    fullExists: boolean;
    originalName: string | null;
    fullName: string | null;
    originalVariantId: number | null;
    fullVariantId: number | null;
    averageCost: number | null;
    costSource: 'last_reception' | 'average' | 'missing' | 'manual';
    costDate?: string;
    error?: string;
};

export type FullPresalePayload = {
    officeId: number;
    priceListId?: number;
    details: Array<{
        code: string;
        quantity: number;
        netUnitValue: number;
    }>;
};
