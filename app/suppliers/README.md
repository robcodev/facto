# Proveedores y cuentas por pagar: prueba local

Ruta `/suppliers`, menú **Finanzas ($) → Proveedores y pagos**. Comparte la colección con **Caja y gastos** (`/cash`). Mantiene el acceso habitual de Facto.

Incluye proveedores editables, cinco facturas ficticias, cuotas libres, calendario, pagos, anticipos, aplicaciones a varias facturas del mismo proveedor y registro de entrega, confirmación efectiva, anulación, rechazo y reemplazo. Las referencias conservan ceros iniciales. Servicios y gastos no requieren SKU ni recepción.

## Aislamiento y persistencia

No llama a Bsale, Supabase, Gemini, bancos ni funciones de stock. El ID Bsale es una referencia manual de prueba con unicidad, sin sincronización. La autenticación del sitio sigue operando como antes.

Usar únicamente datos ficticios. Los cambios se conservan después de cada operación en `sessionStorage` de la pestaña con clave `facto-suppliers-demo-v1`. No es una base compartida ni un respaldo contable. El cierre de la pestaña normalmente elimina la sesión, aunque la restauración del navegador puede conservarla. Se puede exportar JSON y reiniciar la muestra.

## Reglas

- Empresa ficticia única, moneda CLP, pesos enteros. Neto + impuestos = total. Cuotas positivas cuya suma coincide con el total.
- Unicidad por proveedor (RUT único), tipo y folio normalizado. Un ID Bsale solo puede vincularse a una factura.
- Saldo pendiente = total menos pagos efectivos aplicados. Comprometido = aplicaciones pendientes o entregadas. Sin cubrir = saldo menos comprometido.
- Vencido = cuotas anteriores al día actual en Santiago menos pagos efectivos. Los pagos efectivos se imputan primero a las cuotas más antiguas. Un cheque pendiente no elimina vencimientos. Esta regla de imputación debe acordarse antes de la versión definitiva.
- Facturas por conciliar quedan fuera de totales, calendario y nuevas aplicaciones. Marcarlas conciliadas supone revisar la obligación completa; saldos históricos parciales se resolverán con la futura conciliación del Excel.
- No se puede aplicar por encima del saldo disponible ni mezclar proveedores. El remanente de un pago puede conservarse como anticipo y distribuirse posteriormente.
- La confirmación efectiva exige fecha y es manual. No equivale a conciliación bancaria automática. No se puede confirmar dos veces el mismo instrumento ni cambiar el importe de un pago registrado.
- Reemplazar conserva el instrumento anterior, libera su compromiso y valida el nuevo como una sola operación local. Anulación y rechazo liberan el compromiso.
- Cambiar la fecha base no recalcula cuotas automáticamente. El botón 30/60 propone dos cuotas en días corridos. Las condiciones habituales del proveedor son una referencia editable por factura.
- Historial local con usuario de prueba, sin auditoría compartida ni permisos financieros específicos.

## Verificación

Desde la raíz de Facto:

```text
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js app/suppliers/core.ts app/suppliers/page.tsx components/Sidebar.tsx
node app/suppliers/verify.cjs
```

Prueba manual: revisar factura 1001 con dos cuotas de $595.000; reemplazar cheque 00001234 por 00001235 sin aumentar el compromiso; confirmar el nuevo instrumento con fecha efectiva y observar la reducción del saldo; revisar factura 4001 de servicios y 1990 por conciliar; repartir un pago entre 1001 y 1002 del mismo proveedor.

## Etapas pendientes

Persistencia compartida, responsables y permisos; comprobantes; notas de crédito y ajustes; importación Bsale/XML y Excel conciliado; ampliación de IA; vínculos con recepciones y variantes de Intel; control persistente de reintentos y recuperación de recepciones con resultado incierto. Este módulo no debe usarse todavía para registrar deuda real.
