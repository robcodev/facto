# Completar las fuentes pendientes de Intel — 27/10/2026

Trabajo de una sola ejecución, autorizado por el propietario después de la
auditoría. No programa importaciones diarias ni capturas periódicas de stock.

`lib/intel/completion-runner.mjs` coordina:

1. Ventas del 15 al 26/10/2026, procesadas por el trabajador ya instalado.
2. Continuación del inventario desde el consumo 2.810 de 3.393, sin repetir los
   movimientos anteriores. Los datos y cursores se confirman con los RPC existentes.
3. Recorrido de IDs actuales de recepciones y consumos para recuperar movimientos
   nuevos/faltantes. El conteo y los IDs únicos se verifican; si cambia la cantidad
   durante el recorrido, se reinicia ese escaneo conservando lo importado.
4. Una captura actual de stock, manualmente solicitada mediante este trabajo.
   Lee hasta 500 filas por lote (páginas de 50, concurrencia máxima 3), verifica
   la cantidad de IDs guardados después de escribirlos y reinicia una captura
   parcial si cambia el conjunto durante la lectura. No rellena ausencias con cero.
5. Recuperación por ID de variantes referenciadas por ventas no preventa y por
   inventario, sus productos padre y los clientes referenciados que faltan.

Solo hace GET a Bsale. Conserva las respuestas originales en el mismo espejo de
Intel, sin crear copias completas adicionales. Un HTTP 404/410 produce evidencia
en `historical_reference_checks`; no inventa una ficha ni interpreta su ausencia
como stock cero. No importa listas de precios, PDF/XML o archivos de imágenes.
Las preventas heredadas no se borran y continúan fuera de los indicadores.

## Continuidad

La tarea Windows `FactoIntelCompletion` ejecuta el coordinador oculto y se reinicia
al abrir sesión o tras un fallo. Requiere el mismo computador encendido, conectado
y con sesión iniciada. Termina y sale cuando el trabajo se completa; después,
volver a ejecutarlo no inicia otra captura automáticamente.

El estado privado está en `private/intel-completion-state.json` y los cursores
de importación en Supabase. El log agregado `private/intel-completion.log` rota
a los 2 MB y no registra fichas de clientes ni claves. Los secretos siguen en
las variables privadas del servidor. No se cambian RLS ni permisos.

Las ejecuciones de catálogo `purpose=historical_references` e inventario
`purpose=movement_gaps` se reservan para el coordinador: el importador normal
no debe reanudarlas como si fueran otra etapa. Se conservan `scope=catalog` y
la separación de las capturas de stock para no declarar que el catálogo aporta
una nueva fotografía de stock.

Las escrituras de los lotes usan la identidad única existente; la recuperación
de fichas permite repetir un lote tras interrupción sin duplicar entidades.
La transición del cursor del trabajo de fichas ocurre después de guardar el
lote: si se interrumpe antes, ese lote puede repetirse, conservando los datos.
Su procedencia queda en el run con `purpose=historical_references`. No interpretar
el `first_seen_at` de una ficha recuperada como fecha de lanzamiento/novedad.

## Comprobación final

`node lib/intel/audit-recent.mjs` contrasta todos los encabezados e importes del
intervalo reciente con Bsale y revisa las sumas de sus líneas. La revisión guarda
`private/intel-recent-audit.json` y no modifica datos.

`node lib/intel/verify-completion.mjs` verifica ejecuciones completas, continuidad
de ventanas, documentos completos, referencias resueltas o evidencia de ausencia,
conteos de movimientos y captura, y cero copias nuevas. Guarda un informe agregado
en `private/intel-completion-verification.json`. No modifica la fuente ni el espejo.

Instalación: `scripts/install-intel-completion.ps1 -NodePath <node.exe>`.
Operación: `Get-ScheduledTask`, `Stop-ScheduledTask` o `Start-ScheduledTask` con
el nombre `FactoIntelCompletion`. No se hizo commit/push ni despliegue en Vercel.
