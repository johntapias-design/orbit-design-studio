// @ts-check

/** @typedef {import('./orbit').CanvasWidths} CanvasWidths */
/** @typedef {import('./orbit').EditorEventMap} EditorEventMap */
/** @typedef {import('./orbit').EditorPreferences} EditorPreferences */
/** @typedef {import('./orbit').ThemePreference} ThemePreference */
/** @typedef {import('./orbit').InspectorTab} InspectorTab */
/** @typedef {import('./orbit').ViewportName} ViewportName */

/** @type {readonly ViewportName[]} */
const VIEWPORT_NAMES = Object.freeze([
  'desktopXL',
  'desktop',
  'tablet',
  'mobileL',
  'mobile',
]);

/** @type {readonly ThemePreference[]} */
const THEME_PREFERENCES = Object.freeze(['dark', 'light', 'system']);

/** @type {readonly InspectorTab[]} */
const INSPECTOR_TABS = Object.freeze([
  'content',
  'design',
  'layout',
  'responsive',
  'interactions',
  'advanced',
]);

/** @type {Readonly<CanvasWidths>} */
const DEFAULT_CANVAS_WIDTHS = Object.freeze({
  desktopXL: 1440,
  desktop: 1200,
  tablet: 834,
  mobileL: 640,
  mobile: 390,
});

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/**
 * @param {unknown} value
 * @returns {value is ViewportName}
 */
function isViewportName(value) {
  return typeof value === 'string' && VIEWPORT_NAMES.includes(/** @type {ViewportName} */ (value));
}

/**
 * @param {unknown} value
 * @returns {value is ThemePreference}
 */
function isThemePreference(value) {
  return typeof value === 'string' && THEME_PREFERENCES.includes(/** @type {ThemePreference} */ (value));
}

/**
 * @param {unknown} value
 * @returns {value is InspectorTab}
 */
function isInspectorTab(value) {
  return typeof value === 'string' && INSPECTOR_TABS.includes(/** @type {InspectorTab} */ (value));
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @param {number} min
 * @param {number} max
 */
function clampNumber(value, fallback, min, max) {
  const parsed = typeof value === 'number' ? value : Number(value);
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(min, Math.min(max, safe));
}

/**
 * @param {unknown} value
 * @param {number} [fallback]
 */
function normalizeZoom(value, fallback = 0.85) {
  const clamped = clampNumber(value, fallback, 0.2, 4);
  return Math.round(clamped * 20) / 20;
}

/**
 * @param {unknown} value
 * @returns {CanvasWidths}
 */
function normalizeCanvasWidths(value) {
  const source = isRecord(value) ? value : {};
  /** @type {CanvasWidths} */
  const result = { ...DEFAULT_CANVAS_WIDTHS };

  for (const viewport of VIEWPORT_NAMES) {
    result[viewport] = Math.round(
      clampNumber(source[viewport], DEFAULT_CANVAS_WIDTHS[viewport], 320, 5120),
    );
  }

  return result;
}

/**
 * @param {'dark' | 'light'} [systemTheme]
 * @returns {EditorPreferences}
 */
function createDefaultEditorPreferences(systemTheme = 'dark') {
  return {
    version: 1,
    theme: systemTheme,
    breakpoint: 'desktop',
    zoom: 0.85,
    canvasWidths: { ...DEFAULT_CANVAS_WIDTHS },
    grid: false,
    rulers: true,
    guides: true,
    guidesVisible: true,
    guidesLocked: false,
    snap: true,
    leftPanelWidth: 380,
    rightPanelWidth: 360,
    leftPanelCollapsed: false,
    rightPanelCollapsed: false,
    directEditEnabled: true,
    inspectorTab: 'content',
    canvasMinimapVisible: true,
  };
}

/**
 * @param {unknown} input
 * @param {'dark' | 'light'} [systemTheme]
 * @returns {EditorPreferences}
 */
function normalizeEditorPreferences(input, systemTheme = 'dark') {
  const base = createDefaultEditorPreferences(systemTheme);
  if (!isRecord(input)) return base;

  const source = input;
  const rulers = source.rulers === undefined ? Boolean(source.guides ?? base.rulers) : Boolean(source.rulers);

  return {
    version: 1,
    theme: isThemePreference(source.theme) ? source.theme : base.theme,
    breakpoint: isViewportName(source.breakpoint) ? source.breakpoint : base.breakpoint,
    zoom: normalizeZoom(source.zoom, base.zoom),
    canvasWidths: normalizeCanvasWidths(source.canvasWidths),
    grid: Boolean(source.grid),
    rulers,
    guides: source.guides === undefined ? rulers : Boolean(source.guides),
    guidesVisible: source.guidesVisible === undefined ? true : Boolean(source.guidesVisible),
    guidesLocked: source.guidesLocked === undefined ? false : Boolean(source.guidesLocked),
    snap: source.snap === undefined ? true : Boolean(source.snap),
    leftPanelWidth: Math.round(clampNumber(source.leftPanelWidth, base.leftPanelWidth, 220, 560)),
    rightPanelWidth: Math.round(clampNumber(source.rightPanelWidth, base.rightPanelWidth, 260, 620)),
    leftPanelCollapsed: Boolean(source.leftPanelCollapsed),
    rightPanelCollapsed: Boolean(source.rightPanelCollapsed),
    directEditEnabled:
      source.directEditEnabled === undefined ? true : Boolean(source.directEditEnabled),
    canvasMinimapVisible:
      source.canvasMinimapVisible === undefined ? true : Boolean(source.canvasMinimapVisible),
    inspectorTab: isInspectorTab(source.inspectorTab) ? source.inspectorTab : base.inspectorTab,
  };
}

/**
 * Creates a typed event detail without coupling the contracts module to a DOM target.
 *
 * @template {keyof EditorEventMap} K
 * @param {K} type
 * @param {EditorEventMap[K]} detail
 * @returns {{ type: K, detail: EditorEventMap[K] }}
 */
function createEditorEvent(type, detail) {
  return { type, detail };
}