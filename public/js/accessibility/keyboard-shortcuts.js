function isEditingTarget(target) {
  return Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"]'));
}

function consume(event) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
}

/** Central registry for Orbit keyboard shortcuts. */
function createKeyboardShortcuts({ state, viewportEngine, actions }) {
  const definitions = [
    { id: 'desktop', label: 'Cambiar a Desktop', keys: 'Alt+1' },
    { id: 'tablet', label: 'Cambiar a Tablet', keys: 'Alt+2' },
    { id: 'mobile', label: 'Cambiar a Mobile', keys: 'Alt+3' },
    { id: 'zoom-in', label: 'Aumentar zoom', keys: 'Alt++' },
    { id: 'zoom-out', label: 'Reducir zoom', keys: 'Alt+-' },
    { id: 'fit', label: 'Ajustar página al espacio', keys: 'Alt+0' },
    { id: 'focus-selection', label: 'Enfocar selección', keys: 'Alt+.' },
    { id: 'center-canvas', label: 'Centrar canvas', keys: 'Alt+Inicio' },
    { id: 'minimap', label: 'Mostrar u ocultar minimapa', keys: 'Alt+M' },
    { id: 'pan', label: 'Mover el canvas', keys: 'Espacio + arrastrar' },
    { id: 'focus-mode', label: 'Activar o salir de Focus View', keys: 'Shift+F' },
    { id: 'inspector', label: 'Mostrar u ocultar Editar', keys: 'Alt+I' },
    { id: 'help', label: 'Mostrar atajos', keys: '?' },
  ];

  function handle(event) {
    if (event.defaultPrevented || isEditingTarget(event.target)) return false;
    const key = event.key.toLowerCase();
    const meta = event.ctrlKey || event.metaKey;
    if (meta) return false;

    let action = null;
    if (event.altKey && !event.shiftKey && event.code === 'Digit1') action = () => viewportEngine.setBreakpoint('desktop');
    else if (event.altKey && !event.shiftKey && event.code === 'Digit2') action = () => viewportEngine.setBreakpoint('tablet');
    else if (event.altKey && !event.shiftKey && event.code === 'Digit3') action = () => viewportEngine.setBreakpoint('mobile');
    else if (event.altKey && !event.shiftKey && (event.key === '+' || event.key === '=' || event.code === 'NumpadAdd')) action = () => viewportEngine.setZoom(state.zoom + 0.05);
    else if (event.altKey && !event.shiftKey && (event.key === '-' || event.code === 'NumpadSubtract')) action = () => viewportEngine.setZoom(state.zoom - 0.05);
    else if (event.altKey && !event.shiftKey && event.code === 'Digit0') action = () => viewportEngine.fitToWorkspace({ mode: 'screen' });
    else if (event.shiftKey && !event.altKey && key === 'f') action = () => actions.toggleDistractionFree();
    else if (event.altKey && !event.shiftKey && key === 'i') action = () => actions.toggleInspector();
    else if (!event.altKey && event.key === '?') action = () => actions.openShortcutHelp();

    if (!action) return false;
    consume(event);
    action();
    return true;
  }

  return { definitions, handle, isEditingTarget };
}