'use server';

const BSALE_TOKEN = process.env.BSALE_TOKEN;

// Helper para configurar las cabeceras de Bsale de forma estandarizada
const getBsaleHeaders = () => {
    if (!BSALE_TOKEN) {
        throw new Error('Falta configurar la variable de entorno BSALE_ACCESS_TOKEN');
    }
    return {
        'Content-Type': 'application/json',
        'access_token': BSALE_TOKEN,
    };
};

/**
 * PASO 2: Validar si un SKU existe en Bsale como Variante
 * Endpoint: GET /v1/variants.json?code=SKU
 */
export async function checkSkuInBsale(sku: string) {
    try {
        console.log(sku)
        const response = await fetch(`https://api.bsale.io/v1/variants.json?code=${encodeURIComponent(sku)}`, {
            method: 'GET',
            headers: getBsaleHeaders(),
            cache: 'no-store', // Evitamos el caché para tener datos reales en cada validación
        });

        if (!response.ok) {
            throw new Error(`Error de Bsale consultando SKU: ${response.statusText}`);
        }

        const data = await response.json();

        // Bsale devuelve una estructura con { href, count, limit, offset, items }
        if (data.items && data.items.length > 0) {
            const variant = data.items[0];
            return {
                exists: true,
                variantId: variant.id,
                name: variant.description, // Descripción completa de la variante encontrada
            };
        }

        return { exists: false, variantId: null, name: null };
    } catch (error: any) {
        console.error(`Error en checkSkuInBsale para SKU ${sku}:`, error);
        return { error: error.message || 'Error interno de validación' };
    }
}

/**
 * SUBPASO OPCIONAL: Crear Producto Base y su Variante (SKU) si no existe
 * Endpoint: POST /v1/products.json
 * Nota: Bsale permite enviar la variante incrustada dentro del JSON del producto base.
 */
export async function createBsaleProduct(productData: {
    name: string;
    sku: string;
    netUnitValue: number; // Costo unitario neto extraído por la IA
    priceValue: number;   // Precio de venta final ingresado por el usuario
}) {
    try {
        const payload = {
            name: productData.name,
            productTypeId: 1, // Tipo de producto estándar (Ajustar según la configuración de tu tienda)
            allowDecimal: 0,
            variants: [
                {
                    code: productData.sku,
                    description: productData.name,
                    cost: productData.netUnitValue, // Guardamos el costo de entrada neto
                    price: productData.priceValue,  // Precio de venta final
                    state: 1, // Variante activa
                }
            ]
        };

        const response = await fetch(`https://api.bsale.io/v1/products.json`, {
            method: 'POST',
            headers: getBsaleHeaders(),
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(`Error al crear producto en Bsale: ${errData.description || response.statusText}`);
        }

        const newProduct = await response.json();

        // Capturamos el variantId recién generado para enlazarlo de inmediato en la UI
        const createdVariantId = newProduct.variants?.[0]?.id;
        if (!createdVariantId) {
            throw new Error('El producto se creó pero no se capturó el ID de la variante.');
        }

        return { success: true, variantId: createdVariantId };
    } catch (error: any) {
        console.error('Error en createBsaleProduct:', error);
        return { success: false, error: error.message };
    }
}

/**
 * PASO 3: Consolidación e Ingreso definitivo de Stock (Recepción Ajustada a Documentación)
 * Endpoint: POST /v1/stocks/receptions.json
 */
export async function submitStockReception(payload: {
    officeId: number;        // ID de la sucursal elegida
    documentNumber: string;  // Número de la factura (se convertirá a Integer)
    details: {
        sku: string;         // Usamos el SKU directamente como 'code'
        quantity: number;    // Cantidad ingreso de stock
        netUnitValue: number;  // Costo asociado al ingreso (cost)
    }[];
}) {
    try {
        // Estructuramos el objeto JSON respetando exactamente la documentación oficial
        const bsalePayload = {
            document: "FACTURA", // Interfaz de Bsale mostrará que ingresó por Factura
            officeId: payload.officeId,
            documentNumber: parseInt(payload.documentNumber, 10) || 0, // Bsale pide un Integer
            note: "Ingreso automatizado mediante Recepción por IA",
            details: payload.details.map(item => ({
                quantity: item.quantity,
                code: item.sku, // Referenciamos al producto mediante su 'code' (SKU)
                cost: item.netUnitValue // Costo asociado al ingreso
            })),
        };

        const response = await fetch(`https://api.bsale.io/v1/stocks/receptions.json`, {
            method: 'POST',
            headers: getBsaleHeaders(),
            body: JSON.stringify(bsalePayload),
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(`Error en la recepción de Bsale: ${errData.description || response.statusText}`);
        }

        const result = await response.json();

        // Retornamos el ID de la recepción de stock creada exitosamente (ej: 831)
        return { success: true, receptionId: result.id };
    } catch (error: any) {
        console.error('Error en submitStockReception:', error);
        return { success: false, error: error.message };
    }
}

/**
 * EXTRA: Listar las sucursales activas para el menú desplegable (Paso 3)
 * Endpoint: GET /v1/offices.json
 */
export async function getBsaleOffices() {
    try {
        const response = await fetch(`https://api.bsale.io/v1/offices.json`, {
            method: 'GET',
            headers: getBsaleHeaders(),
        });

        if (!response.ok) {
            throw new Error('No se pudieron cargar las sucursales desde Bsale');
        }

        const data = await response.json();
        return {
            success: true,
            offices: data.items.map((office: any) => ({
                id: office.id,
                name: office.name,
            })),
        };
    } catch (error: any) {
        console.error('Error en getBsaleOffices:', error);
        return { success: false, error: error.message, offices: [] };
    }
}