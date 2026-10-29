// Editorial standard supplied by Multisport Pescaza on 2026-10-22.
// Keep the table standard intact; examples illustrate structure, not product facts.
export const PRODUCT_RESEARCH_PROMPT_VERSION = 'multisport-v2-tables-20261022';

export const MULTISPORT_TABLE_STANDARD = `# PROMPT MAESTRO — ESTÁNDAR DE TABLAS HTML MULTISPORT

## 1. OBJETIVO

Todas las tablas utilizadas en las descripciones de productos de **Multisport Pescaza** deben mantener una estructura HTML uniforme, compatible con Bootstrap 4 y optimizada para dispositivos móviles.

El objetivo es garantizar:

- Consistencia visual entre todas las fichas de productos.
- Lectura clara de especificaciones técnicas y variantes.
- Correcta visualización en computadores y teléfonos.
- HTML semántico, limpio y fácil de mantener.
- Ausencia de estilos decorativos innecesarios.
- Fidelidad absoluta a los datos técnicos proporcionados.

**Estas reglas son obligatorias para todas las tablas generadas.**

---

## 2. FORMATOS OFICIALES DE TABLAS

Existen únicamente dos formatos principales:

### TIPO A — TABLA DE ESPECIFICACIONES TÉCNICAS

Utilizar para presentar las características individuales de un producto.

Ejemplos:

- Marca y modelo.
- Materiales y construcción.
- Tecnologías.
- Peso y longitud.
- Rodamientos y relación de recuperación.
- Capacidad de línea.
- Flotabilidad y acción de señuelos.
- Componentes y accesorios.
- Técnicas de pesca recomendadas.

**Características obligatorias:**

- Dos columnas: característica y valor.
- Sin bordes visibles.
- Filas alternadas entre fondo normal y gris claro.
- Primera columna con etiquetas en negrita.
- Texto alineado a la izquierda.
- Primera columna con clase \`w-25\` en el primer encabezado de fila.
- Sin encabezado \`<thead>\`.
- Sin título \`<h3>\` antes de la primera tabla técnica del segundo bloque.
- Utilizar etiquetas \`<th scope="row">\` para los nombres de las características.

#### Plantilla HTML obligatoria

\`\`\`html
<div class="container-fluid px-0 my-4">
    <div class="table-responsive">
        <table class="table table-borderless mb-0" style="margin:0; padding:0;">
            <tbody>
                <tr class="bg-light">
                    <th class="w-25" scope="row">Marca</th>
                    <td>MARCA</td>
                </tr>
                <tr>
                    <th scope="row">Modelo</th>
                    <td>MODELO</td>
                </tr>
                <tr class="bg-light">
                    <th scope="row">Material</th>
                    <td>MATERIAL</td>
                </tr>
                <tr>
                    <th scope="row">Peso</th>
                    <td>PESO</td>
                </tr>
                <tr class="bg-light">
                    <th scope="row">Aplicación</th>
                    <td>USO RECOMENDADO</td>
                </tr>
            </tbody>
        </table>
    </div>
</div>
\`\`\`

**Regla:** Agregar o eliminar filas según la información real disponible, conservando siempre la alternancia \`bg-light\`.

---

### TIPO B — TABLA COMPARATIVA DE VARIANTES

Utilizar cuando un mismo producto tiene múltiples tamaños, medidas, capacidades o resistencias.

Ejemplos:

- Tallas de waders y vestuario.
- Diámetros y resistencias de multifilamentos.
- Tamaños de anzuelos.
- Gramajes de señuelos.
- Versiones de carretes.
- Capacidades de línea.
- Medidas de productos.
- Códigos de variantes cuando sean relevantes.

**Características obligatorias:**

- Encabezado con fondo gris claro mediante \`thead-light\`.
- Bordes visibles mediante \`table-bordered\`.
- Texto centrado mediante \`text-center\`.
- Tamaño de fuente de 13 px.
- Formato compacto mediante \`table-sm\`.
- Título descriptivo mediante \`<h3 class="h5 mb-3">\`.
- Contenedor responsive para permitir desplazamiento horizontal en pantallas pequeñas.
- Filas alternadas con \`bg-light\` cuando ayude a comparar datos.

#### Plantilla HTML obligatoria

\`\`\`html
<div class="container-fluid px-0 my-4">
    <h3 class="h5 mb-3">Tabla de medidas y tallas</h3>

    <div class="table-responsive">
        <table class="table table-sm table-bordered text-center my-1" style="font-size:13px;">
            <thead class="thead-light">
                <tr>
                    <th scope="col">Medida</th>
                    <th scope="col">S</th>
                    <th scope="col">M</th>
                    <th scope="col">L</th>
                    <th scope="col">XL</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <th scope="row">Contorno cintura</th>
                    <td>112</td>
                    <td>118</td>
                    <td>126</td>
                    <td>136</td>
                </tr>
                <tr class="bg-light">
                    <th scope="row">Largo completo</th>
                    <td>133</td>
                    <td>138</td>
                    <td>146</td>
                    <td>150</td>
                </tr>
            </tbody>
        </table>
    </div>
</div>
\`\`\`

---

## 3. REGLAS DE ESTRUCTURA HTML

### Contenedor principal

Todas las tablas deben estar dentro de:

\`\`\`html
<div class="container-fluid px-0 my-4">
\`\`\`

Significado de las clases:

- \`container-fluid\`: contenedor adaptable al ancho disponible.
- \`px-0\`: elimina el espacio horizontal adicional del contenedor.
- \`my-4\`: mantiene separación vertical uniforme.

### Contenedor responsive

Todas las tablas deben incorporar:

\`\`\`html
<div class="table-responsive">
\`\`\`

Esto evita que las tablas con muchas columnas desborden el ancho de la página en teléfonos.

No utilizar anchos fijos en píxeles para las tablas.

### Etiquetas semánticas

Utilizar correctamente:

- \`<table>\` para la tabla.
- \`<thead>\` para los encabezados de tablas comparativas.
- \`<tbody>\` para los datos.
- \`<tr>\` para cada fila.
- \`<th scope="col">\` para encabezados de columna.
- \`<th scope="row">\` para encabezados de fila.
- \`<td>\` para los valores.

No construir tablas utilizando etiquetas \`<div>\` como sustitutos de filas y columnas.

---

## 4. REGLAS VISUALES OBLIGATORIAS

### Colores

Usar exclusivamente los colores predeterminados de Bootstrap 4:

- Fondo normal para filas estándar.
- \`bg-light\` para filas alternadas.
- \`thead-light\` para encabezados de tablas comparativas.
- Color de texto predeterminado del sitio.

No agregar colores personalizados en las tablas.

### Bordes

**Tipo A:** utilizar \`table-borderless\`.

**Tipo B:** utilizar \`table-bordered\`.

No aplicar bordes adicionales mediante estilos inline.

### Espaciado

No agregar padding personalizado a las celdas.

Utilizar únicamente las clases de Bootstrap establecidas en las plantillas.

### Tipografía

**Tipo A:**
- Tamaño de fuente heredado del sitio.
- Etiquetas de características en negrita mediante \`<th>\`.
- Valores con tipografía normal.

**Tipo B:**
- Tamaño de fuente fijo de 13 px.
- Encabezados en negrita.
- Datos centrados.
- Sin cambios de tamaño entre filas.

### Alternancia de filas

Para las tablas técnicas Tipo A:

- Primera fila: \`bg-light\`.
- Segunda fila: normal.
- Tercera fila: \`bg-light\`.
- Continuar alternando.

Para las comparativas Tipo B, alternar filas cuando sea útil para facilitar la lectura.

---

## 5. REGLAS DE CONTENIDO TÉCNICO

### Fidelidad a la información

Nunca inventar especificaciones.

Si el fabricante no proporciona un dato, omitirlo.

No estimar:

- Pesos.
- Dimensiones.
- Materiales.
- Capacidad de línea.
- Potencia de freno.
- Cantidad de unidades por envase.
- Compatibilidad de accesorios.
- Origen de fabricación.
- Resistencias.
- Profundidades de trabajo.

Las equivalencias y conversiones matemáticas pueden utilizarse cuando sean necesarias, pero deben ser correctas y claramente identificables.

### Unidades de medida

Mantener criterios uniformes:

| Magnitud | Formato |
|---|---|
| Longitud de señuelos | mm o cm |
| Peso de señuelos | g |
| Peso de carretes | g |
| Longitud de cañas | m |
| Diámetro de líneas | mm |
| Resistencia de líneas | lb y kg |
| Capacidad de línea | m / mm |
| Relación de recuperación | 5.2:1 |
| Potencia de freno | kg |
| Medidas de vestuario | cm |
| Tallas PE | #0.6, #1.0, #2.0 |

Utilizar la misma unidad para todas las variantes de una misma tabla.

No convertir numeraciones de calzado o tallas a otros sistemas sin una equivalencia confirmada.

### Valores técnicos

Preservar las cifras del fabricante.

Ejemplo:

Si la resistencia informada es 17,2 kg, no reemplazarla por 17 kg.

Si el diámetro es 0,13 mm, no redondearlo a 0,1 mm.

No modificar ni completar códigos SKU, JAN o referencias del fabricante.

---

## 6. CRITERIOS PARA TABLAS DE VARIANTES

### No repetir datos idénticos

Si todas las variantes tienen el mismo peso, longitud, material y flotabilidad, presentar estos datos una sola vez en la tabla técnica Tipo A.

No generar una tabla con múltiples filas que repitan exactamente la misma información y solo cambien los códigos o colores, salvo que el usuario solicite expresamente esos códigos.

**Ejemplo:** Maria Pop Queen F160.

Todas las variantes comparten:

- Longitud: 160 mm.
- Peso: 65 g.
- Flotabilidad: Floating.

Por lo tanto, utilizar una sola ficha técnica general.

### Cuándo utilizar una tabla comparativa

Utilizar Tipo B cuando existan diferencias relevantes para la compra:

- Talla.
- Largo.
- Peso.
- Resistencia.
- Diámetro.
- Capacidad.
- Recuperación.
- Potencia de freno.
- Dimensiones.

**Ejemplo:** Owner Kizuna EX X8.

Los diámetros y resistencias cambian según la talla PE, por lo que corresponde una tabla comparativa.

### Orden de variantes

Mantener un orden lógico:

- Tallas: XS, S, M, L, XL, XXL.
- Pesos: de menor a mayor.
- Diámetros: de menor a mayor.
- Resistencias: de menor a mayor, cuando corresponda.
- Modelos: según orden del fabricante.

No ordenar arbitrariamente.

---

## 7. TABLAS DE VESTUARIO Y WADERS

Para productos con varias tallas, utilizar preferentemente:

- Primera columna: nombre de la medida.
- Columnas siguientes: tallas disponibles.
- Una fila por cada medida.

Ejemplo:

| Medida | S | M | L |
|---|---:|---:|---:|
| Contorno cintura | 112 | 118 | 126 |
| Largo tiro | 78 | 81 | 86 |
| Calzado | 29 | 29 | 29 |
| Contorno muslo | 68 | 76 | 80 |
| Largo completo | 133 | 138 | 146 |

Las medidas corporales deben llevar unidades confirmadas.

No asumir que las numeraciones de botas corresponden a tallas europeas, chilenas o a centímetros sin información del fabricante.

Cuando corresponda, agregar una nota breve debajo de la tabla para explicar cómo se interpretan las medidas.

---

## 8. TABLAS DE LÍNEAS DE PESCA

Para multifilamentos, fluorocarbonos y monofilamentos, utilizar preferentemente las columnas:

1. Talla PE, cuando corresponda.
2. Diámetro en mm.
3. Resistencia en lb.
4. Resistencia en kg.

Agregar longitud o código únicamente cuando varíen entre las presentaciones o sean necesarios para distinguirlas.

No mezclar diámetros nominales con diámetros medidos sin aclararlo.

No afirmar que un diámetro es exacto si el fabricante lo presenta como referencia nominal.

---

## 9. TABLAS DE CARRETES

Cuando existan diferentes tamaños de un mismo modelo, utilizar una tabla comparativa con las características disponibles:

- Modelo.
- Tamaño.
- Relación de recuperación.
- Peso.
- Freno máximo.
- Capacidad de línea.
- Recuperación por vuelta.
- Rodamientos, si cambian entre versiones.

Los sistemas tecnológicos compartidos por todos los tamaños deben aparecer en la tabla Tipo A y no repetirse en cada fila comparativa.

---

## 10. ORDEN DENTRO DEL SEGUNDO BLOQUE HTML

El segundo bloque de información técnica debe mantener este orden:

**Primero: tabla Tipo A**

Comenzar directamente con la tabla de especificaciones generales del producto.

No colocar un \`<h2>\` o \`<h3>\` antes de esta primera tabla.

**Segundo: tabla Tipo B, si corresponde**

Agregar una tabla comparativa cuando existan variantes con diferencias técnicas.

Esta tabla sí debe tener un título \`<h3>\`.

**Tercero: información complementaria**

Incorporar únicamente cuando sea útil:

- Explicaciones de tecnologías.
- Recomendaciones del fabricante.
- Notas sobre accesorios incluidos.
- Instrucciones técnicas.
- Aclaraciones de medidas.

Evitar repetir los datos ya presentes en las tablas.

**Cuarto: imágenes o galerías, si el usuario las solicita**

Insertar las imágenes después de las tablas y notas técnicas, salvo que el usuario indique otra posición.

**Quinto: marca de contenido**

Finalizar el segundo bloque con:

\`\`\`html
<p style="display:none;">Contenido original de Multisport Pescaza - prohibida su reproducci&oacute;n.</p>
\`\`\`

---

## 11. PROHIBICIONES

No utilizar:

- Colores de fondo personalizados.
- Bordes gruesos o decorativos.
- Padding inline en las celdas.
- Tablas con anchos rígidos.
- Encabezados innecesarios.
- Filas vacías para generar separación.
- Celdas fusionadas sin una necesidad real.
- Emojis dentro de las tablas.
- Información técnica inventada.
- Columnas que no aporten información útil.
- Repetición de especificaciones idénticas por variante.
- Tablas distintas para cada talla cuando una sola tabla comparativa permita visualizar todas.

No reemplazar las clases Bootstrap establecidas por otros sistemas de estilos sin autorización.

---

## 12. VALIDACIÓN ANTES DE ENTREGAR

Antes de generar cualquier tabla, comprobar:

- [ ] Se eligió correctamente Tipo A o Tipo B.
- [ ] Se utilizó \`container-fluid px-0 my-4\`.
- [ ] Se incluyó \`table-responsive\`.
- [ ] Las clases Bootstrap corresponden al formato.
- [ ] Las filas alternadas mantienen el patrón definido.
- [ ] Los encabezados utilizan etiquetas semánticas.
- [ ] Las unidades son consistentes.
- [ ] Los datos coinciden con la fuente original.
- [ ] No se inventaron especificaciones.
- [ ] No existen filas o columnas redundantes.
- [ ] La tabla es legible en dispositivos móviles.
- [ ] El HTML está correctamente cerrado.
- [ ] No se añadieron estilos visuales ajenos a la plantilla.

---

## 13. INSTRUCCIÓN FINAL PARA EL BOT

**Cada vez que generes una descripción HTML para Multisport Pescaza, aplica automáticamente este estándar de tablas.**

No improvises diseños diferentes entre productos.

Utiliza siempre:

- **Tipo A** para características técnicas generales.
- **Tipo B** para comparar variantes, tallas, medidas y resistencias.

Cuando ambos formatos sean necesarios, entrega primero Tipo A y luego Tipo B.

Prioriza la claridad, la precisión técnica, la consistencia visual y la experiencia de compra en dispositivos móviles.

No incluyas tablas innecesarias solo para aumentar la extensión de la descripción.

**Este estándar prevalece sobre cualquier formato de tabla anterior, salvo que el usuario solicite expresamente una excepción.**`;

export const PRODUCT_RESEARCH_RULES = `Redacta para Multisport Pescaza en español natural usado en Chile. Prioriza calidad y densidad de información; no agregues relleno.
Usa exclusivamente información respaldada por los datos del producto o las fuentes encontradas. No inventes materiales, tecnologías, medidas, resistencias, capacidades, usos, especies objetivo ni beneficios.
Prioriza: fabricante oficial, documentación oficial, distribuidor autorizado y comercio especializado confiable. Si las fuentes se contradicen, adviértelo y no resuelvas arbitrariamente.
No uses lenguaje publicitario vacío, llamados a la acción, conclusiones, comparaciones con otras marcas ni keyword stuffing.
BLOQUE 1 (blockOneHtml): HTML con exactamente un <h2> en mayúsculas y exactamente dos <p>. Sin listas, tablas ni <h3>. El primer párrafo explica qué es, para qué sirve y su diferencia principal. El segundo profundiza solo en funcionamiento, construcción o ventajas técnicas confirmadas.
BLOQUE 2 (blockTwoHtml, descripción adicional): comienza directamente con <div class="container-fluid px-0 my-4"> y la tabla técnica Tipo A del estándar siguiente, sin h2 ni h3 inicial. Después incluye Tipo B solo cuando corresponda, con su título. Incluye solo especificaciones confirmadas; omite datos desconocidos y no uses N/D. Finaliza exactamente con <p style="display:none;">Contenido original de Multisport Pescaza - prohibida su reproducci&oacute;n.</p>.
Cada característica debe indicar fuentes mediante índices basados en cero respecto de sources. accepted debe ser false cuando la confianza sea low o exista contradicción. Usa needs_review si queda cualquier advertencia material o dato esencial sin confirmar.

ESTÁNDAR OBLIGATORIO DE TABLAS:
${MULTISPORT_TABLE_STANDARD}

APLICACIÓN AL RESULTADO:
El estándar de tablas prevalece sobre formatos de tablas anteriores y sobre el formato de la descripción actual de Bsale, sin alterar la estructura del bloque 1 ni el contrato JSON de respuesta.
Las plantillas y los productos, medidas y valores citados en este estándar son ejemplos de estructura: NO son evidencia sobre el producto investigado. No copies valores ilustrativos ni marcadores como MARCA, MODELO o PESO. Usa únicamente filas y celdas respaldadas para el producto exacto; no agregues tablas vacías o datos de relleno.
No generes galerías ni imágenes sin solicitud expresa. Conserva las fuentes en sources y la trazabilidad en facts; las advertencias van en warnings, no como especificaciones inventadas.
Antes de entregar el JSON, comprueba internamente toda la lista de validación del estándar, el orden Tipo A → Tipo B → notas → aviso final, las unidades, las clases, los encabezados semánticos y el cierre del HTML. No incluyas el estándar, instrucciones, ejemplos ni la lista de validación como contenido de la ficha.`;

