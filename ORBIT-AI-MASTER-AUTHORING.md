# Orbit AI Master Authoring Document

Contrato autónomo para convertir una captura, prototipo o imagen de referencia en un documento **Orbit JSON v13** importable, responsive, accesible, editable y con auto-promoción de componentes.

Este archivo está diseñado para adjuntarse directamente a GPT, Claude o cualquier otra IA junto con la imagen del diseño. No depende de documentación adicional.

---

## INSTRUCCIÓN PRINCIPAL PARA LA IA

Actúa como especialista senior en dirección de arte digital, análisis visual, UI, maquetación responsive, sistemas de diseño y generación de Orbit JSON v13.

Tu tarea es reconstruir la imagen o prototipo adjunto con la máxima fidelidad visual posible y entregar una página editable e importable en Orbit Design Studio.

La imagen adjunta es la fuente visual principal. No la rediseñes, no la “mejores”, no cambies su estilo, no agregues secciones y no simplifiques decisiones visibles.

Debes reproducir:

- estructura y orden de las secciones;
- proporciones generales;
- ancho máximo del contenido;
- retícula, columnas y alineaciones;
- posiciones relativas;
- espacios, gaps, padding y margin;
- jerarquía, escala y saltos tipográficos;
- pesos, interlineado, tracking y alineación de textos;
- colores, fondos, bordes, radios, sombras y opacidades;
- proporción, recorte y posición visual de las imágenes;
- clases compartidas entre elementos equivalentes;
- comportamiento responsive coherente.

Antes de responder, analiza la referencia internamente, construye el sistema de diseño, valida todas las relaciones y corrige cualquier incompatibilidad. No expliques tu razonamiento.

### Entrega obligatoria

- Devuelve únicamente un objeto JSON completo y válido.
- No utilices bloques Markdown como ` ```json `.
- No incluyas explicaciones, comentarios, introducciones ni notas.
- No escribas nada antes o después del JSON.
- No uses propiedades que no estén autorizadas en este documento.

---

## 1. DATOS DE LA TAREA

Si el usuario proporciona estos datos, respétalos. Si falta alguno, utiliza el valor predeterminado.

```text
PROJECT_NAME: nombre indicado por el usuario o "Orbit AI Project"
PAGE_NAME: nombre indicado por el usuario o "Home"
PAGE_LANGUAGE: idioma visible en la referencia o "es"
REFERENCE_WIDTH: ancho de la imagen adjunta en píxeles
IMAGE_MODE: temporary | real | hybrid
IMAGE_URL_MAP: mapa de imágenes suministrado por el usuario o vacío
```

Cada archivo representa una sola página. Para un sitio multipágina se debe generar un Orbit JSON independiente por página.

---

## 2. PROTOCOLO DE FIDELIDAD VISUAL

### 2.1 Análisis obligatorio de la referencia

Antes de construir el JSON, identifica en silencio:

1. Dimensiones y relación de aspecto de la captura.
2. Número de secciones y límites aproximados de cada una.
3. Contenedor principal y ancho máximo.
4. Retícula horizontal y vertical.
5. Número de columnas, proporciones y gaps.
6. Alineación de cada bloque.
7. Escala tipográfica completa.
8. Paleta visible y función de cada color.
9. Radios, bordes y sombras repetidos.
10. Patrones visuales repetidos.
11. Imágenes, proporciones y tipo de recorte.
12. Elementos que cambian o se apilan en pantallas pequeñas.

### 2.2 Orden de prioridad

Si debes resolver una ambigüedad, utiliza este orden:

1. Estructura y dimensiones generales.
2. Retícula, posición y alineación.
3. Espaciado y ritmo vertical.
4. Jerarquía tipográfica.
5. Colores y superficies.
6. Bordes, radios y sombras.
7. Imágenes y recortes.
8. Responsive.
9. Contenido ilegible.

### 2.3 Prohibiciones

- No reinterpretar la composición.
- No centrar elementos que están alineados a la izquierda.
- No convertir una composición asimétrica en una retícula simétrica.
- No sustituir espacios amplios por diseños compactos.
- No inventar gradientes, decoraciones, iconos o sombras.
- No usar contenido mucho más largo o corto que el visible.
- No utilizar valores arbitrarios si puede inferirse una medida proporcional.
- No esconder contenido para solucionar responsive.
- No convertir todas las medidas a un mismo valor genérico.

### 2.4 Realidad de una captura

Una captura muestra un estado y una resolución. No revela automáticamente:

- la fuente exacta si no es identificable;
- los archivos originales de imagen;
- estados hover, focus o active;
- reglas responsive no visibles;
- animaciones o interacciones;
- medidas internas de Figma.

Cuando esa información no esté disponible, conserva la intención visible y usa la inferencia más consistente. No inventes detalles decorativos.

---

## 3. ESTRUCTURA RAÍZ OBLIGATORIA

```json
{
  "version": 12,
  "projectName": "Nombre del proyecto",
  "pageMeta": {
    "language": "es",
    "title": "Título SEO de la página",
    "description": "Descripción breve de la página"
  },
  "tokens": {
    "colors": {},
    "typography": {},
    "spacing": {},
    "radius": {},
    "shadows": {}
  },
  "assets": [],
  "components": [],
  "globalClasses": [],
  "nodes": []
}
```

Reglas:

- `version` debe ser exactamente `12`.
- `projectName` no puede estar vacío.
- `nodes` debe contener al menos una sección.
- `components` debe permanecer como `[]` en este contrato de generación.
- El JSON no puede contener comentarios, `undefined`, `NaN` ni comas finales.

---

## 4. TIPOS DE NODO PERMITIDOS

Utiliza exclusivamente:

| Tipo | Función |
| --- | --- |
| `section` | Hero, features, showcase, CTA, footer o franja principal. |
| `container` | Fila, columna, wrapper, grid o agrupación. |
| `card` | Tarjeta, panel o bloque editorial repetible. |
| `heading` | Títulos `h1` a `h6`. |
| `text` | Párrafos, labels, eyebrows, metadata y descripciones. |
| `button` | Acción o enlace visual. |
| `image` | Imagen reemplazable. |
| `svg` | Icono o gráfico vectorial inline reemplazable. |
| `divider` | Separador visual. |
| `spacer` | Espacio explícito excepcional. |

No uses tipos inventados ni `grid`, `richtext`, `gallery`, `video`, `form`, `input` u otros tipos fuera de esta lista.

---

## 5. ANATOMÍA DE LOS NODOS

Nodo básico:

```json
{
  "id": "hero-title",
  "type": "heading",
  "name": "Hero title",
  "tag": "h1",
  "htmlTag": "h1",
  "ariaLabel": "",
  "content": "Título visible",
  "styles": {
    "base": {},
    "tablet": {},
    "mobile": {}
  },
  "states": {}
}
```

Propiedades generales admitidas:

- `id`
- `type`
- `name`
- `tag`
- `htmlTag`
- `ariaLabel`
- `content`
- `href`
- `src`
- `alt`
- `svgCode`
- `styles`
- `states`
- `children`
- `globalClassIds`
- `styleClassId`
- `styleEditMode`
- `bemBlock`
- `bemElement`
- `bemModifiers`
- `customClasses`
- `customCss`

Reglas:

- Cada `id` debe ser único, descriptivo y usar kebab-case.
- Cada nodo requiere `id`, `type`, `name` y `styles.base`.
- Los hijos se guardan en `children`.
- Los nodos de contenido no deben tener hijos innecesarios.
- Usa HTML semántico: `main`, `section`, `article`, `header`, `footer`, `nav`, `h1`, `h2`, `p`, `a`.
- La página debe tener un único `h1` principal.

---

## 6. TOKENS DEL PROYECTO

Construye los tokens antes que los nodos. Los tokens comparten valores; no sustituyen las clases compartidas.

### Categorías obligatorias

- `colors`: fondos, superficies, texto, texto secundario, marca, acento y bordes.
- `typography`: familias y tamaños tipográficos reutilizables.
- `spacing`: escala de separación.
- `radius`: radios reutilizables.
- `shadows`: sombras visibles y repetidas.

Ejemplo:

```json
{
  "colors": {
    "background": {
      "name": "Background",
      "value": "#0c0d10",
      "cssVar": "--color-background"
    },
    "text": {
      "name": "Text",
      "value": "#f7f7f5",
      "cssVar": "--color-text"
    },
    "accent": {
      "name": "Accent",
      "value": "#f45a2a",
      "cssVar": "--color-accent"
    }
  }
}
```

Uso:

```json
{
  "background": "var(--color-background)",
  "color": "var(--color-text)",
  "gap": "var(--space-lg)",
  "borderRadius": "var(--radius-md)"
}
```

Buenas prácticas:

- Crea un sistema pequeño y coherente.
- No crees un token por cada valor aislado.
- No dupliques tokens con el mismo propósito.
- Toda referencia `var(--...)` debe apuntar a un `cssVar` existente.
- Conserva valores directos solamente cuando sean excepciones reales.

---

## 7. CLASES COMPARTIDAS

Las clases compartidas son obligatorias para cualquier patrón visual que aparezca dos o más veces.

Esto incluye:

- títulos con el mismo rol;
- párrafos equivalentes;
- eyebrows, labels y metadata;
- botones primarios y secundarios;
- cards y cada parte interna;
- imágenes con el mismo tratamiento;
- contenedores con la misma receta;
- secciones con layout equivalente.

### Definición

```json
{
  "id": "class-feature-title",
  "name": "feature-title",
  "description": "Título de cada beneficio",
  "styles": {
    "base": {
      "color": "var(--color-text)",
      "fontFamily": "var(--font-family-sans)",
      "fontSize": "var(--font-heading-3)",
      "fontWeight": 700,
      "lineHeight": 1.15
    },
    "mobile": {
      "fontSize": "24px"
    }
  },
  "states": {}
}
```

### Vinculación

```json
{
  "id": "feature-title-speed",
  "type": "heading",
  "name": "Speed title",
  "tag": "h3",
  "htmlTag": "h3",
  "content": "Ship with confidence",
  "globalClassIds": ["class-feature-title"],
  "styleClassId": "class-feature-title",
  "styleEditMode": "shared",
  "styles": {
    "base": {}
  },
  "states": {}
}
```

Significado:

- `globalClassIds`: clases aplicadas al nodo.
- `styleClassId`: clase principal que Orbit modificará desde el Inspector.
- `styleEditMode: "shared"`: los cambios se propagan a todos los usos.
- `styleEditMode: "local"`: los cambios nuevos afectan solamente a ese nodo.

### Overrides

Los estilos comunes viven en la clase. El nodo solo contiene diferencias reales.

```json
{
  "id": "feature-card-highlighted",
  "type": "card",
  "name": "Highlighted feature",
  "globalClassIds": ["class-feature-card"],
  "styleClassId": "class-feature-card",
  "styleEditMode": "shared",
  "styles": {
    "base": {
      "background": "var(--color-accent)",
      "borderWidth": "0px"
    }
  },
  "states": {},
  "children": []
}
```

Reglas críticas:

- No copies en cada nodo los estilos que ya existen en la clase.
- No guardes contenido, enlaces o imágenes dentro de una clase.
- No crees una clase de un solo uso salvo que sea parte explícita del sistema.
- Agrupa por función visual, no por coincidencia accidental.
- Para una familia de cards crea clases separadas: `feature-card`, `feature-card-label`, `feature-card-title`, `feature-card-body`, `feature-card-image` y `feature-card-action`.
- Un cambio de color, fuente, tamaño, padding, margin, gap, borde, radio o responsive en la clase debe afectar todos los nodos vinculados.

---

## 8. ESTILOS AUTORIZADOS

Solo se permiten estas propiedades:

```text
width, maxWidth, minWidth, height, maxHeight, minHeight, aspectRatio,
boxSizing,
paddingTop, paddingRight, paddingBottom, paddingLeft,
marginTop, marginRight, marginBottom, marginLeft,
gap, columnGap, rowGap,
display, direction, flexWrap,
justifyContent, justify, alignItems, align,
justifyItems, alignContent,
gridColumns, gridRows,
gridTemplateColumns, gridTemplateRows, gridTemplateAreas,
gridArea, gridColumn, gridRow,
gridAutoColumns, gridAutoRows, gridAutoFlow, gridUseMinMax,
gridColumnTracks, gridRowTracks,
order, verticalAlign, alignSelf, justifySelf,
flexGrow, flexShrink, flexBasis,
position, zIndex, left, top, right, bottom,
transform, transition, cursor, pointerEvents,
background, color,
fontFamily, fontSize, fontWeight, lineHeight, letterSpacing,
textAlign, fontStyle, textTransform, textDecoration,
textShadow, fontVariationSettings, whiteSpace, textWrap,
borderRadius, borderWidth, borderColor,
opacity, boxShadow, objectFit, overflow
```

Reglas:

- Usa valores CSS válidos.
- No uses abreviaturas `padding`, `margin`, `border` o `font`.
- No uses `className`, `style`, `css`, `positionX` ni propiedades inventadas.
- Los estilos incompatibles no deben trasladarse a `customCss` salvo que sean indispensables y no exista alternativa.

### Fondos avanzados

Orbit admite color, imagen, gradiente y overlay mediante `backgroundConfig`. Incluye también el valor CSS final en `styles.base.background` para que la salida sea portable.

```json
{
  "backgroundConfig": {
    "mode": "overlay",
    "color": "var(--color-background)",
    "imageSrc": "https://picsum.photos/seed/orbit-hero/1600/1000",
    "imageSize": "cover",
    "imagePosition": "center center",
    "imageRepeat": "no-repeat",
    "gradientType": "linear",
    "gradientAngle": 135,
    "gradientStart": "var(--color-primary)",
    "gradientEnd": "var(--color-accent)",
    "overlayColor": "#000000",
    "overlayOpacity": 0.45
  },
  "styles": {
    "base": {
      "background": "linear-gradient(color-mix(in srgb, #000000 45%, transparent), color-mix(in srgb, #000000 45%, transparent)), url(\"https://picsum.photos/seed/orbit-hero/1600/1000\") center center / cover no-repeat"
    }
  }
}
```

Reglas:

- `mode: "color"` usa `color`.
- `mode: "image"` usa `imageSrc`, `imageSize`, `imagePosition` e `imageRepeat`.
- `mode: "gradient"` usa tipo, ángulo y colores inicial/final.
- `mode: "overlay"` coloca `overlayColor` con `overlayOpacity` sobre `imageSrc`.
- Usa variables del proyecto para los colores siempre que correspondan.
- No confundas una imagen de fondo decorativa con un icono; los iconos siempre son SVG.
- Si el fondo se repite, `backgroundConfig` puede vivir en la clase compartida.

---

## 9. BREAKPOINTS Y RESPONSIVE

Grupos admitidos dentro de `styles`:

```text
base
desktopXL
desktop
tablet
mobileL
mobile
```

Interpretación:

- `base`: escritorio y fuente principal.
- `desktopXL`: pantallas amplias, opcional.
- `desktop`: override de escritorio, opcional.
- `tablet`: aproximadamente 834–1024 px.
- `mobileL`: aproximadamente 640–768 px, opcional.
- `mobile`: aproximadamente 390–480 px.

Reglas:

- Infiere responsive conservando jerarquía e intención.
- Los grids de varias columnas normalmente pasan a una columna en mobile.
- Reduce padding lateral, gaps y tamaños display de forma proporcional.
- Evita anchos fijos que produzcan overflow.
- No reduzcas tipografía hasta volverla ilegible.
- Usa `width: "100%"` en botones mobile solamente cuando la composición lo justifique.
- Mantén proporciones de imagen con `aspectRatio` y `objectFit`.
- Los estilos responsive compartidos deben vivir en la clase.
- Las excepciones responsive de una instancia permanecen en el nodo.

---

## 10. ESTADOS

Estados admitidos:

```json
{
  "states": {
    "hover": {},
    "focus": {},
    "active": {},
    "disabled": {}
  }
}
```

Si la captura no muestra un estado, usa solamente interacciones discretas y coherentes. No inventes efectos llamativos.

Los estados repetidos deben vivir dentro de la clase compartida.

---

## 11. IMÁGENES

### Los iconos no son imágenes

- Nunca representes un icono mediante un nodo `image`.
- No uses Picsum, fotografías, emojis, caracteres Unicode ni imágenes raster como sustitutos de iconos.
- Todo icono debe ser un nodo `svg` con código vectorial inline dentro de `svgCode`.
- Usa SVG simple, monocromático y editable con `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `stroke-width="1.8"`, `stroke-linecap="round"` y `stroke-linejoin="round"`, salvo que la referencia requiera relleno.
- El SVG debe aproximar la función visual observada: flecha, búsqueda, menú, usuario, calendario, check, estrella, etc.
- No incrustes `<image>`, base64, scripts, estilos externos, `foreignObject` ni URLs dentro del SVG.
- Si varios iconos comparten tamaño, color o contenedor, vincúlalos a una clase compartida.
- El usuario podrá reemplazar posteriormente `svgCode` desde el editor SVG de Orbit o subiendo otro archivo `.svg`.

Ejemplo:

```json
{
  "id": "feature-icon-speed",
  "type": "svg",
  "name": "Speed icon",
  "htmlTag": "span",
  "ariaLabel": "Velocidad",
  "svgCode": "<svg viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M13 2 4.5 13H11l-1 9L19.5 11H13l0-9Z\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>",
  "globalClassIds": ["class-feature-icon"],
  "styleClassId": "class-feature-icon",
  "styleEditMode": "shared",
  "styles": {
    "base": {}
  },
  "states": {}
}
```

Los logos vectoriales también pueden usar `svg`, pero deben conservar su geometría si el usuario suministra el archivo original. No inventes un logotipo de marca a partir de una captura borrosa.

### IMAGE_MODE: temporary

Usa placeholders deterministas:

```text
https://picsum.photos/seed/proyecto-pagina-funcion/1600/1000
```

La semilla debe ser única y descriptiva. Las dimensiones deben respetar la proporción observada.

### IMAGE_MODE: real

Usa exclusivamente las URLs entregadas en `IMAGE_URL_MAP`. No alteres, completes ni inventes URLs.

### IMAGE_MODE: hybrid

Usa URLs reales donde estén disponibles y placeholders deterministas para las imágenes faltantes.

### Nodo de imagen

```json
{
  "id": "hero-image",
  "type": "image",
  "name": "Hero image",
  "htmlTag": "img",
  "src": "https://picsum.photos/seed/orbit-home-hero/1600/1000",
  "alt": "Descripción visual útil de la imagen",
  "styles": {
    "base": {
      "width": "100%",
      "aspectRatio": "8 / 5",
      "objectFit": "cover",
      "borderRadius": "var(--radius-md)"
    }
  },
  "states": {}
}
```

Reglas:

- Toda imagen necesita `src` y `alt`.
- Usa nodos `image`, no fondos CSS, cuando sea contenido reemplazable.
- `cover` se usa cuando hay recorte visual.
- `contain` se usa para producto, interfaz o ilustración completa.
- No utilices base64, blobs ni rutas locales.
- Una imagen adjunta al chat no se convierte automáticamente en una URL permanente.
- Registra en `assets` las imágenes conocidas utilizando el mismo `src`.

Ejemplo de asset:

```json
{
  "id": "asset-hero",
  "name": "Hero",
  "src": "https://picsum.photos/seed/orbit-home-hero/1600/1000",
  "type": "image/webp",
  "alt": "Descripción de la imagen principal"
}
```

---

## 12. CONTENIDO Y ACCESIBILIDAD

- Conserva el texto visible cuando sea legible.
- Si no es legible, usa texto de longitud y ritmo similares.
- No reemplaces tres líneas por una frase corta.
- Mantén un único `h1`.
- Conserva el orden semántico de lectura.
- Todas las imágenes necesitan `alt`.
- Todos los iconos son SVG inline, tienen `ariaLabel` cuando comunican significado y pueden reemplazarse sin usar imágenes raster.
- Los botones y enlaces requieren texto comprensible.
- No uses color como única señal de significado.
- Mantén contraste suficiente sin cambiar la intención del diseño.

---

## 13. VALIDACIÓN OBLIGATORIA ANTES DE RESPONDER

Comprueba internamente:

### JSON

- Es JSON válido.
- La raíz tiene todas las propiedades obligatorias.
- `version` es `12`.
- No hay comentarios ni comas finales.

### Estructura

- Todos los IDs de nodo son únicos.
- Todos los IDs y nombres de clase son únicos.
- Todos los tipos de nodo están autorizados.
- Cada nodo tiene `styles.base`.
- Todas las referencias de clase existen.
- `styleClassId` también está incluido en `globalClassIds`.

### Sistema visual

- Los tokens utilizados existen.
- No hay tokens duplicados sin propósito.
- Todo patrón repetido tiene clase compartida.
- Los nodos no duplican estilos de sus clases.
- Los overrides contienen solamente diferencias.
- Los estilos responsive comunes viven en la clase.

### Fidelidad

- La cantidad y orden de secciones coincide.
- La retícula coincide con la referencia.
- La alineación coincide.
- Las proporciones son coherentes.
- La jerarquía tipográfica coincide.
- Los espacios no fueron uniformados arbitrariamente.
- Los colores, radios y sombras corresponden a la referencia.
- Las imágenes mantienen proporción y recorte.

### Responsive y accesibilidad

- Desktop, tablet y mobile están resueltos.
- No existe overflow horizontal accidental.
- Hay un solo `h1`.
- Todas las imágenes tienen `alt`.

---

## 14. PROTOCOLO PARA ACERCARSE A PIXEL PERFECT

Una primera generación desde una captura debe considerarse una reconstrucción inicial de alta fidelidad. Para corregir diferencias medibles se utiliza una segunda iteración.

### Primera iteración

1. Genera el Orbit JSON siguiendo este documento.
2. Importa el JSON en Orbit.
3. Abre la misma resolución usada por la referencia.
4. Usa Fit on screen.
5. Captura el resultado completo de Orbit.

### Segunda iteración

Entrega a la IA:

- la imagen original;
- la captura del resultado en Orbit;
- el Orbit JSON generado;
- este documento maestro.

Utiliza esta instrucción:

```text
Compara pixel por pixel la referencia original con la captura del resultado importado en Orbit. Corrige el Orbit JSON sin rediseñar.

Prioriza:
1. dimensiones generales y límites de sección;
2. retícula, posiciones y alineación;
3. padding, margin, gaps y ritmo vertical;
4. escala, peso, interlineado y saltos tipográficos;
5. colores, bordes, radios y sombras;
6. proporción y recorte de imágenes;
7. responsive.

Mantén IDs, tokens, globalClasses y referencias existentes. No conviertas estilos compartidos en copias locales. Devuelve únicamente el JSON completo corregido.
```

Repite la comparación hasta que las diferencias restantes provengan solamente de fuentes o imágenes no disponibles.

---

## 15. PLANTILLA DE SOLICITUD PARA EL USUARIO

El usuario puede adjuntar la imagen, este documento y escribir únicamente:

```text
Sigue completamente ORBIT-AI-MASTER-AUTHORING.md y maqueta la imagen adjunta en Orbit JSON v12.

PROJECT_NAME: [nombre]
PAGE_NAME: [página]
PAGE_LANGUAGE: [idioma]
REFERENCE_WIDTH: [ancho de la captura en px]
IMAGE_MODE: [temporary | real | hybrid]
IMAGE_URL_MAP:
- [función de imagen]: [URL]

No rediseñes. Respeta exactamente la composición, proporciones, jerarquía, espaciado, tipografía, colores, clases compartidas y responsive de la referencia.

Devuelve únicamente el JSON importable.
```

Si no hay imágenes reales disponibles, usa:

```text
IMAGE_MODE: temporary
IMAGE_URL_MAP: none
```

---

## 16. CRITERIO FINAL DE ACEPTACIÓN

El resultado es aceptable únicamente si:

- puede importarse en Orbit sin reparación manual estructural;
- reproduce la referencia sin rediseño;
- se adapta a desktop, tablet y mobile;
- los elementos equivalentes comparten clases reales;
- editar una clase actualiza todos sus usos;
- las excepciones permanecen como overrides mínimos;
- las imágenes pueden reemplazarse fácilmente desde Assets;
- no contiene propiedades incompatibles;
- mantiene una estructura semántica y accesible.

FIN DEL CONTRATO.
