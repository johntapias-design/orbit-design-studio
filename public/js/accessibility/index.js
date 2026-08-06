const BREAKPOINT_LABELS = { desktop: 'Desktop', tablet: 'Tablet', mobile: 'Mobile', desktopXL: 'Desktop XL', mobileL: 'Mobile L' };

function buttonById(document, id) {
  return document.getElementById(id);
}

function initAccessibility({ document, state, elements, viewportEngine, actions }) {
  const announcer = createAnnouncer({ document });
  const focus = createFocusManager({ document });
  const shortcuts = createKeyboardShortcuts({ state, viewportEngine, actions });
  const disposers = [];
  let stateAnnouncementTimer = 0;

  function listen(target, type, handler, options) {
    if (!target) return;
    target.addEventListener(type, handler, options);
    disposers.push(() => target.removeEventListener(type, handler, options));
  }

  function setShortcut(id, value) {
    buttonById(document, id)?.setAttribute('aria-keyshortcuts', value);
  }

  function enhanceButtonNames(root = document) {
    const scope = root.querySelectorAll ? root : document;
    scope.querySelectorAll('button[data-tooltip]').forEach(button => {
      if (!button.hasAttribute('aria-label')) button.setAttribute('aria-label', button.dataset.tooltip);
    });
    scope.querySelectorAll('button[title]').forEach(button => {
      if (!button.hasAttribute('aria-label')) button.setAttribute('aria-label', button.getAttribute('title'));
    });
  }

  function enhanceStaticSemantics() {
    document.querySelectorAll('button:not([type])').forEach(button => button.type = 'button');
    enhanceButtonNames();
    elements.builder?.setAttribute('aria-label', 'Editor visual Orbit');
    elements.workspace?.setAttribute('aria-label', 'Canvas de diseño');
    elements.canvas?.setAttribute('role', 'tree');
    elements.canvas?.setAttribute('aria-label', 'Estructura visual de la página');
    elements.leftPanel?.setAttribute('aria-label', 'Biblioteca y estructura del proyecto');
    elements.rightPanel?.setAttribute('aria-label', 'Editar propiedades del elemento');

    setShortcut('zoom-in', 'Alt++');
    setShortcut('zoom-out', 'Alt+-');
    setShortcut('fit-page', 'Alt+0');
    setShortcut('clean-canvas', 'Shift+F');
    buttonById(document, 'theme-toggle')?.setAttribute('aria-haspopup', 'menu');
    buttonById(document, 'toggle-guide-visibility')?.setAttribute('aria-pressed', String(Boolean(state.guidesVisible)));
    buttonById(document, 'lock-guides')?.setAttribute('aria-pressed', String(Boolean(state.guidesLocked)));
    setShortcut('inspector-top-toggle', 'Alt+I');
    setShortcut('shortcut-help-trigger', '?');
    setShortcut('command-palette-trigger', 'Control+K Meta+K');

    buttonById(document, 'command-palette-trigger')?.setAttribute('aria-haspopup', 'dialog');
    buttonById(document, 'responsive-compare')?.setAttribute('aria-haspopup', 'dialog');
    buttonById(document, 'shortcut-help-trigger')?.setAttribute('aria-haspopup', 'dialog');
  }

  function syncToggleStates() {
    const pairs = [
      ['toggle-grid', state.grid],
      ['toggle-guides', state.rulers],
      ['toggle-guide-visibility', state.guidesVisible],
      ['lock-guides', state.guidesLocked],
      ['clean-canvas', state.focusView],
    ];
    pairs.forEach(([id, pressed]) => buttonById(document, id)?.setAttribute('aria-pressed', String(Boolean(pressed))));
    buttonById(document, 'command-palette-trigger')?.setAttribute('aria-expanded', String(Boolean(state.commandPaletteOpen)));
    buttonById(document, 'responsive-compare')?.setAttribute('aria-expanded', String(Boolean(state.responsiveCompareOpen)));
    buttonById(document, 'inspector-top-toggle')?.setAttribute('aria-expanded', String(!state.rightPanelCollapsed));
    buttonById(document, 'theme-toggle')?.setAttribute('aria-haspopup', 'menu');
    buttonById(document, 'clear-guides')?.toggleAttribute('disabled', !(state.customGuides || []).length);
  }

  function syncViewportTabs() {
    const host = elements.viewport;
    if (!host) return;
    host.setAttribute('role', 'tablist');
    host.setAttribute('aria-label', 'Viewport del canvas');
    host.querySelectorAll('[data-bp]').forEach(button => {
      const selected = button.dataset.bp === state.breakpoint;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(selected));
      button.setAttribute('tabindex', selected ? '0' : '-1');
      if (button.dataset.bp === 'desktop') button.setAttribute('aria-keyshortcuts', 'Alt+1');
      if (button.dataset.bp === 'tablet') button.setAttribute('aria-keyshortcuts', 'Alt+2');
      if (button.dataset.bp === 'mobile') button.setAttribute('aria-keyshortcuts', 'Alt+3');
    });
    const more = host.querySelector('[data-breakpoint-more]');
    if (more) more.setAttribute('aria-haspopup', 'menu');
    const menu = host.querySelector('.viewport-more-menu');
    if (menu) menu.setAttribute('role', 'menu');
  }

  function enhanceCanvas() {
    const nodes = [...(elements.canvas?.querySelectorAll('.canvas-element[data-id]') || [])];
    nodes.forEach(node => {
      const selected = node.dataset.id === state.selectedId;
      const typeClass = [...node.classList].find(name => name.startsWith('canvas-'))?.replace('canvas-', '') || 'elemento';
      const name = node.dataset.orbitName || node.dataset.id;
      node.setAttribute('role', 'treeitem');
      node.setAttribute('aria-selected', String(selected));
      node.setAttribute('tabindex', selected ? '0' : '-1');
      if (!node.hasAttribute('aria-label')) node.setAttribute('aria-label', `${name}, ${typeClass}`);
    });
  }

  function syncLeftTabs() {
    const tabs = document.querySelector('.left-tabs');
    if (!tabs) return;
    tabs.setAttribute('role', 'navigation');
    tabs.querySelectorAll('[data-tab]').forEach(button => {
      const selected = button.dataset.tab === state.tab;
      button.removeAttribute('role');
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute('tabindex', selected ? '0' : '-1');
    });
    elements.leftContent?.setAttribute('role', 'region');
    elements.leftContent?.setAttribute('aria-label', 'Contenido de la herramienta activa');
  }

  function moveRovingFocus(container, selector, event) {
    const items = [...container.querySelectorAll(selector)].filter(item => !item.disabled && !item.hidden && !item.closest('[hidden]'));
    if (!items.length) return false;
    const current = Math.max(0, items.indexOf(document.activeElement));
    let next = current;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (current + 1) % items.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (current - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else return false;
    event.preventDefault();
    items[next].focus();
    items[next].click();
    return true;
  }

  function onCanvasKeydown(event) {
    const current = event.target.closest?.('.canvas-element[data-id]');
    if (!current || event.altKey || event.ctrlKey || event.metaKey) return;
    const nodes = [...elements.canvas.querySelectorAll('.canvas-element[data-id]')];
    const index = nodes.indexOf(current);
    let next = null;
    if (event.key === 'ArrowDown') next = nodes[index + 1] || nodes[0];
    else if (event.key === 'ArrowUp') next = nodes[index - 1] || nodes[nodes.length - 1];
    else if (event.key === 'Home') next = nodes[0];
    else if (event.key === 'End') next = nodes[nodes.length - 1];
    else if (event.key === 'Enter') {
      event.preventDefault();
      actions.toggleInspector(false);
      requestAnimationFrame(() => elements.inspector?.querySelector('button, input, select, textarea, [tabindex="0"]')?.focus());
      return;
    } else return;
    event.preventDefault();
    const id = next?.dataset.id;
    if (!id) return;
    actions.selectNode(id);
    requestAnimationFrame(() => elements.canvas.querySelector(`[data-id="${CSS.escape(id)}"]`)?.focus());
  }

  function announceState(keys = []) {
    clearTimeout(stateAnnouncementTimer);
    stateAnnouncementTimer = setTimeout(() => {
      if (keys.includes('breakpoint') || keys.includes('canvasWidths')) {
        const width = state.canvasWidths[state.breakpoint];
        announcer.status(`Viewport cambiado a ${BREAKPOINT_LABELS[state.breakpoint] || state.breakpoint}, ${width} píxeles. Zoom ${Math.round(state.zoom * 100)} por ciento.`);
      } else if (keys.includes('zoom')) {
        announcer.status(`Zoom ajustado al ${Math.round(state.zoom * 100)} por ciento.`);
      } else if (keys.includes('focusView')) {
        announcer.status(`Focus View ${state.focusView ? 'activado' : 'desactivado'}.`);
      } else if (keys.includes('theme')) {
        const themeLabels = { dark: 'oscuro', light: 'claro', system: 'del sistema' };
        announcer.status(`Tema ${themeLabels[state.theme] || state.theme} activado.`);
      } else if (keys.includes('rulers')) {
        announcer.status(`Reglas de medición ${state.rulers ? 'visibles' : 'ocultas'}.`);
      } else if (keys.includes('rightPanelCollapsed')) {
        announcer.status(`Panel Editar ${state.rightPanelCollapsed ? 'oculto' : 'visible'}.`);
      } else if (keys.includes('inspectorTab')) {
        const labels = { content: 'Contenido', design: 'Apariencia', layout: 'Estructura', responsive: 'Responsive', interactions: 'Estados', advanced: 'Avanzado' };
        announcer.status(`Categoría ${labels[state.inspectorTab] || state.inspectorTab} del panel Editar.`);
      }
    }, 90);
  }

  const unsubscribe = subscribe(['breakpoint', 'canvasWidths', 'zoom', 'focusView', 'theme', 'rightPanelCollapsed', 'grid', 'rulers', 'guides', 'guidesVisible', 'guidesLocked', 'customGuides', 'commandPaletteOpen', 'responsiveCompareOpen', 'tab', 'selectedId', 'inspectorTab'], payload => {
    const keys = payload.keys || [payload.key];
    syncToggleStates();
    syncViewportTabs();
    syncLeftTabs();
    enhanceCanvas();
    announceState(keys);
  });
  disposers.push(unsubscribe);

  const viewportObserver = new MutationObserver(() => syncViewportTabs());
  if (elements.viewport) viewportObserver.observe(elements.viewport, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'aria-expanded'] });
  disposers.push(() => viewportObserver.disconnect());

  const canvasObserver = new MutationObserver(() => enhanceCanvas());
  if (elements.canvas) canvasObserver.observe(elements.canvas, { childList: true, subtree: true });
  disposers.push(() => canvasObserver.disconnect());

  const semanticsObserver = new MutationObserver(mutations => {
    mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
      if (node.nodeType !== 1) return;
      if (node.matches?.('button[data-tooltip], button[title]')) enhanceButtonNames(node.parentElement || document);
      else if (node.querySelector?.('button[data-tooltip], button[title]')) enhanceButtonNames(node);
    }));
  });
  if (elements.builder) semanticsObserver.observe(elements.builder, { childList: true, subtree: true });
  disposers.push(() => semanticsObserver.disconnect());

  listen(document, 'keydown', event => {
    if (focus.handleKeydown(event)) return;
    shortcuts.handle(event);
  }, true);
  listen(elements.viewport, 'keydown', event => moveRovingFocus(elements.viewport, '[data-bp]', event));
  listen(document.querySelector('.left-tabs'), 'keydown', event => moveRovingFocus(event.currentTarget, '[data-tab]', event));
  listen(document, 'keydown', event => {
    const tabs = event.target.closest?.('.inspector-tabs');
    if (tabs) moveRovingFocus(tabs, '[data-inspector-tab]', event);
  });
  listen(elements.canvas, 'keydown', onCanvasKeydown);

  enhanceStaticSemantics();
  syncToggleStates();
  syncViewportTabs();
  syncLeftTabs();
  enhanceCanvas();

  function destroy() {
    clearTimeout(stateAnnouncementTimer);
    disposers.splice(0).forEach(dispose => dispose());
    focus.destroy();
    announcer.destroy();
  }

  return { announcer, destroy, focus, shortcuts, syncToggleStates, syncViewportTabs };
}