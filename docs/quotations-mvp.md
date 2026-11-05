# Cotizaciones mayoristas

Ruta: /quotations, con acceso desde Gestión del negocio.

## Flujo de trabajo

Pegar una solicitud estructurada registra todas sus filas antes de llamar a la IA. Se conservan orden, descripciones repetidas, identificadores estables y cantidades desconocidas. Las fichas iniciales son editables y se incorporan automáticamente; no hay que aprobar cada una para empezar a buscar. Las correcciones posteriores de la IA se proponen para revisión y no reemplazan ediciones manuales.

Se puede buscar una fila o todas las identificables. Cada fila se interpreta individualmente si hace falta y se investiga en una petición independiente. Cada llamada recibe instrucciones completas y únicamente los datos de ese producto; no recibe el chat acumulado ni las otras filas. Cantidad, talla o unidad pendientes no impiden identificar opciones. Las contradicciones sobre qué producto corresponde sí detienen esa fila y dejan continuar las demás.

Los proyectos anteriores pueden activar propuestas iniciales compatibles con su revisión vigente. Esta recuperación conserva correcciones manuales y selecciones; no aplica propuestas antiguas sobre revisiones posteriores.

## Sets y componentes

Un set conserva una sola fila principal y componentes explícitos con cantidades por set. El ejemplo Gappay 0700/0711/0715 conserva proporciones 1/2/1: para dos sets se requieren dos bases, cuatro fundas de yute y dos fundas Nylcot. La composición literal tiene prioridad sobre inferencias de la IA.

Se busca el set completo y, si no aparece una alternativa exacta, se investigan sus componentes por separado. También hay botones para buscar todas las piezas o una sola. Una pieza suelta no cuenta como kit completo: su cobertura debe confirmar todos los componentes y proporciones. La elección de cada pieza y de la solución armada corresponde al usuario.

El total de una solución armada requiere presentación, precio, moneda e IVA compatibles y documentados. Las presentaciones se redondean hacia arriba para cubrir la cantidad requerida. No se suman monedas o tratamientos tributarios diferentes; los datos desconocidos permanecen pendientes.

## Evidencia y persistencia

La investigación usa Gemini con Google Search y exige consultas y fuentes de grounding. Una segunda llamada estructura el informe y una tercera revisa identidad, precio, presentación, IVA y disponibilidad contra la evidencia recibida. El enlace debe coincidir con una fuente adjunta o su destino verificado. Solo se solicitan redirecciones al host de grounding de Google; el servidor no visita sitios arbitrarios de proveedores. La revisión de IA no sustituye confirmar las condiciones con el proveedor.

Cada petición guarda una reserva temporal de 180 segundos y resultados por producto o componente. Los intentos normales se limitan a tres; actualizar permite una nueva tanda explícita. Una respuesta en curso no se aplica si cambiaron requisitos o mercado. Las selecciones se conservan al actualizar, junto con el historial, y quedan pendientes de revisión si cambian los requisitos.

La tabla quotation_projects guarda el documento del proyecto con control de versión. El cliente Supabase usa la sesión del usuario y RLS restringe el acceso a la empresa compartida facto-compartido. Las peticiones interactivas usan RLS. El trabajador de servidor usa el cliente administrativo existente, valida la empresa compartida, restringe cada proyecto por empresa y comprueba el identificador vigente de ejecución. No se pasan credenciales al workflow. No representa espacios privados por usuario. Las versiones impiden sobrescribir cambios de otra sesión; la identidad y empresa del proyecto son inmutables.

La migración 20261102181803_quotation_projects.sql fue aplicada al proyecto existente el 4 de noviembre de 2026 y se verificaron RLS, acceso anónimo denegado, aislamiento por empresa y rechazo de versiones antiguas. No se creó un historial general de migraciones en el proyecto alojado.

## Límites

La investigación se ejecuta mediante Workflow en el servidor, con pasos independientes y cola persistida en el proyecto. Cerrar el navegador no coordina ni cancela las siguientes peticiones. En desarrollo requiere mantener el servidor activo; el entorno alojado debe disponer del runtime de Workflow. La interfaz consulta avance cada cuatro segundos. Una ejecución interrumpida conserva los resultados y permite iniciar las necesidades pendientes.

Admite texto, TXT/CSV/TSV/Markdown, primera hoja de XLSX, PDF e imágenes PNG/JPG/WebP. Conserva los originales; máximo 1,5 MB por archivo y 3,5 MB por proyecto. No admite DOCX ni XLS antiguos. Los adjuntos se guardan en el documento JSON; un volumen mayor requerirá almacenamiento privado dedicado.

No compra, factura, envía correos ni escribe en Bsale. Los precios públicos no garantizan precio mayorista ni stock para toda la cantidad. Las opciones nunca se seleccionan automáticamente.

## Validación

Ejecutar node lib/quotations/verify.cjs para las pruebas aisladas con Supabase y Gemini simulados. FACTO_IMPORT_FIXTURE permite añadir un archivo real de solicitud. Se verifica captura de 79 filas, interpretación de una sola fila por llamada, ausencia de conversación acumulada, correcciones protegidas, guardado y recarga, bloqueos, evidencia, cobertura de kits, cálculos de piezas, selección y actualización.

Complementar con ESLint del módulo y compilación Next.js/TypeScript. La prueba de interfaz con la solicitud real conserva las 79 filas y deja 77 identificables; dos contradicciones requieren aclaración humana.

## Rework Chile

El mercado del MVP es Chile. Las ofertas requieren revisión con evidencia de presencia local; el dominio o moneda por sí solos no bastan. Se admiten alternativas compatibles, identificadas como tales, con selección humana. Las fuentes internacionales pueden aportar especificaciones, pero las ofertas extranjeras no se muestran ni seleccionan. Resultados anteriores sin verificación local requieren nueva investigación.

La pantalla separa Solicitud y Oferta en preparación. Las recomendaciones priorizan coincidencia exacta y explican coincidencias, diferencias y pendientes; no afirman ser la opción más barata. Cada investigación tiene hasta tres alternativas, tiempos máximos por fase y límites de intentos. El estado del trabajo y la conclusión comercial son distintos.

Validación automatizada: cola persistida, rechazo de inicios duplicados, ejecución obsoleta ignorada, finalización desde trabajador, filtro de ofertas extranjeras y pruebas anteriores de 79 filas y sets. La compilación registra el workflow y sus pasos. La continuidad real del entorno publicado debe verificarse durante el despliegue.
