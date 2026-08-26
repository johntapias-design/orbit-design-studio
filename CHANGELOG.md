# Changelog

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
