# Accesos para ideas y medición · Facto

## Propiedades confirmadas por el propietario

- Supabase existente: `dkwnwasybqaohtwgaelq`.
- Cuenta Analytics: `355030444` (no se utiliza como propiedad).
- Propiedad GA4: `489006527`.
- Search Console: `sc-domain:dmultisport.cl`.
- Publicidad: Meta Ads y Google Ads. Sus APIs de gasto no están conectadas.

## Base de datos

El usuario autorizó crear el almacenamiento. La migración preparada es
`supabase/migrations/20261026170947_marketing_ideas_and_measurement.sql`.

La migración se aplicó el 26/10/2026 usando el editor SQL de la sesión web autorizada. Se comprobó que las cinco tablas existen, tienen RLS y permiten acceso al servidor; el cliente anónimo recibió 42501. Están vacías, sin registros ficticios. La CLI continúa sin autenticación.

No existe actualmente supabase_migrations.schema_migrations en este proyecto: no se inventó historial ni se aplicaron otras migraciones. Antes de usar db push, conciliar el esquema e historial existentes para no volver a ejecutar esta migración ni las de Intel. No crear otro proyecto.

## Google: conexión OAuth verificada

El propietario confirmó que no dispone de cuenta de servicio. Se usa OAuth con su usuario Google, con permisos analytics.readonly y webmasters.readonly.

- Proyecto Cloud existente: gen-lang-client-0963502544. Cliente web: Facto Marketing, en pruebas; único usuario de prueba ranireto@gmail.com. Ambas API habilitadas con autorización del propietario.
- Retornos registrados: http://localhost:3000/api/marketing/google/callback y https://facto-livid.vercel.app/api/marketing/google/callback.
- Tres variables GOOGLE_MARKETING_OAUTH_CLIENT_ID, GOOGLE_MARKETING_OAUTH_CLIENT_SECRET y GOOGLE_MARKETING_OAUTH_REDIRECT_URI configuradas privadamente en .env.local desde el JSON del propietario. El JSON se excluye mediante client_secret_*.json. No documentar secretos.
- Migración 20261026174014_google_marketing_oauth.sql aplicada al Supabase existente. RLS activo; sin lectura de anon/authenticated; autorización renovable cifrada y accesible solo por el servidor. El propietario completó el consentimiento Google.
- El 26/10/2026 Facto local verificó acceso real a GA4 489006527 y sc-domain:dmultisport.cl; el refresco de autorización permitió importar reportes reales. No se desplegó esta configuración a producción. Gemini permanece sin cambios y usa su configuración independiente.
- En pruebas Google puede exigir renovar consentimiento a los siete días. La conexión se puede revocar desde la cuenta Google.

### Prueba real: 26/09/2026 a 25/10/2026

GA4, vista campaign: 532 filas; 56.073 sesiones, 312 compras registradas, ingresos 28.243.948,99793 CLP. Metadatos: Pacific/Easter, sin truncamiento, sin muestreo informado y sin umbrales aplicados. No son ventas conciliadas con Bsale ni prueba de incremento causal. Revisar instrumentación y zona horaria antes de comparar por día.

Search Console, vista search_page: 16.943 clics y 159.940 impresiones en las filas recibidas, CTR ponderado 10,5933 %, posición ponderada 4,7362. Reporte truncado al límite del MVP: no presentar como totales completos de la propiedad. Datos finales, búsqueda web, America/Los_Angeles. No contiene gasto ni conversiones publicitarias.

Los dos reportes se conservaron en intel_web_reports. No sumar diferentes vistas del mismo tráfico. Las ideas no se generaron ni guardaron en esta prueba.

## Gasto de anuncios

La primera versión permite registrar gasto y resultados manualmente por publicación,
con moneda, período y criterio de atribución. Google Ads y Meta Ads quedan como fuentes
pendientes de integrar; no se infiere su gasto desde sesiones, clics o Search Console.
No se modificarán campañas ni presupuestos.

## Documentación oficial

- https://developers.google.com/analytics/devguides/reporting/data/v1
- https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema
- https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/ResponseMetaData
- https://developers.google.com/webmaster-tools/v1/searchanalytics/query

## Verificación de activación del 26/10/2026

- Proyecto confirmado: dkwnwasybqaohtwgaelq.
- Cinco tablas nuevas: marketing_ideas, marketing_publications, marketing_results, marketing_product_links, intel_web_reports.
- RLS activo en todas; sin SELECT directo para anon/authenticated. Servidor autorizado para SELECT/INSERT/UPDATE.
- El servidor REST de Facto pudo leer las cinco tablas y confirmó cero registros. Acceso anónimo a marketing_ideas denegado con 42501.
- No se insertaron pruebas en producción ni se modificaron Intel o Bsale. El código de la aplicación no se desplegó.
- Estado actualizado: usuario Google conectado mediante OAuth y lectura real de ambas propiedades verificada localmente; ver sección Google.
