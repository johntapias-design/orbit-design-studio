// @ts-check

/** @typedef {import('../types/orbit').InspectorTab} InspectorTab */

/** @type {ReadonlyArray<{id: InspectorTab, label: string, shortLabel: string, icon: string}>>} */
const INSPECTOR_TAB_DEFINITIONS = Object.freeze([
  { id: 'content', label: 'Contenido', shortLabel: 'Contenido', icon: 'text' },
  { id: 'design', label: 'Apariencia', shortLabel: 'Apariencia', icon: 'card' },
  { id: 'layout', label: 'Estructura', shortLabel: 'Estructura', icon: 'layout' },
  { id: 'responsive', label: 'Responsive', shortLabel: 'Responsive', icon: 'monitor' },
  { id: 'interactions', label: 'Interacciones', shortLabel: 'Estados', icon: 'pointer' },
  { id: 'advanced', label: 'Avanzado', shortLabel: 'Avanzado', icon: 'settings' },
]);

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/**
 * @param {{title: string, description: string, action?: string, renderIcon: (name: string) => string}} options
 */
function createInspectorTabEmpty({ title, description, action = '', renderIcon }) {
  return `<div class="inspector-tab-empty"><span>${renderIcon('settings')}</span><strong>${escapeHtml(title)}</strong><p>${escapeHtml(description)}</p>${action}</div>`;
}

/**
 * @param {{activeTab: InspectorTab, renderIcon: (name: string) => string}} options
 */
function createInspectorTabs({ activeTab, renderIcon }) {
  return `<div class="inspector-tabs" role="tablist" aria-label="Categorías de edición">${INSPECTOR_TAB_DEFINITIONS.map(tab => `<button type="button" id="inspector-tab-${tab.id}" role="tab" aria-selected="${activeTab === tab.id ? 'true' : 'false'}" aria-controls="inspector-panel-${tab.id}" tabindex="${activeTab === tab.id ? '0' : '-1'}" data-inspector-tab="${tab.id}" class="${activeTab === tab.id ? 'is-active' : ''}" title="${tab.label}" aria-label="${tab.label}"><span>${renderIcon(tab.icon)}</span><small>${tab.shortLabel}</small></button>`).join('')}</div>`;
}

/**
 * @param {{panels: Record<InspectorTab, string>, mode: string, activeTab: string, renderIcon: (name: string) => string, stateSwitcher: string}} options
 */
function finalizeInspectorTabs({ panels, mode, activeTab, renderIcon, stateSwitcher }) {
  panels.interactions = `${stateSwitcher}${panels.interactions || createInspectorTabEmpty({
    title: 'Estados visuales',
    description: 'Selecciona un estado para editar transformaciones, transiciones y comportamiento del cursor.',
    renderIcon,
  })}`;
  if (!panels.content) panels.content = createInspectorTabEmpty({ title: 'Sin contenido editable', description: 'Este elemento funciona como estructura. Usa Apariencia o Estructura para modificar su presentación y comportamiento.', renderIcon });
  if (!panels.design) panels.design = createInspectorTabEmpty({ title: 'Sin controles de diseño', description: 'No hay propiedades visuales disponibles para esta selección.', renderIcon });
  if (!panels.layout) panels.layout = createInspectorTabEmpty({ title: 'Sin controles de layout', description: 'Selecciona un elemento compatible con layout para editar tamaño, posición y distribución.', renderIcon });
  if (!panels.responsive) panels.responsive = createInspectorTabEmpty({ title: 'Sin diferencias responsive', description: 'Este elemento conserva los valores base en todos los viewports.', renderIcon });
  if (!panels.advanced) panels.advanced = createInspectorTabEmpty({ title: 'Sin opciones avanzadas', description: 'No hay ajustes semánticos o de accesibilidad adicionales para esta selección.', renderIcon });
  const selected = INSPECTOR_TAB_DEFINITIONS.some(tab => tab.id === activeTab) ? /** @type {InspectorTab} */ (activeTab) : 'content';
  return {
    activeTab: selected,
    tabs: createInspectorTabs({ activeTab: selected, renderIcon }),
    panel: `<div id="inspector-panel-${selected}" class="inspector-tab-panel" role="tabpanel" tabindex="0" aria-labelledby="inspector-tab-${selected}" data-inspector-panel="${selected}">${panels[selected]}</div>`,
  };
}