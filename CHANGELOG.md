# Changelog

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
