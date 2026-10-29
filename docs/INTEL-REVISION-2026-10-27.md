# Revisión del respaldo de ventas — 27/10/2026

Revisión de solo lectura sobre Supabase y la API de Bsale. No se reanudaron
importaciones, no se modificaron documentos ni se eliminaron registros.
Periodo auditado: 15/10/2024–14/10/2026. La ejecución no cambió durante la revisión.

## Resultado de la carga

- 25 intervalos completos, incluido el primer y último mes parciales.
- 41.311 documentos de origen recorridos de nuevo, con IDs únicos y conteos
  estables en cada paginación.
- Cero documentos faltantes, sobrantes o incompletos entre los no preventa.
- Cero diferencias documento por documento en neto, IVA, exento, total,
  fecha, tipo, cliente, sucursal y estado.
- 28.038 encabezados guardados: 23.838 no preventa y 4.200 preventas heredadas.
  Hay además 13.273 marcadores mínimos de preventas excluidas. Los 17.473
  casos de preventa están contabilizados, sin confundirlos con ventas.
- 76.131 líneas vigentes no preventa. Cero líneas huérfanas, filas de otra
  ejecución para esos documentos, cantidades/netos/descuentos ausentes o
  referencias de variante ausentes en la línea.
- 272 líneas de 10 documentos representativos (uno por tipo, priorizando
  el de más líneas) comparadas directamente con la fuente: cero diferencias.
- Cero nuevas copias en `intel_record_versions`.
- El proceso independiente sigue disponible y quedó en espera tras terminar.

Esto certifica las comprobaciones de copia indicadas, no una conciliación de
ventas netas o margen. No se contrastaron individualmente contra la API todas
las líneas de los dos años; sí todos los encabezados y sumas de líneas guardadas.

## Diferencias de importes investigadas

46 documentos muestran diferencias de $1 a $5 entre la suma de líneas y el
encabezado. Se verificaron los 46 nuevamente en Bsale, incluidos todos sus
detalles: las líneas coinciden y las mismas diferencias existen en la fuente.
No se detectó un error de copia. Conservar los valores originales y definir
una política explícita de redondeo al construir indicadores.

El resumen oficial presenta diferencias pequeñas en neto/IVA en mayo de 2025
(tickets, facturas y boletas) y enero de 2026 (boletas). Los importes finales y
conteos coinciden; los resúmenes llevan decimales mientras los encabezados
individuales llevan importes redondeados. La comparación estricta de esos
resúmenes sigue marcada como diferente, sin ocultar el hallazgo ni cambiar cifras.

## Pendientes para análisis

1. 5.658 IDs de variantes históricas no están en el catálogo actual guardado;
   afectan 8.149 líneas. Hay además una variante sin su producto padre.
   Las cinco variantes probadas por ID respondieron 200: se puede preparar
   recuperación puntual, sin afirmar que las 5.658 estén disponibles todavía.
2. 10 clientes referenciados en 131 documentos no están en el espejo de clientes.
   Los cinco probados respondieron 200. Otros 5.215 documentos no tienen cliente
   identificado en origen; no inventar ni agruparlos como una sola persona.
3. Los 23.838 documentos no preventa no tienen canal explícito normalizado.
   Todos tienen vendedor. Canal y vendedor no son equivalentes.
4. La importación histórica de inventario tiene una ejecución abierta y otra
   cancelada por cambio del total de origen. La carga de ventas sí está terminada;
   no certificar cobertura histórica completa de stock/costos con estos datos.
5. Las 4.200 preventas heredadas siguen guardadas y deben quedar fuera de
   indicadores. No se borraron como parte de esta revisión.
6. Fuera del rango auditado: del 15 al 26/10/2026 hay 713 documentos en Bsale,
   incluidos 266 de tipo preventa; quedan 447 de otros tipos por revisar/importar.
   No se inició esa actualización automáticamente.

Antes del tablero: recuperar enlaces históricos, actualizar días recientes y
definir tipos/signos, anulaciones y ajustes. TICKET DE VENTA es una venta final
independiente según confirmación del propietario. No sumar cotizaciones,
guías o preventas como ingresos ni restar dos veces una misma reversa.

## Evidencia y repetición

Reporte agregado completo (sin datos personales):
`private/intel-full-audit-20261027.json`, excluido de Git.

- `node lib/intel/audit-complete.mjs`: copia completa de encabezados/periodos,
  integridad local de líneas, referencias y muestra directa.
- `node lib/intel/audit-rounding.mjs`: seguimiento directo de todos los
  documentos con diferencias de líneas/encabezado hallados en ese reporte.
- `node lib/intel/verify-audit.mjs`: verificaciones de los comparadores usados.

La auditoría recorrió el rango en aproximadamente cinco minutos, además de
las lecturas iniciales de datos y el seguimiento de diferencias. No cambió
esquemas, permisos, el plan de Supabase ni precios. No se hizo commit/push.
