# Proveedores: registro de facturas pagadas

Regla acordada: **Guardar y marcar pagada** registra la forma de pago y marca pagada la factura completa en Facto, incluso si se usa cheque. No se ejecutan pagos, no se actualiza Bsale y el estado no es una certificación de cobro bancario. No contempla abonos parciales en este flujo.

## Consulta

- Estado de pago: todas, pendientes de registrar pago, pagadas.
- Forma registrada: cheque, transferencia, efectivo u otro; combinable con proveedor y búsqueda por folio/RUT.
- **Ver facturas pagadas** abre el listado del periodo consultado en un modal, con forma, cheque, fecha y responsable. No depende de que la factura venza en el día seleccionado.
- El calendario excluye las pagadas de los vencimientos pendientes y las muestra en verde el día de registro. La recepción en SII permanece en azul.
- El modal conserva forma y cheque guardados y permite corregir esos datos sin cambiar la fecha original del pago. Un cambio del total o moneda en Bsale requiere revisar y guardar de nuevo antes de considerar pagada la factura.
- Pendiente de registrar no significa que la deuda siga impaga: para documentos antiguos hace falta revisar los registros iniciales.

## Guardado compartido preparado, pendiente de habilitar

La migración `supabase/migrations/20261030145410_supplier_invoice_payments.sql` crea dos tablas pequeñas: estado actual e historial de cambios. Se guarda únicamente identidad de la factura, monto/moneda de referencia, forma, cheque, fechas, responsable y revisión; no se duplican XML, PDFs, catálogo o facturas completas.

El acceso sigue la empresa compartida de Facto: autenticación en cada petición, empresa y responsable obtenidos en servidor; tablas con RLS y sin acceso directo de anon/authenticated. El servidor verifica la factura en Bsale al guardar. Las correcciones usan revisión para detectar actualizaciones concurrentes y el historial se inserta atómicamente con el cambio.

**Estado verificado el 30/10/2026 mediante lecturas GET reales:** supplier_invoice_payments y supplier_invoice_payment_events devuelven HTTP 404 / PGRST205. No están disponibles para la aplicación. El módulo continúa en modo local. Hace falta ejecutar o verificar la migración de pagos en el proyecto Supabase correcto y su exposición en la API; se requiere acceso administrativo. Esta revisión no ejecutó migraciones ni registró pagos reales como prueba. Una consulta HEAD no basta para verificar disponibilidad: comprobar una lectura real con columnas y revisar status/error.

Si faltan las tablas, la página muestra **Registro de prueba en esta pestaña** y guarda las nuevas marcas pagadas en `sessionStorage`, por usuario y factura, clave `facto-supplier-paid-v3:<usuario>`. No se comparte entre equipos. Si falla guardar, no se marca pagada. No se convierten automáticamente las anotaciones de forma de pago anteriores en pagos; se recuperan como borrador y requieren guardado explícito. Los registros locales nuevos tampoco se importan automáticamente a Supabase cuando se habilite.

Si la tabla existe pero falla la consulta, se informa error y no se sustituye silenciosamente el estado compartido por un registro local. Refrescar vuelve a leer estados. El rango de facturas continúa siendo de meses contables Bsale, inicialmente actual y anterior.

## Verificación

```text
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js app/suppliers/core.ts app/suppliers/server.ts app/suppliers/payments-server.ts app/suppliers/page.tsx app/api/suppliers/route.ts
node app/suppliers/verify.cjs
node app/suppliers/verify-paid.cjs
```

`verify-paid.cjs` acepta como argumento adicional la ruta de un paquete PGlite instalado para ejecutar la migración en una base efímera y comprobar ACL/RLS, cheques con ceros, historial, identidad/fecha inmutables, unicidad y conflictos de revisión. Las pruebas realizadas usaron datos ficticios locales; no marcaron facturas reales como pagadas.

## Cruce con recepciones

Al abrir el detalle de una factura se consultan recepciones del mismo folio en Bsale y el espejo Intel. Se muestran fecha de recepción de mercadería (distinta de recepción SII), sucursal, productos/variantes, SKU, cantidades, costo unitario y neto por línea. Los nombres y SKU se recuperan del catálogo Intel y los detalles se consultan actuales en Bsale; si solo hay copia Intel se indica su fecha y la falta de verificación actual.

El folio y tipo factura generan una coincidencia candidata; no confirman proveedor. Un vínculo declarado explícitamente en la nota estructurada FACTO_INVOICE identifica la factura; declaraciones contradictorias se muestran como otra factura/proveedor. No se usan nombres aproximados, igualdad de importe ni proximidad de fechas como prueba de identidad. Las guías con el mismo folio no se mezclan automáticamente.

La comparación usa neto factura (campos Bsale y XML cuando verificable) frente a suma cantidad × costo de la recepción. No compara total con IVA contra costo neto. En factura exenta no suma dos veces neto/exento. Faltantes de costo, detalles truncados/duplicados, otra moneda o identidad contradictoria impiden comparar. Varias candidatas no se suman automáticamente; se comparan por separado. Una diferencia puede requerir revisar costos, descuentos o recepciones parciales, no demuestra por sí sola un error.

Sin coincidencia se informa que no se encontró recepción directa por folio, sin asegurar que no exista un ingreso por guía u otro documento. Si falló la búsqueda no se informa ausencia. Se consultan hasta 20 candidatas y 500 líneas por recepción, indicando datos parciales al superar el límite.

No se escribe ni duplica información de stock. Pruebas: node app/suppliers/verify-receptions.cjs. Prueba real de solo lectura: factura Bsale 6219, recepción 17624, fecha 22/10/2026 y netos coincidentes de $83.928; el proveedor sigue sin confirmación en la recepción, por lo que permanece candidata.