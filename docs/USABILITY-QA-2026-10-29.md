# Usabilidad y QA de Facto — 29 de octubre de 2026

Estado: primera entrega implementada y probada localmente en http://localhost:3000. Sin despliegue ni comprobación de producción. Sin cambios de esquema o datos compartidos.

## Hallazgos y cambios
- P2: colección comercial identificada solo por ícono. Se añadió el nombre visible «Datos comerciales», conservando rutas y colecciones existentes.
- P2: cierre de sesión oculto en teléfono. Ahora está disponible en todos los tamaños, con foco visible. No se ejecutó el cierre durante QA.
- P2: usuarios de teclado debían atravesar toda la navegación. Se añadió «Saltar al contenido principal» y destino enfocable.
- P2: borrar medidas o escala de Etiquetas convertía el vacío en cero. Se conserva el vacío, se indica «Pendiente» en el resumen y se bloquea generar hasta completar valores válidos. Se añadió una explicación de los requisitos y del paso previo a imprimir.

## Comprobaciones
- Navegador integrado con sesión disponible: recepción, Full, inicio de Precios y Etiquetas.
- Recepción a 390 × 844: nombre comercial y cierre de sesión visibles; sin desbordamiento horizontal. Apertura y cierre del grupo comercial.
- Enlace por teclado: foco trasladado a main-content.
- Etiquetas: ancho vacío permanece vacío, resumen «Pendiente», generar deshabilitado; escala 301 bloquea generar; volver a 100 habilita. Sin generación de PDF ni impresión.
- TypeScript: pasa después de los cambios.
- Lint completo: 87 errores y 5 advertencias en archivos ajenos a esta entrega (any en recepción y require en verificadores, entre otros). Lint dirigido a los tres archivos modificados: pasa. git diff --check: pasa.
- Capturas: facto-qa-mobile.jpg y facto-qa-labels.jpg en el directorio de esta conversación; no contienen datos de negocio.

## Límites y siguientes revisiones
- Producción y habilitación de base de datos no comprobadas.
- Proveedores sigue siendo prueba ficticia con sessionStorage, sin conexión Bsale/Supabase según código y README.
- Caja comunica que no importa movimientos Bsale; su integración sigue pendiente. No se promueve ingreso manual como solución definitiva.
- Pendiente: recorrer catálogo, picking, módulos comerciales y finanzas; comprobar recuperación de errores, borradores y acciones masivas con datos aislados.
- Revisar la posible llegada de una vista previa de Etiquetas desactualizada si se edita durante la generación; hallazgo de código pendiente de reproducción aislada. Revisar también dos disparadores de impresión existentes (load y temporizador), sin ejecutar impresiones reales.
- El estado expandido de las colecciones se reinicia al cambiar ruta por sus keys actuales. Se conserva en esta entrega; evaluar la preferencia de navegación antes de alterarlo.

## Conservación del trabajo
Había cambios previos extensos, incluidos Sidebar y módulos sin seguimiento. Se hicieron ajustes puntuales sin crear commits ni incluir trabajo ajeno. Archivos editados en esta entrega: components/Sidebar.tsx, components/AppShell.tsx, app/labels/page.tsx y este documento.

## Segunda entrega — recomendaciones aplicadas
- P1, Etiquetas: se invalidan respuestas y errores antiguos al editar, incluso si la respuesta termina de descargar después de la cancelación. Se cancela la petición al abandonar la pantalla. Un bloqueo inmediato evita generaciones simultáneas por clics repetidos. La lectura de archivos tampoco sobrescribe una edición posterior.
- P1, Etiquetas: carga y temporizador comparten un único disparador de impresión. Los clics repetidos reutilizan la ventana abierta para el mismo PDF. Verificación del disparador con ventana simulada; no se abrió ningún diálogo ni se imprimió físicamente.
- P2, Etiquetas: «vista previa» reemplaza «preview» y se explica qué ocurre al editar durante la generación.
- P1, Picking: el lector rechaza identificadores mal formados, en vez de quitar letras y abrir otro número de pedido. Mantiene texto, acepta número completo y prefijo #, conserva ceros iniciales. Error junto al campo y accesible; formulario apilado en teléfono.
- P2, Picking: alcance visible de tabla (100 más recientes) y recuperación (50 más recientes de Bsale más reintentos fallidos/atascados). Se explicita que la cola genera impresión real y puede incluir trabajos fuera de la tabla. Ante un fallo de comunicación se pide revisar estados antes de repetir.
- P2, Intel: indicadores de carga ya no se muestran como cero. Una primera consulta fallida muestra «No disponible» y permite reintentar. No cambian cálculos, consultas ni almacenamiento.
- P2, Caja: encabezado y vacío dejan clara la importación pendiente de Bsale; se retiró la invitación del vacío a comenzar ingresando salidas manualmente.
- P2, navegación: las colecciones abiertas se conservan entre módulos y el grupo activo se abre al volver por historial. No se añadieron permisos.

### Verificación de la segunda entrega
- 9 pruebas aisladas pasan: tareas concurrentes, cancelación, respuesta tardía, recuperación, disparador único, ventana cerrada y formatos del lector.
- TypeScript y lint dirigido pasan; diff sin errores de espacios. Lint general conserva la limitación de la primera entrega.
- Etiquetas real: generación con la etiqueta de ejemplo, edición de ancho durante la solicitud, impresión bloqueada tras editar y nueva vista previa exitosa. ZPL vacío muestra explicación y bloquea ambas acciones. No se imprimió.
- Picking real: abc123 conserva texto, aria-invalid=true y error visible; no navega ni ejecuta una acción de pedido. Formulario a 390 px sin desbordamiento interno. No se pulsaron recuperación ni reimpresión.
- Comercial y Finanzas permanecen abiertos al ir de Caja a Etiquetas; volver a Caja con Finanzas cerrado lo abre automáticamente.
- Se abrieron catálogo, Intel, Inteligencia, Marketing, Proveedores y Caja. Son recorridos iniciales, no certificación de todos sus flujos. Intel pasó de «Cargando…» a indicadores reales. Caja respondió con vacío y mostró el aviso pendiente. Proveedores mostró su modo ficticio. No se generaron borradores comerciales ni movimientos compartidos.
- Capturas adicionales en la conversación: facto-qa-label-preview.jpg (solo etiqueta ficticia) y facto-qa-picking-validation.jpg (solo formulario, sin pedidos).

Pendiente: probar errores de red de extremo a extremo con un entorno aislado; revalidar ventanas PDF/impresión por navegador con impresora simulada; revisar conservación de borradores y modales de cada módulo. No se comprobaron despliegues ni habilitación de base de datos. La integración de caja con Bsale sigue pendiente de documentación.

## Refresh visual — 29 de octubre de 2026
Implementado y revisado localmente. No desplegado ni verificado en producción.

- Barra lateral azul oscuro, marca compacta e iconos consistentes. Operaciones arriba; Datos comerciales y Finanzas conservan rutas y colecciones.
- Página activa con fondo, borde y aria-current; encabezado de contexto por módulo.
- Menú móvil desplegable, con cierre al navegar y acceso a cerrar sesión.
- Estilos compartidos del espacio de trabajo: títulos, paneles, bordes, formularios, tablas y foco visible. Autenticación sin estos cambios. Respeta movimiento reducido.
- Recepción: explicación del flujo, zona de carga identificada y formatos/límite de 4 MB visibles. Sin cambiar carga, validación ni recepción.
- Precios: tarjetas con mejor jerarquía; se conserva la distinción entre cambios inmediatos y trabajo guardado. Sin cambios de cálculos o persistencia.

Validación: TypeScript, lint de Sidebar/AppShell/Recepción/Precios y nueve pruebas anteriores pasan. diff --check sin errores. Revisión visual de Recepción, Precios, Marketing y Etiquetas; navegación a Proveedores. Recepción y Precios a 390 px y Etiquetas a 320 px sin desbordamiento horizontal observado. Menú, colecciones, ruta activa y salto por teclado verificados. Aviso ficticio de Proveedores visible. Sin impresión ni modificaciones de stock, precios o movimientos reales.

Capturas en esta conversación: facto-refresh-desktop.jpg, facto-refresh-mobile.jpg, facto-refresh-prices.jpg. Sin datos personales ni movimientos del negocio.

Pendiente: revisar esta dirección visual con el usuario y extender ajustes específicos a tablas y modales complejos con datos aislados. Continúan pendientes QA de errores de red, borradores y producción.

## Alcance del commit solicitado
Se incluyen el refresh y las correcciones sobre módulos ya versionados, más sus pruebas y este registro. Intel, Inteligencia, Marketing, Proveedores, Caja, sus API y migraciones siguen fuera del commit porque son trabajo previo sin versionar de otros chats. Las mejoras locales de Intel/Caja y los enlaces a esos módulos se conservan en la copia de trabajo, pendientes de incorporar junto con sus módulos. La versión preparada del menú contiene los seis accesos operativos existentes. No se modificó la copia local del menú para esta separación.
