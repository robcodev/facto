**Calendario de contenido de Marketing**

Acceso: /marketing/calendar, desde la navegación de Marketing. API privada /api/marketing/calendar. Implementado el 28/10/2026.

El primer calendario cubre 02–29/11/2026: 28 historias, ocho reels, cuatro emailings, cuatro banners web, cuatro posts y cuatro blogs. Se asumió blog semanal y horizonte inicial de cuatro semanas, comunicados al propietario. La duración (hasta ocho semanas) y las frecuencias son editables; mínimo una historia diaria. Se guardó el primer calendario real como propuestas, sin aprobar ni publicar piezas.

Selección por ID de producto y tipo real del catálogo Bsale: Proyectos 48, Deportes 49, Full 69 y Fiestas Patrias 53 excluidos. Se excluyen además referencias que comienzan con FULL fuera de ese tipo, tipos ausentes y propuestas promocionales automáticas de armas/municiones. Las razones por producto y los 45 tipos registrados están disponibles en la interfaz. No se alteran las preferencias globales de Intel ni el catálogo original.

Datos y proyección

- Lector completo y paginado por clave externa, separado por empresa y origen Bsale. Reutiliza el scanner de Inteligencia; las lecturas existentes conservan su comportamiento. Límites explícitos; no presenta muestras como universos completos.
- Ventas finales activas y completas: SII 33/34/39/41 y tickets de venta. Notas y anulados separados; misma corrida entre línea y encabezado, ID de detalle no duplicado, variante enlazada por ID, cantidad positiva e importe positivo. No descuenta devoluciones ni notas de crédito de las unidades. No lee datos de clientes ni precios para la planificación.
- Cada semana futura se enfrenta a siete días desde la misma fecha inicial del año anterior. No ajusta días de la semana, feriados ni demuestra causalidad publicitaria.
- Ajuste exploratorio: 56 días hasta el corte verificado frente a 56 días desde la fecha equivalente anterior. Requiere base de documentos y unidades suficiente y sin concentración excesiva; en su defecto usa la cohorte de catálogo activo del tipo, o conserva factor uno. Factor limitado entre 0,5 y 2; se muestran factor observado, aplicado y origen del ajuste.
- Evaluación retrospectiva en cuatro ventanas consecutivas de siete días hasta el corte. El ajuste de cada prueba solo usa datos anteriores a su semana de evaluación. Se adopta el ajuste si hay cuatro ventanas, al menos tres con movimiento, diez unidades reales acumuladas y mejora mayor al 5 % en error absoluto total. Se muestran MAE de ambos métodos; evaluación preliminar, no intervalo de confianza ni garantía de demanda.
- Stock positivo observado de todas las variantes activas para selección automática; se conserva la fecha y no se restaura una regla de caducidad de 24 horas. Stock cero/negativo o incompleto no rellena automáticamente espacios. No reconstruye stock pasado ni promete disponibilidad futura.
- La semana equivalente debe estar cubierta y sin días inválidos. Diferencias entre conteos de importación impiden rellenar propuestas automáticamente. Para una proyección actual se pide actualizar ventas si el corte tiene más de 21 días.
- Diversidad editorial: hasta dos piezas por producto/semana y cuatro por calendario. Espacios sin evidencia quedan pendientes. Las propuestas son enfoques por reglas, no textos finales ni generaciones nuevas de Gemini. Fechas y formatos no se presentan como óptimos comprobados.
- La proyección pertenece al producto y semana. No se suma por piezas, no es venta incremental atribuida al contenido ni cálculo de ingreso/margen.

Persistencia y edición

Migración 20261028171217_marketing_content_calendar.sql aplicada en el Supabase existente mediante SQL Editor y permisos privados verificados. marketing_calendars guarda configuración y resumen; marketing_calendar_entries conserva cada propuesta y su evidencia original compacta. RLS activo, sin acceso directo anon/authenticated; servidor autenticado usa el contexto de empresa existente. No expone credenciales, clientes ni documentos de venta en el navegador.

La propuesta completa se firma en el servidor con HMAC, ligada a usuario y empresa, y vence a las dos horas. El guardado usa una única función transaccional, sin SECURITY DEFINER, ejecutable solo por service_role. Evita duplicados por huella de configuración y selección. Si falla una fila se revierte todo el calendario. Sin copia de ventas históricas.

Se puede editar fecha dentro de la misma semana analizada, título, enfoque y estado (pendiente, propuesta, revisada, realizada u omitida). La base, producto, tipo y formato originales no se reemplazan. Para otra semana hace falta una nueva propuesta. Control de versión con updated_at; no permite marcar una fecha futura como realizada. El calendario es compartido por el equipo autenticado según la política de empresa existente. No se envían emails ni se publica en redes o web.

Validación

Lectura real: 28.485 documentos, 92.098 líneas y 23.348 ventas finales, corte 26/10/2026; 601 notas separadas, 2.636 líneas gratuitas excluidas, cero documentos finales inválidos y cero diferencias de conteos por ventanas. Primer calendario: 52 propuestas, 31 productos, ningún espacio sin evidencia. Diez piezas usan referencia ajustada y 42 la estacional simple; la cifra se repite cuando un producto ocupa varias piezas.

verify-calendar.cjs: ritmo diario/semanal, exclusiones exactas sin confundir FULL CAP con tipo FULL, no uso de datos futuros, elección retrospectiva, stock y cobertura desconocidos, integridad de corrida, atomicidad, duplicados, evidencia inmutable, permisos y empresa. Migración ejecutada además en PGlite. verify-calendar-server.cjs: firma, usuario/empresa, caducidad y conservación de evidencia al guardar. verify-history.cjs, TypeScript, ESLint dirigido y compilación completa satisfactorios. Guardado y edición de un enfoque real verificados en la interfaz; todas las piezas permanecen como propuestas. Sin despliegue.

Integración Google del calendario — 28/10/2026

Versión seasonal-calendar-web-v2. Reutiliza OAuth compartido o el acceso de servicio de solo lectura ya configurado, para GA4 489006527 y Search Console sc-domain:dmultisport.cl. No pide permisos nuevos ni cambia la instrumentación. Sin llamadas a Gemini.

El calendario tiene botones para consultar el estado y actualizar señales. La actualización importa dos períodos consecutivos de 28 días, terminando en el menor valor entre el último corte de ventas verificado y tres días antes de hoy (America/Santiago). Se solicitan datos finalizados a Search Console. No se mezclan estos reportes con los reportes diarios anteriores.

Analytics: landingPage, sessions y engagedSessions; lectura ordenada y paginada de hasta 20.000 páginas, con rowCount consistente, sin duplicados y control de alcance. No consulta compras ni ingresos para asignarlos a productos. Se conservan límites de muestreo/umbrales/filas agrupadas; si existen, las métricas se muestran pero Analytics no refuerza la prioridad.

Search Console: dimensión page, clics, impresiones, CTR y posición media, con tope de 25.000 filas. Alcanzar el tope falla explícitamente. Incluso sin alcanzar el tope se conserva el aviso de cobertura parcial de filas principales; ausencia de fila no representa cero. CTR se agrega como clics/impresiones y posición se pondera por impresiones.

Solo se conservan filas de correspondencias verificadas con store_product_identity_v1, ID Bsale correcto, HTTP 200, propiedad esperada, URL canónica/alias acreditado y misma URL actual del catálogo al asignar evidencia. No se deduce identidad por nombre ni se copian métricas de una categoría a un producto. Claves únicas por fuente se agregan una vez; no se multiplican por variantes. Hasta 1.000 filas verificadas por reporte en el almacenamiento existente.

Snapshots con report_kind calendar_landing_v1 y calendar_search_v1 en intel_web_reports. Se guardan juntos los dos períodos de cada fuente mediante upsert de dos filas; si falla uno de ellos no se acepta un par parcial. La comparación exige lote común, firma del conjunto de correspondencias, fechas exactas, misma zona horaria dentro de la fuente y lectura de hasta siete días. Las fuentes conservan su zona propia: en esta prueba GA4 Pacific/Easter y Search Console America/Los_Angeles. No equivalen a instantes idénticos con Bsale.

Una nueva migración, 20261028192054_calendar_google_report_kinds.sql, amplía el CHECK de report_kind para permitir los dos snapshots nuevos. Se aplicó al Supabase existente y se conservan los tipos campaign, landing y search_page, sus filas, RLS y permisos privados. La primera prueba detectó ese CHECK incompatible; se corrigió y se volvió a consultar Google. No se sobrescribieron reportes antiguos con una estructura diferente.

Peso editorial experimental: hasta 15 % por clics con al menos cinco clics y 50 impresiones; hasta 10 % por sesiones con al menos diez sesiones, normalizados logarítmicamente entre los productos verificados observados. Suma máxima 25 %. No es un coeficiente aprendido ni mide efecto publicitario. Las señales de mayor número de clics usan base anterior de cinco y aumento descriptivo sobre 20 %; la regla de revisar presentación en búsqueda usa 100 impresiones y CTR hasta 2 %, sin presentarse como estándar universal de rendimiento. No hay castigo por ausencia de métricas. La proyección de unidades y su validación retrospectiva siguen siendo exclusivamente de ventas.

Cada propuesta conserva métricas actuales y anteriores, fuentes, propiedades, IDs de reporte, fechas de lectura, límites, zonas horarias, factor de prioridad y ventas Bsale en el mismo tramo de 28 días si existe cobertura. No se calcula una conversión mezclando sesiones con compras de Bsale. El resumen muestra cobertura de producto y cantidad de seleccionados con señales. La nueva versión del calendario no reemplaza la evidencia de versiones guardadas anteriormente; la huella incluye método y lecturas de Google.

Validación real: 28/09–25/10/2026 frente a 31/08–27/09/2026. Analytics leyó 1.284 páginas y conservó 24 verificadas; Search Console leyó 1.441 y conservó 24. Se comprobaron 26 productos vinculados y 24 con métricas actuales observadas. El cálculo sobre la base de ventas auditada produjo 52 espacios y 29 productos, seis con señales editoriales verificadas. Ejemplo CD-7: sesiones 60 frente a 40; clics 38 frente a 35; impresiones 1.900 frente a 1.075; CTR 2 % frente a 3,26 %. Estas cifras no se atribuyen como ventas incrementales.

Pruebas verify-calendar-web.cjs: fechas y espera de datos, identidad exacta y URL cambiada, empresa y propiedad, ausencia frente a cero, agregación ponderada, métricas GA4 sin ecommerce, tope de lectura, lotes incompatibles, caducidad, calidad limitada y peso máximo sin alterar previsiones. verify-calendar-server.cjs se actualizó a la firma v2; siguen pasando integridad, usuario/empresa y caducidad. verify-calendar.cjs y compilación completa satisfactorios. La primera compilación falló por recursos insuficientes de Windows; con dos hilos de Rust pasó sin cambiar la configuración del proyecto. La ampliación de tipos de reporte también pasó una prueba PGlite que conserva datos y permisos. Sin despliegue ni publicaciones.


La nueva versión del 02–29/11/2026 quedó guardada como propuesta con Google: 52 espacios, 29 productos y seis seleccionados con señales verificadas. Se conservó el calendario anterior. Comprobación visual de evidencia dentro de una historia: métricas GA4 y Search Console actuales/anteriores, Bsale del mismo tramo, período anual, validación de ventas, stock y fecha; el guardado conserva los IDs de reporte y los números originales. Ninguna pieza se publicó ni se marcó como realizada.



## Selección por interés, familias y recepciones — 29/10/2026

Versión `interest-family-receipts-v3`. Conserva los calendarios anteriores y sus evidencias. Las nuevas propuestas usan el mismo catálogo Intel, ventas válidas de Bsale y autorización Google existente. No cambia Gemini, no solicita generación de texto y no publica piezas.

### Selección

- Prioridad inicial: 50 puntos de interés propio del producto, 30 de su familia, 20 de recencia de recepción y hasta 5 adicionales de respaldo anual. Las señales se normalizan logarítmicamente; son reglas editoriales para evaluar, no coeficientes aprendidos ni retorno publicitario.
- Interés propio: clics orgánicos y vistas de ficha; si faltan vistas utilizables, sesiones de entrada. Se conservan umbrales mínimos de observaciones y límites de calidad de Google.
- Familias: se agrupan tipos registrados, con cañas, carretes, señuelos y líneas identificables; se conserva el nombre del tipo para otros grupos. Solo se agregan productos permitidos y páginas cuya identidad Bsale está verificada. Se muestra cuántos productos están vinculados frente al catálogo activo de cada familia. La ausencia de una fila queda desconocida.
- Las búsquedas internas solo afectan la prioridad con al menos diez eventos asignados a familias en total y cinco en una familia; una búsqueda aislada permanece visible sin dar prioridad. La familia combina clics, vistas (o entradas cuando no hay vistas utilizables), búsquedas internas reconocidas y una señal descriptiva de crecimiento comparable. No se atribuyen métricas de familia al artículo. Un crecimiento de páginas parcialmente observadas no se interpreta como crecimiento de todo el catálogo.
- Una recepción sin historial anual solo habilita una propuesta cuando su familia tiene interés observado. Un producto puede entrar por interés propio aunque no tenga referencia anual. Los productos con referencia anual suficiente conservan una vía de respaldo explícita.
- Se reduce la repetición de familias y productos. Se mantienen dos apariciones por producto y semana, cuatro por calendario y ninguna repetición del producto el mismo día.
- Los tipos Proyectos, Deportes, Full y Fiestas Patrias siguen excluidos. Se conservan los controles de tipos desconocidos y de propuestas promocionales restringidas.

### Accesorios

Anzuelos, destorcedores/pequeños accesorios, armadas/plomos y flotadores/luz química son apoyo. También se detectan nombres que comienzan inequívocamente por destorcedor, giratorio, esmerillón, snap, grapa, anzuelo, plomo, armada o flotador, para cubrir referencias mal clasificadas. No hay un precio mínimo inventado.

Todos los accesorios comparten como máximo una historia propia por mes dentro de cada calendario. No ocupan reels, banners, emailings o blogs como protagonistas ni rellenan espacios sin productos elegibles. El límite se aplica al grupo, no a cada SKU. Editar una historia de apoyo no permite trasladarla a otro mes. Los calendarios superpuestos y las publicaciones externas no registradas todavía requieren coordinación editorial: no se afirma que esta cuota sea un consolidado de todas las publicaciones del negocio.

### Recepciones

Lee encabezados completos con efecto de stock y detalles de la misma captura. Usa cantidad positiva, variante activa y stock observado positivo en esa variante. Mantiene además el requisito de stock positivo conocido para el producto. Omite movimientos futuros y conserva fecha de Bsale expresada como fecha ISO UTC, consistente con el lector comercial existente.

La regla inicial de recencia es 30 días respecto a la lectura, visible en la pantalla. La evidencia guarda recepción, fecha, variantes y cantidad de esa recepción; no representa el saldo actual ni todas las recepciones del período. Una llegada puede ser reposición: no se presenta como producto nuevo ni se usa `first_seen_at` de una importación para afirmar novedad.

Sin referencia anual suficiente, se muestra «Sin base» en unidades y «sin proyección». Las demás propuestas conservan el método estacional y sus pruebas retrospectivas. No se asignan ventas futuras por el solo hecho de crear contenido.

### Google y cobertura

La verificación de páginas recorre el catálogo por identificador de origen, comprueba el ID Bsale incrustado y la URL canónica y conserva los conflictos sin sustituir correspondencias de otro producto. Se incorpora un botón para ampliar cobertura; los fallos quedan pendientes de revisión en URL de productos. El conjunto verificado forma parte de la firma de los reportes: después de ampliarlo se deben actualizar Google y la propuesta.

GA4 mantiene `landingPage`, `sessions` y `engagedSessions`, y añade una lectura `pagePath`/`screenPageViews` para captar navegación interna. Lee hasta 20.000 páginas ordenadas, exige total consistente y descarta las vistas incompletas, muestreadas o limitadas. Solo conserva cantidades de vistas por producto verificado como metadatos del snapshot existente; no importa URLs de navegación personal. Si esta lectura falla, queda identificada la ausencia y se conservan las entradas válidas.

El buscador interno se comprueba mediante `searchTerm` y `eventCount`, filtrado por `view_search_results`. Solo conserva cantidades por familias reconocidas sin ambigüedad, nunca términos crudos. Un término con dos familias o no reconocido no se asigna. No se infiere un producto por una palabra de marca. Se muestran eventos totales y asignados, calidad y estado de la comparación. Sin filas no significa falta de demanda ni certifica que la medición esté configurada.

Search Console sigue usando páginas, clics, impresiones, CTR y posición; no se afirma haber importado consultas textuales de Google. Conserva su cobertura parcial de filas principales. Ambos períodos comparan 28 días y terminan con tres días de espera y hasta el corte de ventas. No se suman sesiones, vistas, clics y búsquedas como si fueran personas ni se atribuyen ventas a ese tráfico.

Los nuevos datos se guardan en metadatos de reportes y evidencia de calendarios ya existentes. No hay migración de esquema ni cambios de permisos. La huella de guardado incluye las razones y evidencias editoriales para conservar cambios de recepciones y señales. El calendario sigue siendo una propuesta editable por el equipo.

### Verificación

Pruebas de cuota mensual compartida con múltiples accesorios y meses, huecos sin rellenar, prioridad de interés frente a unidades, recepción con familia interesada y sin proyección inventada, cobertura parcial, términos ambiguos y privacidad, vistas de páginas verificadas, reportes incompletos, variantes activas/stock, movimiento sin efecto y detalle de otra captura. Se mantienen pruebas de integridad firmada por empresa/usuario, caducidad, evidencia inmutable y guardado privado/atómico en PGlite. Compilación completa y revisión de archivos modificados verificadas.

### Comprobación con las fuentes reales

Se revisaron 1.218 registros web. La ejecución principal añadió 899 correspondencias verificadas y dejó 98 pendientes: 65 sin coincidencia inequívoca del ID, 28 sin página vigente verificable y cinco agotaron el tiempo de respuesta. Sumando lo ya verificado y los lotes iniciales, el calendario dispone de 966 productos con página verificada. Las páginas pendientes no se enlazaron por parecido de nombres.

Google actualizado: 29/09–26/10/2026 frente a 01/09–28/09/2026. GA4 conservó 838 páginas de entrada actuales y 770 anteriores; las vistas de fichas se observaron para 947 productos actuales y 888 anteriores. Search Console conservó 945 páginas actuales y 910 anteriores. Se mantiene la zona Pacific/Easter de Analytics y America/Los_Angeles de Search Console.

El buscador interno registró siete eventos actuales y dos anteriores; solo uno actual se asignó a Carretes. No cumple el mínimo editorial, de modo que esos datos no dan prioridad a una familia. Es una base pequeña: no se interpreta como el volumen real total de búsquedas ni se certifica la instrumentación completa.

Intel: 9.388 encabezados de recepciones, 29.907 detalles, 4.328 movimientos completos con efecto de stock y cero líneas inválidas detectadas en los movimientos elegibles de la lectura. La revisión inicial identificó 92 productos activos con recepción reciente y stock antes de las exclusiones editoriales. El corte de ventas verificado se mantiene en 26/10/2026.

Validación final guardada el 29/10/2026: calendario f4a11934-a924-4527-8303-1bd28adc7fa0, período 02–29/11/2026, 52 propuestas para 52 productos, todos con señales de Google, tres con recepción reciente y una historia de accesorios en noviembre. Cero piezas revisadas o realizadas. Catorce piezas con referencia anual suficiente y 38 sin proyección de unidades. Se comprobó el guardado real y la restricción mensual; la captura calendario-demanda-guardado.png conserva el resultado visible. Los calendarios anteriores permanecen disponibles.
## Registro editorial y rotación — 29/10/2026

Versión `interest-family-rotation-v4`. Reutiliza las tablas privadas de calendarios, entradas, ideas y publicaciones. No cambia el esquema ni los permisos. Conserva los calendarios guardados con su evidencia original y aplica la nueva selección a las propuestas nuevas.

### Qué se registra y cómo se usa

El registro consulta producto, fecha, formato, título, enfoque clasificado, familia, estado y origen. Diferencia borrador, revisado/programado, realizado en calendario, publicación registrada y omitido. Las publicaciones se identifican por su idea y producto; su fecha se interpreta en America/Santiago y se ignoran registros de publicación con fecha futura. «Realizado en calendario» usa la fecha del calendario, no una fecha de publicación comprobada automáticamente.

Las versiones alternativas que contienen el mismo producto, formato y fecha no multiplican la penalización de borradores. Prevalece el estado más confirmado y, a igual estado, la actualización más reciente. Los registros reales de publicación mantienen su identidad. Los omitidos no impiden proponer nuevamente.

Valores iniciales configurables en la pantalla:

- Descanso del producto: siete días; alternativas 14 o 28.
- Descanso del mismo enfoque: 28 días; alternativas 42 o 56.
- Una guía de la misma familia y enfoque respeta también el segundo descanso, aunque use otro producto.
- La cuota mensual de accesorios considera los espacios revisados, realizados o publicados de otros calendarios cuyo rol de accesorio es identificable, además de la cuota de la propuesta nueva.

Los borradores solo reducen prioridad (35 %, o 50 % para otra pieza de accesorios en el mismo mes); no se presentan como contenido ejecutado ni bloquean definitivamente el catálogo. Los revisados, realizados y publicados impiden repeticiones dentro del descanso. Se aplica la misma separación a los espacios elegidos dentro de la nueva propuesta.

Se utilizan enfoques explícitos: elección, uso/demostración, cuidado, variantes, comparación, selección, destacado y llegada/reposición. Cambiar de formato no libera el mismo enfoque. Un enfoque diferente puede usarse después del descanso del producto. Los títulos y las instrucciones editoriales varían según el enfoque; siguen siendo borradores que requieren fichas e instrucciones verificadas, sin inventar prestaciones. No se consulta a Gemini.

Las versiones antiguas no tienen enfoque clasificado. Se conserva esa ausencia y se controla producto/formato como respaldo, sin afirmar que se analizó semánticamente su texto. Las publicaciones externas no registradas no pueden participar en la rotación. Una publicación vinculada a una idea y un calendario realizado pueden representar el mismo contenido sin un vínculo explícito entre ambas entidades; no se deduce esa identidad por parecido de textos.

### Pantalla y controles

El panel «Registro de contenido y rotación» permite buscar producto, ID, tema o familia, filtrar por estado y abrir el calendario de origen o la URL de una publicación. Se consulta una ventana de 90 días previos y 168 futuros, explícita en pantalla, con paginación de resultados. Esta vista no significa que todo lo que aparece se haya publicado.

Las propuestas muestran la política aplicada, cantidad de registros considerados, diferencias entre borradores y confirmados, ejemplos de repeticiones evitadas y otra aparición previa del producto, cuando exista. Cada pieza conserva enfoque y evidencia de rotación firmados junto con su evidencia comercial.

La lectura usada al proponer abarca todo el descanso y los meses completos de los extremos, para no omitir una reserva de accesorios del primer día de un mes. Se comprueba nuevamente el registro al guardar una propuesta y al reservar una entrada como revisada. Si apareció un conflicto confirmado, se pide generar la propuesta nuevamente o revisar esa reserva. Marcar realizada registra un hecho declarado por el equipo; no se impide registrar una ejecución real por el solo hecho de que hubiera otra pieza semejante.

Las consultas filtran siempre por empresa, seleccionan campos concretos, usan paginación por ID y rechazan muestras de más de 10.000 filas. Una falla al consultar el historial impide prometer una propuesta con rotación comprobada. No se certifica reserva concurrente transaccional entre dos solicitudes simultáneas: la lectura y el guardado siguen siendo operaciones separadas. La revisión del equipo sigue siendo necesaria.

### Validación

Pruebas de descansos entre calendarios y dentro de uno, límite exacto de siete/28 días, cambio de formato con mismo enfoque, nuevo enfoque elegible, guías de familia, cuota mensual compartida de accesorios, meses completos, borradores alternativos, omitidos, versiones sin enfoque, publicaciones con zona horaria, exclusión de fechas futuras, alcance por empresa y revalidación antes de guardar cuando el registro cambió. Se mantuvieron las pruebas de ventas, stock, recepciones, Google, firma, caducidad y guardado. TypeScript, lint y compilación completa verificados.

Auditoría real inicial: 131 registros consolidados, todos en borrador; cero revisados, realizados o publicaciones registradas. Una prueba de cuatro semanas produjo 52 espacios y 52 productos sin pendientes, usando esos borradores como penalización y variando los enfoques. No se aprobaron piezas ni se simularon publicaciones para probar el sistema.


Comprobación final: calendario cd630bbc-51a6-4432-b72b-3b9cfab228dd guardado como borradores con la versión interest-family-rotation-v4. Período 02–29/11/2026: 52 piezas, 52 productos, ocho enfoques editoriales, 131 registros anteriores considerados, cero confirmados. La auditoría verificó descansos entre productos y enfoques dentro del calendario y la presencia de evidencia de rotación en cada pieza. No se marcaron piezas como revisadas o realizadas.
## Banners de colección — 29/10/2026

Versión `collection-banners-v5`. Los banners nuevos son campañas de varios productos. Un espacio sin una selección elegible de al menos dos productos queda pendiente; no se sustituye por una ficha individual. Se conservan las versiones anteriores y su evidencia original, identificadas en la pantalla como banners individuales antiguos. No se pueden reservar como revisados para una campaña nueva de colección.

### Composición y selección

Se seleccionan de dos a seis ID de producto distintos, activos, con stock positivo conocido y ficha web registrada. Conservan los requisitos comerciales del calendario: interés propio, recepción reciente dentro de una familia con interés o referencia anual suficiente. Los accesorios pequeños y los tipos excluidos no entran en los banners.

Las marcas provienen de campos de Intel/Bsale y del catálogo web, comprobando la concordancia del ID; nunca se adivinan desde palabras del nombre. Se prefiere una campaña de marca y familia. Las chaquetas y parkas se separan expresamente del resto de la indumentaria por su denominación, para que «Chaquetas Grundens» no mezcle indiscriminadamente poleras o jardineras. Sin una marca agrupable se permite una selección de la misma familia y colección observada, con varios productos. Una colección con todos sus miembros de la misma marca no se usa para eludir el descanso de esa campaña de marca.

Se ordenan los productos de la cohorte dando prioridad a las recepciones recientes y al interés comercial individual. El puntaje de grupo parte del promedio de sus seis primeros candidatos, suma hasta 0,25 por proporción de recepciones recientes y 0,12 cuando hay marca identificada. Las marcas elegibles tienen preferencia sobre el fallback genérico. Son reglas editoriales iniciales. «Recepciones recientes» como enfoque de campaña exige al menos dos productos recibidos recientemente dentro de la selección final; no significa novedad ni que todos los integrantes hayan llegado juntos.

La evidencia incluye todos los productos, sus nombres/ID/marca/familia, stock y fecha, recepción si existe, referencia semanal individual cuando tiene base y métricas/IDs de reporte de Google. No se suman proyecciones, vistas ni clics para afirmar ventas futuras atribuibles al banner. La cantidad del calendario cuenta una pieza y todos sus productos distintos.

### Destino

El destino se obtiene de slugs reales guardados de marca o colección. Se admiten únicamente páginas HTTPS `/brand/…` o `/collection/…` de dmultisport.cl, sin credenciales, parámetros o destinos externos. Antes de firmar la propuesta se consulta el destino: debe responder como HTML vigente, conservar el nombre esperado en el encabezado y una URL canónica coherente. Las redirecciones no pueden cambiar a otra ruta o sitio. Si no se comprueba, el destino queda pendiente y sin enlace utilizable; no se inventa un enlace ni se usa una ficha individual.

Un catálogo de marca puede incluir otras familias, además de los productos del banner. Esto se indica en la propuesta; no se presenta como una colección exclusiva de los modelos seleccionados. No se crean ni se publican colecciones en Bsale. Se comprobaron directamente los catálogos públicos Penn y Grundens; ambos destinos respondieron y coincidieron con sus nombres y URL canónica.

### Registro, descanso y almacenamiento

La selección completa cuenta al programar y revisar descansos. Se incorpora una clave estable por marca/familia, o por colección/familia: cambiar modelos no permite repetir la misma campaña semanalmente. Esta clave usa el descanso configurado para el mismo enfoque (28 días por defecto), además del descanso individual de cada producto.

Cada integrante se incorpora al registro, con el calendario y campaña de origen. La tabla conserva ID de fila original para que al revisar un banner no entre en conflicto consigo mismo; las referencias de cada producto tienen identidad propia en la vista. Los borradores siguen reduciendo prioridad, los revisados/realizados/publicados bloquean según las reglas existentes y los omitidos no bloquean. Guardar y revisar comprueba todos los miembros, no solo el producto de referencia.

Se reutiliza la evidencia JSON privada del calendario. La columna de producto anterior conserva un integrante de referencia para compatibilidad; la interfaz y las verificaciones usan la selección completa. No hay cambios de esquema, permisos, credenciales, Gemini ni publicaciones automáticas. La selección y el destino verificado forman parte de la firma y de la huella de guardado.

### Validación

Pruebas de mínimo de dos productos distintos, exclusión de stock cero/accesorios, marca por ID, fallback de colección, descanso de campaña con modelos distintos, registro de integrantes secundarios, URL segura, canónica/nombre y rechazo de una ficha individual o sitio externo. Se verificó también el bloqueo de guardado cuando un integrante secundario aparece en un registro confirmado después de generarse la propuesta. La prueba de prioridad individual pasó a un reel: los banners ya no son individuales. Se mantienen las pruebas de fechas, ventas, stock, recepciones, Google, rotación e integridad de evidencias.

La aplicación se realizó con una lista explícita de diez archivos del calendario y comprobación de sus versiones, preservando cambios concurrentes y archivos ajenos al módulo.


Validación real final: calendario b859f01c-e41a-4f53-8b4b-9280ff0be6f6 guardado como borradores para 02–29/11/2026. Tiene 52 piezas y 64 productos distintos. Sus cuatro banners incluyen 16 productos (2 Bad Fish, 6 Rapala, 6 Shimano y 2 Kirei Elements), todos con stock observado positivo y destinos de marca comprobados. Ningún banner individual ni pendiente. Se verificó la presencia de los 16 integrantes en el registro, vinculados a cuatro campañas y a sus entradas originales. Cero piezas marcadas como revisadas o realizadas. Compilación completa, tipos, revisión de archivos y pruebas satisfactorios.
