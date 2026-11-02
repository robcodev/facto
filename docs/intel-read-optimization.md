# Optimización de lecturas de Intel — 31/10/2026

Cambios de aplicación, sin migraciones SQL, eliminación de filas, modificación de índices ni cambios en Bsale. Las respuestas originales y el historial se conservan.

## Cambios

- El detalle de un documento filtra `resource LIKE 'sales_%'`, además de empresa, documento y ejecución vigente. Esto permite aprovechar `intel_sales_parent`. La respuesta mantiene su conteo exacto y paginación.
- Marketing solicita únicamente los campos JSON utilizados en cada recurso. Los detalles y el stock se leen en grupos de 100 referencias, conservando paginación y comprobación de la ejecución del padre.
- Los límites de recepciones y ventanas de cobertura se detectan solicitando una fila adicional (101), sin calcular el total completo. Se conservan la advertencia de 100 recepciones y el bloqueo de cobertura si las ventanas superan el límite.
- Los vínculos entre líneas y cabeceras se resuelven mediante mapas en memoria.
- Rotación calcula una sola vez la cobertura de cada intervalo y reutiliza la comprobación por fecha de última venta. Su caché por empresa empieza a contar los cinco minutos al terminar la carga y comparte las solicitudes que siguen pendientes.

## Mediciones

Comparación contra `504d3b5`, del mismo repositorio, en lecturas secuenciales de Supabase para 01/10/2026–14/10/2026. Sin caché de aplicación ni escrituras. Tiempos orientativos; no son garantías de latencia.

| Lectura | Antes | Después | Solicitudes antes/después | Bytes antes/después |
| --- | ---: | ---: | ---: | ---: |
| Oportunidades de Marketing | 25.827 ms | 8.014 ms | 72 / 37 | 2.734.669 / 1.600.022 |
| Comparación con datos comerciales | 17.819 ms | 7.836 ms | 58 / 29 | 2.296.644 / 1.376.568 |

Los resultados comparados coinciden, ignorando la fecha de consulta, el orden de arrays y la selección/orden de los identificadores representativos de evidencia. Se conservan las cantidades, disponibilidad, cobertura, documentos e importes. Las dos implementaciones terminaron sin errores.

Una consulta del detalle con el filtro nuevo devolvió cinco hijos y conteo cinco en 268 ms. El diagnóstico anterior había comprobado 14,18 segundos de ejecución SQL con un recorrido completo frente a 7,56 ms usando el índice; esos tiempos SQL no deben confundirse con el tiempo completo HTTP.

Prueba aislada de cálculo con 18.503 variantes y cobertura completa: 20.528 ms frente a 71 ms, con resultados equivalentes. No mide la descarga inicial de datos de Rotación.

## Verificación reproducible

```text
node lib/intel/verify-sales-detail.mjs
node lib/marketing/verify.mjs
node lib/marketing/verify-core.mjs
node lib/intelligence/verify-history.cjs
node lib/rotation/verify.cjs
node lib/rotation/verify-receptions.cjs
node scripts/benchmark-intel-reads.mjs --baseline=504d3b5
node scripts/benchmark-intel-reads.mjs --live --baseline=504d3b5
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

El benchmark vivo requiere las variables de backend ya configuradas. Bloquea métodos distintos de GET/HEAD, limita los destinos a las dos tablas consultadas y solo informa métricas agregadas. No imprime filas ni credenciales.

## Límites pendientes

La primera carga de Rotación aún lee el historial de Intel. Estos cambios aceleran el cálculo y la reutilización dentro de una instancia; no introducen una caché compartida entre servidores ni resúmenes SQL persistentes. Esa sustitución requiere diseñar invalidación, conciliación e importaciones concurrentes.

El tamaño almacenado en Supabase no se reduce con estos cambios. La consolidación de `data`/`raw` y de campos repetidos permanece pendiente de una auditoría completa de recuperabilidad y consumidores; no se eliminaron datos basándose en una muestra.
