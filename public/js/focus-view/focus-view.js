function createFocusView({ document, state, elements, viewportEngine, actions }) {
  let trigger = null;
  let previous = null;
  const button = document.getElementById('clean-canvas');
  const exitButton = document.getElementById('focus-view-exit');
  const hud = document.getElementById('focus-view-hud');

  function sync() {
    elements.builder?.classList.toggle('focus-view', Boolean(state.focusView));
    document.body.classList.toggle('orbit-focus-view', Boolean(state.focusView));
    if (hud) hud.hidden = !state.focusView;
    if (button) {
      button.classList.toggle('active', Boolean(state.focusView));
      button.setAttribute('aria-pressed', String(Boolean(state.focusView)));
      button.setAttribute('aria-label', state.focusView ? 'Salir de Focus View' : 'Activar Focus View');
      button.dataset.tooltip = state.focusView ? 'Salir de Focus View (Shift + F)' : 'Focus View (Shift + F)';
    }
    document.getElementById('focus-view-viewport')?.replaceChildren(document.createTextNode(`${state.breakpoint === 'mobile' ? 'Mobile' : state.breakpoint === 'tablet' ? 'Tablet' : 'Desktop'} · ${state.canvasWidths[state.breakpoint]} px`));
    document.getElementById('focus-view-zoom')?.replaceChildren(document.createTextNode(`${Math.round(state.zoom * 100)}%`));
  }

  function enter(source = document.activeElement) {
    if (state.focusView) return;
    trigger = source instanceof HTMLElement ? source : button;
    previous = {
      leftPanelCollapsed: state.leftPanelCollapsed,
      rightPanelCollapsed: state.rightPanelCollapsed,
      previewMode: state.previewMode
    };
    setState({ focusView: true, previewMode: false }, { source: 'focus-view:enter' });
    sync();
    viewportEngine.scheduleLayoutRefresh(() => {
      actions.applyLayout();
      viewportEngine.fitToWorkspace({ silent: true, mode: preferredCanvasFitMode(state.breakpoint) });
    });
    requestAnimationFrame(() => exitButton?.focus({ preventScroll: true }));
    actions.announce('Focus View activado. El lienzo ocupa toda la pantalla. Pulsa Escape o Shift más F para salir.');
  }

  function exit({ restoreFocus = true } = {}) {
    if (!state.focusView) return false;
    const patch = { focusView: false, previewMode: previous?.previewMode || false };
    if (previous) Object.assign(patch, {
      leftPanelCollapsed: previous.leftPanelCollapsed,
      rightPanelCollapsed: previous.rightPanelCollapsed
    });
    setState(patch, { source: 'focus-view:exit' });
    sync();
    viewportEngine.scheduleLayoutRefresh(() => {
      actions.applyLayout();
      viewportEngine.fitToWorkspace({ silent: true, mode: preferredCanvasFitMode(state.breakpoint) });
    });
    if (restoreFocus) requestAnimationFrame(() => trigger?.focus?.({ preventScroll: true }));
    actions.announce('Focus View desactivado. La interfaz anterior fue restaurada.');
    previous = null;
    return true;
  }

  function toggle(source) {
    return state.focusView ? exit() : enter(source);
  }

  const onExit = () => exit();
  const onKeydown = event => {
    if (state.focusView && event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault();
      event.stopPropagation();
      exit();
    }
  };
  exitButton?.addEventListener('click', onExit);
  document.addEventListener('keydown', onKeydown, true);
  const unsubscribe = subscribe(['focusView', 'breakpoint', 'canvasWidths', 'zoom'], sync);
  sync();

  function destroy() {
    exitButton?.removeEventListener('click', onExit);
    document.removeEventListener('keydown', onKeydown, true);
    unsubscribe();
  }

  return { destroy, enter, exit, sync, toggle };
}