/** Scroll Entrance FX feature slice extracted from the editor monolith. */
const ORBIT_SCROLL_FX_PRESETS = Object.freeze([
  Object.freeze({ id: 'none', title: 'Sin animación' }),
  Object.freeze({ id: 'fade-up', title: 'Fade Up ↑' }),
  Object.freeze({ id: 'scale-in', title: 'Scale In 🔍' }),
  Object.freeze({ id: 'slide-right', title: 'Slide Right →' }),
  Object.freeze({ id: 'blur-in', title: 'Blur In ✨' }),
  Object.freeze({ id: 'fade-down', title: 'Fade Down ↓' }),
]);

function isOrbitScrollFxPreset(value) {
  return ORBIT_SCROLL_FX_PRESETS.some(preset => preset.id === value);
}

function renderScrollFxControl(node, wrapField) {
  const current = isOrbitScrollFxPreset(node?.scrollAnim) ? node.scrollAnim : 'none';
  const grid = `<div class="orbit-scroll-fx-grid">${ORBIT_SCROLL_FX_PRESETS.map(preset => {
    const selected = current === preset.id ? 'is-selected' : '';
    return `<button type="button" class="orbit-scroll-card ${selected}" data-scroll-anim-preset="${preset.id}"><span>${preset.title}</span></button>`;
  }).join('')}</div>`;
  return wrapField('Scroll Entrance FX Studio', grid);
}

function updateScrollFxNodes(nodes, nodeId, presetId, updateTree) {
  if (!nodeId || !isOrbitScrollFxPreset(presetId)) return nodes;
  return updateTree(nodes, nodeId, node => ({ ...node, scrollAnim: presetId }));
}
