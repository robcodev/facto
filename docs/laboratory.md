# Laboratorio: ficha temporal de producto

Ruta `/sandbox`, en **Herramientas → Laboratorio**.

Primer uso: abrir una ficha oficial de Shimano Japón y reunir las imágenes del LINE-UP con las filas de SPECIFICATION. Incluye tarjetas, tabla con imágenes, búsqueda por color/modelo/código/JAN y ampliación de imágenes. Los encabezados tienen equivalentes en español; los nombres de color, códigos, precios y valores originales se conservan. Los precios del fabricante se identifican como JPY.

## Relación de variantes

Se comprueban modelo, número de color y nombre normalizado (incluye caracteres japoneses de ancho completo). Nunca se utiliza el orden de las imágenes. Coincidencias inexistentes o ambiguas quedan sin imagen, con aviso. Se expanden filas con `rowspan`; una tabla incompatible produce un error en lugar de devolver datos parciales. La ficha de ejemplo tiene diez variantes y diez relaciones únicas comprobadas.

Esta versión admite fichas `https://fish.shimano.com/ja-JP/product/...html` con tabla de modelo/color. No es todavía un navegador general ni el chat de cálculos/Excel: corresponde al primer caso solicitado por el usuario.

## Carga y privacidad

- Página y API requieren sesión de Facto.
- Una única vista por usuario se conserva en `localStorage` de este navegador. No se acumulan sesiones, imágenes ni archivos en Supabase.
- Al solicitar otro enlace se confirma el reemplazo; la vista anterior solo se sustituye al completar y validar la nueva. Un fallo de red conserva el trabajo anterior. Si otra pestaña cambió el contenido mientras se consultaba la ficha, el reemplazo se detiene.
- **Vaciar laboratorio** elimina únicamente esta vista local, después de confirmación en la app.
- La página se lee en el servidor con un parser de HTML; no se ejecutan scripts ni se incrusta HTML remoto.
- Se admiten únicamente los dominios y rutas previstos. Cada redirección se valida. Los cuerpos HTML se limitan a 3 MiB y las imágenes a 8 MiB; las llamadas tienen plazos acotados.
- Shimano exige la referencia pública de su sitio para servir imágenes. La ruta autenticada de imágenes utiliza esa referencia, limita dominios y tipos raster, y sirve caché privada en el navegador. No acepta SVG/HTML ni enlaces arbitrarios.
- No requiere nuevas variables de entorno ni migraciones; se añadió `linkedom` 0.18.15 fijado en el archivo de dependencias.
- Este flujo no llama a Gemini ni escribe en Bsale. La relación se obtiene de los identificadores publicados por el fabricante.

## Verificación

`node scripts/verify-laboratory.mjs` comprueba asociación con imágenes desordenadas, nombres normalizados, imágenes ausentes/ambiguas, conservación de JAN/precios, restricciones de origen y redirección y tamaño máximo.

`node scripts/verify-laboratory.mjs --live` consulta la ficha de ejemplo y comprueba sus diez asociaciones y una imagen real a través del cargador.

También se verifican TypeScript, ESLint y la pantalla local. El HTML descargado de la página se mantuvo solo como referencia privada de desarrollo; no se añade al repositorio.
