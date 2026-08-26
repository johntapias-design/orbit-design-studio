# Orbit AI Authoring Kit

Este kit permite pedir a GPT, Claude u otra IA que convierta una captura de diseño en un Orbit JSON v13 importable.

Si deseas enviar un único archivo, utiliza `ORBIT-AI-MASTER-AUTHORING.md`. Contiene el contrato, el prompt, las reglas de fidelidad, clases compartidas, imágenes e iconos SVG en un solo documento.

## Archivos

1. `docs/orbit-json-authoring-guide.md` — explica cómo piensa y construye una página para Orbit.
2. `schemas/orbit-json-v13.schema.json` — define exactamente qué JSON es válido.
3. `examples/landing-page-ai.orbit.json` — ejemplo completo con tokens, clases compartidas y overrides, listo para importar.
4. `prompts/screenshot-to-orbit-json.md` — prompt maestro, correcciones y manejo de imágenes.

## Flujo recomendado

1. Adjunta a la IA los cuatro archivos anteriores y la captura del diseño.
2. Copia el prompt maestro y completa el nombre de proyecto, página y modo de imágenes.
3. Guarda la respuesta de la IA con extensión `.orbit.json`.
4. En Orbit, abre **Importar**, selecciona el JSON y crea una página nueva o reemplaza la actual.
5. Compara la maqueta con la captura original. Si necesita ajustes, usa el prompt de segunda iteración.
6. Selecciona dos elementos equivalentes y confirma que muestran una clase compartida. Un cambio en modo **Compartido** debe verse en todos; **Solo este** crea una excepción local.

## Imágenes

- **Pruebas rápidas:** usa placeholders deterministas de Picsum.
- **Resultado final:** usa imágenes previamente alojadas mediante URLs estables.
- **Flujo híbrido:** asigna URLs reales a las imágenes disponibles y placeholders a las faltantes.

Una imagen adjunta a un chat no se convierte automáticamente en una URL permanente que Orbit pueda reutilizar. Por eso conviene maquetar primero con placeholders y sustituirlos desde Assets cuando las imágenes finales estén disponibles.
