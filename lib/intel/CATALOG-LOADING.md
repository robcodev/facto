# Intel: carga del catálogo

Implementación local del 20/10/2026. No publicada desde este trabajo.

## Comportamiento

- `/api/intel` devuelve 50 productos por página, los registros ligeros relacionados y los totales globales. Acepta `search`, `category`, `active`, `stock`, `included` y `page`.
- `/api/intel?product=ID` consulta variantes completas, fichas web, descripciones, imágenes y precios heredados de la captura completa correspondiente. No devuelve `raw`.
- Se mantienen autenticación por sesión, empresa y credencial privada en el servidor. La exportación y el respaldo completo no cambian.
- El botón de sincronización permanece encima de las pestañas, con pausa, reanudación y progreso.
- Se conservan hasta 20 respuestas durante 30 segundos en la pantalla. El índice del servidor dura hasta 30 segundos, tiene un máximo de ocho empresas y elimina entradas fallidas. No guarda sesiones ni clientes de base de datos.
- Sincronizar invalida el índice en el proceso actual; la actualización final de la pantalla solicita una lectura nueva. Otros procesos pueden conservar su índice hasta 30 segundos.
- Las solicitudes de búsqueda anteriores se cancelan; escribir tiene una espera de 250 ms para evitar consultas por cada tecla.

## Medición real

Lecturas sobre Supabase desde el computador local; no incluyen sesión HTTP, renderizado del navegador ni latencia de producción. Las cifras dependen de red, tamaño del catálogo y vigencia de la memoria.

| Consulta | Tiempo | Datos serializados |
| --- | ---: | ---: |
| Lectura completa anterior (`allRecords`) | 31.206 ms | 36.307.859 bytes |
| Primera página, índice sin memoria previa | 7.378 ms | 62.634 bytes |
| Segunda página, índice reutilizado | 427 ms | 46.020 bytes |
| Un detalle de producto con ficha web | 557 ms | 6.954 bytes |

Los 36 MB corresponden a la lectura anterior desde Supabase antes de eliminar `raw`; los 63 KB corresponden a la nueva respuesta del listado. Son etapas distintas de transferencia.

## Verificación

`node lib/intel/verify-catalog-loading.mjs` realiza solamente SELECT. Compara resultados con el catálogo completo anterior y comprueba límites de página, totales, SKU, categoría, activos, inclusión, stock, ausencia de resultados, ajuste de página fuera de rango y recuperación íntegra de una ficha web. Imprime solamente tiempos, tamaños y conteos. Requiere las credenciales privadas ya configuradas.

Conteos observados: 4.987 productos, 9.866 variantes, 1.218 fichas web y 45 categorías. Pasaron las comprobaciones de tipos, ESLint de los archivos modificados y las pruebas existentes de sincronización del catálogo. No se ejecutó una sincronización real ni se modificaron datos para medir.

## Límite actual y siguiente optimización

La paginación y los filtros se resuelven en el servidor de la aplicación sobre un índice pequeño. La primera consulta aún lee los campos de búsqueda de todos los productos y variantes, en páginas ordenadas y con los recursos consultados en paralelo. No es todavía paginación directamente en Postgres con agregaciones y filtros cruzados allí. Por ello la primera lectura sigue siendo más lenta que las siguientes.

Para trasladar esas combinaciones a la base se deben revisar el esquema real, los índices y planes de consulta, preparar una migración y medir otra vez. No se crearon ni aplicaron migraciones, ni se cambiaron permisos. El stock mantiene exactamente la selección anterior de capturas completas; este cambio no incorpora las observaciones `inventory_*` a esa tabla ni reconstruye stock histórico.

No se validó visualmente la pantalla en un navegador autenticado durante este trabajo. No se hizo commit, push ni despliegue.
