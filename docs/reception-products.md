# Altas masivas desde recepción

Entrada: `/reception` → **Crear productos desde un documento**, o `/reception/products`.

## Lectura reanudable

1. Subir PDF o imágenes (hasta diez archivos, 4 MB en total, treinta páginas y dos mil variantes), o iniciar un ingreso manual.
2. El original queda privado en Supabase Storage y la API devuelve una tarea. Vercel Workflow ejecuta los siguientes pasos independientemente de la pestaña.
3. Cada página se extrae por separado. Se aprovecha texto nativo cuando se puede comprobar que no hay contenido en imágenes; páginas escaneadas/mixtas conservan lectura visual. En Node 20, que no permite inspeccionar de forma fiable esos operadores del PDF, se usa lectura visual por seguridad. Recomendado Node 22 o superior.
4. Cada llamada a Gemini tiene un límite de 35 segundos, razonamiento bajo y sin reintentos internos. Los errores temporales se reintentan solo en esa parte, como máximo tres intentos, con esperas de 10 y 30 segundos. El segundo intento usa el modelo alternativo.
5. La agrupación se hace después, en bloques de cuarenta nombres y SKU. Esa etapa no recibe ni puede modificar cantidades, costos o precios. Se verifica una correspondencia exacta por índice antes de aceptar el bloque.
6. Solo cuando todas las páginas y agrupaciones están completas se crea el borrador de revisión. Una página incompleta, un folio inconsistente o una agrupación parcial bloquean el resultado; nunca se presenta un documento parcial como terminado.

La pantalla muestra páginas leídas, filas y agrupación, y permite abrir lecturas guardadas. Si se agotan los intentos, **Reanudar lectura pendiente** conserva lo ya extraído. Si se pierde el estado del ejecutor local, se puede reiniciar desde los puntos guardados en Supabase. Cerrar el navegador no detiene el trabajo; apagar el servidor local sí impide que siga ejecutando pasos mientras esté apagado.

El mismo archivo, en el mismo orden y para la misma persona, reutiliza su lectura por hash y versión de procesamiento. No crea otro borrador ni vuelve a consultar Gemini. Incrementar `PIPELINE` al hacer cambios incompatibles en extracción/agrupación. La finalización usa un ID determinista y no sobrescribe un borrador que ya exista. Tras finalizar se conservan contadores y original, y se compactan las filas intermedias para no mantener otra copia de los importes.

## Revisión y envío

1. Revisar producto padre y variantes. SKU conservados como texto; valores ausentes quedan vacíos. Completar cantidad, costo **neto**, venta **con IVA** y tipo de producto. Se pueden mover variantes entre grupos y vincular un padre existente.
2. Seleccionar sucursal, folio, tipo de documento y lista activa CLP. Validar SKU en Bsale.
3. **Crear productos y guardar precios** requiere confirmación. SKU existentes conservan productos y precios. Las variantes nuevas guardan precio solo en la lista elegida, dividiendo el valor con IVA por 1,19. Todavía no cambia stock.
4. **Confirmar recepción en Bsale** requiere otra confirmación y registra cantidades y costos netos. No crea un documento tributario de venta.

Las ediciones humanas requieren **Guardar revisión** antes de cerrar. Las fases de creación y recepción ya conservan su avance, pero continúan desde la pantalla; solo la lectura de IA usa el ejecutor en segundo plano. Una escritura de Bsale incierta conserva su intención y bloquea su repetición hasta verificar el resultado. No iniciar otra importación para repetir una recepción.

## Infraestructura y privacidad

- Migraciones: `20261103184928_reception_product_imports.sql` y `20261103192552_catalog_reading_jobs.sql`, aplicadas al proyecto de Facto.
- Tablas con RLS y sin acceso directo de `anon`/`authenticated`. Las rutas comprueban sesión, empresa y creador. El bucket `catalog-reading` es privado; el servidor usa el cliente administrador.
- Workflows recibe únicamente IDs y versión de ejecución. Resultados, importes y originales permanecen en Supabase. No se guardan documentos en argumentos o resultados del motor de Workflow.
- `withWorkflow` configura los ejecutores y sus rutas internas. `proxy.ts` excluye únicamente `/.well-known/workflow/` según la integración oficial; la API de usuarios sigue autenticada.
- `after()` se usa solo para encolar después de responder; no realiza la extracción larga. Los pasos durables ejecutan las llamadas y las esperas.
- Sin claves nuevas. En producción, Vercel provee su integración con Workflow; en desarrollo el estado del ejecutor reside en `.next/workflow-data`.
- Dependencias fijadas: Workflow 5.3.0 y unpdf 1.4.0. Zod 4.6.7 también para copias internas de la rama 4, evitando el fallo de memoria de versiones anteriores al validar colecciones grandes.

## Verificación

- `node scripts/verify-catalog-reading.mjs`: extracción nativa de un PDF real ficticio, puntos de avance, fallo temporal en segunda página, reintento selectivo, bloqueo de respuestas incompletas, conservación de importes, finalización única, compactación e aislamiento.
- `node scripts/verify-reception-products.mjs`: operaciones de Bsale simuladas, conservación de precios existentes, variantes inactivas, escrituras inciertas y prevención de recepción duplicada.
- `node scripts/verify-invoice-processing.mjs`: regresión de recepción normal y antiguo modo catálogo.
- TypeScript y ESLint de los archivos afectados.
- Prueba de navegador con el PDF ficticio y Gemini real: dos páginas y dos variantes; no se confirmaron altas ni stock en Bsale. La pestaña se cerró después de la primera página para comprobar continuidad.

La factura real que fallaba no fue facilitada. Validar inicialmente con ella y revisar todos sus datos antes de confirmar productos o stock. La recepción normal mantiene su flujo de lectura anterior; este cambio aplica a **Crear productos desde un documento**.

## Documentos grandes

El límite global es 2.000 variantes, compartido por lectura, agrupación y guardado. La extracción conserva un máximo de 200 filas por página y la agrupación sigue en bloques de 40; el contexto de padres se limita a 80 nombres relevantes. La revisión muestra 50 variantes por página sin recortar el documento enviado ni las validaciones. La creación continúa una operación por paso, con una única confirmación final de recepción. Las lecturas detenidas por el antiguo tope de 200 pueden reanudarse sin borrar las páginas ya leídas: la versión de extracción se conserva.
