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

La tabla quotation_projects guarda el documento del proyecto con control de versión. El cliente Supabase usa la sesión del usuario y RLS restringe el acceso a la empresa compartida facto-compartido. No utiliza service role. No representa espacios privados por usuario. Las versiones impiden sobrescribir cambios de otra sesión; la identidad y empresa del proyecto son inmutables.

La migración 20261102181803_quotation_projects.sql fue aplicada al proyecto existente el 4 de noviembre de 2026 y se verificaron RLS, acceso anónimo denegado, aislamiento por empresa y rechazo de versiones antiguas. No se creó un historial general de migraciones en el proyecto alojado.

## Límites

La pestaña abierta coordina las siguientes peticiones. Cerrar la página detiene la cola; una petición enviada puede terminar. Al volver, el avance persistido permite reanudar. No hay un worker durable.

Admite texto, TXT/CSV/TSV/Markdown, primera hoja de XLSX, PDF e imágenes PNG/JPG/WebP. Conserva los originales; máximo 1,5 MB por archivo y 3,5 MB por proyecto. No admite DOCX ni XLS antiguos. Los adjuntos se guardan en el documento JSON; un volumen mayor requerirá almacenamiento privado dedicado.

No compra, factura, envía correos ni escribe en Bsale. Los precios públicos no garantizan precio mayorista ni stock para toda la cantidad. Las opciones nunca se seleccionan automáticamente.

## Validación

Ejecutar node lib/quotations/verify.cjs para las pruebas aisladas con Supabase y Gemini simulados. FACTO_IMPORT_FIXTURE permite añadir un archivo real de solicitud. Se verifica captura de 79 filas, interpretación de una sola fila por llamada, ausencia de conversación acumulada, correcciones protegidas, guardado y recarga, bloqueos, evidencia, cobertura de kits, cálculos de piezas, selección y actualización.

Complementar con ESLint del módulo y compilación Next.js/TypeScript. La prueba de interfaz con la solicitud real conserva las 79 filas y deja 77 identificables; dos contradicciones requieren aclaración humana.
