# Validación funcional

Resultado: **aprobado**, sin errores de JavaScript ni de consola.

Baseline v0.27:

- Build standalone reproducible desde el manifest modular.
- Versión `0.27.0-alpha` sincronizada entre paquete, runtime e interfaz.
- Pruebas unitarias para resolución de Chrome, Scroll Entrance FX, recuperación y Orbit JSON Studio.
- QA compatible con macOS y Ubuntu/GitHub Actions.
- Orbit JSON v13 como formato actual y compatibilidad de lectura con v12.
- Autosave adaptativo con coalescencia y tres reintentos progresivos.
- Recuperación local validada con checksum antes de restaurar el estado.
- Historial adaptativo y omisión de reemplazos DOM idénticos para proyectos grandes.
- Migración v12→v13 validada con defaults explícitos y rechazo de versiones incompatibles.
- Rutas de error, reparación de IDs/tipos y preview sandbox verificados con documentos dañados.

| Resolución | Barra global | Barra de selección | Lienzo borde a borde | Reajuste de paneles | Overflow global |
| --- | --- | --- | --- | --- | --- |
| 1024 × 768 | Correcta | Correcta | Correcto | Correcto | No |
| 1600 × 900 | Correcta | Correcta | Correcto | Correcto | No |
| 3440 × 1440 | Correcta | Correcta | Correcto | Correcto | No |

También se verificó:

- Seis pestañas de Inspector Pro presentes.
- Acciones contextuales con nombre accesible.
- Theme System Pro disponible y barra contextual compatible con tema claro.
- Navegación avanzada y minimapa presentes.
- Acciones duplicadas del encabezado del Inspector ocultas.
- Barra contextual siempre contenida dentro del viewport.
- Lienzo alineado exactamente con ambos bordes del área visible.
- Apertura, cierre y restauración de los paneles izquierdo y derecho sin huecos residuales.
- Menú de reglas y guías disponible incluso cuando hay un elemento seleccionado.
- Reglas activables y desactivables sin afectar las guías inteligentes.
- Guías y mediciones naranjas ocultables por completo.
- Preferencias de reglas, guías, ajuste y bloqueo incluidas en el guardado del proyecto.
- Selector de tamaño contenido dentro del viewport en 1024 × 768 y 1600 × 900.
- Nombres y medidas de los cinco breakpoints visibles y legibles.
- Auditoría tipográfica de la interfaz aprobada con una escala de 9.5–16 px.
- Dashboard editorial validado con proyecto real y tarjeta destacada.
- Acciones de proyecto migradas a iconos SVG con nombres accesibles.
- Minimapa minimizable, expandible y ocultable, con estado restaurable.
- Sin overflow global ni errores de consola después del rediseño visual.
- Composición ultrawide utiliza al menos el 60% del viewport y mantiene el titular en una sola línea.
- Encabezado del dashboard sin la acción duplicada “Proyecto vacío”.
