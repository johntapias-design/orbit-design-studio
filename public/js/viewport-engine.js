/**
 * Owns viewport calculations and schedules visual work through a single
 * requestAnimationFrame queue. The editor can request several updates in the
 * same tick without repeating layout reads and writes.
 */
function preferredCanvasFitMode(breakpoint){
  return ['tablet','mobileL','mobile'].includes(breakpoint)?'screen':'width';
}
function createViewportEngine({ state, elements, callbacks }) {
  const jobs = new Map();
  let frameId = 0;
  let fitActive = true;
  let fitMode = 'width';
  let fitRefreshId = 0;

  function flushFrame() {
    frameId = 0;
    const queue = [...jobs.values()];
    jobs.clear();
    queue.forEach(job => job());
  }

  function scheduleFrame(key, job) {
    jobs.set(key, job);
    if (!frameId) frameId = requestAnimationFrame(flushFrame);
  }

  function canvasHeight() {
    return Math.max(760, elements.canvas?.scrollHeight || 0);
  }

  function calculateGeometry() {
    const width = state.canvasWidths[state.breakpoint] || 1200;
    const height = canvasHeight();
    const rulerOffset = state.rulers ? 24 : 0;
    return {
      width,
      height,
      rulerOffset,
      stageWidth: Math.ceil(width * state.zoom) + rulerOffset,
      stageHeight: Math.ceil(height * state.zoom) + rulerOffset,
    };
  }

  function updateGeometry() {
    scheduleFrame('canvas-geometry', () => {
      if (!elements.stage || !elements.canvas) return;
      const geometry = calculateGeometry();
      elements.stage.style.width = `${geometry.stageWidth}px`;
      elements.stage.style.height = `${geometry.stageHeight}px`;
      elements.stage.style.minWidth = fitActive ? '0px' : '';
      const visible=visibleWorkspaceRect();
      const workspaceRect=elements.workspace?.getBoundingClientRect();
      if(visible&&workspaceRect){
        const inset=Math.max(0,visible.left-workspaceRect.left);
        const centered=inset+Math.max(0,(visible.width-geometry.stageWidth)/2);
        elements.workspace.style.setProperty('--canvas-stage-offset',`${Math.round(centered)}px`);
      }

      const badge = elements.canvas.querySelector('[data-size-badge]');
      const selectedElement = state.selectedId
        ? elements.canvas.querySelector(`[data-id="${CSS.escape(state.selectedId)}"]`)
        : null;

      if (badge && selectedElement) {
        const rect = selectedElement.getBoundingClientRect();
        badge.textContent = `${Math.round(rect.width / state.zoom)} × ${Math.round(rect.height / state.zoom)}`;
      }
      callbacks.renderRulers();
      callbacks.renderSmartGuides();
      callbacks.scheduleContextualChrome?.();
    });
  }

  function setBreakpoint(breakpoint) {
    if (!isViewportName(breakpoint) || !callbacks.breakpointIsEnabled(breakpoint)) return;
    setState({ breakpoint, breakpointMenuOpen: false }, { source: 'viewport:breakpoint' });
    callbacks.render();
    scheduleFrame('breakpoint-fluid-fit', () => requestAnimationFrame(() => fitToWorkspace({ silent: true, mode: preferredCanvasFitMode(breakpoint) })));
  }

  function nodeIsVisible(node) {
    if (!node) return false;
    let current = node;
    while (current && current !== document.documentElement) {
      const style = getComputedStyle(current);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) <= 0.01) return false;
      current = current.parentElement;
    }
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function visibleWorkspaceRect() {
    const base = elements.workspace?.getBoundingClientRect();
    if (!base) return null;
    let left = base.left;
    let right = base.right;
    const leftSurface = elements.leftPanel?.querySelector('.left-main') || document.querySelector('.left-main');
    const rightSurface = elements.rightPanel;

    if (!state.leftPanelCollapsed && nodeIsVisible(leftSurface)) {
      const rect = leftSurface.getBoundingClientRect();
      if (rect.right > left && rect.left <= left + 1) left = Math.min(right, rect.right);
    }
    if (!state.rightPanelCollapsed && nodeIsVisible(rightSurface)) {
      const rect = rightSurface.getBoundingClientRect();
      if (rect.left < right && rect.right >= right - 1) right = Math.max(left, rect.left);
    }

    const insetLeft = Math.max(0, left - base.left);
    const insetRight = Math.max(0, base.right - right);
    elements.workspace?.style.setProperty('--canvas-inset-left', `${insetLeft}px`);
    elements.workspace?.style.setProperty('--canvas-inset-right', `${insetRight}px`);

    return {
      left,
      right,
      top: base.top,
      bottom: base.bottom,
      width: Math.max(0, right - left),
      height: base.height,
      workspaceLeft: base.left,
      workspaceRight: base.right,
    };
  }

  function workspaceCenter() {
    const rect = visibleWorkspaceRect();
    return rect
      ? { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }
      : null;
  }

  function captureAnchor(anchor) {
    if (!elements.workspace || !elements.shell) return null;
    const point = anchor || workspaceCenter();
    if (!point) return null;
    const shellRect = elements.shell.getBoundingClientRect();
    return {
      clientX: point.clientX,
      clientY: point.clientY,
      designX: (point.clientX - shellRect.left) / Math.max(0.01, state.zoom),
      designY: (point.clientY - shellRect.top) / Math.max(0.01, state.zoom),
    };
  }

  function restoreAnchor(anchor, nextZoom) {
    if (!anchor || !elements.workspace || !elements.shell) return;
    scheduleFrame('viewport-anchor', () => {
      const shellRect = elements.shell.getBoundingClientRect();
      const nextX = shellRect.left + anchor.designX * nextZoom;
      const nextY = shellRect.top + anchor.designY * nextZoom;
      elements.workspace.dataset.orbitProgrammaticScroll = 'true';
      elements.workspace.scrollLeft += nextX - anchor.clientX;
      elements.workspace.scrollTop += nextY - anchor.clientY;
      requestAnimationFrame(() => delete elements.workspace.dataset.orbitProgrammaticScroll);
    });
  }

  function setZoom(nextZoom, { silent = false, anchor = null, preserveAnchor = true, mode = 'manual' } = {}) {
    const zoom = normalizeZoom(nextZoom, state.zoom);
    if (Object.is(zoom, state.zoom)) return zoom;
    const anchorState = preserveAnchor ? captureAnchor(anchor) : null;
    if (mode === 'manual') fitActive = false;
    setState({ zoom }, { source: mode === 'restore' ? 'viewport:restore' : 'viewport:zoom' });
    scheduleFrame('canvas-render', callbacks.renderCanvas);
    if (anchorState) restoreAnchor(anchorState, zoom);
    if (!silent) callbacks.markUnsaved();
    return zoom;
  }

  function setCanvasWidth(rawWidth) {
    const fallback = state.canvasWidths[state.breakpoint] || 1200;
    const width = Math.round(clampNumber(rawWidth, fallback, 320, 5120));
    state.canvasWidths = { ...state.canvasWidths, [state.breakpoint]: width };
    scheduleFrame('canvas-render', callbacks.renderCanvas);
    scheduleFrame('canvas-width-fluid-fit', () => requestAnimationFrame(() => fitToWorkspace({ silent: true, mode: preferredCanvasFitMode(state.breakpoint) })));
    callbacks.markUnsaved();
    return width;
  }

  function workspaceMetrics() {
    const workspace = elements.workspace;
    const visible = visibleWorkspaceRect();
    const style = workspace ? getComputedStyle(workspace) : null;
    const number = value => Number.parseFloat(value) || 0;
    const horizontalPadding = style ? number(style.paddingLeft) + number(style.paddingRight) : 0;
    const verticalPadding = style ? number(style.paddingTop) + number(style.paddingBottom) : 0;
    const toolbarHeight = workspace?.querySelector('.workspace-toolbar')?.offsetHeight || 0;
    const statusbarHeight = elements.canvasStatus?.offsetHeight || 0;
    const rulerOffset = state.rulers ? 24 : 0;
    const safeGap = 0;
    return {
      width: Math.max(120, (visible?.width || workspace?.clientWidth || 1200) - horizontalPadding - rulerOffset - safeGap),
      height: Math.max(180, (visible?.height || workspace?.clientHeight || 800) - verticalPadding - toolbarHeight - statusbarHeight - rulerOffset - safeGap),
      toolbarHeight,
      statusbarHeight,
      visible,
    };
  }

  function calculateFitZoom({ mode = 'width' } = {}) {
    const profile = state.interfaceProfile || callbacks.getInterfaceProfile();
    const maxZoom = mode === 'width' ? 4 : profile === 'cinema' ? 1.5 : profile === 'ultrawide' ? 1.4 : profile === 'wide' ? 1.25 : 1.2;
    const available = workspaceMetrics();
    const width = state.canvasWidths[state.breakpoint] || 1200;
    const height = canvasHeight();
    const widthScale = available.width / Math.max(1, width);
    const heightScale = available.height / Math.max(1, height);
    const raw = mode === 'width' ? widthScale : Math.min(widthScale, heightScale);
    return {
      profile,
      mode,
      available,
      widthScale,
      heightScale,
      zoom: clampNumber(Math.round(Math.min(raw, maxZoom) * 10000) / 10000, 0.2, 0.2, maxZoom),
    };
  }

  function scrollWorkspace(options) {
    if (!elements.workspace) return;
    elements.workspace.dataset.orbitProgrammaticScroll = 'true';
    elements.workspace.scrollTo(options);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      delete elements.workspace.dataset.orbitProgrammaticScroll;
    }));
  }

  function centerCanvasNow({ behavior = 'smooth' } = {}) {
    if (!elements.workspace || !elements.stage) return;
    const workspace = elements.workspace;
    const visible = visibleWorkspaceRect();
    const stageRect = elements.stage.getBoundingClientRect();
    const targetClientX = visible ? visible.left + visible.width / 2 : workspace.getBoundingClientRect().left + workspace.clientWidth / 2;
    const targetClientY = visible ? visible.top + visible.height / 2 : workspace.getBoundingClientRect().top + workspace.clientHeight / 2;
    const left = Math.max(0, workspace.scrollLeft + stageRect.left + stageRect.width / 2 - targetClientX);
    const top = Math.max(0, workspace.scrollTop + stageRect.top + stageRect.height / 2 - targetClientY);
    scrollWorkspace({ left, top, behavior });
  }

  function centerCanvas({ behavior = 'smooth' } = {}) {
    if (!elements.workspace || !elements.stage) return;
    scheduleFrame('center-canvas', () => centerCanvasNow({ behavior }));
  }

  function fitToWorkspace({ silent = false, mode = 'width' } = {}) {
    const result = calculateFitZoom({ mode });
    fitActive = true;
    fitMode = mode;
    setState({ zoom: result.zoom }, { source: 'viewport:fit' });
    scheduleFrame('canvas-render', callbacks.renderCanvas);
    scheduleFrame('fit-center', () => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (mode === 'width') {
          scrollWorkspace({ left: 0, top: silent ? elements.workspace.scrollTop : 0, behavior: 'auto' });
        } else {
          centerCanvasNow({ behavior: 'auto' });
        }
      }));
    });
    if (!silent) callbacks.markUnsaved();
    if (!silent) callbacks.toast(`${mode==='width'?'Ancho completo':'Ajustado a pantalla'} · ${Math.round(result.zoom * 100)}% · ${callbacks.interfaceProfileLabel(result.profile)}`);
    return result;
  }

  function refreshFit() {
    if (!fitActive) return;
    cancelAnimationFrame(fitRefreshId);
    fitRefreshId = requestAnimationFrame(() => fitToWorkspace({ silent: true, mode: fitMode }));
  }

  function noteManualNavigation() {
    fitActive = false;
  }

  function centerSelection({ behavior = 'smooth' } = {}) {
    if (!elements.workspace) return;
    const id = state.selectedId;
    const node = id
      ? elements.canvas?.querySelector(`[data-id="${CSS.escape(id)}"]`)
      : elements.shell;
    if (!node) return;
    fitActive = false;
    const workspaceRect = visibleWorkspaceRect() || elements.workspace.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    const left = elements.workspace.scrollLeft + (nodeRect.left + nodeRect.width / 2) - (workspaceRect.left + workspaceRect.width / 2);
    const top = elements.workspace.scrollTop + (nodeRect.top + nodeRect.height / 2) - (workspaceRect.top + workspaceRect.height / 2);
    scrollWorkspace({ left: Math.max(0, left), top: Math.max(0, top), behavior });
  }

  function focusSelection() {
    const id = state.selectedId;
    const node = id ? elements.canvas?.querySelector(`[data-id="${CSS.escape(id)}"]`) : null;
    if (!node) {
      centerCanvas();
      callbacks.toast('No hay selección activa');
      return;
    }
    const rect = node.getBoundingClientRect();
    const available = workspaceMetrics();
    const designWidth = rect.width / Math.max(0.01, state.zoom);
    const designHeight = rect.height / Math.max(0.01, state.zoom);
    const target = Math.min(available.width / Math.max(1, designWidth), available.height / Math.max(1, designHeight), 1.5) * 0.82;
    setZoom(target, { silent: true, preserveAnchor: false, mode: 'manual' });
    scheduleFrame('focus-selection', () => requestAnimationFrame(() => centerSelection({ behavior: 'auto' })));
    callbacks.toast(`Selección enfocada · ${Math.round(normalizeZoom(target, state.zoom) * 100)}%`);
  }

  function scheduleLayoutRefresh(job) {
    scheduleFrame('responsive-layout', job);
  }

  function destroy() {
    if (frameId) cancelAnimationFrame(frameId);
    if (fitRefreshId) cancelAnimationFrame(fitRefreshId);
    frameId = 0;
    jobs.clear();
  }

  return {
    calculateGeometry,
    calculateFitZoom,
    centerCanvas,
    centerSelection,
    destroy,
    fitToWorkspace,
    focusSelection,
    isFitActive: () => fitActive,
    noteManualNavigation,
    refreshFit,
    scheduleFrame,
    scheduleLayoutRefresh,
    setBreakpoint,
    setCanvasWidth,
    setZoom,
    updateGeometry,
    visibleWorkspaceRect,
    workspaceMetrics,
  };
}