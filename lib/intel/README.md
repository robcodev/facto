# Intel · catálogo y ventas históricas

Ruta: `/intel`. Bsale es la fuente; Supabase conserva una copia reutilizable. No se realizan escrituras en Bsale.

## Activación

Aplicar `supabase/migrations/20261015175055_create_intel_catalog.sql` al proyecto existente. Mantener las variables BSALE_TOKEN, NEXT_PUBLIC_SUPABASE_URL y FACTO_BACKEND (o SUPABASE_SECRET_KEY) en el servidor. INTEL_STORE_URL es opcional; el valor por defecto es https://www.dmultisport.cl/ y sirve para resolver enlaces relativos de Bsale.

Política temporal autorizada por el propietario: cualquier usuario con sesión válida puede consultar, exportar, sincronizar y configurar Intel en `facto-compartido`, sin requisito de rol o membresía. Cada operación verifica la sesión con getUser; no hay acceso anónimo ni cambios en los permisos de las tablas. Esto incluye acceso a los datos de clientes guardados en los documentos. Antes de admitir otras empresas se debe reemplazar esta política por autorización de membresía, selección de empresa y credenciales propias.

En Fuentes, cargar opciones de Bsale, seleccionar sucursal y lista, y sincronizar. El navegador solicita páginas pequeñas y guarda el avance en Supabase. Cerrar la página detiene solicitudes nuevas; Reanudar continúa el checkpoint. No hay tarea programada todavía. La captura diaria ocurre cuando se sincroniza y usa America/Santiago.

## Conservación y portabilidad

- `intel_records`: ID interno estable + empresa, proveedor, recurso e ID original. Campos normalizados `data` y respuesta íntegra `raw`. No usar SKU como identidad: puede cambiar.
- `intel_record_versions`: historial legado, sin nuevas escrituras desde `20261026151115_intel_current_records_only.sql`. La migración no elimina versiones existentes. Conservar una sola versión actual por identidad no elimina ventas históricas, movimientos ni capturas de stock con identidades distintas. Ver `STORAGE.md`.
- `intel_stock_daily`: última captura observada de cada día/sucursal/variante. Un dato ausente no se convierte a cero.
- `intel_category_settings`: preferencias editoriales separadas de datos importados; las sincronizaciones no las sobrescriben.
- `intel_sync_runs`: estado, configuración, checkpoint, errores y fechas. La página y checkpoint se guardan en una transacción. El índice de ejecución activa y el bloqueo de fila hacen seguros los reintentos concurrentes.
- `/api/intel/export`: JSON versionado con catálogo actual completo, payloads originales, categorías y metadatos. No exporta todo el historial ni archivos binarios.

Se guardan productos activos e inactivos, variantes, tipos, marcas, sucursales, listas, fichas web, colecciones, stock de la sucursal y precios de la lista seleccionadas. Los filtros editoriales no descartan registros al importar. La exportación conserva entidades desaparecidas de la fuente con su fecha de última observación; no se asume que hayan sido eliminadas.

Las imágenes se guardan como URL, ID y leyenda. Para un respaldo independiente de la plataforma falta copiar los archivos a almacenamiento propio, comprobar hashes y accesibilidad. También faltan impuestos expandidos, atributos detallados y cualquier recurso al que raw solo haga referencia mediante href. No describir esta etapa como un respaldo completo de Bsale.

## Ventas históricas · etapa 2

Desde el 26/10/2026 las ventas admiten lotes expandidos y continuación independiente
de la pestaña mediante `FactoIntelSalesWorker`, instalado en Windows en el equipo
de desarrollo. Requiere el equipo encendido y la sesión iniciada. Ver
`SALES-WORKER.md` para reintentos, pausa/reanudación, instalación y migración.
No cambia el funcionamiento manual del catálogo o las capturas de inventario.

Aplicar después la migración `20261015182904_intel_sales_history.sql`. Ruta `/intel/sales`, enlazada desde Intel. Reutiliza `intel_records` e `intel_sync_runs`: no crea un respaldo paralelo. El historial de versiones completas es legado, desactivado por la migración de almacenamiento de octubre de 2026. El catálogo y su exportación excluyen los recursos `sales_*` para no cargar decenas de miles de documentos ni datos personales en la pantalla de productos.

La selección inicial propone dos años hasta ayer (días cerrados). Importa todos los tipos, vendedores y sucursales sin filtrar productos por estado, categoría o web. Primero conserva usuarios, sucursales y tipos de documento. Luego procesa ventanas mensuales con documentos paginados y relaciones paginadas. Las expansiones se aprovechan solo cuando su count confirma que están completas. No hay límite artificial de líneas por documento. Cada petición guarda registros y cursor en una transacción; los reintentos concurrentes o tardíos no avanzan dos veces. La migración de almacenamiento desactiva las copias completas de cada registro.

Recursos: `sales_documents`, `sales_details`, `sales_sellers`, `sales_references`, `sales_payments`, `sales_document_taxes`, `sales_attributes`, `sales_users`, `sales_offices`, `sales_document_types`, `sales_windows`. Cada registro conserva la respuesta original. El documento expande cliente, emisor, sucursal, tipo, moneda y lista de precios. Se distingue emisor de vendedores (pueden ser varios); salesId se conserva sin inventar un canal. Las líneas conservan producto, variante, SKU, cantidades, descuentos, importes y relatedDetailId. No se exige que el producto aún exista en el catálogo. Las referencias y notas de crédito se conservan, pero aún NO se calcula facturación neta ni se resuelve la duplicación comercial preventa/boleta/Full.

`data.complete` solo se activa cuando se han leído todas las relaciones. Para consultar las relaciones vigentes de un documento usar también su `run_id`, porque las relaciones desaparecidas no se borran del respaldo. Una carga interrumpida puede dejar el documento actual parcial; no usarlo para indicadores. La cancelación conserva registros y avance; una nueva ejecución permite revisar de nuevo el periodo sin duplicar identidades. Si cambia el conteo de Bsale durante la ventana, cerrar la ejecución e importar otra vez ese intervalo.

`sales_windows` registra cobertura y compara conteos de documentos distintos completados contra Bsale. Esto NO es conciliación monetaria: todavía falta contrastar totales/unidades por tipo, restar notas de crédito y definir ventas efectivas. La pantalla muestra importes originales, no un total mezclado. EmissionDate es una fecha calendario según Bsale: se guarda su día sin desplazarlo a Chile; generationDate y otras fechas originales se conservan para análisis horario posterior.

Actualizaciones: volver a importar el rango reciente o un mes anterior desde el mismo formulario. No hay cron ni conciliación mensual automática todavía. No se inicia una importación real al desplegar. Las ventas se consultan de 50 en 50 y las relaciones de 100 en 100. El acceso usa la empresa autenticada igual que el catálogo; los datos de cliente y los enlaces privados de documentos no se exponen anónimamente. La lista de vendedores/sucursales del filtro tiene un máximo de 1000 opciones (no limita la importación).

Límites del respaldo: no descarga PDF/XML ni imágenes binarias; conserva URLs y datos. No consulta todavía costos históricos, movimientos de stock, recursos de devolución separados ni pedidos web para atribuir canal. Los clientes expandidos reflejan lo que Bsale devuelve hoy, no una reconstrucción garantizada de sus datos antiguos. No usa costo actual para estimar márgenes pasados. La exportación de catálogo no incluye ventas; el detalle permite inspeccionar sus registros originales. El modelo permite exportarlos y reutilizarlos posteriormente sin reimportar la fuente.

## Pruebas

`node lib/intel/verify.mjs <ruta a @electric-sql/pglite/dist/index.js>` prueba la migración en PostgreSQL embebido aislado. No necesita credenciales ni modifica producción. La dependencia de pruebas se instala en una carpeta temporal, no en la aplicación.

Validar en producción después de aplicar: carga inicial; finalizar captura; recargar sin consultar Bsale; excluir categoría y volver a sincronizar; comprobar precio/stock de varias variantes; exportar JSON; verificar acceso con usuarios permitidos y sin sesión. Antes de autorizar otra empresa, habilitar su contexto y permisos expresamente.
