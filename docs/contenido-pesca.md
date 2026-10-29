# Multisport — plantilla de contenido basada en datos

Estado: especificación y plantilla reutilizable; no implementa sincronización, generación ni publicación. Fecha: 15 de octubre de 2026.

## 1. Alcance

Generar semanalmente ideas priorizadas de productos de pesca, siete historias (una por día) y briefs de video. Coordinar Instagram, Facebook y banners mediante un mismo tema, producto, oferta y vigencia. Email y blog quedan disponibles como formatos, fuera de la producción inicial.

La IA propone; un responsable revisa y aprueba. No hay publicación automática. Caza y traumáticas quedan excluidas mediante una clasificación explícita de categorías de Bsale. Los productos sin clasificación quedan pendientes de revisión.

Objetivos de capacidad: una historia diaria, al menos dos videos grabados mensualmente y capacidad de edición de cinco videos semanales. No asumir que dos videos equivalen a dos jornadas. Registrar material disponible y separar grabaciones nuevas de piezas derivadas. Si falta material, mostrar la brecha, sin inventar capacidad ni completar cupos con briefs inviables.

## 2. Campos independientes

| Campo | Valores permitidos |
| --- | --- |
| Motivo | temporada, novedad, reposición, buenas ventas, búsquedas crecientes, mucho stock, baja rotación, consulta frecuente, campaña, fecha relevante |
| Tipo | guía, demostración, comparación, recomendación, pregunta frecuente, novedad, reposición, promoción, historia de marca |
| Formato | historia, reel, video, carrusel, fotografía, banner, blog, email |
| Objetivo | venta, alcance, educación, interacción, tráfico, lanzamiento, liquidación, fidelización |

Cada pieza tiene un motivo principal, un tipo, un formato y un objetivo principal. Puede incorporar señales secundarias. Cada adaptación es una pieza vinculada al mismo tema; por ejemplo, una reposición puede originar una historia y un banner con objetivos distintos.

## 3. Datos que alimentan el sistema

| Fuente | Datos necesarios | Uso | Actualización propuesta |
| --- | --- | --- | --- |
| Bsale: catálogo | Identificadores de producto y variante, SKU, marca, tipo, colecciones, estado, enlace web | Clasificar pesca y vincular piezas con productos reales | Diaria |
| Bsale: ventas | Documento y línea, fecha, variante, unidades, importe, descuentos, estado y devoluciones | Demanda reciente, rotación y comparación estacional | Historial inicial de dos años; luego diaria |
| Bsale: stock y precios | Variante, sucursal habilitada, disponible, precio vigente y condiciones | Elegibilidad y exactitud comercial | Antes de generar; confirmar antes de aprobar/publicar |
| GA4 | Fecha, identificador de producto, vistas, sesiones, fuente y conversiones disponibles | Interés y tráfico | Diaria, cuando esté conectado |
| Search Console | Fecha, consulta, página, país, dispositivo, impresiones, clics, CTR y posición | Búsquedas y oportunidades editoriales | Diaria, cuando esté conectado |
| Trends | Término, ubicación, período, interés relativo y fecha de extracción | Contexto estacional | Opcional; manual si no existe acceso autorizado |
| Manual | Pregunta, frecuencia, fecha, producto, novedades, reposiciones confirmadas, calendario y material | Necesidades reales y viabilidad | Semanal |
| Redes | Identificador de pieza, formato, fecha, alcance, reproducciones, respuestas, guardados, clics y atribución disponible | Aprendizaje por tema y formato | Semanal |

Estas frecuencias son propuestas operativas, no integraciones existentes. Cada fuente muestra conexión, cobertura y última actualización. Una fuente ausente no equivale a cero interés o cero ventas. No presentar alcance como ventas atribuibles.

No importar datos personales de clientes para esta primera versión: bastan ventas por producto y consultas anonimizadas. Conciliar identificadores de Bsale con los de GA4 y URLs de Search Console; no unir productos solamente por nombre. Las consultas de búsqueda aportan señales temáticas y no siempre pueden atribuirse a un SKU.

## 4. Historial y actualización incremental

Importar inicialmente dos años de ventas por ventanas de fecha, con paginación y avance persistido. Procesar fuera de la apertura de la aplicación y permitir reanudar una carga interrumpida. Identificar líneas con claves estables de Bsale para que repetir una página no duplique ventas.

Antes de implementar, verificar los filtros, fechas de modificación, paginación y límites realmente disponibles en la API. Si no hay filtro fiable de modificación, usar ventanas solapadas y reconciliaciones periódicas. Incluir documentos corregidos, anulaciones y devoluciones; no sumar pedidos web y sus documentos de venta como dos ventas.

Guardar avance por fuente, estado de ejecución, cobertura temporal, registros procesados, errores y última ejecución exitosa. Avanzar el cursor solamente después de persistir correctamente el lote. Si una fuente falla, conservar la última información válida y mostrar su antigüedad.

Separar ventas históricas de fotografías de stock. No deducir stock pasado desde el stock actual. Comenzar a guardar fotografías de stock desde la puesta en marcha; recuperar historial anterior solo si la fuente lo permite.

La aplicación lee los datos consolidados de Supabase. Las sincronizaciones se ejecutan mediante procesos independientes. Antes de implementar almacenamiento, definir permisos de acceso del equipo, aislamiento de organización y políticas de seguridad, reutilizando el acceso de Facto.

## 5. Reglas previas a la priorización

1. Confirmar que el producto pertenece a pesca y está activo.
2. Evaluar disponibilidad por variante y sucursales habilitadas para vender por el canal. No confundir stock físico total con disponible para venta.
3. Bloquear recomendaciones de venta sin stock o con stock desconocido. La única excepción comercial sin stock es anunciar una futura reposición confirmada, sin afirmar disponibilidad ni habilitar un llamado a comprar ahora.
4. Como umbral inicial configurable, un stock con más de 24 horas queda pendiente de actualización para piezas comerciales. Validarlo de nuevo antes de publicar.
5. Validar precios, descuentos y vigencias; la IA no crea promociones.
6. Confirmar especificaciones, usos y beneficios. No inventar especies, materiales, rendimientos ni fechas de llegada.
7. Confirmar responsable técnico, material y esfuerzo de producción.

Una novedad requiere fecha de ingreso o confirmación manual. Una reposición requiere un evento confirmado o transición de stock registrada. No inferir ninguna de ellas únicamente porque el producto tenga stock hoy.

## 6. Prioridad explicable

Primero aplicar los bloqueos. Luego ordenar candidatos elegibles mediante cinco criterios, puntuados de 0 a 4. Es una regla inicial de trabajo que deberá evaluarse con resultados, no un modelo predictivo validado.

| Criterio | Peso propuesto | Evidencia |
| --- | --- | --- |
| Demanda | 30% | Unidades netas en 28 días contra los 28 anteriores; consultas y vistas como señales separadas |
| Oportunidad temporal | 25% | Ingreso o reposición confirmado, campaña vigente, fecha o patrón estacional |
| Necesidad comercial | 15% | Cobertura de stock, baja rotación o prioridad explícita del negocio |
| Utilidad para el cliente | 15% | Preguntas recurrentes o una demostración concreta que resuelva una duda |
| Viabilidad | 15% | Producto, responsable, material y tiempo disponibles |

Fórmula propuesta: suma de peso × puntuación / 4, en escala 0–100. Publicar también el desglose y una explicación en lenguaje simple. Congelar la versión de reglas utilizada por cada plan.

No permitir que la IA invente las puntuaciones: documentar umbrales por criterio y categoría antes de activar el ranking. Hasta entonces, mantener la puntuación como evaluación manual respaldada. Con datos faltantes, mostrar un rango de prioridad (mínimo conocido y máximo posible) y cobertura de evidencia; no fabricar un número único ni premiar fuentes ausentes.

Comparar ventas por categoría y variante cuando corresponda. Mostrar unidades absolutas junto con porcentajes. No calcular crecimiento porcentual con base cero. Tener en cuenta días sin disponibilidad: pocas ventas con quiebres de stock no prueban baja demanda.

Cobertura de stock propuesta: disponible / venta media diaria neta de 28 días. Si no hay ventas, indicar “sin base de cálculo”. Mucho stock no prueba que haya que liquidar; se necesita una decisión comercial. La estacionalidad con solo dos años es orientativa y debe incluir ubicación y período. Trends expresa interés relativo, no volumen absoluto de búsquedas.

## 7. Ficha de idea

| Campo | Valor a completar |
| --- | --- |
| Identificador / semana / versión | |
| Tema central | |
| Motivo / tipo / formato / objetivo | Cuatro campos independientes |
| Producto / variantes / SKU / marca / categoría / enlace | |
| Público y situación de uso | Confirmados o señalados como hipótesis |
| Dato de origen | Valor, unidad, período y comparación |
| Fuente / referencia / actualización / cobertura | |
| Evidencias secundarias | Mismo detalle por cada señal |
| Prioridad / desglose / versión de reglas | |
| Explicación de prioridad | Por qué merece espacio esta semana |
| Stock / sucursal / fecha de consulta | |
| Precio / oferta / vigencia | Solo si aplica y está confirmado |
| Gancho / mensaje / acción esperada | |
| Material disponible / faltante | |
| Responsable técnico / producción / aprobación | |
| Esfuerzo / fecha propuesta / canales | |
| Indicador principal / hipótesis | |
| Estado / observaciones | |

Una ficha puede citar varias evidencias, cada una con su propia actualización. Separar la fecha del evento, el período medido y la fecha de importación.

## 8. Entrega semanal

### Resumen para decidir

- Semana y fecha de corte de datos.
- Cobertura y fallas de fuentes.
- Lista priorizada de ideas, con evidencia y explicación.
- Candidatos descartados o bloqueados y motivo.
- Capacidad disponible y faltantes de producción.

### Siete historias

| Día / fecha | Idea vinculada | Motivo | Tipo | Objetivo | Gancho | Recurso visual | Mensaje / interacción | Acción | Responsable | Estado |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Lunes | | | | | | | | | | |
| Martes | | | | | | | | | | |
| Miércoles | | | | | | | | | | |
| Jueves | | | | | | | | | | |
| Viernes | | | | | | | | | | |
| Sábado | | | | | | | | | | |
| Domingo | | | | | | | | | | |

Una historia diaria significa al menos una pieza publicable cada día. Una secuencia de varias pantallas debe declarar el trabajo adicional. No fijar un motivo por día: seleccionar según oportunidades reales. Evitar repetir SKU y enfoque sin una razón explícita.

### Brief de video

- Idea y evidencia vinculadas.
- Objetivo, público y mensaje único.
- Gancho inicial y guion por escenas.
- Tomas necesarias y demostración verificable.
- Persona responsable de validar y persona en cámara.
- Material de archivo o marca y autorización de uso confirmada.
- Grabación nueva necesaria: sí/no; dependencias y tiempo estimado.
- Formato, duración propuesta, subtítulos y llamada a la acción.
- Piezas derivadas posibles, indicando qué cambia en cada una.
- Indicador principal y responsable de aprobación.

Planificar hasta cinco ediciones semanales cuando exista material suficiente, contando adaptaciones por separado de videos originales. Mantener el compromiso mínimo mensual de dos videos grabados. Si no se alcanza la capacidad de edición, mostrar qué grabaciones o recursos faltan.

### Coordinación entre plataformas

Vincular las piezas a una campaña o tema común. Compartir producto, mensaje, oferta y vigencia; adaptar el guion y la acción al canal. Agregar banner cuando la campaña lo justifique y exista destino web coherente. Una aprobación de una pieza no aprueba automáticamente todas las adaptaciones.

## 9. Instrucción reutilizable para la IA

```text
Actúa como planificador de contenido de pesca de Multisport, Chile.
Usa exclusivamente el paquete de evidencias, productos elegibles, prioridades
calculadas y recursos de producción suministrados.

Genera para la semana indicada:
1. Ideas ordenadas según las prioridades recibidas, sin recalcular ni inventar cifras.
2. Siete historias, una por día, vinculadas a esas ideas.
3. Briefs de video compatibles con la capacidad y el material disponible.
4. Adaptaciones a Facebook y banners solo cuando aporten a la campaña.
5. Faltantes, bloqueos y preguntas concretas para revisión.

Mantén separados motivo, tipo, formato y objetivo; usa los valores permitidos.
Para cada idea cita identificadores de evidencia, valor, período y actualización.
Explica la prioridad y diferencia hechos, hipótesis y decisiones comerciales.
No inventes ventas, búsquedas, stock, temporadas, beneficios, promociones
ni fechas de reposición. Si falta evidencia, marca pendiente de datos.
No propongas venta sin stock: solo se admite anunciar una reposición futura
confirmada, con mensaje y acción acordes. Respeta los bloqueos recibidos.
No incluyas caza ni traumáticas. Evita duplicaciones sin propósito explícito.
Usa español natural de Chile y mensajes específicos del producto.
Todo resultado queda en borrador, sujeto a revisión humana.

Entrada:
- Semana, zona horaria America/Santiago y fecha de corte.
- Taxonomías y versión de reglas.
- Productos elegibles, variantes, stock, precios y vigencias.
- Evidencias identificadas, prioridades y cobertura de fuentes.
- Calendario comercial y confirmaciones manuales.
- Recursos, responsables por categoría/marca y disponibilidad.
- Material existente y contenidos recientes con sus resultados.

Salida:
- resumen_de_datos
- ideas: fichas completas con evidence_ids
- historias: siete piezas con fecha e idea_id
- briefs_video: piezas con idea_id, tomas y dependencias
- adaptaciones: canal, formato, idea_id y cambios necesarios
- bloqueos_y_faltantes
```

## 10. Revisión y aprendizaje

Estados: borrador → en revisión → aprobado → programado → publicado → medido. Alternativas: requiere cambios, rechazado y bloqueado. Guardar quién aprobó, cuándo y qué versión. Cambiar producto, oferta o afirmaciones después de aprobar exige otra revisión.

Antes de publicar, confirmar stock y condiciones. Registrar resultados por pieza y fecha de medición. Evaluar alcance con alcance; interacción con respuestas o guardados; tráfico con clics/sesiones; venta con conversiones atribuibles disponibles. Comparar formatos y ventanas equivalentes. No atribuir una venta a contenido sin respaldo de medición.

## 11. Orden de implementación propuesto en Facto

1. Configuración: categorías de pesca, sucursales, responsables, taxonomías, capacidad y validación de reglas.
2. Carga histórica reanudable, sincronización incremental y panel de cobertura.
3. Señales Bsale y manuales, elegibilidad, prioridad explicable y trazabilidad.
4. Generación de fichas, siete historias y briefs; revisión humana y calendario.
5. GA4 y Search Console con correspondencias verificadas. Trends opcional.
6. Resultados de redes y ajuste de las reglas tras observar varias semanas.

La primera entrega puede funcionar con Bsale y datos manuales. Mientras no estén conectadas las búsquedas, debe mostrar “sin datos de búsqueda”, sin prometer que las utiliza.

Observación del repositorio: hay acceso a catálogo/variantes/stock en
`app/web-catalog/actions.ts`, conexión servidor a Supabase y un flujo de
investigación con borradores en `app/api/web-catalog/research/route.ts`.
Son puntos para evaluar reutilización; esta revisión no verifica credenciales,
cobertura remota ni disponibilidad de históricos. No se ejecutaron importaciones.

## 12. Criterios de aceptación de la primera versión

- Repetir o reanudar una carga no duplica ventas; anulaciones y devoluciones se concilian.
- Abrir el módulo no dispara la importación histórica.
- Solo aparecen productos de pesca clasificados y todas las piezas comerciales pasan la validación de stock.
- Una reposición futura muestra su confirmación y nunca disponibilidad actual falsa.
- Cada idea conserva evidencia, fechas, explicación de prioridad y versión de reglas.
- Datos faltantes o antiguos quedan visibles; una falla no reemplaza datos válidos por ceros.
- El calendario contiene siete historias viables, o identifica explícitamente los cupos bloqueados.
- Los briefs respetan materiales y capacidad; diferencian originales y derivados.
- La aprobación humana es obligatoria y queda registrada.
- Las adaptaciones comparten condiciones y vigencia sin perder su objetivo propio.
- El sistema no afirma usar GA4, Search Console, Trends o redes mientras no haya datos integrados.
