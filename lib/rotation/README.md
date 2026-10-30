# Rotación e inventario — primera etapa

Ruta `/rotation`, Datos comerciales → Rotación e inventario. GET autenticado `/api/rotation`. Implementación local en el repositorio `C:\Users\multi\Documents\dev\facto`; no se publica ni se cambia Bsale. Sin tablas nuevas, copias del espejo ni capturas programadas.

## Datos y método v1

Lee únicamente campos proyectados del espejo de Intel, incluyendo `note` y tipo documental de encabezados de inventario para reconocer movimientos administrativos. Nunca entrega respuestas originales al navegador. Lecturas con cursor estable, límites explícitos, agregación en servidor y respuesta de 25 filas; historial de 50 movimientos por página. Caché por empresa de cinco minutos. No se agregan funciones SQL en esta etapa. La carga inicial recorre índices mínimos completos; no es una agregación SQL incremental y su tiempo debe considerarse antes de desplegar.

Comparte la política actual de Facto: usuario autenticado y empresa fija `facto-compartido`, según `marketingContext`. No introduce selección arbitraria de empresa. Cada consulta del lector filtra `organization_id` y `source=bsale`; cada caché se separa por empresa. No debe confundirse esta política existente con membresías por empresa aún no implementadas en Intel.

- Encabezados y líneas se unen por identificador del padre **y ejecución vigente**. Un detalle fuente repetido invalida el documento. Un documento final incompleto invalida la cobertura del intervalo que lo contiene.
- Ventas: códigos SII 33, 34, 39, 41 y TICKET DE VENTA independiente. Estado activo, documento completo, sin anulación, con cantidades positivas. Excluye preventa 38, cotizaciones, guías y notas del numerador. Notas 56/61 se muestran separadas y no se restan. Son unidades **brutas**, nunca netas; no se presume que toda nota represente devolución física.
- Ventanas de Intel verificadas por conteos; se contrasta el número actual de encabezados de cada ventana. Cada día del intervalo debe estar cubierto y sin incidencia. `Sin datos` y `0 ventas` tienen significados diferentes.
- Ventas en 30, 90 y 365 días terminados en el corte verificado. Velocidad = unidades brutas / días calendario; cobertura = disponible / velocidad positiva, solo con stock no negativo. Sin ventas o datos suficientes, cobertura nula. Días sin venta se publican solamente si el intervalo desde la última venta está cubierto.
- Solo se elige una captura terminada con filas de stock y conteo coincidente. Se mantiene físico y disponible separados; una variante ausente no tiene stock cero. Las fechas de stock y ventas pueden diferir y se presentan por separado.
- Primer/último ingreso: recepciones completas observadas, con detalle vigente y cantidad positiva, excluyendo notas reconocidas como FULL/reclasificación/traspaso/traslado/ajuste. No es fecha de lanzamiento, compra certificada ni edad del stock restante. `updateStock` se conserva como indicador sin asignarle por intuición un efecto binario: necesita conciliación con saldos y tipos de movimiento.
- Costo: último costo no negativo informado por esas recepciones hasta el corte de ventas, no promedio contable. Valor estimado = físico × costo. Sin costo no es cero. Cero explícito se conserva con advertencia. Moneda pendiente de verificación, sin total monetario entre productos; no es margen ni rentabilidad.
- FULL: el flujo actual genera una recepción con nota administrativa y una preventa tipo 38. El prefijo solo propone una relación entre variantes; ambos SKU se mantienen separados y sus costos/edades no se consolidan. No se duplica stock mediante una suma por supuesto SKU base. Los registros administrativos identificados permanecen visibles en historial.
- Variantes rezagadas: variante con stock disponible positivo y cero ventas en período, mientras al menos una hermana vende. Agrupación padre suma solo variantes que cumplen filtros; los motivos se conservan como señales de sus variantes.
- Estacionalidad: comparación de 90 días con el intervalo desplazado 365 días, únicamente con cobertura suficiente. No clasifica automáticamente como mala compra. No ajusta por años bisiestos ni estima demanda futura.
- Prioridad explicada en pantalla: 30 sin ventas con stock, 20 última venta antigua, 20 exceso de cobertura, 5 primer ingreso observado antiguo y hasta 15 por valor. Penaliza ventas desconocidas (30), FULL pendiente (20) y costo ausente (5). Es una regla descriptiva para revisión, no probabilidad ni prueba de sobrecompra.

## Proveedores y segunda etapa

Proveedores ya consulta Bsale y XML en vivo; no es la prueba ficticia anterior. No tiene correspondencias verificadas con líneas de recepción. El módulo enlaza su pantalla pero no consulta masivamente esa API ni une por folio. Debe desarrollarse la identidad proveedor/RUT + tipo + folio y validarse SKU de proveedor. Las referencias de recepción no constituyen una factura vinculada. Recepción física y emisión de factura son fechas distintas.

FIFO permanece deshabilitado. Para habilitarlo: validar saldo inicial por variante/sucursal, clasificar efectos reales (incluidos traslados y FULL), conciliar contra capturas, separar huecos/origen desconocido y versionar la hipótesis. La última recepción nunca debe rejuvenecer todas las unidades. Tiempos hasta vender 50/80/100 % quedan pendientes.

## Verificación

`node lib/rotation/verify.cjs`, TypeScript sin emisión y ESLint de archivos afectados. Fixtures aislados; no escriben en Bsale ni Supabase. Verificación del lector con datos reales en modo solo lectura. Los informes agregados de esta tarea están en el directorio de trabajo `inventory-module/` del proyecto ChatGPT, sin secretos ni respuestas originales.

Lectura real del 30/10/2026: corte de ventas 26/10 y captura 27/10; 18.503 variantes, 28.485 documentos, 92.098 líneas, 9.388 recepciones, 3.393 consumos, 5.256 filas en la captura elegida. Ventanas 30/90/365 verificadas por conteos; cero documentos finales con detalle inválido, 286 movimientos con detalle inválido o ausente, 601 notas separadas. Se encontraron 2.379 variantes con disponible positivo, 2.192 con costo de recepción utilizable (76 costos cero). La lectura optimizada tardó 74,8 segundos, antes de añadir la reutilización de nombres de marca. La ficha consulta otras observaciones por variante: hasta 200 filas entre las últimas 30 ejecuciones terminadas; límite explícito en pantalla, sin inferir continuidad diaria.

Navegación local comprobada en `/rotation`: búsqueda exacta `41RAHAL42`, ficha con tres recepciones y catorce movimientos, agrupación por producto y selector de orden. Autenticación: sin sesión, la API devuelve 401 y la página redirige a ingreso. Los nombres de marca declarados reutilizan `commercial_brand_names`; si falta correspondencia se muestra el ID, sin inventar el nombre.

Fuentes de referencia: [Stocks Bsale](https://docs.bsale.dev/stocks/), [Documentos de terceros](https://docs.bsale.dev/documentos-de-terceros/). No interpretar campos no documentados como una relación contable certificada.

Verificación final con cuatro consultas simultáneas y recuperación acotada de timeout: 120,4 segundos durante la prueba concurrente con el navegador; los conteos y resultados se mantuvieron. Se deja margen de 180 segundos en la ruta. Antes de desplegar conviene sustituir el recorrido inicial por agregados SQL o cálculos derivados incrementales para reducir la espera, sin duplicar el respaldo.


## Cambio de fuente: recepciones directas
Desde esta revisión el listado no lee inventory_receptions ni inventory_receptions_details de Intel. Ventas y stock siguen en Intel; primer ingreso y valoración global quedan pendientes de una metodología con cobertura suficiente. La ficha inicia una solicitud separada GET /api/rotation/receptions autenticada y comprueba que la variante exista en la empresa antes de llamar a Bsale. Consulta costs.json y verifica cada referencia contra su encabezado y detalle reales, por ID de variante. No se guardan respuestas ni se modifica Bsale. Hasta diez referencias por página, tres tareas simultáneas; las fallas por recepción se explicitan. No hay respaldo automático en los datos antiguos.
El historial de costos de Bsale no garantiza todas las recepciones: para 34563 devolvió una referencia, mientras antes se habían observado tres. Se declara historyComplete=false incluso si la página está completa o vacía; no se publica el primer ingreso comercial ni se infiere que nunca hubo entradas. Fechas de consulta Bsale y corte de ventas Intel aparecen separadas. El folio informado es evidencia, no una unión verificada con factura de proveedor.
