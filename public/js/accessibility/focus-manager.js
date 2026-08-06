const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function isVisible(element) {
  if (!element || element.hidden) return false;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return style?.visibility !== 'hidden' && style?.display !== 'none';
}

/**
 * Maintains a stack of transient UI layers, traps focus only for modal layers,
 * handles Escape on the top-most layer and restores the exact trigger.
 */
function createFocusManager({ document }) {
  const stack = [];

  function deferFocus(target, { select = false } = {}) {
    if (!target) return;
    setTimeout(() => {
      if (!target.isConnected) return;
      target.focus?.({ preventScroll: true });
      if (select) target.select?.();
    }, 0);
  }

  function focusable(container) {
    return [...(container?.querySelectorAll(FOCUSABLE_SELECTOR) || [])].filter(isVisible);
  }

  function top() {
    return stack[stack.length - 1] || null;
  }

  function openLayer(layer, options = {}) {
    if (!layer) return null;
    const existingIndex = stack.findIndex(entry => entry.layer === layer);
    if (existingIndex >= 0) stack.splice(existingIndex, 1);
    const active = document.activeElement;
    const trigger = options.trigger || (active && active !== document.body ? active : null);
    const entry = {
      layer,
      trigger,
      modal: options.modal !== false,
      onEscape: options.onEscape,
      restore: options.restore !== false,
    };
    stack.push(entry);
    layer.dataset.focusLayer = 'true';
    layer.setAttribute('aria-hidden', 'false');
    const target = typeof options.initialFocus === 'string'
      ? layer.querySelector(options.initialFocus)
      : options.initialFocus;
    deferFocus(target || focusable(layer)[0] || layer);
    return entry;
  }

  function closeLayer(layer, options = {}) {
    const index = [...stack].map(entry => entry.layer).lastIndexOf(layer);
    if (index < 0) return false;
    const [entry] = stack.splice(index, 1);
    entry.layer.removeAttribute('data-focus-layer');
    entry.layer.setAttribute('aria-hidden', 'true');
    const shouldRestore = options.restore ?? entry.restore;
    if (shouldRestore && entry.trigger?.isConnected) deferFocus(entry.trigger);
    return true;
  }

  function closeTop() {
    const entry = top();
    if (!entry) return false;
    if (typeof entry.onEscape === 'function') entry.onEscape();
    else closeLayer(entry.layer);
    return true;
  }

  function trapTab(event, entry) {
    const items = focusable(entry.layer);
    if (!items.length) {
      event.preventDefault();
      entry.layer.focus?.();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !entry.layer.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !entry.layer.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleKeydown(event) {
    const entry = top();
    if (!entry) return false;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      closeTop();
      return true;
    }
    if (event.key === 'Tab' && entry.modal) {
      trapTab(event, entry);
      return event.defaultPrevented;
    }
    return false;
  }

  function destroy() {
    while (stack.length) closeLayer(stack[stack.length - 1].layer, { restore: false });
  }

  return { closeLayer, closeTop, destroy, focusable, handleKeydown, openLayer, top };
}