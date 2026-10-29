# Ventas por lotes y proceso independiente

El 26/10/2026 se incorporó lectura de 10 documentos expandidos por lote y hasta
3 consultas simultáneas para verificar pagos. Los registros y el cursor se
confirman en una sola llamada al RPC existente. Una colección incompleta vuelve
al recorrido paginado anterior; no hay límite artificial de líneas.
Un error no adelanta el lote. Los checkpoints anteriores siguen siendo válidos.

## Instalación actual

`FactoIntelSalesWorker` es una tarea del Programador de Windows, en este equipo,
para el usuario actual. Ejecuta `scripts/intel-sales-worker.ps1` con Node y la
carpeta canónica `C:/Users/multi/Documents/dev/facto`. Inicia al abrir sesión y
se reinicia después de un fallo. No depende de Next dev ni de la pestaña,
pero requiere este equipo encendido, conectado y con sesión iniciada.
No se configuró un servicio en la nube ni se cambiaron planes de pago.

El proceso consulta ventas activas de `facto-compartido` con
`config.background=true`. No inicia periodos nuevos ni captura inventario.
La API autenticada habilita, pausa y reanuda la carga. La pantalla consulta
avance cada cinco segundos sin importar datos. Una pestaña antigua recibe 409
si intenta importar con el proceso automático habilitado. Al pausar puede
terminar el lote ya iniciado. La interfaz muestra la última señal recibida.

## Reintentos y concurrencia

Una adquisición optimista por config/etapa guarda un token y lease de 120 segundos
en `intel_sync_runs.config.worker`. Otro proceso espera hasta que venza. El commit
conserva la protección de revisión del RPC. Un mutex de Windows evita además dos
instancias en la misma sesión. Los errores de conexión, abortos y HTTP 429/5xx
se reintentan tras 5, 10, 20, 40, 80 y luego 120 segundos. Los errores de validación
o conteos inconsistentes muestran `attention`, deshabilitan `background` y
conservan el checkpoint hasta revisión. Un proceso muerto se recupera al vencer
el lease y reiniciarse la tarea.

El log `private/intel-sales-worker.log` guarda estados y UUID de ejecución,
rota a los 2 MB y está excluido de Git. No registra documentos, clientes ni claves.
La autenticación de la aplicación permanece sin cambios.

## Operación

- Instalar: `scripts/install-intel-sales-worker.ps1 -NodePath <node.exe>`.
- Consultar: `Get-ScheduledTask -TaskName FactoIntelSalesWorker`.
- Detener: `Stop-ScheduledTask -TaskName FactoIntelSalesWorker`.
- Iniciar: `Start-ScheduledTask -TaskName FactoIntelSalesWorker`.
- Migrar de equipo: detener/desregistrar la tarea anterior e instalarla en el
  nuevo equipo con Facto y sus variables privadas. El cursor queda en Supabase.

Los controles nuevos están en el checkout local. No se hizo commit/push ni
despliegue de las otras funcionalidades pendientes del repositorio. El proceso
instalado ya usa directamente el importador optimizado y Supabase.

Verificación real tras instalar: entre 19:14:46 y 19:16:45 UTC del 26/10/2026,
el cursor pasó de 12.748 a 13.048 documentos completos y de offset 1.045 a 1.345
en agosto de 2025, sin errores. Es una muestra de dos minutos, no una garantía
del tiempo total: la cantidad de líneas y relaciones pendientes varía por mes.

## Verificación

`node lib/intel/verify-sales-batch.mjs`: lotes completos, concurrencia acotada,
preventas excluidas, fallback, errores, adquisición concurrente, espera y pausa.
`verify.mjs <pglite>`: transacciones, lotes, documentos con 51 líneas, reanudación,
reconciliación de conteos y permisos. TypeScript y ESLint de archivos modificados.
