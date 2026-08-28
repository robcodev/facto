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
        const officeId = Number(payload.officeId);

        if (!Number.isInteger(officeId) || officeId <= 0) {
            throw new Error(`Sucursal inválida: ${payload.officeId}`);
        }

        const documentNumber = Number.parseInt(
            String(payload.documentNumber),
            10
        );

        if (!Number.isInteger(documentNumber) || documentNumber <= 0) {
            throw new Error(
                `Número de documento inválido: ${payload.documentNumber}`
            );
        }

        if (!Array.isArray(payload.details) || payload.details.length === 0) {
            throw new Error('La recepción no contiene productos');
        }

        /**
         * 1. Validar datos locales
         */
        const normalizedDetails = payload.details.map((item, index) => {
            const code = String(item.code ?? '').trim();
            const quantity = Number(item.quantity);
            const cost = Number(item.netUnitValue);

            if (!code) {
                throw new Error(`Detalle ${index + 1}: SKU vacío`);
            }

            if (!Number.isFinite(quantity) || quantity <= 0) {
                throw new Error(
                    `Detalle ${index + 1} (${code}): cantidad inválida`
                );
            }

            if (!Number.isInteger(quantity)) {
                throw new Error(
                    `Detalle ${index + 1} (${code}): cantidad decimal no permitida (${quantity})`
                );
            }

            if (!Number.isFinite(cost) || cost < 0) {
                throw new Error(
                    `Detalle ${index + 1} (${code}): costo inválido`
                );
            }

            return {
                code,
                quantity,
                cost,
            };
        });

        /**
         * 2. Resolver cada SKU contra Bsale.
         *
         * No enviamos la recepción hasta estar seguros
         * de que TODOS los SKU corresponden a variantes.
         */
        const resolvedDetails = [];

        for (const item of normalizedDetails) {
            console.log(`Buscando variante Bsale para SKU: ${item.code}`);

            const variantResponse = await fetch(
                `https://api.bsale.io/v1/variants.json?code=${encodeURIComponent(
                    item.code
                )}`,
                {
                    method: 'GET',
                    headers: getBsaleHeaders(),
                    cache: 'no-store',
                }
            );

            const variantText = await variantResponse.text();

            let variantData: any = {};

            try {
                variantData = variantText
                    ? JSON.parse(variantText)
                    : {};
            } catch {
                variantData = {
                    raw: variantText,
                };
            }

            if (!variantResponse.ok) {
                console.error(
                    `Error consultando SKU ${item.code}:`,
                    variantData
                );

                throw new Error(
                    `No se pudo validar el SKU ${item.code} en Bsale`
                );
            }

            /**
             * Importante:
             * Bsale puede devolver items=[] si el SKU no existe.
             */
            if (
                !Array.isArray(variantData.items) ||
                variantData.items.length === 0
            ) {
                throw new Error(
                    `El SKU "${item.code}" no existe como variante en Bsale`
                );
            }

            /**
             * Buscamos coincidencia exacta del SKU.
             *
             * Esto evita tomar accidentalmente otro resultado.
             */
            const exactVariant =
                variantData.items.find(
                    (variant: any) =>
                        String(variant.code ?? '').trim() === item.code
                ) ?? variantData.items[0];

            if (!exactVariant?.id) {
                throw new Error(
                    `El SKU "${item.code}" fue encontrado, pero Bsale no devolvió un variantId válido`
                );
            }

            /**
             * state:
             * 0 = activo
             * 1 = inactivo
             */
            if (exactVariant.state === 1) {
                throw new Error(
                    `El SKU "${item.code}" existe en Bsale pero su variante está inactiva`
                );
            }

            console.log(
                `✓ SKU ${item.code} -> variantId ${exactVariant.id}`
            );

            resolvedDetails.push({
                variantId: Number(exactVariant.id),
                code: item.code,
                quantity: item.quantity,
                cost: item.cost,
            });
        }

        /**
         * 3. Mostrar todas las variantes resueltas.
         */
        console.log(
            '========================================'
        );

        console.log('VARIANTES RESUELTAS PARA RECEPCIÓN');

        console.log(
            JSON.stringify(resolvedDetails, null, 2)
        );

        console.log(
            '========================================'
        );

        /**
         * 4. Crear payload.
         *
         * Usamos id de variante en lugar de confiar
         * nuevamente en la resolución por SKU.
         */
        const bsalePayload = {
            document: 'FACTURA',
            officeId,
            documentNumber,
            note: 'Ingreso automatizado mediante Recepción por IA',

            details: resolvedDetails.map((item) => ({
                quantity: item.quantity,

                // ID REAL DE LA VARIANTE BSALE
                id: item.variantId,

                cost: item.cost,
            })),
        };

        console.log(
            'PAYLOAD FINAL ENVIADO A BSALE:'
        );

        console.log(
            JSON.stringify(bsalePayload, null, 2)
        );

        /**
         * 5. Crear recepción
         */
        const response = await fetch(
            'https://api.bsale.io/v1/stocks/receptions.json',
            {
                method: 'POST',
                headers: getBsaleHeaders(),
                body: JSON.stringify(bsalePayload),
                cache: 'no-store',
            }
        );

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

        console.log(
            `✓ Recepción Bsale creada correctamente: ${result.id}`
        );

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