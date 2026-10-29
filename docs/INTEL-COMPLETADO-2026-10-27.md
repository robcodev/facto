# Cierre de la carga pendiente de Intel — 27/10/2026

La importación solicitada terminó el 27/10/2026 a las 11:46, hora de Chile.
Se continuaron los puntos guardados sin reiniciar los dos años de ventas.

## Cobertura completada

- Documentos de Bsale desde el 15/10/2024 hasta el 26/10/2026 inclusive.
- Actualización reciente: 713 documentos consultados, 447 documentos no preventa
  guardados y 266 preventas excluidas; 1.292 líneas recientes.
- Historial de inventario: 9.388 recepciones y 3.393 consumos. El recorrido final
  de IDs encontró y agregó ocho recepciones posteriores a la carga inicial.
- Captura manual del stock del 27/10/2026: 5.256 registros. No programa capturas
  periódicas. Una captura parcial fue sustituida cuando cambió el total de origen.
- Recuperación de referencias históricas: 8.637 variantes, 2.265 productos padre
  y diez clientes que no estaban en el espejo. Todos respondieron correctamente;
  no hubo fichas inaccesibles por HTTP 404/410.

Las respuestas originales siguen dentro del mismo espejo de Intel. No se
crearon copias completas en la tabla de versiones. Solo se hicieron consultas
GET a Bsale: no se modificaron sus productos, precios, documentos ni existencias.

## Comprobaciones

La actualización reciente se contrastó íntegramente contra los encabezados de
Bsale: sin documentos faltantes, sobrantes, incompletos o importes diferentes.
Sus líneas suman los totales correspondientes.

La comprobación final terminó correctamente a las 11:48, hora de Chile: las
cinco ejecuciones completas, ventanas continuas y cero referencias pendientes,
documentos incompletos o copias en versiones. El espejo reúne 7.252 productos,
18.503 variantes, 8.389 clientes y 24.285 documentos no preventa. Este último
conteo no equivale a contar ventas finales sin aplicar las reglas tributarias.

Evidencia local agregada, excluida de Git:

- `private/intel-recent-audit.json`: comparación de la ventana reciente.
- `private/intel-completion-state.json`: cierre y referencias a las ejecuciones.
- `private/intel-completion-verification.json`: comprobación final de ventanas,
  documentos completos, referencias y versiones.

La auditoría anterior sigue en `INTEL-REVISION-2026-10-27.md`. Los pendientes de
carga, inventario y referencias allí enumerados quedan sustituidos por este
cierre. Se conservan sus observaciones sobre interpretación de los datos.

## Espacio y límites del respaldo

Medición posterior a la carga: **599,44 MiB** de base de datos (aproximadamente
628,56 MB decimales). Ya excede la capacidad del plan gratuito. No se cambió el
plan ni se contrataron servicios. La tabla de versiones permanece vacía; esta
medición incluye tablas, índices y espacio asignado por PostgreSQL y no equivale
exclusivamente a bytes de datos útiles. No se ejecutó mantenimiento bloqueante
ni se borraron registros para reducirla.

Esto completa las fuentes pendientes del espejo implementado, no un archivo
binario de imágenes, PDF o XML. Tampoco incorpora listas de precios. Las
preventas heredadas se conservan excluidas y no se borraron. El canal comercial
no se inventa a partir del vendedor ni se asigna una identidad a ventas sin
cliente en origen. La cobertura de movimientos corresponde a lo que Bsale
expone; no implica disponer de una captura de stock por cada día pasado.

Antes de interpretar ingresos netos o márgenes, mantener las reglas explícitas
de tipos de documento, anulaciones, devoluciones y redondeos descritas en la
auditoría. TICKET DE VENTA se considera venta final independiente por indicación
del propietario.

## Continuidad

La tarea puntual `FactoIntelCompletion` terminó con resultado 0 y quedó lista;
volver a iniciarla con este punto guardado no crea otra importación. El trabajador
de ventas sigue disponible para próximas actualizaciones solicitadas. Requiere
este computador encendido y conectado. Los datos ya están en Supabase; no hubo
commit, push ni despliegue de código como parte de este cierre.
