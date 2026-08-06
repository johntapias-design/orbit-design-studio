# Orbit JSON Authoring Guide

Versión del contrato: **Orbit JSON v12**  
Objetivo: convertir capturas de Figma, referencias visuales o briefs en documentos que Orbit Design Studio pueda analizar e importar.

## 1. Archivos que debe recibir la IA

Para una generación consistente, entrega siempre:

1. La captura del diseño.
2. Este archivo: `docs/orbit-json-authoring-guide.md`.
3. El esquema: `schemas/orbit-json-v12.schema.json`.
4. Un ejemplo válido: `examples/landing-page-ai.orbit.json`.
5. El prompt de producción: `prompts/screenshot-to-orbit-json.md`.

La captura comunica el resultado visual. La guía y el esquema indican cómo expresarlo sin inventar propiedades incompatibles.

## 2. Alcance actual del importador

- Cada archivo representa **una página**.
- `nodes` es la página que se importará.
- Para un sitio con varias páginas, genera un JSON por página e impórtalos usando la opción **Nueva página**.
- Orbit admite tokens, assets, clases y componentes. En toda generación con IA se debe usar:
  - `tokens` para valores de diseño reutilizables.
  - `assets` para imágenes conocidas.
  - `globalClasses` para cualquier patrón visual que aparezca dos o más veces.
  - `styleClassId` en cada nodo vinculado para indicar qué clase edita el Inspector.
  - `components: []` en este contrato de página. Los componentes estructurales pueden crearse después desde Orbit; las relaciones visuales no deben posponerse.
- El JSON debe ser válido y no debe incluir comentarios.

## 3. Estructura mínima

```json
{
  "version": 12,
  "projectName": "Nombre del proyecto",
  "pageMeta": {
    "language": "es",
    "title": "Título SEO",
    "description": "Descripción de la página"
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
  "globalClasses": [
    {
      "id": "class-section-title",
      "name": "section-title",
      "styles": {
        "base": {
          "color": "var(--color-text)",
          "fontSize": "var(--font-heading-2)",
          "fontWeight": 700,
          "lineHeight": 1.1
        }
      },
      "states": {}
    }
  ],
  "nodes": []
}
```

## 4. Tipos de nodos permitidos

La IA solo debe usar estos tipos:

| Tipo | Uso |
| --- | --- |
| `section` | Franja principal de página: hero, features, CTA, footer. |
| `container` | Agrupación, grid, fila o columna. |
| `card` | Tarjeta visual o bloque editorial. |
| `heading` | Títulos H1–H6. |
| `text` | Párrafos, labels, eyebrows y metadata. |
| `button` | Botón o enlace de acción. |
| `image` | Imagen reemplazable desde Assets. |
| `svg` | Icono o gráfico vectorial inline reemplazable. |
| `divider` | Separador visual. |
| `spacer` | Espacio explícito cuando no es suficiente `gap` o `padding`. |

No usar tipos como `grid`, `richtext`, `gallery`, `video`, `form` o tipos inventados dentro de un Orbit JSON generado por IA. El importador actual los normalizará y puede alterar el resultado.

## 5. Anatomía de un nodo

```json
{
  "id": "hero-title",
  "type": "heading",
  "name": "Hero title",
  "tag": "h1",
  "htmlTag": "h1",
  "content": "Texto visible",
  "ariaLabel": "",
  "globalClassIds": ["class-display-title"],
  "styleClassId": "class-display-title",
  "styleEditMode": "shared",
  "styles": {
    "base": {},
    "tablet": {
      "fontSize": "52px"
    },
    "mobile": {
      "fontSize": "40px"
    }
  }
}
```

Reglas:

- Cada `id` debe ser único, estable, descriptivo y usar kebab-case.
- Cada nodo necesita `id`, `type`, `name` y `styles.base`.
- Los hijos se guardan en `children`.
- Solo los contenedores visuales deben incluir `children`.
- No repetir bloques con IDs idénticos.
- Usar `htmlTag` semántico cuando corresponda: `main`, `section`, `nav`, `article`, `header`, `footer`, `h1`, `p`, `a`.
- Si el nodo pertenece a un patrón repetido, sus estilos comunes no se duplican en `styles`; se guardan en `globalClasses`.

## 6. Clases compartidas: obligatorias para patrones repetidos

Una captura no solo se traduce a una colección de nodos. La IA debe detectar el sistema visual implícito y expresar las relaciones entre elementos equivalentes.

Se consideran patrones repetidos:

- títulos con el mismo rol visual;
- párrafos, eyebrows, labels y metadata equivalentes;
- botones primarios o secundarios;
- cards y sus partes internas;
- imágenes con el mismo tratamiento;
- contenedores, grids o secciones con la misma receta de layout;
- cualquier conjunto de dos o más elementos que debería cambiar conjuntamente.

### Estructura de una clase

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

Cada nodo relacionado debe declarar:

```json
{
  "id": "feature-title-speed",
  "type": "heading",
  "name": "Speed title",
  "content": "Ship with confidence",
  "globalClassIds": ["class-feature-title"],
  "styleClassId": "class-feature-title",
  "styleEditMode": "shared",
  "styles": {
    "base": {}
  }
}
```

Significado:

- `globalClassIds`: clases que participan en la cascada del nodo.
- `styleClassId`: clase principal que modificará el Inspector.
- `styleEditMode: "shared"`: las nuevas modificaciones de diseño actualizan la clase y todos sus usos.
- `styleEditMode: "local"`: las nuevas modificaciones se guardan solamente en ese nodo.

### Overrides locales

Las diferencias reales se conservan dentro de `styles` del nodo. No se debe copiar la receta completa.

```json
{
  "id": "feature-card-highlighted",
  "globalClassIds": ["class-feature-card"],
  "styleClassId": "class-feature-card",
  "styleEditMode": "shared",
  "styles": {
    "base": {
      "background": "var(--color-accent)",
      "color": "#ffffff"
    }
  }
}
```

En este caso, padding, radio, layout y tamaño siguen viniendo de `class-feature-card`; solamente fondo y color son distintos.

### Reglas de agrupación

- Compartir por función visual, no únicamente porque dos valores coincidan por casualidad.
- No crear una clase de un solo uso salvo que forme parte explícita del sistema de diseño.
- No incluir contenido, `src`, `href` o texto dentro de una clase: las clases solo contienen estilos y estados.
- No duplicar en el nodo propiedades que ya provienen de la clase.
- Una variante puede mantener la clase base y declarar overrides mínimos.
- Si una familia comparte estructura y estilos, usa clases para cada parte: `card`, `card-title`, `card-body`, `card-image`, `card-action`.
- El importador de Orbit también detecta estilos exactamente repetidos y puede convertirlos en clases automáticas, pero la IA debe entregar relaciones semánticas explícitas siempre que pueda inferirlas.

## 7. Tokens: se crean antes que los nodos

La IA debe analizar la captura y construir primero un sistema reducido y coherente.

### Categorías

- `colors`: marca, acento, fondo, superficie, texto, texto secundario y bordes.
- `typography`: familias y tamaños tipográficos.
- `spacing`: escala reutilizable de separación.
- `radius`: radios de tarjetas, controles y pills.
- `shadows`: elevaciones realmente visibles.

Ejemplo:

```json
"colors": {
  "brand": {
    "name": "Brand",
    "value": "#111318",
    "cssVar": "--color-brand"
  },
  "accent": {
    "name": "Accent",
    "value": "#ff5a36",
    "cssVar": "--color-accent"
  }
}
```

Uso en nodos:

```json
"background": "var(--color-brand)",
"color": "var(--color-accent)",
"gap": "var(--space-lg)",
"borderRadius": "var(--radius-md)"
```

Buenas prácticas:

- Entre 6 y 12 colores suele ser suficiente.
- No crear un token nuevo para cada valor aislado.
- No duplicar tokens con distinto nombre y el mismo propósito.
- Los valores puntuales que solo aparecen una vez pueden permanecer directos.
- Las referencias deben coincidir exactamente con `cssVar`.

## 8. Estilos compatibles

Solo se deben usar las propiedades enumeradas por el esquema. Las principales son:

- Tamaño: `width`, `maxWidth`, `minWidth`, `height`, `minHeight`, `aspectRatio`.
- Espaciado: `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft`, `marginTop`, `marginRight`, `marginBottom`, `marginLeft`, `gap`, `columnGap`, `rowGap`.
- Layout: `display`, `direction`, `flexWrap`, `justifyContent`, `justify`, `alignItems`, `align`, `gridColumns`, `gridRows`, `gridTemplateColumns`, `gridTemplateRows`.
- Apariencia: `background`, `color`, `borderRadius`, `borderWidth`, `borderColor`, `opacity`, `boxShadow`, `overflow`.
- Tipografía: `fontFamily`, `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing`, `textAlign`, `fontStyle`, `textTransform`, `textDecoration`, `textWrap`.
- Imagen: `objectFit`.

Usar valores CSS válidos. No usar propiedades abreviadas como `padding`, `margin`, `border` o `font`, porque Orbit trabaja con controles individuales.

Para fondos avanzados, usa `backgroundConfig` con `mode: color`, `image`, `gradient` u `overlay`, y conserva el resultado CSS en `styles.base.background`. Las imágenes de fondo pueden usar Assets o URL; los colores del gradiente y overlay deben reutilizar variables del proyecto cuando existan.

## 9. Responsive

La captura normalmente representa Desktop. La IA debe inferir Tablet y Mobile sin destruir la jerarquía.

- `base`: escritorio y fuente principal del estilo.
- `tablet`: ajuste alrededor de 834–1024 px.
- `mobile`: ajuste alrededor de 390–480 px.
- `desktopXL` y `mobileL` son opcionales y solo deben usarse si la referencia lo necesita.

Reglas recomendadas:

- Los grids de dos o tres columnas pasan a una columna en Mobile.
- Reducir padding lateral, tamaños de display y gaps.
- Evitar anchos fijos que generen overflow.
- Botones pueden ocupar `100%` en Mobile cuando la composición lo pida.
- Las imágenes deben conservar una proporción controlada mediante `aspectRatio` y `objectFit`.
- No ocultar contenido importante para resolver el responsive.

## 10. Estrategia de imágenes

### Modo A — Prueba rápida con placeholders

Es el modo recomendado para comenzar las pruebas de maquetación e importación.

Usar URLs determinísticas:

```text
https://picsum.photos/seed/orbit-home-hero/1600/1000
https://picsum.photos/seed/orbit-home-feature-01/1200/900
https://picsum.photos/seed/orbit-home-avatar-01/600/600
```

No usar `https://picsum.photos/images` ni URLs aleatorias sin `seed`.

La semilla debe describir proyecto, página y función. Cada URL debe declarar dimensiones cercanas a la proporción observada en la captura.

### Modo B — Imágenes reales mediante URL

Si las imágenes ya están publicadas, entrega a la IA un mapa explícito:

```text
hero-product = https://cdn.example.com/product/hero.webp
feature-dashboard = https://cdn.example.com/product/dashboard.webp
testimonial-avatar-ana = https://cdn.example.com/team/ana.jpg
```

La IA debe copiar esas URLs sin modificarlas.

### Modo C — Imágenes locales todavía no publicadas

Una imagen adjunta a GPT o Claude no tiene automáticamente una URL utilizable por Orbit. En este caso:

1. La IA usa un placeholder determinístico con la proporción correcta.
2. El nodo recibe un nombre y `alt` descriptivos.
3. Se importa el JSON.
4. La imagen se reemplaza desde la biblioteca **Assets** de Orbit.

### Reglas para imágenes

- Los iconos nunca deben ser nodos `image`: deben usar `type: "svg"` y código inline reemplazable en `svgCode`.
- No usar fotos, Picsum, emojis ni caracteres como sustitutos de iconos.
- El SVG no debe contener scripts, base64, `<image>`, `foreignObject` ni recursos externos.

- Las imágenes de contenido deben ser nodos `image`, no fondos CSS, para facilitar el reemplazo.
- Siempre incluir `alt`.
- Usar `objectFit: "cover"` cuando la captura muestra recorte.
- Usar `objectFit: "contain"` para producto, interfaz o ilustración que debe verse completa.
- Mantener el mismo `src` en el nodo y en el registro de `assets`.
- No incrustar base64 generado por la IA.
- No inventar rutas locales del equipo del usuario.

## 11. Fidelidad respecto a la captura

Prioridad de interpretación:

1. Estructura y orden de secciones.
2. Proporciones, ancho máximo y ritmo vertical.
3. Jerarquía tipográfica.
4. Colores, superficies, bordes y sombras.
5. Comportamiento responsive.
6. Contenido visible.
7. Imágenes y recortes.

La IA no debe “mejorar” ni rediseñar la referencia salvo que el usuario lo pida. Cuando algo no sea legible, debe conservar la intención visual y usar contenido neutral de longitud semejante.

## 12. Checklist antes de entregar

- El resultado contiene únicamente JSON, sin Markdown.
- `version` es `12`.
- `nodes` existe y contiene al menos una `section`.
- Todos los IDs son únicos.
- Todos los tipos de nodo están permitidos.
- Cada nodo tiene `styles.base`.
- Todo patrón visual repetido tiene una entrada en `globalClasses`.
- Cada nodo vinculado declara `globalClassIds`, `styleClassId` y `styleEditMode`.
- Los estilos comunes viven en la clase; los nodos contienen solamente diferencias locales.
- Todas las referencias de clase apuntan a IDs existentes.
- No existen nombres ni IDs de clase duplicados.
- Solo se usan propiedades compatibles.
- Las variables utilizadas existen dentro de `tokens`.
- Hay un solo `h1` principal.
- Todas las imágenes tienen `src`, `alt`, proporción y `objectFit`.
- No existen URLs aleatorias de imágenes.
- Tablet y Mobile están resueltos.
- No hay valores `undefined`, `NaN`, comentarios ni comas finales.

## 13. Importación en Orbit

1. Abre Orbit.
2. Pulsa **Importar** en la barra izquierda.
3. Entra en **Orbit JSON / IA**.
4. Carga el archivo `.json` o pega su contenido.
5. Pulsa **Analizar**.
6. Revisa advertencias, número de nodos, imágenes, tokens, clases y usos de clase.
7. Elige reemplazar, añadir o crear una nueva página.
8. Importa y utiliza **Fit on screen** para revisar el resultado.
9. Reemplaza placeholders desde **Assets** cuando la estructura esté aprobada.
10. Selecciona un elemento repetido y comprueba el indicador **Compartido** en Editar. Cambiar una propiedad debe actualizar todos los elementos vinculados; usa **Solo este** únicamente para una excepción.
