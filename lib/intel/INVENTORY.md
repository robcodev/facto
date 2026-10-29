# Costos y stock — Intel

Ruta: `/intel/inventory`. Aplicar `20261020141204_intel_inventory_history.sql`
después de las dos migraciones base de Intel. No modifica Bsale ni importa listas de precios.

## Operación

- **Importar movimientos históricos y stock**: captura stock y luego recorre todas las
  recepciones y consumos disponibles, incluyendo cada página de detalles.
- **Capturar solo stock actual**: nueva observación independiente. No reemplaza
  capturas anteriores aunque ocurra el mismo día.
- Mantener abierta la página. Pausar deja el checkpoint recuperable. Cerrar una
  ejecución conserva datos parciales; no la convierte en una captura completa.
- El usuario eligió capturas **solo manuales**. No se creó cron ni automatización.
- La captura es paginada, no una fotografía simultánea de toda la empresa.
  `observedAt` corresponde a la consulta de cada lote.

## Datos y evidencia

Se reutiliza `intel_records` con recursos `inventory_*`. La migración
`20261026151115_intel_current_records_only.sql` deja de duplicar cada registro
en `intel_record_versions`, sin borrar capturas ni movimientos históricos.
Los runs tienen `kind=inventory`, independientes de catálogo y ventas, y sus lotes
se confirman atómicamente con el cursor. Los datos y RPC siguen siendo privados,
accesibles desde endpoints autenticados y acotados a la organización.

Stock: físico, reservado y disponible por variante/sucursal; IDs incluyen run.
Recepciones/consumos: encabezado original, fecha original, sucursal, `updateStock`,
ID de movimiento, ID de detalle, variante, cantidad, costo y `variantStock`.
Los importes ausentes permanecen null; cero no se reemplaza por otro costo.
Conservar `variantStock` no implica interpretar su semántica como saldo posterior.

El encabezado se marca completo solo cuando los IDs únicos de los detalles
coinciden con el total de Bsale. Al terminar una fuente se compara su total con
los encabezados/observaciones de esta ejecución. Eso no concilia movimientos
financieros ni garantiza un snapshot transaccional de Bsale.

## Diagnóstico

Por ID de variante y sucursal se pueden contrastar la captura y el stock actual.
Una diferencia puede deberse a movimientos posteriores. Se muestran cobertura,
costos faltantes/cero y advertencias. No se publica un stock histórico reconstruido:
faltan validar cobertura de ventas/devoluciones/ajustes/traslados/reservas y
semántica de saldos; tampoco se asigna el costo de recepción a ventas históricas.
No se calculan márgenes históricos con costos actuales.

## Pruebas y operación local

`node lib/intel/verify-inventory.mjs <ruta a PGlite>` verifica migraciones, paginación
de 51 líneas, interrupción/reanudación, fuente vacía, conteos, observaciones,
replay y aislamiento.

`node lib/intel/inventory-runner.mjs snapshot|history [maxSteps]` usa el mismo
importador de la UI con la clave privada del servidor local. Solo para operación
de confianza, nunca incluir la clave en el navegador. Máximo 500 pasos por llamada.
No inicia otra ejecución si existe una activa de otro modo.
