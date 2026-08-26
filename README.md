# Orbit Design Studio — v0.26 Performance & Reliability

Versión standalone profesional de Orbit Design Studio v0.26.

[![Netlify Deploy Status](https://api.netlify.com/api/v1/badges/orbit-design-studio/deploy-status)](https://app.netlify.com)

## Abrir Orbit

Abre `index.html` con doble clic. No requiere instalación, npm ni compilación.

## Cambios incluidos

- Perfil adaptativo para proyectos grandes: autosave menos agresivo y memoria de deshacer acotada según nodos y páginas.
- Cola de autosave coalescida: guarda la revisión más reciente y evita acumulaciones mientras hay una escritura en curso.
- Reintentos automáticos con espera progresiva cuando el almacenamiento falla temporalmente.
- Borrador local de emergencia con checksum, persistido antes de cerrar u ocultar la pestaña.
- Recuperación real del último borrador; si no es válido, Orbit vuelve al último guardado automático.
- Canvas protegido contra reconstrucciones DOM idénticas y telemetría local de render/guardado para QA.
- Módulo independiente `public/js/reliability/project-reliability.js` con políticas verificables mediante pruebas unitarias.

- CI multiplataforma con detección de Chrome en macOS, Linux y Windows.
- Versión del producto centralizada y sincronizada entre runtime, paquete, interfaz y artefactos.
- Orbit JSON v13 establecido como formato actual, manteniendo compatibilidad con documentos v12.
- Quality Gate dividido en baseline de ingeniería, pruebas unitarias y QA funcional completa.
- Pruebas normales sin cambios sobre las evidencias visuales versionadas; actualización explícita mediante `npm run test:evidence`.
- Primer feature slice extraído del monolito: Scroll Entrance FX vive en `public/js/interactions/scroll-entrance-fx.js`.
- Manifest único y estricto para el orden de compilación de módulos.

- Componente **Carrusel** basado en Swiper Element con slides editables dentro de Orbit.
- Controles responsive por breakpoint para cantidad de slides visibles y separación.
- Navegación, paginación, loop, centrado, teclado, efecto, velocidad y autoplay configurables.
- Edición estática y segura en el canvas; interacción real disponible en Preview y en la exportación.
- Swiper se incluye de forma condicional: los proyectos que no usan carruseles no cargan la dependencia.

- Nueva jerarquía visual **Canvas First**: el lienzo recupera protagonismo y el chrome reduce su peso visual.
- Barra superior organizada en tres zonas claras: proyecto, vista y publicación.
- Toolbar contextual compacta, adaptable y con ancho máximo para no cubrir el diseño.
- Inspector con buscador de propiedades, controles coherentes y densidad visual profesional.
- Dashboard más compacto: proyectos visibles antes, buscador protagonista y almacenamiento expresado en lenguaje humano.
- Code Studio con divisor ajustable, métricas de líneas y preview Desktop, Tablet y Mobile.
- Sistema visual normalizado con escalas consistentes de espaciado, radios, iconos y alturas de control.

- Eliminación completa de la barra inferior de estado y coordenadas.
- Barra superior del canvas con acciones globales cuando no hay selección.
- Barra superior del canvas con acciones del elemento o de la selección múltiple.
- Acciones duplicadas retiradas del Inspector y del canvas flotante.
- Theme System Pro, Inspector Pro y navegación avanzada del canvas conservados.
- Ajuste del canvas recalculado sin reservar espacio para la antigua barra inferior.
- Lienzo fluido de borde a borde, sin franjas vacías alrededor de la página.
- Ajuste exacto al ancho visible, sin redondear el zoom en saltos de 5%.
- Reajuste automático al abrir, cerrar o redimensionar cualquiera de los paneles laterales.
- Adaptación para portátil, escritorio y pantallas ultrawide.
- Menú permanente de **Reglas y guías** en la barra superior.
- Controles independientes para reglas, guías y mediciones, ajuste magnético y bloqueo.
- Las líneas naranjas de alineación y medición se pueden ocultar por completo.
- La preferencia de visibilidad se conserva al guardar el proyecto.
- Selector responsive rediseñado con tarjetas legibles, ancho por breakpoint y acciones descriptivas.
- Escala tipográfica coherente para navegación, paneles, formularios, menús y textos auxiliares.
- Tamaño mínimo de 9.5 px reservado para metadatos; controles y contenido usan 10.5–16 px según jerarquía.
- Dirección visual editorial compartida por el dashboard y el editor.
- Dashboard convertido en portfolio creativo con proyecto destacado, métricas compactas y controles unificados.
- Barra superior y paneles del editor refinados con menor ruido cromático y estados más precisos.
- Naranja reservado para acciones principales y morado para la selección del canvas.
- Minimapa acoplado con controles para minimizar, expandir u ocultar.
- Animaciones breves con alternativa para usuarios que prefieren movimiento reducido.
- Dashboard ampliado para ultrawide, con titular estable y proyecto destacado de mayor tamaño.
- Acción duplicada “Proyecto vacío” retirada del encabezado; “Nuevo proyecto” queda como entrada principal.

## Validación

La carpeta `qa-evidence` contiene capturas de las pruebas realizadas en:

- 1024 × 768
- 1600 × 900
- 3440 × 1440
- Tema claro a 1600 × 900

`npm run build` regenera `index.html` y `Orbit-Netlify.zip`. `npm test` ejecuta el baseline, las pruebas unitarias y la QA visual/funcional.
