/**
 * Global UI controls. Canvas-specific delegated interactions remain with their
 * feature code, while toolbar buttons, selectors and toggles are bound here.
 */
function initCoreControls({ document, window, state, elements, viewportEngine, actions }) {
  const disposers = [];
  const byId = id => document.getElementById(id);

  function listen(target, type, handler, options) {
    if (!target) return;
    target.addEventListener(type, handler, options);
    disposers.push(() => target.removeEventListener(type, handler, options));
  }

  function click(id, handler) {
    listen(byId(id), 'click', handler);
  }

  click('undo', () => actions.undo());
  click('redo', () => actions.redo());
  click('zoom-out', () => viewportEngine.setZoom(state.zoom - 0.05));
  click('zoom-in', () => viewportEngine.setZoom(state.zoom + 0.05));
  click('fit-screen', () => viewportEngine.fitToWorkspace({ mode: 'screen' }));
  click('fit-page', () => viewportEngine.fitToWorkspace({ mode: 'screen' }));

  listen(elements.width, 'change', event => {
    const width = viewportEngine.setCanvasWidth(event.target.value);
    event.target.value = width;
  });

  click('toggle-grid', () => {
    state.grid = !state.grid;
    actions.render();
  });
  click('toggle-guides', () => {
    state.rulers = !state.rulers;
    actions.markUnsaved();
    actions.render();
    actions.toast(state.rulers ? 'Reglas visibles' : 'Reglas ocultas');
  });
  click('toggle-guide-visibility', () => {
    state.guidesVisible = !state.guidesVisible;
    actions.markUnsaved();
    actions.render();
    actions.toast(state.guidesVisible ? 'Guías y mediciones visibles' : 'Guías y mediciones ocultas');
  });
  click('toggle-snap', () => {
    state.snap = !state.snap;
    actions.markUnsaved();
    actions.render();
    actions.toast(state.snap ? 'Ajuste a guías activo' : 'Ajuste a guías desactivado');
  });
  click('lock-guides', () => {
    state.guidesLocked = !state.guidesLocked;
    actions.markUnsaved();
    actions.render();
    actions.toast(state.guidesLocked ? 'Guías bloqueadas' : 'Guías desbloqueadas');
  });
  const clearGuides = () => {
    if (!(state.customGuides || []).length) return actions.toast('No hay guías para eliminar');
    state.customGuides = [];
    actions.markUnsaved();
    actions.renderMeasurement();
    actions.toast('Todas las guías fueron eliminadas');
  };
  click('clear-guides', clearGuides);
  click('ruler-origin', clearGuides);
  click('clean-canvas', event => actions.toggleFocusView(event.currentTarget));
  click('preview', () => actions.preview());
  click('responsive-compare', () => actions.openResponsiveCompare());
  click('responsive-compare-close', () => actions.closeResponsiveCompare());
  click('responsive-compare-refresh', () => actions.renderResponsiveCompare());

  listen(document, 'click', event => {
    if (event.target.closest('#right-panel-toggle')) actions.toggleRightPanel();
    if (event.target.closest('#right-panel-reveal')) actions.toggleRightPanel(false);
    if (event.target.closest('#left-panel-toggle')) actions.toggleLeftPanel();
    if (event.target.closest('#left-panel-reveal')) actions.toggleLeftPanel(false);
  });

  click('breakpoint-manager', () => actions.showBreakpointManager());
  click('quick-add', event => actions.openQuickInsert({
    anchor: event.currentTarget.getBoundingClientRect(),
    placement: actions.insertionForClick()
  }));
  click('command-palette-trigger', () => actions.openCommandPalette());

  listen(document, 'change', event => {
    const toggle = event.target.closest?.('[data-breakpoint-enabled]');
    if (!toggle) return;
    const row = toggle.closest('[data-breakpoint-row]');
    row?.classList.toggle('is-disabled', !toggle.checked);
    row?.querySelectorAll('input[type="number"]').forEach(input => { input.disabled = !toggle.checked; });
    const label = toggle.parentElement?.querySelector('span');
    if (label) label.textContent = toggle.checked ? 'Activo' : 'Inactivo';
  });

  listen(window, 'resize', () => {
    viewportEngine.scheduleLayoutRefresh(() => {
      actions.onResize?.();
      actions.applyAdaptiveWorkspace();
      actions.applyLeftPanelChrome();
      actions.applyRightPanelChrome();
      if (state.quickInsertOpen) actions.positionQuickInsert();
      actions.renderCanvas();
      viewportEngine.fitToWorkspace({ silent: true, mode: preferredCanvasFitMode(state.breakpoint) });
      if (state.responsiveCompareOpen) actions.fitResponsiveCompareFrames();
    });
  }, { passive: true });

  click('import-tools', () => actions.showImportHub('design-system'));
  click('audit', () => actions.showAudit());
  click('inspector-top-toggle', () => actions.toggleRightPanel());
  click('export-project', () => actions.showProductionExport());
  click('export-json', () => actions.exportWorkspaceBackup());
  click('import-json', () => elements.jsonUpload?.click());
  click('project-dashboard-trigger', () => actions.openProjectDashboard());
  click('save-checkpoint', () => actions.createCheckpoint());

  listen(elements.projectSearch, 'input', event => {
    state.projectSearch = event.target.value;
    actions.renderProjectDashboard();
  });
  listen(elements.projectSort, 'change', event => {
    state.projectSort = event.target.value;
    actions.renderProjectDashboard();
  });
  click('project-archive-toggle', () => {
    state.projectShowArchived = !state.projectShowArchived;
    actions.renderProjectDashboard();
  });
  click('export-all-projects', () => actions.exportAllWorkspaceProjects());
  click('cleanup-project-versions', () => actions.cleanupWorkspaceVersions());
  listen(elements.projectBackupUpload, 'change', event => actions.importWorkspaceBackup(event.target.files?.[0]));

  return () => disposers.splice(0).forEach(dispose => dispose());
}
