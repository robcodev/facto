# Intel: auditoría para el MVP de análisis

## Cómo repetirla

Desde la raíz del proyecto, con las credenciales de servidor ya configuradas:

```sh
node lib/intel/verify-audit.mjs
node lib/intel/audit-runner.mjs 2025-02
```

El segundo comando usa únicamente SELECT en Supabase y GET en Bsale. No reanuda importaciones, no cambia estados, no borra preventas y no modifica la fuente. Imprime un informe JSON agregado, sin nombres, RUT, correos, tokens ni payloads de clientes. No debe exponerse al navegador: utiliza la credencial privada del servidor. La empresa se resuelve por `facto-compartido` y todas las lecturas se limitan a su ID.

La auditoría comprueba:

- Cobertura, ejecuciones, errores y verificaciones anteriores del catálogo.
- Documentos no preventa completos, enlaces a clientes y presencia de vendedores/canal explícito.
- Todos los identificadores del mes contra el listado de Bsale; preserva por separado las preventas heredadas y los marcadores de exclusión.
- Neto, impuesto, exento, total, tipo, cliente, sucursal, estado y fecha de todos los documentos no preventa del mes, con tolerancia monetaria menor a $0,01.
- Totales por tipo contra el resumen oficial, exclusivamente para los tipos que ese resumen devuelve. Si hay nombres de tipos ambiguos, no declara coincidencia.
- Líneas vigentes del mes, cantidades/importes/descuentos ausentes, enlaces a variantes/productos y suma de líneas contra el encabezado.
- Una muestra de líneas consultadas nuevamente en Bsale: el documento con más líneas de cada tipo fiscal presente. No es una revisión exhaustiva de todas las líneas en la fuente.

La lectura no es una instantánea transaccional de toda la base. Conviene usar meses cerrados y repetirla si una importación modifica ese mismo mes. La fuente se valida por cantidad estable e IDs únicos durante su paginación. Un mes conciliado no certifica automáticamente los demás.

## Resultado del 20 de octubre de 2026

Auditoría inicial entre las 16:47 y 16:49, hora de Chile, repetida con éxito entre las 16:51 y 16:52 incorporando la comparación automática con el resumen oficial. Base canónica: `C:/Users/multi/Documents/dev/facto`.

### Cobertura observada

| Recurso | Registros | Alcance |
| --- | ---: | --- |
| Productos | 4.987 | Listado general importado; conteo verificado al terminar |
| Variantes | 9.866 | Listado general importado; no incluye todas las referencias históricas |
| Fichas web | 1.218 | No equivale necesariamente a productos visibles en la tienda |
| Colecciones | 206 | Listado importado |
| Clientes | 8.232 | Listado general importado |
| Encabezados guardados | 9.139 | Incluye 4.200 preventas antiguas y un documento incompleto |
| Documentos completos que no son preventas | 4.938 | Incluye otros tipos no necesariamente constitutivos de venta |
| Marcadores de preventas omitidas | 201 | No son documentos ni importes de venta |
| Líneas guardadas | 31.453 | Incluye líneas heredadas de preventas |
| Observaciones de stock | 5.202 | Captura manual completa del 20/10, finalizada a las 11:23 de Chile |
| Recepciones/consumos históricos | 0 / 0 | Importador preparado, todavía no ejecutado |

La ejecución solicitada abarca 15/10/2024–14/10/2026; Bsale informa 41.311 documentos de todos los tipos en ese rango. Hay cinco ventanas verificadas por conteo: 15–31 de octubre de 2024 y noviembre, diciembre, enero y febrero completos. Marzo de 2025 está parcial, aunque ya existe algún documento con fecha 31/03: **la fecha máxima no prueba cobertura completa**.

La ejecución figura `running`, pero su último checkpoint conserva un HTTP 401 consultando pagos del documento 59315. Esa misma consulta respondió 200 en esta auditoría. Esto no identifica el origen del rechazo ni demuestra que el proceso se haya reanudado: no se modificó su cursor ni se limpió el error.

### Febrero de 2025: conciliación

- Bsale devuelve 1.925 documentos y están los mismos 1.925 identificadores guardados; no hay faltantes ni sobrantes.
- 956 son preventas heredadas, separadas de los indicadores. No se borraron.
- Se compararon individualmente los otros **969 documentos**: cero diferencias en los campos cotejados y todos completos.
- Sus **3.701 líneas** vigentes suman los totales de sus encabezados sin diferencias; no hay documentos sin líneas, cantidades ausentes ni importes netos/descuentos netos ausentes.
- Muestra directa de 51 líneas en cuatro documentos fiscales (boleta, factura, nota de crédito y débito): cero diferencias en IDs de variante, cantidades, precios, importes y descuentos cotejados.

| Tipo | Cantidad | Neto original | IVA original | Total original |
| --- | ---: | ---: | ---: | ---: |
| Boleta electrónica | 802 | $37.420.033 | $7.109.790 | $44.529.823 |
| Factura electrónica | 27 | $14.041.750 | $2.667.931 | $16.709.681 |
| Nota de crédito electrónica | 20 | $927.190 | $176.165 | $1.103.355 |
| Nota de débito electrónica | 1 | $58.815 | $11.175 | $69.990 |
| Ticket de venta | 104 | $2.332.528 | $443.188 | $2.775.716 |
| Guía de despacho | 11 | $629.162 | $119.540 | $748.702 |
| Cotización | 3 | $1.661.538 | $315.692 | $1.977.230 |
| Anulación de nota de venta | 1 | $31.924 | $6.066 | $37.990 |

Son importes originales por tipo, **no sumarlos como ventas netas**. Las notas de crédito vienen positivas en la fuente. El resumen oficial `/v1/documents/summary.json` devuelve boletas, facturas y tickets para este mes, y sus cantidades y cuatro importes coinciden con el respaldo. No devuelve las notas de crédito/débito de este mes, que sí existen en el listado de documentos: no usar ese resumen aislado como facturación neta.

### Faltantes encontrados

1. **Referencias históricas fuera de los listados generales.** En febrero, 489 líneas enlazan a 251 variantes distintas ausentes del catálogo. En todas las líneas guardadas (incluidas preventas) se detectaron 1.737 IDs de variantes ausentes. Cinco consultas de muestra por ID respondieron 200, con estados 55 o 97. No se asigna un significado inventado a esos estados. Recuperar por ID las variantes referenciadas y sus productos padre; conservar estado y respuesta original. Hay además una variante del catálogo cuyo padre no está guardado.
2. **Clientes históricos.** De los 4.938 documentos completos no preventa, 68 apuntan a dos clientes ausentes: IDs 15 y 740. Ambos respondieron 200 por ID, con estado 3. Recuperarlos puntualmente. Otros 1.193 documentos no incluyen clientId; no inventar identidad ni agruparlos como una sola persona para calcular recurrencia.
3. **Canal.** Los 4.938 documentos no tienen canal explícito normalizado. Todos tienen vendedor; vendedor y canal no son equivalentes. Mantener «Sin identificar» hasta incorporar evidencia de origen.
4. **Actualización.** Una consulta posterior mostró 4.989 productos, 9.871 variantes y 8.244 clientes en la fuente. El respaldo refleja su captura anterior, no cambios posteriores. Bsale sí incluye estados 0 y 1 en los listados sin filtro; el problema histórico no se resuelve simplemente agregando `state=1`.
5. **Reglas de venta.** Confirmar si TICKET DE VENTA representa venta final independiente o un paso previo a boleta/factura. También definir anulaciones y notas de crédito sin descontar dos veces la misma reversa. No identificar venta únicamente por `isSalesNote` o por un código SII no vacío.

## Orden propuesto para el MVP

1. Recuperar referencias históricas faltantes por sus IDs, con checkpoint y sin sustituir IDs por SKU. Si Bsale responde 404, registrar la ausencia y conservar la descripción histórica de la línea.
2. Completar la descarga hasta el 14/10/2026 y luego el intervalo reciente cerrado; conservar la posibilidad de reanudar, mostrar explícitamente ventanas completas y pendientes.
3. Definir una política de tipos con ventas, ajustes y exclusiones. Excluir preventas/cotizaciones/guías del ingreso; tratar tickets según confirmación del negocio. Separar estados, monedas y documentos incompletos. Validar contra Bsale al menos otro mes y un caso anulado/revertido.
4. Construir el tablero sobre Supabase: ventas netas sin IVA, unidades, ticket promedio, productos/familias, clientes y vendedores. Mostrar cobertura y frescura junto a cada indicador; no presentar interanuales hasta contar con ambos períodos completos.
5. Stock actual vs velocidad de venta después de alinear fechas. Márgenes históricos y stock pasado quedan fuera del primer MVP hasta validar costos y movimientos. Las capturas siguen siendo manuales.

No se necesita IA para validar estas cifras. El primer tablero debe poder explicar cómo llega a cada número y permitir abrir sus documentos base.

## Límites y entrega

No se modificaron tablas, políticas, importadores, documentos ni precios durante esta auditoría. Solo se añadieron herramientas locales de lectura, pruebas y este informe. No se ejecutó commit, push ni despliegue. El respaldo original en Supabase sigue siendo la única copia de trabajo: el informe no crea otro respaldo de datos.

Fuentes de semántica: [Documentos Bsale](https://docs.bsale.dev/documentos/) (fechas, detalles y resúmenes) y [Tipos de documento](https://docs.bsale.dev/tipos-de-documentos/) (uso y códigos). Las cifras y anomalías provienen de consultas reales de la fecha indicada, no de ejemplos de documentación.
