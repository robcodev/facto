export type BsalePriceList = {
    id: number;
    name: string;
    state: number;
    base: number | null;
};

export type PriceComparisonRow = {
    variantId: number;
    detailId: number | null;
    sku: string;
    variantName: string;
    productId: number;
    productName: string;
    productTypeId: number | null;
    productTypeName: string;
    referencePrice: number;
    currentPrice: number | null;
};

export type PriceUpdateInput = {
    variantId: number;
    detailId: number;
    grossPrice: number;
};

export type PriceUpdateResult = {
    variantId: number;
    detailId: number;
    success: boolean;
    error?: string;
};

export type PriceCatalogRow = {
    variantId: number;
    productId: number;
    sku: string;
    productName: string;
    variantName: string;
    productTypeId: number | null;
    productTypeName: string;
    price: number;
};

export type BsaleOfficeOption = { id: number; name: string };
export type VariantStock = { variantId: number; quantity: number; reserved: number; available: number };
