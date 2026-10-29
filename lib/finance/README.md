# Finanzas: Caja y gastos

La colección del menú con signo peso agrupa `/suppliers` y `/cash`. Proveedores
conserva su prueba local existente. Caja utiliza almacenamiento compartido en
Supabase; no utiliza sessionStorage ni introduce datos ficticios.

Activado el 28/10/2026 en el proyecto Supabase de Facto. Se verificaron la
consulta real, RLS y privilegios de ambas tablas y funciones; no se agregaron
movimientos ficticios a la base compartida. La pantalla local se comprobó con
sesión iniciada, en escritorio y a 390 px, sin desbordamiento horizontal.
Los cambios de código no se han enviado a GitHub ni desplegado en Vercel.

## Alcance

Registro manual de salidas de efectivo: compra/rendición, depósito bancario,
traslado, pago a proveedor y otro retiro. Solo las salidas para compras admiten
gastos por categoría y devoluciones de vuelto. No hay integración confirmada de
movimientos POS de Bsale, conciliación bancaria ni cálculo de saldo total de caja.
Tampoco modifica stock o pagos de Proveedores. Un pago a proveedor se identifica
como salida, sin sumarlo a los gastos de compras diarias.

El pendiente de cada salida es `retirado - gastos activos - vuelto activo`.
Una rendición completa no implica gastar todo: $20.000 entregados, $18.000 en
compras y $2.000 de vuelto dejan cero pendiente y $18.000 de gasto. Los totales de
retiros usan la fecha de salida; gastos y vueltos usan sus propias fechas.
El pendiente global incluye todas las fechas y la interfaz lo indica. Los
filtros de tabla no alteran los indicadores generales del período.

Categorías iniciales: Aseo, Embalaje, Transporte, Oficina, Mantención y Otros.
Cada gasto admite comercio, descripción y referencia/folio de comprobante.
No hay carga de archivos ni desglose de unidades por artículo en esta etapa.

## Persistencia y autorización

Migración: `supabase/migrations/20261028191516_finance_cash_ledger.sql`.
Dos tablas con empresa, usuario creador, fecha y metadatos de anulación. RLS
activo, sin acceso directo desde anon/authenticated. Solo el servidor autenticado
consulta los RPC SECURITY INVOKER con privilegios de servicio. La empresa y el
usuario se resuelven en servidor: política compartida actual de Facto solicitada
por su propietario, disponible a los usuarios autenticados. No agrega roles.

Los importes son pesos CLP enteros positivos, máximo $10.000.000.000 por registro.
Cada mutación utiliza un ID estable y huella del contenido; repetir un envío no
duplica el movimiento. El formulario conserva el envío al perder confirmación.
Las rendiciones y anulaciones bloquean su retiro padre dentro de una transacción
corta para impedir que dos usuarios rindan más dinero del entregado.

No se borran movimientos: se anulan con motivo y se conserva autor/fecha. Para
anular una salida primero deben anularse sus rendiciones vigentes. La corrección
de un monto se registra mediante anulación y nuevo movimiento.

## Verificación

`node lib/finance/verify-cash.mjs <ruta-absoluta-a-pglite/dist/index.js>` ejecuta
el esquema SQL en PostgreSQL aislado: reintentos, saldos, categorías, fechas,
anulaciones, paginación y denegación a roles de navegador. No escribe datos reales.

Revisar además TypeScript, ESLint de los archivos modificados y la interfaz en
escritorio y teléfono. Las consultas están paginadas; los indicadores se agregan
en base de datos. No se copian documentos de Intel ni se agregan respaldos raw.
