# Prompts para convertir una captura en Orbit JSON

Estos prompts están pensados para usarse junto con:

- `docs/orbit-json-authoring-guide.md`
- `schemas/orbit-json-v12.schema.json`
- `examples/landing-page-ai.orbit.json`
- La captura del diseño que se desea reproducir

La IA debe devolver un archivo JSON por página. No debe inventar un formato distinto ni envolver la respuesta en Markdown.

## Variables que debes completar

Antes de enviar el prompt, reemplaza estos valores:

- `[NOMBRE_PROYECTO]`: nombre del proyecto.
- `[NOMBRE_PAGINA]`: por ejemplo, `Home`.
- `[MODO_IMAGENES]`: `temporales`, `reales` o `hibrido`.
- `[MAPA_IMAGENES]`: lista de URLs reales y su uso, o `No disponible`.
- `[ANCHO_REFERENCIA]`: ancho aproximado de la captura, por ejemplo `1440 px`.

## Prompt maestro — GPT o Claude

```text
Actúa como especialista senior en diseño UI, maquetación responsive y generación de Orbit JSON v12.

Tu tarea es reproducir con la máxima fidelidad visual la captura de diseño adjunta y devolver una página importable en Orbit Design Studio.

Archivos de referencia adjuntos:
1. orbit-json-authoring-guide.md — reglas de autoría de Orbit.
2. orbit-json-v12.schema.json — contrato obligatorio de salida.
3. landing-page-ai.orbit.json — ejemplo de estructura válida.
4. La captura del diseño que debes reproducir.

Datos del proyecto:
- Proyecto: [NOMBRE_PROYECTO]
- Página: [NOMBRE_PAGINA]
- Ancho de referencia: [ANCHO_REFERENCIA]
- Modo de imágenes: [MODO_IMAGENES]
- Mapa de imágenes reales: [MAPA_IMAGENES]

Reglas obligatorias:
- Analiza primero la captura en silencio: jerarquía, retícula, secciones, espaciado, tipografía, colores, bordes, radios, imágenes y comportamiento responsive.
- No rediseñes, no agregues secciones y no cambies el contenido visible salvo que sea ilegible; en ese caso utiliza texto equivalente con longitud parecida.
- Crea primero tokens reutilizables de color, tipografía, espaciado, radios y sombras. Reutilízalos mediante variables CSS en los nodos.
- Detecta todos los patrones repetidos de la interfaz, no solamente cards: títulos, párrafos, labels, botones, imágenes, contenedores, secciones y partes internas equivalentes.
- Crea una entrada en globalClasses para cada patrón visual que aparezca dos o más veces.
- Vincula cada nodo repetido mediante globalClassIds, styleClassId y styleEditMode: "shared".
- Guarda los estilos comunes exclusivamente en la clase. En styles del nodo deja base vacío y únicamente los overrides que sean realmente diferentes.
- No confundas tokens con clases: los tokens comparten valores; las clases comparten recetas completas de estilo y comportamiento responsive.
- Antes de entregar, simula este control: si se modifica color, tipografía, padding, margin, gap, borde o tamaño de una clase, todos sus nodos vinculados deben recibir el cambio.
- Usa exclusivamente los tipos de nodo y propiedades admitidos por la guía y el schema.
- La raíz debe declarar version 12 y contener una sola página en nodes.
- Usa IDs únicos, estables, descriptivos y sin espacios.
- Define estilos base y ajustes responsive solo cuando sean necesarios. Debe funcionar en desktop, tablet y mobile.
- Conserva el orden semántico de lectura y usa etiquetas HTML apropiadas.
- Toda imagen debe ser un nodo image con src, alt descriptivo y objectFit adecuado.
- Los fondos deben reproducirse con backgroundConfig: color, imagen, gradiente u overlay según la referencia. Incluye también el CSS final en styles.base.background.
- Todo icono debe ser un nodo svg con código inline simple y reemplazable en svgCode. Nunca uses imágenes, Picsum, emojis o caracteres Unicode para representar iconos.
- Si el modo es temporales, utiliza URLs deterministas como https://picsum.photos/seed/[slug-unico]/[ancho]/[alto]. No uses URLs aleatorias sin seed.
- Si el modo es reales, usa únicamente las URLs suministradas en el mapa de imágenes.
- Si el modo es hibrido, usa las URLs suministradas y completa solamente las imágenes faltantes con Picsum usando seed.
- Nunca uses rutas locales, blobs, base64, URLs inventadas de marcas ni imágenes incrustadas en CSS.
- Antes de responder, valida internamente el resultado contra orbit-json-v12.schema.json y corrige cualquier error.

Entrega:
- Devuelve únicamente el JSON completo y válido.
- No uses ```json, no incluyas explicaciones, comentarios, notas ni texto antes o después.
```

## Versión corta para una segunda iteración

Úsala cuando ya generaste un JSON, lo importaste y vas a adjuntar una captura del resultado de Orbit junto con la referencia original.

```text
Compara la captura original con la captura del resultado importado en Orbit. Corrige el Orbit JSON adjunto sin rediseñar.

Prioriza, en este orden:
1. estructura y dimensiones generales;
2. posiciones, alineación y espaciado;
3. escala y saltos tipográficos;
4. colores, bordes, radios y sombras;
5. recorte y relación de aspecto de las imágenes;
6. adaptación para tablet y mobile.

Mantén IDs, tokens, globalClasses y sus referencias cuando sea posible. No conviertas estilos compartidos en copias locales durante la corrección. Cumple orbit-json-authoring-guide.md y valida contra orbit-json-v12.schema.json.

Devuelve únicamente el JSON completo corregido, sin Markdown ni explicaciones.
```

## Cómo usarlo en GPT

1. Adjunta la captura, la guía, el schema y el ejemplo.
2. Pega el prompt maestro y completa sus variables.
3. Guarda la respuesta como `nombre-pagina.orbit.json`.
4. Impórtala en Orbit y compara el resultado con la referencia.
5. Para afinar, adjunta ambas capturas, el JSON y usa el prompt de segunda iteración.

## Cómo usarlo en Claude

Puedes subir la guía, el schema y el ejemplo como conocimiento permanente de un Project. En cada maqueta nueva adjunta la captura, pega el prompt maestro y completa las variables. Para una conversación aislada, adjunta los cuatro archivos igual que en GPT.

## Ejemplo de mapa de imágenes

```text
MODO_IMAGENES: hibrido
MAPA_IMAGENES:
- hero principal: https://cdn.midominio.com/orbit/hero.webp
- retrato testimonial: https://cdn.midominio.com/orbit/laura.webp
- las demás imágenes no están disponibles y deben usar placeholders deterministas
```

## Recomendación práctica

Para las primeras pruebas usa `temporales`. Cuando la estructura ya sea correcta, sube las imágenes finales al panel Assets de Orbit o a un alojamiento estable, reemplaza las URLs y ejecuta una segunda iteración. Así la calidad de la maqueta no depende de que la IA pueda convertir archivos adjuntos en URLs públicas permanentes.
