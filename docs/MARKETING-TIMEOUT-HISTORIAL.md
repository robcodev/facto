# Lectura histórica del calendario — 20/11/2026

El lector compartido por Marketing e Inteligencia comercial limita a tres las peticiones simultáneas de historial por empresa. Mantiene los filtros de empresa, origen, recurso y, cuando corresponde, captura de stock.

Si una página falla por cancelación de consulta (57014 / statement timeout), la vuelve a consultar desde el mismo cursor con un tamaño menor: 1.000, 500, 250 y 125 filas. No avanza el cursor ni agrega resultados del intento fallido. Al agotarse esos tamaños se informa el error; los errores de permisos u otros errores permanentes se informan inmediatamente. La cola libera su turno tanto al terminar como al fallar.

El orden del cursor corresponde a Postgres: no se compara el orden alfabético de JavaScript con la intercalación de la base. Se comprueba que cada identificador sea válido y no se repita durante la lectura. Se conservan los límites máximos y el rechazo de un historial parcial.

Se inspeccionaron índices y planes: la consulta utiliza el índice único de organización, origen, recurso e identificador externo. No se crearon índices, tablas ni migraciones, ni se aumentó el tiempo máximo de las consultas. Los registros mostraban cancelaciones de consulta y esperas de lectura de disco.

Se completó una lectura real del historial disponible, sin timeouts, truncamiento ni diferencias en los conteos de las ventanas verificadas. Se probaron después la generación en pantalla y la recuperación de la conexión local con un reinicio del servidor de desarrollo usando Node 24 ya instalado. La propuesta de una semana se generó como vista previa, sin guardarla ni registrar publicaciones.

Pruebas: fallo después de una página completada, reintento en el mismo cursor, límite de reintentos, permisos, tope de historial, duplicados, orden de identificadores definido por la base y concurrencia. Pasaron las verificaciones existentes de canastas históricas y calendario, TypeScript y ESLint. No se enviaron datos a Gemini ni se modificaron ventas, stock o calendarios guardados.
