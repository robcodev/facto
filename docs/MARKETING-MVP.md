# Marketing · Ideas, publicaciones y medición

Código implementado localmente, no publicado desde este trabajo. Migración de Marketing aplicada el 26/10/2026 al proyecto dkwnwasybqaohtwgaelq desde su editor SQL autenticado.
Sustituye la prueba exclusivamente temporal por guardado explícito de ideas elegidas.
La exploración continúa usando lecturas acotadas de Intel, sin depender del guardado.

## Qué se conserva

- marketing_ideas: contenido editable y pequeña instantánea de evidencia. IDs originales
  de producto/variante Bsale, sin copiar catálogo ni documentos completos.
- marketing_publications: pieza publicada manualmente, destino, fecha y UTM para medir.
- marketing_results: gasto/resultados declarados por publicación y período, con moneda
  y criterio de atribución. Desconocido se conserva null; no equivale a cero.
- intel_web_reports: reportes agregados GA4/Search Console. Una versión actual por
  fuente, propiedad, tipo e intervalo. Reconsultar sustituye el reporte de ese intervalo;
  no multiplica sus cifras ni crea un respaldo de Bsale. Hasta 1.000 filas por reporte.
- marketing_product_links: correspondencias verificadas entre producto y ruta/URL.

Todas las tablas llevan empresa, RLS y permisos privados de servidor. Relaciones
compuestas impiden vincular ideas/publicaciones de otra empresa. El acceso del equipo
sigue la política temporal compartida de Facto; no se afirma multiempresa completo.

Los borradores generados llevan firma de su evidencia y empresa/usuario; el servidor
la comprueba al guardar. El contenido se puede editar. El trigger de base impide
sustituir evidencia, identidad y procedencia. Las ideas guardadas se abren paginadas
sin volver a usar IA; ediciones simultáneas se comprueban por updated_at.

## Google y análisis

Propiedades confirmadas: GA4 489006527 y sc-domain:dmultisport.cl. Aún sin conexión
real: faltan credenciales de la cuenta de servicio en el servidor.

Consultas manuales preparadas:
- GA4: sesiones, sesiones con interacción, eventos purchase e ingresos registrados,
  por fecha y UTM manuales, o por fecha y página de entrada (sin parámetros de consulta).
- Search Console: clics, impresiones, CTR y posición por fecha/página, búsqueda web
  con datos finales. Sin consultas de búsqueda personales ni datos a nivel usuario.

Las publicaciones se cruzan con GA4 solo si coinciden exactamente utm_source,
utm_medium, utm_campaign y utm_content y el período del reporte. Sin coincidencia
se muestra ausencia de vínculo, no cero ventas. El gasto manual y atribución declarada
se mantienen separados. El etiquetado automático de Ads no se sustituye por supuestos.

Las señales web pueden enriquecer una oportunidad de producto solo con una
correspondencia verificada y un reporte del mismo intervalo. No se unen productos
por nombre o SKU. La versión inicial no genera oportunidades exclusivamente de
Google ni altera la importación histórica de ventas.

Se conservan zona horaria, moneda, fecha de lectura, truncamiento, umbrales y muestreo.
Search Console devuelve filas principales y no garantiza exhaustividad; usa días de
America/Los_Angeles. GA4 conserva su propia zona horaria. No comparar días de fuentes
distintas como si fueran idénticos sin revisar estos límites.

No sumar ventas Bsale, compras GA4 y conversiones de plataformas como ventas diferentes.
No sumar reportes de campañas y páginas: son vistas del mismo tráfico. No inferir gasto
publicitario a partir de clics. ROAS declarado no mide causalidad ni margen. Las compras
cero de GA4 tampoco certifican una implementación correcta de ecommerce.

## Operación y pendientes

- Guardar es explícito; no se vuelve a llamar al modelo al editar o abrir guardadas.
- Generar hasta 5 ideas por acción; no hay automatizaciones ni publicaciones.
- La IA recibe únicamente productos/evidencia agregada y hechos técnicos aprobados.
- Explorar: hasta 100 recepciones y 300 documentos, con advertencias y bloqueo por límites,
  cobertura, ajustes y detalles inválidos; máximo 15 candidatos por señal.
- Migración aplicada y verificada en Supabase desde su sesión web. La CLI sigue sin sesión. No se editó el entorno ni se desplegó en Vercel.
- Google pendiente de configurar cuenta de servicio existente y verificar accesos.
- Gasto API de Meta Ads/Google Ads no implementado; registro manual disponible en código.
- Validación visual completa con sesión y fuentes reales queda pendiente de esos accesos.

## Pruebas

- verify.mjs y verify-core.mjs: reglas, cobertura, lecturas acotadas y advertencias.
- verify-generation.mjs: generación simulada, no escritura automática, evidencia firmada.
- verify-storage.mjs con PGlite: esquema, inmutabilidad, edición, empresa, moneda, null,
  upsert de reportes sin duplicación, límites y privilegios privados.
- verify-google.mjs: parsers, CTR/posición ponderados, datos desconocidos, UTM exactas,
  truncamiento/umbrales y rechazo de evidencia alterada.
- TypeScript, ESLint y compilación completa de Next.js.

Accesos y referencias oficiales en MARKETING-ACCESOS.md. No se ejecutaron consultas
reales GA4/GSC ni se transmitieron nuevos datos a Gemini durante esta ampliación.

## Verificación de activación del 26/10/2026

- Proyecto confirmado: dkwnwasybqaohtwgaelq.
- Cinco tablas nuevas: marketing_ideas, marketing_publications, marketing_results, marketing_product_links, intel_web_reports.
- RLS activo en todas; sin SELECT directo para anon/authenticated. Servidor autorizado para SELECT/INSERT/UPDATE.
- El servidor REST de Facto pudo leer las cinco tablas y confirmó cero registros. Acceso anónimo a marketing_ideas denegado con 42501.
- No se insertaron pruebas en producción ni se modificaron Intel o Bsale. El código de la aplicación no se desplegó.
- Se recibió ranireto@gmail.com; falta confirmar si es el usuario Google en lugar de una cuenta de servicio. Google Analytics/Search Console aún no conectados.

## MVP de ventas: prueba del 27/10/2026

Marketing inicia vacío con intervalo sugerido de 14 días cerrados. Lectura de documentos paginada en 500, máximo 10.000 por consulta; detalles en lotes de 100 padres y máximo 20.000 líneas totales, enlazados por ID y corrida. Exceder límites falla explícitamente, sin presentar una muestra como período completo. No se modificaron datos de Intel ni Bsale.

Prueba real 13–26/10/2026: 538 documentos, 521 ventas finales activas, 10 notas de crédito/débito y cero anulados. Cotizaciones y guías no aportan unidades de venta. Cobertura por conteo verificada, sin líneas inválidas ni ventas finales incompletas. 29 candidatos, con máximo 15 variantes por señal; no es ranking completo por producto. Una variante sin referencia de catálogo se excluyó.

Las unidades son brutas, no descuentan notas de crédito/devoluciones; no usarlas como ventas netas, rentabilidad o crecimiento. Se mantiene bloqueo ante ventas finales activas incompletas, cobertura faltante o líneas inválidas. No generar automáticamente ideas ni publicar. Google solo aporta evidencia de períodos idénticos y correspondencias verificadas; las URL auditadas siguen siendo propuestas. No se desplegó a producción.

## Análisis de oportunidades con IA · 27/10/2026

- Acción manual dentro de «Qué comunicar y por qué», separada de señales calculadas y del generador de borradores.
- Resumen de hasta 30 candidatos actuales, agrupados por producto y variantes observadas; la selección de Intel sigue limitada a 15 variantes por señal. No extrapolar al catálogo completo.
- Comparación de la misma duración con el período inmediatamente anterior y con una ventana equivalente terminada un año antes. Si el intervalo es de 28 días, el anterior también tiene 28. Sin cobertura válida se devuelve null, nunca cero supuesto. Variación porcentual desconocida con base cero. Cantidades absolutas acompañan las diferencias.
- Se resumen unidades brutas, documentos, mayor cantidad en un documento y su proporción; no se identifican compradores ni clientes recurrentes. No se calculan ventas netas, importes ni rentabilidad. La concentración requiere revisión; no equivale automáticamente a una compra excepcional.
- SKU y referencias del catálogo se consultan en Intel; características solo si fueron aceptadas en investigación aprobada. Se conserva contexto limitado de las últimas 30 ideas/publicaciones en 60 días. Google solo entra con correspondencia verificada y el mismo período. Identificador de artículo GA4 pendiente. No se consultó Bsale ni se amplió la validación de Analytics.
- JSON estructurado de Gemini, validación Zod en servidor, productos únicos y existentes, referencias restringidas al producto y rechazo de propuesta comercial sin habilitación. Modelo revisor verifica afirmaciones contra el mismo resumen; una revisión fallida no guarda la respuesta. La revisión de IA no sustituye la revisión humana.
- Prompt marketing-analysis-v2. La versión v1 de prueba no superó revisión humana por inferencias técnicas indebidas y queda excluida de recuperación y desarrollo de borradores.
- Con las URL aún pendientes de validación vigente, commercialAllowed=false y solo se admiten propuestas educativas.
- Tabla privada marketing_analyses, migración aditiva 20261027151158_marketing_opportunity_analyses.sql aplicada desde el editor SQL al Supabase existente. RLS; anon/authenticated sin acceso; service_role solo SELECT/INSERT. Snapshot limitado a 220 KB y respuesta a 100 KB en SQL; entrada a Gemini limitada a 180 KB. No se almacena la respuesta cruda de la API ni se duplican boletas, clientes o fichas completas.
- Se puede recuperar el último análisis del período sin otra llamada a Gemini. Elegir una recomendación selecciona una variante de su muestra; todavía exige pulsar Generar ideas. El generador consulta el análisis guardado por empresa y período para conservar su enfoque.
- No hay publicación, cambios de precio, integración de gasto ni despliegue.

Pruebas: verify-analysis.cjs (comparaciones, no duplicación por variante, IDs inventados/ajenos, restricción comercial, esquema SQL/ACL en PGlite) y verify-analysis-server.cjs (persistencia compacta, períodos equivalentes, rechazo antes de guardar, revisión desfavorable, almacenamiento no disponible). Las pruebas previas de lector, contenido, generación y Google también pasan.

### Ajustes de la prueba integrada

Se simplificó el JSON Schema enviado a Gemini para compatibilidad, conservando en Zod los límites estrictos del servidor. La salida del piloto solicita hasta tres prioridades y cinco pospuestos (el contrato admite hasta diez). Cada análisis utiliza una generación y una revisión de afirmaciones. Las fallas de formato, referencia, revisión y proveedor se comunican por separado y conservan el trabajo anterior. Se bloquearon en recuperación y desarrollo los análisis de la primera versión de prueba.

### Resultado verificado del piloto

El análisis real marketing-analysis-v2 del 13–26/10/2026 produjo tres prioridades y quedó guardado después de la revisión correctiva. Resumen de evidencia: 57.687 bytes JSON; recomendación: 5.774 bytes JSON, sin copiar documentos originales. Se comprobó su recuperación sin llamar otra vez a Gemini y la selección de una recomendación habilitó el generador existente sin ejecutarlo automáticamente. Los errores anteriores de proveedor/esquema/revisión no guardaron respuestas incompletas. El registro v1 de prueba se conserva excluido del flujo; no se borraron datos.

Permisos remotos comprobados por SQL: marketing_analyses con RLS=true, lectura anon=false, authenticated=false, inserción service_role=true. Compilación de producción local exitosa; no desplegada. Gemini mantiene el mismo modelo y credenciales; el analizador usa nivel de razonamiento LOW y presupuesto suficiente para evitar JSON truncado, según la documentación oficial de thinking. No se cambió la configuración del generador existente.

## URL verificadas y selección por producto · 27/10/2026

Este estado sustituye los límites y pendientes descritos en las pruebas históricas anteriores. La conexión Google funciona mediante OAuth de usuario; no necesita una cuenta de servicio. Las propiedades siguen siendo GA4 489006527 y Search Console sc-domain:dmultisport.cl. Gemini conserva sus credenciales y modelo existentes.

### Correspondencias verificadas

- Nuevo panel manual «URL de productos y correspondencias con Google», disponible en Medición y fuentes y en Qué comunicar y por qué. Permite revisar el catálogo y verificar las URL de la selección actual en lotes de cinco.
- La página pública debe responder correctamente y acreditar el mismo ID de producto Bsale en su objeto principal y la URL canónica exacta. El ID de tienda y los IDs de JSON-LD no se confunden con Bsale ni con artículos de compra GA4. No se ejecuta código de la página ni se guarda su HTML.
- Solo se aceptan páginas HTTPS de producto de dmultisport.cl/www.dmultisport.cl. Redirecciones limitadas al mismo camino y esos dominios; controles de tiempo y tamaño. Se rechazan ambigüedades y correspondencias existentes con otro producto antes de escribir. No hay sustitución automática por nombre o SKU.
- Migración aditiva 20261027185929_marketing_link_verification.sql aplicada al Supabase existente: prueba compacta JSON de hasta 4 KB en marketing_product_links. Se mantienen RLS y acceso exclusivo mediante servidor autorizado. Los vínculos antiguos sin prueba quedan pendientes.
- Comprobación real: 26 productos con URL verificada en el catálogo. En la selección de esta quincena: 21 verificados, cero pendientes con URL y ocho sin URL disponible. El resto del catálogo no se declara verificado.
- Se importaron manualmente páginas de entrada GA4 y páginas de Search Console del 13–26/10/2026. Quince productos seleccionados tienen evidencia web. Los reportes conservan avisos de parcialidad y sus zonas horarias; no representan necesariamente el total de tráfico.
- En evidencia por producto, GA4 aporta solo sesiones por página de entrada. Compras e ingresos no se asignan a artículos hasta validar su identificador. Los reportes de Google se agregan una vez por producto, sin multiplicarlos por sus variantes ni cruzar consultas con ventas individuales.

### Ventas completas de cada producto seleccionado

- Se agregan todas las variantes con movimiento y referencia de producto antes de seleccionar. Hasta 20 productos se priorizan por movimiento repartido entre documentos y hasta 10 por recepción reciente; se incluyen todas sus variantes con movimiento. Se mantiene el límite explícito de 100 recepciones.
- Cada documento aporta una sola vez al conteo del producto, aunque tenga varias variantes. Se muestran unidades brutas, documentos distintos, mayor cantidad en un documento, porcentaje y unidades de los demás documentos. Un documento único o al menos 50 % de unidades en el mayor activa una alerta de concentración para revisión; no demuestra una compra excepcional ni compradores distintos.
- La disponibilidad agregada requiere observaciones de todas las variantes activas del producto; si faltan, queda desconocida. El stock observado no reconstruye el pasado ni garantiza disponibilidad operativa.
- Prueba real del 13–26/10/2026: 538 documentos leídos, 521 ventas finales activas, 10 notas de crédito/débito separadas, 435 productos evaluados, 29 seleccionados, 107 entradas de variante/señal y cero variantes vendidas sin correspondencia de producto. Estos resultados sustituyen la muestra anterior de 15 variantes por señal.
- Silverside: 32 unidades brutas en 29 documentos, mayor documento de dos unidades (6,25 %), 30 unidades en los demás. Armada Pejerrey: 107 unidades brutas en 14 documentos, mayor de 30 (28,04 %), 77 en los demás. Las diferencias frente a la prueba anterior corrigen el alcance del agregado; no indican crecimiento.
- Las comparaciones históricas también agregan todas las variantes con movimiento identificadas, incluso si hoy no están activas. Sin cobertura o referencias completas se conserva desconocido, sin suponer cero.
- Prompt marketing-analysis-v3 y reglas marketing-signals-v2-products. Los análisis antiguos se conservan pero quedan fuera de recuperación y desarrollo del nuevo flujo. La recomendación comercial exige una variante con URL verificada y stock positivo, ambos observados dentro de 24 horas, además de un período reciente; no autoriza promociones ni publicación.
- Evidencia base medida con productos y señales web: 116.084 bytes JSON, por debajo del límite de entrada de 180 KB; el servidor comprueba nuevamente el tamaño del resumen completo. No se duplican documentos ni clientes en el análisis.

Pruebas: lector (incluye más de 15 variantes por producto y concentración), identidad pública, almacenamiento y conflictos, migración en PGlite, evidencia Google sin duplicación, análisis y generación simulados. TypeScript, ESLint y compilación completa de producción local correctos. Comprobación visual con la sesión real de Facto. No se volvió a llamar a Gemini durante estos dos ajustes. Código preparado y probado localmente; no desplegado.

## Recomendaciones exigentes y pantalla resumida · 27/10/2026

Puntos 3 y 4 de la propuesta de mejora, implementados sobre el flujo existente.

- Contrato marketing-analysis-v4: de cero a tres recomendaciones, con motivo para elegir el producto, motivo temporal y comparación explícita con otra oportunidad real. La alternativa debe pertenecer al resumen y citar su propia evidencia; no puede contradecir una prioridad superior. Solo se admite ausencia de alternativa cuando el resumen tiene un único producto.
- Motivos calculados por Facto: ventas repartidas entre documentos, clics de Search Console hacia una página verificada, recepción documentada del período o aumento de unidades brutas con comparación cubierta. Disponer de una señal permite evaluar una oportunidad; no obliga a recomendarla. Stock por sí solo, tráfico genérico o una compra concentrada no justifican llenar los cupos.
- El servidor comprueba los motivos y referencias tanto antes como después de la revisión de IA. La revisión exige una ventaja concreta frente a la alternativa, puede corregir el orden o eliminar propuestas y conserva la posibilidad de devolver cero. Las hipótesis de audiencia, características no verificadas y ventas brutas mantienen sus restricciones.
- Pantalla: recomendaciones primero, cantidades y comparación anterior en tarjetas, casillas para elegir varias prioridades, una barra común para seleccionar formato y generar borradores. Evidencia propia y de la alternativa, limitaciones, comparación anual y versión quedan desplegables. El catálogo de señales, verificación de URL y selección manual por variantes también se conservan desplegables.
- Al añadir una segunda prioridad se conserva la primera y el formato elegido. Se mantiene una variante por recomendación; el generador vuelve a comprobar su elegibilidad comercial. La selección manual inicia un conjunto independiente y la consulta de otro período limpia la selección. Un error de análisis conserva el resultado previo en pantalla.
- Sin cambio de esquema ni nueva migración. Se reutiliza marketing_analyses con su resumen compacto y controles existentes. Los análisis anteriores se conservan; la recuperación del nuevo flujo filtra por la nueva versión.
- Pruebas automáticas: cero recomendaciones, máximo tres, motivos sin respaldo, alternativas ajenas o inválidas, referencias y cobertura, revisiones rechazadas sin inserción, guardado de resultado vacío y dos borradores con enfoques propios del mismo análisis. TypeScript, ESLint y compilación local correctos. Selección manual de dos productos comprobada visualmente sin generar contenido.

La primera prueba real llegó a revisión y falló sin guardar. Se diferenciaron errores de evidencia, formato y conexión/tiempo de respuesta. El propietario autorizó explícitamente el resumen agregado de los 29 productos y su revisión con Google Gemini. La prueba posterior completó la revisión y guardó tres recomendaciones marketing-analysis-v4 del 13–26/10/2026. Se comprobó almacenamiento compacto (141.035 bytes de evidencia; resultados de aproximadamente 6–7 KB), recuperación desde la interfaz y selección simultánea de dos oportunidades con su análisis vinculado. Recuperar el mismo análisis conserva las selecciones; recuperar otro las limpia para no mezclar contextos. No se generaron borradores durante esta comprobación. La presentación conserva los porcentajes en las métricas calculadas y retira porcentajes del texto de IA; los nombres internos se convierten en lenguaje legible. La revisión editorial humana sigue siendo necesaria. Verificación final el 28/10/2026; no desplegado.

