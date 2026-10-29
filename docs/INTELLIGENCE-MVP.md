# Inteligencia comercial · Salud y oportunidades por producto

MVP local del 28/10/2026. Entrada en la navegación: Inteligencia comercial; ruta /intelligence. Página y API requieren sesión de Facto y reutilizan la política vigente de empresa compartida. La API vuelve a autenticar cada solicitud y restringe todas las lecturas a la organización; no expone credenciales al cliente.

## Exploración por producto

- Catálogo activo completo dentro de límites explícitos, con búsqueda por nombre, ID, variante o SKU. No parte de los 20 productos de ventas seleccionados por Marketing.
- Filtros por marca identificada, disponibilidad observada y señal: ventas repartidas, concentración, disponibilidad pendiente, ventas con stock observado sin unidades, clics orgánicos, aumento de unidades, recepciones o ausencia de movimiento documentado. Las marcas ausentes quedan sin identificar; no se deducen de palabras del nombre.
- Indicadores calculados del catálogo completo y resultados paginados de 25 productos. Los filtros se aplican antes de paginar. Cambiar filtros deja una advertencia hasta pulsar Explorar productos.
- Ficha con unidades brutas y documentos del producto, comparación anterior de igual duración, concentración en el mayor documento, todas las variantes de catálogo y sus participaciones, disponibilidad, recepciones, URL y señales verificadas de Google.
- Se incorporan variantes inactivas al detalle histórico, sin atribuirles disponibilidad actual de otras variantes. El conteo de documentos por variante no se suma para obtener documentos del producto.

## Tiempo y cobertura

El eje de navegación es el producto o la pregunta comercial. Las ventanas de 14, 28 y 56 días aportan contexto. El último día se obtiene de sales_windows con reconciliación por conteo válida y se limita a días cerrados en America/Santiago. La ventana completa vuelve a validarse mediante el lector de Marketing; la comparación anterior requiere su propia cobertura.

Sin cobertura o referencias completas las ventas y comparaciones quedan desconocidas. La base cero no produce un porcentaje supuesto. Los ceros solo representan ausencia de movimiento en un intervalo cubierto. Son unidades brutas: no se descuentan devoluciones ni se calculan ventas netas, margen o causalidad publicitaria.

La disponibilidad se agrega desde una captura de inventario aceptada por las reglas existentes de Intel. Para el total se exige observación de todas las variantes activas. Una observación futura, ausente, incompleta o de más de 24 horas exige confirmación; no reconstruye stock histórico ni quiebres. Recepciones: se reutilizan movimientos completos con efecto en stock, detalles de la misma corrida y hasta las 100 recepciones más recientes del período; el límite queda explícito y no implica novedad o reposición comercial.

## Google, IA y Marketing

- Solo se leen reportes ya guardados de GA4 489006527 y Search Console sc-domain:dmultisport.cl del mismo intervalo. No se llaman sus API durante la exploración.
- Se exige prueba de identidad vigente en la correspondencia, método store_product_identity_v1, mismo producto Bsale, HTTP 200, propiedad correcta y URL o alias acreditado. Verificada aquí describe identidad documentada; la fecha de comprobación debe revisarse antes de una acción comercial.
- Las filas web se agregan una vez por producto y reporte; no se multiplican por variantes. GA4 aporta sesiones de entrada, sin asignar compras o ingresos al artículo. Search Console conserva parcialidad y zona horaria. Ausencia de reporte o fallo de lectura conserva la señal pendiente.
- La ficha puede recuperar la recomendación más reciente del producto entre los cinco análisis marketing-analysis-v4 guardados más recientes del mismo intervalo y empresa. Muestra fecha y revisión humana pendiente. No vuelve a llamar a Gemini ni genera un análisis por abrir la ficha.
- El enlace a Marketing conserva el intervalo; su consulta continúa siendo manual. Reutiliza generación y guardado existentes; no selecciona automáticamente un producto ni publica.

## Lecturas y almacenamiento

No crea tablas, migraciones ni copias de ventas o catálogo. Se reutiliza readOpportunities para cálculos de ventas y se añadió una opción de lectura de recepciones sin selección limitada de candidatos. Los llamados existentes de Marketing mantienen su comportamiento.

Proyecciones mínimas para catálogo: nombres, identificadores, estado, marca, SKU y URL; no descripciones ni respuestas originales. Límites: 10.000 productos, 20.000 variantes, 2.000 marcas, 10.000 fichas web, 5.000 ventanas, 30.000 filas de stock y 5.000 correspondencias. Se falla explícitamente al no poder confirmar una lectura completa. Ventas conservan límites de 10.000 documentos y 20.000 líneas del lector existente.

Paginación de catálogo de 1.000 filas ordenada por la clave externa, con empresa, origen Bsale y recurso para aprovechar el índice existente. Inventario mantiene el orden compatible con su índice por captura. Resumen temporal en memoria de servidor, separado por empresa y ventana: máximo cuatro entradas y 60 segundos desde terminar la lectura; una actualización explícita lo renueva. La autenticación se comprueba aun cuando se reutiliza el resumen. No hay caché persistente de nuevos datos.

## Comprobación real

Para el corte 13–26/10/2026, comparación 29/09–12/10:

- 2.204 productos activos; 435 con ventas identificadas: 109 con ventas repartidas y 326 con concentración para revisar.
- 13 productos con clics de Search Console verificados en los reportes disponibles; no representa el total de demanda web.
- Las observaciones de stock de esta prueba superaban 24 horas, por lo que todos los productos requerían confirmación. No se afirmó disponibilidad actual.
- Silverside: 32 unidades brutas, 29 documentos, 41 unidades anteriores; mayor documento de dos unidades, 30 en los demás. Cinco variantes con stock observado total de 84; 26 clics y 344 impresiones de Search Console y 18 sesiones GA4 en reportes parciales. Una recepción identificada en la lectura limitada.
- Las marcas no estaban identificadas en los datos de catálogo disponibles. Se presenta esta limitación y la búsqueda textual sigue operativa.
- Primera lectura real ajustada: unos 23 segundos en este equipo; los filtros y fichas posteriores pueden reutilizar el resumen temporal. No es una garantía de tiempo de respuesta.

Pruebas automatizadas en lib/intelligence/verify.cjs: cobertura desconocida, disponibilidad incompleta y antigua, concentración, base cero, participaciones por variante, búsquedas por SKU y acentos, marca y disponibilidad, corte verificado, agregación web sin multiplicar variantes, aislamiento por empresa, reutilización del resumen y recuperación de recomendación guardada. También pasan las pruebas del lector y análisis de Marketing, TypeScript, ESLint y compilación completa de Facto. Comprobación visual con sesión real y datos existentes. Sin llamadas nuevas a Gemini, Bsale o Google; sin cambios de datos ni despliegue.

## Ajuste de stock solicitado por el propietario

Se retiró el indicador y los avisos de «Confirmar disponibilidad», así como la regla de antigüedad de 24 horas en Inteligencia comercial. La interfaz muestra el stock observado y su fecha, sin una segunda evaluación de disponibilidad comercial. Los datos ausentes o incompletos siguen desconocidos; el stock cero sigue siendo cero. Se retiró la tarjeta de confirmación y la señal correspondiente.

## Ampliación comercial — 28/10/2026

Se agregaron compras conjuntas por documento, rendimiento de variantes, revisión de reposición, web frente a ventas, importes efectivos y concentración, registro de acciones/resultados y nombres de marca declarados con procedencia.

Compras conjuntas cuenta cada producto una vez por documento; el listado comercial exige ambos productos activos y al menos tres documentos compartidos. Las asociaciones históricas con inactivos se excluyen del listado y se identifican en el detalle. No representa compradores únicos, complementariedad comprobada ni efecto causal de una campaña.

Reposición compara stock observado con unidades brutas del intervalo, separando movimientos concentrados. No predice demanda ni calcula cantidades de compra porque faltan plazos y reservas. Los reportes web guardados del mismo intervalo siguen indicando sus límites y parcialidad.

Los importes son los efectivos sin IVA, con descuentos ya incorporados. Se separa cada moneda explícita. Notas 61/56 se enlazan por relatedDetailId al ID original de Bsale, con misma variante, corrida del encabezado, estado y tipo final válidos. Un vínculo ausente, ambiguo o anulado impide presentar saldo conciliado. El flujo documental del período puede ajustar ventas anteriores; no es una cohorte ni acredita devoluciones físicas. Índice parcial intel_sales_detail_original_id para buscar raw->>id exactamente, evitando barridos por comodines.

Migración 20261028153431_commercial_analysis_actions.sql aplicada y verificada en Supabase. commercial_actions conserva evidencia inicial compacta e inmutable, actor, hipótesis, ejecución y resultados manuales; actualizaciones controlan empresa y versión. commercial_brand_names guarda nombres declarados con procedencia. RLS activo y acceso de cliente/anon revocado; acceso exclusivamente por servidor autenticado y autorizado con el contexto de empresa existente. No se duplican documentos ni catálogo. Sin acciones ni nombres ficticios guardados en producción.

Bsale devolvió 404 en las tres lecturas autorizadas de marcas 1, 4 y 86. No se inventan nombres; fallback por ID y formulario de declaración. Publicidad pagada pospuesta por decisión del propietario. Costo × 1,7 se muestra como simulación editable; 10 % es un escenario, nunca se aplica automáticamente a ventas. Costos de recepción aún sin asignación histórica; margen real pendiente.

Validación real 13–26/10/2026: 521 ventas finales, 10 notas de crédito vinculadas (13 líneas), CLP 28.212.667 sin IVA en ventas, 663.692 en créditos y saldo documental 27.548.975; diferencia de líneas frente a encabezados de ventas: cero. 25 combinaciones activas (21 históricas con inactivos excluidas), 731 variantes con movimiento, 139 para revisión de reposición y 130 líneas de recepción con costo reportado en lectura acotada. Primera lectura aproximada 23 segundos; no es garantía de respuesta.

Pruebas: verify-analysis.cjs (cálculo y migración en PGlite), verify-actions.cjs (estados, fechas, evidencia calculada en servidor, empresa y concurrencia), verify.cjs, lector Marketing, TypeScript, ESLint dirigido y next build. Revisión de interfaz con sesión real; lectura de acciones vacía confirmada. Sin llamadas nuevas a Gemini/Google ni cambios de precios, ventas o stock; sin despliegue.


## Compras conjuntas históricas — 28/10/2026

Acceso directo /intelligence/baskets y consulta /api/intelligence/baskets. Reutiliza autenticación y contexto de empresa. No añade tablas, migraciones ni llamadas de IA. Consulta manual independiente de las ventanas cortas de la ficha.

Lectura completa paginada por clave externa estable y proyecciones de catálogo, variantes, ventanas, documentos y líneas. Topes explícitos: 250.000 documentos, 1.000.000 de líneas, 500.000 pares; excederlos falla sin presentar una muestra como completa. Solo líneas de corrida coincidente con padre, cantidad positiva e importe neto positivo, producto identificado y sin ID de detalle repetido. Se separan notas, anulados, no finales e incompletos. Cantidad de documentos por cada ventana se contrasta con importedCount; cobertura y exclusiones se reportan.

Frecuencia, soporte, proporción direccional y lift por par; evolución mensual, comparación 90/90 días y mismos meses calendarios completos de año actual/anterior. Inactivos visibles opcionalmente. Regla descriptiva de repetición: diez documentos, tres meses y hasta 60 % en el mes más concentrado. Sensibilidad: se informa proporción de casos en documentos de más de diez productos y se recalculan las medidas en una base que solo contiene documentos de hasta diez. El filtro por defecto omite pares dominados por documentos amplios; no se asume que estos sean mayoristas ni errores. Caché separada por empresa de cinco minutos tras completar lectura, compartiendo una consulta en curso. API devuelve veinte pares y resúmenes, sin documentos individuales, importes ni clientes.

Validación real: 15/10/2024–26/10/2026, 742 días sin huecos en 26 ventanas verificadas; 28.485 documentos y 92.098 líneas leídos; 23.348 ventas finales (20.750 boletas, 2.053 tickets y 545 facturas), 601 notas y 4.536 no finales/inactivos separados; 2.636 líneas gratuitas excluidas, ninguna venta final inválida/incompleta y cero diferencias de conteos por ventana. 12.395 ventas con múltiples productos (53,09 %), 2.738 productos y 73.580 pares. 1.038 pares activos con al menos diez casos y sin predominio de documentos amplios; 1.015 también cumplen repetición y lift mayor que uno. 564 documentos amplios. Misiles–Pejerrey: 319 casos, 25 meses; sin amplios 273 y lift 10,85. Consultas iniciales de esta prueba alrededor de un minuto; no se garantiza latencia.

Pruebas verify-history.cjs: cobertura y huecos, variantes deduplicadas, líneas gratuitas, notas/anulados, integridad de corrida, meses parciales, comparación anual, sensibilidad a documentos amplios, búsqueda acentuada, paginación e identificación de empresa. TypeScript, ESLint dirigido y compilación completa satisfactorios. Informe analítico extenso entregado aparte. No inferir clientes únicos, causalidad, compatibilidad entre variantes, margen, retorno publicitario ni stock histórico.

