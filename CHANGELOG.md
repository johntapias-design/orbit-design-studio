# Changelog

## v0.31.0-alpha — AI Import Reliability

### Contrato para ChatGPT y Claude

- Instrucciones oficiales copiables con estructura raíz, nodos, estilos y responsive permitidos.
- Plantilla Orbit JSON v13 descargable para iniciar generaciones compatibles.
- Flujo local y explícito: Orbit no envía diseños ni contenido a servicios externos.

### Validación y protección

- Validación estricta de grupos responsive, estados y propiedades visuales editables.
- Límites de 8 MB, 2.500 nodos y 32 niveles para evitar importaciones peligrosas.
- Reparación de estilos incompatibles, IDs, tipos y referencias antes del preview.
- Informe de reparación automática por identificadores, propiedades, estilos, referencias, contenido y estructura, con la ruta exacta de cada corrección.
- Contenido y texto alternativo provisionales para elementos incompletos, siempre sobre una copia revisable antes de importar.
- Importación transaccional con restauración completa si la aplicación final falla.
- Las importaciones directas de archivos JSON pasan por análisis, preview y confirmación.

### Recursos del diseño

- Detección de imágenes sin fuente y tipografías no vinculadas antes de importar.
- Reemplazo de imágenes desde el mismo informe, con conversión WebP, calidad 82% y reducción automática hasta 2.400 px.
- Sustitución global de fuentes faltantes por fuentes del sistema o variables de Google Fonts listas para exportar.
- Optimización opcional de imágenes embebidas con reporte de ahorro, sin alterar el proyecto hasta confirmar la importación.

### Componentes reutilizables

- Biblioteca compartida local para guardar headers, botones, formularios, secciones y bloques entre proyectos de distintos clientes.
- Empaquetado selectivo de la estructura y únicamente las clases, variables, tipografías e imágenes realmente utilizadas.
- Inserción segura como nuevo Component Pro, con IDs regenerados y resolución automática de nombres o variables en conflicto.
- Búsqueda, categorías, proyecto de origen y eliminación segura sin afectar los proyectos donde el componente ya fue usado.

### QA

- Ejemplo Boulevard Creative Studio con 167 elementos editables, siete bloques responsive y recursos gráficos autocontenidos para pruebas de fidelidad visual.
- Banco reproducible de cinco proyectos representativos: agencia, restaurante, catálogo, portafolio y servicios profesionales.
- Métricas de importación y corrección con mediana, percentil 95, errores frecuentes y recursos faltantes en `reports/real-project-benchmark.json`.
- Validación automática de que cada proyecto reparado termina como Orbit JSON v13 válido y dentro del presupuesto de tiempo.
- Pruebas unitarias para contratos ChatGPT/Claude, plantilla, estilos y preparación.
- QA funcional que verifica bloqueo sin mutación, reparación, preview y puntuación.
- Biblioteca de secciones retirada temporalmente de la navegación sin eliminar sus plantillas internas.
- Core Design System Bridge para importar archivos `.core`, revisar categorías y aplicar únicamente tokens seleccionados sin modificar el canvas.
- Artefacto CI actualizado a `Orbit-Netlify-v0.31`.

### Exportación profesional

- Un mismo ZIP entrega HTML estático publicable y el proyecto Astro editable, con rutas limpias e imágenes locales empaquetadas.
- Pre-flight ampliado a estructura, SEO, accesibilidad y rendimiento, con puntuaciones por área y reporte JSON incluido.
- Configuración `netlify.toml`, guía de publicación, cabeceras de seguridad, caché de recursos y controles Lighthouse.

## v0.30.0-alpha — AI Design Workflow

### Captura a Orbit

- Entrada de referencias PNG, JPG, WebP y AVIF mediante selección o arrastre, conservadas localmente durante la sesión.
- Lectura de dimensiones, relación de aspecto y peso para enriquecer el contexto sin enviar archivos automáticamente.
- Brief, tarea y alcance configurables antes de generar instrucciones.

### Generación contextual

- Contexto compacto por selección, página o proyecto con estructura, textos, tokens, componentes y lenguaje visual.
- Prompt reproducible para reconstrucción, mejora, variante o corrección de auditoría.
- Generador local de secciones Orbit editables con reutilización de tokens y estilos responsive.
- Extracción de JSON puro o bloques Markdown y validación inmediata mediante Orbit JSON Studio v13.

### Auditor visual y QA

- Score y hallazgos accionables de jerarquía, tipografía, paleta, espaciado, contenido y responsive.
- Navegación directa desde cada hallazgo al nodo afectado y prompt de corrección priorizado.
- Nuevo módulo DOM-free `public/js/ai/ai-design-workflow.js` y pruebas unitarias deterministas.
- Artefacto CI actualizado a `Orbit-Netlify-v0.30`.

## v0.28.0-alpha — Production Export

### Astro compilable e imágenes

- Exportación actualizada a Astro 7.2.6 con salida estática reproducible.
- Imágenes locales exportadas con `Picture`, variantes AVIF/WebP, `srcset`, calidad configurable y prioridad para la primera imagen relevante.
- Dependencias de sitemap y Swiper añadidas únicamente cuando el proyecto las necesita.
- Configuración, `.nvmrc`, `.gitignore` y documentación de ejecución incluidas en el ZIP.

### SEO de producción

- Preflight visible para rutas duplicadas, títulos, descripciones, jerarquía H1, imágenes vacías y textos alternativos.
- Canonical automático desde `Astro.site`, Open Graph, Twitter Cards y JSON-LD en el layout base.
- Generación opcional de sitemap, `robots.txt`, web manifest y favicon.

### Lighthouse y QA

- Lighthouse CI 0.15.1 fijado en el comando de auditoría sin contaminar las dependencias instaladas del proyecto.
- Umbrales de Performance ≥90, Accessibility ≥95, Best Practices ≥90 y SEO ≥95.
- Workflow de GitHub y reportes locales incluidos en cada exportación.
- Pruebas unitarias, flujo visual y compilación real de un proyecto Astro generado por Orbit.
- Artefacto CI actualizado a `Orbit-Netlify-v0.28`.

## v0.27.0-alpha — Orbit JSON Studio

### Migración y validación

- Detección de documentos v12, v13 y formatos legacy sin versión.
- Migración v12→v13 con inicialización explícita de metadata, tokens, assets, componentes y clases.
- Rechazo seguro de versiones futuras o versiones sin ruta compatible.
- Errores de sintaxis con línea y columna, y validación estructural con rutas JSON.

### Preview y reparación

- Reparación bajo acción explícita; el análisis inicial ya no oculta cambios destructivos.
- IDs duplicados, tipos incompatibles, referencias de clase y propiedades fuera del contrato se documentan antes de importar.
- Preview HTML aislado en un iframe sandbox sin scripts ni acceso al editor.
- Documento v13 migrado o reparado descargable antes de confirmar la importación.

### Arquitectura y QA

- Nuevo módulo DOM-free `public/js/json/orbit-json-studio.js`.
- Pruebas unitarias para migración, ubicación de errores, reparación determinista y escape del preview.
- Artefacto CI actualizado a `Orbit-Netlify-v0.27`.

## v0.26.0-alpha — Performance & Reliability

### Proyectos grandes

- Perfil de complejidad por cantidad de nodos y páginas con autosave e historial adaptativos.
- Historial máximo de 80, 40 o 20 estados para contener memoria sin retirar Deshacer/Rehacer.
- El canvas evita reemplazar el DOM cuando el markup no cambió y registra tiempos de render para QA.
- La comparación completa y la segunda clonación del proyecto fueron retiradas del registro de historial.

### Autosave y recuperación

- Programador de autosave coalescido con semántica “último cambio gana”.
- Tres reintentos con espera exponencial ante fallos transitorios de IndexedDB.
- Borrador local de emergencia con checksum, revisión y límite seguro de tamaño.
- Persistencia síncrona del borrador en `visibilitychange` y `pagehide`, antes del guardado asíncrono.
- Recuperación del borrador exacto cuando es válido y fallback al último proyecto guardado cuando no lo es.

### Calidad

- Nuevo módulo DOM-free `public/js/reliability/project-reliability.js`.
- Pruebas unitarias para perfiles de carga y detección de borradores alterados.
- Artefacto CI actualizado a `Orbit-Netlify-v0.26`.

## v0.25.0-alpha — Engineering Baseline

### CI y reproducibilidad

- QA multiplataforma con resolución configurable de Chrome mediante `CHROME_PATH`.
- GitHub Actions usa la versión fijada en `.nvmrc`, controla concurrencia y valida que `index.html` esté compilado.
- Artefacto de Netlify versionado como `Orbit-Netlify-v0.25`.

### Versionado

- Metadata de aplicación centralizada en `public/js/core/app-metadata.js`.
- Sincronización automática del título, descripción y badge del standalone durante el build.
- Orbit JSON v13 establecido como versión actual con lectura compatible de v12.

### Pruebas y modularización

- Quality Gate compuesto por verificación estructural, pruebas unitarias y QA funcional completa.
- Evidencias de QA aisladas en un directorio temporal salvo actualización explícita.
- Scroll Entrance FX extraído a `public/js/interactions/scroll-entrance-fx.js` como primer feature slice.
- Orden de compilación centralizado en `scripts/build-manifest.js` y fallo inmediato ante módulos ausentes.

## v0.24.0-alpha — Swiper Carousel Pro

### Componentes

- Nuevo elemento `carousel` con hijos `slide` completamente editables.
- Plantilla inicial de cuatro slides con imagen, título y descripción reemplazables.
- Añadir y eliminar slides desde el Inspector, manteniendo al menos uno.
- Render estático dentro del editor para conservar selección, drag & drop y edición directa.

### Responsive e interacción

- Slides visibles y espacio configurables por Desktop XL, Desktop, Tablet, Mobile L y Mobile.
- Efectos slide/fade, dirección, velocidad, loop, centrado, flechas, paginación y teclado.
- Autoplay opcional, desactivado por defecto, con intervalo y pausa al pasar el cursor.
- Preview funcional mediante Swiper Element v14.0.6.

### Exportación e IA

- Exportación Astro con dependencia `swiper` e inicialización solo cuando el proyecto usa carruseles.
- Preview standalone con carga ESM condicional desde CDN.
- Orbit JSON v13, schema y documentación para IA ampliados con `carousel`, `slide` y `swiper`.

## v0.23.0-alpha — Interface Clarity & Canvas First

### Interfaz

- Reorganización de la barra superior en zonas claras para proyecto, vista y publicación.
- Sistema visual normalizado para espaciado, radios, alturas, iconos y tipografía.
- Reducción del ruido visual en paneles, rails, controles y superficies del editor.
- Toolbar contextual más compacta, adaptable y limitada al ancho útil del canvas.
- Inspector con buscador de propiedades y campos de tamaño consistente.
- Minimapa con colapso automático cuando el lienzo completo cabe en pantalla.

### Dashboard

- Hero reducido para mostrar los proyectos antes.
- Búsqueda integrada en el flujo principal y métricas más compactas.
- Etiqueta técnica `IndexedDB` reemplazada por `En este equipo`.
- Tarjetas y distribución adaptadas a portátil, desktop y ultrawide.

### Code Studio

- Divisor horizontal ajustable entre editor y vista previa.
- Métrica de líneas del archivo activo.
- Previsualización rápida en anchos Mobile, Tablet y Desktop.
- Jerarquía visual mejorada para pestañas, encabezados y acciones.

### Calidad

- QA extendido para buscador del Inspector, minimapa automático, divisor de Code Studio, métricas y previews responsive.
- Validación funcional y visual en 1024×768, 1600×900 y 3440×1440.
- Paquete standalone y ZIP de Netlify regenerados.
