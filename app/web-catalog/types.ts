export type WebCatalogOffice = { id: number; name: string };

export type WebCatalogVariant = {
    id: number;
    sku: string;
    name: string;
    available: number;
};

export type WebCatalogGap = {
    webMarketInfoId: number | null;
    productId: number;
    productName: string;
    brandName: string;
    productTypeName: string;
    available: number;
    reason: 'missing_description' | 'missing_collection' | 'ready';
    collections: string[];
    currentDescription: string;
    currentAdditionalDescription: string;
    variants: WebCatalogVariant[];
};

export type ProductResearchSource = {
    title: string;
    url: string;
};

export type ProductResearchFact = {
    label: string;
    value: string;
    confidence: 'low' | 'medium' | 'high';
    sourceIndexes: number[];
    accepted: boolean;
};

export type ProductResearchDraft = {
    productId: number;
    productName: string;
    brandName: string;
    sources: ProductResearchSource[];
    facts: ProductResearchFact[];
    warnings: string[];
    confidence: 'low' | 'medium' | 'high';
    blockOneHtml: string;
    blockTwoHtml: string;
    status: 'draft' | 'needs_review' | 'approved';
    updatedAt?: string;
};
