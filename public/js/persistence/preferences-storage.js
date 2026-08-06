const STORAGE_KEY = 'orbit:preferences:v1';
const VERSION = 1;
const PERSISTED_KEYS = [
  'theme', 'breakpoint', 'zoom', 'canvasWidths', 'grid', 'rulers', 'guides',
  'guidesVisible', 'guidesLocked', 'snap', 'leftPanelWidth', 'rightPanelWidth',
  'leftPanelCollapsed', 'rightPanelCollapsed', 'directEditEnabled', 'inspectorTab', 'canvasMinimapVisible'
];

function systemTheme(window) {
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function defaults(window) {
  return createDefaultEditorPreferences(systemTheme(window));
}

function migrate(input, window) {
  return normalizeEditorPreferences(input, systemTheme(window));
}

function themeValue(theme, window) {
  return theme === 'system' ? systemTheme(window) : theme;
}

function createPreferencesStorage({ window, document, state, delay = 250, onSaved = () => {} }) {
  let timer = 0;
  let applying = false;
  let current = defaults(window);
  const disposers = [];

  function read() {
    try {
      current = migrate(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null'), window);
    } catch {
      current = defaults(window);
    }
    return current;
  }

  function applyTheme(theme = state.theme || current.theme) {
    const resolved = themeValue(theme, window);
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
    document.documentElement.dataset.themePreference = theme;
  }

  function apply({ includeLayout = true } = {}) {
    applying = true;
    const patch = {
      theme: current.theme,
      breakpoint: current.breakpoint,
      zoom: current.zoom,
      canvasWidths: { ...state.canvasWidths, ...current.canvasWidths },
      grid: current.grid,
      rulers: current.rulers,
      guides: current.guides,
      guidesVisible: current.guidesVisible,
      guidesLocked: current.guidesLocked,
      snap: current.snap,
      directEditEnabled: current.directEditEnabled,
      inspectorTab: current.inspectorTab,
      canvasMinimapVisible: current.canvasMinimapVisible
    };
    if (includeLayout) Object.assign(patch, {
      leftPanelWidth: current.leftPanelWidth,
      rightPanelWidth: current.rightPanelWidth,
      leftPanelCollapsed: current.leftPanelCollapsed,
      rightPanelCollapsed: current.rightPanelCollapsed
    });
    setState(patch, { source: 'preferences:restore' });
    applyTheme(current.theme);
    applying = false;
    return current;
  }

  function snapshot() {
    const result = { version: VERSION };
    for (const key of PERSISTED_KEYS) {
      const value = state[key];
      result[key] = value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : value;
    }
    return migrate(result, window);
  }

  function flush() {
    clearTimeout(timer);
    timer = 0;
    if (applying) return false;
    current = snapshot();
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
      onSaved(current);
      return true;
    } catch {
      return false;
    }
  }

  function schedule() {
    if (applying) return;
    clearTimeout(timer);
    timer = window.setTimeout(flush, delay);
  }

  function reset() {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch {}
    current = defaults(window);
    apply();
    flush();
    return current;
  }

  read();
  apply();
  disposers.push(subscribe(PERSISTED_KEYS, payload => {
    const keys = payload.keys || [payload.key];
    if (keys.includes('theme')) applyTheme(state.theme);
    schedule();
  }));
  const media = window.matchMedia?.('(prefers-color-scheme: light)');
  const onSystemTheme = () => { if (state.theme === 'system') applyTheme('system'); };
  media?.addEventListener?.('change', onSystemTheme);
  disposers.push(() => media?.removeEventListener?.('change', onSystemTheme));
  window.addEventListener('pagehide', flush);
  disposers.push(() => window.removeEventListener('pagehide', flush));

  function destroy() {
    flush();
    disposers.splice(0).forEach(dispose => dispose());
  }

  return { apply, applyTheme, destroy, flush, get: () => ({ ...current }), read, reset, schedule, snapshot, storageKey: STORAGE_KEY };
}