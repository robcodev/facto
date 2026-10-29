# Intel: una versión actual por registro

## Cambio de almacenamiento — 26/10/2026

Aplicar `supabase/migrations/20261026151115_intel_current_records_only.sql`.
Reemplaza únicamente `intel_commit_page` y mantiene su firma y permisos.
No modifica datos existentes ni borra `intel_record_versions`.

- `intel_records` conserva la respuesta original `raw` y los campos `data` de
  cada identidad `(organization_id, source, resource, external_id)`.
- Las ventas de fechas distintas, sus líneas, los movimientos con costos y las
  capturas de stock con ID por ejecución siguen siendo registros independientes.
- `intel_sync_runs` conserva cursor, etapa, página, errores y avance. Los wrappers
  de ventas e inventario siguen confirmando datos y cursor atómicamente.
- `intel_stock_daily` sigue actualizándose igual. No se introducen capturas
  automáticas, retención temporal ni un respaldo paralelo.
- Las actualizaciones ya no crean copias completas en `intel_record_versions`.
  Cambios posteriores de un registro reemplazan su versión actual; no se podrá
  recuperar su valor previo desde esa tabla. Esto no sustituye backups ante fallos.
- Se mantiene el comportamiento previo de importaciones parciales: no usar
  documentos con `complete=false` en indicadores. El ajuste no implementa una
  publicación atómica de todos los detalles de un documento.

## Auditoría antes de cualquier limpieza

`supabase/maintenance/intel_storage_audit.sql` contiene consultas de solo lectura que
comparan JSON reales, no solamente hashes. No publica valores de clientes.
Separar copias exactas, estados intermedios e información realmente diferente.
Revisar también vistas, funciones, triggers y referencias externas a la tabla.
No borrar versiones con información exclusiva sin una decisión explícita.

Auditoría en producción de 26/10/2026 (antes de la limpieza autorizada):
178.145 registros principales; 189.793 versiones; 178.145 copias JSON exactas;
11.648 estados intermedios de documentos (`complete=false`, `sellers=[]`), con
la misma respuesta `raw` y los demás campos idénticos al documento completo.
No hubo respuestas originales diferentes, versiones huérfanas, vistas,
claves foráneas entrantes ni triggers personalizados sobre la tabla de versiones.
La única función que la referenciaba era el escritor reemplazado.

Aplicado en el proyecto Supabase de Facto el 26/10/2026 mediante SQL Editor:
primero se verificó el escritor sin referencias al historial, permisos sin cambios
y rechazo de un checkpoint inexistente. Después de la confirmación explícita del
usuario se eliminaron 189.793 copias con la transacción protegida (y una guarda
adicional de conteo aprobado = 189.793). Resultado tras COMMIT: 178.145 registros
principales, cero versiones, tabla de versiones de 24 kB y base de datos de
319 MB según `pg_size_pretty(pg_database_size(current_database()))` (unidad binaria).
La copia de metadatos de observación/run se eliminó definitivamente; los datos
originales `raw` permanecen en `intel_records`. No se efectuó VACUUM FULL,
no se eliminaron otras tablas y no se cambió el plan de Supabase.
El cambio está activo en la base compartida, sin requerir desplegar Next.js.
La migración local documenta el cambio; no se hizo commit/push del repositorio.

La migración no libera el espacio ya ocupado: solo detiene nuevas copias.
La limpieza debe ser una operación separada, autorizada y verificada. Un DELETE
no garantiza devolver inmediatamente espacio al disco; no ejecutar VACUUM FULL
ni TRUNCATE de forma automática. No eliminar ventas, costos, capturas ni checkpoints.

`supabase/maintenance/intel_storage_cleanup_after_approval.sql` es un procedimiento
manual separado, no una migración. Tras la aprobación comprueba de nuevo igualdad,
estados intermedios, organización, escritores y triggers bajo bloqueo breve de
escrituras. Cancela si encuentra datos exclusivos/no verificados. El TRUNCATE no
usa CASCADE y conserva la tabla y permisos; elimina los metadatos de cada copia.

## Verificación local

Motor aislado `@electric-sql/pglite@0.3.14` fuera de las dependencias de la app.
Ejecutar con la ruta absoluta a su `dist/index.js` como argumento:

- `node lib/intel/verify-storage.mjs <pglite>`: instalación repetible sobre datos
  existentes, conservación de versiones previas, reanudación de una ejecución
  iniciada antes del cambio, permisos y ausencia de nuevas copias.
- `node lib/intel/verify.mjs <pglite>`: catálogo, stock diario, transacciones,
  ventas paginadas, reimportación, clientes, vendedores y recuperación de timeout.
- `node lib/intel/verify-inventory.mjs <pglite>`: movimientos/costos, snapshots
  independientes, paginación, reanudación, aislamiento y ausencia de copias.

No editar la migración original: conservar el historial de esquema y aplicar
esta nueva migración después de las anteriores.
