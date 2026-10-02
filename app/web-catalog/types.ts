export type WebCatalogOffice = { id: number; name: string };

export type WebCatalogVariant = {
    id: number;
    sku: string;
    name: string;
    available: number;
};

export type WebCatalogGap = {
    productId: number;
    productName: string;
    brandName: string;
    productTypeName: string;
    available: number;
    reason: 'missing_description' | 'missing_collection';
    collections: string[];
    variants: WebCatalogVariant[];
};
