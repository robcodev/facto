'use server';

const BSALE_TOKEN = process.env.BSALE_TOKEN;

// Headers estándar para Bsale
const getBsaleHeaders = () => {
    if (!BSALE_TOKEN) {
        throw new Error(
            'Falta configurar la variable de entorno BSALE_TOKEN'
        );
    }

    return {
        'Content-Type': 'application/json',
        access_token: BSALE_TOKEN,
    };
};

/**
 * PASO 2:
 * Validar si un SKU existe en Bsale como Variante
 *
 * Endpoint:
 * GET /v1/variants.json?code=SKU
 */
export async function checkSkuInBsale(sku: string) {
    try {
        const cleanSku = String(sku ?? '').trim();

        if (!cleanSku) {
            return {
                exists: false,
                variantId: null,
                name: null,
                error: 'SKU vacío',
            };
        }

        const response = await fetch(
            `https://api.bsale.io/v1/variants.json?code=${encodeURIComponent(cleanSku)}`,
            {
                method: 'GET',
                headers: getBsaleHeaders(),
                cache: 'no-store',
            }
        );

        const responseText = await response.text();

        let data: any = {};

        try {
            data = responseText ? JSON.parse(responseText) : {};
        } catch {
            data = {
                raw: responseText,
            };
        }

        if (!response.ok) {
            const message =
                data.description ||
                data.message ||
                data.error ||
                data.raw ||
                response.statusText;

            throw new Error(
                `Error de Bsale consultando SKU (${response.status}): ${message}`
            );
        }

        if (Array.isArray(data.items) && data.items.length > 0) {
            const variant = data.items[0];

            return {
                exists: true,
                variantId: variant.id,
                name: variant.description ?? null,
            };
        }

        return {
            exists: false,
            variantId: null,
            name: null,
        };
    } catch (error: any) {
        console.error(
            `Error en checkSkuInBsale para SKU ${sku}:`,
            error
        );

        return {
            exists: false,
            variantId: null,
            name: null,
            error:
                error?.message ||
                'Error interno al validar SKU en Bsale',
        };
    }
}

/**
 * SUBPASO:
 * Crear producto base y luego su variante/SKU.
 *
 * Bsale maneja producto y variante por separado.
 *
 * POST /v1/products.json
 * POST /v1/variants.json
 */
export async function createBsaleProduct(productData: {
    name: string;
    code: string;
    netUnitValue: number;
    priceValue: number;
}) {
    try {
        const name = String(productData.name ?? '').trim();
        const code = String(productData.code ?? '').trim();
        const netUnitValue = Number(productData.netUnitValue);
        const priceValue = Number(productData.priceValue);

        if (!name) {
            throw new Error('El nombre del producto está vacío');
        }

        if (!code) {
            throw new Error('El SKU del producto está vacío');
        }

        if (
            !Number.isFinite(netUnitValue) ||
            netUnitValue < 0
        ) {
            throw new Error(
                `Costo inválido: ${productData.netUnitValue}`
            );
        }

        if (
            !Number.isFinite(priceValue) ||
            priceValue < 0
        ) {
            throw new Error(
                `Precio inválido: ${productData.priceValue}`
            );
        }

        /**
         * 1. Crear producto base
         */
        const productPayload = {
            name,
            productTypeId: 1,
            allowDecimal: 0,
            stockControl: 1,
        };

        console.log(
            'Creando producto Bsale:',
            JSON.stringify(productPayload, null, 2)
        );

        const productResponse = await fetch(
            'https://api.bsale.io/v1/products.json',
            {
                method: 'POST',
                headers: getBsaleHeaders(),
                body: JSON.stringify(productPayload),
                cache: 'no-store',
            }
        );

        const productResponseText =
            await productResponse.text();

        let newProduct: any = {};

        try {
            newProduct = productResponseText
                ? JSON.parse(productResponseText)
                : {};
        } catch {
            newProduct = {
                raw: productResponseText,
            };
        }

        if (!productResponse.ok) {
            const message =
                newProduct.description ||
                newProduct.message ||
                newProduct.error ||
                newProduct.raw ||
                productResponse.statusText;

            throw new Error(
                `Error al crear producto en Bsale (${productResponse.status}): ${message}`
            );
        }

        if (!newProduct?.id) {
            throw new Error(
                'Bsale creó el producto pero no devolvió productId'
            );
        }

        /**
         * 2. Crear variante / SKU
         */
        const variantPayload = {
            productId: newProduct.id,
            description: name,
            code,
            unlimitedStock: 0,
            allowNegativeStock: 0,
        };

        console.log(
            'Creando variante Bsale:',
            JSON.stringify(variantPayload, null, 2)
        );

        const variantResponse = await fetch(
            'https://api.bsale.io/v1/variants.json',
            {
                method: 'POST',
                headers: getBsaleHeaders(),
                body: JSON.stringify(variantPayload),
                cache: 'no-store',
            }
        );

        const variantResponseText =
            await variantResponse.text();

        let newVariant: any = {};

        try {
            newVariant = variantResponseText
                ? JSON.parse(variantResponseText)
                : {};
        } catch {
            newVariant = {
                raw: variantResponseText,
            };
        }

        if (!variantResponse.ok) {
            const message =
                newVariant.description ||
                newVariant.message ||
                newVariant.error ||
                newVariant.raw ||
                variantResponse.statusText;

            throw new Error(
                `Producto creado, pero error al crear variante (${variantResponse.status}): ${message}`
            );
        }

        if (!newVariant?.id) {
            throw new Error(
                'La variante se creó pero Bsale no devolvió su ID'
            );
        }

        /*
         * Nota:
         * netUnitValue y priceValue quedan disponibles aquí.
         *
         * El costo real del inventario se enviará en la recepción
         * mediante "cost".
         *
         * Si también quieres actualizar lista de precios de Bsale,
         * eso se debe hacer con el endpoint correspondiente de precios.
         */

        return {
            success: true,
            productId: newProduct.id,
            variantId: newVariant.id,
            code,
            netUnitValue,
            priceValue,
        };
    } catch (error: any) {
        console.error(
            'Error en createBsaleProduct:',
            error
        );

        return {
            success: false,
            error:
                error?.message ||
                'Error interno creando producto en Bsale',
        };
    }
}

/**
 * PASO 3:
 * Ingreso definitivo de stock.
 *
 * Endpoint:
 * POST /v1/stocks/receptions.json
 */
export async function submitStockReception(payload: {
    officeId: number;
    documentNumber: string;
    details: {
        code: string;
        quantity: number;
        netUnitValue: number;
    }[];
}) {
    try {
        /**
         * Validar sucursal
         */
        const officeId = Number(payload.officeId);

        if (
            !Number.isInteger(officeId) ||
            officeId <= 0
        ) {
            throw new Error(
                `Sucursal inválida: ${payload.officeId}`
            );
        }

        /**
         * Bsale pide documentNumber como Integer
         */
        const documentNumber = Number.parseInt(
            String(payload.documentNumber),
            10
        );

        if (
            !Number.isInteger(documentNumber) ||
            documentNumber <= 0
        ) {
            throw new Error(
                `Número de documento inválido: ${payload.documentNumber}`
            );
        }

        if (
            !Array.isArray(payload.details) ||
            payload.details.length === 0
        ) {
            throw new Error(
                'La recepción no contiene productos'
            );
        }

        /**
         * Normalizar y validar cada detalle.
         *
         * Esto es importante porque JSON.stringify(NaN)
         * transforma NaN en null y Bsale devolvería Bad Request.
         */
        const details = payload.details.map(
            (item, index) => {
                const code = String(
                    item.code ?? ''
                ).trim();

                const quantity = Number(item.quantity);
                const cost = Number(item.netUnitValue);

                if (!code) {
                    throw new Error(
                        `Detalle ${index + 1}: SKU vacío`
                    );
                }

                if (
                    !Number.isFinite(quantity) ||
                    quantity <= 0
                ) {
                    throw new Error(
                        `Detalle ${index + 1} (${code}): cantidad inválida "${item.quantity}"`
                    );
                }

                /**
                 * Como los productos nuevos están configurados
                 * con allowDecimal: 0, evitamos mandar
                 * cantidades fraccionarias.
                 */
                if (!Number.isInteger(quantity)) {
                    throw new Error(
                        `Detalle ${index + 1} (${code}): la cantidad ${quantity} es decimal, pero el producto no acepta decimales`
                    );
                }

                if (
                    !Number.isFinite(cost) ||
                    cost < 0
                ) {
                    throw new Error(
                        `Detalle ${index + 1} (${code}): costo inválido "${item.netUnitValue}"`
                    );
                }

                return {
                    quantity,
                    code,
                    cost,
                };
            }
        );

        const bsalePayload = {
            document: 'FACTURA',
            officeId,
            documentNumber,
            note: 'Ingreso automatizado mediante Recepción por IA',
            details,
        };

        /**
         * IMPORTANTE:
         * Esto permitirá ver exactamente qué está llegando
         * a Bsale si vuelve a producirse un 400.
         */
        console.log(
            '===================================='
        );
        console.log(
            'RECEPCIÓN ENVIADA A BSALE'
        );
        console.log(
            JSON.stringify(bsalePayload, null, 2)
        );
        console.log(
            '===================================='
        );

        const response = await fetch(
            'https://api.bsale.io/v1/stocks/receptions.json',
            {
                method: 'POST',
                headers: getBsaleHeaders(),
                body: JSON.stringify(bsalePayload),
                cache: 'no-store',
            }
        );

        /**
         * Leemos como texto primero porque Bsale
         * no siempre devuelve el error bajo "description".
         */
        const responseText = await response.text();

        console.log(
            'Bsale Reception HTTP status:',
            response.status
        );

        console.log(
            'Bsale Reception response:',
            responseText
        );

        let result: any = {};

        try {
            result = responseText
                ? JSON.parse(responseText)
                : {};
        } catch {
            result = {
                raw: responseText,
            };
        }

        if (!response.ok) {
            console.error(
                'Error completo devuelto por Bsale:',
                result
            );

            const message =
                result.description ||
                result.message ||
                result.error ||
                result.detail ||
                result.raw ||
                response.statusText ||
                'Bad Request';

            throw new Error(
                `Error en la recepción de Bsale (${response.status}): ${message}`
            );
        }

        return {
            success: true,
            receptionId: result?.id ?? null,
            data: result,
        };
    } catch (error: any) {
        console.error(
            'Error en submitStockReception:',
            error
        );

        return {
            success: false,
            error:
                error?.message ||
                'Error interno ingresando stock en Bsale',
        };
    }
}

/**
 * EXTRA:
 * Obtener sucursales de Bsale
 *
 * GET /v1/offices.json
 */
export async function getBsaleOffices() {
    try {
        const response = await fetch(
            'https://api.bsale.io/v1/offices.json',
            {
                method: 'GET',
                headers: getBsaleHeaders(),
                cache: 'no-store',
            }
        );

        const responseText = await response.text();

        let data: any = {};

        try {
            data = responseText
                ? JSON.parse(responseText)
                : {};
        } catch {
            data = {
                raw: responseText,
            };
        }

        if (!response.ok) {
            const message =
                data.description ||
                data.message ||
                data.error ||
                data.raw ||
                response.statusText;

            throw new Error(
                `No se pudieron cargar las sucursales desde Bsale (${response.status}): ${message}`
            );
        }

        const offices = Array.isArray(data.items)
            ? data.items
                .filter(
                    (office: any) =>
                        office?.id != null
                )
                .map((office: any) => ({
                    id: office.id,
                    name:
                        office.name ??
                        `Sucursal ${office.id}`,
                }))
            : [];

        return {
            success: true,
            offices,
        };
    } catch (error: any) {
        console.error(
            'Error en getBsaleOffices:',
            error
        );

        return {
            success: false,
            error:
                error?.message ||
                'Error interno cargando sucursales',
            offices: [],
        };
    }
}