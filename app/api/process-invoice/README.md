# Lectura de documentos de compra con Gemini

Revisión del 02/11/2026. La ruta analiza PDF/imágenes y devuelve datos para revisión; no registra stock ni confirma recepciones automáticamente.

## Demora observada y ajuste

Los registros de producción mostraron `Gateway Timeout` de Google en `gemini-3.8-flash` y en el respaldo `gemini-3.7-flash`, con respuesta HTTP 504 de Facto después de unos 53 segundos. No se observó un corte de Vercel en ese caso.

- Se mantienen los dos modelos, con razonamiento `LOW` y una salida estructurada más breve: SKU, cantidad y total neto final por línea.
- El costo unitario se calcula en el servidor (`totalNet / quantity`), manteniendo decimales y costos cero explícitos. La IA ya no necesita producir ese campo ni realizar la división.
- Un intento de hasta 70 segundos y un respaldo de hasta 30, sin reintentos internos del SDK. El presupuesto total, incluyendo preparación y espera entre intentos, es de 105 segundos; no se inicia un intento si se agotó el margen.
- La función declara 120 segundos. Cada llamada combina el tiempo disponible con la cancelación del cliente. El navegador espera hasta 115 segundos por el análisis.
- Los errores de formato o resultados truncados se rechazan con 422 y no consumen un segundo intento. No se acepta una lista parcial como completa.
- Se conserva el límite de diez archivos, cuatro MiB por archivo y cuatro MiB en total, para PDF e imágenes admitidas.
- La interfaz distingue lectura de IA y validación con Bsale, muestra tiempo transcurrido y permite seleccionar de nuevo el mismo archivo después de un fallo.
- Los registros incluyen modelo, intento, duración y conteo de ítems, sin contenido del documento ni nombres de archivos.

## Verificación

```text
node scripts/verify-invoice-processing.mjs
node scripts/verify-invoice-processing.mjs --live
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js app/api/process-invoice/route.ts app/reception/page.tsx scripts/verify-invoice-processing.mjs
```

La prueba normal usa respuestas simuladas y no llama a Gemini ni a Bsale. Verifica extracción, división, costo cero, cancelación, presupuesto de tiempo, respaldo, permisos, configuración y rechazo de archivos o respuestas inválidas.

La opción `--live` envía exclusivamente un PDF sintético de dos páginas a Gemini y comprueba dos líneas conocidas. En la revisión respondió en el primer intento en 4,2 segundos. No se utilizó el PDF real que falló en producción; esta medición no garantiza el tiempo de facturas extensas o escaneadas. La disponibilidad del proveedor aún puede causar errores transitorios.
