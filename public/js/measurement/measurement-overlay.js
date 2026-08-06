const RULER_SIZE = 24;
const measurementClamp = (value, min, max) => Math.max(min, Math.min(max, value));

function chooseStep(zoom) {
  const targetDesign = 55 / Math.max(zoom, 0.01);
  const power = 10 ** Math.floor(Math.log10(targetDesign));
  const normalized = targetDesign / power;
  const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return multiplier * power;
}

function prepareCanvas(canvas, cssWidth, cssHeight, dpr) {
  if (!canvas) return null;
  canvas.style.width = `${Math.max(1, cssWidth)}px`;
  canvas.style.height = `${Math.max(1, cssHeight)}px`;
  const width = Math.max(1, Math.round(cssWidth * dpr));
  const height = Math.max(1, Math.round(cssHeight * dpr));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const context = canvas.getContext('2d');
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, cssWidth, cssHeight);
  return context;
}

function createMeasurementOverlay({ window, document, state, elements, viewportEngine, getSelectedElement, actions }) {
  const rulerX = elements.rulerX;
  const rulerY = elements.rulerY;
  const status = elements.canvasStatus;
  let cursor = null;
  let frame = 0;
  let resizeObserver = null;
  const disposers = [];

  function rulerOffset() { return state.rulers ? RULER_SIZE : 0; }
  function designToStage(value) { return rulerOffset() + Number(value || 0) * state.zoom; }
  function stageToDesign(value) { return Math.max(0, (Number(value || 0) - rulerOffset()) / state.zoom); }

  function eventToDesign(event, orientation) {
    const rect = elements.stage.getBoundingClientRect();
    const raw = orientation === 'vertical' ? event.clientX - rect.left : event.clientY - rect.top;
    const canvasLimit = orientation === 'vertical'
      ? state.canvasWidths[state.breakpoint]
      : Math.max(760, elements.canvas?.scrollHeight || 760);
    return measurementClamp(Math.round(stageToDesign(raw)), 0, Math.round(canvasLimit));
  }

  function drawHorizontal(context, width, step) {
    context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--ruler-bg').trim() || '#151922';
    context.fillRect(0, 0, width, RULER_SIZE);
    context.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--ruler-line').trim() || 'rgba(148,163,184,.42)';
    context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--ruler-text').trim() || '#9aa6b8';
    context.font = '9px "Geist Mono", ui-monospace, monospace';
    context.textBaseline = 'top';
    const minor = step / 5;
    const max = state.canvasWidths[state.breakpoint];
    for (let value = 0; value <= max + minor / 2; value += minor) {
      const x = designToStage(value) + 0.5;
      const major = Math.abs(value % step) < 0.001;
      context.beginPath();
      context.moveTo(x, RULER_SIZE);
      context.lineTo(x, major ? 9 : 16);
      context.stroke();
      if (major && value <= max) context.fillText(String(Math.round(value)), x + 4, 3);
    }
    context.strokeStyle = 'rgba(148,163,184,.2)';
    context.beginPath(); context.moveTo(0, RULER_SIZE - 0.5); context.lineTo(width, RULER_SIZE - 0.5); context.stroke();
  }

  function drawVertical(context, height, step) {
    context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--ruler-bg').trim() || '#151922';
    context.fillRect(0, 0, RULER_SIZE, height);
    context.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--ruler-line').trim() || 'rgba(148,163,184,.42)';
    context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--ruler-text').trim() || '#9aa6b8';
    context.font = '9px "Geist Mono", ui-monospace, monospace';
    context.textBaseline = 'middle';
    const minor = step / 5;
    const max = Math.max(760, elements.canvas?.scrollHeight || 760);
    for (let value = 0; value <= max + minor / 2; value += minor) {
      const y = designToStage(value) + 0.5;
      const major = Math.abs(value % step) < 0.001;
      context.beginPath();
      context.moveTo(RULER_SIZE, y);
      context.lineTo(major ? 9 : 16, y);
      context.stroke();
      if (major && value <= max && value) {
        context.save();
        context.translate(5, y + 3);
        context.rotate(-Math.PI / 2);
        context.fillText(String(Math.round(value)), 0, 0);
        context.restore();
      }
    }
    context.strokeStyle = 'rgba(148,163,184,.2)';
    context.beginPath(); context.moveTo(RULER_SIZE - 0.5, 0); context.lineTo(RULER_SIZE - 0.5, height); context.stroke();
  }

  function renderRulers() {
    if (!rulerX || !rulerY) return;
    rulerX.hidden = !state.rulers;
    rulerY.hidden = !state.rulers;
    const corner = document.getElementById('ruler-origin');
    if (corner) corner.hidden = !state.rulers;
    if (!state.rulers) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, elements.stage.clientWidth);
    const height = Math.max(1, elements.stage.clientHeight);
    const step = chooseStep(state.zoom);
    const contextX = prepareCanvas(rulerX, width, RULER_SIZE, dpr);
    const contextY = prepareCanvas(rulerY, RULER_SIZE, height, dpr);
    if (contextX) drawHorizontal(contextX, width, step);
    if (contextY) drawVertical(contextY, height, step);
  }

  function selectionMetrics() {
    const selected = getSelectedElement();
    if (!selected) return null;
    const canvasRect = elements.canvas.getBoundingClientRect();
    const rect = selected.getBoundingClientRect();
    return {
      name: selected.dataset.orbitName || selected.dataset.id || 'Elemento',
      x: Math.round((rect.left - canvasRect.left) / state.zoom),
      y: Math.round((rect.top - canvasRect.top) / state.zoom),
      width: Math.round(rect.width / state.zoom),
      height: Math.round(rect.height / state.zoom)
    };
  }

  function renderStatus() {
    if (!status) return;
    const metrics = selectionMetrics();
    const cursorText = cursor && cursor.inside ? `Cursor X ${cursor.x} · Y ${cursor.y}` : 'Cursor fuera del canvas';
    const selectionText = metrics ? `${metrics.name} · X ${metrics.x} · Y ${metrics.y} · W ${metrics.width} · H ${metrics.height}` : 'Sin selección';
    status.innerHTML = `<span id="cursor-coordinates">${cursorText}</span><i></i><span id="selection-measurements">${selectionText}</span><i></i><span>${state.breakpoint === 'mobile' ? 'Mobile' : state.breakpoint === 'tablet' ? 'Tablet' : 'Desktop'} ${state.canvasWidths[state.breakpoint]} px</span><i></i><span>Zoom ${Math.round(state.zoom * 100)}%</span>`;
  }

  function render() {
    frame = 0;
    actions.onFrame?.();
    renderRulers();
    renderStatus();
    actions.renderGuides();
    actions.syncControls();
  }

  function scheduleRender() {
    if (frame) return;
    frame = window.requestAnimationFrame(render);
  }

  function onPointerMove(event) {
    if (!elements.stage) return;
    const canvasRect = elements.canvas.getBoundingClientRect();
    const inside = event.clientX >= canvasRect.left && event.clientX <= canvasRect.right && event.clientY >= canvasRect.top && event.clientY <= canvasRect.bottom;
    cursor = inside ? {
      inside: true,
      x: Math.round((event.clientX - canvasRect.left) / state.zoom),
      y: Math.round((event.clientY - canvasRect.top) / state.zoom)
    } : { inside: false, x: 0, y: 0 };
    viewportEngine.scheduleFrame('measurement-status', renderStatus);
  }

  function onPointerLeave() {
    cursor = null;
    viewportEngine.scheduleFrame('measurement-status', renderStatus);
  }

  elements.stage?.addEventListener('pointermove', onPointerMove, { passive: true });
  elements.stage?.addEventListener('pointerleave', onPointerLeave, { passive: true });
  disposers.push(() => elements.stage?.removeEventListener('pointermove', onPointerMove));
  disposers.push(() => elements.stage?.removeEventListener('pointerleave', onPointerLeave));
  resizeObserver = new ResizeObserver(() => viewportEngine.scheduleFrame('measurement-resize', render));
  if (elements.workspace) resizeObserver.observe(elements.workspace);
  if (elements.stage) resizeObserver.observe(elements.stage);
  disposers.push(() => resizeObserver.disconnect());
  disposers.push(subscribe(['rulers', 'guides', 'guidesVisible', 'guidesLocked', 'customGuides', 'zoom', 'breakpoint', 'canvasWidths', 'selectedId', 'focusView', 'theme'], scheduleRender));
  scheduleRender();

  function destroy() {
    if (frame) window.cancelAnimationFrame(frame);
    disposers.splice(0).forEach(dispose => dispose());
  }

  return { designToStage, destroy, eventToDesign, render, renderRulers, renderStatus, rulerOffset, scheduleRender, stageToDesign };
}