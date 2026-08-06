# Informe técnico integral y cronológico — Orbit Design Studio

**Producto:** Orbit Design Studio  
**Línea funcional visible:** v0.12 — Components Pro  
**Estado documentado:** 6 de agosto de 2026  
**Ubicación actual:** `/Users/johntapias/Documents/Orbit`  
**Tipo de entrega actual:** aplicación web standalone, estática y autocontenida  
**Última validación integral:** aprobada, 0 fallos y 0 errores de runtime

> Alcance de trazabilidad. Este informe reconstruye el proyecto usando la aplicación actual, sus documentos, el esquema y ejemplo Orbit JSON, la suite QA, las evidencias visuales y el historial disponible de las conversaciones. La carpeta actual no es un repositorio Git y no conserva los árboles modulares ni los ZIP históricos; por ello, los archivos y cambios antiguos se documentan cuando existe evidencia conversacional verificable. No se inventan commits, fechas ni archivos que no puedan demostrarse.

---

## 1. Resumen ejecutivo del proyecto

Orbit Design Studio es un constructor visual de sitios orientado a producir proyectos Astro. Su propuesta combina edición visual, sistema responsive, tokens de diseño, componentes reutilizables, clases compartidas, edición de código, auditoría, SEO, persistencia local e importación/exportación mediante un formato Orbit JSON apto para generación asistida por IA.

La evolución comenzó con **v0.12 Components Pro** y después avanzó por fases: orden documental y releases, modularización, accesibilidad, persistencia y herramientas de precisión, automatización QA, preparación para TypeScript, recuperación robusta de proyectos, Inspector Pro, Theme System Pro y navegación avanzada del canvas. La última etapa fue una revisión profunda de UX: canvas fluido, barra contextual, paneles laterales reorganizados, dashboard editorial, controles responsive y zoom profesionales, Code Studio, Google Fonts, gestión completa de tokens, color unificado, clases compartidas para importaciones de IA, SVG editables y fondos avanzados.

El estado actual es funcional y fue validado en **1024×768, 1600×900 y 3440×1440**. La prueba vigente confirma que no existe overflow global, el canvas se centra y reajusta, los paneles no dejan huecos, el tema claro funciona, las acciones son accesibles y las funciones recientes operan sin errores de JavaScript.

La principal deuda ya no es funcional sino de ingeniería de producto: la entrega actual concentra aproximadamente 1 MB y 13.342 líneas en `index.html`, no conserva un repositorio Git ni un pipeline CI activo dentro de esta carpeta y todavía se identifica globalmente como v0.12 aunque contiene muchas mejoras posteriores. Antes de continuar ampliando el producto conviene recuperar una fuente modular, versionar el esquema, automatizar CI y crear una versión nueva coherente —por ejemplo v0.13 o v0.14—.

---

## 2. Objetivo general y alcance

### 2.1 Objetivo general

Crear un entorno visual profesional para diseñar páginas y sistemas web, conservarlos localmente, probarlos en diferentes breakpoints y exportarlos como proyectos Astro limpios, reutilizables y editables.

### 2.2 Alcance funcional alcanzado

- Dashboard local de proyectos con creación, importación, búsqueda, filtros, archivo, versiones y respaldo.
- Editor visual con árbol de elementos, selección, selección múltiple, arrastre, resize, edición directa y Quick Insert.
- Canvas navegable con zoom, paneo, ajuste, centrado, reglas, guías, mediciones, minimapa y memoria por contexto.
- Responsive System con cinco vistas configurables y comparación Desktop/Tablet/Mobile.
- Inspector de seis áreas: Contenido, Diseño/Apariencia, Estructura/Layout, Responsive, Estados/Interacciones y Avanzado.
- Tokens de color, tipografía, espaciado, radio y sombras, con CRUD y eliminación segura por categoría.
- Fuentes locales del sistema y biblioteca Google Fonts instalada por proyecto.
- Componentes maestros, instancias, variantes, props y overrides.
- Clases globales compartidas y overrides locales para elementos repetidos.
- Edición contextual de texto y editor avanzado de fondos.
- Code Studio con HTML, CSS, JavaScript y preview.
- SEO por página, Page Health, auditoría responsive y controles antes de exportar.
- Importación HTML/CSS, Design System y Orbit JSON generado por IA.
- Exportación de proyecto Astro multipágina, componentes, assets, estilos y copia Orbit JSON.
- Tema oscuro, claro o sistema, separado del diseño del canvas.
- Accesibilidad por teclado, foco, ARIA, reducción de movimiento y nombres accesibles.

### 2.3 Fuera del alcance actual

- Backend, cuentas, autenticación, nube o colaboración en tiempo real.
- Historial Git disponible en la carpeta actual.
- Compilación interna de Astro: Orbit genera el proyecto, pero no lo compila dentro del editor.
- Garantía automática de equivalencia pixel-perfect desde una sola captura; existe un protocolo iterativo, no una medición visual inteligente integrada.
- Sincronización con Figma o un proveedor de assets externo.
- Marketplace, plugins o extensiones de terceros.

---

## 3. Funcionalidades implementadas

### 3.1 Workspace y proyectos

El dashboard es la puerta de entrada. No crea un proyecto accidentalmente al abrir la app. Permite crear uno nuevo, importar respaldos, buscar, ordenar, alternar vista, consultar métricas, archivar, duplicar, exportar y abrir proyectos. Los registros se guardan en IndexedDB y disponen de respaldo local si la base principal falla.

La capa de almacenamiento normaliza proyectos antiguos, repara páginas incompletas, limita el historial de versiones, aísla registros corruptos y mantiene visible el dashboard aun si IndexedDB no responde. Incluye acciones de exportar todo, exportar un proyecto y reparar almacenamiento.

### 3.2 Editor y canvas

El canvas representa el sitio que se está maquetando. Admite jerarquía de nodos, selección individual o múltiple, cambio de nombre, duplicación, eliminación, reordenamiento, inserción y edición directa. Los elementos muestran límites de selección, medidas y controles de resize sin modificar el documento exportado.

El espacio se calcula con el área realmente disponible. Al abrir, cerrar o redimensionar cualquiera de los paneles laterales, el lienzo se reajusta y no deja franjas vacías. En pantallas amplias se centra; cuando el contenido excede el área, conserva navegación horizontal real.

### 3.3 Navegación avanzada

- `Espacio + arrastrar` y botón central para desplazar el canvas.
- `Ctrl/Cmd + rueda` para zoom centrado en el cursor.
- Ajuste a pantalla y ajuste al ancho.
- Presets gráficos de zoom y control `+`/`−`.
- `Alt + 0` para fit, `Alt + .` para enfocar selección y `Alt + Inicio` para centrar.
- Memoria de zoom y posición por proyecto, página y breakpoint mediante `orbit:canvas-views:v1`.
- Minimap interactivo, minimizable, expandible y ocultable; `Alt + M` lo alterna.
- Selector contextual para elementos superpuestos mediante clic derecho.

### 3.4 Reglas, guías y precisión

Las reglas horizontal y vertical se dibujan con Canvas 2D, respetan `devicePixelRatio` y muestran unidades reales del documento aunque exista zoom. Las marcas se adaptan a la escala para evitar cientos de nodos DOM.

El usuario puede controlar por separado:

- reglas;
- guías y mediciones naranjas;
- ajuste magnético;
- bloqueo de guías;
- eliminación de guías personalizadas.

Las líneas naranjas ya no son permanentes: el menú explica su significado y permite ocultarlas. La configuración persiste por proyecto/preferencias.

### 3.5 Responsive System Pro

Orbit maneja cinco vistas:

| Vista | Breakpoint CSS predeterminado | Ancho de canvas predeterminado |
| --- | ---: | ---: |
| Desktop XL | 1440 px | 1440 px |
| Desktop | 1200 px | 1200 px |
| Tablet | 1024 px | 834 px |
| Mobile L | 768 px | 640 px |
| Mobile | 480 px | 390 px |

Desktop, Tablet y Mobile son vistas principales; Desktop XL y Mobile L pueden habilitarse o deshabilitarse. El selector responsive está agrupado en un único control y su desplegable usa tarjetas con nombre y medida. Incluye ancho personalizado, administrador de breakpoints y Responsive Compare.

Al cambiar a Mobile o Tablet, Orbit calcula un zoom seguro y centra el dispositivo. Al reducir zoom no deriva hacia la derecha. La comparación responsive puede sincronizar navegación y selección, y cada marco puede ajustarse al espacio.

### 3.6 Barra contextual y dock inferior

La antigua barra inferior de coordenadas fue eliminada. La interfaz contextual distingue dos estados:

- **Sin selección:** muestra acciones globales del documento.
- **Con selección:** muestra acciones del elemento o de la selección múltiple.

La información general del contexto se trasladó a un dock inferior compacto. Las acciones del elemento aparecen cerca de la selección y evitan Quick Insert, Inspector y bordes de viewport. Se retiraron acciones duplicadas de encabezados, Inspector y footer.

### 3.7 Inspector/área “Editar”

El panel derecho se reorganizó como un área de edición permanente, con un rail de iconos del mismo tamaño visual que el sidebar izquierdo. No es necesario abrir primero “Inspector” y luego escoger otra categoría.

Las seis áreas funcionales son:

1. Contenido.
2. Apariencia/Diseño.
3. Estructura/Layout.
4. Responsive.
5. Estados/Interacciones.
6. Avanzado.

El modo reducido “Esencial/Rápido” se retiró del flujo actual: se conserva el conjunto completo. La pestaña activa se guarda. Los tabs usan semántica `tablist`, navegación con flechas, `Home`, `End`, paneles asociados y anuncios accesibles.

### 3.8 Edición contextual de texto

Al seleccionar un nodo de texto, la barra flotante puede controlar:

- familia tipográfica;
- variable tipográfica del proyecto;
- tamaño libre o variable de tamaño;
- negrita;
- cursiva;
- color mediante variables del proyecto o valor personalizado;
- alineación izquierda, centro, derecha y justificado.

Los menús de variables ya no muestran rombos decorativos. El selector de color dejó de presentar una paleta genérica enorme: muestra solamente variables del proyecto y una opción personalizada. El control de edición directa puede activarse o desactivarse y persiste; antes permanecía activo sin forma clara de apagarlo.

### 3.9 Fondos avanzados

El editor de Apariencia evolucionó de un único color a **Background Studio**, con cuatro modos:

- ninguno;
- color;
- imagen;
- gradiente.

Para imagen permite URL o asset del proyecto, `cover`, `contain` o tamaño real, y posiciones predefinidas. Para gradiente permite lineal o radial, ángulo y colores. El overlay agrega color y opacidad encima de imagen o gradiente. La vista previa compone las capas y la configuración se guarda como `backgroundConfig` en nodos y clases compartidas.

### 3.10 Color unificado

Todos los controles de color dentro de “Editar” fueron migrados al mismo patrón usado por tipografía:

- variables de color existentes en el proyecto;
- valor “Personalizado”;
- sin paletas genéricas fijas;
- sin dependencia exclusiva del picker nativo.

El patrón cubre color de texto, fondo, borde, sombra y overlay. Esto mantiene consistencia visual y facilita actualizar un sistema de diseño completo.

### 3.11 Tokens de diseño

Las categorías actuales son colores, tipografía, espaciado, radio y sombras. Se puede:

- crear un token;
- modificar nombre y valor;
- borrar un token;
- limpiar una categoría completa;
- deshacer la limpieza.

La eliminación es segura: Orbit cuenta usos y materializa el valor final en los elementos antes de retirar una variable, evitando que el diseño cambie. El borrado de categoría presenta confirmación y cantidad de referencias.

### 3.12 Google Fonts

Existe un gestor de fuentes por proyecto, con catálogo, búsqueda, pesos, instalación y aplicación. Las fuentes instaladas se convierten en variables tipográficas disponibles en los controles de texto. Orbit genera la URL CSS2 de Google Fonts y agrega `preconnect`/stylesheet tanto en preview standalone como en exportación Astro.

La ventana fue validada en compacto, escritorio y ultrawide: permanece dentro del viewport, tiene scroll útil y ancho controlado.

### 3.13 Clases compartidas y overrides

Los elementos visualmente repetidos pueden compartir una clase global mediante `styleClassId`. Una edición normal actualiza la clase y todos los elementos vinculados; la opción “Solo este” establece `styleEditMode: local` y guarda un override únicamente en la instancia.

El importador admite `globalClasses`, cuenta asignaciones y detecta automáticamente estilos base idénticos en documentos antiguos sin clases. Al insertar o crear una página, mezcla y remapea identificadores para evitar colisiones. Esta mejora resuelve el caso en que títulos, cards u otros patrones iguales importados desde IA no se actualizaban conjuntamente.

### 3.14 Components Pro

La base v0.12 incluye:

- biblioteca con búsqueda, filtros y métricas;
- componentes maestros e instancias;
- variantes independientes por instancia;
- props tipadas para texto, enlaces, imágenes, `alt` y placeholders;
- overrides locales protegidos al sincronizar;
- restablecimiento individual o total;
- duplicación conservando variante y overrides;
- conteo multipágina;
- eliminación segura del maestro;
- generación de componentes Astro con `interface Props`.

Las clases globales resuelven estilo compartido; Components Pro resuelve estructura reutilizable y propiedades. Son capas relacionadas pero diferentes.

### 3.15 Assets, imágenes y SVG

Los assets pueden seleccionarse desde el editor y exportarse. Las imágenes `data:` se escriben en `src/assets`; las referencias externas se conservan para preview/exportación.

El importador Orbit JSON admite nodos `svg` con `svgCode`. Los iconos no se sustituyen por imágenes de Picsum: deben ser SVG semánticos, con `currentColor`, `viewBox` y `ariaLabel` cuando sean funcionales. El contenido SVG pasa por saneamiento antes de renderizarse.

Para diseños generados por IA existen tres estrategias de imagen:

- **temporary:** URLs deterministas de Picsum para pruebas rápidas;
- **real:** URLs finales proporcionadas por el usuario;
- **hybrid:** mezcla de assets finales y placeholders.

### 3.16 Importación Orbit JSON e IA

La importación acepta pegado, selector de archivo y drag-and-drop. Antes de aplicar, Orbit normaliza documento, nodos, tokens, assets, clases y configuración responsive. Los modos son reemplazar página, insertar en la página actual o crear una nueva.

El kit documental define estructura raíz, tipos permitidos, tokens, clases, responsive, imágenes, SVG, accesibilidad, validación y un protocolo de dos iteraciones para aproximarse a pixel-perfect. El ejemplo contiene 31 nodos, cuatro clases globales y al menos once asignaciones compartidas, usadas también por QA.

### 3.17 Code Studio

Code Studio es una superficie amplia, no un editor pequeño en el sidebar. Contiene tres tabs internos:

- HTML;
- CSS;
- JavaScript.

Genera el código de la página activa, permite editarlo, presenta preview en `iframe`, marca cambios sin aplicar, puede ordenar espacios finales, restaurar la versión inicial y aplicar el resultado al documento visual. Antes de aplicar comprueba sintaxis JavaScript y que el HTML tenga contenido. Advierte si se intenta cerrar con cambios pendientes.

### 3.18 Exportación Astro

Orbit genera un ZIP en memoria, sin librería externa, usando CRC32 y estructuras ZIP nativas. El proyecto incluye:

- `package.json` con Astro `^7.1.6`;
- configuración Astro;
- layout base con SEO y Google Fonts;
- páginas `.astro`;
- componentes `.astro`;
- `tokens.css`, `classes.css`, `elements.css` y `global.css`;
- assets locales;
- copia `orbit/project.orbit.json`.

Antes de exportar se ejecuta una auditoría responsive. Si encuentra errores, permite revisarlos o continuar conscientemente.

### 3.19 Preview

La vista previa genera un documento aislado con los estilos actuales, fuentes, scripts de la página y selección opcional. Tiene Desktop XL, Desktop, Tablet, Mobile L, Mobile y Fit. Responsive Compare usa el mismo documento de salida, reduciendo diferencias entre editor y exportación.

### 3.20 Theme System Pro

La interfaz admite oscuro, claro y sistema. La preferencia se aplica antes de pintar el documento para evitar flash visual, responde a `prefers-color-scheme` y persiste. El dashboard también contiene el selector, no únicamente el constructor.

Los tokens semánticos cubren superficies, texto, bordes, controles, sombras y estados. El tema de la aplicación es independiente de los colores del sitio diseñado.

### 3.21 Accesibilidad y teclado

- Focus trap en modales y restauración al disparador.
- `Escape` cierra únicamente la capa superior.
- Regiones `aria-live` polite/assertive.
- `aria-selected`, `aria-pressed`, `aria-expanded`, `aria-keyshortcuts` sincronizados.
- Landmarks, skip links y árbol accesible del canvas.
- Roving tabindex en tabs y selector responsive.
- Botones de icono con nombres accesibles.
- Atajos desactivados al escribir en inputs, textareas, selects o contenteditable.
- `prefers-reduced-motion` respetado.

Atajos históricos principales: `Alt+1/2/3`, `Alt++`, `Alt+-`, `Alt+0`, `Shift+F`, `Alt+I`, `?`, `Escape` y `Ctrl/Cmd+K`, además de los atajos nuevos de navegación del canvas.

---

## 4. Arquitectura del proyecto y estructura de carpetas

### 4.1 Arquitectura actual verificada

```text
/Users/johntapias/Documents/Orbit/
├── index.html
├── README.md
├── VALIDACION.md
├── INFORME-TECNICO-COMPLETO.md
├── Orbit-Netlify.zip
├── ORBIT-AI-MASTER-AUTHORING.md
├── AI-AUTHORING-README.md
├── qa-contextual-toolbar.mjs
├── docs/
│   └── orbit-json-authoring-guide.md
├── examples/
│   └── landing-page-ai.orbit.json
├── prompts/
│   └── screenshot-to-orbit-json.md
├── schemas/
│   └── orbit-json-v12.schema.json
└── qa-evidence/
    └── 24 capturas PNG de validación
```

La entrega actual es un **single-file application**. `index.html` contiene HTML, cinco bloques de estilos y cuatro scripts, además de la lógica que anteriormente estuvo dividida en módulos. Métricas al 6 de agosto de 2026:

- 13.342 líneas.
- 1.049.886 bytes.
- aproximadamente 736 funciones declaradas.
- 59 SVG inline de interfaz.
- sin framework de runtime.

### 4.2 Capas lógicas embebidas

Aunque están concatenadas, se reconocen estas capas:

1. **Contratos:** viewports, temas, tabs, normalización y límites.
2. **Estado:** `Proxy`, suscripciones, lotes y eventos.
3. **DOM/controles:** referencias, eventos y sincronización de UI.
4. **Viewport engine:** dimensiones, zoom, fit, centrar y reflow.
5. **Persistencia:** preferencias, vistas y proyectos.
6. **Accesibilidad:** atajos, foco y anunciadores.
7. **Medición:** reglas, guías y coordenadas.
8. **Modelo visual:** nodos, estilos, estados, tokens, clases y componentes.
9. **Render:** canvas, inspector, dashboard, modales y toolbars.
10. **Import/export:** HTML/CSS, Orbit JSON, Astro, ZIP y backups.
11. **QA bridge:** API interna `window.__ORBIT_QA__` para pruebas.

### 4.3 Arquitectura modular histórica

En las fases 2–6 existió una entrega de desarrollo con `public/`, `scripts/`, `tests/`, `docs/`, configuración npm y generadores standalone/Netlify. Esa arquitectura fue empaquetada posteriormente dentro de `index.html`. Los módulos confirmados históricamente incluyen:

```text
public/
├── app.js
├── js/
│   ├── contracts.js
│   ├── state.js
│   ├── dom.js
│   ├── controls.js
│   ├── viewport-engine.js
│   ├── accessibility/
│   ├── focus-view/focus-view.js
│   ├── measurement/measurement-overlay.js
│   ├── persistence/preferences-storage.js
│   ├── projects/projects-storage.js
│   └── performance/runtime-performance.js
└── styles/
    ├── tokens.css
    └── features/phase-4.css
```

La carpeta actual no conserva esos archivos por separado. Para continuar desarrollando con seguridad se recomienda volver a una fuente modular y generar el standalone como artefacto, no usar el artefacto como única fuente.

---

## 5. Tecnologías, librerías y dependencias

### 5.1 Runtime actual

| Tecnología | Uso |
| --- | --- |
| HTML5 semántico | Shell, dashboard, editor, diálogos, forms y preview. |
| CSS moderno | variables, grid, flexbox, cascade visual, media queries, transforms, temas y reduced motion. |
| JavaScript nativo | estado, render, importación, exportación, persistencia y UI. |
| IndexedDB | proyectos y versiones locales. |
| localStorage | preferencias y memoria de vistas. |
| Canvas 2D | reglas, medición y minimapa. |
| SVG inline | iconografía de interfaz y nodos SVG importables. |
| DOMParser | importación/aplicación de HTML en Code Studio. |
| Blob, FileReader, URL | archivos, descargas, assets, preview y ZIP. |
| CSS Font Loading API / Google Fonts CSS2 | instalación y carga de fuentes. |
| `requestAnimationFrame` | render y reflow agrupados. |
| `ResizeObserver` | reacción a espacio/paneles/canvas. |

No existe `package.json` en la carpeta actual y abrir Orbit no requiere npm, build ni servidor.

### 5.2 Proyecto Astro generado

El ZIP exportado por Orbit usa Astro `^7.1.6`, módulos ES y estilos CSS separados. La dependencia pertenece al proyecto generado, no al editor standalone.

### 5.3 Herramientas históricas de desarrollo

En entregas anteriores se configuraron o documentaron TypeScript con `checkJs`, ESLint flat config, Prettier, EditorConfig, Husky, lint-staged, Commitlint, Release Please, Playwright, Sharp y GitHub Actions. Hubo limitaciones del registro npm interno: inicialmente Astro 6.3.8, Commitlint, Playwright u otros paquetes no siempre pudieron descargarse. Las validaciones posibles se ejecutaron con el runtime disponible.

### 5.4 QA actual

`qa-contextual-toolbar.mjs` usa Node.js, utilidades estándar, un servidor local temporal, Google Chrome headless y Chrome DevTools Protocol por WebSocket. No depende de Playwright en la carpeta vigente.

---

## 6. Componentes creados o modificados

### 6.1 Componentes de aplicación

- Dashboard editorial de proyectos.
- Header de dashboard con tema, importar y nuevo proyecto.
- Sidebar izquierdo con Proyectos, Páginas, Elementos, Secciones, Capas, Componentes, Clases, Tokens y Assets.
- Acciones Importar, Código y Atajos en la zona inferior del rail izquierdo.
- Topbar del editor con documento, historial/guardar, comandos, responsive/zoom, tema, preview y exportación.
- Barra contextual global y toolbar flotante de selección.
- Dock contextual inferior.
- Workspace, canvas stage, canvas shell y canvas page.
- Rulers, smart guides, selection UI, minimap y Quick Insert.
- Rail derecho “Editar” y seis paneles de Inspector Pro.
- Selector responsive profesional, menú de zoom y menú de reglas/guías.
- Responsive Compare y Breakpoint Manager.
- Google Fonts Manager.
- Token editor, confirmación de eliminación y limpieza por categoría.
- Selector unificado de variables de color.
- Background Studio.
- Code Studio con tabs y preview.
- Page SEO, Page Health, Audit y Responsive Audit.
- Importadores Design System, HTML+CSS y Orbit JSON/IA.
- Project dashboard, checkpoint/version manager y storage health banner.

### 6.2 Componentes del documento visual

El catálogo incluye contenedores, secciones, headings, texto, botones, imágenes, enlaces, listas, galerías, video, SVG, spacer y composiciones. Components Pro permite convertir estructuras en maestros con props/variantes e insertar instancias.

---

## 7. Archivos creados, eliminados y editados

### 7.1 Archivos actuales

| Archivo | Tamaño auditado | Propósito |
| --- | ---: | --- |
| `index.html` | 1.049.886 B | Aplicación completa, estilos, lógica, datos iniciales y exportadores. |
| `qa-contextual-toolbar.mjs` | 55.667 B | Suite integral headless y generación de evidencia. |
| `ORBIT-AI-MASTER-AUTHORING.md` | 22.809 B | Documento único para entregar a GPT/Claude junto con una captura. |
| `docs/orbit-json-authoring-guide.md` | 14.437 B | Guía técnica detallada del contrato Orbit JSON. |
| `schemas/orbit-json-v12.schema.json` | 14.151 B | JSON Schema de documento, tokens, clases, nodos, SVG y fondos. |
| `examples/landing-page-ai.orbit.json` | 29.292 B | Ejemplo importable con tokens, 31 nodos y clases compartidas. |
| `prompts/screenshot-to-orbit-json.md` | 6.630 B | Prompt maestro y variantes para GPT/Claude. |
| `AI-AUTHORING-README.md` | 1.909 B | Índice y flujo del kit de IA. |
| `README.md` | 2.560 B | Apertura, cambios visibles y resumen de validación Fase 7D. |
| `VALIDACION.md` | 1.952 B | Matriz funcional y comprobaciones de UX. |
| `Orbit-Netlify.zip` | 230.398 B | Paquete antiguo de un solo `index.html`; no contiene los últimos cambios. |
| `qa-evidence/*.png` | 24 archivos | Capturas dashboard, editor, responsive, fuentes, tokens, colores, guías y Code Studio. |

### 7.2 Archivos históricos creados o modificados

Confirmados por las entregas de fases anteriores:

- `public/app.js`: aplicación principal; pasó de monolito a orquestador durante Fase 2.
- `public/js/contracts.js`: contratos y valores comunes; su ausencia en el generador Netlify causó un fallo y luego se añadió antes de `state.js`.
- `public/js/state.js`: estado central con `Proxy` y suscripciones.
- `public/js/dom.js`: registro de referencias DOM.
- `public/js/viewport-engine.js`: fit, zoom, dimensiones y centrado.
- `public/js/controls.js`: eventos principales de la interfaz.
- `public/js/persistence/preferences-storage.js`: preferencias versionadas.
- `public/js/focus-view/focus-view.js`: Focus View profesional.
- `public/js/measurement/measurement-overlay.js`: reglas, guías y medidas.
- `public/js/performance/runtime-performance.js`: métricas y long tasks.
- `public/styles/tokens.css`: foundations del design system.
- `public/styles/features/phase-4.css`: UI de precisión y Focus View.
- `standalone-demo.html`: artefacto generado desde módulos.
- `tsconfig.typecheck.json`: chequeo estricto de JavaScript con TypeScript.
- `eslint.config.*`, `.prettierrc*`, `.editorconfig`, `.vscode/*`: calidad y consistencia.
- `.husky/pre-commit`, `.husky/commit-msg`, `.husky/pre-push`: hooks de calidad.
- `commitlint.config.*`, `.gitmessage`: Conventional Commits.
- `.github/workflows/quality-gate.yml`: validación PR/release.
- `CHANGELOG.md`: consolidación de 17 changelogs históricos.
- `docs/qa/HISTORY.md`: consolidación de 18 reportes QA.
- `docs/qa/<version>/screenshots/`: organización de evidencias.
- scripts de standalone, Netlify, QA, validación de arquitectura, imágenes y documentación.

### 7.3 Archivos eliminados o movidos históricamente

- Se eliminaron de la raíz los archivos `CHANGELOG_V*.md` después de consolidarlos.
- Se eliminaron de la raíz los archivos `QA_V*.md` después de conservarlos en historial QA.
- `qa-screenshots/` se sustituyó por `docs/qa/<versión>/screenshots/`.
- `ALPHA_SCOPE.md` y roadmaps se movieron desde la raíz a `docs/`.
- Capturas manuales antiguas pasaron a `docs/qa/archive/manual`; las baselines oficiales se ubicaron en `tests/snapshots/linux`.
- En la interfaz se eliminaron barra de estado inferior, “Proyecto vacío”, importación duplicada del footer, acciones duplicadas de SEO/Audit/Inspector, selector Esencial/Rápido, paleta fija de color, rombos y flechas decorativas sin función.

No es posible proporcionar una lista exhaustiva de cada archivo temporal o cada edición de línea histórica porque la carpeta actual no incluye `.git` ni los paquetes fuente anteriores.

---

## 8. Cronología y cambios por versión/actualización

### 8.1 v0.12 — Components Pro

**Motivo:** pasar de elementos aislados a componentes reutilizables capaces de exportarse correctamente a Astro.

Se implementaron biblioteca, búsqueda, filtros, maestros, instancias, variantes, props, overrides, sincronización, duplicación, eliminación segura y exportación Astro. Se conservaron Responsive System Pro, SEO, Audit, Inspector y guardado. Fue validado a 1024, 1600 y 3440 píxeles. El build npm no pudo completarse entonces porque el registro disponible devolvía 404 para Astro 6.3.8; el standalone sí se validó.

### 8.2 v0.12.0-alpha.2 / Fase 1 — Consolidación y control de cambios

**Motivo:** reducir desorden y establecer trazabilidad antes de seguir ampliando el runtime.

Se consolidaron 17 changelogs y 18 reportes QA, se organizaron 13 capturas por versión, se movieron roadmaps y se prepararon Conventional Commits, Commitlint, Husky, Release Please y workflows. El runtime de v0.12 no cambió. Commitlint no pudo instalarse en ese entorno por el registro npm interno.

### 8.3 Fase 2 — Arquitectura Modular y Design System Foundation

**Motivo:** evitar que `public/app.js` siguiera creciendo sin separación de responsabilidades.

Se crearon módulos de contratos, estado, DOM, viewport y controles. El estado se centralizó con suscripciones, el motor de viewport deduplicó renders con `requestAnimationFrame` y los tokens visuales se movieron a `tokens.css`. `app.js` pasó de 4.118 a 3.985 líneas en aquella entrega. El standalone comenzó a generarse desde la misma fuente modular.

### 8.4 Fase 3 — Accesibilidad y atajos

**Motivo:** hacer Orbit operable con teclado y compatible con tecnologías de asistencia.

Se añadieron atajos, focus trap, pila de foco, cierre por capa, restauración al disparador, ARIA live, tablists, árbol accesible del canvas, skip links, focus visible y reduced motion. La validación histórica registró 35 pruebas, 91 botones con nombre, 12 treeitems, 11 tabs y cero botones sin nombre.

### 8.5 Fase 4 — Persistencia, Focus View y herramientas de precisión

**Motivo:** ofrecer memoria de trabajo, concentración y alineación profesional.

Se creó `orbit:preferences:v1` con debounce de 250 ms, migración y recuperación. Focus View ocultaba paneles y herramientas, preservaba selección/zoom y restauraba foco. Se agregaron reglas Canvas 2D, guías, coordenadas y métricas de rendimiento con RAF, `ResizeObserver` y `PerformanceObserver`. La barra de coordenadas creada aquí fue retirada más adelante tras rediseñar la interfaz contextual.

### 8.6 Fase 5 — Quality Gate

**Motivo:** convertir pruebas manuales dispersas en una barrera de regresión repetible.

Se definieron suites E2E para carga, responsive, zoom/Focus, persistencia, accesibilidad, reglas/guías, Components Pro, exportación Astro y duplicidades UI. Se configuraron capturas 390×844, 768×1024, 1600×900 y 3440×1440, Page Health y Focus View; workflow para Chromium en PR, visual en cuatro tamaños, release multi-browser y artefactos de traces/videos/reportes.

### 8.7 Fase 6A — TypeScript Readiness y DX

**Motivo:** preparar una migración segura sin convertir toda la base de una vez.

Se agregaron `checkJs`, contratos tipados, ESLint, Prettier, EditorConfig, VS Code, hooks de Git y controles de imágenes. Las imágenes se optimizaban con Sharp solo cuando el resultado era menor y únicamente en carpetas de assets/documentación. La conversión real de módulos a `.ts` quedó aplazada.

### 8.8 Recuperación de proyectos y empaquetado Netlify

**Motivo:** una entrega desplegada omitía el dashboard y podía mostrar 404 o una app detenida.

El generador standalone cargaba `state.js` sin `contracts.js`; `DEFAULT_CANVAS_WIDTHS` no existía y el runtime se detenía antes del dashboard. Se corrigió el orden. También se eliminó la creación automática de “Mi primer proyecto”, se protegió el dashboard frente a IndexedDB corrupto y se añadieron normalización, aislamiento y reparación.

El 404 de Netlify se atribuyó a subir una carpeta/ZIP sin `index.html` en raíz. Se generó un paquete estático con entrada raíz, redirects y headers. El ZIP actual solo contiene un `index.html` del 5 de agosto y quedó desactualizado respecto a las mejoras del 6 de agosto.

### 8.9 Inspector Pro

**Motivo:** evitar un inspector largo y poco navegable.

Se dividió en seis tabs con persistencia, teclado, ARIA y estados vacíos. Inicialmente existió un selector Esencial/Pro; tras feedback se eliminó y hoy solo queda la edición completa.

### 8.10 Theme System Pro

**Motivo:** ofrecer claro/oscuro/sistema de manera consistente en dashboard y editor.

Se crearon tokens semánticos, aplicación temprana, persistencia, respuesta al sistema y navegación accesible del menú. El tema de app se separó del canvas.

### 8.11 Limpieza de navegación y Fase 7D

**Motivo:** despejar topbar y profesionalizar el control del canvas.

SEO y Audit salieron de la barra superior y quedaron en Páginas/Page Health; Inspector salió de áreas duplicadas; Atajos se movió al pie izquierdo. Fase 7D agregó fit seguro, paneo, zoom al cursor, atajos de centrar/enfocar, minimapa, selector de superpuestos y memoria de vista.

### 8.12 Rediseño contextual y canvas fluido

**Motivo:** eliminar la barra inferior invasiva y los espacios vacíos alrededor del lienzo.

Se eliminó la barra de estado/coordenadas, se creó contexto global/selección y se recalculó el canvas sin reservar su altura. Los paneles pasaron a reflow fluido; el fit dejó de redondear en saltos de 5 %. Se corrigieron deriva de zoom, canvas móvil sobredimensionado y navegación horizontal.

### 8.13 Reorganización de barras y paneles

**Motivo:** reducir clics, solapamientos y duplicidad.

Proyectos, Importar y Código pasaron al rail izquierdo. El área Editar quedó siempre visible en el rail derecho; sus iconos se igualaron al tamaño del rail izquierdo. Se retiraron “Proyecto vacío”, Importar JSON duplicado, selector Esencial/Rápido y datos repetidos de breakpoint/selección. El rombo de topbar se sustituyó por guardar y se alineó con Undo/Redo.

### 8.14 Dashboard y sistema visual editorial

**Motivo:** abandonar apariencia genérica/amateur y equilibrar jerarquías.

Se creó una dirección visual editorial con titular “Diseña sin salir de tu órbita”, acento naranja, composición portfolio, métricas compactas y tarjetas equilibradas. Se redujo el tamaño excesivo de proyectos, se aprovechó ultrawide y se estableció escala tipográfica 9,5–16 px para UI.

### 8.15 Texto, color, fuentes y tokens

**Motivo:** convertir la barra de texto en herramienta real y conectar el editor con el design system.

Se añadieron font, variables, size, bold, italic, color, align y justificado. Se retiraron rombos, flecha inferior y paleta fija. Todos los colores del Inspector se unificaron. Se implementó Google Fonts por proyecto. Tokens recibió crear, editar, borrar y limpiar categorías con conservación visual.

### 8.16 Code Studio y documentación para IA

**Motivo:** permitir edición de código real y hacer predecible la maquetación generada por GPT/Claude.

Se implementó Code Studio HTML/CSS/JS. Se creó el kit documental, esquema, ejemplo y prompt; después se consolidó un documento maestro único. Se definieron placeholders de imagen, assets reales/híbridos y SVG para iconos.

### 8.17 Clases compartidas e importador Orbit JSON mejorado

**Motivo:** los elementos repetidos importados por IA no compartían estilos; editar un título/card no actualizaba sus equivalentes.

Se añadieron `globalClasses`, `styleClassId`, modo shared/local, detección automática de repeticiones, merge/remap y reportes. El ejemplo y la documentación se actualizaron. QA verifica edición compartida y override local.

### 8.18 Edición directa y Background Studio

**Motivo:** recuperar el control para apagar edición directa y superar el límite de “solo color de fondo”.

Se restauró el toggle contextual de edición directa. Se añadió `backgroundConfig` con color, imagen, gradiente, overlay, assets, sizing, posición, ángulo, tipo y preview. Se actualizaron esquema y documentación. Esta es la modificación funcional más reciente registrada.

---

## 9. Mejoras de rendimiento

- Renders de viewport agrupados y deduplicados con `requestAnimationFrame`.
- Cola separada para chrome contextual y reflow de paneles.
- `ResizeObserver` en workspace/canvas en vez de sondeo continuo.
- Debounce de 250 ms para preferencias.
- Canvas 2D para reglas, evitando cientos de elementos HTML.
- Una sola tarea de render de medición pendiente por frame.
- Limpieza de listeners, observers, timers y animation frames en los módulos históricos.
- Memoria de vistas separada por contexto para no recalcular posición innecesariamente.
- `iframe.srcdoc` para preview aislado sin navegación externa.
- Exportación ZIP en memoria sin servidor.
- Importación normalizada antes de renderizar para reducir estados inválidos.
- Assets binarios conservados como `Uint8Array` al exportar.
- Históricamente se instrumentó `window.__ORBIT_PERFORMANCE__` con frames, resize, escrituras y long tasks.

Limitación: el `index.html` de 1 MB debe parsearse completo al abrir; la modularización/build con minificación y carga diferida mejoraría tiempo de arranque y mantenibilidad.

---

## 10. Mejoras UX/UI

- Canvas borde a borde y sin espacios residuales.
- Contexto adaptado a selección, con menos duplicados.
- Herramientas de elemento próximas al objeto, sin tapar Quick Insert.
- Sidebar izquierdo y rail derecho consistentes.
- Acciones frecuentes visibles sin abrir “Inspector”.
- Responsive y zoom agrupados en controles legibles.
- Fit on screen explícito y presets gráficos.
- Reglas/guías explicadas y totalmente opcionales.
- Dashboard editorial, compacto y escalable.
- Naranja reservado a acciones principales; morado a selección del canvas.
- Escala tipográfica auditada para evitar extremos.
- Color basado en variables reales del proyecto.
- Menús limpios, sin rombos/flechas ornamentales.
- Google Fonts, tokens y fondos presentados como gestores dedicados.
- Confirmaciones destructivas explican impacto y referencias.
- Iconos SVG con etiquetas accesibles.
- Animaciones breves y reduced motion.

---

## 11. Mejoras responsive

### Desktop/portátil — 1024×768

- Menús permanecen dentro del viewport.
- Paneles pueden colapsarse sin dejar huecos.
- Canvas usa todo el ancho visible.
- Toolbar de selección se recoloca junto al elemento.
- Google Fonts conserva ancho útil y scroll.
- Selector responsive usa layout compacto.

### Desktop — 1600×900

- Balance entre sidebars, canvas y selección.
- Dashboard y tarjetas tienen tamaño controlado.
- Code Studio se abre como superficie amplia.
- Mobile se ajusta y centra automáticamente.
- Los controles de zoom y responsive conservan medidas legibles.

### Ultrawide — 3440×1440

- Canvas se centra cuando cabe y navega horizontalmente cuando se amplía.
- Dashboard usa al menos 65 % del viewport sin estirar tarjetas.
- Titular conserva primera línea estable.
- Modales mantienen ancho controlado y centrado.
- No existe overflow global del documento.

### Canvas responsive

Los estilos se resuelven por cascada: base/desktop, Tablet, Mobile L y Mobile; Desktop XL puede usar `min-width`. El exportador genera media queries según breakpoints habilitados.

---

## 12. Sistema SEO

Cada página mantiene metadatos propios:

- idioma;
- título;
- descripción;
- imagen Open Graph;
- `noIndex`;
- nombre y slug/ruta.

Page SEO calcula incidencias y una puntuación; el algoritmo actual descuenta 25 puntos por incidencia detectada. La interfaz SEO se movió fuera de la topbar hacia el contexto de Páginas para evitar duplicidad.

En exportación, `BaseLayout.astro` genera charset, viewport, description, título, `robots` cuando corresponde y `og:image`. Las fuentes instaladas también se agregan al `head`. Las rutas se traducen a archivos dentro de `src/pages`.

Pendiente para nivel producción: canonical, Open Graph completo (`og:title`, `og:description`, tipo y URL), Twitter Cards, sitemap, robots.txt, datos estructurados, auditoría de headings por página y validación de URLs.

---

## 13. Sistema de auditoría/Inspector

### 13.1 Page Health y Audit

Page Health agrupa problemas editoriales/SEO/auditoría en la sección de Páginas. Audit presenta resumen y lista de hallazgos con estados. La topbar ya no repite estas acciones.

### 13.2 Responsive Audit

Analiza Mobile y Tablet para detectar anchuras rígidas, grids demasiado densos, texto sobredimensionado, padding, whitespace, posiciones y `min-width` problemáticos. Puede sugerir/corregir propiedades comunes. Antes de exportar, los errores bloquean el flujo visual hasta revisar o aceptar continuar.

### 13.3 Inspector Pro

El Inspector no es solo auditoría: es la superficie de modificación del nodo, sus estados y breakpoint. Soporta estilo de clase compartida y override local, tokens, fondos, tipografía, box model, semántica y accesibilidad.

### 13.4 Storage Health

Existe una auditoría operativa de persistencia. Si un proyecto está incompleto, antiguo o corrupto, se normaliza/aisla y se muestra un banner de salud, sin bloquear el dashboard.

---

## 14. Configuraciones importantes

| Configuración | Valor/clave |
| --- | --- |
| Versión de documento Orbit | `12` |
| Preferencias | `orbit:preferences:v1` |
| Memoria de canvas | `orbit:canvas-views:v1` |
| IndexedDB | `orbit-design-studio-v0-9` |
| Versión DB | `1` |
| Object store | `projects` |
| Zoom normalizado | 20 % a 400 %, pasos de 5 % |
| Ancho canvas permitido | 320 a 5120 px |
| Panel izquierdo | 220 a 560 px; default 380 |
| Panel derecho | 260 a 620 px; default 360 |
| Tema | dark, light, system |
| Inspector inicial | content, modo completo/advanced |
| Rulers/guides/snap | activos por defecto |
| Direct edit | activo por defecto, con toggle persistido |
| Minimap | visible por defecto, persistido |
| Exportación | componentize, Astro Image, CSS separado, minify opcional |
| Astro generado | `^7.1.6` |
| Historial por proyecto | máximo 20 entradas normalizadas por colección |

La carga temprana del tema lee preferencias antes de renderizar. La importación/exportación usa versión 12 y el esquema debe evolucionar junto con migraciones para no romper proyectos guardados.

---

## 15. Bugs encontrados y solución

| Bug | Causa | Solución |
| --- | --- | --- |
| Dashboard ausente en Netlify | `state.js` se ejecutaba sin `contracts.js`; faltaba `DEFAULT_CANVAS_WIDTHS`. | Incluir contratos antes del estado en el standalone. |
| Netlify 404 | Paquete/carpeta sin `index.html` en raíz. | Crear paquete de despliegue con entrada raíz. |
| Proyecto automático no deseado | Inicialización creaba “Mi primer proyecto”. | Dashboard vacío y creación solo por acción explícita. |
| IndexedDB dañado ocultaba inicio | Fallo no aislado durante carga. | Normalización, fallback, health banner, reparación y aislamiento por proyecto. |
| Canvas quedaba detrás de paneles | Fit calculaba viewport completo, no área visible. | Viewport engine descuenta paneles y chrome real. |
| Franjas vacías al colapsar paneles | Espacio reservado y reflow incompleto. | Recalcular layout y fit en apertura/cierre/resize. |
| Canvas derivaba a la derecha al bajar zoom | Offset previo no se recentraba. | Centrado posterior al zoom y memoria coherente de scroll. |
| Mobile se veía gigantesco/lateral | Zoom heredado no era seguro para el nuevo ancho. | Fit automático por dispositivo y centrado. |
| No había desplazamiento horizontal útil | Control/offset interfería con overflow real. | Mantener overflow de workspace y pan horizontal verificable. |
| Toolbar flotante tapaba Quick Insert/Inspector | Posición fija sin detección de colisión. | Colocación adyacente con límites y zonas evitadas. |
| Barra superior saturada | SEO, Audit, Inspector y medidas duplicados. | Mover a Páginas, rail derecho y dock; retirar duplicados. |
| Reglas y líneas naranjas no podían ocultarse | Preferencias mezclaban reglas/guías. | Toggles independientes y persistidos. |
| Selector responsive poco legible | Medidas/labels comprimidos en topbar. | Menú agrupado con tarjetas y administrador. |
| Tipografía de UI inconsistente | Valores dispersos demasiado pequeños/grandes. | Escala auditada 9,5–16 px según jerarquía. |
| Dashboard/cards gigantes | Layout escalaba de forma excesiva. | Límites de ancho y densidad compacta. |
| Iconos derechos más pequeños | Dimensiones distintas entre rails. | Paridad de cajas e iconos. |
| Rombo ambiguo de topbar | Icono sin semántica clara. | Sustituir por guardar y alinear historial. |
| Tema solo visible en constructor | Control ausente en dashboard. | Selector global en inicio y editor. |
| Edición directa siempre activa | Toggle desapareció de la barra de texto. | Restaurar control accesible y persistido. |
| Paleta de color enorme/genérica | Selector fijo desconectado de tokens. | Variables del proyecto + personalizado. |
| Color inconsistente entre campos | Algunos usaban picker nativo. | Popover unificado para texto, fondo, borde, sombra y overlay. |
| Google Fonts no se encontraba | Función sin acceso visible/coherente. | Gestor dedicado desde tipografía/tokens y exportación. |
| Tokens no gestionables | Solo edición básica. | Crear, renombrar, borrar y limpiar categoría. |
| Borrar token rompía referencias | Variables quedaban sin definición. | Materializar valor efectivo antes de borrar. |
| Elementos repetidos importados no se sincronizaban | JSON no expresaba clase común. | `globalClasses`, asignación, shared/local y autodetección. |
| IA usaba imágenes para iconos | Guía no distinguía asset e icono. | Nodo SVG, documentación y saneamiento. |
| Apariencia solo aceptaba color de fondo | Modelo sin composición. | `backgroundConfig` con imagen, gradiente y overlay. |

---

## 16. Bugs conocidos o pendientes

La suite actual no reporta fallos funcionales. Los siguientes son defectos potenciales o limitaciones pendientes:

- `Orbit-Netlify.zip` está desactualizado frente a `index.html`; desplegarlo perdería mejoras recientes.
- La versión visible v0.12 no refleja el volumen de cambios posteriores.
- La carpeta actual no es Git; no hay rollback, branches, blame ni tags.
- El monolito hace más probable una regresión por conflictos CSS/JS.
- QA actual se concentra en Chrome; Safari, Firefox y Edge necesitan validación vigente.
- Los placeholders/Google Fonts requieren internet; offline pueden cambiar apariencia.
- Código HTML/CSS/JS importado puede contener contenido no confiable. Code Studio ejecuta JS dentro del preview; debe tratarse como código del usuario.
- SVG se sanea, pero la superficie de seguridad completa del importador merece auditoría dedicada.
- Assets `data:` grandes pueden agotar cuota de IndexedDB/localStorage o aumentar exportación.
- La aplicación se abre por `file://`; ciertas políticas del navegador pueden afectar fuentes, fetch o previews externos.
- No existe validación automática con una biblioteca JSON Schema en la carpeta actual; el importador usa normalización propia.
- La métrica pixel-perfect todavía depende de comparación humana e iteración.

---

## 17. Funcionalidades pendientes

- Recuperar el repositorio modular de desarrollo.
- Migración progresiva real a TypeScript.
- CI actual activo con Chrome, Firefox, WebKit y pruebas visuales.
- Publicación versionada con Git, tags y Release Please comprobado.
- Generar un nuevo ZIP Netlify después de cada QA aprobada.
- Componentes anidados y ciclos/dependencias protegidos.
- Undo/Redo más granular para clases, tokens y operaciones multipágina.
- Convertir repeticiones estructurales importadas por IA en componentes, no solo clases.
- Comparación visual automática captura vs canvas y reporte de diferencias.
- Upload directo desde Background Studio, focal point visual, blend modes y gradientes de más de dos stops.
- SEO avanzado: canonical, sitemap, robots, OG/Twitter completo y schema.org.
- Auditoría WCAG automatizada y pruebas manuales con VoiceOver/NVDA.
- Gestión de assets: compresión, deduplicación, metadata, recorte y reemplazo global.
- Autosave/versionado con indicadores de conflicto y restauración granular.
- Importación/exportación con migraciones formales v12→v13.
- Personalización de atajos.
- Backend/nube/colaboración, si entra al alcance del producto.

---

## 18. Roadmap sugerido

### v0.13 — Engineering Baseline

1. Inicializar Git y preservar snapshot actual.
2. Extraer `index.html` a módulos reales.
3. Añadir package manager lockfile, servidor local y build reproducible.
4. Ejecutar QA actual contra el build y standalone generado.
5. Activar CI multi-browser y artefactos visuales.
6. Publicar ZIP Netlify desde CI.

### v0.14 — Orbit JSON v13 y AI Fidelity

1. Versionar esquema y migrador v12→v13.
2. Validador JSON Schema real con mensajes por ruta.
3. Detección de componentes estructurales repetidos.
4. Mapeo de assets e iconos asistido.
5. Comparación visual automatizada e iteración guiada.

### v0.15 — Design System Pro

1. Alias y temas de tokens.
2. Variables responsive tipadas.
3. Estados/variantes de componentes más profundos.
4. Reemplazo global y análisis de impacto.
5. Import/export de librerías de tokens.

### v0.16 — Production Export

1. SEO completo y accesibilidad exportada.
2. Optimización de imágenes y fuentes.
3. Build Astro de comprobación antes de descargar.
4. Reporte de bundle, enlaces y Lighthouse.
5. Templates de despliegue Netlify/Vercel.

### v1.0 — Stable Studio

1. Compatibilidad de proyecto garantizada.
2. Suite WCAG y multi-browser aprobada.
3. Telemetría opcional/privada y recuperación ante fallos.
4. Documentación de usuario y desarrollador.
5. Política de releases, soporte y migraciones.

---

## 19. Decisiones de diseño importantes

### Tema de aplicación separado del sitio

Se eligió para que cambiar Orbit a claro/oscuro no altere el diseño del cliente.

### Naranja para acción, morado para selección

Evita que todos los estados compitan por el mismo acento y mejora lectura operativa.

### Contexto cerca del elemento

Las acciones de selección viajan al objeto; las globales permanecen en chrome estable. Reduce distancia del cursor y duplicación.

### Cinco breakpoints, tres principales

Ofrece precisión sin llenar permanentemente la topbar. Desktop XL/Mobile L siguen disponibles como secundarios.

### Variables reales + personalizado

Los pickers no muestran catálogos artificiales; promueven consistencia del proyecto y mantienen escape hatch.

### Clases compartidas más overrides locales

Es el modelo esperado por diseñadores: modificar sistema por defecto y permitir excepciones explícitas.

### SVG para iconos

Permite recolor, escala, accesibilidad y reemplazo sin degradación ni dependencia de placeholders.

### Standalone sin instalación

Facilita abrir y desplegar Orbit. El costo es que, como única fuente, disminuye mantenibilidad; debe volver a ser un artefacto generado.

### IndexedDB local-first

Mantiene privacidad y funcionamiento sin cuenta. El costo es ausencia de sincronización automática entre equipos/navegadores.

### Astro como destino

El exportador produce páginas/componentes y CSS legibles, no solo HTML plano. Se alinea con el enfoque original del producto.

---

## 20. Riesgos antes de seguir desarrollando

1. **Pérdida de trazabilidad:** sin Git, cualquier cambio puede sobrescribir el único estado bueno.
2. **Deriva de versión:** app, esquema, documentación y ZIP pueden afirmar v0.12 aunque no representen el mismo build.
3. **Monolito:** 13.342 líneas en un archivo elevan costo de revisión y posibilidad de colisiones.
4. **Compatibilidad de datos:** modificar nodos/tokens/clases sin migrador puede romper IndexedDB existente.
5. **Código no confiable:** imports Orbit JSON, SVG y Code Studio requieren límites de seguridad claros.
6. **Dependencias externas:** Google Fonts/Picsum/Unsplash pueden fallar, cambiar o bloquearse.
7. **Cuota local:** imágenes base64 y muchas versiones pueden superar almacenamiento del navegador.
8. **Cobertura de navegador:** un resultado perfecto en Chrome no prueba WebKit/Firefox.
9. **Exportación no compilada:** el ZIP Astro puede contener una combinación que requiera validación real con npm/build.
10. **Promesa pixel-perfect:** una captura no contiene estructura, breakpoints, fuentes exactas ni assets; debe comunicarse como proceso iterativo.
11. **Accesibilidad de output:** la app puede ser accesible, pero el sitio generado depende de contenido/semántica del documento importado.
12. **ZIP obsoleto:** nunca debe desplegarse sin comparar su hash/fecha con `index.html` y ejecutar QA.

---

## 21. Estado actual

### Funciona y fue validado

- Dashboard, tema y creación/apertura de proyectos.
- Barra contextual global y de selección.
- Ausencia de barra inferior antigua.
- Canvas fluido, centrado, fit y pan horizontal.
- Reflow de ambos paneles.
- Responsive de cinco vistas y Zoom Suite.
- Reglas/guías independientes.
- Minimapa.
- Inspector completo de seis áreas e iconos equivalentes.
- Texto contextual, variables y direct edit toggle.
- Color unificado.
- Background Studio.
- Google Fonts.
- CRUD y limpieza de tokens.
- Code Studio.
- Clases compartidas y overrides.
- Importación SVG.
- Tema claro.
- Escala tipográfica.
- Dashboard editorial y ultrawide.
- 1024×768, 1600×900 y 3440×1440 sin overflow ni runtime errors.

### Falta o requiere actualización

- Repositorio Git y fuente modular actual.
- ZIP Netlify actualizado.
- Versionado nuevo y changelog oficial en la carpeta actual.
- CI/multi-browser reproducible.
- Build Astro real como parte del gate vigente.
- Mejoras del roadmap y hardening de seguridad.

---

## 22. Próximos pasos recomendados por prioridad

1. **Crear un snapshot inmutable y repositorio Git** de la carpeta actual.
2. **No desplegar `Orbit-Netlify.zip` actual**; regenerarlo desde `index.html` después de versionar.
3. **Asignar nueva versión** al producto y esquema; v0.13 es el mínimo razonable.
4. **Extraer el monolito** a módulos manteniendo la suite QA verde en cada paso.
5. **Restablecer CI multi-browser** y build Astro de prueba.
6. **Formalizar migraciones Orbit JSON/IndexedDB** antes de cambiar el modelo.
7. **Auditar seguridad** de HTML/JS/SVG/imports y limitar tamaños.
8. **Completar SEO y accesibilidad del output**.
9. **Mejorar fidelidad IA** con detección de componentes y comparación visual.
10. **Solo después**, considerar nube, colaboración o integraciones externas.

---

# CHANGELOG completo reconstruido

## [Unreleased — estado actual]

### Added

- Background Studio: color, imagen, gradiente y overlay.
- `backgroundConfig` en nodos, clases, esquema y documentación.
- Toggle persistente de edición directa en barra de texto.
- Clases compartidas importables y detección automática de estilos repetidos.
- Overrides “Solo este”.
- Nodo SVG importable y protocolo de iconos SVG.
- Documento maestro único para maquetación con IA.
- Code Studio HTML/CSS/JS con preview y aplicación.
- Google Fonts por proyecto.
- CRUD de tokens y limpiar categoría.
- Selector unificado de variables de color.
- Gestión de color en texto, fondo, borde, sombra y overlay.
- Toolbar tipográfica contextual.
- Dashboard editorial y soporte ultrawide.
- Selector responsive, Zoom Suite y fit on screen rediseñados.
- Rail permanente de edición y accesos Proyectos/Importar/Código.
- Dock contextual inferior y toolbar flotante junto al elemento.

### Changed

- Canvas de borde a borde con reflow de paneles.
- Mobile/Tablet se centran y ajustan automáticamente.
- Escala tipográfica UI normalizada.
- Iconos de ambos rails igualados.
- Guardar sustituye icono de rombo ambiguo.
- Responsive agrupado en un desplegable profesional.
- Color usa variables del proyecto y personalizado.
- Inspector conserva solo edición completa.
- Acciones duplicadas se trasladaron a su contexto correcto.
- Dashboard usa tarjetas compactas y ancho controlado.

### Fixed

- Deriva del canvas hacia la derecha al reducir zoom.
- Falta de navegación horizontal.
- Toolbar tapando Quick Insert/Inspector.
- Reglas y guías naranjas imposibles de ocultar.
- Google Fonts poco visible/inaccesible desde el flujo.
- Tokens sin alta/baja ni borrado masivo seguro.
- Elementos repetidos importados sin sincronización de estilos.
- Edición directa siempre activa.
- Controles de color inconsistentes.
- Fondo limitado a color sólido.

### Removed

- Barra inferior de estado/coordenadas.
- “Proyecto vacío” duplicado.
- Importar JSON duplicado del footer.
- Selector Esencial/Rápido.
- Paleta fija de color.
- Rombos en variables y flecha ornamental del color.

## [Fase 7D — Advanced Canvas Navigation]

### Added

- Paneo con Space/middle mouse.
- Zoom al cursor con Ctrl/Cmd+wheel.
- Fit, focus selection, center y minimap shortcuts.
- Minimap interactivo.
- Selector de elementos superpuestos.
- Memoria de vista por proyecto/página/breakpoint.

### Fixed

- Fit detrás de sidebar e Inspector.
- Reflow al abrir/cerrar/redimensionar paneles.

## [Theme System Pro]

### Added

- Dark, Light y System.
- Aplicación temprana, persistencia y escucha del sistema.
- Tokens semánticos y navegación de menú accesible.

## [Inspector Pro]

### Added

- Seis tabs, persistencia, teclado, ARIA y empty states.

## [Project Recovery / Netlify]

### Fixed

- Orden `contracts.js` antes de `state.js`.
- Dashboard protegido ante IndexedDB corrupto.
- Eliminación de proyecto automático.
- Paquete Netlify con `index.html` raíz.

## [Fase 6A — TypeScript Readiness]

### Added

- checkJs estricto, contratos, lint/format, hooks, chequeo de imágenes y CI de código.

## [Fase 5 — Quality Gate]

### Added

- E2E, visual regression, accessibility, release multi-browser y artefactos QA.

## [Fase 4 — Precision, Persistence and Performance]

### Added

- Preferencias versionadas, Focus View, reglas, guías, coordenadas, ResizeObserver, RAF y métricas.

## [Fase 3 — Accessibility]

### Added

- Atajos, focus manager, ARIA live, navegación por tabs/árbol, skip links y reduced motion.

## [Fase 2 — Modular Architecture]

### Added

- state, contracts, DOM, controls, viewport engine y design tokens.
- Standalone generado desde módulos.

## [0.12.0-alpha.2 — Fase 1]

### Changed

- Changelogs y QA consolidados.
- Capturas organizadas.
- Conventional Commits, Husky, Commitlint y Release Please preparados.

## [0.12 — Components Pro]

### Added

- Biblioteca, maestros, instancias, variantes, props y overrides.
- Exportación de componentes Astro.

---

# Checklist de funcionalidades terminadas

- [x] Dashboard de proyectos local-first.
- [x] IndexedDB con fallback, reparación y backups.
- [x] Canvas visual con selección, resize y drag/drop.
- [x] Responsive Desktop XL/Desktop/Tablet/Mobile L/Mobile.
- [x] Zoom, fit, centro, pan y memoria de vista.
- [x] Reglas, guías, snap, lock y minimapa.
- [x] Barra contextual global/selección.
- [x] Inspector completo de seis áreas.
- [x] Tokens con CRUD y limpieza segura.
- [x] Google Fonts por proyecto.
- [x] Variables tipográficas y de color.
- [x] Edición contextual de texto.
- [x] Fondos con imagen, gradiente y overlay.
- [x] Components Pro.
- [x] Clases compartidas y overrides locales.
- [x] Importación Orbit JSON con IA.
- [x] SVG para iconos.
- [x] Code Studio HTML/CSS/JS.
- [x] SEO básico por página.
- [x] Page Health/Audit/Responsive Audit.
- [x] Preview y Responsive Compare.
- [x] Exportación Astro multipágina en ZIP.
- [x] Tema dark/light/system.
- [x] Accesibilidad y atajos principales.
- [x] QA integral en tres resoluciones.
- [x] Documentación maestra para IA, schema, prompt y ejemplo.

---

# Checklist de funcionalidades pendientes

- [ ] Repositorio Git vigente.
- [ ] Fuente modular vigente.
- [ ] Nueva versión semántica y migrador de datos.
- [ ] ZIP Netlify actualizado.
- [ ] CI multi-browser activo.
- [ ] Build Astro real dentro del gate actual.
- [ ] Migración TypeScript completa.
- [ ] Componentes estructurales detectados automáticamente al importar IA.
- [ ] Comparación visual automatizada contra captura.
- [ ] SEO avanzado y structured data.
- [ ] Auditoría WCAG automática y pruebas VoiceOver/NVDA.
- [ ] Hardening de HTML/JS/SVG/imports.
- [ ] Optimización/deduplicación avanzada de assets.
- [ ] Fondos multistop, blend modes, focal point y upload directo.
- [ ] Atajos personalizables.
- [ ] Nube/colaboración, si se aprueba ese alcance.

---

# Commits o cambios importantes

## Estado del historial Git

No existen commits recuperables en `/Users/johntapias/Documents/Orbit`: la carpeta no contiene `.git`. Las conversaciones confirman que se preparó Conventional Commits en una entrega histórica, pero no prueban que se hayan creado commits reales ni tags. Por ello no se presenta una lista ficticia de hashes.

## Hitos equivalentes a cambios importantes

1. `feat(components): implement Components Pro`
2. `chore(release): consolidate changelog and QA history`
3. `refactor(core): modularize state DOM controls and viewport`
4. `feat(a11y): add keyboard navigation focus and announcers`
5. `feat(canvas): add persistence focus view rulers and guides`
6. `test(qa): establish automated quality gate`
7. `chore(dx): prepare strict JS typecheck and tooling`
8. `fix(storage): protect dashboard and normalize legacy projects`
9. `fix(netlify): include contracts and root entrypoint`
10. `feat(inspector): add six-area Inspector Pro`
11. `feat(theme): add dark light and system themes`
12. `feat(canvas): implement advanced navigation and minimap`
13. `refactor(ui): replace status bar with contextual chrome`
14. `fix(canvas): center responsive views and zoom correctly`
15. `feat(code): add Code Studio`
16. `feat(fonts): add Google Fonts project manager`
17. `feat(tokens): add CRUD and safe category clearing`
18. `refactor(color): use project variables across Inspector`
19. `feat(ai-import): document Orbit JSON and SVG protocol`
20. `feat(styles): add shared classes and local overrides`
21. `feat(backgrounds): add image gradient and overlay editor`

Estos mensajes son una propuesta de cómo registrar retrospectivamente los hitos; no son commits existentes.

---

# Resumen ejecutivo de una página para retomar el proyecto

Orbit Design Studio es un editor visual standalone para crear sitios Astro. La versión visible sigue siendo v0.12 Components Pro, pero el producto actual contiene muchas mejoras posteriores: dashboard de proyectos, editor responsive de cinco vistas, canvas avanzado, Inspector de seis áreas, tokens, Google Fonts, clases compartidas, Components Pro, Code Studio, SEO/Audit, importación Orbit JSON para IA y exportación Astro multipágina.

El archivo principal es `/Users/johntapias/Documents/Orbit/index.html`. Se abre directamente sin npm. Guarda preferencias en `orbit:preferences:v1`, vistas en `orbit:canvas-views:v1` y proyectos en IndexedDB `orbit-design-studio-v0-9`, store `projects`. El documento interno usa versión 12. El exportador crea proyectos Astro con Astro `^7.1.6`.

La UX actual está orientada a un lienzo profesional: el canvas ocupa toda el área disponible, se reajusta al abrir/cerrar paneles, se centra al cambiar de dispositivo o zoom y permite pan horizontal. La antigua barra inferior se eliminó. Hay contexto global sin selección y toolbar junto al elemento seleccionado. Reglas, guías naranjas, snap y lock pueden alternarse. Existe minimapa.

El rail izquierdo concentra navegación, Proyectos, Importar y Código. El rail derecho “Editar” siempre está visible y abre Contenido, Apariencia, Estructura, Responsive, Estados y Avanzado. Texto ofrece fuente, variables, tamaño, bold, italic, color y alineación. Color usa únicamente variables del proyecto o personalizado. Background Studio soporta color, imagen, gradiente y overlay.

Los tokens se pueden crear, editar, borrar o limpiar por categoría sin alterar la apariencia: las referencias se materializan antes de eliminar la variable. Google Fonts se instala por proyecto y se exporta. Los elementos repetidos pueden compartir `globalClasses`; la edición compartida afecta a todos y “Solo este” crea override local. El importador también detecta estilos repetidos y acepta SVG para iconos.

Para maquetar desde una captura con GPT o Claude se debe entregar `ORBIT-AI-MASTER-AUTHORING.md` junto con la imagen. El documento exige tokens, clases compartidas, responsive, accesibilidad y estrategia de imágenes. Picsum sirve solo como placeholder temporal; los iconos deben ser SVG.

La prueba `node qa-contextual-toolbar.mjs` fue ejecutada el 6 de agosto de 2026 y terminó con `ok: true`, cero fallos y cero errores. Validó 1024×768, 1600×900 y 3440×1440, además de temas, canvas, paneles, responsive, zoom, guías, minimapa, Google Fonts, tokens, colores, Code Studio, clases compartidas, SVG, direct edit, fondos y dashboard.

La mayor prioridad es de ingeniería: la carpeta no tiene Git y `index.html` contiene 13.342 líneas/1 MB. `Orbit-Netlify.zip` es anterior a los últimos cambios y no debe desplegarse como versión actual. El siguiente trabajo debe ser: crear snapshot y repositorio Git, asignar v0.13, extraer módulos, activar CI multi-browser, regenerar Netlify y formalizar migraciones del esquema/IndexedDB. No se recomienda seguir agregando grandes funciones antes de asegurar esa base.

---

## Evidencia de validación actual

Ejecución: `node qa-contextual-toolbar.mjs`  
Resultado: `ok: true`  
Fallos: `[]`  
Errores de runtime: `[]`  
Resoluciones: 1024×768, 1600×900, 3440×1440  
Capturas: `qa-evidence/`

SHA-256 auditado:

- `index.html`: `167e4e1952a8127f1da1bc2f55a0fbd98b979f019ded2107891e078cc3c96a43`
- `Orbit-Netlify.zip`: `7ee6ad449e08534d60e20364f5014dd65a46ebc7796a2e7e748ce05843c6fe10`
