const VIEW_STORAGE_KEY = 'orbit:canvas-views:v1';
const SCROLL_SAVE_DELAY = 180;

function isEditableTarget(target) {
  return Boolean(target?.closest?.('input,textarea,select,[contenteditable="true"]'));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function safeParse(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function createCanvasNavigation({ window, document, state, elements, viewportEngine, actions }) {
  if (!elements.workspace || !elements.canvas || !elements.shell || !elements.stage) return null;

  const disposers = [];
  const parsedViews = safeParse(window.localStorage.getItem(VIEW_STORAGE_KEY) || '{}', {});
  const views = parsedViews && typeof parsedViews === 'object' && !Array.isArray(parsedViews) ? parsedViews : {};
  let activeKey = viewKey();
  let scrollTimer = 0;
  let frameId = 0;
  let spacePressed = false;
  let panSession = null;
  let pickerTrigger = null;

  const minimap = document.createElement('aside');
  minimap.className = 'canvas-minimap';
  minimap.setAttribute('aria-label', 'Minimapa del canvas');
  minimap.innerHTML = `
    <header><span><strong>Mapa</strong><small data-minimap-page>Home</small></span><div class="minimap-header-actions"><button type="button" data-minimap-collapse aria-label="Minimizar minimapa" aria-expanded="true">−</button><button type="button" data-minimap-close aria-label="Ocultar minimapa">×</button></div></header>
    <canvas data-minimap-canvas width="180" height="220" aria-label="Vista general navegable de la página"></canvas>
    <footer><span data-minimap-position>0 · 0</span><small>Arrastra para navegar</small></footer>
  `;

  const picker = document.createElement('div');
  picker.className = 'canvas-layer-picker';
  picker.hidden = true;
  picker.setAttribute('role', 'menu');
  picker.setAttribute('aria-label', 'Seleccionar elemento superpuesto');

  const panIndicator = document.createElement('div');
  panIndicator.className = 'canvas-pan-indicator';
  panIndicator.hidden = true;
  panIndicator.textContent = 'Arrastra para mover el canvas';

  elements.workspace.append(minimap, panIndicator);
  document.body.append(picker);
  const minimapCanvas = minimap.querySelector('[data-minimap-canvas]');
  const minimapContext = minimapCanvas.getContext('2d');

  function listen(target, type, handler, options) {
    target?.addEventListener(type, handler, options);
    disposers.push(() => target?.removeEventListener(type, handler, options));
  }

  function viewKey() {
    return `${state.currentProjectId || 'local'}:${state.currentPageId || 'page'}:${state.breakpoint || 'desktop'}`;
  }

  function persistViews() {
    try { window.localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(views)); } catch {}
  }

  function saveView(key = activeKey) {
    if (!key || state.projectDashboardOpen) return;
    views[key] = {
      zoom: state.zoom,
      scrollLeft: Math.round(elements.workspace.scrollLeft),
      scrollTop: Math.round(elements.workspace.scrollTop),
      minimapVisible: state.canvasMinimapVisible !== false,
      minimapCollapsed: minimap.classList.contains('is-collapsed'),
      updatedAt: Date.now(),
    };
    persistViews();
  }

  function scheduleSave() {
    window.clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(() => saveView(), SCROLL_SAVE_DELAY);
  }

  function restoreView() {
    const stored = views[activeKey];
    syncVisibility();
    if (!stored) {
      requestAnimationFrame(() => {
        viewportEngine.centerCanvas({ behavior: 'auto' });
        scheduleRender();
      });
      return;
    }
    if (Number.isFinite(stored.zoom)) {
      viewportEngine.setZoom(stored.zoom, { silent: true, preserveAnchor: false, mode: 'restore' });
    }
    setMinimapCollapsed(Boolean(stored.minimapCollapsed), {announce:false,save:false});
    requestAnimationFrame(() => requestAnimationFrame(() => {
      elements.workspace.scrollLeft = Math.max(0, Number(stored.scrollLeft) || 0);
      elements.workspace.scrollTop = Math.max(0, Number(stored.scrollTop) || 0);
      scheduleRender();
    }));
  }

  function syncVisibility() {
    const visible = state.canvasMinimapVisible !== false;
    minimap.hidden = !visible;
    const button = document.querySelector('[data-canvas-nav="minimap"]');
    button?.setAttribute('aria-pressed', String(visible));
    button?.classList.toggle('active', visible);
    positionChrome();
  }

  function toggleMinimap(force) {
    state.canvasMinimapVisible = typeof force === 'boolean' ? force : state.canvasMinimapVisible === false;
    syncVisibility();
    scheduleRender();
    actions.announce?.(state.canvasMinimapVisible ? 'Minimapa visible.' : 'Minimapa oculto.');
  }

  function setMinimapCollapsed(collapsed,{announce=true,save=true}={}){
    minimap.classList.toggle('is-collapsed',Boolean(collapsed));
    const button=minimap.querySelector('[data-minimap-collapse]');
    button?.setAttribute('aria-expanded',String(!collapsed));
    button?.setAttribute('aria-label',collapsed?'Expandir minimapa':'Minimizar minimapa');
    if(button)button.textContent=collapsed?'＋':'−';
    positionChrome();
    if(save)scheduleSave();
    if(announce)actions.announce?.(collapsed?'Minimapa minimizado.':'Minimapa expandido.');
  }

  function positionChrome() {
    const rect = viewportEngine.visibleWorkspaceRect?.() || elements.workspace.getBoundingClientRect();
    if (!minimap.hidden) {
      const miniWidth = minimap.offsetWidth || 196;
      const miniHeight = minimap.offsetHeight || 286;
      minimap.style.left = `${Math.max(rect.left + 12, rect.right - miniWidth - 14)}px`;
      minimap.style.top = `${Math.max(rect.top + 12, rect.bottom - miniHeight - 78)}px`;
    }
  }

  function scheduleRender() {
    if (frameId) return;
    frameId = requestAnimationFrame(() => {
      frameId = 0;
      positionChrome();
      renderMinimap();
    });
  }

  function renderMinimap() {
    if (minimap.hidden || !minimapContext) return;
    const cssWidth = 180;
    const canvasHeight = Math.max(760, elements.canvas.scrollHeight || 760);
    const cssHeight = clamp(Math.round(cssWidth * canvasHeight / Math.max(320, elements.canvas.scrollWidth || 1200)), 130, 240);
    const ratio = window.devicePixelRatio || 1;
    minimapCanvas.style.width = `${cssWidth}px`;
    minimapCanvas.style.height = `${cssHeight}px`;
    minimapCanvas.width = Math.round(cssWidth * ratio);
    minimapCanvas.height = Math.round(cssHeight * ratio);
    minimapContext.setTransform(ratio, 0, 0, ratio, 0, 0);
    minimapContext.clearRect(0, 0, cssWidth, cssHeight);

    const light = document.documentElement.dataset.theme === 'light';
    minimapContext.fillStyle = light ? '#f7f9fc' : '#10151d';
    minimapContext.fillRect(0, 0, cssWidth, cssHeight);
    const canvasRect = elements.canvas.getBoundingClientRect();
    const scaleX = cssWidth / Math.max(1, canvasRect.width);
    const scaleY = cssHeight / Math.max(1, canvasRect.height);
    const topLevel = [...elements.canvas.children].filter(node => node.matches?.('.canvas-element[data-id]'));
    const palette = light
      ? ['#dce6f3', '#e9ded8', '#dfe9df', '#e8e1f0', '#e8e8df']
      : ['#202b3a', '#34251f', '#213128', '#2c2538', '#303027'];
    topLevel.forEach((node, index) => {
      const rect = node.getBoundingClientRect();
      const x = (rect.left - canvasRect.left) * scaleX;
      const y = (rect.top - canvasRect.top) * scaleY;
      minimapContext.fillStyle = palette[index % palette.length];
      minimapContext.fillRect(x + 2, y + 2, Math.max(2, rect.width * scaleX - 4), Math.max(3, rect.height * scaleY - 4));
    });

    const workspaceRect = viewportEngine.visibleWorkspaceRect?.() || elements.workspace.getBoundingClientRect();
    const visibleLeft = clamp(workspaceRect.left - canvasRect.left, 0, canvasRect.width);
    const visibleTop = clamp(workspaceRect.top - canvasRect.top, 0, canvasRect.height);
    const visibleRight = clamp(workspaceRect.right - canvasRect.left, 0, canvasRect.width);
    const visibleBottom = clamp(workspaceRect.bottom - canvasRect.top, 0, canvasRect.height);
    minimapContext.strokeStyle = '#ef5a24';
    minimapContext.lineWidth = 2;
    minimapContext.fillStyle = 'rgba(239,90,36,.10)';
    minimapContext.fillRect(visibleLeft * scaleX, visibleTop * scaleY, Math.max(6, (visibleRight - visibleLeft) * scaleX), Math.max(6, (visibleBottom - visibleTop) * scaleY));
    minimapContext.strokeRect(visibleLeft * scaleX + 1, visibleTop * scaleY + 1, Math.max(4, (visibleRight - visibleLeft) * scaleX - 2), Math.max(4, (visibleBottom - visibleTop) * scaleY - 2));

    const pageLabel = minimap.querySelector('[data-minimap-page]');
    if (pageLabel) pageLabel.textContent = actions.getPageLabel?.() || state.currentPageId || 'Página';
    const position = minimap.querySelector('[data-minimap-position]');
    if (position) position.textContent = `${Math.round(elements.workspace.scrollLeft)} · ${Math.round(elements.workspace.scrollTop)}`;
  }

  function navigateFromMinimap(event) {
    const rect = minimapCanvas.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    const canvasRect = elements.canvas.getBoundingClientRect();
    const workspaceRect = viewportEngine.visibleWorkspaceRect?.() || elements.workspace.getBoundingClientRect();
    const targetX = canvasRect.left + canvasRect.width * x;
    const targetY = canvasRect.top + canvasRect.height * y;
    elements.workspace.scrollLeft += targetX - (workspaceRect.left + workspaceRect.width / 2);
    elements.workspace.scrollTop += targetY - (workspaceRect.top + workspaceRect.height / 2);
    viewportEngine.noteManualNavigation();
    scheduleSave();
    scheduleRender();
  }

  function startPan(event) {
    const allowed = event.button === 1 || (event.button === 0 && spacePressed);
    if (!allowed || event.target.closest('.canvas-minimap,.canvas-layer-picker')) return;
    event.preventDefault();
    event.stopPropagation();
    viewportEngine.noteManualNavigation();
    panSession = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      scrollLeft: elements.workspace.scrollLeft,
      scrollTop: elements.workspace.scrollTop,
    };
    elements.workspace.setPointerCapture?.(event.pointerId);
    elements.workspace.classList.add('is-panning');
    panIndicator.hidden = true;
  }

  function movePan(event) {
    if (!panSession || event.pointerId !== panSession.pointerId) return;
    elements.workspace.scrollLeft = panSession.scrollLeft - (event.clientX - panSession.x);
    elements.workspace.scrollTop = panSession.scrollTop - (event.clientY - panSession.y);
    scheduleRender();
  }

  function endPan(event) {
    if (!panSession || (event?.pointerId !== undefined && event.pointerId !== panSession.pointerId)) return;
    elements.workspace.releasePointerCapture?.(panSession.pointerId);
    panSession = null;
    elements.workspace.classList.remove('is-panning');
    scheduleSave();
  }

  function closePicker({ restoreFocus = false } = {}) {
    if (picker.hidden) return;
    picker.hidden = true;
    picker.innerHTML = '';
    if (restoreFocus) pickerTrigger?.focus?.();
    pickerTrigger = null;
  }

  function openLayerPicker(event) {
    const hits = [];
    const seen = new Set();
    for (const item of document.elementsFromPoint(event.clientX, event.clientY)) {
      const node = item.closest?.('.canvas-element[data-id]');
      const id = node?.dataset.id;
      if (!id || seen.has(id) || !elements.canvas.contains(node)) continue;
      seen.add(id);
      hits.push(id);
    }
    if (hits.length < 2) return false;
    event.preventDefault();
    pickerTrigger = document.activeElement;
    picker.innerHTML = `<header><strong>Seleccionar capa</strong><small>${hits.length} elementos bajo el cursor</small></header>${hits.map((id, index) => {
      const node = actions.getNode?.(id);
      return `<button type="button" role="menuitem" data-layer-pick="${actions.escapeHtml?.(id) || id}"><span>${index + 1}</span><strong>${actions.escapeHtml?.(node?.name || node?.type || 'Elemento') || 'Elemento'}</strong><small>${actions.escapeHtml?.(node?.type || '') || ''}</small></button>`;
    }).join('')}`;
    picker.hidden = false;
    const width = 240;
    const height = Math.min(360, 58 + hits.length * 48);
    picker.style.left = `${clamp(event.clientX, 10, window.innerWidth - width - 10)}px`;
    picker.style.top = `${clamp(event.clientY, 10, window.innerHeight - height - 10)}px`;
    picker.querySelector('button')?.focus();
    return true;
  }

  function isKeyboardContextBlocked(event) {
    return isEditableTarget(event.target) || state.commandPaletteOpen || state.quickInsertOpen || state.responsiveCompareOpen;
  }

  listen(document, 'click', event => {
    const action = event.target.closest('[data-canvas-nav]')?.dataset.canvasNav;
    if (action === 'minimap') toggleMinimap();
  });
  listen(minimap, 'click', event => {
    if (event.target.closest('[data-minimap-close]')) toggleMinimap(false);
    if (event.target.closest('[data-minimap-collapse]')) setMinimapCollapsed(!minimap.classList.contains('is-collapsed'));
  });
  listen(minimapCanvas, 'pointerdown', event => {
    event.preventDefault();
    minimapCanvas.setPointerCapture?.(event.pointerId);
    navigateFromMinimap(event);
  });
  listen(minimapCanvas, 'pointermove', event => {
    if (minimapCanvas.hasPointerCapture?.(event.pointerId)) navigateFromMinimap(event);
  });
  listen(minimapCanvas, 'pointerup', event => minimapCanvas.releasePointerCapture?.(event.pointerId));

  listen(elements.workspace, 'pointerdown', startPan, true);
  listen(elements.workspace, 'pointermove', movePan, true);
  listen(elements.workspace, 'pointerup', endPan, true);
  listen(elements.workspace, 'pointercancel', endPan, true);
  listen(elements.workspace, 'scroll', () => {
    if (!elements.workspace.dataset.orbitProgrammaticScroll) viewportEngine.noteManualNavigation();
    scheduleSave();
    scheduleRender();
  }, { passive: true });
  listen(elements.workspace, 'wheel', event => {
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    const direction = event.deltaY > 0 ? -0.05 : 0.05;
    viewportEngine.setZoom(state.zoom + direction, {
      anchor: { clientX: event.clientX, clientY: event.clientY },
      mode: 'manual',
    });
    scheduleSave();
    scheduleRender();
  }, { passive: false });

  listen(elements.canvas, 'contextmenu', event => openLayerPicker(event));
  listen(picker, 'click', event => {
    const button = event.target.closest('[data-layer-pick]');
    if (!button) return;
    actions.selectNode?.(button.dataset.layerPick);
    closePicker();
  });
  listen(document, 'pointerdown', event => {
    if (!picker.hidden && !event.target.closest('.canvas-layer-picker')) closePicker();
  });

  listen(document, 'keydown', event => {
    if (event.code === 'Space' && !isKeyboardContextBlocked(event)) {
      spacePressed = true;
      elements.workspace.classList.add('is-pan-ready');
      panIndicator.hidden = false;
      event.preventDefault();
      return;
    }
    if (isKeyboardContextBlocked(event)) return;
    if (event.altKey && event.code === 'Period') {
      event.preventDefault();
      viewportEngine.focusSelection();
    } else if (event.altKey && event.code === 'KeyM') {
      event.preventDefault();
      toggleMinimap();
    } else if (event.altKey && event.code === 'Home') {
      event.preventDefault();
      viewportEngine.centerCanvas();
    }
    if (!picker.hidden) {
      if (event.key === 'Escape') { event.preventDefault(); closePicker({ restoreFocus: true }); }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const buttons = [...picker.querySelectorAll('button')];
        const current = buttons.indexOf(document.activeElement);
        const next = event.key === 'ArrowDown' ? (current + 1) % buttons.length : (current - 1 + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
    }
  });
  listen(document, 'keyup', event => {
    if (event.code !== 'Space') return;
    spacePressed = false;
    elements.workspace.classList.remove('is-pan-ready');
    panIndicator.hidden = true;
    endPan();
  });
  listen(window, 'blur', () => {
    spacePressed = false;
    elements.workspace.classList.remove('is-pan-ready');
    panIndicator.hidden = true;
    endPan();
  });
  listen(window, 'resize', scheduleRender, { passive: true });

  const observer = new ResizeObserver(() => {
    if (viewportEngine.isFitActive()) viewportEngine.refreshFit();
    scheduleRender();
  });
  observer.observe(elements.workspace);
  observer.observe(elements.canvas);
  disposers.push(() => observer.disconnect());

  disposers.push(subscribe(['currentPageId', 'currentProjectId', 'breakpoint'], () => {
    saveView(activeKey);
    activeKey = viewKey();
    restoreView();
  }));
  disposers.push(subscribe(['zoom', 'canvasMinimapVisible', 'leftPanelCollapsed', 'rightPanelCollapsed', 'leftPanelWidth', 'rightPanelWidth'], payload => {
    if (payload.key === 'canvasMinimapVisible' || payload.keys?.includes('canvasMinimapVisible')) syncVisibility();
    scheduleSave();
    scheduleRender();
    const keys = payload.keys || [payload.key];
    if (keys.some(key => ['leftPanelCollapsed', 'rightPanelCollapsed', 'leftPanelWidth', 'rightPanelWidth'].includes(key)) && viewportEngine.isFitActive()) {
      viewportEngine.refreshFit();
    }
  }));

  syncVisibility();
  requestAnimationFrame(() => {
    positionChrome();
    renderMinimap();
  });

  function destroy() {
    saveView();
    window.clearTimeout(scrollTimer);
    if (frameId) cancelAnimationFrame(frameId);
    observer.disconnect();
    disposers.splice(0).forEach(dispose => dispose());
    minimap.remove();
    picker.remove();
    panIndicator.remove();
  }

  return {
    closePicker,
    destroy,
    render: scheduleRender,
    restoreView,
    saveView,
    toggleMinimap,
  };
}


/* public/app.js */
(() => {
'use strict';
const STORAGE_KEY = 'orbit-design-studio-v0-9-project-workspace-fallback';
const PREVIOUS_STORAGE_KEY = 'orbit-design-studio-v0-8-9-spacing-inline';
const PREVIOUS_STORAGE_KEY_2 = 'orbit-design-studio-v0-8-8-spacing-toggle';
const PROJECT_DB_NAME = 'orbit-design-studio-v0-9';
const PROJECT_DB_VERSION = 1;
const PROJECT_STORE = 'projects';
const ACTIVE_PROJECT_KEY = 'orbit-v0-9-active-project';
const SESSION_RECOVERY_KEY = 'orbit-v0-9-session-recovery';
const MIGRATION_KEY = 'orbit-v0-9-migration-complete';
const LEGACY_STORAGE_KEY = 'orbit-builder-alpha-v5';
const BREAKPOINTS = ['desktopXL','desktop','tablet','mobileL','mobile'];
const CORE_BREAKPOINTS = ['desktop','tablet','mobile'];
const SECONDARY_BREAKPOINTS = ['desktopXL','mobileL'];
const breakpointLabels = { desktopXL:'Escritorio XL',desktop:'Escritorio',tablet:'Tablet',mobileL:'Móvil grande',mobile:'Móvil' };
const breakpointShort = { desktopXL:'XL',desktop:'D',tablet:'T',mobileL:'ML',mobile:'M' };
const icons = {
  section:'sectionFrame', container:'containerFrame', grid:'gridMasonry', block:'box', div:'box', card:'panelTop', divider:'separatorHorizontal', spacer:'spacer',
  heading:'headingOne', text:'textParagraph', richtext:'richText', link:'linkTwo', button:'buttonCursor', badge:'badge', quote:'quote', list:'listBullets', icon:'sparkleSymbol',
  image:'imageFrame', gallery:'gallery', video:'videoFrame', svg:'bezierSquare', form:'formLayout', input:'textCursorInput', textareaField:'textBlock', selectField:'chevronsSelect', statCard:'chartUp', testimonial:'chatQuote', pricingCard:'receiptCard', faqItem:'accordion', favorite:'star', recent:'history', add:'plusCircle', filter:'sliders'
};
const elementSections = [
  { id:'layout', label:'Layout', kicker:'BUILD', items:[
    ['section','Section','Zona principal para bloques completos'],
    ['container','Container','Auto layout flexible y reutilizable'],
    ['grid','Grid','Contenedor en grid con columnas editables'],
    ['block','Block','Bloque neutro para estructura'],
    ['div','Div','Wrapper liviano y totalmente libre'],
    ['card','Card','Tarjeta visual con padding y radio'],
    ['divider','Divider','Separador horizontal'],
    ['spacer','Spacer','Espacio vertical controlado']
  ]},
  { id:'basic', label:'Basic', kicker:'CONTENT', items:[
    ['heading','Heading','Título editable con jerarquía'],
    ['text','Text','Párrafo editable para contenido'],
    ['richtext','Rich Text','Texto enriquecido en bloque'],
    ['link','Text Link','Enlace textual ligero'],
    ['button','Button','Llamado a la acción'],
    ['badge','Badge','Etiqueta breve para destacar'],
    ['quote','Quote','Cita o testimonio editorial'],
    ['list','List','Lista con ítems editables'],
    ['icon','Icon','Elemento icónico simple']
  ]},
  { id:'media', label:'Media', kicker:'MEDIA', items:[
    ['image','Image','Imagen adaptable'],
    ['gallery','Gallery','Galería en grid con tres imágenes'],
    ['video','Video','Bloque de video embebido'],
    ['svg','SVG','Elemento vectorial decorativo']
  ]},
  { id:'forms', label:'Forms', kicker:'FORMS', items:[
    ['form','Form','Formulario base listo para editar'],
    ['input','Input','Campo de texto'],
    ['textareaField','Textarea','Campo de mensaje de varias líneas'],
    ['selectField','Select','Selector con opciones']
  ]},
  { id:'advanced', label:'Advanced', kicker:'PATTERNS', items:[
    ['statCard','Stat Card','Dato destacado con título y supporting copy'],
    ['testimonial','Testimonial','Tarjeta con cita, autor y rol'],
    ['pricingCard','Pricing Card','Bloque de pricing con CTA'],
    ['faqItem','FAQ Item','Pregunta con respuesta en formato acordeón']
  ]}
];
const tokenMeta = {
  colors: { label:'Colores', prefix:'color' },
  typography: { label:'Tipografía', prefix:'font' },
  spacing: { label:'Espaciado', prefix:'space' },
  radius: { label:'Radios', prefix:'radius' },
  shadows: { label:'Sombras', prefix:'shadow' }
};
const defaultTokens = {
  colors: {
    primary:{name:'Primary',value:'#151513'}, accent:{name:'Accent',value:'#ef5a24'}, purple:{name:'Purple',value:'#8d5cff'},
    background:{name:'Background',value:'#f5f1e8'}, surface:{name:'Surface',value:'#ffffff'}, text:{name:'Text',value:'#151513'},
    muted:{name:'Muted',value:'#625e55'}, soft:{name:'Soft',value:'#e6dfd1'}
  },
  typography: {
    familySans:{name:'Sans principal',value:'"Geist", "Inter", sans-serif'}, familyEditorial:{name:'Serif editorial',value:'Georgia, "Times New Roman", serif'},
    display:{name:'Display',value:'68px'}, h2:{name:'Heading 2',value:'42px'}, h3:{name:'Heading 3',value:'30px'},
    bodyLarge:{name:'Body Large',value:'19px'}, body:{name:'Body',value:'17px'}, small:{name:'Small',value:'13px'}
  },
  spacing: {
    xs:{name:'XS',value:'8px'}, sm:{name:'S',value:'12px'}, md:{name:'M',value:'20px'}, lg:{name:'L',value:'32px'},
    xl:{name:'XL',value:'56px'}, xxl:{name:'XXL',value:'88px'}
  },
  radius: {
    sm:{name:'Small',value:'8px'}, md:{name:'Medium',value:'16px'}, lg:{name:'Large',value:'28px'}, pill:{name:'Pill',value:'999px'}
  },
  shadows: {
    soft:{name:'Soft',value:'0 16px 42px rgba(15,17,22,.12)'}, elevated:{name:'Elevated',value:'0 28px 80px rgba(15,17,22,.20)'}
  }
};
const googleFontCatalog = [
  {family:'Inter',category:'Sans serif',fallback:'sans-serif',weights:[300,400,500,600,700,800],italic:true},
  {family:'Roboto',category:'Sans serif',fallback:'sans-serif',weights:[300,400,500,700,900],italic:true},
  {family:'Open Sans',category:'Sans serif',fallback:'sans-serif',weights:[300,400,500,600,700,800],italic:true},
  {family:'Lato',category:'Sans serif',fallback:'sans-serif',weights:[300,400,700,900],italic:true},
  {family:'Montserrat',category:'Sans serif',fallback:'sans-serif',weights:[300,400,500,600,700,800,900],italic:true},
  {family:'Poppins',category:'Sans serif',fallback:'sans-serif',weights:[300,400,500,600,700,800],italic:true},
  {family:'Nunito Sans',category:'Sans serif',fallback:'sans-serif',weights:[300,400,500,600,700,800],italic:true},
  {family:'Raleway',category:'Sans serif',fallback:'sans-serif',weights:[300,400,500,600,700,800],italic:true},
  {family:'Work Sans',category:'Sans serif',fallback:'sans-serif',weights:[300,400,500,600,700,800],italic:true},
  {family:'Manrope',category:'Sans serif',fallback:'sans-serif',weights:[300,400,500,600,700,800],italic:false},
  {family:'DM Sans',category:'Sans serif',fallback:'sans-serif',weights:[300,400,500,600,700],italic:true},
  {family:'Space Grotesk',category:'Display',fallback:'sans-serif',weights:[300,400,500,600,700],italic:false},
  {family:'Plus Jakarta Sans',category:'Sans serif',fallback:'sans-serif',weights:[300,400,500,600,700,800],italic:true},
  {family:'Outfit',category:'Display',fallback:'sans-serif',weights:[300,400,500,600,700,800],italic:false},
  {family:'Figtree',category:'Sans serif',fallback:'sans-serif',weights:[300,400,500,600,700,800],italic:true},
  {family:'Source Sans 3',category:'Sans serif',fallback:'sans-serif',weights:[300,400,500,600,700,800],italic:true},
  {family:'Archivo',category:'Sans serif',fallback:'sans-serif',weights:[300,400,500,600,700,800],italic:true},
  {family:'Barlow',category:'Sans serif',fallback:'sans-serif',weights:[300,400,500,600,700,800],italic:true},
  {family:'Urbanist',category:'Display',fallback:'sans-serif',weights:[300,400,500,600,700,800],italic:true},
  {family:'Oswald',category:'Display',fallback:'sans-serif',weights:[300,400,500,600,700],italic:false},
  {family:'Bebas Neue',category:'Display',fallback:'sans-serif',weights:[400],italic:false},
  {family:'Merriweather',category:'Serif',fallback:'serif',weights:[300,400,700,900],italic:true},
  {family:'Playfair Display',category:'Serif',fallback:'serif',weights:[400,500,600,700,800,900],italic:true},
  {family:'Lora',category:'Serif',fallback:'serif',weights:[400,500,600,700],italic:true},
  {family:'Libre Baskerville',category:'Serif',fallback:'serif',weights:[400,700],italic:true},
  {family:'Cormorant Garamond',category:'Serif',fallback:'serif',weights:[300,400,500,600,700],italic:true},
  {family:'Fraunces',category:'Serif display',fallback:'serif',weights:[300,400,500,600,700,800,900],italic:true},
  {family:'Roboto Mono',category:'Monospace',fallback:'monospace',weights:[300,400,500,600,700],italic:true},
  {family:'JetBrains Mono',category:'Monospace',fallback:'monospace',weights:[300,400,500,600,700,800],italic:true},
  {family:'IBM Plex Mono',category:'Monospace',fallback:'monospace',weights:[300,400,500,600,700],italic:true}
];
const starter = [{
  id:'hero-section',type:'section',name:'Hero Section',htmlTag:'main',styles:{base:{width:'100%',minHeight:'720px',paddingTop:'var(--space-xxl)',paddingRight:'var(--space-xl)',paddingBottom:'var(--space-xxl)',paddingLeft:'var(--space-xl)',display:'flex',direction:'column',justify:'center',align:'center',gap:'var(--space-lg)',background:'var(--color-background)',color:'var(--color-text)'},tablet:{minHeight:'640px',paddingTop:'64px',paddingRight:'32px',paddingBottom:'64px',paddingLeft:'32px'},mobile:{minHeight:'620px',paddingTop:'48px',paddingRight:'20px',paddingBottom:'48px',paddingLeft:'20px'}},children:[{
    id:'hero-container',type:'container',name:'Hero Content',styles:{base:{width:'100%',maxWidth:'1120px',display:'grid',gridColumns:2,gap:'var(--space-xl)',align:'center'},tablet:{gridColumns:1,gap:'40px'},mobile:{gridColumns:1,gap:'32px'}},children:[{
      id:'hero-copy',type:'container',name:'Copy Group',styles:{base:{width:'100%',display:'flex',direction:'column',align:'flex-start',gap:'22px'}},children:[
        {id:'eyebrow',type:'text',name:'Eyebrow',content:'ASTRO VISUAL BUILDER · ALPHA',styles:{base:{color:'#706b5f',fontSize:'var(--font-small)',fontWeight:700,lineHeight:1.2,letterSpacing:'1.8px'}}},
        {id:'hero-title',type:'heading',tag:'h1',name:'Main Heading',content:'Diseña visualmente. Publica con Astro.',styles:{base:{color:'var(--color-text)',fontSize:'var(--font-display)',fontWeight:700,lineHeight:1.02,letterSpacing:'-3.2px'},tablet:{fontSize:'54px',letterSpacing:'-2.2px'},mobile:{fontSize:'42px',letterSpacing:'-1.6px'}}},
        {id:'hero-text',type:'text',name:'Description',content:'Un constructor pensado para diseñadores: composición libre, estilos visuales y salida limpia para Astro.',styles:{base:{color:'var(--color-muted)',fontSize:'var(--font-bodyLarge)',fontWeight:400,lineHeight:1.55,maxWidth:'590px'},mobile:{fontSize:'17px'}}},
        {id:'hero-actions',type:'container',name:'Actions',styles:{base:{display:'flex',direction:'row',gap:'var(--space-sm)',align:'center'},mobile:{direction:'column',align:'stretch',width:'100%'}},children:[
          {id:'primary-button',type:'button',name:'Primary Button',content:'Crear proyecto',href:'#',styles:{base:{background:'var(--color-primary)',color:'#ffffff',fontSize:'15px',fontWeight:700,paddingTop:'15px',paddingRight:'22px',paddingBottom:'15px',paddingLeft:'22px',borderRadius:'var(--radius-pill)'}}},
          {id:'secondary-button',type:'button',name:'Secondary Button',content:'Ver componentes',href:'#',styles:{base:{background:'var(--color-soft)',color:'var(--color-text)',fontSize:'15px',fontWeight:700,paddingTop:'15px',paddingRight:'22px',paddingBottom:'15px',paddingLeft:'22px',borderRadius:'var(--radius-pill)'}}}
        ]}
      ]
    },{
      id:'hero-card',type:'card',name:'Visual Card',styles:{base:{minHeight:'430px',paddingTop:'28px',paddingRight:'28px',paddingBottom:'28px',paddingLeft:'28px',display:'flex',direction:'column',justify:'space-between',gap:'24px',background:'var(--color-accent)',color:'#ffffff',borderRadius:'var(--radius-lg)',boxShadow:'0 30px 70px rgba(74,46,28,.20)'},mobile:{minHeight:'360px',borderRadius:'22px'}},children:[
        {id:'card-label',type:'text',name:'Card Label',content:'CANVAS / 02',styles:{base:{color:'#ffffff',fontSize:'var(--font-small)',fontWeight:700,letterSpacing:'1.5px'}}},
        {id:'card-heading',type:'heading',tag:'h2',name:'Card Heading',content:'El código queda detrás. El diseño va primero.',styles:{base:{color:'#ffffff',fontSize:'var(--font-h2)',fontWeight:700,lineHeight:1.08,letterSpacing:'-1.8px'},mobile:{fontSize:'34px'}}}
      ]}
    ]
  }]
}];
const sectionTemplates = [
  {id:'navbar',name:'Navbar minimal',desc:'Logo, navegación y CTA',create:makeNavbar},
  {id:'hero',name:'Hero editorial',desc:'Split layout con tarjeta',create:makeHero},
  {id:'features',name:'Features grid',desc:'Tres beneficios en cards',create:makeFeatures},
  {id:'cta',name:'CTA contrast',desc:'Cierre visual de conversión',create:makeCta}
];
const state = createOrbitState({ clone, hydrateNodes, starter, defaultTokens });
let viewportEngine = null;
let accessibility=null;
let preferences=null;
let focusView=null;
let measurementTools=null;
let themeSystem=null;
let canvasNavigation=null;
const runtimePerformance=createRuntimePerformance({window});
const { $, els } = createDomRegistry(document);
const workspaceStorage=createWorkspaceStorage({
  window,document,state,clone,uid,slug,defaultProjectSnapshot,projectRecordFromSnapshot,
  constants:{storageKey:STORAGE_KEY,dbName:PROJECT_DB_NAME,dbVersion:PROJECT_DB_VERSION,storeName:PROJECT_STORE}
});
const {
  projectDbGet,projectDbList,projectDbListRaw,projectDbPut,projectDbDelete,
  normalizeProjectRecord,normalizeProjectSnapshot,normalizeProjectVersions,
  reportWorkspaceHealth,clearWorkspaceHealth,renderWorkspaceHealth,
  setMemoryProjects:setWorkspaceMemoryProjects
}=workspaceStorage;
preferences=createPreferencesStorage({window,document,state,onSaved:()=>runtimePerformance.increment('preferenceWrites')});
const svgUploadInput=document.createElement('input');
svgUploadInput.type='file';
svgUploadInput.accept='.svg,image/svg+xml';
svgUploadInput.hidden=true;
document.body.appendChild(svgUploadInput);
function clone(value){ return JSON.parse(JSON.stringify(value)); }
function uid(prefix='element'){ return `${prefix}-${Math.random().toString(36).slice(2,9)}`; }
function escapeHtml(value=''){ return String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c])); }
function safeLocalGet(key){try{return window.localStorage.getItem(key);}catch{return null;}}
function safeLocalSet(key,value){try{window.localStorage.setItem(key,value);return true;}catch{return false;}}
function safeLocalRemove(key){try{window.localStorage.removeItem(key);}catch{}}
function sanitizeSvgMarkup(markup=''){
  const source=String(markup||'').trim();
  if(!source)return '';
  try{
    const doc=new DOMParser().parseFromString(source,'image/svg+xml');
    if(doc.querySelector('parsererror'))return '';
    const svg=doc.documentElement;
    if(!svg||String(svg.nodeName).toLowerCase()!=='svg')return '';
    svg.querySelectorAll('script,foreignObject,iframe,object,embed').forEach(node=>node.remove());
    svg.querySelectorAll('*').forEach(node=>[...node.attributes].forEach(attr=>{
      const name=attr.name.toLowerCase();
      const value=String(attr.value||'').trim().toLowerCase();
      if(name.startsWith('on')||((name==='href'||name==='xlink:href')&&value.startsWith('javascript:')))node.removeAttribute(attr.name);
    }));
    return svg.outerHTML;
  }catch{return '';}
}
function slug(value='item'){ return String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'item'; }
function workspaceSnapshot(){
  syncCurrentPageRecord();
  return {
    version:12,projectName:state.projectName,pageMeta:clone(state.pageMeta),nodes:clone(state.nodes),tokens:clone(state.tokens),assets:clone(state.assets),components:clone(state.components),globalClasses:clone(state.globalClasses),pages:clone(state.pages),currentPageId:state.currentPageId,
    breakpoints:clone(state.breakpoints),breakpointEnabled:clone(state.breakpointEnabled),canvasWidths:clone(state.canvasWidths),responsiveCompareSync:state.responsiveCompareSync,responsiveCompareSelected:state.responsiveCompareSelected,responsiveCompareZoom:clone(state.responsiveCompareZoom),responsiveAuditIgnored:clone(state.responsiveAuditIgnored),selectedId:state.selectedId,selectedIds:clone(selectedIds()),zoom:state.zoom,breakpoint:state.breakpoint,styleState:state.styleState,tab:state.tab,grid:state.grid,rulers:state.rulers,guides:state.guides,guidesVisible:state.guidesVisible,guidesLocked:state.guidesLocked,guideUnitVersion:2,snap:state.snap,customGuides:clone(state.customGuides),
    exportSettings:clone(state.exportSettings),elementFavorites:clone(state.elementFavorites),elementRecent:clone(state.elementRecent),rightPanelWidth:state.rightPanelWidth,rightPanelCollapsed:state.rightPanelCollapsed,leftPanelWidth:state.leftPanelWidth,leftPanelCollapsed:state.leftPanelCollapsed,tokenGroupsOpen:clone(state.tokenGroupsOpen),inspectorMode:state.inspectorMode,inspectorTab:state.inspectorTab,directEditEnabled:state.directEditEnabled,openSections:clone(state.openSections),collapsed:clone(state.collapsed),assetSearch:state.assetSearch,assetFilter:state.assetFilter
  };
}
function restoreWorkspaceSnapshot(saved){
  const source=clone(saved||{});
  state.tokens=source.tokens||clone(defaultTokens);ensureTokenGroups();state.assets=source.assets||[];state.components=(source.components||[]).map(normalizeComponentDefinition);state.globalClasses=source.globalClasses||[];state.projectName=source.projectName||'Untitled project';state.breakpoints=source.breakpoints||{desktopXL:1440,desktop:1200,tablet:1024,mobileL:768,mobile:480};state.breakpointEnabled=source.breakpointEnabled||{desktopXL:true,mobileL:true};state.canvasWidths=source.canvasWidths||{desktopXL:1440,desktop:1200,tablet:834,mobileL:640,mobile:390};state.zoom=source.zoom||.85;state.theme=source.theme||state.theme;state.rulers=source.rulers===undefined?(source.guides===undefined?true:!!source.guides):!!source.rulers;state.guides=source.guides===undefined?true:!!source.guides;state.guidesVisible=source.guidesVisible!==false;state.guidesLocked=!!source.guidesLocked;state.guideUnitVersion=2;state.exportSettings=source.exportSettings||state.exportSettings;state.elementFavorites=source.elementFavorites||state.elementFavorites;state.elementRecent=source.elementRecent||[];state.customGuides=(source.customGuides||[]).map(guide=>({...guide,position:source.guideUnitVersion===2?Number(guide.position)||0:(Number(guide.position)||0)/(Number(source.zoom)||.85)}));state.rightPanelWidth=source.rightPanelWidth||360;state.rightPanelCollapsed=!!source.rightPanelCollapsed;state.leftPanelWidth=source.leftPanelWidth||380;state.leftPanelCollapsed=!!source.leftPanelCollapsed;state.tokenGroupsOpen=source.tokenGroupsOpen||{colors:true,typography:false,spacing:false,radius:false,shadows:false};state.inspectorMode='advanced';state.inspectorTab=['content','design','layout','responsive','interactions','advanced'].includes(source.inspectorTab)?source.inspectorTab:'content';state.directEditEnabled=source.directEditEnabled!==false;state.breakpoint=BREAKPOINTS.includes(source.breakpoint)?source.breakpoint:'desktop';state.styleState=source.styleState||'default';state.tab=source.tab||'pages';state.grid=!!source.grid;state.snap=source.snap===undefined?state.guides:!!source.snap;state.openSections=source.openSections||state.openSections;state.collapsed=source.collapsed||{};state.assetSearch=source.assetSearch||'';state.assetFilter=source.assetFilter||'all';state.responsiveCompareSync=source.responsiveCompareSync!==false;state.responsiveCompareSelected=source.responsiveCompareSelected!==false;state.responsiveCompareZoom=source.responsiveCompareZoom||{desktop:1,tablet:1,mobile:1};state.responsiveAuditIgnored=source.responsiveAuditIgnored||[];
  if(source.pages?.length){state.pages=clone(source.pages);state.currentPageId=source.currentPageId||state.pages[0].id;const page=state.pages.find(item=>item.id===state.currentPageId)||state.pages[0];state.nodes=hydrateNodes(clone(page.nodes||[]));state.pageMeta=clone(page.meta||source.pageMeta||{language:'es',title:state.projectName,description:''});}
  else if(source.nodes){state.nodes=hydrateNodes(clone(source.nodes||[]));state.pageMeta=clone(source.pageMeta||{language:'es',title:state.projectName,description:''});state.pages=[{id:'page-home',name:'Home',slug:'/',nodes:clone(state.nodes),meta:clone(state.pageMeta)}];state.currentPageId='page-home';}
  else{state.nodes=[];state.pageMeta={language:'es',title:state.projectName,description:''};state.pages=[{id:'page-home',name:'Home',slug:'/',nodes:[],meta:clone(state.pageMeta)}];state.currentPageId='page-home';}
  state.selectedId=source.selectedId&&find(state.nodes,source.selectedId)?source.selectedId:state.nodes[0]?.id||null;state.selectedIds=(source.selectedIds||[state.selectedId]).filter(id=>id&&find(state.nodes,id));state.history=[];state.future=[];state.transaction=null;state.inlineEdit=null;state.resizing=null;els.projectName.value=state.projectName;preferences?.apply();ensureProjectPages();
}
function defaultProjectSnapshot(mode='starter',name='Untitled project'){
  const nodes=mode==='blank'?[]:hydrateNodes(clone(starter));
  const meta={language:'es',title:name,description:'Sitio creado con Orbit Design Studio'};
  return {version:12,projectName:name,pageMeta:clone(meta),nodes:clone(nodes),tokens:clone(defaultTokens),assets:[],components:[],globalClasses:[],pages:[{id:'page-home',name:'Home',slug:'/',nodes:clone(nodes),meta:clone(meta)}],currentPageId:'page-home',breakpoints:{desktopXL:1440,desktop:1200,tablet:1024,mobileL:768,mobile:480},breakpointEnabled:{desktopXL:true,mobileL:true},canvasWidths:{desktopXL:1440,desktop:1200,tablet:834,mobileL:640,mobile:390},selectedId:nodes[0]?.id||null,selectedIds:nodes[0]?.id?[nodes[0].id]:[],zoom:.85,breakpoint:'desktop',styleState:'default',tab:'pages',grid:false,rulers:true,guides:true,guidesVisible:true,guidesLocked:false,guideUnitVersion:2,snap:true,customGuides:[],exportSettings:{componentize:true,astroImage:true,splitCss:true,minify:false},elementFavorites:['section','container','heading','text','button','image'],elementRecent:[],rightPanelWidth:360,rightPanelCollapsed:false,leftPanelWidth:380,leftPanelCollapsed:false,tokenGroupsOpen:{colors:true,typography:false,spacing:false,radius:false,shadows:false},inspectorMode:'advanced',inspectorTab:'content',directEditEnabled:true,assetSearch:'',assetFilter:'all',responsiveCompareSync:true,responsiveCompareSelected:true,responsiveCompareZoom:{desktop:1,tablet:1,mobile:1},responsiveAuditIgnored:[]};
}
function projectAccent(record){return record.snapshot?.tokens?.colors?.accent?.value||'#ef5a24';}
function projectBackground(record){return record.snapshot?.tokens?.colors?.background?.value||'#f5f1e8';}
function projectText(record){return record.snapshot?.tokens?.colors?.text?.value||'#151513';}
function formatProjectDate(timestamp){
  if(!timestamp)return 'Sin fecha';const diff=Date.now()-timestamp;const minute=60000,hour=3600000,day=86400000;
  if(diff<minute)return 'Editado ahora';if(diff<hour)return `Editado hace ${Math.max(1,Math.round(diff/minute))} min`;if(diff<day)return `Editado hace ${Math.max(1,Math.round(diff/hour))} h`;if(diff<day*2)return 'Editado ayer';return new Intl.DateTimeFormat('es',{day:'numeric',month:'short',year:timestamp<new Date().setFullYear(new Date().getFullYear()-1)?'numeric':undefined}).format(timestamp);
}
function projectRecordFromSnapshot(id,name,snapshot,existing={}){
  const now=Date.now();const pages=snapshot.pages||[];
  return {...existing,id,name:name||snapshot.projectName||'Untitled project',createdAt:existing.createdAt||now,updatedAt:now,pageCount:pages.length,currentPageId:snapshot.currentPageId,currentPageName:pages.find(page=>page.id===snapshot.currentPageId)?.name||pages[0]?.name||'Home',breakpoint:snapshot.breakpoint||'desktop',snapshot:{...snapshot,projectName:name||snapshot.projectName},checkpoints:existing.checkpoints||[],autoVersions:existing.autoVersions||[],status:existing.status||'progress',tags:Array.isArray(existing.tags)?existing.tags:[],archived:!!existing.archived};
}
function snapshotFingerprint(snapshot){
  try{return JSON.stringify({pages:snapshot.pages,tokens:snapshot.tokens,components:snapshot.components,globalClasses:snapshot.globalClasses,assets:(snapshot.assets||[]).map(item=>({id:item.id,name:item.name,src:String(item.src||'').slice(0,80)}))});}catch{return String(Date.now());}
}
function maybeAppendAutoVersion(existing,snapshot){
  const versions=[...(existing.autoVersions||[])];const last=versions[0];const now=Date.now();
  const changed=!last||last.fingerprint!==snapshotFingerprint(snapshot);
  if(changed&&(!last||now-last.createdAt>=120000))versions.unshift({id:uid('auto'),name:'Autosave',createdAt:now,pageName:(snapshot.pages||[]).find(page=>page.id===snapshot.currentPageId)?.name||'Home',fingerprint:snapshotFingerprint(snapshot),snapshot:clone(snapshot)});
  return versions.slice(0,12);
}
let activeSavePromise=Promise.resolve();
async function saveActiveProject({silent=false}={}){
  if(!state.currentProjectId)return null;
  const id=state.currentProjectId;const snap=workspaceSnapshot();const name=state.projectName||'Untitled project';
  activeSavePromise=activeSavePromise.catch(()=>null).then(async()=>{const existing=await projectDbGet(id).catch(()=>null);const record=projectRecordFromSnapshot(id,name,snap,existing||{});record.autoVersions=maybeAppendAutoVersion(existing||{},snap);await projectDbPut(record);safeLocalSet(ACTIVE_PROJECT_KEY,id);safeLocalSet(SESSION_RECOVERY_KEY,JSON.stringify({projectId:id,name:record.name,updatedAt:record.updatedAt,dirty:false}));return record;});
  try{const result=await activeSavePromise;if(!silent){els.saveLabel.textContent='Guardado en proyectos';els.saveDot.classList.add('saved');}return result;}catch(error){els.saveLabel.textContent='No se pudo guardar';throw error;}
}
function markProjectSessionDirty(){if(!state.currentProjectId)return;try{safeLocalSet(SESSION_RECOVERY_KEY,JSON.stringify({projectId:state.currentProjectId,name:state.projectName,updatedAt:Date.now(),dirty:true}));}catch{}}
function setWorkspaceVisibility(dashboardOpen){
  state.projectDashboardOpen=dashboardOpen;els.dashboard.hidden=!dashboardOpen;els.builder.hidden=dashboardOpen;document.body.classList.toggle('project-dashboard-open',dashboardOpen);
}
function projectStatusLabel(status){return ({progress:'En progreso',review:'En revisión',done:'Terminado'})[status]||'En progreso';}
function formatBytes(value){const bytes=Number(value)||0;if(bytes<1024)return `${bytes} B`;if(bytes<1048576)return `${(bytes/1024).toFixed(1)} KB`;if(bytes<1073741824)return `${(bytes/1048576).toFixed(1)} MB`;return `${(bytes/1073741824).toFixed(2)} GB`;}
async function updateWorkspaceStorage(projects=[]){
  let used=0,quota=0;try{const estimate=await navigator.storage?.estimate?.();used=estimate?.usage||0;quota=estimate?.quota||0;}catch{}
  if(!used){try{used=new Blob([JSON.stringify(projects)]).size;}catch{}}
  if(els.storageDetail)els.storageDetail.innerHTML=`<strong>${formatBytes(used)} utilizados${quota?` de ${formatBytes(quota)}`:''}</strong><span>${projects.length} proyectos · ${projects.reduce((sum,item)=>sum+(item.autoVersions?.length||0)+(item.checkpoints?.length||0),0)} versiones guardadas</span>`;
}
async function renderProjectDashboard(){
  const all=await projectDbList();
  const query=String(state.projectSearch||'').trim().toLowerCase();
  let projects=all.filter(project=>state.projectShowArchived?project.archived:!project.archived);
  if(query)projects=projects.filter(project=>`${project.name||''} ${project.currentPageName||''} ${(Array.isArray(project.tags)?project.tags:[]).join(' ')} ${projectStatusLabel(project.status)}`.toLowerCase().includes(query));
  if(state.projectSort==='name')projects.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'es'));
  else if(state.projectSort==='pages')projects.sort((a,b)=>(b.pageCount||0)-(a.pageCount||0));
  else projects.sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
  const totalPages=all.reduce((sum,item)=>sum+(Number(item.pageCount)||item.snapshot?.pages?.length||0),0);
  const totalCheckpoints=all.reduce((sum,item)=>sum+(item.checkpoints?.length||0)+(item.autoVersions?.length||0),0);
  $('#project-count').textContent=all.filter(item=>!item.archived).length;
  $('#page-count').textContent=totalPages;
  $('#checkpoint-count').textContent=totalCheckpoints;
  $('#storage-status').textContent=state.projectDbReady?'IndexedDB':'Respaldo local';
  const hasAnyProjects=all.length>0;
  els.projectEmpty.hidden=hasAnyProjects||!!query||state.projectShowArchived;
  els.projectGrid.classList.toggle('is-list',state.projectView==='list');
  document.querySelectorAll('[data-project-view]').forEach(button=>button.classList.toggle('active',button.dataset.projectView===state.projectView));
  if(els.projectArchiveToggle){els.projectArchiveToggle.classList.toggle('active',state.projectShowArchived);els.projectArchiveToggle.setAttribute('aria-pressed',String(state.projectShowArchived));els.projectArchiveToggle.textContent=state.projectShowArchived?'Proyectos activos':'Archivados';}
  els.projectGrid.innerHTML=projects.map(project=>{
    try{
      const pages=Number(project.pageCount)||project.snapshot?.pages?.length||0;
      const checkpoints=(project.checkpoints?.length||0)+(project.autoVersions?.length||0);
      const active=project.id===state.currentProjectId;
      const tags=(Array.isArray(project.tags)?project.tags:[]).slice(0,3);
      const recovered=project.repaired?'<span class="project-repaired-badge">Reparado</span>':'';
      return `<article class="project-card ${active?'is-active':''} status-${project.status||'progress'}" data-project-card="${escapeHtml(project.id)}" style="--project-accent:${escapeHtml(projectAccent(project))};--project-bg:${escapeHtml(projectBackground(project))};--project-text:${escapeHtml(projectText(project))}"><button class="project-card-preview" type="button" data-open-project="${escapeHtml(project.id)}" aria-label="Abrir ${escapeHtml(project.name)}"><span class="project-preview-orbit" aria-hidden="true"><i></i><i></i></span><span class="project-preview-browser"><i></i><i></i><i></i></span><span class="project-preview-page"><b></b><i></i><i></i><em></em></span><span class="project-preview-badge">${pages} ${pages===1?'página':'páginas'}</span></button><div class="project-card-body"><div class="project-card-title"><div><strong>${escapeHtml(project.name)}</strong><small>${formatProjectDate(project.updatedAt)}</small></div>${active?'<span class="project-active-badge"><i></i> Activo</span>':''}${recovered}</div><div class="project-status-row"><span class="project-status-badge">${projectStatusLabel(project.status)}</span>${tags.map(tag=>`<span class="project-tag">${escapeHtml(tag)}</span>`).join('')}${(project.tags||[]).length>3?`<span class="project-tag">+${project.tags.length-3}</span>`:''}</div><div class="project-card-meta"><span>${escapeHtml(project.currentPageName||'Home')}</span><i></i><span>${breakpointLabels[project.breakpoint]||'Escritorio'}</span><i></i><span>${checkpoints} ${checkpoints===1?'versión':'versiones'}</span></div><div class="project-card-actions"><button type="button" class="project-open-button" data-open-project="${escapeHtml(project.id)}"><span>Abrir proyecto</span>${uiIcon('arrowRight')}</button><button type="button" data-project-checkpoints="${escapeHtml(project.id)}" title="Versiones" aria-label="Versiones">${uiIcon('history')}</button><button type="button" data-duplicate-project="${escapeHtml(project.id)}" title="Duplicar" aria-label="Duplicar">${uiIcon('copy')}</button><button type="button" data-export-project-backup="${escapeHtml(project.id)}" title="Exportar respaldo" aria-label="Exportar respaldo">${uiIcon('download')}</button><button type="button" data-project-menu="${escapeHtml(project.id)}" title="Más opciones" aria-label="Más opciones" aria-haspopup="menu" aria-expanded="false">${uiIcon('more')}</button></div><div class="project-card-menu" data-project-menu-panel="${escapeHtml(project.id)}" role="menu" hidden><button type="button" data-set-project-status="progress" data-project-id="${escapeHtml(project.id)}">En progreso</button><button type="button" data-set-project-status="review" data-project-id="${escapeHtml(project.id)}">En revisión</button><button type="button" data-set-project-status="done" data-project-id="${escapeHtml(project.id)}">Terminado</button><button type="button" data-edit-project-tags="${escapeHtml(project.id)}">Editar etiquetas</button><button type="button" data-rename-project="${escapeHtml(project.id)}">Renombrar</button><button type="button" data-archive-project="${escapeHtml(project.id)}">${project.archived?'Desarchivar':'Archivar'}</button><button type="button" data-delete-project="${escapeHtml(project.id)}" class="danger">Eliminar proyecto</button></div></div></article>`;
    }catch(error){reportWorkspaceHealth(`Un proyecto fue aislado porque no pudo dibujarse: ${error?.message||'datos inválidos'}.`);return '';}
  }).join('');
  if(query&&!projects.length)els.projectGrid.innerHTML='<div class="project-search-empty"><strong>No encontramos proyectos</strong><span>Prueba con otro nombre, estado o etiqueta.</span></div>';
  else if(state.projectShowArchived&&!projects.length)els.projectGrid.innerHTML='<div class="project-search-empty"><strong>No hay proyectos archivados</strong><span>Los proyectos archivados aparecerán aquí.</span></div>';
  else if(!state.projectShowArchived&&hasAnyProjects&&!projects.length)els.projectGrid.innerHTML='<div class="project-search-empty"><strong>No hay proyectos activos</strong><span>Puedes abrir la vista de archivados o crear un proyecto nuevo.</span></div>';
  await updateWorkspaceStorage(all);
  renderWorkspaceHealth();
}
function closeProjectMenus({restore=true}={}){let closed=false;document.querySelectorAll('[data-project-menu-panel]').forEach(panel=>{if(!panel.hidden){panel.hidden=true;accessibility?.focus.closeLayer(panel,{restore});closed=true;}});document.querySelectorAll('[data-project-menu]').forEach(button=>button.setAttribute('aria-expanded','false'));return closed;}
async function openProjectDashboard(){
  if(state.currentProjectId)await saveActiveProject({silent:true}).catch(()=>{});setWorkspaceVisibility(true);await renderProjectDashboard();renderRecoveryBanner();
  requestAnimationFrame(()=>els.projectSearch?.focus());
  accessibility?.announcer.status('Dashboard de proyectos abierto.');
}
async function openProjectById(id){
  try{
    const record=await projectDbGet(id);if(!record){toast('No se encontró el proyecto','error');return;}
    restoreWorkspaceSnapshot(record.snapshot);state.currentProjectId=record.id;safeLocalSet(ACTIVE_PROJECT_KEY,record.id);safeLocalSet(SESSION_RECOVERY_KEY,JSON.stringify({projectId:record.id,name:record.name,updatedAt:record.updatedAt,dirty:false}));setWorkspaceVisibility(false);render();scheduleFluidCanvasFit();toast(`Proyecto abierto · ${record.name}`);
    requestAnimationFrame(()=>els.canvas?.focus());
  }catch(error){
    state.currentProjectId=null;safeLocalRemove(ACTIVE_PROJECT_KEY);setWorkspaceVisibility(true);reportWorkspaceHealth(`No pudimos abrir ese proyecto todavía: ${error?.message||'estructura incompatible'}. Usa “Reparar almacenamiento” para recuperarlo.`);await renderProjectDashboard();toast('El proyecto se mantuvo protegido en el inicio','error',3600);
  }
}
async function createWorkspaceProject(mode='starter'){
  const suggested=mode==='blank'?'Proyecto sin título':'Nuevo sitio Astro';const name=prompt('Nombre del proyecto',suggested);if(name===null)return;
  const clean=name.trim()||suggested;const id=uid('project');const snap=defaultProjectSnapshot(mode,clean);const record=projectRecordFromSnapshot(id,clean,snap,{});await projectDbPut(record);await openProjectById(id);
}
async function renameWorkspaceProject(id){const record=await projectDbGet(id);if(!record)return;const value=prompt('Nuevo nombre del proyecto',record.name);if(value===null||!value.trim())return;record.name=value.trim();record.snapshot.projectName=record.name;record.updatedAt=Date.now();await projectDbPut(record);if(state.currentProjectId===id){state.projectName=record.name;els.projectName.value=record.name;}await renderProjectDashboard();}
async function duplicateWorkspaceProject(id){const source=await projectDbGet(id);if(!source)return;const newId=uid('project');const name=`${source.name} — copia`;const copy=projectRecordFromSnapshot(newId,name,clone(source.snapshot),{checkpoints:clone(source.checkpoints||[])});await projectDbPut(copy);await renderProjectDashboard();toast('Proyecto duplicado');}
async function setWorkspaceProjectStatus(id,status){const record=await projectDbGet(id);if(!record)return;record.status=['progress','review','done'].includes(status)?status:'progress';record.updatedAt=Date.now();await projectDbPut(record);await renderProjectDashboard();toast(`Estado: ${projectStatusLabel(record.status)}`);}
async function editWorkspaceProjectTags(id){const record=await projectDbGet(id);if(!record)return;const value=prompt('Etiquetas separadas por comas',(record.tags||[]).join(', '));if(value===null)return;record.tags=value.split(',').map(item=>item.trim()).filter(Boolean).slice(0,8);record.updatedAt=Date.now();await projectDbPut(record);await renderProjectDashboard();}
async function toggleWorkspaceProjectArchive(id){const record=await projectDbGet(id);if(!record)return;record.archived=!record.archived;record.updatedAt=Date.now();await projectDbPut(record);await renderProjectDashboard();toast(record.archived?'Proyecto archivado':'Proyecto restaurado');}
async function exportAllWorkspaceProjects(){const projects=await projectDbList();const backup={kind:'orbit-workspace-backup',formatVersion:1,exportedAt:new Date().toISOString(),projects};downloadText(`orbit-workspace-${new Date().toISOString().slice(0,10)}.orbit`,JSON.stringify(backup,null,2),'application/json');toast('Workspace exportado');}
async function cleanupWorkspaceVersions(){const projects=await projectDbList();let removed=0;for(const record of projects){const before=(record.autoVersions||[]).length;record.autoVersions=(record.autoVersions||[]).slice(0,5);removed+=before-record.autoVersions.length;await projectDbPut(record);}await renderProjectDashboard();toast(removed?`${removed} versiones antiguas eliminadas`:'No hay versiones antiguas');}
async function repairWorkspaceStorage(){
  const button=$('#repair-project-storage');const secondary=$('#repair-project-storage-secondary');
  [button,secondary].forEach(item=>{if(item){item.disabled=true;item.textContent='Reparando…';}});
  try{
    const raw=await projectDbListRaw();const repaired=[];
    raw.forEach((record,index)=>{try{repaired.push(normalizeProjectRecord(record,{fallbackId:`recovered-${index+1}`}));}catch{}});
    clearWorkspaceHealth();
    for(const record of repaired)await projectDbPut(record);
    setWorkspaceMemoryProjects(repaired);
    const active=safeLocalGet(ACTIVE_PROJECT_KEY);if(active&&!repaired.some(record=>record.id===active))safeLocalRemove(ACTIVE_PROJECT_KEY);
    if(state.projectDbReady)clearWorkspaceHealth();else reportWorkspaceHealth('IndexedDB no está disponible; Orbit seguirá usando el respaldo local de forma segura.');
    await renderProjectDashboard();toast(`${repaired.length} ${repaired.length===1?'proyecto revisado':'proyectos revisados'} · almacenamiento seguro`);
  }catch(error){reportWorkspaceHealth(`No se pudo completar la reparación: ${error?.message||'error desconocido'}. Tus proyectos no fueron borrados.`);await renderProjectDashboard();toast('No se pudo completar la reparación','error',3600);}
  finally{[button,secondary].forEach(item=>{if(item){item.disabled=false;item.textContent='Reparar almacenamiento';}});}
}
async function deleteWorkspaceProject(id){const record=await projectDbGet(id);if(!record)return;if(!confirm(`¿Eliminar “${record.name}”? Esta acción no se puede deshacer.`))return;await projectDbDelete(id);if(state.currentProjectId===id){state.currentProjectId=null;safeLocalRemove(ACTIVE_PROJECT_KEY);}await renderProjectDashboard();toast('Proyecto eliminado');}
async function exportWorkspaceBackup(id=state.currentProjectId){if(id===state.currentProjectId)await saveActiveProject({silent:true}).catch(()=>{});const record=await projectDbGet(id);if(!record)return;const backup={kind:'orbit-project-backup',formatVersion:1,exportedAt:new Date().toISOString(),project:record};downloadText(`${slug(record.name)}.orbit`,JSON.stringify(backup,null,2),'application/json');}
async function importWorkspaceBackup(file){
  if(!file)return;try{const parsed=JSON.parse(await file.text());let source,name,checkpoints=[];
    if(parsed.kind==='orbit-workspace-backup'&&Array.isArray(parsed.projects)){
      let imported=0;
      for(const project of parsed.projects){
        try{const record=normalizeProjectRecord(project,{fallbackId:uid('project')});record.id=uid('project');record.createdAt=Number(project?.createdAt)||Date.now();record.updatedAt=Date.now();await projectDbPut(record);imported+=1;}
        catch(error){reportWorkspaceHealth(`Un proyecto del respaldo no pudo importarse: ${error?.message||'formato inválido'}.`);}
      }
      await renderProjectDashboard();toast(`${imported} ${imported===1?'proyecto importado':'proyectos importados'}`);return;
    }
    if(parsed.kind==='orbit-project-backup'&&parsed.project){const normalized=normalizeProjectRecord(parsed.project,{fallbackId:uid('project')});source=normalized.snapshot;name=normalized.name;checkpoints=normalized.checkpoints||[];}
    else{const normalized=normalizeOrbitImport(parsed).document;source={...defaultProjectSnapshot('blank',normalized.projectName||file.name.replace(/\.(orbit|json)$/i,'')),...normalized};name=normalized.projectName||file.name.replace(/\.(orbit|json)$/i,'');}
    const id=uid('project');const record=normalizeProjectRecord(projectRecordFromSnapshot(id,name||'Proyecto importado',normalizeProjectSnapshot(source,name||'Proyecto importado'),{checkpoints:normalizeProjectVersions(checkpoints)}),{fallbackId:id});await projectDbPut(record);await renderProjectDashboard();toast('Proyecto importado correctamente');
  }catch(error){toast(`No se pudo importar: ${error.message}`,'error',3200);}finally{els.projectBackupUpload.value='';}
}
async function createCheckpoint(){
  if(!state.currentProjectId){toast('Abre un proyecto primero','error');return;}await saveActiveProject({silent:true});const record=await projectDbGet(state.currentProjectId);if(!record)return;const suggested=`Checkpoint ${new Date().toLocaleDateString('es',{day:'2-digit',month:'short'})}`;const name=prompt('Nombre del checkpoint',suggested);if(name===null)return;const checkpoint={id:uid('checkpoint'),name:name.trim()||suggested,createdAt:Date.now(),pageName:currentPage()?.name||'Home',snapshot:workspaceSnapshot()};record.checkpoints=[checkpoint,...(record.checkpoints||[])].slice(0,12);record.updatedAt=Date.now();await projectDbPut(record);toast('Checkpoint guardado');
}
async function showProjectCheckpoints(id){
  const trigger=document.activeElement;
  state.checkpointProjectId=id;const record=await projectDbGet(id);if(!record)return;els.checkpointDrawerTitle.textContent=record.name;els.checkpointDrawer.hidden=false;
  accessibility?.focus.openLayer(els.checkpointDrawer,{trigger,initialFocus:els.checkpointDrawer.querySelector('[data-close-checkpoints]'),modal:false,onEscape:closeProjectCheckpoints});
  const manual=(record.checkpoints||[]).map(item=>({...item,kind:'manual'}));const automatic=(record.autoVersions||[]).map(item=>({...item,kind:'auto'}));const versions=[...manual,...automatic].sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  els.checkpointList.innerHTML=versions.length?versions.map(item=>`<article class="checkpoint-item ${item.kind==='auto'?'is-auto':''}"><span class="checkpoint-dot"></span><div><strong>${escapeHtml(item.kind==='auto'?'Autosave':item.name)}</strong><small>${formatProjectDate(item.createdAt)} · ${escapeHtml(item.pageName||'Home')} · ${item.kind==='auto'?'Automático':'Manual'}</small></div><button type="button" data-restore-checkpoint="${item.id}" data-checkpoint-kind="${item.kind}" data-checkpoint-project="${id}">Restaurar</button>${item.kind==='manual'?`<button type="button" data-delete-checkpoint="${item.id}" data-checkpoint-project="${id}" title="Eliminar">×</button>`:''}</article>`).join(''):'<div class="checkpoint-empty"><span>◇</span><strong>Sin versiones</strong><p>Orbit guardará versiones automáticas mientras trabajas. También puedes crear checkpoints manuales.</p></div>';
}
function closeProjectCheckpoints(){els.checkpointDrawer.hidden=true;state.checkpointProjectId=null;accessibility?.focus.closeLayer(els.checkpointDrawer);}
async function restoreProjectCheckpoint(projectId,checkpointId,kind='manual'){const record=await projectDbGet(projectId);const source=kind==='auto'?record?.autoVersions:record?.checkpoints;const checkpoint=source?.find(item=>item.id===checkpointId);if(!checkpoint)return;if(!confirm(`¿Restaurar esta versión? Se guardará el estado actual antes de continuar.`))return;if(state.currentProjectId)await saveActiveProject({silent:true});record.snapshot=clone(checkpoint.snapshot);record.updatedAt=Date.now();await projectDbPut(record);closeProjectCheckpoints();await openProjectById(projectId);toast('Versión restaurada');}
async function deleteProjectCheckpoint(projectId,checkpointId){const record=await projectDbGet(projectId);if(!record)return;record.checkpoints=(record.checkpoints||[]).filter(item=>item.id!==checkpointId);record.updatedAt=Date.now();await projectDbPut(record);await showProjectCheckpoints(projectId);await renderProjectDashboard();}
function renderRecoveryBanner(){
  let recovery=null;try{recovery=JSON.parse(safeLocalGet(SESSION_RECOVERY_KEY)||'null');}catch{}
  const visible=!!(recovery?.dirty&&recovery.projectId);els.recoveryBanner.hidden=!visible;if(visible)els.recoveryCopy.textContent=`${recovery.name||'Proyecto'} tuvo cambios recientes. Recupera la última versión guardada.`;
}
async function recoverProjectSession(){let recovery=null;try{recovery=JSON.parse(safeLocalGet(SESSION_RECOVERY_KEY)||'null');}catch{}if(recovery?.projectId)await openProjectById(recovery.projectId);}
async function migrateLegacyProject(){
  if(safeLocalGet(MIGRATION_KEY))return;
  const raw=safeLocalGet(PREVIOUS_STORAGE_KEY)||safeLocalGet(PREVIOUS_STORAGE_KEY_2)||safeLocalGet(LEGACY_STORAGE_KEY);
  if(raw){try{const saved=JSON.parse(raw);const name=saved.projectName||'Proyecto recuperado';const id=uid('project');const snap={...defaultProjectSnapshot('blank',name),...saved,version:12,breakpoint:saved.breakpoint||'desktop',tab:saved.tab||'pages'};await projectDbPut(projectRecordFromSnapshot(id,name,snap,{}));safeLocalSet(ACTIVE_PROJECT_KEY,id);}catch{}}
  safeLocalSet(MIGRATION_KEY,'1');
}
async function bootstrapProjectWorkspace(){
  setWorkspaceVisibility(true);
  try{
    await migrateLegacyProject();const projects=await projectDbList();
    const active=safeLocalGet(ACTIVE_PROJECT_KEY);state.currentProjectId=active&&projects.some(item=>item.id===active)?active:null;
    if(active&&!state.currentProjectId)safeLocalRemove(ACTIVE_PROJECT_KEY);
    await renderProjectDashboard();renderRecoveryBanner();
    try{render();}catch(error){console.warn('[Orbit dashboard render]',error);}
  }catch(error){
    state.currentProjectId=null;safeLocalRemove(ACTIVE_PROJECT_KEY);reportWorkspaceHealth(`El workspace se abrió en modo seguro: ${error?.message||'no fue posible leer el almacenamiento'}.`);setWorkspaceVisibility(true);
    els.projectGrid.innerHTML='';els.projectEmpty.hidden=false;renderWorkspaceHealth();renderRecoveryBanner();
  }
}
function elementCatalog(){
  return elementSections.flatMap(section=>section.items.map(([type,label,desc])=>({type,label,desc,sectionId:section.id,sectionLabel:section.label,kicker:section.kicker})));
}
function elementMeta(type){ return elementCatalog().find(item=>item.type===type); }
function toggleElementFavorite(type){
  const set=new Set(state.elementFavorites||[]);
  if(set.has(type))set.delete(type); else set.add(type);
  state.elementFavorites=[...set];
  renderLeft();
}
function rememberRecentElement(type){
  state.elementRecent=[type,...(state.elementRecent||[]).filter(item=>item!==type)].slice(0,14);
}
function elementPreview(type){
  const previews={
    section:'<div class="lib-preview preview-section"><span></span><span></span><span></span></div>',
    container:'<div class="lib-preview preview-container"><span></span><span></span></div>',
    grid:'<div class="lib-preview preview-grid"><span></span><span></span><span></span><span></span></div>',
    block:'<div class="lib-preview preview-block"><span></span></div>',
    div:'<div class="lib-preview preview-div"><span></span></div>',
    card:'<div class="lib-preview preview-card"><span></span><span></span><span></span></div>',
    divider:'<div class="lib-preview preview-divider"><span></span></div>',
    spacer:'<div class="lib-preview preview-spacer"><span></span></div>',
    heading:'<div class="lib-preview preview-heading"><span></span><span></span></div>',
    text:'<div class="lib-preview preview-text"><span></span><span></span><span></span></div>',
    richtext:'<div class="lib-preview preview-richtext"><span></span><span></span><span></span><span></span></div>',
    link:'<div class="lib-preview preview-link"><span></span></div>',
    button:'<div class="lib-preview preview-button"><span></span></div>',
    badge:'<div class="lib-preview preview-badge"><span></span></div>',
    quote:'<div class="lib-preview preview-quote"><span></span><span></span></div>',
    list:'<div class="lib-preview preview-list"><span></span><span></span><span></span></div>',
    icon:'<div class="lib-preview preview-icon"><span></span></div>',
    image:'<div class="lib-preview preview-image"><span></span></div>',
    gallery:'<div class="lib-preview preview-gallery"><span></span><span></span><span></span></div>',
    video:'<div class="lib-preview preview-video"><span></span></div>',
    svg:'<div class="lib-preview preview-svg"><span></span></div>',
    form:'<div class="lib-preview preview-form"><span></span><span></span><span></span><span></span></div>',
    input:'<div class="lib-preview preview-input"><span></span></div>',
    textareaField:'<div class="lib-preview preview-textarea"><span></span></div>',
    selectField:'<div class="lib-preview preview-select"><span></span></div>',
    statCard:'<div class="lib-preview preview-stat"><span></span><span></span><span></span></div>',
    testimonial:'<div class="lib-preview preview-testimonial"><span></span><span></span><span></span></div>',
    pricingCard:'<div class="lib-preview preview-pricing"><span></span><span></span><span></span><span></span></div>',
    faqItem:'<div class="lib-preview preview-faq"><span></span><span></span></div>'
  };
  return previews[type]||'<div class="lib-preview preview-generic"><span></span></div>';
}
function renderElementCard(item){
  const fav=(state.elementFavorites||[]).includes(item.type);
  const helper=`${item.label}: ${item.desc}`;
  return `<article class="element-card-ux ${fav?'is-favorite':''}" draggable="true" data-type="${item.type}" title="${escapeHtml(helper)}"><div class="element-card-ux-main"><span class="element-card-ux-icon">${uiIcon(icons[item.type]||'box')}</span><div class="element-card-ux-copy"><strong>${escapeHtml(item.label)}</strong></div></div><button class="element-favorite element-favorite-ux ${fav?'is-active':''}" type="button" title="${fav?'Quitar de favoritos':'Añadir a favoritos'}" aria-label="${fav?'Quitar de favoritos':'Añadir a favoritos'}" data-favorite-type="${item.type}">${uiIcon('star')}</button><div class="element-card-ux-tip"><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.desc)}</span></div></article>`;
}

function normalizeSearch(value=''){
  return String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
}
function activateWorkspacePanel(tab){
  state.tab=tab;
  if(state.leftPanelCollapsed)toggleLeftPanel(false);
  renderLeft();
  document.querySelector(`[data-tab="${tab}"]`)?.focus();
}
function commandItems(){
  const actions=[
    {id:'add-page',title:'Crear nueva página',subtitle:'Añade una nueva ruta Astro al proyecto',group:'Proyecto',icon:'page',keywords:'pagina route astro',shortcut:'',run:addPage},
    {id:'open-pages',title:'Abrir Páginas',subtitle:'Gestiona rutas, SEO y documentos',group:'Navegación',icon:'page',keywords:'paginas routes site map',run:()=>activateWorkspacePanel('pages')},
    {id:'open-elements',title:'Abrir Elementos',subtitle:'Explora la biblioteca de elementos',group:'Navegación',icon:'box',keywords:'elementos insert library',run:()=>activateWorkspacePanel('elements')},
    {id:'open-sections',title:'Abrir Secciones',subtitle:'Inserta bloques completos',group:'Navegación',icon:'layout',keywords:'secciones templates',run:()=>activateWorkspacePanel('sections')},
    {id:'open-layers',title:'Abrir Capas',subtitle:'Busca y organiza la estructura',group:'Navegación',icon:'layers',keywords:'capas layers hierarchy',run:()=>activateWorkspacePanel('layers')},
    {id:'open-components',title:'Abrir Componentes',subtitle:'Gestiona componentes e instancias',group:'Navegación',icon:'component',keywords:'componentes instances',run:()=>activateWorkspacePanel('components')},
    {id:'open-classes',title:'Abrir Clases',subtitle:'Gestiona BEM y clases globales',group:'Navegación',icon:'tag',keywords:'clases bem css global',run:()=>activateWorkspacePanel('classes')},
    {id:'open-tokens',title:'Abrir Tokens',subtitle:'Edita colores, tipografía y spacing',group:'Navegación',icon:'settings',keywords:'tokens color typography spacing',run:()=>activateWorkspacePanel('tokens')},
    {id:'open-assets',title:'Abrir Assets',subtitle:'Gestiona imágenes y archivos',group:'Navegación',icon:'image',keywords:'assets imagenes media',run:()=>activateWorkspacePanel('assets')},
    {id:'quick-insert',title:'Quick Insert',subtitle:'Inserta un elemento en la posición actual',group:'Edición',icon:'plusCircle',keywords:'insertar rapido add',shortcut:'⇧A',run:()=>openQuickInsert()},
    {id:'undo',title:'Deshacer',subtitle:'Revierte el último cambio',group:'Edición',icon:'history',keywords:'undo volver',shortcut:'⌘Z',run:undo},
    {id:'redo',title:'Rehacer',subtitle:'Recupera el siguiente cambio',group:'Edición',icon:'history',keywords:'redo adelante',shortcut:'⌘⇧Z',run:redo},
    {id:'duplicate',title:'Duplicar selección',subtitle:'Crea una copia del elemento seleccionado',group:'Edición',icon:'copy',keywords:'duplicate copiar',shortcut:'⌘D',run:duplicateSelected},
    {id:'create-component',title:'Crear componente',subtitle:'Convierte la selección en componente reutilizable',group:'Edición',icon:'component',keywords:'component reusable',run:createComponentFromSelection},
    {id:'desktop',title:'Cambiar a Desktop',subtitle:'Viewport de escritorio',group:'Responsive',icon:'monitor',keywords:'desktop viewport',run:()=>setBreakpoint('desktop')},
    {id:'tablet',title:'Cambiar a Tablet',subtitle:'Viewport tablet',group:'Responsive',icon:'tablet',keywords:'tablet viewport',run:()=>setBreakpoint('tablet')},
    {id:'mobile',title:'Cambiar a Mobile',subtitle:'Viewport móvil',group:'Responsive',icon:'smartphone',keywords:'mobile movil viewport',run:()=>setBreakpoint('mobile')},
    {id:'toggle-guides',title:state.rulers?'Ocultar reglas y guías':'Mostrar reglas y guías',subtitle:'Activa rulers, snapping y guías arrastrables',group:'Canvas',icon:'grid',keywords:'guias rulers regla snap',run:()=>{$('#toggle-guides')?.click();}},
    {id:'toggle-grid',title:state.grid?'Ocultar cuadrícula':'Mostrar cuadrícula',subtitle:'Alterna la cuadrícula del canvas',group:'Canvas',icon:'grid',keywords:'grid canvas cuadrícula',run:()=>{$('#toggle-grid')?.click();}},
    {id:'toggle-direct-edit',title:state.directEditEnabled?'Ocultar edición directa':'Activar edición directa',subtitle:'Muestra controles de padding y layout sobre el canvas',group:'Canvas',icon:'sliders',keywords:'direct editing padding gap visual canvas',run:()=>{state.directEditEnabled=!state.directEditEnabled;renderCanvas();renderMultiToolbar();markUnsaved();}},
    {id:'project-workspace',title:'Volver a proyectos',subtitle:'Abre el dashboard y guarda el proyecto actual',group:'Proyecto',icon:'home',keywords:'dashboard proyectos workspace inicio',run:openProjectDashboard},
    {id:'save-checkpoint',title:'Crear checkpoint',subtitle:'Guarda una versión manual del proyecto',group:'Proyecto',icon:'history',keywords:'checkpoint version respaldo guardar',shortcut:'⌘⇧S',run:createCheckpoint},
    {id:'preview',title:'Abrir preview',subtitle:'Previsualiza la página sin controles',group:'Proyecto',icon:'eye',keywords:'preview vista previa',shortcut:'P',run:preview},
    {id:'audit',title:'Ejecutar auditoría',subtitle:'Revisa semántica, SEO y accesibilidad',group:'Proyecto',icon:'warning',keywords:'audit seo accesibilidad',run:showAudit},
    {id:'page-settings',title:'Ajustes de página',subtitle:'SEO, idioma, slug y Open Graph',group:'Proyecto',icon:'settings',keywords:'seo meta page settings',run:showPageSettings},
    {id:'export-astro',title:'Exportar proyecto Astro',subtitle:'Descarga el proyecto multipágina optimizado',group:'Proyecto',icon:'download',keywords:'exportar astro zip download',run:exportProject},
    {id:'toggle-left',title:state.leftPanelCollapsed?'Abrir panel izquierdo':'Colapsar panel izquierdo',subtitle:'Libera o recupera espacio de trabajo',group:'Interfaz',icon:'layout',keywords:'sidebar panel izquierdo',run:()=>toggleLeftPanel()},
    {id:'toggle-right',title:state.rightPanelCollapsed?'Abrir Editar':'Ocultar Editar',subtitle:'Muestra u oculta las propiedades del elemento',group:'Interfaz',icon:'settings',keywords:'sidebar editar propiedades panel derecho',run:()=>toggleRightPanel()}
  ];
  const elements=elementCatalog().map(item=>({
    id:`insert-${item.type}`,
    title:`Insertar ${item.label}`,
    subtitle:item.desc,
    group:'Elementos',
    icon:icons[item.type]||'box',
    keywords:`${item.type} ${item.sectionLabel} ${item.kicker}`,
    run:()=>addElement(item.type)
  }));
  return [...actions,...elements];
}
function filteredCommands(){
  const query=normalizeSearch(state.commandQuery);
  return commandItems().filter(item=>!query||normalizeSearch(`${item.title} ${item.subtitle||''} ${item.group||''} ${item.keywords||''}`).includes(query)).slice(0,18);
}
function renderCommandPalette(){
  if(!els.commandPalette||!els.commandResults)return;
  const items=filteredCommands();
  if(!items.length){els.commandResults.innerHTML='<div class="command-empty"><strong>No encontramos comandos</strong><span>Prueba “tokens”, “insertar”, “mobile” o “exportar”.</span></div>';return;}
  if(state.commandIndex>=items.length)state.commandIndex=0;
  let currentGroup='';
  els.commandResults.innerHTML=items.map((item,index)=>{
    const group=item.group!==currentGroup?`<div class="command-group-label">${escapeHtml(item.group||'Comandos')}</div>`:'';
    currentGroup=item.group;
    return `${group}<button type="button" class="command-result ${index===state.commandIndex?'is-active':''}" data-command-id="${item.id}" data-command-index="${index}"><span class="command-result-icon">${uiIcon(item.icon||'box')}</span><span class="command-result-copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.subtitle||'')}</small></span>${item.shortcut?`<kbd>${escapeHtml(item.shortcut)}</kbd>`:''}</button>`;
  }).join('');
  requestAnimationFrame(()=>els.commandResults.querySelector('.command-result.is-active')?.scrollIntoView({block:'nearest'}));
}
function openCommandPalette(query=''){closeQuickInsert();const trigger=document.activeElement;state.commandPaletteOpen=true;state.commandQuery=query;state.commandIndex=0;els.commandPalette.hidden=false;els.commandPalette.classList.add('is-open');els.commandInput.value=query;renderCommandPalette();accessibility?.focus.openLayer(els.commandPalette,{trigger,initialFocus:els.commandInput,modal:true,onEscape:closeCommandPalette});setTimeout(()=>{els.commandInput.focus();els.commandInput.select();},0);}
function closeCommandPalette(){if(!state.commandPaletteOpen)return;state.commandPaletteOpen=false;els.commandPalette.classList.remove('is-open');els.commandPalette.hidden=true;accessibility?.focus.closeLayer(els.commandPalette);}
function executeCommand(commandId){
  const command=commandItems().find(item=>item.id===commandId);if(!command)return;
  closeCommandPalette();command.run?.();
}
function moveCommandIndex(delta){
  const items=filteredCommands();if(!items.length)return;
  state.commandIndex=(state.commandIndex+delta+items.length)%items.length;renderCommandPalette();
}
function executeActiveCommand(){const item=filteredCommands()[state.commandIndex];if(item)executeCommand(item.id);}
function quickInsertItems(){
  const query=normalizeSearch(state.quickInsertQuery);
  const favorites=new Set(state.elementFavorites||[]);
  return elementCatalog().filter(item=>!query||normalizeSearch(`${item.label} ${item.desc} ${item.type} ${item.sectionLabel}`).includes(query)).sort((a,b)=>Number(favorites.has(b.type))-Number(favorites.has(a.type))).slice(0,16);
}
function renderQuickInsert(){
  if(!els.quickInsert||!els.quickInsertResults)return;
  const items=quickInsertItems();
  if(!items.length){els.quickInsertResults.innerHTML='<div class="quick-insert-empty">No encontramos ese elemento.</div>';return;}
  if(state.quickInsertIndex>=items.length)state.quickInsertIndex=0;
  els.quickInsertResults.innerHTML=items.map((item,index)=>`<button type="button" class="quick-insert-item ${index===state.quickInsertIndex?'is-active':''}" data-quick-type="${item.type}" data-quick-index="${index}"><span>${uiIcon(icons[item.type]||'box')}</span><div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.desc)}</small></div>${(state.elementFavorites||[]).includes(item.type)?'<i>★</i>':''}</button>`).join('');
  requestAnimationFrame(()=>els.quickInsertResults.querySelector('.quick-insert-item.is-active')?.scrollIntoView({block:'nearest'}));
}
function quickInsertAnchorRect(){
  const selectedEl=state.selectedId?els.canvas.querySelector(`[data-id="${CSS.escape(state.selectedId)}"]`):null;
  return selectedEl?.getBoundingClientRect()||$('#quick-add')?.getBoundingClientRect()||{left:window.innerWidth/2,top:window.innerHeight/2,right:window.innerWidth/2,bottom:window.innerHeight/2,width:0,height:0};
}
function positionQuickInsert(rect=quickInsertAnchorRect()){
  if(!els.quickInsert)return;
  const width=330,height=Math.min(520,window.innerHeight-32);
  const preferredLeft=rect.right+12;
  const left=Math.max(16,Math.min(window.innerWidth-width-16,preferredLeft+width>window.innerWidth?rect.left-width-12:preferredLeft));
  const top=Math.max(16,Math.min(window.innerHeight-height-16,rect.top));
  els.quickInsert.style.left=`${left}px`;els.quickInsert.style.top=`${top}px`;
}
function openQuickInsert(options={}){closeCommandPalette();const trigger=document.activeElement;state.quickInsertOpen=true;state.quickInsertQuery='';state.quickInsertIndex=0;state.quickInsertPlacement=options.placement||insertionForClick();els.quickInsert.hidden=false;els.quickInsert.classList.add('is-open');els.quickInsertInput.value='';positionQuickInsert(options.anchor||quickInsertAnchorRect());renderQuickInsert();accessibility?.focus.openLayer(els.quickInsert,{trigger,initialFocus:els.quickInsertInput,modal:false,onEscape:closeQuickInsert});requestAnimationFrame(()=>els.quickInsertInput.focus());}
function closeQuickInsert(){if(!state.quickInsertOpen)return;state.quickInsertOpen=false;state.quickInsertPlacement=null;els.quickInsert.classList.remove('is-open');els.quickInsert.hidden=true;accessibility?.focus.closeLayer(els.quickInsert);}
function insertQuickElement(type){
  const placement=state.quickInsertPlacement||insertionForClick();
  closeQuickInsert();addElement(type,placement);
}
function moveQuickInsertIndex(delta){
  const items=quickInsertItems();if(!items.length)return;
  state.quickInsertIndex=(state.quickInsertIndex+delta+items.length)%items.length;renderQuickInsert();
}
function executeActiveQuickInsert(){const item=quickInsertItems()[state.quickInsertIndex];if(item)insertQuickElement(item.type);}
const semanticTagOptions={
  section:['section','header','main','footer','nav','aside','article','div','form','figure'],
  container:['div','section','header','main','footer','nav','aside','article','form','figure','ul','ol'],
  grid:['div','section','article','ul','ol'],
  block:['div','section','article'],
  div:['div','section','article'],
  card:['article','div','section','li','figure'],
  heading:['h1','h2','h3','h4','h5','h6'],
  text:['p','span','small','label','blockquote','figcaption','li','address'],
  richtext:['div','p','blockquote'],
  link:['a'],
  button:['a','button'],
  badge:['span','p','small'],
  quote:['blockquote'],
  list:['ul','ol'],
  icon:['span','div'],
  image:['img','figure'],
  gallery:['div','section','figure'],
  video:['div','figure'],
  svg:['div','span','figure'],
  form:['form','div'],
  statCard:['article','div','section'],
  testimonial:['article','blockquote','div'],
  pricingCard:['article','section','div'],
  faqItem:['article','div','section'],
  input:['input'],
  textareaField:['textarea'],
  selectField:['select'],
  divider:['hr','div'],
  spacer:['div']
};
function defaultHtmlTag(node){
  const map={section:'section',container:'div',grid:'div',block:'section',div:'div',card:'article',heading:node.tag||'h2',text:'p',richtext:'div',link:'a',button:node.href?'a':'button',badge:'span',quote:'blockquote',list:'ul',icon:'span',image:'img',gallery:'div',video:'div',svg:'div',form:'form',statCard:'article',testimonial:'article',pricingCard:'article',faqItem:'article',input:'input',textareaField:'textarea',selectField:'select',divider:'hr',spacer:'div'};
  return map[node.type]||'div';
}
function semanticTag(node){
  const allowed=semanticTagOptions[node.type]||['div'];
  const value=node.htmlTag||defaultHtmlTag(node);
  return allowed.includes(value)?value:defaultHtmlTag(node);
}
function hydrateNodes(nodes,parentBlock=''){
  return (nodes||[]).map(node=>{
    const copy={...node};
    copy.htmlTag=copy.htmlTag||defaultHtmlTag(copy);
    copy.ariaLabel=copy.ariaLabel||'';
    copy.bemBlock=copy.bemBlock||parentBlock||'';
    copy.bemElement=copy.bemElement||'';
    copy.bemModifiers=Array.isArray(copy.bemModifiers)?copy.bemModifiers:[];
    copy.customClasses=Array.isArray(copy.customClasses)?copy.customClasses:[];
    copy.globalClassIds=Array.isArray(copy.globalClassIds)?copy.globalClassIds:[];
    copy.customCss=copy.customCss||'';
    copy.states=copy.states||{};
    copy.locked=!!copy.locked;
    copy.hidden=!!copy.hidden;
    copy.componentRef=copy.componentRef||'';
    copy.componentPath=copy.componentPath||'';
    copy.componentSource=copy.componentSource||'';
    copy.componentRoot=!!copy.componentRoot;
    if(copy.componentRoot&&copy.componentSource==='instance'){copy.componentVariantId=copy.componentVariantId||'';copy.componentOverrides=copy.componentOverrides&&typeof copy.componentOverrides==='object'?copy.componentOverrides:{};}else{delete copy.componentVariantId;delete copy.componentOverrides;}
    const inherited=copy.bemBlock||parentBlock;
    if(copy.children)copy.children=hydrateNodes(copy.children,inherited);
    return copy;
  });
}
function sanitizeClass(value=''){ const raw=String(value??'').trim(); if(!raw)return ''; return raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,''); }
function bemBaseClass(node){
  const block=sanitizeClass(node.bemBlock||'');
  const element=sanitizeClass(node.bemElement||'');
  if(block&&element)return `${block}__${element}`;
  if(block)return block;
  return `orbit-${slug(node.name)}-${slug(node.id).slice(-5)}`;
}
function nodeClassList(node){
  const base=bemBaseClass(node);
  const modifiers=(node.bemModifiers||[]).map(sanitizeClass).filter(Boolean).map(mod=>`${base}--${mod}`);
  const global=(node.globalClassIds||[]).map(id=>state.globalClasses?.find(item=>item.id===id)?.name).map(sanitizeClass).filter(Boolean);
  const custom=(node.customClasses||[]).map(sanitizeClass).filter(Boolean);
  return [...new Set([base,...modifiers,...global,...custom])];
}
function classAttribute(node){ return nodeClassList(node).join(' '); }
function accepts(node){ return node && ['section','container','grid','block','div','card','gallery','form','list','statCard','testimonial','pricingCard','faqItem'].includes(node.type); }
function cssValue(value){ return typeof value==='number'?`${value}px`:value; }
function varName(category,key){ const item=state.tokens?.[category]?.[key]; return item?.cssVar||`--${tokenMeta[category].prefix}-${slug(key)}`; }
function tokenRef(category,key){ return `var(${varName(category,key)})`; }
function tokenCss(){ return Object.entries(state.tokens).flatMap(([category,items])=>Object.entries(items).map(([key,item])=>`${varName(category,key)}:${item.value}`)).join(';'); }
function resolveToken(value){
  const match=String(value||'').match(/^var\((--[^)]+)\)$/); if(!match)return value;
  for(const [category,items] of Object.entries(state.tokens))for(const [key,item] of Object.entries(items))if(varName(category,key)===match[1])return item.value;
  return value;
}
function toNumber(value,fallback=0){ const n=parseFloat(resolveToken(value)); return Number.isFinite(n)?n:fallback; }
function isTextual(node){ return node && ['heading','text','richtext','link','button','badge','quote'].includes(node.type); }
function find(nodes,id){ for(const node of nodes){ if(node.id===id)return node; const hit=find(node.children||[],id); if(hit)return hit; } return null; }
function findInfo(nodes,id,parentId=null){
  for(let i=0;i<nodes.length;i++){
    const node=nodes[i]; if(node.id===id)return {node,parentId,index:i};
    const hit=findInfo(node.children||[],id,node.id); if(hit)return hit;
  }
  return null;
}
function findPath(nodes,id,path=[]){
  for(const node of nodes){ const next=[...path,node]; if(node.id===id)return next; const hit=findPath(node.children||[],id,next); if(hit.length)return hit; }
  return [];
}
function update(nodes,id,fn){ return nodes.map(n=>n.id===id?fn(n):({...n,children:n.children?update(n.children,id,fn):undefined})); }
function insertAt(nodes,parentId,index,node){
  if(!parentId){ const copy=[...nodes]; copy.splice(Math.max(0,Math.min(index,copy.length)),0,node); return copy; }
  return update(nodes,parentId,parent=>{ const children=[...(parent.children||[])]; children.splice(Math.max(0,Math.min(index,children.length)),0,node); return {...parent,children}; });
}
function extract(nodes,id){
  let removed=null; const output=[];
  for(const n of nodes){
    if(n.id===id){ removed=n; continue; }
    if(!removed && n.children?.length){ const result=extract(n.children,id); if(result.removed){ removed=result.removed; output.push({...n,children:result.nodes}); continue; } }
    output.push(n);
  }
  return {nodes:output,removed};
}
function remove(nodes,id){ return extract(nodes,id).nodes; }
function regenerate(node){ return {...clone(node),id:uid(node.type),children:node.children?.map(regenerate)}; }
function duplicate(nodes,id){
  const info=findInfo(nodes,id); if(!info)return nodes; const copy=regenerate(info.node); copy.name=`${info.node.name} copy`;
  return insertAt(nodes,info.parentId,info.index+1,copy);
}
function copyValue(value){return value&&typeof value==='object'?clone(value):value;}
function normalizeComponentDefinition(component={}){
  return {
    ...component,
    name:component.name||'Component',
    createdAt:component.createdAt||Date.now(),
    props:Array.isArray(component.props)?component.props.map(prop=>({...prop,id:prop.id||uid('prop'),name:prop.name||prop.property||'Propiedad',type:prop.type||'text',path:prop.path||'root',property:prop.property||'content'})):[],
    variants:Array.isArray(component.variants)?component.variants.map(variant=>({...variant,id:variant.id||uid('variant'),name:variant.name||'Variante',createdAt:variant.createdAt||Date.now()})):[],
    instances:Number(component.instances)||0,
    overrides:Number(component.overrides)||0
  };
}
function componentizeTree(node,ref,source,path='root',root=true){
  const next={...clone(node),componentRef:ref,componentPath:path,componentSource:source,componentRoot:root};
  if(root){
    next.componentVariantId=source==='instance'?(next.componentVariantId||''):'';
    next.componentOverrides=source==='instance'&&next.componentOverrides&&typeof next.componentOverrides==='object'?next.componentOverrides:{};
  }else{
    delete next.componentVariantId;
    delete next.componentOverrides;
  }
  if(next.children)next.children=next.children.map((child,index)=>componentizeTree(child,ref,source,`${path}.${index}`,false));
  return next;
}
function regenerateComponentTree(node,source='instance',root=true){
  const next={...clone(node),id:uid(node.type),componentSource:source,componentRoot:root};
  if(root){
    next.componentVariantId='';
    next.componentOverrides={};
  }else{
    delete next.componentVariantId;
    delete next.componentOverrides;
  }
  if(next.children)next.children=next.children.map(child=>regenerateComponentTree(child,source,false));
  return next;
}
function componentNodeSets(){
  ensureProjectPages();
  return state.pages.map(page=>page.id===state.currentPageId?state.nodes:(page.nodes||[]));
}
function componentMasterLocation(ref){
  ensureProjectPages();
  for(const page of state.pages){
    const nodes=page.id===state.currentPageId?state.nodes:(page.nodes||[]);
    let found=null;
    (function walk(list){for(const node of list||[]){if(node.componentRef===ref&&node.componentSource==='master'&&node.componentRoot){found=node;return;}walk(node.children||[]);if(found)return;}})(nodes);
    if(found)return {pageId:page.id,node:found};
  }
  return null;
}
function componentMaster(ref){return componentMasterLocation(ref)?.node||null;}
function componentRootForNode(nodeId=state.selectedId){
  if(!nodeId)return null;
  const path=findPath(state.nodes,nodeId);
  return [...path].reverse().find(item=>item.componentRoot&&item.componentRef)||null;
}
function componentNodeByPath(root,path){
  let found=null;
  (function walk(node){if(!node||found)return;if(node.componentPath===path){found=node;return;}(node.children||[]).forEach(walk);})(root);
  return found;
}
function componentOverrideKey(path,kind,property,scope=''){return `${path}::${kind}::${scope}::${property}`;}
function componentOverrideEntries(root){return Object.values(root?.componentOverrides||{});}
function componentOverrideCount(root){return componentOverrideEntries(root).length;}
function componentVariantUsage(ref,variantId){
  let count=0;
  componentNodeSets().forEach(nodes=>(function walk(list){(list||[]).forEach(node=>{if(node.componentRoot&&node.componentSource==='instance'&&node.componentRef===ref&&(node.componentVariantId||'')===(variantId||''))count++;walk(node.children||[]);});})(nodes));
  return count;
}
function refreshComponentCounts(){
  state.components=(state.components||[]).map(normalizeComponentDefinition).map(component=>{
    let instances=0,overrides=0;
    componentNodeSets().forEach(nodes=>(function walk(list){(list||[]).forEach(node=>{if(node.componentRef===component.id&&node.componentSource==='instance'&&node.componentRoot){instances++;overrides+=componentOverrideCount(node);}walk(node.children||[]);});})(nodes));
    return {...component,instances,overrides};
  });
}
function componentPropType(node,property){
  if(property==='src')return 'image';
  if(property==='href')return 'link';
  if(property==='content'&&['text','richtext','quote','selectField'].includes(node.type))return 'textarea';
  return 'text';
}
function componentPropLabel(node,property){
  const suffix={content:'',href:' · enlace',src:' · imagen',alt:' · alt',placeholder:' · placeholder'}[property]||` · ${property}`;
  return `${node.name||node.type}${suffix}`;
}
function detectComponentPropsFromTree(root){
  const result=[];
  (function walk(node){
    const properties=[];
    if(node.content!==undefined&&['heading','text','richtext','link','button','badge','quote','icon','selectField'].includes(node.type))properties.push('content');
    if(node.href!==undefined&&['link','button'].includes(node.type))properties.push('href');
    if(node.type==='image'){properties.push('src','alt');}
    if(node.placeholder!==undefined&&['input','textareaField'].includes(node.type))properties.push('placeholder');
    properties.forEach(property=>result.push({id:uid('prop'),name:componentPropLabel(node,property),type:componentPropType(node,property),path:node.componentPath||'root',property,defaultValue:copyValue(node[property])}));
    (node.children||[]).forEach(walk);
  })(root);
  return result.slice(0,24);
}
function mergeDetectedComponentProps(component,detected){
  const existing=new Set((component.props||[]).map(prop=>`${prop.path}|${prop.property}`));
  return [...(component.props||[]),...detected.filter(prop=>!existing.has(`${prop.path}|${prop.property}`))];
}
function createComponentFromSelection(){
  const node=selected();if(!node||!['section','container','grid','block','div','card','testimonial','pricingCard','faqItem','statCard'].includes(node.type)){toast('Selecciona una sección, contenedor o card');return;}
  if(node.componentRef){toast('Este elemento ya pertenece a un componente');return;}
  const ref=uid('component');const name=node.name||'Component';
  const before=snapshot();
  state.nodes=update(state.nodes,node.id,item=>componentizeTree(item,ref,'master'));
  const master=find(state.nodes,node.id);
  state.components.push(normalizeComponentDefinition({id:ref,name,masterId:node.id,instances:0,variants:[],props:detectComponentPropsFromTree(master),createdAt:Date.now()}));
  pushHistory(before);markUnsaved();render();toast(`Componente Pro creado: ${name}`);
}
function componentSourceTree(ref,variantId=''){
  const component=state.components.find(item=>item.id===ref);
  const variant=variantId?component?.variants?.find(item=>item.id===variantId):null;
  return variant?.tree||componentMaster(ref);
}
function applyComponentOverrides(tree,overrides={}){
  const entries=Object.values(overrides||{});
  if(!entries.length)return tree;
  function walk(node){
    let next={...node};
    entries.filter(entry=>entry.path===node.componentPath).forEach(entry=>{
      if(entry.kind==='prop')next[entry.property]=copyValue(entry.value);
      if(entry.kind==='style'){
        const [stateKey='default',group='base']=String(entry.scope||'default|base').split('|');
        if(stateKey==='default')next.styles={...(next.styles||{}),[group]:{...(next.styles?.[group]||{}),[entry.property]:copyValue(entry.value)}};
        else next.states={...(next.states||{}),[stateKey]:{...(next.states?.[stateKey]||{}),[entry.property]:copyValue(entry.value)}};
      }
    });
    if(next.children)next.children=next.children.map(walk);
    return next;
  }
  return walk(tree);
}
function prepareComponentInstance(source,ref,{id='',name='',variantId='',overrides={}}={}){
  if(!source)return null;
  let instance=componentizeTree(regenerateComponentTree(source,'instance'),ref,'instance');
  instance.id=id||instance.id;
  instance.name=name||`${source.name||'Component'} instance`;
  instance.componentVariantId=variantId||'';
  instance.componentOverrides=clone(overrides||{});
  instance=applyComponentOverrides(instance,instance.componentOverrides);
  instance.componentOverrides=clone(overrides||{});
  return instance;
}
function addComponentInstance(ref){
  const master=componentMaster(ref);if(!master){toast('No se encontró el componente principal');return;}
  const instance=prepareComponentInstance(master,ref,{name:`${master.name} instance`});
  const selectedInfo=state.selectedId?findInfo(state.nodes,state.selectedId):null;
  const placement=selectedInfo?{parentId:selectedInfo.parentId,index:selectedInfo.index+1}:{parentId:null,index:state.nodes.length};
  commit(()=>{state.nodes=insertAt(state.nodes,placement.parentId,placement.index,instance);refreshComponentCounts();},instance.id);
  toast('Instancia vinculada insertada');
}
function clearComponentMetadataDeep(node){
  const next={...node,componentRef:'',componentPath:'',componentSource:'',componentRoot:false};
  delete next.componentVariantId;delete next.componentOverrides;
  if(next.children)next.children=next.children.map(clearComponentMetadataDeep);
  return next;
}
function detachComponentSelection(){
  const root=componentRootForNode();if(!root)return;
  commit(()=>{state.nodes=update(state.nodes,root.id,clearComponentMetadataDeep);refreshComponentCounts();},root.id);
  toast('Instancia desvinculada; sus cambios quedaron conservados');
}
function projectNodesMutation(transform){
  syncCurrentPageRecord();
  state.pages=state.pages.map(page=>({...page,nodes:transform(page.nodes||[],page)}));
  const current=state.pages.find(page=>page.id===state.currentPageId)||state.pages[0];
  state.nodes=hydrateNodes(clone(current?.nodes||[]));
  if(state.selectedId&&!find(state.nodes,state.selectedId)){state.selectedId=state.nodes[0]?.id||null;state.selectedIds=state.selectedId?[state.selectedId]:[];}
}
function mutateComponentPathAcrossProject(ref,path,descriptor,mutator){
  const key=componentOverrideKey(path,descriptor.kind,descriptor.property,descriptor.scope||'');
  function walk(list,activeInstanceRoot=null){
    return (list||[]).map(node=>{
      const root=node.componentRoot&&node.componentRef===ref&&node.componentSource==='instance'?node:activeInstanceRoot;
      const blocked=!!root?.componentOverrides?.[key];
      let next=node;
      if(node.componentRef===ref&&node.componentPath===path&&(node.componentSource==='master'||!blocked))next=mutator(node);
      if(next.children)next={...next,children:walk(next.children,root)};
      return next;
    });
  }
  projectNodesMutation(nodes=>walk(nodes));
}
function recordComponentOverride(rootId,entry){
  const key=componentOverrideKey(entry.path,entry.kind,entry.property,entry.scope||'');
  state.nodes=update(state.nodes,rootId,root=>({...root,componentOverrides:{...(root.componentOverrides||{}),[key]:{...entry,key,value:copyValue(entry.value)}}}));
  return key;
}
function mutateInstancePath(rootId,path,mutator){
  state.nodes=update(state.nodes,rootId,root=>{
    function walk(node){
      let next=node.componentPath===path?mutator(node):node;
      if(next.children)next={...next,children:next.children.map(walk)};
      return next;
    }
    return walk(root);
  });
}
function updateComponentPropDefault(ref,path,property,value){
  state.components=state.components.map(component=>component.id===ref?{...component,props:(component.props||[]).map(prop=>prop.path===path&&prop.property===property?{...prop,defaultValue:copyValue(value)}:prop)}:component);
}
function setComponentPropertyValue(ref,rootId,propId,value){
  const component=state.components.find(item=>item.id===ref);const prop=component?.props?.find(item=>item.id===propId);const root=find(state.nodes,rootId);
  if(!component||!prop||!root)return;
  if(root.componentSource==='master'){
    mutateComponentPathAcrossProject(ref,prop.path,{kind:'prop',property:prop.property,scope:''},node=>({...node,[prop.property]:value}));
    updateComponentPropDefault(ref,prop.path,prop.property,value);
  }else{
    recordComponentOverride(root.id,{path:prop.path,kind:'prop',property:prop.property,scope:'',value});
    mutateInstancePath(root.id,prop.path,node=>({...node,[prop.property]:value}));
  }
  markUnsaved();renderCanvas();
}
function rebuildComponentInstance(rootId,{variantId,overrides}={}){
  const root=find(state.nodes,rootId);if(!root)return null;
  const nextVariant=variantId===undefined?(root.componentVariantId||''):variantId;
  const nextOverrides=overrides===undefined?(root.componentOverrides||{}):overrides;
  const source=componentSourceTree(root.componentRef,nextVariant);if(!source)return null;
  const replacement=prepareComponentInstance(source,root.componentRef,{id:root.id,name:root.name,variantId:nextVariant,overrides:nextOverrides});
  state.nodes=update(state.nodes,root.id,()=>replacement);
  return replacement;
}
function resetComponentOverride(rootId,key){
  const root=find(state.nodes,rootId);if(!root?.componentOverrides?.[key])return;
  const before=snapshot();const overrides={...(root.componentOverrides||{})};delete overrides[key];
  rebuildComponentInstance(rootId,{overrides});state.selectedId=rootId;state.selectedIds=[rootId];pushHistory(before);markUnsaved();render();toast('Override restablecido');
}
function resetAllComponentOverrides(rootId){
  const root=find(state.nodes,rootId);if(!root||!componentOverrideCount(root))return;
  const before=snapshot();rebuildComponentInstance(rootId,{overrides:{}});state.selectedId=rootId;state.selectedIds=[rootId];pushHistory(before);markUnsaved();render();toast('Todos los overrides fueron restablecidos');
}
function syncComponentInstances(ref,options={}){
  const master=componentMaster(ref);if(!master)return;
  const before=options.history===false?null:snapshot();
  const component=state.components.find(item=>item.id===ref);
  function walk(list){
    return (list||[]).map(node=>{
      if(node.componentRef===ref&&node.componentSource==='instance'&&node.componentRoot){
        const variantId=(node.componentVariantId&&component?.variants?.some(item=>item.id===node.componentVariantId))?node.componentVariantId:'';
        const source=componentSourceTree(ref,variantId)||master;
        return prepareComponentInstance(source,ref,{id:node.id,name:node.name,variantId,overrides:node.componentOverrides||{}});
      }
      return {...node,children:node.children?walk(node.children):undefined};
    });
  }
  projectNodesMutation(nodes=>walk(nodes));refreshComponentCounts();
  if(before)pushHistory(before);markUnsaved();if(options.render!==false)render();if(!options.silent)toast('Instancias sincronizadas sin perder overrides');
}
function showComponentVariants(ref){
  const component=state.components.find(item=>item.id===ref);if(!component)return;const variants=component.variants||[];const selectedRoot=componentRootForNode();const selectedMatches=selectedRoot?.componentRef===ref&&selectedRoot.componentSource==='instance';
  const cards=[{id:'',name:'Default',createdAt:component.createdAt,tree:componentMaster(ref),system:true},...variants];
  openModal(`${component.name} · Variantes`,'COMPONENTS PRO',`<div class="component-variants-panel component-variants-pro"><div class="component-variants-head"><div><strong>Sistema de variantes</strong><p>Cada instancia puede elegir una variante y mantener sus propios overrides.</p></div><button type="button" class="primary-action" data-create-component-variant="${ref}">＋ Nueva variante</button></div><div class="component-variant-list component-variant-grid">${cards.map(variant=>{const usage=componentVariantUsage(ref,variant.id);const active=selectedMatches&&(selectedRoot.componentVariantId||'')===variant.id;return `<article class="${active?'is-active':''}"><div class="component-variant-copy"><span class="variant-preview-mark">${variant.system?'D':'V'}</span><div><strong>${escapeHtml(variant.name)}</strong><small>${usage} ${usage===1?'instancia':'instancias'}${variant.system?' · Base':` · ${formatProjectDate(variant.createdAt)}`}</small></div></div><div class="component-variant-actions"><button type="button" data-apply-component-variant="${variant.id}" data-component-ref="${ref}" ${selectedMatches?'':'disabled'}>${active?'Activa':'Aplicar'}</button>${variant.system?'':`<button type="button" data-update-component-variant="${variant.id}" data-component-ref="${ref}" title="Actualizar desde principal">${uiIcon('sync')}</button><button type="button" data-delete-component-variant="${variant.id}" data-component-ref="${ref}" title="Eliminar">×</button>`}</div></article>`;}).join('')}</div>${selectedMatches?'':`<div class="component-modal-note">${uiIcon('warning')} Selecciona una instancia de “${escapeHtml(component.name)}” para aplicar una variante.</div>`}</div>`,'component-variants-modal');
}
function createComponentVariant(ref){
  const component=state.components.find(item=>item.id===ref);const master=componentMaster(ref);if(!component||!master)return;
  const value=prompt('Nombre de la variante',`Variante ${(component.variants||[]).length+1}`);if(value===null)return;
  const before=snapshot();component.variants=[...(component.variants||[]),{id:uid('variant'),name:value.trim()||'Variante',createdAt:Date.now(),tree:clone(master)}];pushHistory(before);markUnsaved();showComponentVariants(ref);
}
function updateComponentVariant(ref,variantId){
  const component=state.components.find(item=>item.id===ref);const master=componentMaster(ref);const variant=component?.variants?.find(item=>item.id===variantId);if(!variant||!master)return;
  const before=snapshot();variant.tree=clone(master);variant.updatedAt=Date.now();pushHistory(before);markUnsaved();showComponentVariants(ref);toast(`Variante actualizada: ${variant.name}`);
}
function applyComponentVariant(ref,variantId=''){
  const root=componentRootForNode();if(!root||root.componentRef!==ref||root.componentSource!=='instance'){toast('Selecciona una instancia de este componente','error');return;}
  const component=state.components.find(item=>item.id===ref);if(variantId&&!component?.variants?.some(item=>item.id===variantId))return;
  const before=snapshot();rebuildComponentInstance(root.id,{variantId});state.selectedId=root.id;state.selectedIds=[root.id];pushHistory(before);markUnsaved();closeModal();render();toast(variantId?`Variante aplicada: ${component.variants.find(item=>item.id===variantId)?.name}`:'Variante Default aplicada');
}
function deleteComponentVariant(ref,variantId){
  const component=state.components.find(item=>item.id===ref);const variant=component?.variants?.find(item=>item.id===variantId);if(!component||!variant)return;
  const usage=componentVariantUsage(ref,variantId);if(usage&&!confirm(`“${variant.name}” está en ${usage} ${usage===1?'instancia':'instancias'}. Se cambiarán a Default. ¿Continuar?`))return;
  const before=snapshot();component.variants=(component.variants||[]).filter(item=>item.id!==variantId);
  function walk(list){return (list||[]).map(node=>{if(node.componentRoot&&node.componentRef===ref&&node.componentSource==='instance'&&node.componentVariantId===variantId){const source=componentMaster(ref);return prepareComponentInstance(source,ref,{id:node.id,name:node.name,variantId:'',overrides:node.componentOverrides||{}});}return {...node,children:node.children?walk(node.children):undefined};});}
  projectNodesMutation(nodes=>walk(nodes));pushHistory(before);markUnsaved();showComponentVariants(ref);
}
function detectComponentProperties(ref){
  const component=state.components.find(item=>item.id===ref);const master=componentMaster(ref);if(!component||!master)return;
  const before=snapshot();component.props=mergeDetectedComponentProps(component,detectComponentPropsFromTree(master));pushHistory(before);markUnsaved();showComponentProperties(ref);toast('Propiedades detectadas');
}
function removeComponentProperty(ref,propId){
  const component=state.components.find(item=>item.id===ref);if(!component)return;component.props=(component.props||[]).filter(prop=>prop.id!==propId);markUnsaved();showComponentProperties(ref);
}
function saveComponentProperties(ref){
  const component=state.components.find(item=>item.id===ref);if(!component)return;
  const before=snapshot();const rows=[...els.modalContent.querySelectorAll('[data-component-prop-row]')];
  component.props=rows.map(row=>{const previous=component.props.find(prop=>prop.id===row.dataset.componentPropRow);return {...previous,name:row.querySelector('[data-component-prop-name]')?.value.trim()||previous.name,type:row.querySelector('[data-component-prop-type]')?.value||previous.type};});
  pushHistory(before);markUnsaved();closeModal();render();toast('Propiedades del componente guardadas');
}
function showComponentProperties(ref){
  const component=state.components.find(item=>item.id===ref);if(!component)return;const props=component.props||[];
  openModal(`${component.name} · Propiedades`,'COMPONENTS PRO',`<div class="component-properties-manager"><div class="component-properties-head"><div><strong>Props editables</strong><p>Estas propiedades aparecen en Editar para cada instancia y se exportan como props de Astro.</p></div><button type="button" class="secondary-action" data-detect-component-properties="${ref}">${uiIcon('sync')} Detectar</button></div>${props.length?`<div class="component-properties-list">${props.map(prop=>`<article data-component-prop-row="${prop.id}"><span class="component-prop-type-icon">${prop.type==='image'?'▧':prop.type==='link'?'↗':'T'}</span><div><input data-component-prop-name value="${escapeHtml(prop.name)}" aria-label="Nombre de propiedad"><small>${escapeHtml(prop.path)} · ${escapeHtml(prop.property)}</small></div><select data-component-prop-type><option value="text" ${prop.type==='text'?'selected':''}>Texto</option><option value="textarea" ${prop.type==='textarea'?'selected':''}>Texto largo</option><option value="link" ${prop.type==='link'?'selected':''}>Enlace</option><option value="image" ${prop.type==='image'?'selected':''}>Imagen</option></select><button type="button" data-remove-component-property="${prop.id}" data-component-ref="${ref}" title="Quitar">×</button></article>`).join('')}</div>`:'<div class="component-empty"><span>◇</span><strong>Sin propiedades expuestas</strong><p>Usa Detectar para encontrar textos, enlaces e imágenes dentro del componente.</p></div>'}<div class="component-properties-footer"><button type="button" class="secondary-action" data-close-modal>Cancelar</button><button type="button" class="primary-action" data-save-component-properties="${ref}">Guardar propiedades</button></div></div>`,'component-properties-modal');
}
function renameComponent(ref){
  const component=state.components.find(item=>item.id===ref);if(!component)return;const value=prompt('Nombre del componente',component.name);if(value===null||!value.trim())return;
  const before=snapshot();component.name=value.trim();pushHistory(before);markUnsaved();render();toast('Componente renombrado');
}
function goToComponentMaster(ref){
  const location=componentMasterLocation(ref);if(!location){toast('No se encontró el componente principal','error');return;}
  if(location.pageId!==state.currentPageId)switchPage(location.pageId);
  state.selectedId=location.node.id;state.selectedIds=[location.node.id];state.tab='components';render();centerSelectedInCanvas();
}
function clearComponentMetadata(node,ref){
  const belongs=node.componentRef===ref;
  const next=belongs?{...node,componentRef:'',componentPath:'',componentSource:'',componentRoot:false}:{...node};
  if(belongs){delete next.componentVariantId;delete next.componentOverrides;}
  if(next.children)next.children=next.children.map(child=>clearComponentMetadata(child,ref));
  return next;
}
function removeComponentRoots(nodes,ref){
  return (nodes||[]).filter(node=>!(node.componentRef===ref&&node.componentRoot)).map(node=>({...node,children:node.children?removeComponentRoots(node.children,ref):undefined}));
}
function showDeleteComponentDialog(ref){
  refreshComponentCounts();
  const component=state.components.find(item=>item.id===ref);if(!component)return;
  const instances=component.instances||0;
  openModal('Eliminar componente','COMPONENT LIBRARY',`<div class="component-delete-dialog"><div class="component-delete-symbol">${uiIcon('warning')}</div><div class="component-delete-copy"><strong>¿Qué quieres hacer con “${escapeHtml(component.name)}”?</strong><p>Este componente tiene <b>${instances}</b> ${instances===1?'instancia vinculada':'instancias vinculadas'}. Elige cómo debe tratar Orbit los elementos que ya están en el canvas.</p></div><div class="component-delete-options"><button type="button" class="component-delete-option keep" data-component-delete-mode="keep" data-component-ref="${ref}"><span class="option-icon">${uiIcon('keep')}</span><span><strong>Conservar los elementos</strong><small>Elimina la definición del componente y convierte el principal y sus instancias en elementos normales editables.</small></span></button><button type="button" class="component-delete-option destructive" data-component-delete-mode="all" data-component-ref="${ref}"><span class="option-icon">${uiIcon('trash')}</span><span><strong>Eliminar todo</strong><small>Elimina el componente principal y todas sus instancias del canvas. Esta acción se puede deshacer.</small></span></button></div><button type="button" class="component-delete-cancel" data-close-modal>Cancelar</button></div>`,'component-delete-modal');
}
function deleteComponent(ref,mode='keep'){
  const component=state.components.find(item=>item.id===ref);if(!component)return;
  const before=snapshot();
  projectNodesMutation(nodes=>mode==='all'?removeComponentRoots(nodes,ref):nodes.map(node=>clearComponentMetadata(node,ref)));
  state.components=state.components.filter(item=>item.id!==ref);
  const currentExists=state.selectedId&&find(state.nodes,state.selectedId);
  if(!currentExists){state.selectedId=state.nodes[0]?.id||null;state.selectedIds=state.selectedId?[state.selectedId]:[];}
  refreshComponentCounts();pushHistory(before);markUnsaved();closeModal();render();toast(mode==='all'?`Componente “${component.name}” y sus instancias eliminados`:`Componente “${component.name}” eliminado; elementos conservados`);
}
function removeSelectedIds(nodes,ids){return (nodes||[]).filter(node=>!ids.includes(node.id)).map(node=>({...node,children:node.children?removeSelectedIds(node.children,ids):undefined}));}
function groupSelection(){
  const ids=selectedIds();if(ids.length<2){toast('Selecciona al menos dos elementos');return;}
  const infos=ids.map(id=>findInfo(state.nodes,id));if(infos.some(info=>!info)||new Set(infos.map(info=>info.parentId||'root')).size!==1){toast('Los elementos deben compartir el mismo contenedor');return;}
  const parentId=infos[0].parentId;const sorted=[...infos].sort((a,b)=>a.index-b.index);const nodes=sorted.map(info=>info.node);const group=makeNode('container');group.name='Group';group.htmlTag='div';group.styles.base={width:'100%',display:'flex',direction:'column',gap:'var(--space-sm)'};group.children=nodes;
  const before=snapshot();state.nodes=removeSelectedIds(state.nodes,ids);state.nodes=insertAt(state.nodes,parentId,sorted[0].index,group);setSelection(group.id);pushHistory(before);markUnsaved();render();toast('Elementos agrupados');
}
function ungroupSelection(){
  const node=selected();if(!node||node.type!=='container'||!(node.children||[]).length)return;
  const info=findInfo(state.nodes,node.id);const before=snapshot();state.nodes=remove(state.nodes,node.id);let index=info.index;for(const child of node.children)state.nodes=insertAt(state.nodes,info.parentId,index++,child);state.selectedIds=node.children.map(child=>child.id);state.selectedId=state.selectedIds[0]||null;pushHistory(before);markUnsaved();render();toast('Grupo deshecho');
}
function multiStyle(prop,value){
  const ids=selectedIds();if(!ids.length)return;state.nodes=mapNodes(state.nodes,node=>ids.includes(node.id)?({...node,styles:{...node.styles,[bpKey()]:{...(node.styles?.[bpKey()]||{}),[prop]:value}}}):node);
}
function multiCommand(command){
  const ids=selectedIds();if(ids.length<2&&command!=='ungroup')return;
  if(command==='group'){groupSelection();return;}if(command==='ungroup'){ungroupSelection();return;}
  const before=snapshot();
  if(command==='left'){multiStyle('justifySelf','start');multiStyle('alignSelf','flex-start');multiStyle('marginLeft','0');multiStyle('marginRight','auto');toast('Alineado a la izquierda');}
  if(command==='center'){multiStyle('justifySelf','center');multiStyle('alignSelf','center');multiStyle('marginLeft','auto');multiStyle('marginRight','auto');toast('Centrado horizontalmente');}
  if(command==='right'){multiStyle('justifySelf','end');multiStyle('alignSelf','flex-end');multiStyle('marginLeft','auto');multiStyle('marginRight','0');toast('Alineado a la derecha');}
  if(command==='top'){multiStyle('alignSelf','flex-start');multiStyle('marginTop','0');multiStyle('marginBottom','auto');toast('Alineado arriba');}
  if(command==='middle'){multiStyle('alignSelf','center');multiStyle('marginTop','auto');multiStyle('marginBottom','auto');toast('Centrado verticalmente');}
  if(command==='bottom'){multiStyle('alignSelf','flex-end');multiStyle('marginTop','auto');multiStyle('marginBottom','0');toast('Alineado abajo');}
  if(command==='distribute-x'||command==='distribute-y'){
    const infos=ids.map(id=>findInfo(state.nodes,id));const same=infos.every(info=>info&&info.parentId===infos[0].parentId);
    if(same){const parentId=infos[0].parentId;if(parentId)state.nodes=update(state.nodes,parentId,parent=>({...parent,styles:{...parent.styles,[bpKey()]:{...(parent.styles?.[bpKey()]||{}),display:'flex',direction:command==='distribute-x'?'row':'column',justifyContent:'space-between',alignItems:'center'}}}));}
    toast(command==='distribute-x'?'Distribuido horizontalmente':'Distribuido verticalmente');
  }
  pushHistory(before);markUnsaved();render();
}
function isDescendant(node,id){ return !!find(node.children||[],id); }
function rootAncestor(id){ const path=findPath(state.nodes,id); return path[0]||null; }
function selected(){ return find(state.nodes,state.selectedId); }
function selectedIds(){ return [...new Set((state.selectedIds||[]).filter(id=>find(state.nodes,id)))]; }
function selectedNodes(){ return selectedIds().map(id=>find(state.nodes,id)).filter(Boolean); }
function isSelectedId(id){ return selectedIds().includes(id); }
function setSelection(id,add=false){
  if(!id){state.selectedId=null;state.selectedIds=[];return;}
  if(add){
    const current=selectedIds();
    if(current.includes(id)){const next=current.filter(item=>item!==id);state.selectedIds=next;state.selectedId=next[next.length-1]||null;}
    else{state.selectedIds=[...current,id];state.selectedId=id;}
  }else{state.selectedId=id;state.selectedIds=[id];}
}
function effective(node){
  if(!node)return {};
  const classes=(node.globalClassIds||[]).map(globalClassById).filter(Boolean);
  let result={};
  classes.forEach(item=>{result={...result,...(item.styles?.base||{}),...(item.styles?.desktop||{})};});
  result={...result,...(node.styles?.base||{}),...(node.styles?.desktop||{})};
  const cascade=responsiveCascadeKeys(state.breakpoint);
  cascade.forEach(bp=>{classes.forEach(item=>{result={...result,...(item.styles?.[bp]||{})};});result={...result,...(node.styles?.[bp]||{})};});
  if(node.id===state.selectedId&&state.styleState!=='default'){
    classes.forEach(item=>{result={...result,...(item.states?.[state.styleState]||{})};});
    result={...result,...(node.states?.[state.styleState]||{})};
  }
  return result;
}
function bpKey(){ return state.breakpoint==='desktop'?'base':state.breakpoint; }
function hasOverride(node,prop){
  if(state.styleState!=='default')return Object.prototype.hasOwnProperty.call(node.states?.[state.styleState]||{},prop);
  return state.breakpoint!=='desktop' && Object.prototype.hasOwnProperty.call(node.styles?.[state.breakpoint]||{},prop);
}
function mapNodes(nodes,fn){ return nodes.map(node=>{const next=fn(node);return {...next,children:next.children?mapNodes(next.children,fn):undefined};}); }
function snapshot(){
  syncCurrentPageRecord();
  return {nodes:clone(state.nodes),tokens:clone(state.tokens),assets:clone(state.assets),components:clone(state.components),globalClasses:clone(state.globalClasses),pages:clone(state.pages),currentPageId:state.currentPageId,selectedId:state.selectedId,selectedIds:clone(selectedIds()),styleState:state.styleState,projectName:state.projectName,pageMeta:clone(state.pageMeta),breakpoints:clone(state.breakpoints),breakpointEnabled:clone(state.breakpointEnabled),canvasWidths:clone(state.canvasWidths),responsiveCompareSync:state.responsiveCompareSync,responsiveCompareSelected:state.responsiveCompareSelected,responsiveCompareZoom:clone(state.responsiveCompareZoom),responsiveAuditIgnored:clone(state.responsiveAuditIgnored),exportSettings:clone(state.exportSettings),rightPanelWidth:state.rightPanelWidth,rightPanelCollapsed:state.rightPanelCollapsed,leftPanelWidth:state.leftPanelWidth,leftPanelCollapsed:state.leftPanelCollapsed,tokenGroupsOpen:clone(state.tokenGroupsOpen),inspectorMode:state.inspectorMode,inspectorTab:state.inspectorTab,directEditEnabled:state.directEditEnabled};
}
function restore(snap){
  state.nodes=hydrateNodes(clone(snap.nodes));state.tokens=clone(snap.tokens||defaultTokens);state.assets=clone(snap.assets||[]);state.components=clone(snap.components||[]);state.globalClasses=clone(snap.globalClasses||[]);state.pages=clone(snap.pages||[]);state.currentPageId=snap.currentPageId||state.pages[0]?.id||'page-home';state.selectedId=snap.selectedId;state.selectedIds=clone(snap.selectedIds||[snap.selectedId].filter(Boolean));state.styleState=snap.styleState||'default';state.projectName=snap.projectName||state.projectName;state.pageMeta=clone(snap.pageMeta||state.pageMeta);state.breakpoints=clone(snap.breakpoints||state.breakpoints);state.breakpointEnabled=clone(snap.breakpointEnabled||state.breakpointEnabled||{desktopXL:true,mobileL:true});state.canvasWidths=clone(snap.canvasWidths||state.canvasWidths);state.exportSettings=clone(snap.exportSettings||state.exportSettings);state.rightPanelWidth=snap.rightPanelWidth||state.rightPanelWidth;state.rightPanelCollapsed=!!snap.rightPanelCollapsed;state.leftPanelWidth=snap.leftPanelWidth||state.leftPanelWidth;state.leftPanelCollapsed=!!snap.leftPanelCollapsed;state.tokenGroupsOpen=clone(snap.tokenGroupsOpen||state.tokenGroupsOpen);state.inspectorMode='advanced';state.inspectorTab=['content','design','layout','responsive','interactions','advanced'].includes(snap.inspectorTab)?snap.inspectorTab:state.inspectorTab;state.directEditEnabled=snap.directEditEnabled!==false;state.responsiveCompareSync=snap.responsiveCompareSync!==false;state.responsiveCompareSelected=snap.responsiveCompareSelected!==false;state.responsiveCompareZoom=clone(snap.responsiveCompareZoom||state.responsiveCompareZoom||{desktop:1,tablet:1,mobile:1});state.responsiveAuditIgnored=clone(snap.responsiveAuditIgnored||[]);els.projectName.value=state.projectName;
}
function sameSnapshot(a,b){ return JSON.stringify(a)===JSON.stringify(b); }
function pushHistory(before){ if(!before)return; const after=snapshot(); if(sameSnapshot(before,after))return; state.history.push(before); state.history=state.history.slice(-80); state.future=[]; }
function commit(mutator,selectedId=state.selectedId){ const before=snapshot(); mutator(); if(selectedId!==undefined){state.selectedId=selectedId;state.selectedIds=selectedId?[selectedId]:[];} pushHistory(before); markUnsaved(); render(); }
function beginTransaction(kind){ if(!state.transaction)state.transaction={kind,before:snapshot()}; }
function endTransaction(){ if(!state.transaction)return; pushHistory(state.transaction.before); state.transaction=null; markUnsaved(); render(); }
function directStyle(prop,value){
  if(!state.selectedId)return;
  const target=find(state.nodes,state.selectedId);if(!target)return;
  const stateKey=state.styleState;
  const group=bpKey();
  const scope=`${stateKey}|${group}`;
  const mutate=node=>stateKey!=='default'
    ?({...node,states:{...(node.states||{}),[stateKey]:{...(node.states?.[stateKey]||{}),[prop]:value}}})
    :({...node,styles:{...(node.styles||{}),[group]:{...(node.styles?.[group]||{}),[prop]:value}}});
  if(target.componentRef&&target.componentSource==='master'){
    mutateComponentPathAcrossProject(target.componentRef,target.componentPath,{kind:'style',property:prop,scope},mutate);
    return;
  }
  if(target.componentRef&&target.componentSource==='instance'){
    const root=componentRootForNode(target.id);if(!root)return;
    recordComponentOverride(root.id,{path:target.componentPath,kind:'style',property:prop,scope,value});
    mutateInstancePath(root.id,target.componentPath,mutate);
    return;
  }
  const sharedClass=primarySharedStyleClass(target);
  if(sharedClass&&target.styleEditMode!=='local'){
    const mutateClass=item=>{
      if(item.id!==sharedClass.id)return item;
      if(stateKey!=='default')return {...item,states:{...(item.states||{}),[stateKey]:{...(item.states?.[stateKey]||{}),[prop]:value}}};
      return {...item,styles:{...(item.styles||{}),[group]:{...(item.styles?.[group]||{}),[prop]:value}}};
    };
    state.globalClasses=(state.globalClasses||[]).map(mutateClass);
    state.nodes=update(state.nodes,target.id,node=>{
      if(stateKey!=='default'){
        const states={...(node.states||{})};const values={...(states[stateKey]||{})};delete values[prop];states[stateKey]=values;return {...node,states};
      }
      const styles={...(node.styles||{})};const values={...(styles[group]||{})};delete values[prop];styles[group]=values;return {...node,styles};
    });
    return;
  }
  state.nodes=update(state.nodes,target.id,mutate);
}
function directNodeProp(prop,value){
  if(!state.selectedId)return;
  const target=find(state.nodes,state.selectedId);if(!target)return;
  const mutate=node=>({...node,[prop]:value});
  if(target.componentRef&&target.componentSource==='master'){
    mutateComponentPathAcrossProject(target.componentRef,target.componentPath,{kind:'prop',property:prop,scope:''},mutate);
    updateComponentPropDefault(target.componentRef,target.componentPath,prop,value);
    return;
  }
  if(target.componentRef&&target.componentSource==='instance'){
    const root=componentRootForNode(target.id);if(!root)return;
    recordComponentOverride(root.id,{path:target.componentPath,kind:'prop',property:prop,scope:'',value});
    mutateInstancePath(root.id,target.componentPath,mutate);
    return;
  }
  state.nodes=update(state.nodes,target.id,mutate);
}
function directToken(category,key,value){ state.tokens[category][key].value=value; }
function makeNode(type){
  const id=uid(type);
  const definitions={
    section:{id,type,name:'New Section',htmlTag:'section',ariaLabel:'',bemBlock:'',bemElement:'',bemModifiers:[],customClasses:[],children:[],styles:{base:{width:'100%',minHeight:'320px',paddingTop:'64px',paddingRight:'40px',paddingBottom:'64px',paddingLeft:'40px',display:'flex',direction:'column',gap:'var(--space-lg)',background:'var(--color-surface)',color:'var(--color-text)'},mobile:{paddingTop:'40px',paddingRight:'20px',paddingBottom:'40px',paddingLeft:'20px'}}},
    container:{id,type,name:'New Container',htmlTag:'div',ariaLabel:'',bemBlock:'',bemElement:'',bemModifiers:[],customClasses:[],children:[],styles:{base:{width:'100%',maxWidth:'1120px',display:'flex',direction:'column',gap:'var(--space-md)',align:'stretch'}}},
    grid:{id,type,name:'Grid',htmlTag:'div',ariaLabel:'',bemBlock:'',bemElement:'',bemModifiers:[],customClasses:[],children:[],styles:{base:{width:'100%',display:'grid',gridColumns:2,gap:'var(--space-md)',align:'stretch'}}},
    block:{id,type,name:'Block',htmlTag:'section',ariaLabel:'',bemBlock:'',bemElement:'',bemModifiers:[],customClasses:[],children:[],styles:{base:{width:'100%',minHeight:'220px',paddingTop:'32px',paddingRight:'32px',paddingBottom:'32px',paddingLeft:'32px',background:'var(--color-surface)',borderRadius:'var(--radius-md)',display:'flex',direction:'column',gap:'var(--space-md)'}}},
    div:{id,type,name:'Div',htmlTag:'div',ariaLabel:'',bemBlock:'',bemElement:'',bemModifiers:[],customClasses:[],children:[],styles:{base:{width:'100%',minHeight:'120px',display:'flex',direction:'column',gap:'var(--space-md)'}}},
    heading:{id,type,tag:'h2',htmlTag:'h2',ariaLabel:'',bemBlock:'',bemElement:'',bemModifiers:[],customClasses:[],name:'Heading',content:'Nuevo título',styles:{base:{color:'var(--color-text)',fontSize:'48px',fontWeight:700,lineHeight:1.08,letterSpacing:'-1.6px'},mobile:{fontSize:'36px'}}},
    text:{id,type,name:'Text',htmlTag:'p',ariaLabel:'',bemBlock:'',bemElement:'',bemModifiers:[],customClasses:[],content:'Escribe aquí tu contenido.',styles:{base:{color:'var(--color-muted)',fontSize:'var(--font-body)',fontWeight:400,lineHeight:1.55}}},
    richtext:{id,type,name:'Rich Text',htmlTag:'div',ariaLabel:'',bemBlock:'',bemElement:'',bemModifiers:[],customClasses:[],content:'Título corto\n\nEste bloque sirve para simular texto enriquecido, párrafos o contenido editorial con más aire visual.',styles:{base:{color:'var(--color-text)',fontSize:'16px',fontWeight:400,lineHeight:1.7}}},
    link:{id,type,name:'Text Link',htmlTag:'a',ariaLabel:'',bemBlock:'',bemElement:'',bemModifiers:[],customClasses:[],content:'Ver más',href:'#',styles:{base:{color:'var(--color-primary)',fontSize:'15px',fontWeight:600,lineHeight:1.4,textDecoration:'underline',textUnderlineOffset:'3px',background:'transparent'}}},
    button:{id,type,name:'Button',htmlTag:'a',ariaLabel:'',bemBlock:'',bemElement:'',bemModifiers:[],customClasses:[],content:'Botón',href:'#',styles:{base:{background:'var(--color-primary)',color:'#ffffff',fontSize:'15px',fontWeight:700,paddingTop:'14px',paddingRight:'20px',paddingBottom:'14px',paddingLeft:'20px',borderRadius:'var(--radius-pill)'}}},
    badge:{id,type,name:'Badge',htmlTag:'span',ariaLabel:'',bemBlock:'',bemElement:'',bemModifiers:[],customClasses:[],content:'Nuevo',styles:{base:{display:'inline-flex',align:'center',justify:'center',width:'fit-content',background:'rgba(239,90,36,.12)',color:'var(--color-primary)',fontSize:'12px',fontWeight:700,paddingTop:'8px',paddingRight:'12px',paddingBottom:'8px',paddingLeft:'12px',borderRadius:'var(--radius-pill)'}}},
    quote:{id,type,name:'Quote',htmlTag:'blockquote',ariaLabel:'',bemBlock:'',bemElement:'',bemModifiers:[],customClasses:[],content:'“Diseñar y exportar sin fricción cambia por completo el flujo de trabajo.”',styles:{base:{color:'var(--color-text)',fontSize:'24px',fontWeight:600,lineHeight:1.35,paddingLeft:'20px',borderLeft:'3px solid var(--color-primary)'}}},
    list:{id,type,name:'List',htmlTag:'ul',ariaLabel:'',bemBlock:'',bemElement:'',bemModifiers:[],customClasses:[],children:[],styles:{base:{width:'100%',display:'flex',direction:'column',gap:'12px',paddingLeft:'20px'}}},
    icon:{id,type,name:'Icon',htmlTag:'span',ariaLabel:'',bemBlock:'',bemElement:'',bemModifiers:[],customClasses:[],content:'★',styles:{base:{display:'inline-grid',placeItems:'center',width:'44px',height:'44px',background:'var(--color-soft)',color:'var(--color-primary)',fontSize:'22px',borderRadius:'12px'}}},
    image:{id,type,name:'Image',htmlTag:'img',ariaLabel:'',caption:'',bemBlock:'',bemElement:'',bemModifiers:[],customClasses:[],src:'https://images.unsplash.com/photo-1558655146-d09347e92766?auto=format&fit=crop&w=1200&q=80',alt:'Imagen de diseño',styles:{base:{width:'100%',height:'360px',objectFit:'cover',borderRadius:'var(--radius-md)'}}},
    gallery:{id,type,name:'Gallery',htmlTag:'div',ariaLabel:'',bemBlock:'',bemElement:'',bemModifiers:[],customClasses:[],children:[],styles:{base:{width:'100%',display:'grid',gridColumns:3,gap:'14px'},tablet:{gridColumns:2},mobile:{gridColumns:1}}},
    video:{id,type,name:'Video',htmlTag:'div',ariaLabel:'',bemBlock:'',bemElement:'',bemModifiers:[],customClasses:[],src:'https://www.youtube.com/embed/dQw4w9WgXcQ',title:'Video embed',styles:{base:{width:'100%',minHeight:'360px',borderRadius:'var(--radius-md)',overflow:'hidden',background:'#0f1115'}}},
    svg:{id,type,name:'SVG',htmlTag:'div',ariaLabel:'',bemBlock:'',bemElement:'',bemModifiers:[],customClasses:[],content:'SVG',svgCode:'<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="16" height="16" rx="4" stroke="currentColor" stroke-width="1.8"/><path d="M8 12H16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M12 8V16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',styles:{base:{display:'inline-grid',placeItems:'center',width:'72px',height:'72px',background:'var(--color-soft)',color:'var(--color-primary)',fontSize:'28px',borderRadius:'18px',paddingTop:'12px',paddingRight:'12px',paddingBottom:'12px',paddingLeft:'12px'}}},
    form:{id,type,name:'Form',htmlTag:'form',ariaLabel:'',bemBlock:'',bemElement:'',bemModifiers:[],customClasses:[],children:[],styles:{base:{width:'100%',display:'flex',direction:'column',gap:'14px',paddingTop:'24px',paddingRight:'24px',paddingBottom:'24px',paddingLeft:'24px',background:'var(--color-surface)',borderRadius:'var(--radius-md)',boxShadow:'var(--shadow-soft)'}}},
    input:{id,type,name:'Input',htmlTag:'input',ariaLabel:'',bemBlock:'',bemElement:'',bemModifiers:[],customClasses:[],placeholder:'Tu nombre',inputType:'text',styles:{base:{width:'100%',minHeight:'48px',paddingTop:'0px',paddingRight:'14px',paddingBottom:'0px',paddingLeft:'14px',border:'1px solid #d8dce2',borderRadius:'12px',background:'#ffffff',color:'var(--color-text)'}}},
    textareaField:{id,type,name:'Textarea',htmlTag:'textarea',ariaLabel:'',bemBlock:'',bemElement:'',bemModifiers:[],customClasses:[],placeholder:'Cuéntanos sobre tu proyecto',rows:5,styles:{base:{width:'100%',minHeight:'140px',paddingTop:'14px',paddingRight:'14px',paddingBottom:'14px',paddingLeft:'14px',border:'1px solid #d8dce2',borderRadius:'12px',background:'#ffffff',color:'var(--color-text)'}}},
    selectField:{id,type,name:'Select',htmlTag:'select',ariaLabel:'',bemBlock:'',bemElement:'',bemModifiers:[],customClasses:[],content:'Selecciona una opción\nServicio A\nServicio B\nServicio C',styles:{base:{width:'100%',minHeight:'48px',paddingTop:'0px',paddingRight:'14px',paddingBottom:'0px',paddingLeft:'14px',border:'1px solid #d8dce2',borderRadius:'12px',background:'#ffffff',color:'var(--color-text)'}}},
    statCard:{id,type,name:'Stat Card',htmlTag:'article',ariaLabel:'',bemBlock:'',bemElement:'',bemModifiers:[],customClasses:[],children:[],styles:{base:{width:'100%',minHeight:'210px',paddingTop:'24px',paddingRight:'24px',paddingBottom:'24px',paddingLeft:'24px',display:'flex',direction:'column',gap:'14px',background:'var(--color-surface)',borderRadius:'var(--radius-md)',boxShadow:'var(--shadow-soft)'}}},
    testimonial:{id,type,name:'Testimonial',htmlTag:'article',ariaLabel:'',bemBlock:'',bemElement:'',bemModifiers:[],customClasses:[],children:[],styles:{base:{width:'100%',minHeight:'240px',paddingTop:'24px',paddingRight:'24px',paddingBottom:'24px',paddingLeft:'24px',display:'flex',direction:'column',gap:'16px',background:'var(--color-surface)',borderRadius:'var(--radius-md)',boxShadow:'var(--shadow-soft)'}}},
    pricingCard:{id,type,name:'Pricing Card',htmlTag:'article',ariaLabel:'',bemBlock:'',bemElement:'',bemModifiers:[],customClasses:[],children:[],styles:{base:{width:'100%',minHeight:'320px',paddingTop:'28px',paddingRight:'28px',paddingBottom:'28px',paddingLeft:'28px',display:'flex',direction:'column',gap:'16px',background:'var(--color-surface)',borderRadius:'var(--radius-lg)',boxShadow:'var(--shadow-soft)'}}},
    faqItem:{id,type,name:'FAQ Item',htmlTag:'article',ariaLabel:'',bemBlock:'',bemElement:'',bemModifiers:[],customClasses:[],children:[],styles:{base:{width:'100%',minHeight:'160px',paddingTop:'22px',paddingRight:'22px',paddingBottom:'22px',paddingLeft:'22px',display:'flex',direction:'column',gap:'12px',background:'var(--color-surface)',borderRadius:'var(--radius-md)',boxShadow:'var(--shadow-soft)'}}},
    card:{id,type,name:'Card',htmlTag:'article',ariaLabel:'',bemBlock:'',bemElement:'',bemModifiers:[],customClasses:[],children:[],styles:{base:{width:'100%',minHeight:'220px',paddingTop:'28px',paddingRight:'28px',paddingBottom:'28px',paddingLeft:'28px',display:'flex',direction:'column',gap:'18px',background:'#f0f0f0',color:'var(--color-text)',borderRadius:'var(--radius-lg)'}}},
    divider:{id,type,name:'Divider',htmlTag:'hr',ariaLabel:'',bemBlock:'',bemElement:'',bemModifiers:[],customClasses:[],styles:{base:{width:'100%',height:'1px',background:'#d8d8d8'}}},
    spacer:{id,type,name:'Spacer',htmlTag:'div',ariaLabel:'',bemBlock:'',bemElement:'',bemModifiers:[],customClasses:[],styles:{base:{width:'100%',height:'64px'}}}
  };
  const node=hydrateNodes([definitions[type]])[0];
  if(type==='list'){
    node.children=[1,2,3].map(i=>{const item=makeNode('text');item.name=`List item ${i}`;item.htmlTag='li';item.content=`Item ${i}`;item.styles.base={color:'var(--color-muted)',fontSize:'15px',lineHeight:1.55};return item;});
  }
  if(type==='statCard'){const badge=makeNode('badge');badge.content='Performance';const value=makeNode('heading');value.tag='h3';value.htmlTag='h3';value.content='98%';value.styles.base={fontSize:'40px',fontWeight:700,lineHeight:1,color:'var(--color-text)'};const copy=makeNode('text');copy.content='Satisfacción promedio en experiencias digitales.';node.children=[badge,value,copy];}
  if(type==='testimonial'){const quote=makeNode('quote');quote.content='“Orbit hace mucho más simple convertir una idea visual en una estructura real para Astro.”';const author=makeNode('heading');author.tag='h4';author.htmlTag='h4';author.content='María Gómez';author.styles.base={fontSize:'20px',fontWeight:700,lineHeight:1.15,color:'var(--color-text)'};const role=makeNode('text');role.content='Lead Designer · Estudio Digital';node.children=[quote,author,role];}
  if(type==='pricingCard'){const badge=makeNode('badge');badge.content='Plan Pro';const price=makeNode('heading');price.tag='h3';price.htmlTag='h3';price.content='$49/mo';price.styles.base={fontSize:'42px',fontWeight:700,lineHeight:1,color:'var(--color-text)'};const copy=makeNode('text');copy.content='Incluye exportación Astro, clases globales y soporte de diseño.';const btn=makeNode('button');btn.content='Elegir plan';node.children=[badge,price,copy,btn];}
  if(type==='faqItem'){const title=makeNode('heading');title.tag='h4';title.htmlTag='h4';title.content='¿Puedo exportar esto a Astro?';title.styles.base={fontSize:'22px',fontWeight:700,lineHeight:1.2,color:'var(--color-text)'};const answer=makeNode('text');answer.content='Sí. Orbit genera estructura limpia y te permite seguir refinando el proyecto fuera del builder.';node.children=[title,answer];}
  if(type==='gallery'){
    node.children=[1,2,3].map(i=>{const item=makeNode('image');item.name=`Gallery image ${i}`;item.styles.base.height='220px';item.src=`https://picsum.photos/seed/orbit-gallery-${i}/800/600`;item.alt=`Gallery image ${i}`;return item;});
  }
  if(type==='form'){
    const title=makeNode('heading');title.name='Form title';title.tag='h3';title.htmlTag='h3';title.content='Hablemos de tu proyecto';title.styles.base={fontSize:'28px',fontWeight:700,lineHeight:1.12,color:'var(--color-text)'};
    const copy=makeNode('text');copy.name='Form intro';copy.content='Deja tus datos y te contactaremos pronto.';
    const input=makeNode('input');
    const input2=makeNode('input');input2.name='Email';input2.placeholder='Correo electrónico';input2.inputType='email';
    const area=makeNode('textareaField');
    const button=makeNode('button');button.content='Enviar mensaje';button.href='';button.htmlTag='button';
    node.children=[title,copy,input,input2,area,button];
  }
  return node;
}
function makeNavbar(){
  const section=makeNode('section'); section.name='Navbar'; section.htmlTag='header'; section.bemBlock='site-header'; section.styles.base={width:'100%',paddingTop:'18px',paddingRight:'32px',paddingBottom:'18px',paddingLeft:'32px',display:'flex',direction:'row',justify:'center',background:'var(--color-surface)'};
  const inner=makeNode('container'); inner.name='Navbar Inner'; inner.htmlTag='nav'; inner.ariaLabel='Navegación principal'; inner.bemBlock='site-header'; inner.bemElement='navigation'; inner.styles.base={width:'100%',maxWidth:'1120px',display:'flex',direction:'row',justify:'space-between',align:'center',gap:'20px'};
  const logo=makeNode('heading'); logo.name='Logo'; logo.htmlTag='h2'; logo.bemBlock='site-header'; logo.bemElement='logo'; logo.tag='h2'; logo.content='Orbit Studio'; logo.styles.base={fontSize:'22px',fontWeight:700,lineHeight:1,color:'var(--color-text)'};
  const nav=makeNode('container'); nav.name='Navigation'; nav.htmlTag='ul'; nav.bemBlock='site-header'; nav.bemElement='links'; nav.styles.base={display:'flex',direction:'row',align:'center',gap:'24px'};
  ['Work','About','Contact'].forEach(label=>{ const item=makeNode('text'); item.name=`Nav ${label}`; item.htmlTag='li'; item.bemBlock='site-header'; item.bemElement='item'; item.content=label; item.styles.base={fontSize:'14px',fontWeight:600,color:'var(--color-muted)'}; nav.children.push(item); });
  const button=makeNode('button'); button.content='Start a project'; button.name='Navbar CTA'; button.bemBlock='site-header'; button.bemElement='cta';
  inner.children=[logo,nav,button]; section.children=[inner]; return section;
}
function makeHero(){ return regenerate(starter[0]); }
function makeFeatures(){
  const section=makeNode('section'); section.name='Features Section'; section.styles.base={width:'100%',paddingTop:'88px',paddingRight:'40px',paddingBottom:'88px',paddingLeft:'40px',display:'flex',direction:'column',align:'center',gap:'40px',background:'var(--color-surface)'};
  const inner=makeNode('container'); inner.name='Features Content'; inner.styles.base={width:'100%',maxWidth:'1120px',display:'flex',direction:'column',gap:'32px'};
  const title=makeNode('heading'); title.tag='h2'; title.content='Diseña con un sistema, no desde cero.'; title.styles.base={fontSize:'var(--font-h2)',fontWeight:700,lineHeight:1.1,maxWidth:'700px',color:'var(--color-text)'};
  const grid=makeNode('container'); grid.name='Feature Grid'; grid.styles.base={width:'100%',display:'grid',gridColumns:3,gap:'20px'}; grid.styles.tablet={gridColumns:1};
  ['Auto Layout visual','Tokens globales','Salida Astro limpia'].forEach((label,i)=>{ const card=makeNode('card'); card.name=`Feature ${i+1}`; card.styles.base={minHeight:'240px',paddingTop:'28px',paddingRight:'28px',paddingBottom:'28px',paddingLeft:'28px',display:'flex',direction:'column',justify:'space-between',gap:'20px',background:i===1?'var(--color-primary)':'var(--color-background)',color:i===1?'#ffffff':'var(--color-text)',borderRadius:'var(--radius-lg)'}; const n=makeNode('text'); n.content=`0${i+1}`; n.styles.base={fontSize:'13px',fontWeight:700,color:'inherit'}; const h=makeNode('heading'); h.tag='h3'; h.content=label; h.styles.base={fontSize:'30px',fontWeight:700,lineHeight:1.15,color:'inherit'}; card.children=[n,h]; grid.children.push(card); });
  inner.children=[title,grid]; section.children=[inner]; return section;
}
function makeCta(){
  const section=makeNode('section'); section.name='CTA Section'; section.styles.base={width:'100%',paddingTop:'96px',paddingRight:'40px',paddingBottom:'96px',paddingLeft:'40px',display:'flex',direction:'column',align:'center',background:'var(--color-primary)',color:'#ffffff'};
  const inner=makeNode('container'); inner.name='CTA Content'; inner.styles.base={width:'100%',maxWidth:'900px',display:'flex',direction:'column',align:'center',gap:'24px'};
  const h=makeNode('heading'); h.tag='h2'; h.content='Construye la siguiente web sin salir del canvas.'; h.styles.base={fontSize:'56px',fontWeight:700,lineHeight:1.05,textAlign:'center',color:'#ffffff'}; h.styles.mobile={fontSize:'38px'};
  const p=makeNode('text'); p.content='Componentes, responsive y tokens listos para exportar a Astro.'; p.styles.base={fontSize:'19px',lineHeight:1.5,textAlign:'center',color:'rgba(255,255,255,.72)',maxWidth:'620px'};
  const b=makeNode('button'); b.content='Exportar proyecto'; b.styles.base={background:'var(--color-accent)',color:'#ffffff',fontSize:'15px',fontWeight:700,paddingTop:'16px',paddingRight:'24px',paddingBottom:'16px',paddingLeft:'24px',borderRadius:'var(--radius-pill)'};
  inner.children=[h,p,b]; section.children=[inner]; return section;
}
function styleString(s){
  const map={
    width:cssValue(s.width),maxWidth:cssValue(s.maxWidth),minWidth:cssValue(s.minWidth),height:cssValue(s.height),maxHeight:cssValue(s.maxHeight),minHeight:cssValue(s.minHeight),aspectRatio:s.aspectRatio,boxSizing:s.boxSizing,
    paddingTop:cssValue(s.paddingTop),paddingRight:cssValue(s.paddingRight),paddingBottom:cssValue(s.paddingBottom),paddingLeft:cssValue(s.paddingLeft),
    marginTop:cssValue(s.marginTop),marginRight:cssValue(s.marginRight),marginBottom:cssValue(s.marginBottom),marginLeft:cssValue(s.marginLeft),
    gap:cssValue(s.gap),columnGap:cssValue(s.columnGap),rowGap:cssValue(s.rowGap),display:s.display,flexDirection:s.direction,flexWrap:s.flexWrap,
    justifyContent:s.justifyContent||s.justify,alignItems:s.alignItems||s.align,justifyItems:s.justifyItems,alignContent:s.alignContent,
    gridTemplateColumns:['grid','inline-grid'].includes(s.display)?(s.gridTemplateColumns||(Array.isArray(s.gridColumnTracks)&&s.gridColumnTracks.length?s.gridColumnTracks.join(' '):`repeat(${s.gridColumns||1},${s.gridUseMinMax?'minmax(0,1fr)':'1fr'})`)):undefined,
    gridTemplateRows:['grid','inline-grid'].includes(s.display)?(s.gridTemplateRows||((Number(s.gridRows)>0)?(Array.isArray(s.gridRowTracks)&&s.gridRowTracks.length?s.gridRowTracks.join(' '):`repeat(${s.gridRows},1fr)`):undefined)):undefined,
    gridTemplateAreas:s.gridTemplateAreas,gridArea:s.gridArea,gridColumn:s.gridColumn,gridRow:s.gridRow,gridAutoColumns:s.gridAutoColumns,gridAutoRows:s.gridAutoRows,gridAutoFlow:s.gridAutoFlow,order:s.order,verticalAlign:s.verticalAlign,alignSelf:s.alignSelf,justifySelf:s.justifySelf,flexGrow:s.flexGrow,flexShrink:s.flexShrink,flexBasis:cssValue(s.flexBasis),position:s.position,zIndex:s.zIndex,left:cssValue(s.left),top:cssValue(s.top),right:cssValue(s.right),bottom:cssValue(s.bottom),transform:s.transform,transition:s.transition,cursor:s.cursor,pointerEvents:s.pointerEvents,
    background:s.background,color:s.color,fontFamily:s.fontFamily,fontSize:cssValue(s.fontSize),fontWeight:s.fontWeight,lineHeight:s.lineHeight,
    letterSpacing:cssValue(s.letterSpacing),textAlign:s.textAlign,fontStyle:s.fontStyle,textTransform:s.textTransform,textDecoration:s.textDecoration,
    textShadow:s.textShadow,fontVariationSettings:s.fontVariationSettings,whiteSpace:s.whiteSpace,textWrap:s.textWrap,borderRadius:cssValue(s.borderRadius),borderWidth:cssValue(s.borderWidth),
    borderStyle:s.borderWidth?'solid':undefined,borderColor:s.borderColor,opacity:s.opacity,boxShadow:s.boxShadow,objectFit:s.objectFit,overflow:s.overflow
  };
  return Object.entries(map).filter(([,v])=>v!==undefined&&v!==''&&v!==null).map(([k,v])=>`${k.replace(/[A-Z]/g,m=>'-'+m.toLowerCase())}:${v}`).join(';');
}
function directEditOverlay(node){
  if(!state.directEditEnabled)return '';
  const s=effective(node);
  const values={
    paddingTop:Math.max(0,toNumber(s.paddingTop,0)),paddingRight:Math.max(0,toNumber(s.paddingRight,0)),
    paddingBottom:Math.max(0,toNumber(s.paddingBottom,0)),paddingLeft:Math.max(0,toNumber(s.paddingLeft,0))
  };
  const label=prop=>Math.round(values[prop]);
  return `<span class="direct-edit-overlay" aria-hidden="true">
    <span class="direct-padding-band direct-padding-top" style="height:${values.paddingTop}px"></span>
    <span class="direct-padding-band direct-padding-right" style="width:${values.paddingRight}px"></span>
    <span class="direct-padding-band direct-padding-bottom" style="height:${values.paddingBottom}px"></span>
    <span class="direct-padding-band direct-padding-left" style="width:${values.paddingLeft}px"></span>
    <span class="direct-padding-handle direct-padding-handle-top" data-direct-prop="paddingTop" data-direct-axis="y" data-direct-sign="-1" style="top:${Math.max(4,values.paddingTop/2)}px" title="Arrastra para cambiar padding top"><i></i><b>${label('paddingTop')}</b></span>
    <span class="direct-padding-handle direct-padding-handle-right" data-direct-prop="paddingRight" data-direct-axis="x" data-direct-sign="1" style="right:${Math.max(4,values.paddingRight/2)}px" title="Arrastra para cambiar padding right"><i></i><b>${label('paddingRight')}</b></span>
    <span class="direct-padding-handle direct-padding-handle-bottom" data-direct-prop="paddingBottom" data-direct-axis="y" data-direct-sign="1" style="bottom:${Math.max(4,values.paddingBottom/2)}px" title="Arrastra para cambiar padding bottom"><i></i><b>${label('paddingBottom')}</b></span>
    <span class="direct-padding-handle direct-padding-handle-left" data-direct-prop="paddingLeft" data-direct-axis="x" data-direct-sign="-1" style="left:${Math.max(4,values.paddingLeft/2)}px" title="Arrastra para cambiar padding left"><i></i><b>${label('paddingLeft')}</b></span>
  </span>`;
}
function selectionUi(node){
  if(state.previewMode||state.selectedId!==node.id||node.locked)return '';
  return `<span class="selection-ui" aria-hidden="true"><span class="selection-label"><span class="drag-handle" draggable="true" data-drag-node="${node.id}">⠿</span>${escapeHtml(node.name)}</span><span class="size-badge" data-size-badge>0 × 0</span><span class="resize-handle" data-resize="e"></span><span class="resize-handle" data-resize="s"></span><span class="resize-handle" data-resize="se"></span>${directEditOverlay(node)}</span>`;
}
function renderNode(node){
  const styles=[styleString(effective(node)),String(node.customCss||'').trim()].filter(Boolean).join(';');
  const selectedClass=!state.previewMode&&isSelectedId(node.id)?(state.selectedId===node.id?' is-selected is-primary-selected':' is-selected is-multi-selected'):'';
  const semantic=semanticTag(node);
  const componentClass=node.componentRef?` is-component ${node.componentSource==='master'?'is-component-master':'is-component-instance'}`:'';
  const hiddenClass=node.hidden?' is-layer-hidden':'';
  const lockedClass=node.locked?' is-layer-locked':'';
  const cls=`canvas-element canvas-${node.type}${selectedClass}${componentClass}${hiddenClass}${lockedClass} ${classAttribute(node)}`;
  const children=(node.children||[]).map(renderNode).join('');
  const empty=accepts(node)&&!(node.children||[]).length&&!state.previewMode?'<div class="empty-drop">＋ Arrastra elementos aquí</div>':'';
  const aria=node.ariaLabel?` aria-label="${escapeHtml(node.ariaLabel)}"`:'';
  const data=`data-id="${node.id}" data-orbit-name="${escapeHtml(node.name||node.type)}" ${accepts(node)?'data-accepts="true"':''} ${node.locked?'data-locked="true"':''}`;
  const ui=selectionUi(node);
  if(['section','container','grid','block','div','card','gallery','form','list','statCard','testimonial','pricingCard','faqItem'].includes(node.type))return `<${semantic} ${data}${aria} class="${cls}" style="${styles}">${ui}${children}${empty}</${semantic}>`;
  if(node.type==='heading')return `<${semantic} ${data}${aria} class="${cls}" style="${styles}">${ui}<span class="editable-content" data-editable="${node.id}">${escapeHtml(node.content)}</span></${semantic}>`;
  if(['text','richtext','badge','quote'].includes(node.type))return `<${semantic} ${data}${aria} class="${cls}" style="${styles}">${ui}<span class="editable-content" data-editable="${node.id}">${escapeHtml(node.content).split('\n').join('<br>')}</span></${semantic}>`;
  if(node.type==='link')return `<a ${data}${aria}${state.previewMode?` href="${escapeHtml(node.href||'#')}"`:''} class="${cls}" style="${styles}">${ui}<span class="editable-content" data-editable="${node.id}">${escapeHtml(node.content)}</span></a>`;
  if(node.type==='icon')return `<${semantic} ${data}${aria} class="${cls}" style="${styles}">${ui}<span class="editable-content" data-editable="${node.id}">${escapeHtml(node.content)}</span></${semantic}>`;
  if(node.type==='svg'){ const svgMarkup=sanitizeSvgMarkup(node.svgCode||''); return `<${semantic} ${data}${aria} class="${cls} svg-element" style="${styles}">${ui}<span class="svg-render" contenteditable="false">${svgMarkup||`<span class="svg-placeholder">${escapeHtml(node.content||'SVG')}</span>`}</span></${semantic}>`; }
  if(node.type==='button'){
    const attrs=semantic==='a'?(state.previewMode?` href="${escapeHtml(node.href||'#')}"`:''):' type="button"';
    return `<${semantic} ${data}${aria}${attrs} class="${cls}" style="${styles}">${ui}<span class="editable-content" data-editable="${node.id}">${escapeHtml(node.content)}</span></${semantic}>`;
  }
  if(node.type==='image'){
    const wrapper=semantic==='figure'?'figure':'div';
    const caption=semantic==='figure'&&node.caption?`<figcaption>${escapeHtml(node.caption)}</figcaption>`:'';
    return `<${wrapper} ${data}${aria} class="${cls}" style="width:${cssValue(effective(node).width)||'auto'};max-width:${cssValue(effective(node).maxWidth)||'none'}">${ui}<img src="${escapeHtml(node.src)}" alt="${escapeHtml(node.alt||'')}" style="${styles};width:100%">${caption}</${wrapper}>`;
  }
  if(node.type==='video'){
    const src=escapeHtml(node.src||'');
    return `<div ${data}${aria} class="${cls}" style="${styles}">${ui}<iframe src="${src}" title="${escapeHtml(node.title||'Video embed')}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen style="width:100%;height:100%;border:0;display:block;border-radius:inherit"></iframe></div>`;
  }
  if(node.type==='input')return `<input ${data}${aria} class="${cls}" style="${styles}" type="${escapeHtml(node.inputType||'text')}" placeholder="${escapeHtml(node.placeholder||'')}" ${state.previewMode?'':'readonly'}>`;
  if(node.type==='textareaField')return `<textarea ${data}${aria} class="${cls}" style="${styles}" rows="${Number(node.rows||5)}" placeholder="${escapeHtml(node.placeholder||'')}" ${state.previewMode?'':'readonly'}></textarea>`;
  if(node.type==='selectField'){
    const options=String(node.content||'').split('\n').filter(Boolean);
    return `<select ${data}${aria} class="${cls}" style="${styles}" ${state.previewMode?'':'disabled'}>${options.map(option=>`<option>${escapeHtml(option)}</option>`).join('')}</select>`;
  }
  if(node.type==='divider')return semantic==='hr'?`<hr ${data}${aria} class="${cls}" style="${styles}">`:`<${semantic} ${data}${aria} class="${cls}" style="${styles}">${ui}</${semantic}>`;
  if(node.type==='spacer')return `<${semantic} ${data}${aria} class="${cls}" style="${styles}">${ui}${state.previewMode?'':`<span class="spacer-size">${escapeHtml(cssValue(effective(node).height)||'0px')}</span>`}</${semantic}>`;
  return `<${semantic} ${data}${aria} class="${cls}" style="${styles}">${ui}</${semantic}>`;
}

function renderRulers(){ measurementTools?.renderRulers(); }
function renderCustomGuides(){
  if(!els.smartGuides||!state.rulers||!state.guidesVisible)return '';
  return (state.customGuides||[]).map(guide=>{
    const position=measurementTools?.designToStage(guide.position)??(24+guide.position*state.zoom);
    const locked=state.guidesLocked?' is-locked':'';
    const line=guide.orientation==='vertical'
      ? `<button class="manual-guide vertical${locked}" data-guide-id="${guide.id}" style="left:${position}px;top:${measurementTools?.rulerOffset?.()||24}px;height:calc(100% - ${measurementTools?.rulerOffset?.()||24}px)" title="Guía vertical · ${Math.round(guide.position)} px"></button>`
      : `<button class="manual-guide horizontal${locked}" data-guide-id="${guide.id}" style="top:${position}px;left:${measurementTools?.rulerOffset?.()||24}px;width:calc(100% - ${measurementTools?.rulerOffset?.()||24}px)" title="Guía horizontal · ${Math.round(guide.position)} px"></button>`;
    const label=guideDrag?.id===guide.id?`<span class="guide-position-label" style="${guide.orientation==='vertical'?`left:${position}px;top:${(measurementTools?.rulerOffset?.()||24)+18}px`:`left:${(measurementTools?.rulerOffset?.()||24)+42}px;top:${position}px`}">${Math.round(guide.position)} px</span>`:'';
    return `${line}${label}`;
  }).join('');
}
let guideDrag=null;
function guidePointFromEvent(event,orientation){
  return measurementTools?.eventToDesign(event,orientation)??0;
}
function startGuideDrag(event,orientation,guideId=null){
  if(!state.rulers||!state.guidesVisible||state.guidesLocked)return;
  event.preventDefault(); event.stopPropagation();
  const id=guideId||uid('guide');
  const position=guidePointFromEvent(event,orientation);
  if(!guideId)state.customGuides=[...(state.customGuides||[]),{id,orientation,position}];
  else state.customGuides=(state.customGuides||[]).map(item=>item.id===guideId?{...item,position}:item);
  guideDrag={id,orientation};
  renderSmartGuides(); renderRulers(); markUnsaved();
}
function moveGuideDrag(event){
  if(!guideDrag)return;
  const position=guidePointFromEvent(event,guideDrag.orientation);
  state.customGuides=(state.customGuides||[]).map(item=>item.id===guideDrag.id?{...item,position}:item);
  renderSmartGuides();
}
function endGuideDrag(event){
  if(!guideDrag)return;
  const rect=els.stage.getBoundingClientRect();
  const outside=event && (event.clientX<rect.left+6 || event.clientY<rect.top+6 || event.clientX>rect.right+6 || event.clientY>rect.bottom+6);
  if(outside)state.customGuides=(state.customGuides||[]).filter(item=>item.id!==guideDrag.id);
  guideDrag=null;
  renderSmartGuides(); markUnsaved();
}
function updateCanvasGeometry(){ viewportEngine?.updateGeometry(); }
function selectionBounds(){
  const elements=selectedIds().map(id=>els.canvas.querySelector(`[data-id="${CSS.escape(id)}"]`)).filter(Boolean);if(!elements.length)return null;
  const rects=elements.map(el=>el.getBoundingClientRect());const stage=els.stage.getBoundingClientRect();
  const left=Math.min(...rects.map(r=>r.left))-stage.left,top=Math.min(...rects.map(r=>r.top))-stage.top,right=Math.max(...rects.map(r=>r.right))-stage.left,bottom=Math.max(...rects.map(r=>r.bottom))-stage.top;
  return {left,top,right,bottom,width:right-left,height:bottom-top};
}
let contextualChromeFrame=0;
function selectedViewportBounds(){
  const nodes=selectedIds().map(id=>els.canvas.querySelector(`[data-id="${CSS.escape(id)}"]`)).filter(Boolean);
  if(!nodes.length)return null;
  const rects=nodes.map(node=>node.getBoundingClientRect()).filter(rect=>rect.width>0&&rect.height>0);
  if(!rects.length)return null;
  const left=Math.min(...rects.map(rect=>rect.left)),top=Math.min(...rects.map(rect=>rect.top));
  const right=Math.max(...rects.map(rect=>rect.right)),bottom=Math.max(...rects.map(rect=>rect.bottom));
  return {left,top,right,bottom,width:right-left,height:bottom-top};
}
function positionCanvasInfoDock(){
  const dock=els.canvasInfoDock;if(!dock||state.projectDashboardOpen)return;
  const visible=viewportEngine?.visibleWorkspaceRect?.()||els.workspace?.getBoundingClientRect();if(!visible)return;
  const edge=12;
  const quickAdd=document.getElementById('quick-add');
  const quickRect=quickAdd&&!quickAdd.hidden&&getComputedStyle(quickAdd).display!=='none'?quickAdd.getBoundingClientRect():null;
  const safeRight=quickRect&&quickRect.left<visible.right&&quickRect.bottom>window.innerHeight-80?Math.min(visible.right-edge,quickRect.left-edge):visible.right-edge;
  const available=Math.max(320,safeRight-visible.left-edge);
  const width=Math.max(320,Math.min(720,available));
  const left=clamp(visible.left+(visible.width-width)/2,visible.left+edge,Math.max(visible.left+edge,safeRight-width));
  dock.style.setProperty('--canvas-info-left',`${Math.round(left)}px`);
  dock.style.setProperty('--canvas-info-width',`${Math.round(width)}px`);
}
function positionSelectionToolbar(){
  const toolbar=els.multiToolbar;
  if(!toolbar||toolbar.hidden||!selectedIds().length)return;
  const visible=viewportEngine?.visibleWorkspaceRect?.()||els.workspace?.getBoundingClientRect();
  const bounds=selectedViewportBounds();
  if(!visible||!bounds)return;
  toolbar.style.setProperty('--selection-toolbar-max-width',`${Math.max(320,visible.width-20)}px`);
  const toolbarRect=toolbar.getBoundingClientRect();
  const width=Math.min(toolbarRect.width,Math.max(1,visible.width-24));
  const height=toolbarRect.height;
  const gap=12,edge=10;
  const visibleLeft=visible.left+edge,visibleRight=visible.right-edge,visibleTop=visible.top+edge,visibleBottom=visible.bottom-edge;
  const anchorLeft=Math.max(bounds.left,visibleLeft),anchorRight=Math.min(bounds.right,visibleRight);
  const anchorTop=Math.max(bounds.top,visibleTop),anchorBottom=Math.min(bounds.bottom,visibleBottom);
  const anchorCenterX=anchorRight>=anchorLeft?(anchorLeft+anchorRight)/2:visible.left+visible.width/2;
  const anchorCenterY=anchorBottom>=anchorTop?(anchorTop+anchorBottom)/2:visible.top+visible.height/2;
  let placement='top';
  let left=anchorCenterX-width/2;
  let top=bounds.top-height-gap;
  if(top<visibleTop){
    if(bounds.right+gap+width<=visibleRight){placement='right';left=bounds.right+gap;top=anchorCenterY-height/2;}
    else if(bounds.left-gap-width>=visibleLeft){placement='left';left=bounds.left-gap-width;top=anchorCenterY-height/2;}
    else if(bounds.bottom+gap+height<=visibleBottom){placement='bottom';left=anchorCenterX-width/2;top=bounds.bottom+gap;}
    else{placement='inside';left=anchorCenterX-width/2;top=visibleTop;}
  }
  left=clamp(left,visibleLeft,Math.max(visibleLeft,visibleRight-width));
  top=clamp(top,visibleTop,Math.max(visibleTop,visibleBottom-height));
  toolbar.dataset.placement=placement;
  toolbar.style.setProperty('--selection-toolbar-left',`${Math.round(left)}px`);
  toolbar.style.setProperty('--selection-toolbar-top',`${Math.round(top)}px`);
  toolbar.style.visibility='visible';
}
function scheduleContextualChrome(){
  if(contextualChromeFrame)cancelAnimationFrame(contextualChromeFrame);
  contextualChromeFrame=requestAnimationFrame(()=>{
    contextualChromeFrame=0;
    positionCanvasInfoDock();
    positionSelectionToolbar();
  });
}
function renderAltMeasurements(){
  if(!state.guidesVisible||!state.measureMode||!state.selectedId)return '';
  const selectedEl=els.canvas.querySelector(`[data-id="${CSS.escape(state.selectedId)}"]`);if(!selectedEl)return '';
  const parentEl=selectedEl.parentElement?.closest?.('[data-id]')||els.canvas;
  const stageRect=els.stage.getBoundingClientRect(),rect=selectedEl.getBoundingClientRect(),parentRect=parentEl.getBoundingClientRect();
  const sx=rect.left-stageRect.left,sy=rect.top-stageRect.top,px=parentRect.left-stageRect.left,py=parentRect.top-stageRect.top;
  const left=Math.max(0,(rect.left-parentRect.left)/state.zoom),right=Math.max(0,(parentRect.right-rect.right)/state.zoom),top=Math.max(0,(rect.top-parentRect.top)/state.zoom),bottom=Math.max(0,(parentRect.bottom-rect.bottom)/state.zoom);
  const line=(kind,leftPx,topPx,length,label)=>length>2?`<span class="alt-measure-line ${kind}" style="left:${leftPx}px;top:${topPx}px;${kind.includes('horizontal')?`width:${length}px`:`height:${length}px`}"><b>${Math.round(label)} px</b></span>`:'';
  return `<span class="alt-measure-layer">${line('horizontal left',px,sy+rect.height/2,Math.max(0,rect.left-parentRect.left),left)}${line('horizontal right',sx+rect.width,sy+rect.height/2,Math.max(0,parentRect.right-rect.right),right)}${line('vertical top',sx+rect.width/2,py,Math.max(0,rect.top-parentRect.top),top)}${line('vertical bottom',sx+rect.width/2,sy+rect.height,Math.max(0,parentRect.bottom-rect.bottom),bottom)}</span>`;
}
function renderSmartGuides(){
  if(!els.smartGuides)return;
  if(!state.guidesVisible||((!state.guides&&!state.measureMode)||state.previewMode)){els.smartGuides.innerHTML='';els.smartGuides.hidden=true;return;}
  const stageRect=els.stage.getBoundingClientRect();const canvasRect=els.canvas.getBoundingClientRect();
  const canvasLeft=canvasRect.left-stageRect.left,canvasTop=canvasRect.top-stageRect.top;
  const custom=state.guides?renderCustomGuides():'';
  const measures=renderAltMeasurements();
  if(!selectedIds().length){els.smartGuides.hidden=false;els.smartGuides.innerHTML=`${custom}${measures}`;return;}
  const bounds=selectionBounds();if(!bounds){els.smartGuides.hidden=false;els.smartGuides.innerHTML=`${custom}${measures}`;return;}
  const centerX=bounds.left+bounds.width/2,centerY=bounds.top+bounds.height/2;
  const smart=state.guides?`<span class="smart-guide vertical" style="left:${centerX}px;top:${canvasTop}px;height:${canvasRect.height}px"></span><span class="smart-guide horizontal" style="top:${centerY}px;left:${canvasLeft}px;width:${canvasRect.width}px"></span><span class="selection-bounds" style="left:${bounds.left}px;top:${bounds.top}px;width:${bounds.width}px;height:${bounds.height}px"></span><span class="measure-badge measure-x" style="left:${bounds.left+bounds.width/2}px;top:${Math.max(0,bounds.top-18)}px">${Math.round(bounds.width/state.zoom)} px</span><span class="measure-badge measure-y" style="left:${Math.max(0,bounds.left-42)}px;top:${bounds.top+bounds.height/2}px">${Math.round(bounds.height/state.zoom)} px</span>`:'';
  els.smartGuides.hidden=false;
  els.smartGuides.innerHTML=`${custom}${smart}${measures}`;
}
function renderMultiToolbar(){
  if(!els.multiToolbar)return;const count=selectedIds().length;
  const contextToolbar=document.getElementById('contextual-toolbar');
  const contextDock=document.getElementById('canvas-info-dock');
  const globalActions=document.getElementById('context-global-actions');
  const centerSelection=document.getElementById('center-selection');
  const contextLabel=document.getElementById('context-mode-label');
  const contextIcon=contextDock?.querySelector('.contextual-mode-icon');
  const hasSelection=count>0&&!state.previewMode;
  if(contextToolbar)contextToolbar.dataset.contextMode=hasSelection?'selection':'global';
  if(contextDock)contextDock.dataset.contextMode=hasSelection?'selection':'global';
  if(globalActions)globalActions.hidden=hasSelection;
  if(centerSelection)centerSelection.hidden=!hasSelection;
  if(contextLabel)contextLabel.textContent=count>1?'Selección múltiple':hasSelection?'Elemento':'Página';
  if(contextIcon)contextIcon.textContent=count>1?'▦':hasSelection?'◆':'◇';
  if(!hasSelection){els.multiToolbar.hidden=true;els.multiToolbar.innerHTML='';els.multiToolbar.style.visibility='';scheduleContextualChrome();return;}
  els.multiToolbar.hidden=false;
  els.multiToolbar.style.visibility='hidden';
  els.multiToolbar.classList.toggle('single-context',count===1);
  els.multiToolbar.classList.toggle('multi-context',count>1);
  if(count===1){
    const node=selected();const meta=elementMeta(node?.type)||{label:node?.type||'Elemento'};const s=effective(node);const display=s.display||'block';const gap=Math.max(0,toNumber(s.gap,0));
    const textContext=['heading','text','richtext','link','button','badge','quote','input','textareaField','selectField'].includes(node?.type);
    els.multiToolbar.classList.toggle('is-text-context',textContext);
    const typographyTools=(()=>{
      if(!textContext)return '';
      const lengthValue=value=>/^-?(?:\d+|\d*\.\d+)(?:px|rem|em|pt|%)$/i.test(String(value||'').trim());
      const fontCurrent=String(s.fontFamily||'inherit');
      const fontTokens=Object.entries(state.tokens.typography||{}).filter(([,item])=>!lengthValue(item.value)).map(([key,item])=>[tokenRef('typography',key),item.name]);
      const fontChoices=[['inherit','Heredada'],['"Geist", sans-serif','Geist'],['"Inter", sans-serif','Inter'],['Georgia, serif','Georgia'],['"Times New Roman", serif','Times New Roman'],['ui-monospace, SFMono-Regular, monospace','Monoespaciada']];
      if(![...fontTokens,...fontChoices].some(([value])=>value===fontCurrent))fontChoices.unshift([fontCurrent,'Fuente actual']);
      const option=(value,label)=>`<option value="${escapeHtml(value)}" ${value===fontCurrent?'selected':''}>${escapeHtml(label)}</option>`;
      const fontOptions=`${fontTokens.length?`<optgroup label="Variables del proyecto">${fontTokens.map(([value,label])=>option(value,label)).join('')}</optgroup>`:''}<optgroup label="Fuentes">${fontChoices.map(([value,label])=>option(value,label)).join('')}</optgroup>`;
      const sizeCurrent=typeof s.fontSize==='number'?`${s.fontSize}px`:String(s.fontSize||'16px');
      const sizeTokens=Object.entries(state.tokens.typography||{}).filter(([,item])=>lengthValue(item.value)).map(([key,item])=>[tokenRef('typography',key),`${item.name} · ${item.value}`]);
      const sizeChoices=['12px','14px','16px','18px','20px','24px','32px','40px','48px','64px','80px'].map(value=>[value,value]);
      if(![...sizeTokens,...sizeChoices].some(([value])=>value===sizeCurrent))sizeChoices.unshift([sizeCurrent,`${sizeCurrent} · Actual`]);
      const sizeOption=(value,label)=>`<option value="${escapeHtml(value)}" ${value===sizeCurrent?'selected':''}>${escapeHtml(label)}</option>`;
      const sizeOptions=`<optgroup label="Variables del proyecto">${sizeTokens.map(([value,label])=>sizeOption(value,label)).join('')}</optgroup><optgroup label="Tamaños fijos">${sizeChoices.map(([value,label])=>sizeOption(value,label)).join('')}</optgroup>`;
      const bold=Number(s.fontWeight)>=600||['bold','bolder'].includes(String(s.fontWeight));
      const italic=String(s.fontStyle||'normal')==='italic';
      const color=normalizeColorValue(resolveToken(s.color)||s.color,'#151513');
      const colorTokens=Object.entries(state.tokens.colors||{}).map(([key,item])=>{const ref=tokenRef('colors',key);const value=normalizeColorValue(item.value,'#151513');return `<button type="button" class="context-color-token ${String(s.color)===ref?'is-active':''}" data-context-color-token="${escapeHtml(ref)}" aria-label="Usar variable ${escapeHtml(item.name)}" aria-pressed="${String(s.color)===ref}" style="--token-swatch:${escapeHtml(value)}"><i aria-hidden="true"></i><span>${escapeHtml(item.name)}</span></button>`;}).join('');
      const align=String(s.textAlign||'left');
      const alignButton=(value,label)=>`<button type="button" class="${align===value?'is-active':''}" data-context-text-align="${value}" aria-label="${label}" aria-pressed="${align===value}"><span class="context-align-glyph is-${value}"><i></i><i></i><i></i><i></i></span></button>`;
      return `<span class="context-type-tools" role="group" aria-label="Formato tipográfico"><select class="context-type-select context-font-select" data-context-text-font aria-label="Fuente o variable de fuente">${fontOptions}</select><select class="context-type-select context-size-select" data-context-text-size aria-label="Tamaño o variable tipográfica">${sizeOptions}</select><button type="button" class="context-type-button ${bold?'is-active':''}" data-context-text-toggle="bold" aria-label="Negrita" aria-pressed="${bold}">B</button><button type="button" class="context-type-button is-italic ${italic?'is-active':''}" data-context-text-toggle="italic" aria-label="Cursiva" aria-pressed="${italic}">I</button><span class="context-color-menu"><button type="button" class="context-color-trigger" data-context-color-menu aria-label="Abrir color del texto" aria-expanded="false"><span class="context-color-swatch" style="--context-text-color:${escapeHtml(color)}" aria-hidden="true"></span></button><span class="context-color-popover" data-context-color-popover role="dialog" aria-label="Color del texto" hidden><span class="context-color-head"><span><small>Color</small><strong>Texto</strong></span><button type="button" data-context-color-close aria-label="Cerrar selector de color">${uiIcon('close')}</button></span><span class="context-color-section"><small>Variables del proyecto</small><span class="context-color-token-grid">${colorTokens}</span></span><span class="context-color-section"><label class="context-color-custom">Personalizado <input type="color" value="${escapeHtml(color)}" data-context-text-color aria-label="Color personalizado"></label></span></span></span><span class="context-align-tools" role="group" aria-label="Alineación del texto">${alignButton('left','Alinear a la izquierda')}${alignButton('center','Centrar texto')}${alignButton('right','Alinear a la derecha')}${alignButton('justify','Justificar texto')}</span></span><span class="multi-divider"></span>`;
    })();
    const flexTools=String(display).includes('flex')?`<span class="context-layout-tools"><button data-context-direction="row" class="${(s.direction||'row')==='row'?'is-active':''}" data-tooltip="Dirección horizontal">↔</button><button data-context-direction="column" class="${s.direction==='column'?'is-active':''}" data-tooltip="Dirección vertical">↕</button><button data-context-gap="-4" data-tooltip="Reducir gap">−</button><b data-context-gap-value>${Math.round(gap)}</b><button data-context-gap="4" data-tooltip="Aumentar gap">＋</button></span><span class="multi-divider"></span>`:'';
    const gridTools=String(display).includes('grid')?`<span class="context-layout-tools"><button data-context-grid="-1" data-tooltip="Quitar columna">−</button><b>${Math.max(1,Number(s.gridColumns)||1)} col</b><button data-context-grid="1" data-tooltip="Añadir columna">＋</button><button data-context-gap="-4" data-tooltip="Reducir gap">−</button><b data-context-gap-value>${Math.round(gap)}</b><button data-context-gap="4" data-tooltip="Aumentar gap">＋</button></span><span class="multi-divider"></span>`:'';
    const directToggle=`<button data-direct-toggle class="${state.directEditEnabled?'is-active':''}" data-tooltip="${state.directEditEnabled?'Desactivar':'Activar'} edición directa" aria-label="${state.directEditEnabled?'Desactivar':'Activar'} edición directa" aria-pressed="${String(state.directEditEnabled)}">${uiIcon('sliders')}</button>`;
    const contextActions=textContext?`${directToggle}<button data-context-add data-tooltip="Insertar cerca" aria-label="Insertar cerca">${uiIcon('plus')}</button><button data-action="duplicate" data-tooltip="Duplicar (Ctrl/Cmd + D)" aria-label="Duplicar">${uiIcon('copy')}</button><button data-action="delete" class="danger" data-tooltip="Eliminar" aria-label="Eliminar">${uiIcon('trash')}</button>`:`${directToggle}<button data-context-add data-tooltip="Insertar cerca" aria-label="Insertar cerca">${uiIcon('plus')}</button><button data-action="up" data-tooltip="Subir en el orden" aria-label="Subir en el orden">${uiIcon('arrowUp')}</button><button data-action="down" data-tooltip="Bajar en el orden" aria-label="Bajar en el orden">${uiIcon('arrowDown')}</button><button data-action="duplicate" data-tooltip="Duplicar (Ctrl/Cmd + D)" aria-label="Duplicar">${uiIcon('copy')}</button><button data-create-component data-tooltip="Crear componente" aria-label="Crear componente">${uiIcon('component')}</button><button data-action="delete" class="danger" data-tooltip="Eliminar" aria-label="Eliminar">${uiIcon('trash')}</button>`;
    els.multiToolbar.innerHTML=`<span class="context-node"><i>${uiIcon(icons[node?.type]||'box')}</i><span><strong>${escapeHtml(node?.name||meta.label)}</strong><small>${escapeHtml(meta.label)}</small></span></span><span class="multi-divider"></span>${typographyTools}${flexTools}${gridTools}${contextActions}`;
  }else{
    els.multiToolbar.classList.remove('is-text-context');
    els.multiToolbar.innerHTML=`<strong>${count} seleccionados</strong><span class="multi-divider"></span><button data-multi="left" data-tooltip="Alinear izquierda" aria-label="Alinear izquierda">${uiIcon('alignLeft')}</button><button data-multi="center" data-tooltip="Centrar horizontalmente" aria-label="Centrar horizontalmente">${uiIcon('alignCenter')}</button><button data-multi="right" data-tooltip="Alinear derecha" aria-label="Alinear derecha">${uiIcon('alignRight')}</button><button data-multi="top" data-tooltip="Alinear arriba" aria-label="Alinear arriba">${uiIcon('alignTop')}</button><button data-multi="middle" data-tooltip="Centrar verticalmente" aria-label="Centrar verticalmente">${uiIcon('alignMiddle')}</button><button data-multi="bottom" data-tooltip="Alinear abajo" aria-label="Alinear abajo">${uiIcon('alignBottom')}</button><span class="multi-divider"></span><button data-multi="distribute-x" data-tooltip="Distribuir horizontalmente" aria-label="Distribuir horizontalmente">${uiIcon('distributeX')}</button><button data-multi="distribute-y" data-tooltip="Distribuir verticalmente" aria-label="Distribuir verticalmente">${uiIcon('distributeY')}</button><button data-multi="group" data-tooltip="Agrupar" aria-label="Agrupar">${uiIcon('component')}</button>`;
  }
  scheduleContextualChrome();
}
function renderCanvas(){
  syncGoogleFontsStylesheet();
  const width=state.canvasWidths[state.breakpoint];
  els.shell.style.width=`${width}px`;
  els.shell.style.transform=`scale(${state.zoom})`;
  els.canvas.setAttribute('style',tokenCss());
  els.canvas.classList.toggle('show-grid',state.grid);
  els.stage.classList.toggle('show-guides',state.guides&&state.guidesVisible);
  els.stage.classList.toggle('show-rulers',state.rulers);
  if(els.rulerX)els.rulerX.hidden=!state.rulers;if(els.rulerY)els.rulerY.hidden=!state.rulers;
  els.canvas.innerHTML=state.nodes.length?state.nodes.map(renderNode).join(''):`<div class="root-empty root-empty-pro"><span class="root-empty-icon">${uiIcon('layout')}</span><strong>Empieza tu página</strong><span>Inserta un elemento o usa una sección preparada. Orbit mantendrá la estructura semántica y la exportación Astro.</span><div class="root-empty-actions"><button type="button" data-empty-add>${uiIcon('plus')} Añadir elemento</button><button type="button" data-empty-section>${uiIcon('layout')} Añadir sección</button></div><small>Atajo: Shift + A</small></div>`;
  els.size.textContent=`${width} px · ${Math.round(state.zoom*100)}%`;
  els.width.value=width;
  els.zoomLabel.textContent=`${Math.round(state.zoom*100)}%`;
  updateCanvasGeometry();
  measurementTools?.scheduleRender();
  canvasNavigation?.render();
  scheduleContextualChrome();
}
function breakpointIsEnabled(bp){ return CORE_BREAKPOINTS.includes(bp)||state.breakpointEnabled?.[bp]!==false; }
function enabledBreakpoints(){ return BREAKPOINTS.filter(breakpointIsEnabled); }
function breakpointButton(bp,compact=false){
  const iconName={desktopXL:'monitor',desktop:'monitor',tablet:'tablet',mobileL:'tablet',mobile:'smartphone'};
  const node=selected();const has=node?Object.keys(node.styles?.[bp]||{}).length:0;
  const active=state.breakpoint===bp;
  const width=state.canvasWidths[bp]||'';
  return `<button type="button" data-bp="${bp}" class="${active?'active':''} ${compact?'is-secondary':''}" title="${breakpointLabels[bp]} · ${width} px" aria-label="${breakpointLabels[bp]}, ${width} píxeles"><span class="viewport-icon">${uiIcon(iconName[bp])}</span><span class="viewport-copy"><small>${breakpointLabels[bp]}</small><em>${width} px</em></span>${has?'<i class="override-indicator"></i>':''}</button>`;
}
function renderViewport(){
  els.viewport.innerHTML=enabledBreakpoints().map(bp=>breakpointButton(bp,SECONDARY_BREAKPOINTS.includes(bp))).join('');
  const label=document.getElementById('responsive-suite-label');
  if(label)label.textContent=breakpointLabels[state.breakpoint]||'Responsive';
}
function renderBreadcrumbs(){
  const path=state.selectedId?findPath(state.nodes,state.selectedId):[];
  els.breadcrumbs.innerHTML=path.length?path.map((node,index)=>`${index?'<i>/</i>':''}<button data-layer="${node.id}">${escapeHtml(node.name)}</button>`).join(''):'<span>Page</span>';
}
function uiIcon(name){
  const svg=body=>`<svg class="ui-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  const icons={
    alignLeft:svg('<path d="M4 22V2"></path><path d="M20 18H8"></path><path d="M16 6H8"></path>'),
    alignCenter:svg('<path d="M12 22V2"></path><path d="M20 16H4"></path><path d="M17 8H7"></path>'),
    alignRight:svg('<path d="M20 22V2"></path><path d="M4 18H16"></path><path d="M8 6H16"></path>'),
    alignTop:svg('<path d="M22 4H2"></path><path d="M18 20V8"></path><path d="M6 16V8"></path>'),
    alignMiddle:svg('<path d="M22 12H2"></path><path d="M16 20V4"></path><path d="M8 17V7"></path>'),
    alignBottom:svg('<path d="M22 20H2"></path><path d="M18 4V16"></path><path d="M6 8V16"></path>'),
    distributeX:svg('<path d="M4 22V2"></path><path d="M20 22V2"></path><path d="M12 17V7"></path>'),
    distributeY:svg('<path d="M22 4H2"></path><path d="M22 20H2"></path><path d="M17 12H7"></path>'),
    component:svg('<path d="m9 2 3 3-3 3-3-3 3-3Z"></path><path d="m19 8 3 3-3 3-3-3 3-3Z"></path><path d="m9 16 3 3-3 3-3-3 3-3Z"></path><path d="m5 9 3 3-3 3-3-3 3-3Z"></path>'),
    plus:svg('<path d="M12 5v14"></path><path d="M5 12h14"></path>'),
    sync:svg('<path d="M20 7h-6V1"></path><path d="m20 1-5 5a9 9 0 1 0 2 9"></path>'),
    trash:svg('<path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="m19 6-1 15H6L5 6"></path><path d="M10 11v5"></path><path d="M14 11v5"></path>'),
    detach:svg('<path d="m9 15-3 3a3 3 0 0 1-4-4l4-4a3 3 0 0 1 4 0"></path><path d="m15 9 3-3a3 3 0 1 1 4 4l-4 4a3 3 0 0 1-4 0"></path><path d="m8 16 8-8"></path>'),
    warning:svg('<path d="m21 19-9-16-9 16h18Z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path>'),
    keep:svg('<rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M7 8h10"></path><path d="M7 12h10"></path><path d="M7 16h6"></path>'),
    close:svg('<path d="m6 6 12 12"></path><path d="m18 6-12 12"></path>'),
    page:svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"></path><path d="M14 2v6h6"></path>'),
    home:svg('<path d="m3 11 9-8 9 8"></path><path d="M5 10v10h14V10"></path><path d="M9 20v-6h6v6"></path>'),
    copy:svg('<rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>'),
    edit:svg('<path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"></path>'),
    settings:svg('<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"></path><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1V21h-4v-.09a1.7 1.7 0 0 0-1.1-1.51 1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1-.4H3v-4h.09A1.7 1.7 0 0 0 4.6 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1V3h4v.09A1.7 1.7 0 0 0 15.5 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.15.37.35.7.6 1 .28.26.63.4 1 .4h.09v4H21a1.7 1.7 0 0 0-1.6.6Z"></path>'),
    tag:svg('<path d="M20 13 11 22l-9-9V4h9l9 9Z"></path><path d="M7 9h.01"></path>'),
    search:svg('<circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path>'),
    expand:svg('<path d="M15 3h6v6"></path><path d="m21 3-7 7"></path><path d="M9 21H3v-6"></path><path d="m3 21 7-7"></path>'),
    collapse:svg('<path d="m14 10 7-7"></path><path d="M15 3h6v6"></path><path d="m3 21 7-7"></path><path d="M3 15v6h6"></path>'),
    eye:svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"></path><circle cx="12" cy="12" r="3"></circle>'),
    eyeOff:svg('<path d="m3 3 18 18"></path><path d="M10.6 10.6A2 2 0 0 0 13.4 13.4"></path><path d="M9.9 4.2A10.4 10.4 0 0 1 12 4c6.5 0 10 8 10 8a18.6 18.6 0 0 1-2.4 3.4"></path><path d="M6.6 6.6C3.5 8.5 2 12 2 12s3.5 8 10 8a10.5 10.5 0 0 0 4.2-.9"></path>'),
    lock:svg('<rect x="4" y="10" width="16" height="11" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path>'),
    unlock:svg('<rect x="4" y="10" width="16" height="11" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 7.7-1.5"></path>'),
    grid:svg('<rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M3 9h18"></path><path d="M3 15h18"></path><path d="M9 3v18"></path><path d="M15 3v18"></path>'),
    flex:svg('<rect x="3" y="5" width="5" height="14" rx="1"></rect><rect x="10" y="5" width="5" height="14" rx="1"></rect><path d="M17 12h4"></path><path d="m19 10 2 2-2 2"></path>'),
    monitor:svg('<rect x="2" y="3" width="20" height="14" rx="2"></rect><path d="M8 21h8"></path><path d="M12 17v4"></path>'),
    tablet:svg('<rect x="5" y="2" width="14" height="20" rx="2"></rect><path d="M12 18h.01"></path>'),
    smartphone:svg('<rect x="7" y="2" width="10" height="20" rx="2"></rect><path d="M11 18h2"></path>'),
    layout:svg('<rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M3 9h18"></path><path d="M9 21V9"></path>'),
    box:svg('<rect x="3" y="3" width="18" height="18" rx="2"></rect>'),
    heading:svg('<path d="M6 4v16"></path><path d="M18 4v16"></path><path d="M6 12h12"></path>'),
    text:svg('<path d="M4 6h16"></path><path d="M4 10h16"></path><path d="M4 14h12"></path><path d="M4 18h8"></path>'),
    pointer:svg('<path d="m3 3 7.5 18 2.4-7.1L20 11.5 3 3Z"></path>'),
    image:svg('<rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><path d="m21 15-5-5L5 21"></path>'),
    card:svg('<rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M3 9h18"></path>'),
    minus:svg('<path d="M5 12h14"></path>'),
    spacer:svg('<path d="M12 3v18"></path><path d="m8 7 4-4 4 4"></path><path d="m8 17 4 4 4-4"></path>'),
    sectionFrame:svg('<rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M3 9h18"></path><path d="M7 13h4"></path>'),
    containerFrame:svg('<rect x="4" y="5" width="16" height="14" rx="2"></rect><path d="M8 9h8"></path><path d="M8 13h6"></path>'),
    gridMasonry:svg('<rect x="3" y="4" width="7" height="7" rx="1.5"></rect><rect x="14" y="4" width="7" height="16" rx="1.5"></rect><rect x="3" y="13" width="7" height="7" rx="1.5"></rect>'),
    panelTop:svg('<rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M3 9h18"></path>'),
    separatorHorizontal:svg('<path d="M4 12h16"></path><path d="M7 8v8"></path><path d="M17 8v8"></path>'),
    headingOne:svg('<path d="M6 4v16"></path><path d="M14 4v16"></path><path d="M6 12h8"></path><path d="M18 8h2v8"></path>'),
    textParagraph:svg('<path d="M4 7h16"></path><path d="M4 11h16"></path><path d="M4 15h12"></path><path d="M4 19h8"></path>'),
    richText:svg('<path d="M5 7h14"></path><path d="M5 11h9"></path><path d="M5 15h14"></path><path d="M5 19h7"></path><path d="M17 10v4"></path><path d="M15 12h4"></path>'),
    linkTwo:svg('<path d="M10 14 7 17a3 3 0 1 1-4-4l3-3"></path><path d="m14 10 3-3a3 3 0 1 1 4 4l-3 3"></path><path d="M8 16 16 8"></path>'),
    buttonCursor:svg('<rect x="4" y="6" width="16" height="12" rx="6"></rect><path d="m10 12 2 2 4-4"></path>'),
    badge:svg('<path d="M7 4h10l3 5-8 11L4 9l3-5Z"></path><path d="M9 9h6"></path>'),
    quote:svg('<path d="M9 9H5v6h4l-2 4"></path><path d="M19 9h-4v6h4l-2 4"></path>'),
    listBullets:svg('<circle cx="6" cy="7" r="1"></circle><circle cx="6" cy="12" r="1"></circle><circle cx="6" cy="17" r="1"></circle><path d="M10 7h10"></path><path d="M10 12h10"></path><path d="M10 17h10"></path>'),
    sparkleSymbol:svg('<path d="m12 3 1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3Z"></path><path d="m18.5 15 .8 2 .2.5.5.2 2 .8-2 .8-.5.2-.2.5-.8 2-.8-2-.2-.5-.5-.2-2-.8 2-.8.5-.2.2-.5.8-2Z"></path>'),
    imageFrame:svg('<rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="8" cy="8" r="1.6"></circle><path d="m21 15-4.5-4.5-4 4L10 12 5 17"></path>'),
    gallery:svg('<rect x="3" y="5" width="5" height="14" rx="1.5"></rect><rect x="10" y="5" width="5" height="14" rx="1.5"></rect><rect x="17" y="5" width="4" height="14" rx="1.5"></rect>'),
    videoFrame:svg('<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m10 9 5 3-5 3Z"></path>'),
    bezierSquare:svg('<path d="M6 18h12"></path><path d="M6 6h12"></path><circle cx="6" cy="6" r="1.5"></circle><circle cx="18" cy="6" r="1.5"></circle><circle cx="6" cy="18" r="1.5"></circle><circle cx="18" cy="18" r="1.5"></circle><path d="M6 18c4 0 8-4 12-12"></path>'),
    formLayout:svg('<rect x="4" y="3" width="16" height="18" rx="2"></rect><path d="M8 8h8"></path><path d="M8 12h8"></path><path d="M8 16h5"></path>'),
    textCursorInput:svg('<rect x="3" y="6" width="18" height="12" rx="2"></rect><path d="M12 9v6"></path><path d="M10.5 9h3"></path><path d="M10.5 15h3"></path>'),
    textBlock:svg('<rect x="4" y="5" width="16" height="14" rx="2"></rect><path d="M8 9h8"></path><path d="M8 13h8"></path><path d="M8 17h5"></path>'),
    chevronsSelect:svg('<rect x="3" y="6" width="18" height="12" rx="2"></rect><path d="m15 10 2 2 2-2"></path><path d="m15 14 2-2 2 2"></path>'),
    star:svg('<path d="m12 3 2.7 5.5 6 0.9-4.4 4.2 1 5.9L12 16.8 6.7 19.5l1-5.9L3.3 9.4l6-.9L12 3Z"></path>'),
    history:svg('<path d="M4 4v5h5"></path><path d="M20 11a8 8 0 1 0 2 5.3"></path><path d="M12 8v5l3 2"></path>'),
    plusCircle:svg('<circle cx="12" cy="12" r="9"></circle><path d="M12 8v8"></path><path d="M8 12h8"></path>'),
    sliders:svg('<path d="M4 21v-7"></path><path d="M4 10V3"></path><path d="M12 21v-9"></path><path d="M12 8V3"></path><path d="M20 21v-5"></path><path d="M20 12V3"></path><path d="M2 14h4"></path><path d="M10 8h4"></path><path d="M18 16h4"></path>'),
    chartUp:svg('<path d="M4 19h16"></path><path d="M7 15V9"></path><path d="M12 15V5"></path><path d="M17 15v-3"></path>'),
    chatQuote:svg('<path d="M5 6h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-4 3v-3H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"></path><path d="M9 11h1"></path><path d="M14 11h1"></path>'),
    receiptCard:svg('<rect x="5" y="3" width="14" height="18" rx="2"></rect><path d="M8 8h8"></path><path d="M8 12h8"></path><path d="M8 16h5"></path>'),
    accordion:svg('<rect x="4" y="5" width="16" height="14" rx="2"></rect><path d="M8 10h8"></path><path d="M12 14h4"></path><path d="m8 14 2 2 2-2"></path>'),
    sparkles:svg('<path d="m12 3-1.4 3.6L7 8l3.6 1.4L12 13l1.4-3.6L17 8l-3.6-1.4L12 3Z"></path><path d="m5 14-.8 2.2L2 17l2.2.8L5 20l.8-2.2L8 17l-2.2-.8L5 14Z"></path><path d="m19 14-.6 1.4L17 16l1.4.6L19 18l.6-1.4L21 16l-1.4-.6L19 14Z"></path>'),
    layers:svg('<path d="m12 2 9 5-9 5-9-5 9-5Z"></path><path d="m3 12 9 5 9-5"></path><path d="m3 17 9 5 9-5"></path>'),
    download:svg('<path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><path d="M5 21h14"></path>'),
    more:svg('<circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"></circle><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"></circle><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"></circle>'),
    arrowUp:svg('<path d="m18 15-6-6-6 6"></path>'),
    arrowDown:svg('<path d="m6 9 6 6 6-6"></path>'),
    arrowLeft:svg('<path d="m15 18-6-6 6-6"></path>'),
    arrowRight:svg('<path d="m9 6 6 6-6 6"></path>'),
    move:svg('<path d="M12 2v20"></path><path d="m8 6 4-4 4 4"></path><path d="m8 18 4 4 4-4"></path><path d="M2 12h20"></path><path d="m6 8-4 4 4 4"></path><path d="m18 8 4 4-4 4"></path>')
  };
  return icons[name]||icons.box;
}
function createBlankPage({name='Página sin título',slug='/'}={}){
  const id=uid('page');
  return {
    id,
    name,
    slug,
    nodes:[],
    meta:{language:'es',title:name,description:''}
  };
}
function ensureProjectPages(){
  if(!Array.isArray(state.pages)||!state.pages.length){
    state.pages=[{id:'page-home',name:'Home',slug:'/',nodes:clone(state.nodes),meta:clone(state.pageMeta)}];
    state.currentPageId='page-home';
  }
  if(!state.pages.some(page=>page.id===state.currentPageId))state.currentPageId=state.pages[0].id;
}
function currentPage(){ensureProjectPages();return state.pages.find(page=>page.id===state.currentPageId)||state.pages[0];}
function syncCurrentPageRecord(){
  ensureProjectPages();
  state.pages=state.pages.map(page=>page.id===state.currentPageId?{...page,nodes:clone(state.nodes),meta:clone(state.pageMeta)}:page);
}
function switchPage(pageId){
  if(pageId===state.currentPageId)return;
  syncCurrentPageRecord();
  const page=state.pages.find(item=>item.id===pageId);if(!page)return;
  state.currentPageId=page.id;state.nodes=hydrateNodes(clone(page.nodes||[]));state.pageMeta=clone(page.meta||{language:'es',title:page.name,description:''});
  state.selectedId=state.nodes[0]?.id||null;state.selectedIds=state.selectedId?[state.selectedId]:[];state.styleState='default';render();markUnsaved();
}
function addPage(){
  syncCurrentPageRecord();
  const id=uid('page'),number=state.pages.length+1,name=`Página ${number}`;
  const section=makeNode('section');section.name='Main content';section.htmlTag='main';section.bemBlock=`page-${number}`;section.styles.base={width:'100%',minHeight:'680px',paddingTop:'80px',paddingRight:'56px',paddingBottom:'80px',paddingLeft:'56px',display:'flex',direction:'column',gap:'24px',background:'var(--color-surface)'};
  state.pages.push({id,name,slug:`/page-${number}`,nodes:[section],meta:{language:'es',title:name,description:''}});switchPage(id);toast('Nueva página creada');
}
function addSystemPage(type='404'){
  syncCurrentPageRecord();if(state.pages.some(page=>page.systemType===type)){toast('La página del sistema ya existe');return;}
  const id=uid('page');const name=type==='404'?'404 · Página no encontrada':'Página del sistema';const section=makeNode('section');section.name='Error page';section.htmlTag='main';section.styles.base={width:'100%',minHeight:'100vh',paddingTop:'80px',paddingRight:'32px',paddingBottom:'80px',paddingLeft:'32px',display:'flex',direction:'column',justify:'center',align:'center',gap:'20px',background:'var(--color-background)'};const title=makeNode('heading');title.content='Página no encontrada';title.tag='h1';title.styles.base={fontSize:'48px',lineHeight:1.05,textAlign:'center'};const copy=makeNode('text');copy.content='La página que buscas no existe o fue movida.';copy.styles.base={fontSize:'18px',textAlign:'center',color:'var(--color-muted)'};section.children=[title,copy];const page={id,name,slug:'/404',systemType:type,status:'published',nodes:[section],meta:{language:'es',title:'Página no encontrada',description:'La página solicitada no existe',noIndex:true}};state.pages.push(page);switchPage(id);toast('Página 404 creada');
}
function togglePageStatus(pageId){const before=snapshot();state.pages=state.pages.map(page=>page.id===pageId?{...page,status:(page.status||'published')==='draft'?'published':'draft'}:page);pushHistory(before);markUnsaved();renderLeft();}
function duplicatePage(pageId){
  syncCurrentPageRecord();const source=state.pages.find(page=>page.id===pageId);if(!source)return;
  const id=uid('page');const copy={...clone(source),id,name:`${source.name} copy`,slug:`${String(source.slug||'/page').replace(/\/$/,'')}-copy`,nodes:hydrateNodes(clone(source.nodes||[])).map(regenerate)};
  state.pages.push(copy);switchPage(id);toast('Página duplicada');
}
function deletePage(pageId){
  ensureProjectPages();
  const page=state.pages.find(item=>item.id===pageId);if(!page)return;
  const isOnlyPage=state.pages.length===1;
  const isHome=page.slug==='/';
  const message=isOnlyPage
    ? `“${page.name}” es la única página. Orbit la reemplazará por una página vacía para mantener el proyecto válido. ¿Continuar?`
    : isHome
      ? `¿Eliminar la página de inicio “${page.name}”? La siguiente página se convertirá automáticamente en la nueva página de inicio (/).`
      : `¿Eliminar la página “${page.name}”?`;
  if(!confirm(message))return;
  const before=snapshot();
  if(isOnlyPage){
    const blank=createBlankPage();
    state.pages=[blank];
    state.currentPageId=blank.id;
    state.nodes=[];
    state.pageMeta=clone(blank.meta);
    state.selectedId=null;
    state.selectedIds=[];
    state.styleState='default';
    pushHistory(before);markUnsaved();render();toast('Página eliminada · se creó una página vacía');
    return;
  }
  state.pages=state.pages.filter(item=>item.id!==pageId);
  if(isHome&&state.pages.length){
    const promoted=state.pages[0];
    state.pages=state.pages.map(item=>item.id===promoted.id?{...item,slug:'/'}:item);
  }
  if(state.currentPageId===pageId){
    const next=state.pages[0];
    state.currentPageId=next.id;
    state.nodes=hydrateNodes(clone(next.nodes||[]));
    state.pageMeta=clone(next.meta||{});
    state.selectedId=state.nodes[0]?.id||null;
    state.selectedIds=state.selectedId?[state.selectedId]:[];
    state.styleState='default';
  }
  pushHistory(before);markUnsaved();render();
  toast(isHome?'Página eliminada · nueva página de inicio asignada':'Página eliminada');
}
function pageRouteLabel(page){return page.slug==='/'?'/':`/${String(page.slug||'').replace(/^\/+|\/+$/g,'')}`;}
function pageSeoIssueCount(meta=state.pageMeta||{}){
  let count=0;
  if(!String(meta.title||'').trim())count++;
  if(!String(meta.description||'').trim())count++;
  if(!String(meta.ogImage||'').trim())count++;
  return count;
}
function pageSeoScore(meta=state.pageMeta||{}){return Math.max(0,100-pageSeoIssueCount(meta)*25);}
function globalClassById(id){return (state.globalClasses||[]).find(item=>item.id===id);}
function globalClassUsage(id){let count=0;componentNodeSets().forEach(nodes=>(function walk(list){(list||[]).forEach(node=>{if((node.globalClassIds||[]).includes(id))count++;walk(node.children||[]);});})(nodes));return count;}
function primarySharedStyleClass(node){
  if(!node)return null;
  const ids=(node.globalClassIds||[]).filter(id=>globalClassById(id));
  const preferred=node.styleClassId&&ids.includes(node.styleClassId)?node.styleClassId:(ids.length===1?ids[0]:'');
  return preferred?globalClassById(preferred):null;
}
function setSharedStyleMode(mode,classId=''){
  const node=selected();if(!node)return;
  const ids=(node.globalClassIds||[]).filter(id=>globalClassById(id));
  const target=classId&&ids.includes(classId)?classId:(node.styleClassId&&ids.includes(node.styleClassId)?node.styleClassId:ids[0]);
  if(mode==='shared'&&!target){toast('Asigna primero una clase compartida','error');return;}
  commit(()=>{state.nodes=update(state.nodes,node.id,item=>({...item,styleClassId:target||item.styleClassId||'',styleEditMode:mode==='local'?'local':'shared'}));});
  toast(mode==='local'?'Editando solo este elemento':`Editando la clase .${globalClassById(target)?.name||''}`);
}
function setPrimarySharedStyleClass(classId){
  const node=selected();if(!node)return;
  const ids=(node.globalClassIds||[]).filter(id=>globalClassById(id));if(!ids.includes(classId))return;
  commit(()=>{state.nodes=update(state.nodes,node.id,item=>({...item,styleClassId:classId,styleEditMode:'shared'}));});
}
function sharedStyleBanner(node){
  const item=primarySharedStyleClass(node);if(!item)return '';
  const local=node.styleEditMode==='local';
  return `<div class="shared-style-banner"><div class="shared-style-banner-copy"><span>${uiIcon('tag')}</span><span><strong>.${escapeHtml(item.name)}</strong><small>${globalClassUsage(item.id)} elementos vinculados</small></span></div><div class="shared-style-mode" role="group" aria-label="Alcance de edición"><button type="button" data-shared-style-mode="shared" class="${local?'':'active'}" aria-pressed="${String(!local)}">Compartido</button><button type="button" data-shared-style-mode="local" class="${local?'active':''}" aria-pressed="${String(local)}">Solo este</button></div></div>`;
}
function createGlobalClassFromSelection(){
  const node=selected();if(!node){toast('Selecciona un elemento');return;}
  const name=sanitizeClass(prompt('Nombre de la clase global',`global-${slug(node.name)}`)||'');if(!name)return;
  if(state.globalClasses.some(item=>item.name===name)){toast('Ya existe una clase con ese nombre');return;}
  const before=snapshot();const id=uid('class');state.globalClasses.push({id,name,styles:clone(node.styles||{base:{}}),states:clone(node.states||{})});state.nodes=update(state.nodes,node.id,item=>({...item,styles:{base:{}},states:{},globalClassIds:[...(item.globalClassIds||[]),id],styleClassId:id,styleEditMode:'shared'}));pushHistory(before);markUnsaved();render();toast(`Clase .${name} creada y vinculada`);
}
function toggleGlobalClass(classId){
  const node=selected();if(!node)return;const before=snapshot();state.nodes=update(state.nodes,node.id,item=>{const ids=item.globalClassIds||[];const removing=ids.includes(classId);const nextIds=removing?ids.filter(id=>id!==classId):[...ids,classId];const nextPrimary=removing&&item.styleClassId===classId?(nextIds.length===1?nextIds[0]:''):item.styleClassId||(!removing&&nextIds.length===1?classId:'');return {...item,globalClassIds:nextIds,styleClassId:nextPrimary,styleEditMode:nextPrimary?(item.styleEditMode||'shared'):item.styleEditMode};});pushHistory(before);markUnsaved();render();
}
function deleteGlobalClass(classId){
  const item=globalClassById(classId);if(!item)return;if(!confirm(`¿Eliminar la clase global .${item.name}?`))return;
  const before=snapshot();state.globalClasses=state.globalClasses.filter(cls=>cls.id!==classId);state.nodes=mapNodes(state.nodes,node=>{const ids=(node.globalClassIds||[]).filter(id=>id!==classId);const wasPrimary=node.styleClassId===classId;return {...node,globalClassIds:ids,styleClassId:wasPrimary?(ids.length===1?ids[0]:''):node.styleClassId,styleEditMode:wasPrimary&&!ids.length?undefined:node.styleEditMode};});pushHistory(before);markUnsaved();render();
}
function assetUsageCount(asset){
  let count=0;const visit=nodes=>(nodes||[]).forEach(node=>{if(node.src===asset.src)count++;visit(node.children||[]);});
  (state.pages||[]).forEach(page=>visit(page.id===state.currentPageId?state.nodes:page.nodes||[]));return count;
}
function assetMetaLabel(asset){const dimensions=asset.width&&asset.height?`${asset.width} × ${asset.height}`:'Imagen';const size=asset.size?formatBytes(asset.size):'';return [dimensions,size].filter(Boolean).join(' · ');}
function filteredAssets(){const query=String(state.assetSearch||'').trim().toLowerCase();return (state.assets||[]).filter(asset=>{const usage=assetUsageCount(asset);const filterOk=state.assetFilter==='all'||(state.assetFilter==='used'?usage>0:usage===0);return filterOk&&(!query||`${asset.name} ${asset.alt||''}`.toLowerCase().includes(query));});}
function renderLeft(){
  ensureProjectPages();
  document.querySelectorAll('.left-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===state.tab));
  if(state.tab==='pages'){
    const normalPages=state.pages.filter(page=>!page.systemType);const systemPages=state.pages.filter(page=>page.systemType);const renderPageCard=page=>`<article class="page-card ${page.id===state.currentPageId?'active':''} status-${page.status||'published'}" data-open-page="${page.id}"><span class="page-card-icon">${page.slug==='/'?uiIcon('home'):uiIcon('page')}</span><div class="page-card-copy"><strong>${escapeHtml(page.name)}</strong><small>${escapeHtml(pageRouteLabel(page))}${page.slug==='/'?' · Inicio':''}</small><span class="page-status-label">${(page.status||'published')==='draft'?'Borrador':'Publicada'}</span></div><div class="page-card-actions"><button type="button" data-toggle-page-status="${page.id}" title="Cambiar estado">${(page.status||'published')==='draft'?'○':'●'}</button><button type="button" data-duplicate-page="${page.id}" title="Duplicar">${uiIcon('copy')}</button><button type="button" data-page-settings-id="${page.id}" title="SEO y ajustes">${uiIcon('settings')}</button><button type="button" class="danger" data-delete-page="${page.id}" title="${state.pages.length===1?'Eliminar y crear página vacía':'Eliminar'}">${uiIcon('trash')}</button></div></article>`;
    const seoIssues=pageSeoIssueCount();const auditReport=auditProject();const score=pageSeoScore();
    els.left.innerHTML=`<div class="panel-intro panel-intro-premium"><span class="panel-kicker">SITE MAP PRO</span><h2>Páginas</h2><p>Administra rutas, estado editorial, SEO y páginas del sistema.</p></div><section class="page-quality-card"><div class="page-quality-head"><div><span>PAGE HEALTH</span><strong>${score}/100</strong></div><small>${seoIssues?`${seoIssues} pendientes SEO`:'SEO básico completo'}</small></div><div class="page-quality-actions"><button type="button" data-open-seo>${uiIcon('settings')}<span>SEO de página</span><b>${seoIssues}</b></button><button type="button" data-open-audit>${uiIcon('warning')}<span>Audit</span><b>${auditReport.issues.length}</b></button></div></section><div class="page-toolbar"><button class="primary-action" type="button" data-add-page>${uiIcon('plus')}<span>Nueva página</span></button><button class="secondary-action" type="button" data-add-system-page="404" ${systemPages.some(page=>page.systemType==='404')?'disabled':''}>404</button></div><div class="page-system-note"><span>${uiIcon('page')}</span><p>Orbit mantiene siempre una página raíz para que Preview y Astro sean válidos. Las páginas en borrador se identifican visualmente antes de exportar.</p></div><div class="page-list">${normalPages.map(renderPageCard).join('')}</div>${systemPages.length?`<div class="page-group-label"><span>SYSTEM</span><b>${systemPages.length}</b></div><div class="page-list page-list-system">${systemPages.map(renderPageCard).join('')}</div>`:''}`;
    return;
  }
  if(state.tab==='elements'){
    const query=String(state.elementSearch||'').trim().toLowerCase();
    const view=state.elementView||'all';
    const category=state.elementCategory||'all';
    const sections=elementSections.map(section=>({
      ...section,
      filtered:section.items.filter(([type,label,desc])=>{
        const haystack=`${type} ${label} ${desc} ${section.label}`.toLowerCase();
        const queryOk=!query||haystack.includes(query);
        const categoryOk=category==='all'||section.id===category;
        const viewOk=view==='all'||(view==='favorites'?(state.elementFavorites||[]).includes(type):(state.elementRecent||[]).includes(type));
        return queryOk&&categoryOk&&viewOk;
      }).map(([type,label,desc])=>({type,label,desc,sectionLabel:section.label,kicker:section.kicker,sectionId:section.id}))
    })).filter(section=>section.filtered.length);
    const total=sections.reduce((sum,section)=>sum+section.filtered.length,0);
    const cats=[{id:'all',label:'Todo'}].concat(elementSections.map(section=>({id:section.id,label:section.label})));
    const views=[{id:'all',label:'Todo',icon:'layout'},{id:'favorites',label:'Favoritos',icon:'favorite'},{id:'recent',label:'Recientes',icon:'recent'}];
    els.left.innerHTML=`<div class="panel-intro panel-intro-premium element-library-shell"><span class="panel-kicker">BUILD</span><h2>Elementos</h2><p>Una biblioteca clara y enfocada: menos ruido visual, iconos comprensibles y acciones rápidas para diseñar con confianza.</p></div><div class="element-toolbar-pro"><label class="element-search element-search-pro element-search-ux"><span>${uiIcon('search')}</span><input type="search" placeholder="Buscar elementos…" value="${escapeHtml(state.elementSearch||'')}" data-element-search></label><div class="element-view-switch element-view-switch-compact">${views.map(item=>`<button type="button" class="element-view-btn ${view===item.id?'is-active':''}" data-element-view="${item.id}">${uiIcon(item.icon)}<span>${item.label}</span></button>`).join('')}</div></div><div class="element-filter-row element-filter-row-ux">${cats.map(item=>`<button type="button" class="element-filter-chip ${category===item.id?'is-active':''}" data-element-category="${item.id}">${escapeHtml(item.label)}</button>`).join('')}</div><div class="element-library-summary"><span><b>${total}</b> elementos</span><span><b>${(state.elementFavorites||[]).length}</b> favoritos</span><span><b>${(state.elementRecent||[]).length}</b> recientes</span></div>${sections.map(section=>`<section class="element-section element-section-ux"><header class="element-section-head element-section-head-ux"><div><span class="element-section-kicker">${section.kicker}</span><h3>${section.label}</h3></div><span class="element-section-count">${section.filtered.length}</span></header><div class="element-cards-grid element-cards-grid-ux">${section.filtered.map(renderElementCard).join('')}</div></section>`).join('')}${!sections.length?'<div class="asset-empty">No encontramos elementos con ese filtro. Prueba otra búsqueda o cambia la categoría.</div>':''}`;
    return;
  }
  if(state.tab==='sections'){
    els.left.innerHTML=`<div class="panel-intro"><span class="panel-kicker">PATTERNS</span><h2>Secciones</h2><p>Composiciones responsive listas para personalizar.</p></div><div class="section-library">${sectionTemplates.map((item,i)=>`<button class="section-card" draggable="true" data-template="${item.id}"><span class="section-card-preview"></span><span>BLOCK / 0${i+1}</span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.desc)}</small></button>`).join('')}</div>`;
    return;
  }
  if(state.tab==='layers'){
    els.left.innerHTML=`<div class="panel-intro"><span class="panel-kicker">STRUCTURE</span><h2>Capas</h2><p>Selecciona, busca, bloquea y reorganiza la estructura.</p></div><div class="layers-toolbar"><label>${uiIcon('search')}<input data-layer-search value="${escapeHtml(state.layerSearch||'')}" placeholder="Buscar capas"></label><button type="button" data-layers-expand title="Expandir todo">${uiIcon('expand')}</button><button type="button" data-layers-collapse title="Contraer todo">${uiIcon('collapse')}</button></div><div class="layers-tree">${layerRows(filteredLayerTree(state.nodes,state.layerSearch),0)}</div>`;
    return;
  }
  if(state.tab==='components'){
    const query=String(state.componentSearch||'').trim().toLowerCase();
    const filter=state.componentFilter||'all';
    const components=(state.components||[]).filter(component=>{
      const queryOk=!query||`${component.name} ${(component.props||[]).map(prop=>prop.name).join(' ')}`.toLowerCase().includes(query);
      const filterOk=filter==='all'||(filter==='variants'?(component.variants||[]).length>0:filter==='instances'?(component.instances||0)>0:(component.overrides||0)>0);
      return queryOk&&filterOk;
    });
    const totalInstances=(state.components||[]).reduce((sum,item)=>sum+(item.instances||0),0);
    const totalProps=(state.components||[]).reduce((sum,item)=>sum+(item.props||[]).length,0);
    const totalOverrides=(state.components||[]).reduce((sum,item)=>sum+(item.overrides||0),0);
    els.left.innerHTML=`<div class="panel-intro panel-intro-premium component-pro-intro"><span class="panel-kicker">COMPONENTS PRO · V0.13</span><h2>Componentes</h2><p>Props tipadas, variantes por instancia, overrides protegidos y sincronización multipágina.</p></div><div class="component-pro-summary"><article><strong>${state.components.length}</strong><span>Componentes</span></article><article><strong>${totalInstances}</strong><span>Instancias</span></article><article><strong>${totalProps}</strong><span>Props</span></article></div><div class="component-toolbar component-toolbar-pro"><button class="primary-action component-create" type="button" data-create-component ${selected()?'':'disabled'}>${uiIcon('component')}<span>Crear desde selección</span></button><label class="component-search"><span>${uiIcon('search')}</span><input type="search" data-component-search placeholder="Buscar componentes…" value="${escapeHtml(state.componentSearch||'')}"></label><div class="component-filter-chips">${[['all','Todos'],['instances','En uso'],['variants','Variantes'],['overrides','Overrides']].map(([id,label])=>`<button type="button" class="${filter===id?'is-active':''}" data-component-filter="${id}">${label}</button>`).join('')}</div></div>${components.length?`<div class="component-library component-library-pro">${components.map(component=>{const variants=component.variants||[],props=component.props||[];return `<article class="component-card component-card-pro ${component.overrides?'has-overrides':''}"><button type="button" class="component-card-main" data-go-component-master="${component.id}" title="Ir al componente principal"><span class="component-card-icon">${uiIcon('component')}</span><span class="component-card-copy"><strong>${escapeHtml(component.name)}</strong><small><span class="component-status-dot"></span>${component.instances||0} ${component.instances===1?'instancia':'instancias'} · ${variants.length} ${variants.length===1?'variante':'variantes'}</small><span class="component-card-badges"><b>${props.length} props</b>${component.overrides?`<b class="is-warning">${component.overrides} overrides</b>`:''}</span></span></button><div class="component-card-actions component-card-actions-pro"><button type="button" data-add-component="${component.id}" title="Insertar instancia">${uiIcon('plus')}</button><button type="button" data-component-properties="${component.id}" title="Propiedades">${uiIcon('settings')}</button><button type="button" data-component-variants="${component.id}" title="Variantes">◇</button><button type="button" data-sync-component="${component.id}" title="Sincronizar">${uiIcon('sync')}</button><button type="button" data-rename-component="${component.id}" title="Renombrar">${uiIcon('edit')}</button><button type="button" class="component-delete" data-delete-component="${component.id}" title="Eliminar">${uiIcon('trash')}</button></div></article>`;}).join('')}</div>`:`<div class="component-empty"><span>${uiIcon('component')}</span><strong>${state.components.length?'Sin resultados':'Sin componentes'}</strong><p>${state.components.length?'Prueba otra búsqueda o cambia el filtro.':'Selecciona una sección, contenedor o card y conviértela en un componente reutilizable.'}</p></div>`}${totalOverrides?`<div class="component-library-note"><span>${uiIcon('warning')}</span><p><strong>${totalOverrides} overrides protegidos.</strong> Sincronizar ya no elimina cambios locales de las instancias.</p></div>`:''}`;
    return;
  }
  if(state.tab==='classes'){
    const node=selected();
    els.left.innerHTML=`<div class="panel-intro panel-intro-premium"><span class="panel-kicker">STYLE SYSTEM</span><h2>Clases globales</h2><p>Reutiliza estilos sin duplicarlos y consulta dónde se aplican.</p></div><div class="class-toolbar"><button class="primary-action" type="button" data-create-global-class ${node?'':'disabled'}>${uiIcon('tag')}<span>Crear desde selección</span></button></div>${state.globalClasses.length?`<div class="global-class-list">${state.globalClasses.map(item=>{const active=(node?.globalClassIds||[]).includes(item.id);return `<article class="global-class-card ${active?'active':''}"><button type="button" class="global-class-main" data-toggle-global-class="${item.id}"><span>.${escapeHtml(item.name)}</span><small>${globalClassUsage(item.id)} usos</small></button><button type="button" class="global-class-edit" data-edit-global-class="${item.id}" title="Editar">${uiIcon('settings')}</button><button type="button" class="global-class-delete" data-delete-global-class="${item.id}" title="Eliminar">${uiIcon('trash')}</button></article>`;}).join('')}</div>`:`<div class="component-empty"><span>${uiIcon('tag')}</span><strong>Sin clases globales</strong><p>Crea una clase desde el elemento seleccionado para reutilizar sus estilos.</p></div>`}`;
    return;
  }
  if(state.tab==='tokens'){
    ensureTokenGroups();
    els.left.innerHTML=`<div class="panel-intro panel-intro-premium token-panel-shell"><span class="panel-kicker">FOUNDATIONS</span><h2>Design tokens</h2><p>Crea, edita y elimina variables del proyecto. Los cambios se actualizan en todo el diseño.</p></div><div class="token-panel token-panel-pro">${Object.keys(tokenMeta).map(category=>tokenGroupMarkup(category,state.tokens[category]||{})).join('')}</div>`;
    return;
  }
  if(state.tab==='assets'){
    const assets=filteredAssets();const unused=(state.assets||[]).filter(asset=>assetUsageCount(asset)===0).length;
    const assetCards=assets.map(asset=>{const usage=assetUsageCount(asset);const usageLabel=usage?(String(usage)+' uso'+(usage===1?'':'s')):'Sin uso';return `<article class="asset-card-pro" draggable="true" data-asset="${asset.id}"><button type="button" class="asset-preview-button" data-use-asset="${asset.id}" title="Usar ${escapeHtml(asset.name)}"><img src="${escapeHtml(asset.src)}" alt=""><span class="asset-usage-badge ${usage?'is-used':'is-unused'}">${usageLabel}</span></button><div class="asset-card-info"><strong title="${escapeHtml(asset.name)}">${escapeHtml(asset.name)}</strong><small>${escapeHtml(assetMetaLabel(asset))}</small></div><div class="asset-card-actions"><button type="button" data-rename-asset="${asset.id}" title="Renombrar">✎</button><button type="button" data-replace-asset="${asset.id}" title="Reemplazar">↻</button><button type="button" data-delete-asset="${asset.id}" title="Eliminar">${uiIcon('trash')}</button></div></article>`;}).join('');
    const assetContent=assets.length?`<div class="asset-grid asset-grid-pro">${assetCards}</div>`:`<div class="asset-empty"><strong>${state.assets.length?'No hay resultados':'Todavía no hay imágenes'}</strong><br>${state.assets.length?'Cambia el filtro o la búsqueda.':'Sube JPG, PNG, WebP, GIF o SVG.'}</div>`;
    els.left.innerHTML=`<div class="panel-intro panel-intro-premium"><span class="panel-kicker">MEDIA LIBRARY</span><h2>Assets</h2><p>Organiza imágenes, revisa su uso y reemplaza recursos sin perder referencias.</p></div><div class="asset-toolbar asset-toolbar-pro"><button data-upload-assets>${uiIcon('plus')} Subir imágenes</button><label class="asset-search">${uiIcon('search')}<input data-asset-search value="${escapeHtml(state.assetSearch||'')}" placeholder="Buscar assets…"></label></div><div class="asset-filter-row"><button type="button" data-asset-filter="all" class="${state.assetFilter==='all'?'active':''}">Todos <b>${state.assets.length}</b></button><button type="button" data-asset-filter="used" class="${state.assetFilter==='used'?'active':''}">En uso</button><button type="button" data-asset-filter="unused" class="${state.assetFilter==='unused'?'active':''}">Sin uso <b>${unused}</b></button></div>${assetContent}`;
    return;
  }
}
function filteredLayerTree(nodes,query=''){
  const term=String(query||'').trim().toLowerCase();if(!term)return nodes;
  return (nodes||[]).map(node=>{const children=filteredLayerTree(node.children||[],term);const hit=node.name.toLowerCase().includes(term)||node.type.toLowerCase().includes(term)||classAttribute(node).toLowerCase().includes(term);return hit||children.length?{...node,children}:null;}).filter(Boolean);
}
function layerRows(nodes,depth){
  return nodes.map(node=>{
    const collapsed=!!state.collapsed[node.id];
    const hasChildren=!!node.children?.length;
    const selected=isSelectedId(node.id);
    const componentBadge=node.componentRef?`<span class="layer-component" title="${node.componentSource==='master'?'Componente principal':'Instancia'}">◇</span>`:'';
    return `<div class="layer-wrap"><div class="layer-row ${selected?'active':''} ${state.selectedId===node.id?'primary':''} ${node.hidden?'is-hidden':''} ${node.locked?'is-locked':''}" data-layer="${node.id}" draggable="${node.locked?'false':'true'}" data-drag-node="${node.id}" style="padding-left:${7+depth*14}px"><span class="layer-drag">⠿</span>${hasChildren?`<button class="layer-collapse" type="button" data-collapse="${node.id}">${collapsed?'›':'⌄'}</button>`:'<span class="layer-collapse"></span>'}<span class="layer-kind">${uiIcon(icons[node.type])}</span><span class="layer-name">${escapeHtml(node.name)}</span>${componentBadge}<span class="layer-layout">${layoutBadge(node)}</span><button class="layer-visibility" type="button" data-layer-visible="${node.id}" title="${node.hidden?'Mostrar':'Ocultar'}">${uiIcon(node.hidden?'eyeOff':'eye')}</button><button class="layer-lock" type="button" data-layer-lock="${node.id}" title="${node.locked?'Desbloquear':'Bloquear'}">${uiIcon(node.locked?'lock':'unlock')}</button></div>${hasChildren&&!collapsed?layerRows(node.children,depth+1):''}</div>`;
  }).join('');
}
function layoutBadge(node){const s=effective(node);if(String(s.display).includes('grid'))return `${uiIcon('grid')}<span>GRID</span>`;if(String(s.display).includes('flex'))return `${uiIcon('flex')}<span>FLEX</span>`;return '';}
function tokenGroupMarkup(category,items){
  const open=state.tokenGroupsOpen?.[category]!==false;
  const count=Object.keys(items).length;
  const fontLibrary=open&&category==='typography'?`<button type="button" class="google-fonts-library-card" data-google-fonts-open><i>Aa</i><span><strong>Google Fonts</strong><small>${installedGoogleFontTokens().length} fuentes en el proyecto</small></span><em>Explorar</em></button>`:'';
  const list=count?Object.entries(items).map(([key,item])=>tokenRow(category,key,item)).join(''):`<div class="token-empty-state"><span>No hay variables en esta categoría.</span><button type="button" data-token-add="${category}">Crear primera variable</button></div>`;
  return `<section class="token-group token-group-pro token-group-${category} ${open?'is-open':'is-collapsed'}"><div class="token-group-toolbar"><button type="button" class="token-group-head token-group-head-pro" data-token-group="${category}" aria-expanded="${open}"><div><h3>${tokenMeta[category].label}</h3><p>${count} ${count===1?'token':'tokens'}</p></div><span class="token-group-chevron">${uiIcon(open?'arrowDown':'arrowRight')}</span></button><button type="button" class="token-group-clear" data-token-clear="${category}" title="Eliminar todos los tokens de ${escapeHtml(tokenMeta[category].label)}" aria-label="Eliminar todos los tokens de ${escapeHtml(tokenMeta[category].label)}" ${count?'':'disabled'}>${uiIcon('trash')}</button><button type="button" class="token-group-add" data-token-add="${category}" title="Crear variable en ${escapeHtml(tokenMeta[category].label)}" aria-label="Crear variable en ${escapeHtml(tokenMeta[category].label)}">${uiIcon('plus')}</button></div>${fontLibrary}${open?`<div class="token-list token-list-${category}">${list}</div>`:''}</section>`;
}
function tokenRow(category,key,item){
  const varLabel=varName(category,key);
  const symbol=category==='typography'?'Aa':category==='spacing'?'↔':category==='radius'?'◖':'☰';
  const visual=category==='colors'
    ? `<label class="token-swatch-pro"><input data-token-color="${category}:${key}" type="color" value="${/^#[0-9a-f]{6}$/i.test(item.value)?item.value:'#000000'}" aria-label="${escapeHtml(item.name)}"><span class="token-swatch-fill" style="background:${escapeHtml(item.value)}"></span></label>`
    : `<span class="token-symbol">${symbol}</span>`;
  return `<article class="token-card token-card-${category}"><div class="token-card-main">${visual}<div class="token-card-copy"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(varLabel)}</small></div></div><div class="token-card-actions"><button type="button" data-token-edit="${category}:${key}" title="Editar ${escapeHtml(item.name)}" aria-label="Editar ${escapeHtml(item.name)}">${uiIcon('edit')}</button><button type="button" class="is-danger" data-token-delete="${category}:${key}" title="Eliminar ${escapeHtml(item.name)}" aria-label="Eliminar ${escapeHtml(item.name)}">${uiIcon('trash')}</button></div><div class="token-card-control"><input class="token-input-pro" type="text" data-token-value="${category}:${key}" value="${escapeHtml(item.value)}" aria-label="Valor de ${escapeHtml(item.name)}"></div></article>`;
}
function spacingProps(group){
  return group==='padding'
    ? ['paddingTop','paddingRight','paddingBottom','paddingLeft']
    : ['marginTop','marginRight','marginBottom','marginLeft'];
}
function boxLinkMode(group){
  const current=state.boxLinks?.[group];
  if(['none','opposites','all'].includes(current))return current;
  return current?'all':'none';
}
function spacingLinkedProps(group,prop){
  const mode=boxLinkMode(group);
  if(mode==='all')return spacingProps(group);
  if(mode==='opposites'){
    const vertical=group==='padding'?['paddingTop','paddingBottom']:['marginTop','marginBottom'];
    const horizontal=group==='padding'?['paddingRight','paddingLeft']:['marginRight','marginLeft'];
    if(vertical.includes(prop))return vertical;
    if(horizontal.includes(prop))return horizontal;
  }
  return [prop];
}
function spacingLinkIcon(mode){
  if(mode==='none')return `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 7.2h4"></path><path d="M12.5 7.2h4"></path><path d="M3.5 12.8h4"></path><path d="M12.5 12.8h4"></path><path d="m8.4 5.8 3.2 8.4"></path></svg>`;
  if(mode==='opposites')return `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 4.2h10"></path><path d="M5 15.8h10"></path><path d="M4.2 5v10"></path><path d="M15.8 5v10"></path><circle cx="10" cy="4.2" r="1.2"></circle><circle cx="10" cy="15.8" r="1.2"></circle><circle cx="4.2" cy="10" r="1.2"></circle><circle cx="15.8" cy="10" r="1.2"></circle></svg>`;
  return `<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="4" width="12" height="12" rx="2.4"></rect><path d="M7 10h6"></path><path d="m9 8-2 2 2 2"></path><path d="m11 8 2 2-2 2"></path></svg>`;
}
function spacingLinkControl(group,compact=false){
  const current=boxLinkMode(group);
  const label=group==='padding'?'padding':'margen';
  const modes=[
    ['opposites','Opuestos',`Vincular arriba/abajo y derecha/izquierda del ${label}. Haz clic otra vez para volver a edición individual.`],
    ['all','Todos',`Aplicar el mismo valor a los cuatro lados del ${label}. Haz clic otra vez para volver a edición individual.`]
  ];
  return `<div class="spacing-link-switch ${compact?'is-compact':''}" role="group" aria-label="Vincular lados del ${label}">${modes.map(([mode,name,title])=>`<button type="button" class="${current===mode?'active':''}" data-box-link="${group}" data-box-mode="${mode}" title="${title}" aria-label="${name}: ${title}" aria-pressed="${current===mode}">${spacingLinkIcon(mode)}</button>`).join('')}</div>`;
}
function activateBoxLink(control,notify=true){
  if(!control)return false;
  const group=control.dataset.boxLink;
  const requestedMode=control.dataset.boxMode||'none';
  if(!group)return false;
  const mode=boxLinkMode(group)===requestedMode?'none':requestedMode;
  state.boxLinks[group]=mode;
  renderInspector();
  if(notify)toast(mode==='all'?`Todos los lados de ${group} vinculados`:mode==='opposites'?`Lados opuestos de ${group} vinculados`:`Lados de ${group} independientes`);
  return true;
}
function spacingDisplay(value){
  const resolved=resolveToken(value);
  return resolved===undefined||resolved===null||resolved===''?'0':String(resolved);
}
function boxSideInput(node,group,side,prop,value){
  const overridden=hasOverride(node,prop);
  return `<input class="box-side-input ${group}-${side} ${overridden?'overridden':''}" data-box-input="${prop}" data-box-group="${group}" value="${escapeHtml(spacingDisplay(value))}" aria-label="${group==='padding'?'Padding':'Margen'} ${side}" title="${group==='padding'?'Padding':'Margen'} ${side}${overridden?' · sobrescrito en este breakpoint':''}">`;
}
function boxModelControl(node,s){
  const marginMode=boxLinkMode('margin');
  const paddingMode=boxLinkMode('padding');
  const modeLabels={none:'Individual',opposites:'Opuestos',all:'Todos'};
  return `<div class="spacing-control">
    <div class="spacing-control-head">
      <div><strong>Box model</strong><span>Edita cada lado o vincula valores relacionados</span></div>
      <span class="spacing-unit-note">px · rem · % · auto</span>
    </div>
    <div class="spacing-diagram">
      <span class="spacing-zone-label margin-label">MARGIN</span>
      <div class="margin-link">${spacingLinkControl('margin')}</div>
      ${boxSideInput(node,'margin','top','marginTop',s.marginTop)}
      ${boxSideInput(node,'margin','right','marginRight',s.marginRight)}
      ${boxSideInput(node,'margin','bottom','marginBottom',s.marginBottom)}
      ${boxSideInput(node,'margin','left','marginLeft',s.marginLeft)}
      <div class="padding-zone">
        <span class="spacing-zone-label padding-label">PADDING</span>
        <div class="padding-link">${spacingLinkControl('padding')}</div>
        ${boxSideInput(node,'padding','top','paddingTop',s.paddingTop)}
        ${boxSideInput(node,'padding','right','paddingRight',s.paddingRight)}
        ${boxSideInput(node,'padding','bottom','paddingBottom',s.paddingBottom)}
        ${boxSideInput(node,'padding','left','paddingLeft',s.paddingLeft)}
        <div class="content-zone"><span>CONTENT</span><small>${escapeHtml(spacingDisplay(s.width||'auto'))} × ${escapeHtml(spacingDisplay(s.height||s.minHeight||'auto'))}</small></div>
      </div>
    </div>
    <div class="spacing-mode-summary"><span><b>Margin</b>${modeLabels[marginMode]}</span><span><b>Padding</b>${modeLabels[paddingMode]}</span></div>
    <div class="spacing-legend"><span><i class="legend-margin"></i>Margin</span><span><i class="legend-padding"></i>Padding</span><span><i class="legend-override"></i>Override responsive</span></div>
  </div><p class="hint">Individual edita cada lado. Opuestos vincula arriba con abajo y derecha con izquierda. Todos aplica un único valor a los cuatro lados.</p>`;
}
function field(label,body,overridden=false){ return `<label class="field"><span class="field-label"><span>${label}</span>${overridden?'<span class="override-dot" title="Sobrescrito en este breakpoint"></span>':''}</span>${body}</label>`; }
function textInput(prop,value='',type='text'){ return `<input data-node-prop="${prop}" type="${type}" value="${escapeHtml(value??'')}">`; }
function textarea(prop,value='',rows=3){ return `<textarea data-node-prop="${prop}" rows="${rows}">${escapeHtml(value??'')}</textarea>`; }
function parseUnit(value){
  if(value===undefined||value===null||value==='')return {number:'',unit:'px'};
  const raw=String(value); if(raw==='auto')return {number:'',unit:'auto'};
  const match=raw.match(/^(-?\d*\.?\d+)(px|%|rem|em|vw|vh)?$/); if(match)return {number:match[1],unit:match[2]||'px'};
  return {number:raw,unit:'raw'};
}
function unitInput(prop,value){
  const parsed=parseUnit(value); const units=['px','%','rem','em','vw','vh','auto'];
  if(parsed.unit==='raw')return `<input data-style-prop="${prop}" value="${escapeHtml(value||'')}" placeholder="auto / 100% / var(...) / 48rem">`;
  return `<div class="unit-input"><input data-unit-number="${prop}" type="number" step="any" value="${escapeHtml(parsed.number)}" ${parsed.unit==='auto'?'disabled':''}><select data-unit-select="${prop}">${units.map(unit=>`<option value="${unit}" ${parsed.unit===unit?'selected':''}>${unit}</option>`).join('')}</select></div>`;
}
function spacingUnitInput(prop,group,value){
  const parsed=parseUnit(value); const units=['px','%','rem','em','vw','vh','auto'];
  if(parsed.unit==='raw')return `<input data-box-input="${prop}" data-box-group="${group}" value="${escapeHtml(value||'')}" placeholder="auto / 100% / var(...) / 48rem">`;
  return `<div class="unit-input spacing-unit-input" data-box-group="${group}"><input data-unit-number="${prop}" data-box-group="${group}" type="number" step="any" value="${escapeHtml(parsed.number)}" ${parsed.unit==='auto'?'disabled':''}><select data-unit-select="${prop}" data-box-group="${group}">${units.map(unit=>`<option value="${unit}" ${parsed.unit===unit?'selected':''}>${unit}</option>`).join('')}</select></div>`;
}
function colorInput(prop,value){
  const resolved=resolveToken(value); const valid=/^#[0-9a-f]{6}$/i.test(resolved||'')?resolved:'#ffffff';
  return `<div class="color-input"><input data-color-prop="${prop}" type="color" value="${valid}"><input class="color-text" data-style-prop="${prop}" value="${escapeHtml(value||'')}"></div>`;
}
function colorLuminance(hex){
  const clean=String(hex||'').replace('#','');
  const full=clean.length===3?clean.split('').map(c=>c+c).join(''):clean;
  const rgb=(full.match(/.{2}/g)||['00','00','00']).map(x=>parseInt(x,16)/255);
  const [r,g,b]=rgb.map(c=>c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4));
  return 0.2126*(r||0) + 0.7152*(g||0) + 0.0722*(b||0);
}
function contrastRatio(fgHex, bgHex){
  const l1=colorLuminance(fgHex);
  const l2=colorLuminance(bgHex);
  const lighter=Math.max(l1,l2);
  const darker=Math.min(l1,l2);
  return (lighter + 0.05) / (darker + 0.05);
}
function wcagContrastRating(fgHex, bgHex){
  const ratio=contrastRatio(fgHex, bgHex);
  if(ratio>=7) return { level: 'AAA', ratio: ratio.toFixed(1), pass: true };
  if(ratio>=4.5) return { level: 'AA', ratio: ratio.toFixed(1), pass: true };
  if(ratio>=3) return { level: 'AA Large', ratio: ratio.toFixed(1), pass: true };
  return { level: 'FAIL', ratio: ratio.toFixed(1), pass: false };
}
function wcagPageAudit(nodes=state.nodes||[]){
  let h1Count=0, missingAlt=0, iconMissingAria=0;
  function walk(list){
    (list||[]).forEach(node=>{
      if(node.type==='heading'&&node.htmlTag==='h1')h1Count++;
      if(node.type==='image'&&(!node.alt||!node.alt.trim()))missingAlt++;
      if((node.type==='button'||node.type==='link')&&!node.content&&!node.ariaLabel)iconMissingAria++;
      walk(node.children||[]);
    });
  }
  walk(nodes);
  const issues=[];
  if(h1Count===0)issues.push('No hay ningún encabezado H1 en la página.');
  else if(h1Count>1)issues.push(`Hay ${h1Count} encabezados H1 (se recomienda solo 1 por página).`);
  if(missingAlt>0)issues.push(`${missingAlt} imagen${missingAlt===1?'':'es'} sin texto alternativo (alt).`);
  if(iconMissingAria>0)issues.push(`${iconMissingAria} botón${iconMissingAria===1?'':'es'} solo con icono sin atributo aria-label.`);
  return { h1Count, missingAlt, iconMissingAria, issues, score: Math.max(0, 100 - issues.length * 20) };
}
function inspectorColorControl(prop,current,label='Color'){
  const raw=String(current||'');
  const color=normalizeColorValue(raw,'#151513');
  const activeToken=Object.entries(state.tokens.colors||{}).find(([key])=>tokenRef('colors',key)===raw);
  const currentLabel=activeToken?.[1]?.name||'Personalizado';
  const tokens=Object.entries(state.tokens.colors||{}).map(([key,item])=>{const ref=tokenRef('colors',key);const swatch=normalizeColorValue(item.value,'#151513');return `<button type="button" class="inspector-color-token ${raw===ref?'is-active':''}" data-inspector-color-token="${prop}" data-inspector-color-value="${escapeHtml(ref)}" aria-pressed="${raw===ref}" title="Usar ${escapeHtml(item.name)}"><i style="--token-swatch:${escapeHtml(swatch)}" aria-hidden="true"></i><span>${escapeHtml(item.name)}</span></button>`;}).join('');
  const node=selected();
  let wcagBadge='';
  if(node&&prop==='color'){
    const bg=normalizeColorValue(effective(node).background||'#ffffff','#ffffff');
    const wcag=wcagContrastRating(color,bg);
    wcagBadge=`<span class="wcag-badge ${wcag.pass?'wcag-pass':'wcag-fail'}" title="Relación de contraste WCAG 2.1 AA: ${wcag.ratio}:1">WCAG ${wcag.level} · ${wcag.ratio}:1</span>`;
  }
  return `<div class="inspector-color-control"><button type="button" class="inspector-color-trigger" data-inspector-color-menu="${prop}" aria-label="Abrir selector de ${escapeHtml(label.toLowerCase())}" aria-expanded="false"><i style="--inspector-color:${escapeHtml(color)}" aria-hidden="true"></i><span>${escapeHtml(currentLabel)}</span>${wcagBadge}${uiIcon('arrowDown')}</button><span class="inspector-color-popover" data-inspector-color-popover role="dialog" aria-label="${escapeHtml(label)}" hidden><span class="inspector-color-head"><span><small>Color</small><strong>${escapeHtml(label)}</strong></span><button type="button" data-inspector-color-close aria-label="Cerrar selector de color">${uiIcon('close')}</button></span><span class="inspector-color-section"><small>Variables del proyecto</small><span class="inspector-color-token-grid">${tokens||'<span class="google-font-project-empty">No hay variables de color.</span>'}</span></span><span class="inspector-color-section"><label class="inspector-color-custom ${activeToken?'':'is-active'}">Personalizado<input type="color" value="${escapeHtml(color)}" data-inspector-color-custom="${prop}" aria-label="Color personalizado"></label></span></span></div>`;
}
function segmented(prop,values,current,cols='two'){ return `<div class="segmented ${cols}">${values.map(([v,l])=>`<button data-style-button="${prop}" data-value="${v}" class="${current===v?'active':''}">${l}</button>`).join('')}</div>`; }
function iconSvg(name){
  const map={
    alignLeft:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5h16"></path><path d="M4 10.5h11"></path><path d="M4 14.5h16"></path><path d="M4 18.5h11"></path></svg>',
    alignCenter:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5h16"></path><path d="M7 10.5h10"></path><path d="M4 14.5h16"></path><path d="M7 18.5h10"></path></svg>',
    alignRight:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5h16"></path><path d="M9 10.5h11"></path><path d="M4 14.5h16"></path><path d="M9 18.5h11"></path></svg>',
    alignJustify:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5h16"></path><path d="M4 10.5h16"></path><path d="M4 14.5h16"></path><path d="M4 18.5h16"></path></svg>',
    decorNone:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7h8"></path><path d="M12 7v10"></path><path d="M6 17h12"></path><path d="M7 7l10 10"></path></svg>',
    decorUnderline:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6.5h8"></path><path d="M12 6.5v8"></path><path d="M6 18.5h12"></path></svg>',
    decorStrike:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6.5h8"></path><path d="M12 6.5v10"></path><path d="M5 12h14"></path></svg>',
    decorOverline:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8h8"></path><path d="M12 8v8"></path><path d="M6 5.5h12"></path></svg>'
  };
  return map[name]||name;
}
function iconSegmented(prop,values,current,cols='four'){
  return `<div class="segmented icon-segmented ${cols}">${values.map(([v,icon,label])=>`<button data-style-button="${prop}" data-value="${v}" class="${current===v?'active':''}" title="${label}" aria-label="${label}">${icon}</button>`).join('')}</div>`;
}
function typographyLengthValue(value){return /^\s*-?(?:\d+|\d*\.\d+)(?:px|rem|em|pt|%)\s*$/i.test(String(value||''));}
function projectFontTokens(){return Object.entries(state.tokens.typography||{}).filter(([,item])=>!typographyLengthValue(item.value));}
function installedGoogleFontTokens(){return projectFontTokens().filter(([,item])=>item.source==='google'&&item.family);}
function googleFontTokenKey(family){return `google-${slug(family)}`;}
function googleFontFamilyValue(font){return `"${font.family}", ${font.fallback||'sans-serif'}`;}
function normalizedGoogleWeights(item){const weights=(item.weights||[400]).map(Number).filter(Number.isFinite);return [...new Set(weights.length?weights:[400])].sort((a,b)=>a-b);}
function googleFontRequestPart(item,preview=false){
  const family=encodeURIComponent(item.family).replace(/%20/g,'+');
  if(preview)return `family=${family}`;
  const weights=normalizedGoogleWeights(item);
  if(item.italic){const values=[...weights.map(weight=>`0,${weight}`),...weights.map(weight=>`1,${weight}`)].join(';');return `family=${family}:ital,wght@${values}`;}
  return `family=${family}:wght@${weights.join(';')}`;
}
function googleFontsUrl(items=installedGoogleFontTokens().map(([,item])=>item),preview=false){
  if(!items.length)return '';
  return `https://fonts.googleapis.com/css2?${items.map(item=>googleFontRequestPart(item,preview)).join('&')}&display=swap`;
}
function syncGoogleFontsStylesheet(){
  const href=googleFontsUrl();let link=document.getElementById('orbit-google-fonts');
  if(!href){link?.remove();return;}
  if(!link){link=document.createElement('link');link.id='orbit-google-fonts';link.rel='stylesheet';document.head.appendChild(link);}
  if(link.getAttribute('href')!==href)link.setAttribute('href',href);
}
function syncGoogleFontPreviews(fonts=[]){
  const href=googleFontsUrl(fonts,true);let link=document.getElementById('orbit-google-font-previews');
  if(!href){link?.remove();return;}
  if(!link){link=document.createElement('link');link.id='orbit-google-font-previews';link.rel='stylesheet';document.head.appendChild(link);}
  if(link.getAttribute('href')!==href)link.setAttribute('href',href);
}
function googleFontsHeadMarkup(){
  const href=googleFontsUrl();if(!href)return '';
  return `\n    <link rel="preconnect" href="https://fonts.googleapis.com" />\n    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />\n    <link rel="stylesheet" href="${escapeHtml(href)}" />`;
}
function fontFamilyInput(value=''){
  const current=String(value||'inherit');const variables=projectFontTokens();
  const variableOptions=variables.map(([key,item])=>{const ref=tokenRef('typography',key);return `<option value="${escapeHtml(ref)}" ${current===ref?'selected':''}>${escapeHtml(item.name)}</option>`;}).join('');
  const local=[['inherit','Heredada'],['"Geist", sans-serif','Geist'],['"Inter", sans-serif','Inter local'],['Georgia, serif','Georgia'],['ui-monospace, SFMono-Regular, monospace','Monoespaciada']];
  if(!variables.some(([key])=>tokenRef('typography',key)===current)&&!local.some(([item])=>item===current))local.unshift([current,'Fuente actual']);
  const localOptions=local.map(([item,label])=>`<option value="${escapeHtml(item)}" ${current===item?'selected':''}>${escapeHtml(label)}</option>`).join('');
  return `<div class="font-family-stack"><select data-style-prop="fontFamily" aria-label="Familia tipográfica"><optgroup label="Variables del proyecto">${variableOptions}</optgroup><optgroup label="Fuentes locales">${localOptions}</optgroup></select><button type="button" data-google-fonts-open title="Explorar Google Fonts" aria-label="Explorar Google Fonts">${uiIcon('search')}</button></div>`;
}
let googleFontQuery='';
function googleFontUsage(ref){
  syncCurrentPageRecord();
  const source=JSON.stringify({pages:state.pages,classes:state.globalClasses,components:state.components});
  return source.split(ref).length-1;
}
function googleFontManagerMarkup(){
  const query=googleFontQuery.trim().toLowerCase();
  const filtered=googleFontCatalog.filter(font=>!query||`${font.family} ${font.category}`.toLowerCase().includes(query));
  const shown=filtered.slice(0,12);const installed=installedGoogleFontTokens();const installedByFamily=new Map(installed.map(([key,item])=>[item.family,{key,item}]));
  const projectList=installed.length?installed.map(([key,item])=>{const ref=tokenRef('typography',key);return `<span class="google-font-project-chip" style="font-family:${escapeHtml(item.value)}"><button type="button" data-google-font-apply-token="${escapeHtml(ref)}" title="Aplicar ${escapeHtml(item.family)}">${escapeHtml(item.family)}</button><button type="button" data-google-font-remove="${escapeHtml(key)}" aria-label="Eliminar ${escapeHtml(item.family)}">${uiIcon('close')}</button></span>`;}).join(''):'<span class="google-font-project-empty">Todavía no has añadido fuentes de Google a este proyecto.</span>';
  const cards=shown.map(font=>{const installedRecord=installedByFamily.get(font.family)?.item;const activeWeights=normalizedGoogleWeights(installedRecord||{weights:[400,700].filter(weight=>font.weights.includes(weight))});const italic=installedRecord?.italic===true;return `<article class="google-font-card" data-google-font-card="${escapeHtml(font.family)}"><div class="google-font-card-head"><div><strong>${escapeHtml(font.family)}</strong><small>${escapeHtml(font.category)} · Google Fonts</small></div>${installedRecord?'<small>En el proyecto</small>':''}</div><div class="google-font-card-preview" style="font-family:'${escapeHtml(font.family)}',${escapeHtml(font.fallback)}">Diseña sin salir de tu órbita.</div><div class="google-font-weight-row"><div class="google-font-weights" role="group" aria-label="Pesos de ${escapeHtml(font.family)}">${font.weights.map(weight=>`<label class="google-font-weight"><input type="checkbox" data-google-font-weight value="${weight}" ${activeWeights.includes(weight)?'checked':''}><span>${weight}</span></label>`).join('')}${font.italic?`<label class="google-font-weight"><input type="checkbox" data-google-font-italic ${italic?'checked':''}><span>Italic</span></label>`:''}</div><button type="button" class="google-font-use" data-google-font-use="${escapeHtml(font.family)}">${installedRecord?'Actualizar y usar':'Añadir y usar'}</button></div></article>`;}).join('');
  requestAnimationFrame(()=>syncGoogleFontPreviews(shown));
  return `<div class="google-font-studio"><div class="google-font-studio-intro"><div><strong>Fuentes del proyecto</strong><p>Busca, previsualiza y carga solo los pesos necesarios. Orbit las convierte en variables tipográficas y las incluye en la exportación Astro.</p></div><div class="google-font-studio-stats"><span><strong>${installed.length}</strong><small>Instaladas</small></span><span><strong>${googleFontCatalog.length}</strong><small>Disponibles</small></span></div></div><label class="google-font-search">${uiIcon('search')}<input type="search" data-google-font-search value="${escapeHtml(googleFontQuery)}" placeholder="Buscar Inter, Lora, Space Grotesk…" autocomplete="off"><small>${shown.length} de ${filtered.length}</small></label><section class="google-font-project"><div class="google-font-section-head"><strong>En este proyecto</strong><small>Se guardan como variables</small></div><div class="google-font-project-list">${projectList}</div></section><section class="google-font-catalog"><div class="google-font-section-head"><strong>Catálogo curado</strong><small>Google Fonts · API CSS v2</small></div><div class="google-font-grid">${cards||'<div class="google-font-empty">No encontramos una fuente con ese nombre.</div>'}</div></section></div>`;
}
function openGoogleFontManager(){openModal('Google Fonts','TIPOGRAFÍA DEL PROYECTO',googleFontManagerMarkup(),'google-font-modal');}
function refreshGoogleFontManager(focusSearch=false){
  if(els.modal.hidden||!els.modal.querySelector('.google-font-modal'))return;
  els.modalContent.innerHTML=googleFontManagerMarkup();
  if(focusSearch)requestAnimationFrame(()=>{const input=els.modalContent.querySelector('[data-google-font-search]');input?.focus();input?.setSelectionRange(input.value.length,input.value.length);});
}
function installGoogleFont(button){
  const family=button.dataset.googleFontUse;const font=googleFontCatalog.find(item=>item.family===family);const card=button.closest('[data-google-font-card]');if(!font||!card)return;
  const weights=[...card.querySelectorAll('[data-google-font-weight]:checked')].map(input=>Number(input.value));if(!weights.length)weights.push(font.weights.includes(400)?400:font.weights[0]);
  const italic=!!card.querySelector('[data-google-font-italic]:checked');const key=googleFontTokenKey(font.family);const before=snapshot();
  state.tokens.typography[key]={name:font.family,value:googleFontFamilyValue(font),source:'google',family:font.family,category:font.category,fallback:font.fallback,weights:[...new Set(weights)].sort((a,b)=>a-b),italic};
  const node=selected();if(isTextual(node))directStyle('fontFamily',tokenRef('typography',key));
  pushHistory(before);markUnsaved();syncGoogleFontsStylesheet();render();refreshGoogleFontManager();toast(`${font.family} añadida al proyecto`);
}
function removeGoogleFont(key){
  const item=state.tokens.typography?.[key];if(!item||item.source!=='google')return;const ref=tokenRef('typography',key);const usage=googleFontUsage(ref);
  if(usage){toast(`${item.family} está en uso en ${usage} estilo${usage===1?'':'s'}`);return;}
  const before=snapshot();delete state.tokens.typography[key];pushHistory(before);markUnsaved();syncGoogleFontsStylesheet();render();refreshGoogleFontManager();toast(`${item.family} eliminada del proyecto`);
}
function normalizeColorValue(value,fallback='#000000'){
  const resolved=String(resolveToken(value)||'').trim();
  return /^#[0-9a-fA-F]{6}$/.test(resolved)?resolved:fallback;
}
function defaultBackgroundConfig(background='var(--color-surface)'){
  const raw=String(background||'').trim();const hasUrl=/url\(/i.test(raw),hasGradient=/(?:linear|radial)-gradient\(/i.test(raw);
  return {mode:hasUrl&&hasGradient?'overlay':hasUrl?'image':hasGradient?'gradient':'color',color:!hasUrl&&!hasGradient&&raw?raw:'var(--color-surface)',imageSrc:(raw.match(/url\(["']?([^"')]+)["']?\)/i)||[])[1]||'',imageSize:/\/\s*contain/i.test(raw)?'contain':'cover',imagePosition:'center center',imageRepeat:/repeat(?!-)/i.test(raw)?'repeat':'no-repeat',gradientType:/radial-gradient/i.test(raw)?'radial':'linear',gradientAngle:Number((raw.match(/linear-gradient\(\s*(-?\d+(?:\.\d+)?)deg/i)||[])[1])||135,gradientStart:'var(--color-primary)',gradientMiddle:'',gradientEnd:'var(--color-accent)',blendMode:'normal',overlayColor:'#000000',overlayOpacity:.45};
}
function normalizeBackgroundConfig(config={},background=''){
  const fallback=defaultBackgroundConfig(background);const next={...fallback,...(config&&typeof config==='object'?config:{})};
  next.mode=['color','image','gradient','overlay'].includes(next.mode)?next.mode:fallback.mode;next.imageSize=['cover','contain','auto'].includes(next.imageSize)?next.imageSize:'cover';next.imagePosition=['center center','center top','center bottom','left center','right center'].includes(next.imagePosition)?next.imagePosition:'center center';next.imageRepeat=['no-repeat','repeat','repeat-x','repeat-y'].includes(next.imageRepeat)?next.imageRepeat:'no-repeat';next.gradientType=next.gradientType==='radial'?'radial':'linear';next.gradientAngle=Math.max(-360,Math.min(360,Number(next.gradientAngle)||0));next.blendMode=['normal','multiply','screen','overlay','darken','lighten','color-dodge','soft-light'].includes(next.blendMode)?next.blendMode:'normal';const opacity=Number(next.overlayOpacity);next.overlayOpacity=Number.isFinite(opacity)?Math.max(0,Math.min(1,opacity)):.45;return next;
}
function backgroundConfigFor(node=selected(),style=effective(node)){
  if(!node)return normalizeBackgroundConfig();const shared=primarySharedStyleClass(node);const owner=shared&&node.styleEditMode!=='local'?shared:node;return normalizeBackgroundConfig(owner.backgroundConfig||node.backgroundConfig,style?.background||'');
}
function safeBackgroundUrl(value=''){return String(value||'').trim().replace(/["'\\\n\r]/g,char=>encodeURIComponent(char));}
function composeBackground(config){
  const item=normalizeBackgroundConfig(config);const url=safeBackgroundUrl(item.imageSrc);const image=url?`url("${url}") ${item.imagePosition} / ${item.imageSize} ${item.imageRepeat}`:'none';
  if(item.mode==='image')return image;
  if(item.mode==='gradient'){const stops=item.gradientMiddle?`${item.gradientStart}, ${item.gradientMiddle}, ${item.gradientEnd}`:`${item.gradientStart}, ${item.gradientEnd}`;return item.gradientType==='radial'?`radial-gradient(circle at center, ${stops})`:`linear-gradient(${item.gradientAngle}deg, ${stops})`;}
  if(item.mode==='overlay'){const amount=Math.round(item.overlayOpacity*100);const layer=`linear-gradient(color-mix(in srgb, ${item.overlayColor} ${amount}%, transparent), color-mix(in srgb, ${item.overlayColor} ${amount}%, transparent))`;return url?`${layer}, ${image}`:layer;}
  return item.color||'transparent';
}
function updateBackgroundConfig(patch={}){
  const node=selected();if(!node)return;commit(()=>{
    const current=backgroundConfigFor(node,effective(node));const next=normalizeBackgroundConfig({...current,...patch});const shared=primarySharedStyleClass(node);
    if(shared&&node.styleEditMode!=='local')state.globalClasses=(state.globalClasses||[]).map(item=>item.id===shared.id?{...item,backgroundConfig:clone(next)}:item);
    else state.nodes=update(state.nodes,node.id,item=>({...item,backgroundConfig:clone(next)}));
    directStyle('background',composeBackground(next));
  });
}
function backgroundEditor(node,style){
  const config=backgroundConfigFor(node,style);const modeButton=(mode,label)=>`<button type="button" data-background-mode="${mode}" class="${config.mode===mode?'active':''}" aria-pressed="${String(config.mode===mode)}">${label}</button>`;
  const assetOptions=(state.assets||[]).filter(asset=>String(asset.type||'').startsWith('image/')&&asset.src).map(asset=>`<option value="${escapeHtml(asset.src)}" ${asset.src===config.imageSrc?'selected':''}>${escapeHtml(asset.name||'Asset')}</option>`).join('');
  const blendOptions=[['normal','Normal'],['multiply','Multiply'],['screen','Screen'],['overlay','Overlay'],['darken','Darken'],['lighten','Lighten'],['color-dodge','Color Dodge'],['soft-light','Soft Light']].map(([v,l])=>`<option value="${v}" ${config.blendMode===v?'selected':''}>${l}</option>`).join('');
  const source=`<div class="background-source-row"><input data-background-field="imageSrc" value="${escapeHtml(config.imageSrc)}" placeholder="https://…/imagen.webp" aria-label="URL de imagen de fondo"><select data-background-asset aria-label="Elegir imagen de Assets"><option value="">Assets</option>${assetOptions}</select></div><div class="field-grid">${field('Ajuste',`<select data-background-field="imageSize"><option value="cover" ${config.imageSize==='cover'?'selected':''}>Cubrir</option><option value="contain" ${config.imageSize==='contain'?'selected':''}>Contener</option><option value="auto" ${config.imageSize==='auto'?'selected':''}>Tamaño real</option></select>`)}${field('Posición',`<select data-background-field="imagePosition">${[['center center','Centro'],['center top','Arriba'],['center bottom','Abajo'],['left center','Izquierda'],['right center','Derecha']].map(([value,label])=>`<option value="${value}" ${config.imagePosition===value?'selected':''}>${label}</option>`).join('')}</select>`)}</div><div class="field-grid">${field('Modo de fusión',`<select data-background-field="blendMode" aria-label="Modo de fusión">${blendOptions}</select>`)}</div>`;
  let panel='';
  if(config.mode==='color')panel=field('Color de fondo',inspectorColorControl('backgroundConfig:color',config.color,'Fondo'));
  if(config.mode==='image')panel=`${source}<p class="background-help">Pega una URL o selecciona una imagen que ya esté en Assets.</p>`;
  if(config.mode==='gradient')panel=`<div class="background-gradient-row"><select data-background-field="gradientType" aria-label="Tipo de gradiente"><option value="linear" ${config.gradientType==='linear'?'selected':''}>Lineal</option><option value="radial" ${config.gradientType==='radial'?'selected':''}>Radial</option></select><input data-background-field="gradientAngle" type="number" min="-360" max="360" value="${config.gradientAngle}" aria-label="Ángulo del gradiente" ${config.gradientType==='radial'?'disabled':''}></div><div class="field-grid">${field('Inicio',inspectorColorControl('backgroundConfig:gradientStart',config.gradientStart,'Inicio'))}${field('Medio (opcional)',inspectorColorControl('backgroundConfig:gradientMiddle',config.gradientMiddle,'Medio'))}${field('Final',inspectorColorControl('backgroundConfig:gradientEnd',config.gradientEnd,'Final'))}</div>`;
  if(config.mode==='overlay')panel=`${source}<div class="background-overlay-row">${inspectorColorControl('backgroundConfig:overlayColor',config.overlayColor,'Overlay')}<div class="background-opacity"><input data-background-field="overlayOpacity" type="range" min="0" max="1" step="0.05" value="${config.overlayOpacity}" aria-label="Opacidad del overlay"><output>${Math.round(config.overlayOpacity*100)}%</output></div></div><p class="background-help">El overlay se coloca sobre la imagen y mantiene el contenido legible.</p>`;
  const preview=composeBackground(config);
  return `<div class="background-studio"><div class="background-mode-switch" role="group" aria-label="Tipo de fondo">${modeButton('color','Color')}${modeButton('image','Imagen')}${modeButton('gradient','Gradiente')}${modeButton('overlay','Overlay')}</div><div class="background-panel">${panel}<div class="background-preview" style="--background-preview:${escapeHtml(preview)}" aria-label="Vista previa del fondo"></div></div></div>`;
}
function normalizeLengthValue(value){
  const raw=String(value??'').trim();
  if(!raw)return '';
  if(/^[-+]?\d*\.?\d+$/.test(raw))return `${raw}px`;
  return raw;
}
function parseTextShadow(value=''){
  const raw=String(value||'').trim();
  if(!raw||raw==='none')return {x:'',y:'',blur:'',color:'rgba(0,0,0,0.25)'};
  const match=raw.match(/^(\S+)\s+(\S+)\s+(\S+)\s+(.+)$/);
  if(match)return {x:match[1],y:match[2],blur:match[3],color:match[4]};
  return {x:'',y:'',blur:'',color:raw};
}
function textShadowControl(value='',overridden=false){
  const shadow=parseTextShadow(value);
  const variableIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8l3 4-2 10-5 2-5-2L5 8l3-4Z"></path><path d="m9 9 3 6 3-6"></path></svg>';
  const editIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10.2-10.2a2.3 2.3 0 0 0-3.2-3.2L4.8 16.8 4 20Z"></path><path d="m13.8 7.8 3.2 3.2"></path></svg>';
  const valueRow=(label,part,current,placeholder)=>`<div class="shadow-setting-row"><span class="shadow-setting-label ${label==='BLUR'?'is-uppercase':''}">${label}</span><div class="shadow-value-control"><input data-shadow-part="${part}" value="${escapeHtml(current||'')}" placeholder="${placeholder}"><span class="shadow-value-addon" aria-hidden="true">${variableIcon}</span></div></div>`;
  return `<div class="text-shadow-control ${overridden?'has-override':''}">
    <button type="button" class="text-shadow-trigger" data-text-shadow-toggle aria-expanded="false">
      <span>Text shadow</span>
      <span class="text-shadow-edit-icon" aria-hidden="true">${editIcon}</span>
    </button>
    <div class="text-shadow-panel" data-text-shadow-panel hidden>
      <div class="text-shadow-panel-title">Text shadow</div>
      ${valueRow('x','x',shadow.x,'0')}
      ${valueRow('y','y',shadow.y,'0')}
      ${valueRow('BLUR','blur',shadow.blur,'0')}
      <div class="shadow-color-heading">
        <span>Color</span>
      </div>
      <div class="shadow-project-color">
        ${inspectorColorControl('textShadowColor',shadow.color,'Sombra')}
      </div>
    </div>
  </div>`;
}
function selectInput(prop,options,current){ return `<select data-style-prop="${prop}">${options.map(([v,l])=>`<option value="${v}" ${String(current)===String(v)?'selected':''}>${l}</option>`).join('')}</select>`; }
function section(id,title,body){ const advanced=['semantic','classes','component','states','interaction','accessibility']; if(state.inspectorMode==='essentials'&&advanced.includes(id))return ''; return `<div class="inspector-section inspector-section-${id}"><button class="section-title" data-section="${id}"><span>${title}</span><span>${state.openSections[id]?'⌄':'›'}</span></button>${state.openSections[id]?`<div class="section-body">${body}</div>`:''}</div>`; }
function tokenOptions(category,current){
  const customSelected=!String(current||'').startsWith('var(');
  const variables=Object.entries(state.tokens[category]||{}).map(([key,item])=>{const ref=tokenRef(category,key);return `<option value="${escapeHtml(ref)}" ${current===ref?'selected':''}>${escapeHtml(item.name)}</option>`;}).join('');
  if(category==='colors')return `<select data-token-prop="${category}" aria-label="Variable o color personalizado"><optgroup label="Variables del proyecto">${variables}</optgroup><optgroup label="Valor libre"><option value="__custom" ${customSelected?'selected':''}>Personalizado</option></optgroup></select>`;
  return `<select data-token-prop="${category}"><option value="__custom" ${customSelected?'selected':''}>Personalizado</option>${variables}</select>`;
}
function tokenField(prop,category,current,customControl){
  if(category==='colors')return inspectorColorControl(prop,current,prop==='background'?'Fondo':prop==='color'?'Texto':'Color');
  return `<div class="token-control ${String(current||'').startsWith('var(')?'':'has-custom'}" data-token-field="${prop}">${tokenOptions(category,current)}${String(current||'').startsWith('var(')?'':customControl}</div>`;
}
function layoutIcon(name){
  const svg=(body,fill='none')=>`<svg class="layout-svg" viewBox="0 0 20 20" aria-hidden="true" focusable="false" fill="${fill}">${body}</svg>`;
  const map={
    chevron:svg('<path d="m6.5 8 3.5 3.5L13.5 8"></path>'),
    more:svg('<circle cx="5" cy="10" r="1" fill="currentColor" stroke="none"></circle><circle cx="10" cy="10" r="1" fill="currentColor" stroke="none"></circle><circle cx="15" cy="10" r="1" fill="currentColor" stroke="none"></circle>'),
    row:svg('<path d="M3.5 10h12"></path><path d="m12.5 6.5 3.5 3.5-3.5 3.5"></path>'),
    column:svg('<path d="M10 3.5v12"></path><path d="m6.5 12.5 3.5 3.5 3.5-3.5"></path>'),
    reverse:svg('<path d="M16.5 10h-12"></path><path d="m7.5 6.5-3.5 3.5 3.5 3.5"></path>'),
    flowRow:svg('<rect x="2.75" y="5" width="4.5" height="10" rx="1.2"></rect><rect x="8.25" y="5" width="4.5" height="10" rx="1.2"></rect><path d="M14.25 10h3"></path><path d="m15.75 8.5 1.5 1.5-1.5 1.5"></path>'),
    flowColumn:svg('<rect x="5" y="2.75" width="10" height="4.5" rx="1.2"></rect><rect x="5" y="8.25" width="10" height="4.5" rx="1.2"></rect><path d="M10 14.25v3"></path><path d="m8.5 15.75 1.5 1.5 1.5-1.5"></path>'),
    start:svg('<path d="M3.25 3.5v13"></path><rect x="6" y="5.25" width="2.75" height="9.5" rx=".8"></rect><rect x="10.5" y="5.25" width="2.75" height="9.5" rx=".8"></rect>'),
    center:svg('<path d="M10 3.5v13"></path><rect x="3.75" y="5.25" width="2.75" height="9.5" rx=".8"></rect><rect x="13.5" y="5.25" width="2.75" height="9.5" rx=".8"></rect>'),
    end:svg('<path d="M16.75 3.5v13"></path><rect x="6.75" y="5.25" width="2.75" height="9.5" rx=".8"></rect><rect x="11.25" y="5.25" width="2.75" height="9.5" rx=".8"></rect>'),
    between:svg('<path d="M2.75 3.5v13"></path><path d="M17.25 3.5v13"></path><rect x="5.25" y="5.25" width="2.75" height="9.5" rx=".8"></rect><rect x="12" y="5.25" width="2.75" height="9.5" rx=".8"></rect>'),
    around:svg('<path d="M2.75 10h1.5"></path><path d="M15.75 10h1.5"></path><rect x="5.25" y="5.25" width="2.75" height="9.5" rx=".8"></rect><rect x="12" y="5.25" width="2.75" height="9.5" rx=".8"></rect>'),
    evenly:svg('<path d="M2.75 10h1"></path><path d="M9.5 10h1"></path><path d="M16.25 10h1"></path><rect x="5" y="5.25" width="2.75" height="9.5" rx=".8"></rect><rect x="12.25" y="5.25" width="2.75" height="9.5" rx=".8"></rect>'),
    wrench:svg('<path d="M12.6 3.2a4 4 0 0 0-4.7 5.1l-4.3 4.3a1.9 1.9 0 0 0 2.7 2.7l4.3-4.3a4 4 0 0 0 5.1-4.7l-2.7 2.7-2.2-.6-.6-2.2 2.4-3Z"></path>'),
    lock:svg('<rect x="4.25" y="8.25" width="11.5" height="8" rx="2"></rect><path d="M6.75 8.25V6a3.25 3.25 0 0 1 6.5 0v2.25"></path><path d="M10 11.25v2"></path>'),
    nowrap:svg('<rect x="2.75" y="7" width="3.5" height="6" rx=".8"></rect><rect x="8.25" y="7" width="3.5" height="6" rx=".8"></rect><path d="M13.75 10h3.5"></path><path d="m15.75 8.5 1.5 1.5-1.5 1.5"></path>'),
    wrap:svg('<rect x="2.75" y="4" width="3.5" height="5" rx=".8"></rect><rect x="8.25" y="4" width="3.5" height="5" rx=".8"></rect><rect x="2.75" y="11" width="3.5" height="5" rx=".8"></rect><path d="M13.25 6.5h2a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2H9"></path><path d="m10.5 10-1.5 1.5 1.5 1.5"></path>'),
    wrapReverse:svg('<rect x="2.75" y="11" width="3.5" height="5" rx=".8"></rect><rect x="8.25" y="11" width="3.5" height="5" rx=".8"></rect><rect x="2.75" y="4" width="3.5" height="5" rx=".8"></rect><path d="M13.25 13.5h2a2 2 0 0 0 2-2v-1a2 2 0 0 0-2-2H9"></path><path d="m10.5 7-1.5 1.5 1.5 1.5"></path>'),
    gridBuilder:svg('<rect x="3.25" y="3.25" width="13.5" height="13.5" rx="2.1"></rect><path d="M7.75 3.25v13.5"></path><path d="M12.25 3.25v13.5"></path><path d="M3.25 7.75h13.5"></path><path d="M3.25 12.25h13.5"></path>'),
    reset:svg('<path d="M4.25 7.25A6.25 6.25 0 1 1 3.75 11"></path><path d="M4.25 3.75v3.5h3.5"></path>'),
    fill:svg('<rect x="3.25" y="3.25" width="13.5" height="13.5" rx="2.1"></rect><path d="M10 3.25v13.5"></path><path d="M3.25 10h13.5"></path><rect x="5" y="5" width="3.25" height="3.25" rx=".65" fill="currentColor" stroke="none"></rect><rect x="11.75" y="5" width="3.25" height="3.25" rx=".65" fill="currentColor" stroke="none"></rect><rect x="5" y="11.75" width="3.25" height="3.25" rx=".65" fill="currentColor" stroke="none"></rect><rect x="11.75" y="11.75" width="3.25" height="3.25" rx=".65" fill="currentColor" stroke="none"></rect>'),
    close:svg('<path d="m5.5 5.5 9 9"></path><path d="m14.5 5.5-9 9"></path>'),
    minus:svg('<path d="M6 10h8"></path>'),
    plus:svg('<path d="M10 6v8"></path><path d="M6 10h8"></path>'),
    stretchX:svg('<path d="M3 10h14"></path><rect x="5" y="7" width="10" height="6" rx="1"></rect>'),
    stretchY:svg('<path d="M10 3v14"></path><rect x="7" y="5" width="6" height="10" rx="1"></rect>'),
    baseline:svg('<path d="M4 15.5h12"></path><path d="M7 6.5h6"></path><path d="M10 6.5v7"></path>')
  };
  return map[name]||'';
}
function displayControl(current='block'){
  const items=[
    ['block','box','Block','Normal flow'],
    ['flex','flex','Flex','One-dimensional'],
    ['grid','grid','Grid','Two-dimensional'],
    ['inline','text','Inline','Content width'],
    ['none','eyeOff','Hidden','Not rendered']
  ];
  const selected=items.some(([value])=>value===current)?current:(String(current).includes('flex')?'flex':String(current).includes('grid')?'grid':String(current).startsWith('inline')?'inline':'block');
  const label=items.find(([value])=>value===selected)?.[2]||'Block';
  return `<div class="layout-model-card">
    <div class="layout-model-head"><div><span class="layout-kicker">LAYOUT MODEL</span><strong>Display</strong></div><span class="layout-mode-pill">${escapeHtml(label)}</span></div>
    <div class="display-control-pro">${items.map(([value,icon,label,desc])=>`<button type="button" data-style-button="display" data-value="${value}" class="${selected===value?'active':''}" title="${label}: ${desc}"><span class="display-pro-icon">${uiIcon(icon)}</span><span><strong>${label}</strong><small>${desc}</small></span></button>`).join('')}</div>
    <label class="layout-advanced-select"><span>Advanced display</span><div>${gridSelect('display',[['block','block'],['inline-block','inline-block'],['flex','flex'],['inline-flex','inline-flex'],['grid','grid'],['inline-grid','inline-grid'],['contents','contents'],['none','none']],current||'block')}</div></label>
  </div>`;
}
function layoutSubpanel(id,title,body,meta={}){
  const open=!!state.layoutPanels[id];
  const icon=meta.icon||({flex:'flex',grid:'grid',gridItem:'grid',flexItem:'flex',inline:'text',size:'box',position:'pointer'}[id]||'layout');
  const subtitle=meta.subtitle||'';
  return `<div class="layout-subpanel layout-panel-${id} ${open?'is-open':''}"><button type="button" class="layout-subpanel-toggle" data-layout-panel="${id}"><span class="layout-subpanel-icon">${uiIcon(icon)}</span><span class="layout-subpanel-copy"><strong>${title}</strong>${subtitle?`<small>${subtitle}</small>`:''}</span><span class="layout-chevron">${layoutIcon('chevron')}</span></button>${open?`<div class="layout-subpanel-body">${body}</div>`:''}</div>`;
}
function layoutIconStrip(prop,values,current,cols='three'){
  return `<div class="layout-icon-strip ${cols}">${values.map(([value,icon,label])=>`<button data-style-button="${prop}" data-value="${value}" class="${current===value?'active':''}" title="${label}" aria-label="${label}">${layoutIcon(icon)}<span>${label}</span></button>`).join('')}</div>`;
}
function layoutProperty(label,control,hint=''){
  return `<div class="layout-property"><div class="layout-property-head"><span>${label}</span>${hint?`<small>${hint}</small>`:''}</div>${control}</div>`;
}
function flexPositionPicker(s){
  const justify=s.justifyContent||s.justify||'flex-start';
  const align=s.alignItems||s.align||'stretch';
  const xValues=[['flex-start','Start'],['center','Center'],['flex-end','End'],['space-between','Space between'],['space-around','Space around'],['space-evenly','Space evenly']];
  const yValues=[['stretch','Stretch'],['flex-start','Start'],['center','Center'],['flex-end','End'],['baseline','Baseline']];
  const gx=justify==='flex-start'?0:justify==='center'?1:2;
  const gy=align==='flex-start'?0:align==='center'?1:align==='flex-end'?2:1;
  return `<div class="layout-align-editor"><div class="alignment-pad alignment-pad-pro">${[0,1,2].flatMap(y=>[0,1,2].map(x=>`<button data-layout-position="flex" data-x="${x}" data-y="${y}" class="${gx===x&&gy===y?'active':''}" aria-label="Alineación ${x}, ${y}"><i></i></button>`)).join('')}</div><div class="axis-selects axis-selects-pro"><label><span>Horizontal</span>${gridSelect('justifyContent',xValues,justify)}</label><label><span>Vertical</span>${gridSelect('alignItems',yValues,align)}</label></div></div>`;
}
function gridPositionPicker(s){
  const justify=s.justifyItems||'stretch';
  const align=s.alignItems||s.align||'stretch';
  const values=[['stretch','Stretch'],['start','Start'],['center','Center'],['end','End']];
  const gx=justify==='start'?0:justify==='center'?1:justify==='end'?2:1;
  const gy=align==='start'?0:align==='center'?1:align==='end'?2:1;
  return `<div class="layout-align-editor"><div class="alignment-pad alignment-pad-pro grid-pad">${[0,1,2].flatMap(y=>[0,1,2].map(x=>`<button data-layout-position="grid" data-x="${x}" data-y="${y}" class="${gx===x&&gy===y?'active':''}" aria-label="Alineación grid ${x}, ${y}"><i></i></button>`)).join('')}</div><div class="axis-selects axis-selects-pro"><label><span>Horizontal</span>${gridSelect('justifyItems',values,justify)}</label><label><span>Vertical</span>${gridSelect('alignItems',values,align)}</label></div></div>`;
}
function layoutCountInput(prop,value,label){
  return `<label class="layout-count"><span>${label}</span><input data-style-prop="${prop}" type="number" min="0" max="24" step="1" value="${value??0}"></label>`;
}
function distributionStrip(prop,current,vertical=false){
  const values=[['start','start','Start'],['center','center','Center'],['end','end','End'],['space-between','between','Between'],['space-around','around','Around'],['space-evenly','evenly','Evenly']];
  return `<div class="layout-distribution ${vertical?'vertical-icons':''}">${values.map(([value,icon,label])=>`<button data-style-button="${prop}" data-value="${value}" class="${current===value?'active':''}" title="${label}" aria-label="${label}">${layoutIcon(icon)}<span>${label}</span></button>`).join('')}</div>`;
}
function gridField(label,control,extra=''){
  return `<div class="grid-settings-field"><span class="grid-settings-label">${label}</span>${control}${extra}</div>`;
}
function gridInput(prop,value='',placeholder=''){
  return `<div class="grid-settings-input"><input data-style-prop="${prop}" value="${escapeHtml(value??'')}" placeholder="${escapeHtml(placeholder)}"><span class="grid-settings-affix" aria-hidden="true">${layoutIcon('wrench')}</span></div>`;
}
function gridSelect(prop,options,current){
  return `<div class="grid-settings-select"><select data-style-prop="${prop}" aria-label="${prop}">${options.map(([v,l])=>`<option value="${v}" ${String(current||'')===String(v)?'selected':''}>${l}</option>`).join('')}</select><span class="grid-settings-chevron">${layoutIcon('chevron')}</span></div>`;
}
function gridItemsStrip(prop,current,axis='x'){
  const values=axis==='x'
    ? [['start','start','Start'],['center','center','Center'],['end','end','End'],['stretch','stretchX','Stretch']]
    : [['start','start','Start'],['center','center','Center'],['end','end','End'],['stretch','stretchY','Stretch'],['baseline','baseline','Baseline']];
  return `<div class="layout-distribution compact ${axis==='y'?'align-items-strip':''}">${values.map(([value,icon,label])=>`<button data-style-button="${prop}" data-value="${value}" class="${current===value?'active':''}" title="${label}" aria-label="${label}">${layoutIcon(icon)}<span>${label}</span></button>`).join('')}</div>`;
}
function gridBuilderNode(){ return state.gridBuilder.nodeId?find(state.nodes,state.gridBuilder.nodeId):null; }
function gridBuilderStyles(){ const node=gridBuilderNode(); return node?effective(node):null; }
function normalizeTrackList(value,count,fallback='1fr'){
  const list=Array.isArray(value)?value.slice(0,count):[];
  while(list.length<count)list.push(fallback);
  return list;
}
function ensureGridBuilderMount(){
  let root=document.getElementById('grid-builder-modal');
  if(root)return root;
  root=document.createElement('div');
  root.id='grid-builder-modal';
  root.className='grid-builder-modal';
  root.hidden=true;
  document.body.appendChild(root);
  return root;
}
function updateGridBuilderStyles(changes){
  const id=state.gridBuilder.nodeId; if(!id)return;
  const before=snapshot(); const key=bpKey();
  state.nodes=update(state.nodes,id,n=>({...n,styles:{...n.styles,[key]:{...(n.styles?.[key]||{}),...changes}}}));
  setSelection(id); pushHistory(before); markUnsaved(); render();
}
function openGridBuilder(){
  const node=selected(); if(!node||!accepts(node))return;
  const s=effective(node);
  if(!String(s.display||'').includes('grid')){ commit(()=>directStyle('display','grid')); }
  state.gridBuilder.open=true; state.gridBuilder.nodeId=node.id; renderGridBuilder();
}
function closeGridBuilder(){ state.gridBuilder.open=false; state.gridBuilder.nodeId=null; renderGridBuilder(); }
function gridBuilderStep(prop,delta){
  const s=gridBuilderStyles(); if(!s)return;
  const current=Math.max(1,Number(s[prop])||1); const next=Math.max(1,Math.min(24,current+delta));
  const changes={[prop]:next};
  if(prop==='gridColumns')changes.gridColumnTracks=normalizeTrackList(s.gridColumnTracks,next,s.gridUseMinMax?'minmax(0,1fr)':'1fr');
  if(prop==='gridRows')changes.gridRowTracks=normalizeTrackList(s.gridRowTracks,next,'1fr');
  updateGridBuilderStyles(changes);
}
function resetGridBuilder(){ updateGridBuilderStyles({display:'grid',gridColumns:2,gridRows:1,gap:'30px',gridUseMinMax:false,gridColumnTracks:['1fr','1fr'],gridRowTracks:['1fr']}); }
function fillGridBuilder(){
  const node=gridBuilderNode(),s=gridBuilderStyles(); if(!node||!s)return;
  const cols=Math.max(1,Number(s.gridColumns)||1); const rows=Math.max(1,Math.ceil(Math.max(1,(node.children||[]).length)/cols));
  updateGridBuilderStyles({gridRows:rows,gridRowTracks:normalizeTrackList(s.gridRowTracks,rows,'1fr')});
}
function renderGridBuilder(){
  const root=ensureGridBuilderMount();
  if(!state.gridBuilder.open){root.hidden=true;root.innerHTML='';return;}
  const node=gridBuilderNode(); if(!node){closeGridBuilder();return;}
  const s=effective(node); const cols=Math.max(1,Number(s.gridColumns)||1); const rows=Math.max(1,Number(s.gridRows)||1);
  const gap=cssValue(s.gap)||'0px'; const colTracks=normalizeTrackList(s.gridColumnTracks,cols,s.gridUseMinMax?'minmax(0,1fr)':'1fr'); const rowTracks=normalizeTrackList(s.gridRowTracks,rows,'1fr');
  const children=node.children||[]; const cellCount=cols*rows;
  const cells=Array.from({length:cellCount},(_,index)=>{const child=children[index];return `<button class="vgb-cell ${child?'has-item':''}" type="button" title="${child?escapeHtml(child.name):`Celda ${index+1}`}">${child?`<span class="vgb-cell-index">${index}</span><strong>${escapeHtml(child.name)}</strong>`:'<span class="vgb-empty-cell"></span>'}</button>`;}).join('');
  root.hidden=false;
  root.innerHTML=`<div class="vgb-backdrop" data-grid-builder-close></div><section class="vgb-window" role="dialog" aria-modal="true" aria-label="Visual Grid Builder"><header class="vgb-header"><strong>VISUAL GRID BUILDER</strong><div class="vgb-header-actions"><button type="button" data-grid-builder-reset title="Reset grid">${layoutIcon('reset')}</button><button type="button" data-grid-builder-close title="Cerrar">${layoutIcon('close')}</button></div></header><div class="vgb-controls"><label><span>Columns</span><div class="vgb-stepper"><input value="${cols}" readonly><span><button type="button" data-grid-builder-step="gridColumns" data-delta="1">${layoutIcon('plus')}</button><button type="button" data-grid-builder-step="gridColumns" data-delta="-1">${layoutIcon('minus')}</button></span></div></label><label><span>Rows</span><div class="vgb-stepper"><input value="${rows}" readonly><span><button type="button" data-grid-builder-step="gridRows" data-delta="1">${layoutIcon('plus')}</button><button type="button" data-grid-builder-step="gridRows" data-delta="-1">${layoutIcon('minus')}</button></span></div></label><label><span>Gap</span><input class="vgb-gap-input" data-grid-builder-gap value="${escapeHtml(gap)}"></label><label class="vgb-minmax"><span>Use min/max</span><button type="button" class="vgb-switch ${s.gridUseMinMax?'active':''}" data-grid-builder-minmax aria-pressed="${!!s.gridUseMinMax}"><i></i></button></label></div><div class="vgb-canvas"><div class="vgb-column-tracks" style="grid-template-columns:repeat(${cols},minmax(120px,1fr))">${colTracks.map((track,index)=>`<input data-grid-track-col="${index}" value="${escapeHtml(track)}" aria-label="Column ${index+1} track">`).join('')}</div><div class="vgb-grid-body"><div class="vgb-row-tracks" style="grid-template-rows:repeat(${rows},84px)">${rowTracks.map((track,index)=>`<input data-grid-track-row="${index}" value="${escapeHtml(track)}" aria-label="Row ${index+1} track">`).join('')}</div><div class="vgb-grid" style="grid-template-columns:repeat(${cols},minmax(120px,1fr));grid-template-rows:repeat(${rows},84px);gap:${escapeHtml(gap)}">${cells}</div></div></div></section>`;
}
function flexSettings(s){
  if(!String(s.display||'').includes('flex'))return '';
  const direction=s.direction||'row';
  const body=`<div class="layout-card-section">
      <div class="layout-card-section-head"><strong>Flow</strong><small>Direction and wrapping</small></div>
      ${layoutProperty('Direction',layoutIconStrip('direction',[['row','row','Row'],['column','column','Column'],['row-reverse','reverse','Reverse']],direction))}
      ${layoutProperty('Wrap',layoutIconStrip('flexWrap',[['nowrap','nowrap','No wrap'],['wrap','wrap','Wrap'],['wrap-reverse','wrapReverse','Reverse']],s.flexWrap||'nowrap'))}
    </div>
    <div class="layout-card-section">
      <div class="layout-card-section-head"><strong>Alignment</strong><small>Place children inside the container</small></div>
      ${flexPositionPicker(s)}
    </div>
    <div class="layout-card-section layout-two-column">
      ${layoutProperty('Gap',unitInput('gap',s.gap||'0px'),'Between children')}
      ${layoutProperty('Overflow',gridSelect('overflow',[['visible','Visible'],['hidden','Hidden'],['clip','Clip'],['auto','Auto'],['scroll','Scroll']],s.overflow||'visible'))}
    </div>`;
  return layoutSubpanel('flex','Flex layout',body,{icon:'flex',subtitle:'Flow, alignment and spacing'});
}
function gridAreaNames(value=''){
  const names=String(value||'').replace(/["']/g,' ').split(/\s+/).map(item=>item.trim()).filter(item=>item&&item!=='.');
  return [...new Set(names)];
}
function gridSettings(s){
  if(!String(s.display||'').includes('grid'))return '';
  const areas=gridAreaNames(s.gridTemplateAreas);
  const areaPreview=areas.length?`<div class="grid-area-chips">${areas.map(name=>`<span>${escapeHtml(name)}</span>`).join('')}</div>`:'<p class="grid-area-empty">Create named areas such as “header header” and “sidebar main”.</p>';
  const body=`<button class="grid-builder-launch-card" type="button" data-grid-builder-open><span>${layoutIcon('gridBuilder')}</span><span><strong>Visual Grid Builder</strong><small>Edit tracks and cells on a larger canvas</small></span><span class="grid-launch-arrow">↗</span></button>
    <div class="layout-card-section">
      <div class="layout-card-section-head"><strong>Template</strong><small>Define columns and rows</small></div>
      <div class="layout-two-column">${gridField('Columns',gridInput('gridTemplateColumns',s.gridTemplateColumns||((Array.isArray(s.gridColumnTracks)&&s.gridColumnTracks.length)?s.gridColumnTracks.join(' '):''),'repeat(2, 1fr)'))}${gridField('Rows',gridInput('gridTemplateRows',s.gridTemplateRows||((Array.isArray(s.gridRowTracks)&&s.gridRowTracks.length)?s.gridRowTracks.join(' '):''),'auto'))}</div>
      ${gridField('Areas',`<textarea class="grid-areas-input" data-style-prop="gridTemplateAreas" rows="4" placeholder='"header header"\n"sidebar main"'>${escapeHtml(s.gridTemplateAreas||'')}</textarea>`,areaPreview)}
    </div>
    <div class="layout-card-section">
      <div class="layout-card-section-head"><strong>Flow & spacing</strong><small>Automatic placement behavior</small></div>
      <div class="layout-two-column">${gridField('Auto flow',gridSelect('gridAutoFlow',[['row','Row'],['column','Column'],['row dense','Row dense'],['column dense','Column dense']],s.gridAutoFlow||'row'))}${gridField('Gap',unitInput('gap',s.gap||'0px'))}</div>
      <div class="layout-two-column">${gridField('Auto columns',gridInput('gridAutoColumns',s.gridAutoColumns||'auto','auto'))}${gridField('Auto rows',gridInput('gridAutoRows',s.gridAutoRows||'auto','auto'))}</div>
    </div>
    <div class="layout-card-section">
      <div class="layout-card-section-head"><strong>Alignment</strong><small>Align tracks and grid items</small></div>
      ${gridPositionPicker(s)}
      ${gridField('Justify content',distributionStrip('justifyContent',s.justifyContent||'start'))}
      ${gridField('Align content',distributionStrip('alignContent',s.alignContent||'start',true))}
    </div>`;
  return layoutSubpanel('grid','Grid layout',body,{icon:'grid',subtitle:'Tracks, areas and placement'});
}
function gridItemSettings(node,s){
  const info=findInfo(state.nodes,node.id);const parent=info?.parentId?find(state.nodes,info.parentId):null;const parentStyle=parent?effective(parent):{};
  if(!parent||!String(parentStyle.display||'').includes('grid'))return '';
  const names=gridAreaNames(parentStyle.gridTemplateAreas);
  const areaControl=names.length?gridSelect('gridArea',[['auto','Auto'],...names.map(name=>[name,name])],s.gridArea||'auto'):gridInput('gridArea',s.gridArea||'auto','area-name');
  const body=`<div class="layout-two-column">${gridField('Area',areaControl)}${gridField('Order',gridInput('order',s.order??0,'0'))}</div>
    <div class="layout-two-column">${gridField('Column',gridInput('gridColumn',s.gridColumn||'auto','1 / 3'))}${gridField('Row',gridInput('gridRow',s.gridRow||'auto','1 / 2'))}</div>
    <div class="layout-two-column">${gridField('Align self',gridSelect('alignSelf',[['auto','Auto'],['stretch','Stretch'],['start','Start'],['center','Center'],['end','End']],s.alignSelf||'auto'))}${gridField('Justify self',gridSelect('justifySelf',[['auto','Auto'],['stretch','Stretch'],['start','Start'],['center','Center'],['end','End']],s.justifySelf||'auto'))}</div>`;
  return layoutSubpanel('gridItem','Grid child',body,{icon:'grid',subtitle:'Placement inside parent grid'});
}
function flexItemSettings(node,s){
  const info=findInfo(state.nodes,node.id);const parent=info?.parentId?find(state.nodes,info.parentId):null;const parentStyle=parent?effective(parent):{};
  if(!parent||!String(parentStyle.display||'').includes('flex'))return '';
  const body=`<div class="layout-three-column">${gridField('Grow',gridInput('flexGrow',s.flexGrow??0,'0'))}${gridField('Shrink',gridInput('flexShrink',s.flexShrink??1,'1'))}${gridField('Order',gridInput('order',s.order??0,'0'))}</div>
    <div class="layout-two-column">${gridField('Basis',unitInput('flexBasis',s.flexBasis||'auto'))}${gridField('Align self',gridSelect('alignSelf',[['auto','Auto'],['stretch','Stretch'],['flex-start','Start'],['center','Center'],['flex-end','End'],['baseline','Baseline']],s.alignSelf||'auto'))}</div>`;
  return layoutSubpanel('flexItem','Flex child',body,{icon:'flex',subtitle:'Growth and alignment in parent'});
}
function inlineSettings(s){
  if(!String(s.display||'').startsWith('inline'))return '';
  const body=`${layoutProperty('Vertical align',gridSelect('verticalAlign',[['baseline','Baseline'],['top','Top'],['middle','Middle'],['bottom','Bottom'],['text-top','Text top'],['text-bottom','Text bottom']],s.verticalAlign||'baseline'))}`;
  return layoutSubpanel('inline','Inline layout',body,{icon:'text',subtitle:'Baseline alignment'});
}
function sizeSettings(s,node){
  const body=`<div class="layout-size-grid">
    ${gridField('Width',unitInput('width',s.width||'auto'))}${gridField('Height',unitInput('height',s.height||'auto'))}
    ${gridField('Min width',unitInput('minWidth',s.minWidth||'0px'))}${gridField('Min height',unitInput('minHeight',s.minHeight||'0px'))}
    ${gridField('Max width',unitInput('maxWidth',s.maxWidth||'none'))}${gridField('Max height',unitInput('maxHeight',s.maxHeight||'none'))}
    ${gridField('Aspect ratio',gridInput('aspectRatio',s.aspectRatio||'auto','16 / 9'))}${gridField('Box sizing',gridSelect('boxSizing',[['border-box','Border box'],['content-box','Content box']],s.boxSizing||'border-box'))}
  </div>`;
  return layoutSubpanel('size','Dimensions',body,{icon:'box',subtitle:'Width, height and constraints'});
}
function positionSettings(s){
  const position=s.position||'static';
  const offsets=position!=='static'?`<div class="position-offset-grid">${gridField('Top',unitInput('top',s.top||'auto'))}${gridField('Right',unitInput('right',s.right||'auto'))}${gridField('Bottom',unitInput('bottom',s.bottom||'auto'))}${gridField('Left',unitInput('left',s.left||'auto'))}</div>`:'';
  const body=`${gridField('Position',gridSelect('position',[['static','Static'],['relative','Relative'],['absolute','Absolute'],['fixed','Fixed'],['sticky','Sticky']],position))}${offsets}<div class="layout-two-column">${gridField('Z-index',gridInput('zIndex',s.zIndex??'auto','auto'))}${gridField('Overflow',gridSelect('overflow',[['visible','Visible'],['hidden','Hidden'],['clip','Clip'],['auto','Auto'],['scroll','Scroll']],s.overflow||'visible'))}</div>`;
  return layoutSubpanel('position','Position',body,{icon:'pointer',subtitle:'Placement and stacking'});
}
function semanticInspector(node){
  const options=(semanticTagOptions[node.type]||['div']).map(tag=>[tag,`<${tag}>`]);
  const tagControl=`<select data-node-prop="htmlTag">${options.map(([v,l])=>`<option value="${v}" ${semanticTag(node)===v?'selected':''}>${escapeHtml(l)}</option>`).join('')}</select>`;
  let extra=field('ARIA label',textInput('ariaLabel',node.ariaLabel||''));
  if(node.type==='image'&&semanticTag(node)==='figure')extra+=field('Figcaption',textInput('caption',node.caption||''));
  if(node.type==='button')extra+=`<p class="hint">Usa <strong>&lt;a&gt;</strong> para navegar y <strong>&lt;button&gt;</strong> para ejecutar acciones.</p>`;
  return `${field('HTML semántico',tagControl)}${extra}<div class="semantic-preview"><span>Salida</span><code>${escapeHtml(`<${semanticTag(node)} class="${classAttribute(node)}">`)}</code></div>`;
}
function classManagerInspector(node){
  const base=bemBaseClass(node);
  const final=nodeClassList(node).join(' ');
  const assigned=(node.globalClassIds||[]).map(globalClassById).filter(Boolean);
  const primary=primarySharedStyleClass(node);
  const globalAssignments=state.globalClasses.length?`<div class="global-class-picker">${state.globalClasses.map(item=>`<button type="button" data-toggle-global-class="${item.id}" class="${(node.globalClassIds||[]).includes(item.id)?'active':''}"><span>.${escapeHtml(item.name)}</span>${(node.globalClassIds||[]).includes(item.id)?'<b>✓</b>':''}</button>`).join('')}</div>`:'<p class="hint">No hay clases globales. Créala desde la pestaña Clases.</p>';
  return `<div class="bem-manager">
    ${field('Clases globales',globalAssignments)}
    ${assigned.length?field('Clase principal de edición',`<div class="shared-style-primary"><div><select data-primary-style-class>${assigned.map(item=>`<option value="${item.id}" ${primary?.id===item.id?'selected':''}>.${escapeHtml(item.name)}</option>`).join('')}</select><small>Las propiedades del Inspector modifican esta clase cuando el modo Compartido está activo.</small></div></div>`):''}
    ${primary&&node.styleEditMode==='local'?'<div class="shared-style-local-note">Las nuevas modificaciones se guardarán solamente en este elemento. La clase compartida seguirá vinculada.</div>':''}
    ${field('BEM block',`<input data-bem-block value="${escapeHtml(node.bemBlock||'')}" placeholder="hero / site-header">`)}
    ${field('BEM element',`<input data-bem-element value="${escapeHtml(node.bemElement||'')}" placeholder="title / button / media">`)}
    ${field('Modifiers',`<input data-bem-modifiers value="${escapeHtml((node.bemModifiers||[]).join(', '))}" placeholder="dark, centered">`)}
    ${field('Clases adicionales',`<input data-custom-classes value="${escapeHtml((node.customClasses||[]).join(' '))}" placeholder="utility-class another-class">`)}
    ${field('Custom CSS · declaraciones',`<textarea data-node-prop="customCss" rows="4" placeholder="position: sticky;
filter: blur(8px);">${escapeHtml(node.customCss||'')}</textarea>`)}
    <div class="bem-preview"><span>Clase base</span><code>${escapeHtml(base)}</code><span>Clases finales</span><code>${escapeHtml(final)}</code></div>
    <button class="secondary-action bem-generate" type="button" data-generate-bem>Generar estructura BEM</button>
    <p class="hint">Las clases globales se aplican antes de los estilos del elemento, por lo que puedes crear overrides locales sin perder la reutilización.</p>
  </div>`;
}
function inferBemElement(node){
  const tag=semanticTag(node);
  if(node.type==='heading')return tag==='h1'?'title':'heading';
  if(['button','link'].includes(node.type))return 'button';
  if(['image','video','gallery','svg'].includes(node.type))return 'media';
  if(['statCard','testimonial','pricingCard','faqItem'].includes(node.type))return 'layout';
  if(tag==='nav')return 'navigation';
  if(tag==='ul'||tag==='ol')return 'list';
  if(tag==='li')return 'item';
  if(tag==='footer')return 'footer';
  if(tag==='header')return 'header';
  if(['text','richtext','badge','quote'].includes(node.type))return 'text';
  return slug(node.name||node.type);
}
function generateBemForSelection(){
  const current=selected(); if(!current)return;
  let node=accepts(current)?current:null;
  let cursor=current.id; let nearestContainer=null;
  while(cursor){
    const info=findInfo(state.nodes,cursor); if(!info?.parentId)break;
    const parent=find(state.nodes,info.parentId); if(!parent)break;
    if(!nearestContainer&&parent.type==='container')nearestContainer=parent;
    if(['section','card'].includes(parent.type)){node=parent;break;}
    cursor=parent.id;
  }
  node=node||nearestContainer||current;
  const block=sanitizeClass(node.bemBlock||node.name||'component');
  const used=new Map();
  function walk(item,isRoot=false){
    let element='';
    if(!isRoot){
      const proposed=sanitizeClass(item.bemElement||inferBemElement(item));
      const count=(used.get(proposed)||0)+1; used.set(proposed,count);
      element=count>1?`${proposed}-${count}`:proposed;
    }
    const next={...item,bemBlock:block,bemElement:element,bemModifiers:item.bemModifiers||[],customClasses:item.customClasses||[]};
    if(item.children)next.children=item.children.map(child=>walk(child,false));
    return next;
  }
  commit(()=>{state.nodes=update(state.nodes,node.id,n=>walk(n,true));},current.id);
  toast(`BEM generado: ${block}`);
}
function updateBemBlock(nodeId,newBlock){
  const target=find(state.nodes,nodeId); if(!target)return;
  const old=target.bemBlock||''; const clean=sanitizeClass(newBlock);
  function walk(item,isRoot=false){
    const next={...item};
    if(isRoot||item.bemBlock===old||!item.bemBlock)next.bemBlock=clean;
    if(item.children)next.children=item.children.map(child=>walk(child,false));
    return next;
  }
  state.nodes=update(state.nodes,nodeId,node=>walk(node,true));
}
function compactLayoutControl(node,s){
  const display=s.display||'block';
  let body=`<div class="essential-control-grid"><div class="essential-control-span">${field('Display',segmented('display',[['block','Block'],['flex','Flex'],['grid','Grid']],display),'')}</div>${field('Width',unitInput('width',s.width||'auto'))}${field('Height',unitInput('height',s.height||'auto'))}${field('Max width',unitInput('maxWidth',s.maxWidth||'none'))}${field('Min height',unitInput('minHeight',s.minHeight||'0px'))}</div>`;
  if(String(display).includes('flex'))body+=`<div class="essential-layout-card"><div class="essential-card-title"><strong>Flex layout</strong><span>Edita también desde la barra del canvas</span></div>${field('Direction',segmented('direction',[['row','Horizontal'],['column','Vertical']],s.direction||'row'))}<div class="field-grid">${field('Align',selectInput('alignItems',[['flex-start','Start'],['center','Center'],['flex-end','End'],['stretch','Stretch']],s.alignItems||s.align||'stretch'))}${field('Justify',selectInput('justifyContent',[['flex-start','Start'],['center','Center'],['space-between','Between'],['flex-end','End']],s.justifyContent||s.justify||'flex-start'))}</div>${field('Gap',unitInput('gap',s.gap||'0px'))}</div>`;
  if(String(display).includes('grid'))body+=`<div class="essential-layout-card"><div class="essential-card-title"><strong>Grid layout</strong><span>Control rápido del layout</span></div><div class="field-grid">${field('Columnas',`<input data-style-prop="gridColumns" type="number" min="1" max="12" value="${Math.max(1,Number(s.gridColumns)||1)}">`)}${field('Gap',unitInput('gap',s.gap||'0px'))}</div><button type="button" class="secondary-action essential-open-grid" data-grid-builder-open>Abrir Grid Builder</button></div>`;
  return `<div class="essential-layout-control">${body}</div>`;
}
function compactSpacingControl(node,s){
  const input=(prop,label,group)=>`<label class="compact-spacing-field"><span>${label}</span>${spacingUnitInput(prop,group,s[prop]||'0px')}</label>`;
  const groupHead=(group,title,description)=>`<div class="compact-spacing-heading compact-spacing-heading-pro"><div><strong>${title}</strong><span>${description}</span></div>${spacingLinkControl(group,true)}</div>`;
  const gap=String(s.display||'').includes('flex')||String(s.display||'').includes('grid')?`<div class="compact-spacing-gap">${field('Gap entre elementos',unitInput('gap',s.gap||'0px'))}</div>`:'';
  return `<div class="compact-spacing-control">${groupHead('padding','Padding','Espacio interior')}<div class="compact-spacing-grid">${input('paddingTop','Top','padding')}${input('paddingRight','Right','padding')}${input('paddingBottom','Bottom','padding')}${input('paddingLeft','Left','padding')}</div>${groupHead('margin','Margin','Separación exterior')}<div class="compact-spacing-grid">${input('marginTop','Top','margin')}${input('marginRight','Right','margin')}${input('marginBottom','Bottom','margin')}${input('marginLeft','Left','margin')}</div>${gap}<p class="compact-spacing-help">Vincula lados opuestos o usa un solo valor para los cuatro lados.</p></div>`;
}
const responsivePropertyLabels={display:'Display',direction:'Dirección',gridColumns:'Columnas',gridTemplateColumns:'Grid template',width:'Width',maxWidth:'Max width',minWidth:'Min width',height:'Height',minHeight:'Min height',gap:'Gap',rowGap:'Row gap',columnGap:'Column gap',paddingTop:'Padding top',paddingRight:'Padding right',paddingBottom:'Padding bottom',paddingLeft:'Padding left',marginTop:'Margin top',marginRight:'Margin right',marginBottom:'Margin bottom',marginLeft:'Margin left',fontSize:'Font size',lineHeight:'Line height',letterSpacing:'Letter spacing',textAlign:'Text align',alignItems:'Align items',justifyContent:'Justify',position:'Position',left:'Left',right:'Right',top:'Top',bottom:'Bottom',overflow:'Overflow'};
function responsiveValueDetail(node,prop,bp){
  const classes=(node.globalClassIds||[]).map(globalClassById).filter(Boolean);let value;let source='Sin definir';let kind='empty';
  classes.forEach(item=>{if(Object.prototype.hasOwnProperty.call(item.styles?.base||{},prop)){value=item.styles.base[prop];source=`Clase .${item.name}`;kind='class';}});
  if(Object.prototype.hasOwnProperty.call(node.styles?.base||{},prop)){value=node.styles.base[prop];source='Desktop base';kind='base';}
  responsiveCascadeKeys(bp).forEach(key=>{
    classes.forEach(item=>{if(Object.prototype.hasOwnProperty.call(item.styles?.[key]||{},prop)){value=item.styles[key][prop];source=`Clase · ${breakpointLabels[key]}`;kind='class';}});
    if(Object.prototype.hasOwnProperty.call(node.styles?.[key]||{},prop)){value=node.styles[key][prop];source=key===bp?`Override ${breakpointLabels[key]}`:`Heredado de ${breakpointLabels[key]}`;kind=key===bp?'override':'inherited';}
  });
  if(value!==undefined&&String(value).includes('var(--'))kind='token';
  return {value,source,kind};
}
function responsiveChangedProperties(node){
  const classStyles=(node.globalClassIds||[]).map(globalClassById).filter(Boolean).flatMap(item=>[item.styles?.base||{},item.styles?.tablet||{},item.styles?.mobileL||{},item.styles?.mobile||{}]);
  const own=[node.styles?.base||{},node.styles?.desktop||{},node.styles?.tablet||{},node.styles?.mobileL||{},node.styles?.mobile||{}];
  const props=[...new Set([...classStyles,...own].flatMap(group=>Object.keys(group)))];
  return props.filter(prop=>{
    const details=CORE_BREAKPOINTS.map(bp=>responsiveValueDetail(node,prop,bp));const values=details.map(item=>JSON.stringify(item.value));
    return new Set(values).size>1||['tablet','mobileL','mobile'].some(bp=>Object.prototype.hasOwnProperty.call(node.styles?.[bp]||{},prop));
  }).sort((a,b)=>(responsivePropertyLabels[a]||a).localeCompare(responsivePropertyLabels[b]||b));
}
function formatResponsiveValue(value){if(value===undefined||value===null||value==='')return '—';if(typeof value==='number')return String(value);if(Array.isArray(value))return value.join(' ');return String(value);}
function responsiveInspector(node){
  const props=responsiveChangedProperties(node);const cells=(prop,bp)=>{const detail=responsiveValueDetail(node,prop,bp);const local=bp!=='desktop'&&Object.prototype.hasOwnProperty.call(node.styles?.[bp]||{},prop);return `<div class="responsive-matrix-cell source-${detail.kind}"><strong>${escapeHtml(formatResponsiveValue(detail.value))}</strong><small>${escapeHtml(detail.source)}</small>${local?`<button type="button" data-responsive-reset-prop="${prop}" data-responsive-bp="${bp}" title="Restablecer esta propiedad">×</button>`:''}</div>`;};
  return `<div class="responsive-inspector-pro"><header><div><strong>Edición responsive</strong><span>Solo propiedades diferentes entre Desktop, Tablet y Mobile.</span></div><div><button type="button" data-open-responsive-audit>Audit</button><button type="button" data-open-responsive-compare>Comparar</button></div></header>${props.length?`<div class="responsive-matrix-head"><span>Propiedad</span>${CORE_BREAKPOINTS.map(bp=>`<span>${breakpointLabels[bp]}</span>`).join('')}<span></span></div><div class="responsive-matrix">${props.map(prop=>`<div class="responsive-matrix-row"><div class="responsive-matrix-property"><strong>${escapeHtml(responsivePropertyLabels[prop]||prop)}</strong><code>${escapeHtml(prop)}</code></div>${CORE_BREAKPOINTS.map(bp=>cells(prop,bp)).join('')}<div class="responsive-matrix-action"><button type="button" data-responsive-apply-down="${prop}" title="Aplicar Desktop a Tablet y Mobile">↓</button></div></div>`).join('')}</div><div class="responsive-matrix-footer"><span><i class="legend-base"></i>Base</span><span><i class="legend-override"></i>Override</span><span><i class="legend-inherited"></i>Heredado</span><span><i class="legend-token"></i>Token</span></div>`:`<div class="responsive-empty"><strong>Sin diferencias responsive</strong><span>Este elemento mantiene los mismos valores en Desktop, Tablet y Mobile.</span></div>`}</div>`;
}
function resetResponsiveProperty(nodeId,prop,bp){
  if(bp==='desktop')return;commit(()=>{state.nodes=update(state.nodes,nodeId,node=>{const styles={...node.styles};const group={...(styles[bp]||{})};delete group[prop];if(Object.keys(group).length)styles[bp]=group;else delete styles[bp];return {...node,styles};});});
}
function applyResponsivePropertyDown(nodeId,prop){
  const node=find(state.nodes,nodeId);if(!node)return;const value=responsiveValueDetail(node,prop,'desktop').value;if(value===undefined)return;
  commit(()=>{state.nodes=update(state.nodes,nodeId,item=>({...item,styles:{...item.styles,tablet:{...(item.styles?.tablet||{}),[prop]:clone(value)},mobile:{...(item.styles?.mobile||{}),[prop]:clone(value)}}}));});toast(`${responsivePropertyLabels[prop]||prop} aplicado a Tablet y Mobile`);
}
function componentPropertyValue(root,prop){
  const target=componentNodeByPath(root,prop.path);
  return target?target[prop.property]:'';
}
function componentPropertyInput(component,root,prop){
  const value=componentPropertyValue(root,prop)??'';
  const attrs=`data-component-prop-input="${prop.id}" data-component-id="${component.id}" data-component-root-id="${root.id}"`;
  if(prop.type==='textarea')return `<textarea ${attrs} rows="3">${escapeHtml(value)}</textarea>`;
  const type=prop.type==='link'?'url':'text';
  return `<input ${attrs} type="${type}" value="${escapeHtml(value)}" placeholder="${prop.type==='image'?'URL o asset de imagen':'Valor'}">`;
}
function componentOverrideLabel(component,root,entry){
  const prop=(component.props||[]).find(item=>item.path===entry.path&&item.property===entry.property);
  if(prop)return prop.name;
  const target=componentNodeByPath(root,entry.path);
  const scope=entry.kind==='style'&&entry.scope?` · ${String(entry.scope).replace('|',' / ')}`:'';
  return `${target?.name||entry.path} · ${responsivePropertyLabels[entry.property]||entry.property}${scope}`;
}
function componentInspectorPanel(component,root){
  const isMaster=root.componentSource==='master';
  const variants=component.variants||[];
  const overrides=componentOverrideEntries(root);
  const props=component.props||[];
  const variantId=root.componentVariantId||'';
  const variantSelect=!isMaster?`<label class="component-instance-variant"><span>Variante</span><select data-component-variant-select="${component.id}" data-component-root-id="${root.id}"><option value="" ${!variantId?'selected':''}>Default</option>${variants.map(variant=>`<option value="${variant.id}" ${variantId===variant.id?'selected':''}>${escapeHtml(variant.name)}</option>`).join('')}</select></label>`:'';
  const propsHtml=props.length?`<div class="component-instance-props">${props.map(prop=>`<label><span>${escapeHtml(prop.name)}<small>${escapeHtml(prop.type)}</small></span>${componentPropertyInput(component,root,prop)}</label>`).join('')}</div>`:`<div class="component-instance-empty"><strong>Sin props configuradas</strong><span>Detecta textos, enlaces e imágenes para editarlos sin entrar al componente.</span><button type="button" data-component-properties="${component.id}">Configurar propiedades</button></div>`;
  const overridesHtml=!isMaster&&overrides.length?`<div class="component-overrides-list"><header><span>${overrides.length} ${overrides.length===1?'override local':'overrides locales'}</span><button type="button" data-reset-component-overrides="${root.id}">Restablecer todo</button></header>${overrides.map(entry=>`<div><span>${escapeHtml(componentOverrideLabel(component,root,entry))}</span><button type="button" data-reset-component-override="${entry.key}" data-component-root-id="${root.id}" title="Restablecer">×</button></div>`).join('')}</div>`:!isMaster?'<div class="component-overrides-clean"><span>✓</span><small>Instancia sincronizada, sin overrides locales.</small></div>':'';
  return `<section class="component-instance-panel ${isMaster?'is-master':'is-instance'}"><header><div><span>${isMaster?'MASTER COMPONENT':'INSTANCE PROPERTIES'}</span><strong>${isMaster?'Valores principales':'Contenido y variantes'}</strong></div><div><button type="button" data-component-properties="${component.id}" title="Administrar props">${uiIcon('settings')}</button><button type="button" data-component-variants="${component.id}" title="Administrar variantes">◇</button></div></header>${variantSelect}${propsHtml}${overridesHtml}</section>`;
}

function renderInspector(){
  state.inspectorMode='advanced';
  const ids=selectedIds();
  if(ids.length>=2){
    const count=ids.length;
    els.actions.innerHTML=`<button data-multi="group" title="Agrupar">${uiIcon('component')}</button><button data-action="delete" class="danger" title="Eliminar">${uiIcon('trash')}</button>`;
    els.inspector.innerHTML=`<div class="inspector-edit-workspace"><header class="multi-selection-inspector-head"><span>MULTISELECCIÓN</span><h2>${count} Elementos Seleccionados</h2><p>Alinea, distribuye espacios o agrupa los elementos seleccionados.</p></header><div class="multi-selection-inspector-body"><section class="inspector-section"><header><span>ALIGNMENT</span><h3>Alineación de bordes y centros</h3></header><div class="alignment-tools-grid"><button type="button" class="alignment-tool-btn" data-multi="left" title="Alinear a la izquierda"><span class="align-icon">${uiIcon('alignLeft')}</span><span>Izquierda</span></button><button type="button" class="alignment-tool-btn" data-multi="center" title="Centrar horizontalmente"><span class="align-icon">${uiIcon('alignCenter')}</span><span>Centro X</span></button><button type="button" class="alignment-tool-btn" data-multi="right" title="Alinear a la derecha"><span class="align-icon">${uiIcon('alignRight')}</span><span>Derecha</span></button><button type="button" class="alignment-tool-btn" data-multi="top" title="Alinear arriba"><span class="align-icon">${uiIcon('alignTop')}</span><span>Arriba</span></button><button type="button" class="alignment-tool-btn" data-multi="middle" title="Centrar verticalmente"><span class="align-icon">${uiIcon('alignMiddle')}</span><span>Centro Y</span></button><button type="button" class="alignment-tool-btn" data-multi="bottom" title="Alinear abajo"><span class="align-icon">${uiIcon('alignBottom')}</span><span>Abajo</span></button></div></section><section class="inspector-section"><header><span>DISTRIBUTION</span><h3>Distribución de espacio</h3></header><div class="distribution-tools-grid"><button type="button" class="alignment-tool-btn" data-multi="distribute-x" title="Distribuir horizontalmente"><span class="align-icon">${uiIcon('distributeX')}</span><span>Equidistante X</span></button><button type="button" class="alignment-tool-btn" data-multi="distribute-y" title="Distribuir verticalmente"><span class="align-icon">${uiIcon('distributeY')}</span><span>Equidistante Y</span></button></div></section><section class="inspector-section"><header><span>STRUCTURE</span><h3>Agrupamiento</h3></header><button type="button" class="primary-action multi-group-btn" data-multi="group">${uiIcon('component')} <span>Agrupar elementos (${count})</span></button></section></div></div>`;
    return;
  }
  const node=selected();
  if(!node){
    els.actions.innerHTML='';
    const emptyTabs=createInspectorTabs({activeTab:state.inspectorTab||'content',renderIcon:uiIcon});
    els.inspector.innerHTML=`<div class="inspector-edit-workspace">${emptyTabs}<div class="inspector-edit-content"><div class="inspector-empty inspector-empty-pro"><span class="inspector-empty-icon">${uiIcon('settings')}</span><h3>Editar está listo</h3><p>Selecciona un elemento del canvas o inserta uno nuevo para modificar sus propiedades.</p><div class="inspector-empty-actions"><button type="button" data-empty-add>${uiIcon('plus')} Añadir elemento</button><button type="button" data-open-layers>${uiIcon('layers')} Abrir capas</button></div><small>Consejo: usa <kbd>⌘K</kbd> para buscar cualquier acción.</small></div></div></div>`;
    return;
  }
  els.actions.innerHTML=`<button data-create-component title="Crear componente">${uiIcon('component')}</button><button data-action="up" title="Subir">${uiIcon('arrowUp')}</button><button data-action="down" title="Bajar">${uiIcon('arrowDown')}</button><button data-action="duplicate" title="Duplicar">${uiIcon('copy')}</button><button data-action="delete" class="danger" title="Eliminar">${uiIcon('trash')}</button>`;
  const s=effective(node);
  if(state.layoutNodeId!==node.id){const display=s.display||'block';state.layoutNodeId=node.id;state.layoutPanels.flex=display.includes('flex');state.layoutPanels.grid=display.includes('grid');state.layoutPanels.inline=display.startsWith('inline');state.layoutPanels.size=true;state.layoutPanels.position=false;state.layoutPanels.gridItem=true;state.layoutPanels.flexItem=true;}
  const componentInfo=node.componentRef?state.components.find(component=>component.id===node.componentRef):null;
  const tabPanels={content:'',design:'',layout:'',responsive:'',interactions:'',advanced:''};
  let html='';
  tabPanels.design+=sharedStyleBanner(node);
  if(componentInfo){
    const componentRoot=componentRootForNode(node.id)||node;
    const overrideCountLocal=componentRoot.componentSource==='instance'?componentOverrideCount(componentRoot):0;
    tabPanels.content+=`<div class="component-context"><div class="component-context-title"><span class="component-context-icon">${uiIcon('component')}</span><span><strong>${escapeHtml(componentInfo.name)}</strong><small>${componentRoot.componentSource==='master'?'Componente principal':`Instancia vinculada${overrideCountLocal?` · ${overrideCountLocal} overrides`:''}`}</small></span></div><div class="component-context-actions">${componentRoot.componentSource==='master'?`<button type="button" data-sync-component="${componentInfo.id}" title="Sincronizar instancias">${uiIcon('sync')}<span>Sincronizar</span></button>`:`<button type="button" data-detach-component title="Desvincular instancia">${uiIcon('detach')}<span>Desvincular</span></button>`}<button type="button" class="danger-subtle" data-delete-component="${componentInfo.id}" title="Eliminar componente">${uiIcon('trash')}</button></div></div>`;
    tabPanels.content+=componentInspectorPanel(componentInfo,componentRoot);
  }
  tabPanels.responsive+=section('responsive','Responsive',responsiveInspector(node));
  if(state.inspectorMode==='advanced'){tabPanels.advanced+=section('semantic','HTML semántico',semanticInspector(node));tabPanels.advanced+=section('classes','Class Manager · BEM',classManagerInspector(node));}
  if(node.content!==undefined||['image','button','link','video','input','textareaField','selectField','svg'].includes(node.type)){
    let body='';
    if(node.content!==undefined&&node.type!=='svg')body+=field(node.type==='selectField'?'Opciones (una por línea)':'Texto',textarea('content',node.content,node.type==='heading'?4:3));
    if((node.type==='button'||node.type==='link')&&semanticTag(node)==='a')body+=field('Enlace',textInput('href',node.href));
    if(node.type==='image')body+=field('URL de imagen',textarea('src',node.src,3))+field('Texto alternativo',textInput('alt',node.alt))+`<button class="secondary-action" data-upload-assets style="width:100%">＋ Subir o reemplazar</button>`;
    if(node.type==='svg')body+=field('Pegar código SVG',textarea('svgCode',node.svgCode||'',8))+`<div class="field-grid"><button class="secondary-action" data-upload-svg style="width:100%">＋ Subir archivo .svg</button><button class="secondary-action" data-clear-svg style="width:100%">Limpiar SVG</button></div><p class="hint">Puedes subir un archivo .svg o pegar el código inline. Ideal para iconos, logos o gráficos vectoriales.</p>`;
    if(node.type==='video')body+=field('URL embebida',textarea('src',node.src,3))+field('Título',textInput('title',node.title||''));
    if(node.type==='input')body+=field('Placeholder',textInput('placeholder',node.placeholder||''))+field('Tipo',`<select data-prop="inputType">${['text','email','tel','url'].map(item=>`<option value="${item}" ${String(node.inputType||'text')===item?'selected':''}>${item}</option>`).join('')}</select>`);
    if(node.type==='textareaField')body+=field('Placeholder',textInput('placeholder',node.placeholder||''))+field('Rows',`<input data-prop="rows" type="number" min="2" max="12" value="${Number(node.rows||5)}">`);
    if(node.type==='selectField')body+='<p class="hint">Cada línea se convertirá en una opción del select.</p>';
    if(['heading','text','richtext','badge','quote','link','icon','button'].includes(node.type))body+='<p class="hint">Doble clic sobre el texto para editar directamente en el canvas.</p>';
    tabPanels.content+=section('content','Contenido',body);
  }
  const displayValue=s.display||'block';
  const layout=state.inspectorMode==='essentials'?compactLayoutControl(node,s):`<div class="layout-inspector-pro">${displayControl(displayValue)}${flexSettings(s)}${gridSettings(s)}${gridItemSettings(node,s)}${flexItemSettings(node,s)}${inlineSettings(s)}${sizeSettings(s,node)}${positionSettings(s)}</div>`;
  tabPanels.layout+=section('layout',state.inspectorMode==='essentials'?'Layout esencial':'Layout',layout);
  tabPanels.design+=section('spacing','Espaciado',state.inspectorMode==='essentials'?compactSpacingControl(node,s):boxModelControl(node,s));
  if(isTextual(node)){
    const alignIcons=[['left',iconSvg('alignLeft'),'Alinear a la izquierda'],['center',iconSvg('alignCenter'),'Centrar'],['right',iconSvg('alignRight'),'Alinear a la derecha'],['justify',iconSvg('alignJustify'),'Justificar']];
    const transformIcons=[['none','<span class="type-icon">Aa</span>','Sin transformación'],['uppercase','<span class="type-icon">AA</span>','Mayúsculas'],['lowercase','<span class="type-icon">aa</span>','Minúsculas'],['capitalize','<span class="type-icon">Aa·</span>','Capitalizar']];
    const decorationIcons=[['none',iconSvg('decorNone'),'Sin decoración'],['underline',iconSvg('decorUnderline'),'Subrayado'],['line-through',iconSvg('decorStrike'),'Tachado'],['overline',iconSvg('decorOverline'),'Overline']];
    tabPanels.design+=section('type','Tipografía',
      `${field('Color',tokenField('color','colors',s.color,colorInput('color',s.color)),hasOverride(node,'color'))}`+
      `${field('Font family',fontFamilyInput(s.fontFamily),hasOverride(node,'fontFamily'))}`+
      `<div class="field-grid">${field('Font size',tokenField('fontSize','typography',s.fontSize,unitInput('fontSize',s.fontSize)),hasOverride(node,'fontSize'))}${field('Font weight',selectInput('fontWeight',[[100,'100'],[200,'200'],[300,'300'],[400,'400'],[500,'500'],[600,'600'],[700,'700'],[800,'800'],[900,'900']],s.fontWeight||400),hasOverride(node,'fontWeight'))}</div>`+
      `<div class="field-grid">${field('Font style',segmented('fontStyle',[['normal','Normal'],['italic','Italic']],s.fontStyle||'normal'),hasOverride(node,'fontStyle'))}${field('Font variation settings',`<input data-style-prop="fontVariationSettings" value="${escapeHtml(s.fontVariationSettings||'')}" placeholder="'wght' 650, 'slnt' -8">`,hasOverride(node,'fontVariationSettings'))}</div>`+
      `<div class="field-grid">${field('Line height',`<input data-style-prop="lineHeight" type="number" step="0.05" value="${s.lineHeight??''}" placeholder="1.2">`,hasOverride(node,'lineHeight'))}${field('Letter spacing',unitInput('letterSpacing',s.letterSpacing),hasOverride(node,'letterSpacing'))}</div>`+
      `${field('Text align',iconSegmented('textAlign',alignIcons,s.textAlign||'left','four'),hasOverride(node,'textAlign'))}`+
      `${field('Text transform',iconSegmented('textTransform',transformIcons,s.textTransform||'none','four'),hasOverride(node,'textTransform'))}`+
      `<div class="field-grid">${field('White space',selectInput('whiteSpace',[['normal','Normal'],['nowrap','No wrap'],['pre-wrap','Pre-wrap'],['pre-line','Pre-line']],s.whiteSpace||'normal'),hasOverride(node,'whiteSpace'))}${field('Text wrap',selectInput('textWrap',[['wrap','Wrap'],['balance','Balance'],['pretty','Pretty'],['nowrap','No wrap']],s.textWrap||'wrap'),hasOverride(node,'textWrap'))}</div>`+
      `${field('Text decoration',iconSegmented('textDecoration',decorationIcons,s.textDecoration||'none','four'),hasOverride(node,'textDecoration'))}`+
      `${textShadowControl(s.textShadow,hasOverride(node,'textShadow'))}`
    );
  }
  tabPanels.design+=section('appearance','Apariencia',`${backgroundEditor(node,s)}${(node.type!=='image'&&!isTextual(node))?field('Color',tokenField('color','colors',s.color,colorInput('color',s.color)),hasOverride(node,'color')):''}<div class="field-grid">${field('Radio',tokenField('borderRadius','radius',s.borderRadius,unitInput('borderRadius',s.borderRadius)),hasOverride(node,'borderRadius'))}${field('Opacidad',`<input data-style-prop="opacity" type="number" min="0" max="1" step="0.05" value="${s.opacity??1}">`,hasOverride(node,'opacity'))}</div><div class="field-grid">${field('Ancho de borde',unitInput('borderWidth',s.borderWidth),hasOverride(node,'borderWidth'))}${field('Color de borde',inspectorColorControl('borderColor',s.borderColor||'transparent','Borde'),hasOverride(node,'borderColor'))}</div>${field('Sombra',tokenField('boxShadow','shadows',s.boxShadow,`<input data-style-prop="boxShadow" value="${escapeHtml(s.boxShadow||'')}" placeholder="0 20px 50px rgba(...)">`),hasOverride(node,'boxShadow'))}${node.type==='image'?field('Ajuste',segmented('objectFit',[['cover','Cubrir'],['contain','Contener']],s.objectFit||'cover'),hasOverride(node,'objectFit')):''}`);
  if(state.inspectorMode==='advanced')tabPanels.interactions+=section('interaction','Interacción y transición',`${field('Transform',`<input data-style-prop="transform" value="${escapeHtml(s.transform||'')}" placeholder="translateY(-2px) scale(1.02)">`,hasOverride(node,'transform'))}${field('Transition',`<input data-style-prop="transition" value="${escapeHtml(s.transition||'')}" placeholder="all 200ms ease">`,hasOverride(node,'transition'))}<div class="field-grid">${field('Cursor',selectInput('cursor',[['auto','Auto'],['pointer','Pointer'],['grab','Grab'],['text','Text'],['not-allowed','Not allowed']],s.cursor||'auto'),hasOverride(node,'cursor'))}${field('Pointer events',selectInput('pointerEvents',[['auto','Auto'],['none','None']],s.pointerEvents||'auto'),hasOverride(node,'pointerEvents'))}</div><p class="hint">Selecciona Hover, Focus, Active o Disabled arriba para diseñar cada estado.</p>`);
  const accessibility=node.type==='image'?field('Texto alternativo',textInput('alt',node.alt||'')):node.type==='button'?field(semanticTag(node)==='a'?'Destino del enlace':'Tipo de acción',semanticTag(node)==='a'?textInput('href',node.href||'#'):'<p class="hint">Se exportará como button type="button".</p>'):'<p class="hint">La semántica y ARIA se gestionan en el panel HTML semántico.</p>';
  if(state.inspectorMode==='advanced'||['image','button','link','input','textareaField','selectField'].includes(node.type))tabPanels.advanced+=section('accessibility','Accesibilidad',accessibility);
  const stateSwitcher=`<div class="interaction-state-switcher inspector-state-switcher"><span>Estado</span>${[['default','Default'],['hover','Hover'],['focus','Focus'],['active','Active'],['disabled','Disabled']].map(([key,label])=>`<button type="button" data-style-state="${key}" class="${state.styleState===key?'active':''}">${label}</button>`).join('')}</div>`;
  const inspectorView=finalizeInspectorTabs({panels:tabPanels,mode:'advanced',activeTab:state.inspectorTab,renderIcon:uiIcon,stateSwitcher});state.inspectorTab=inspectorView.activeTab;
  els.inspector.innerHTML=`<div class="inspector-edit-workspace">${inspectorView.tabs}<div class="inspector-edit-content">${html}${inspectorView.panel}</div></div>`;
}
function numericPx(value){const text=String(value??'').trim();return /^-?\d+(\.\d+)?px$/.test(text)?Number.parseFloat(text):null;}
function responsiveAudit(){
  const issues=[];const flat=[];(function walk(list){(list||[]).forEach(node=>{flat.push(node);walk(node.children||[]);});})(state.nodes);
  const ignored=new Set(state.responsiveAuditIgnored||[]);const add=(node,code,severity,title,detail,fixes=[])=>{const id=`${node?.id||'page'}:${code}`;if(!ignored.has(id))issues.push({id,nodeId:node?.id||'',code,severity,title,detail,fixes});};
  const mobileWidth=state.canvasWidths.mobile||390;const tabletWidth=state.canvasWidths.tablet||834;
  flat.forEach(node=>{
    const d=mergedResponsiveStyle(node.styles||{},'desktop'),t=mergedResponsiveStyle(node.styles||{},'tablet'),m=mergedResponsiveStyle(node.styles||{},'mobile');
    const mobileFixed=numericPx(m.width);if(mobileFixed&&mobileFixed>mobileWidth)add(node,'mobile-width','error',`${node.name}: ancho mayor que Mobile`,`${m.width} supera el canvas Mobile de ${mobileWidth}px.`,[{id:'width-100',label:'Usar width: 100%'},{id:'max-width',label:`Max width ${mobileWidth}px`}]);
    const tabletFixed=numericPx(t.width);if(tabletFixed&&tabletFixed>tabletWidth)add(node,'tablet-width','warning',`${node.name}: ancho mayor que Tablet`,`${t.width} supera el canvas Tablet de ${tabletWidth}px.`,[{id:'width-100-tablet',label:'Usar 100% en Tablet'}]);
    const cols=Number(m.gridColumns||0);if(String(m.display).includes('grid')&&cols>2)add(node,'mobile-grid','error',`${node.name}: ${cols} columnas en Mobile`,'La cuadrícula puede quedar demasiado estrecha.',[{id:'grid-1',label:'Cambiar a 1 columna'},{id:'grid-2',label:'Cambiar a 2 columnas'}]);
    const tabletCols=Number(t.gridColumns||0);if(String(t.display).includes('grid')&&tabletCols>4)add(node,'tablet-grid','warning',`${node.name}: ${tabletCols} columnas en Tablet`,'Revisa el ancho mínimo de cada columna.',[{id:'grid-2-tablet',label:'Cambiar a 2 columnas'}]);
    const font=numericPx(m.fontSize);if(font&&font>56)add(node,'mobile-font','warning',`${node.name}: tipografía grande en Mobile`,`${m.fontSize} puede provocar saltos o recortes.`,[{id:'font-clamp',label:'Crear clamp fluido'},{id:'font-40',label:'Usar 40px'}]);
    const sidePadding=[numericPx(m.paddingLeft),numericPx(m.paddingRight)].filter(v=>v!==null);if(sidePadding.some(v=>v>48))add(node,'mobile-padding','warning',`${node.name}: padding lateral alto`,`${m.paddingLeft||0} / ${m.paddingRight||0} deja poco espacio útil en Mobile.`,[{id:'padding-20',label:'Usar 20px laterales'}]);
    if(m.whiteSpace==='nowrap'&&['heading','text','richtext','button','link'].includes(node.type))add(node,'nowrap','warning',`${node.name}: texto sin salto`,'white-space: nowrap puede generar overflow en Mobile.',[{id:'wrap',label:'Permitir salto'}]);
    if(m.position==='absolute'){const left=numericPx(m.left),right=numericPx(m.right);if((left&&left>mobileWidth)||(right&&right>mobileWidth))add(node,'absolute-out','error',`${node.name}: posición absoluta fuera del canvas`,'Los offsets superan el ancho Mobile.',[{id:'position-relative',label:'Restablecer posición'}]);}
    const minWidth=numericPx(m.minWidth);if(minWidth&&minWidth>mobileWidth)add(node,'min-width','error',`${node.name}: min-width bloquea Mobile`,`${m.minWidth} impide que el elemento se reduzca.`,[{id:'min-width-0',label:'Usar min-width: 0'}]);
  });
  const breakpointErrors=validateBreakpointSystem({values:state.breakpoints,enabled:state.breakpointEnabled||{desktopXL:true,mobileL:true}});breakpointErrors.forEach((message,index)=>add(null,`breakpoint-${index}`,'error','Breakpoints desordenados',message,[]));
  return {issues,errors:issues.filter(item=>item.severity==='error'),warnings:issues.filter(item=>item.severity==='warning'),checked:flat.length};
}
function applyResponsiveFix(issueId,fixId){
  const report=responsiveAudit();const issue=report.issues.find(item=>item.id===issueId);if(!issue?.nodeId)return;const bp=fixId.includes('tablet')?'tablet':'mobile';
  commit(()=>{state.nodes=update(state.nodes,issue.nodeId,node=>{const styles={...node.styles,[bp]:{...(node.styles?.[bp]||{})}};const group=styles[bp];
    if(fixId==='width-100'||fixId==='width-100-tablet')group.width='100%';if(fixId==='max-width')group.maxWidth=`${state.canvasWidths.mobile||390}px`;if(fixId==='grid-1')group.gridColumns=1;if(fixId==='grid-2'||fixId==='grid-2-tablet')group.gridColumns=2;if(fixId==='font-40')group.fontSize='40px';if(fixId==='font-clamp')group.fontSize='clamp(36px, 8vw, 56px)';if(fixId==='padding-20'){group.paddingLeft='20px';group.paddingRight='20px';}if(fixId==='wrap')group.whiteSpace='normal';if(fixId==='position-relative'){group.position='relative';group.left='auto';group.right='auto';group.top='auto';group.bottom='auto';}if(fixId==='min-width-0')group.minWidth='0px';return {...node,styles};});});
  showResponsiveAudit();
}
function showResponsiveAudit(){
  const report=responsiveAudit();const score=Math.max(0,100-report.errors.length*14-report.warnings.length*5);
  const cards=report.issues.length?report.issues.map(issue=>`<article class="responsive-audit-item severity-${issue.severity}"><button type="button" class="responsive-audit-select" ${issue.nodeId?`data-audit-node="${issue.nodeId}"`:''}><span>${issue.severity==='error'?'×':'!'}</span><div><strong>${escapeHtml(issue.title)}</strong><p>${escapeHtml(issue.detail)}</p></div></button>${issue.fixes.length?`<div class="responsive-audit-fixes">${issue.fixes.map(fix=>`<button type="button" data-responsive-fix="${fix.id}" data-responsive-issue="${issue.id}">${escapeHtml(fix.label)}</button>`).join('')}<button type="button" data-responsive-ignore="${issue.id}">Ignorar</button></div>`:''}</article>`).join(''):`<div class="responsive-audit-empty"><strong>Responsive listo</strong><span>No se detectaron problemas críticos en Desktop, Tablet o Mobile.</span></div>`;
  openModal('Responsive Audit','ORBIT RESPONSIVE',`<div class="responsive-audit-pro"><header><div class="responsive-audit-score"><strong>${score}</strong><span>/100</span></div><div><h3>Desktop · Tablet · Mobile</h3><p>${report.checked} elementos revisados con el mismo sistema de herencia del exportador.</p></div><button type="button" data-open-responsive-compare>Comparar vistas</button></header><div class="responsive-audit-summary"><span><b>${report.errors.length}</b> errores</span><span><b>${report.warnings.length}</b> avisos</span><span><b>${report.checked}</b> elementos</span></div><div class="responsive-audit-list">${cards}</div></div>`,'responsive-audit-modal');
}
function auditProject(){
  const flat=[];
  (function walk(list,parent=null){list.forEach(n=>{flat.push({node:n,parent});walk(n.children||[],n);});})(state.nodes);
  const issues=[];
  const ok=[];
  const responsive=responsiveAudit();
  const warn=(node,title,detail)=>issues.push({type:'warning',nodeId:node?.id||'',title,detail});
  const pass=(title,detail)=>ok.push({type:'ok',title,detail});
  const meta=state.pageMeta||{};
  if(!String(meta.language||'').trim())warn(null,'Idioma del documento vacío','Define el atributo lang para lectores de pantalla y buscadores.');
  if(!String(meta.title||'').trim())warn(null,'Título SEO vacío','Añade un título descriptivo para la página.');
  else if(String(meta.title).length>70)warn(null,'Título SEO demasiado largo','Intenta mantenerlo por debajo de 70 caracteres.');
  if(!String(meta.description||'').trim())warn(null,'Meta description vacía','Añade una descripción para los resultados de búsqueda.');
  else if(String(meta.description).length>180)warn(null,'Meta description demasiado larga','Intenta mantenerla por debajo de 180 caracteres.');
  const headings=flat.filter(({node})=>node.type==='heading').map(({node})=>node);
  const h1s=headings.filter(n=>semanticTag(n)==='h1');
  if(h1s.length!==1)warn(h1s[0],`La página tiene ${h1s.length} H1`,'Para una página comercial se recomienda un título principal claro.');
  else pass('Jerarquía H1 correcta','Existe un único título principal.');
  let previous=0;
  headings.forEach(node=>{
    const level=Number(semanticTag(node).slice(1));
    if(previous&&level>previous+1)warn(node,`Salto de H${previous} a H${level}: ${node.name}`,'Evita saltar niveles de encabezado sin una razón estructural.');
    previous=level;
  });
  const mains=flat.filter(({node})=>semanticTag(node)==='main').map(({node})=>node);
  if(mains.length!==1)warn(mains[0],`La página tiene ${mains.length} elementos <main>`,'Debe existir un único contenido principal por documento.');
  else pass('Main único','El documento contiene un solo elemento <main>.');
  flat.filter(({node})=>node.type==='image'&&!String(node.alt||'').trim()).forEach(({node})=>warn(node,`Imagen sin alt: ${node.name}`,'Añade un texto alternativo descriptivo o alt vacío si es decorativa.'));
  if(!flat.some(({node})=>node.type==='image'&&!String(node.alt||'').trim()))pass('Imágenes con texto alternativo','No se detectaron imágenes sin alt.');
  flat.filter(({node})=>node.type==='button'&&semanticTag(node)==='a'&&(!node.href||node.href==='#')).forEach(({node})=>warn(node,`Enlace pendiente: ${node.name}`,'Los enlaces deben tener un destino real.'));
  flat.filter(({node})=>['nav','aside','form'].includes(semanticTag(node))&&!String(node.ariaLabel||'').trim()).forEach(({node})=>warn(node,`${semanticTag(node)} sin etiqueta: ${node.name}`,'Añade un aria-label cuando su propósito no sea evidente.'));
  flat.filter(({node})=>semanticTag(node)==='section').forEach(({node})=>{
    const hasHeading=(function scan(list){return (list||[]).some(child=>child.type==='heading'||scan(child.children));})(node.children);
    if(!hasHeading)warn(node,`Section sin encabezado: ${node.name}`,'Si solo es una envoltura visual, considera usar <div>.');
  });
  flat.forEach(({node,parent})=>{
    const tag=semanticTag(node),parentTag=parent?semanticTag(parent):'';
    if(tag==='li'&&!['ul','ol'].includes(parentTag))warn(node,`<li> fuera de una lista: ${node.name}`,'Un li debe estar dentro de ul u ol.');
    if(['ul','ol'].includes(tag)&&(node.children||[]).some(child=>semanticTag(child)!=='li'))warn(node,`Lista con hijos no semánticos: ${node.name}`,'Los hijos directos de ul y ol deberían ser li.');
  });
  const duplicateIds=flat.map(({node})=>node.id).filter((id,i,a)=>a.indexOf(id)!==i);
  if(duplicateIds.length)warn(null,'Hay IDs duplicados','Esto puede causar conflictos internos y en la exportación.');
  const classMap=new Map();
  flat.forEach(({node})=>{const cls=bemBaseClass(node);classMap.set(cls,[...(classMap.get(cls)||[]),node]);});
  classMap.forEach((nodes,cls)=>{if(nodes.length>1)warn(nodes[1],`Clase BEM repetida: .${cls}`,'Genera nombres únicos o revisa los elementos del bloque.');});
  const mobileWidth=state.canvasWidths.mobile||390;
  flat.forEach(({node})=>{const baseWidth=String(node.styles?.base?.width||'');const numeric=parseFloat(baseWidth);const hasMobile=Object.prototype.hasOwnProperty.call(node.styles?.mobile||{},'width')||Object.prototype.hasOwnProperty.call(node.styles?.tablet||{},'width');if(/px$/.test(baseWidth)&&numeric>mobileWidth&&!hasMobile)warn(node,`Posible overflow móvil: ${node.name}`,`Tiene un ancho fijo de ${baseWidth} sin override responsive.`);});
  const unusedAssets=(state.assets||[]).filter(asset=>assetUsageCount(asset)===0);if(unusedAssets.length)warn(null,`${unusedAssets.length} assets sin uso`,'Puedes eliminarlos desde Asset Manager para reducir el proyecto.');else if(state.assets.length)pass('Assets optimizados','Todos los assets de la biblioteca están en uso.');
  const draftPages=(state.pages||[]).filter(page=>(page.status||'published')==='draft');if(draftPages.length)warn(null,`${draftPages.length} páginas en borrador`,'Revísalas antes de publicar o exportar la versión final.');
  const pagesWithoutDescription=(state.pages||[]).filter(page=>!String(page.meta?.description||'').trim());if(pagesWithoutDescription.length)warn(null,`${pagesWithoutDescription.length} páginas sin descripción SEO`,'Completa la descripción en Ajustes de página.');
  responsive.issues.forEach(item=>warn(item.nodeId?find(state.nodes,item.nodeId):null,`Responsive · ${item.title}`,item.detail));
  if(!responsive.issues.length)pass('Responsive validado','Desktop, Tablet y Mobile no presentan problemas detectables.');
  if(state.nodes.length)pass('Documento estructurado',`${flat.length} elementos listos para exportar.`);
  const score=Math.max(0,Math.min(100,100-issues.length*6+Math.min(ok.length,5)*2));
  return {issues,ok,total:flat.length,score,responsive};
}
function renderAuditCount(){
  const report=auditProject();const count=document.getElementById('audit-count');const button=document.getElementById('audit');
  if(count)count.textContent=report.issues.length;if(button)button.classList.toggle('active',report.issues.length===0);
}
function showAudit(){
  const report=auditProject();
  openModal('Export Health y auditoría','ORBIT CHECK',`<div class="audit-score"><strong>${report.score}</strong><span>/100</span><small>Export health</small></div><div class="audit-summary"><div class="audit-stat"><strong>${report.total}</strong><span>Elementos</span></div><div class="audit-stat"><strong>${report.issues.length}</strong><span>Alertas</span></div><div class="audit-stat"><strong>${report.responsive.issues.length}</strong><span>Responsive</span></div></div><div class="audit-mode-actions"><button type="button" data-open-responsive-audit>Responsive Audit</button><button type="button" data-open-responsive-compare>Desktop · Tablet · Mobile</button></div><div class="audit-list">${[...report.issues,...report.ok].map(item=>`<button class="audit-item ${item.type==='ok'?'ok':''}" ${item.nodeId?`data-audit-node="${item.nodeId}"`:''}><span class="audit-icon">${item.type==='ok'?'✓':'!'}</span><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.detail)}</p></div></button>`).join('')}</div>`,'audit-modal');
}
function openModal(title,kicker,content,modeClass=''){const wasOpen=!els.modal.hidden,trigger=document.activeElement,titleEl=$('#modal-title'),kickerEl=$('#modal-kicker'),card=els.modal.querySelector('.modal-card');if(titleEl)titleEl.textContent=title;if(kickerEl)kickerEl.textContent=kicker;card.className=`modal-card ${modeClass}`.trim();els.modalContent.innerHTML=content;els.modal.hidden=false;const initial=card.querySelector('input,textarea,select,button,[tabindex="0"]')||card;if(!wasOpen)accessibility?.focus.openLayer(els.modal,{trigger,initialFocus:initial,modal:true,onEscape:closeModal});else requestAnimationFrame(()=>initial.focus?.({preventScroll:true}));accessibility?.announcer.status(`${title} abierto.`);}
function closeModal(){els.modal.hidden=true;state.pendingImport=null;document.getElementById('orbit-google-font-previews')?.remove();accessibility?.focus.closeLayer(els.modal);const card=els.modal.querySelector('.modal-card');if(card)card.className='modal-card';}
function ensureTokenGroups(){
  Object.keys(tokenMeta).forEach(category=>{if(!state.tokens[category])state.tokens[category]={};});
}
function tokenDefaultValue(category){
  return {colors:'#151513',typography:'16px',spacing:'16px',radius:'8px',shadows:'0 16px 42px rgba(15,17,22,.16)'}[category]||'';
}
function normalizeTokenCssVar(value,category,key='token'){
  const raw=String(value||'').trim().replace(/^--/,'');
  const safe=slug(raw||`${tokenMeta[category]?.prefix||category}-${key}`);
  return `--${safe||`${tokenMeta[category]?.prefix||category}-token`}`;
}
function tokenUsageCount(category,key){
  syncCurrentPageRecord();
  const ref=tokenRef(category,key);
  const source=JSON.stringify({pages:state.pages,classes:state.globalClasses,components:state.components});
  return source.split(ref).length-1;
}
function replaceTokenReferenceDeep(value,ref,replacement){
  if(typeof value==='string')return value.includes(ref)?value.split(ref).join(replacement):value;
  if(Array.isArray(value))return value.map(item=>replaceTokenReferenceDeep(item,ref,replacement));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,replaceTokenReferenceDeep(item,ref,replacement)]));
  return value;
}
function replaceTokenReferences(ref,replacement){
  state.nodes=replaceTokenReferenceDeep(state.nodes,ref,replacement);
  state.pages=replaceTokenReferenceDeep(state.pages,ref,replacement);
  state.globalClasses=replaceTokenReferenceDeep(state.globalClasses,ref,replacement);
  state.components=replaceTokenReferenceDeep(state.components,ref,replacement);
  syncCurrentPageRecord();
}
function tokenEditorMarkup(category,key=''){
  const item=key?state.tokens?.[category]?.[key]:null;
  const name=item?.name||'';
  const value=item?.value||tokenDefaultValue(category);
  const cssVar=item?varName(category,key):normalizeTokenCssVar('',category,'new-token');
  const symbol=category==='colors'?'●':category==='typography'?'Aa':category==='spacing'?'↔':category==='radius'?'◖':'☰';
  const colorPicker=category==='colors'?`<input type="color" data-token-editor-color value="${/^#[0-9a-f]{6}$/i.test(value)?escapeHtml(value):'#151513'}" aria-label="Elegir color">`:'';
  return `<form class="token-editor" data-token-editor-form data-token-category="${category}" data-token-key="${escapeHtml(key)}"><div class="token-editor-intro"><span>${symbol}</span><div><strong>${escapeHtml(tokenMeta[category].label)}</strong><small>${item?'Edita la variable y conserva sus usos':'Crea una variable reutilizable en todo el proyecto'}</small></div></div><div class="token-editor-fields"><label>Nombre<input type="text" data-token-editor-name value="${escapeHtml(name)}" placeholder="Ej. Brand primary" autocomplete="off" required></label><label>Variable CSS<input type="text" data-token-editor-cssvar value="${escapeHtml(cssVar)}" placeholder="--color-brand-primary" autocomplete="off"><small>Orbit actualizará las referencias si cambias este identificador.</small></label><label>Valor<div class="token-editor-value-row ${category==='colors'?'has-color':''}"><input type="text" data-token-editor-value value="${escapeHtml(value)}" placeholder="${escapeHtml(tokenDefaultValue(category))}" autocomplete="off" required>${colorPicker}</div></label></div><div class="token-editor-actions"><button type="button" data-close-modal>Cancelar</button><button type="submit" class="primary-action">${item?'Guardar cambios':'Crear variable'}</button></div></form>`;
}
function showTokenEditor(category,key=''){
  if(!tokenMeta[category])return;
  const item=key?state.tokens?.[category]?.[key]:null;
  openModal(item?'Editar variable':'Nueva variable',item?String(item.name||'TOKEN').toUpperCase():tokenMeta[category].label.toUpperCase(),tokenEditorMarkup(category,key),'token-editor-modal');
}
function tokenCssVarOwner(cssVar){
  for(const [category,items] of Object.entries(state.tokens))for(const [key] of Object.entries(items))if(varName(category,key)===cssVar)return {category,key};
  return null;
}
function saveTokenEditor(form){
  const category=form.dataset.tokenCategory,key=form.dataset.tokenKey||'';
  if(!tokenMeta[category])return;
  const name=String(form.querySelector('[data-token-editor-name]')?.value||'').trim();
  const value=String(form.querySelector('[data-token-editor-value]')?.value||'').trim();
  if(!name||!value){toast('Completa el nombre y el valor','error');return;}
  const baseKey=slug(name)||'token';
  const cssVar=normalizeTokenCssVar(form.querySelector('[data-token-editor-cssvar]')?.value,category,baseKey);
  const owner=tokenCssVarOwner(cssVar);
  if(owner&&(owner.category!==category||owner.key!==key)){toast('Esa variable CSS ya existe','error');return;}
  const before=snapshot();
  if(key){
    const current=state.tokens[category]?.[key];if(!current)return;
    const oldRef=tokenRef(category,key);
    state.tokens[category][key]={...current,name,value,cssVar};
    const newRef=tokenRef(category,key);
    if(oldRef!==newRef)replaceTokenReferences(oldRef,newRef);
  }else{
    let nextKey=baseKey,index=2;
    while(state.tokens[category][nextKey])nextKey=`${baseKey}-${index++}`;
    state.tokens[category][nextKey]={name,value,cssVar};
    state.tokenGroupsOpen={...(state.tokenGroupsOpen||{}),[category]:true};
  }
  pushHistory(before);markUnsaved();syncGoogleFontsStylesheet();closeModal();render();toast(key?'Variable actualizada':'Variable creada');
}
function showTokenDeleteDialog(category,key){
  const item=state.tokens?.[category]?.[key];if(!item)return;
  const usage=tokenUsageCount(category,key);
  openModal('Eliminar variable','DESIGN TOKENS',`<div class="token-delete-summary"><p>Vas a eliminar <strong>${escapeHtml(item.name)}</strong>. El diseño conservará su aspecto porque cada referencia se convertirá al valor actual <code>${escapeHtml(item.value)}</code>.</p><div class="token-delete-usage"><span>Referencias detectadas</span><strong>${usage}</strong></div><div class="token-editor-actions"><button type="button" data-close-modal>Cancelar</button><button type="button" class="danger-action" data-token-confirm-delete="${category}:${key}">Eliminar variable</button></div></div>`,'token-editor-modal');
}
function deleteToken(category,key){
  const item=state.tokens?.[category]?.[key];if(!item)return;
  const before=snapshot();const ref=tokenRef(category,key);
  replaceTokenReferences(ref,item.value);delete state.tokens[category][key];
  pushHistory(before);markUnsaved();syncGoogleFontsStylesheet();closeModal();render();toast(`${item.name} eliminada`);
}
function materializedTokenValue(category,key,seen=new Set()){
  const id=`${category}:${key}`,item=state.tokens?.[category]?.[key];if(!item||seen.has(id))return String(item?.value||'');
  const nextSeen=new Set(seen).add(id);
  return String(item.value||'').replace(/var\((--[^)]+)\)/g,(match,cssVar)=>{const owner=tokenCssVarOwner(cssVar);return owner?materializedTokenValue(owner.category,owner.key,nextSeen):match;});
}
function tokenCategoryUsage(category){
  return Object.keys(state.tokens?.[category]||{}).reduce((sum,key)=>sum+tokenUsageCount(category,key),0);
}
function showTokenClearDialog(category){
  const items=state.tokens?.[category]||{},count=Object.keys(items).length;if(!tokenMeta[category]||!count)return;
  const usage=tokenCategoryUsage(category),label=tokenMeta[category].label;
  openModal(`Vaciar ${label}`,'DESIGN TOKENS',`<div class="token-delete-summary"><p>Vas a eliminar <strong>todos los tokens de ${escapeHtml(label)}</strong>. Esta acción puede deshacerse. Orbit conservará el aspecto actual convirtiendo cada referencia a su valor final.</p><div class="token-delete-usage"><span>Variables que se eliminarán</span><strong>${count}</strong></div><div class="token-delete-usage"><span>Referencias protegidas</span><strong>${usage}</strong></div><div class="token-editor-actions"><button type="button" data-close-modal>Cancelar</button><button type="button" class="danger-action" data-token-confirm-clear="${category}">Eliminar todos</button></div></div>`,'token-editor-modal');
}
function clearTokenCategory(category){
  const items=state.tokens?.[category]||{},entries=Object.entries(items);if(!tokenMeta[category]||!entries.length)return;
  const before=snapshot();
  const replacements=entries.map(([key])=>[tokenRef(category,key),materializedTokenValue(category,key)]);
  replacements.forEach(([ref,value])=>replaceTokenReferences(ref,value));
  state.tokens[category]={};
  pushHistory(before);markUnsaved();syncGoogleFontsStylesheet();closeModal();render();toast(`${tokenMeta[category].label}: todos los tokens eliminados`);
}
function parseCssVariables(css=''){
  const found=[]; const seen=new Set();
  const re=/(--[A-Za-z0-9_-]+)\s*:\s*([^;{}]+);/g; let match;
  while((match=re.exec(css))){
    const cssVar=match[1].trim(),value=match[2].trim();
    if(!seen.has(cssVar)){seen.add(cssVar);found.push({cssVar,value});}
  }
  return found;
}
function classifyCssVariable(item){
  const name=item.cssVar.toLowerCase(),value=item.value.toLowerCase();
  if(/shadow/.test(name)||/\d+px\s+\d+px.*(rgba?|hsla?)\(/.test(value))return 'shadows';
  if(/radius|round/.test(name))return 'radius';
  if(/color|brand|primary|secondary|accent|surface|background|foreground|muted|neutral|black|white/.test(name)||/^(#|rgb|hsl|oklch|color\()/.test(value))return 'colors';
  if(/font|text|type|heading|body|display|line-height|letter/.test(name))return 'typography';
  return 'spacing';
}
function analyzeDesignSystem(css){
  return parseCssVariables(css).map(item=>({...item,category:classifyCssVariable(item),key:slug(item.cssVar.replace(/^--/,'')),name:item.cssVar.replace(/^--/,'').replace(/[-_]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}));
}
function designSystemPreview(items){
  const groups=Object.keys(tokenMeta).map(category=>({category,items:items.filter(item=>item.category===category)})).filter(group=>group.items.length);
  return `<div class="import-analysis"><div class="import-result-head"><strong>${items.length} variables detectadas</strong><span>${groups.length} categorías</span></div>${groups.map(group=>`<section class="import-token-group"><h3>${tokenMeta[group.category].label}<span>${group.items.length}</span></h3>${group.items.map(item=>`<div class="import-token-row"><code>${escapeHtml(item.cssVar)}</code><span>${escapeHtml(item.value)}</span><select data-import-token-category="${escapeHtml(item.cssVar)}">${Object.entries(tokenMeta).map(([key,meta])=>`<option value="${key}" ${item.category===key?'selected':''}>${meta.label}</option>`).join('')}</select></div>`).join('')}</section>`).join('')}<button class="primary-action import-commit" type="button" data-commit-design-system>Importar ${items.length} tokens</button></div>`;
}
function commitDesignSystem(){
  const items=state.pendingImport?.type==='tokens'?state.pendingImport.items:[]; if(!items.length)return;
  ensureTokenGroups();
  const before=snapshot();
  items.forEach(item=>{
    const select=els.modalContent.querySelector(`[data-import-token-category="${CSS.escape(item.cssVar)}"]`);
    const category=select?.value||item.category; const baseKey=slug(item.cssVar.replace(/^--/,'')); let key=baseKey,index=2;
    while(state.tokens[category][key]&&state.tokens[category][key].cssVar!==item.cssVar)key=`${baseKey}-${index++}`;
    state.tokens[category][key]={name:item.name,value:item.value,cssVar:item.cssVar};
  });
  pushHistory(before);markUnsaved();render();closeModal();toast(`${items.length} tokens importados`);
}
function importTabs(active){
  const tabs=[['design-system','Design System'],['html-css','HTML + CSS'],['orbit-json','Orbit JSON / IA']];
  return `<div class="import-tabs">${tabs.map(([key,label])=>`<button type="button" data-import-tab="${key}" class="${active===key?'active':''}">${label}</button>`).join('')}</div>`;
}
function showPageSettings(){
  const meta=state.pageMeta||{};const page=currentPage();const issues=pageSeoIssueCount(meta);const score=pageSeoScore(meta);
  const title=String(meta.title||state.projectName||'').trim();const description=String(meta.description||'').trim();
  const wcag=wcagPageAudit(state.nodes);
  const wcagIssuesHtml=wcag.issues.length?wcag.issues.map(item=>`<div class="wcag-issue-item">⚠️ ${escapeHtml(item)}</div>`).join(''):'<div class="wcag-issue-clean">✅ Jerarquía H1, imágenes alt y atributos aria impecables.</div>';
  openModal('SEO y accesibilidad WCAG','ORBIT SEO & WCAG',`<div class="seo-settings-pro"><section class="seo-overview-card"><div><span>SEO SCORE</span><strong>${score}</strong><small>/100</small></div><p>${issues?'Completa los campos pendientes para mejorar la preparación de esta página.':'La información SEO básica de esta página está completa.'}</p></section><section class="seo-overview-card wcag-overview-card"><div><span>WCAG SCORE</span><strong>${wcag.score}</strong><small>/100</small></div><div class="wcag-issues-list">${wcagIssuesHtml}</div></section><section class="seo-settings-section"><header><span>PAGE</span><h3>Identidad y ruta</h3></header><div class="page-settings-grid">${field('Nombre interno',`<input data-page-record="name" value="${escapeHtml(page.name||'Page')}">`)}${field('Ruta',`<input data-page-record="slug" value="${escapeHtml(pageRouteLabel(page))}" placeholder="/about">`)}</div>${field('Idioma del documento',`<input data-page-meta="language" value="${escapeHtml(meta.language||'es')}" placeholder="es">`)}</section><section class="seo-settings-section"><header><span>SEARCH</span><h3>Vista en buscadores</h3></header>${field('Título SEO',`<input data-page-meta="title" value="${escapeHtml(title)}" maxlength="70">`)}${field('Meta description',`<textarea data-page-meta="description" rows="5" maxlength="180">${escapeHtml(description)}</textarea>`)}<div class="serp-preview"><span>Vista previa</span><strong>${escapeHtml(title||page.name||state.projectName)}</strong><small>${escapeHtml(pageRouteLabel(page))}</small><p>${escapeHtml(description||'Añade una descripción para mostrar cómo aparecerá esta página en los resultados de búsqueda.')}</p></div><div class="seo-lengths"><span>Title: <strong>${title.length}</strong>/70</span><span>Description: <strong>${description.length}</strong>/180</span></div></section><section class="seo-settings-section"><header><span>SOCIAL & CANONICAL</span><h3>Open Graph e indexación</h3></header>${field('Imagen Open Graph',`<input data-page-meta="ogImage" value="${escapeHtml(meta.ogImage||'')}" placeholder="/assets/og-cover.jpg">`)}${field('URL Canónica',`<input data-page-meta="canonicalUrl" value="${escapeHtml(meta.canonicalUrl||'')}" placeholder="https://mi-dominio.com/pagina">`)}<label class="page-index-toggle"><input type="checkbox" data-page-meta-check="noIndex" ${meta.noIndex?'checked':''}><span>Evitar indexación de esta página</span></label></section><button class="primary-action page-settings-save" type="button" data-save-page-meta>Guardar SEO y página</button></div>`,'page-settings-modal seo-settings-modal');
}

function showBreakpointManager(){
  const rows=BREAKPOINTS.map(bp=>{
    const secondary=SECONDARY_BREAKPOINTS.includes(bp);const enabled=breakpointIsEnabled(bp);
    const rule=bp==='desktop'?'Base sin media query':bp==='desktopXL'?'min-width':'max-width';
    return `<div class="breakpoint-row-pro ${enabled?'':'is-disabled'}" data-breakpoint-row="${bp}"><div class="breakpoint-row-identity"><span class="breakpoint-device">${bp==='mobile'?'M':bp==='tablet'?'T':bp==='desktop'?'D':bp==='desktopXL'?'XL':'ML'}</span><span><strong>${breakpointLabels[bp]}</strong><small>${rule}${CORE_BREAKPOINTS.includes(bp)?' · Principal':' · Secundario'}</small></span></div>${secondary?`<label class="breakpoint-enable"><input type="checkbox" data-breakpoint-enabled="${bp}" ${enabled?'checked':''}><span>${enabled?'Activo':'Inactivo'}</span></label>`:'<span class="breakpoint-lock">Protegido</span>'}<label><span>CSS</span><div><input type="number" min="320" max="5120" data-breakpoint-value="${bp}" value="${state.breakpoints[bp]}" ${enabled?'':'disabled'}><b>px</b></div></label><label><span>Canvas</span><div><input type="number" min="320" max="5120" data-canvas-width-value="${bp}" value="${state.canvasWidths[bp]}" ${enabled?'':'disabled'}><b>px</b></div></label></div>`;
  }).join('');
  openModal('Responsive System Pro','ORBIT BREAKPOINTS',`<div class="breakpoint-manager breakpoint-manager-pro"><div class="breakpoint-manager-head"><strong>Breakpoints del proyecto</strong><p>Desktop, Tablet y Mobile permanecen protegidos. Los breakpoints secundarios pueden desactivarse sin perder sus estilos.</p></div><div class="breakpoint-order-hint"><span>Orden requerido</span><strong>Desktop XL &gt; Desktop &gt; Tablet &gt; Mobile L &gt; Mobile</strong></div><div class="breakpoint-pro-list">${rows}</div><div id="breakpoint-validation" class="breakpoint-validation" aria-live="polite"></div><div class="breakpoint-actions"><button type="button" class="secondary-action" data-reset-breakpoints>Restablecer</button><button type="button" class="primary-action" data-save-breakpoints>Guardar sistema responsive</button></div></div>`,'breakpoint-modal breakpoint-modal-pro');
}
function collectBreakpointForm(){
  const values={},widths={},enabled={desktopXL:true,mobileL:true};
  els.modalContent.querySelectorAll('[data-breakpoint-value]').forEach(input=>values[input.dataset.breakpointValue]=Math.max(320,Math.min(5120,Number(input.value)||state.breakpoints[input.dataset.breakpointValue])));
  els.modalContent.querySelectorAll('[data-canvas-width-value]').forEach(input=>widths[input.dataset.canvasWidthValue]=Math.max(320,Math.min(5120,Number(input.value)||state.canvasWidths[input.dataset.canvasWidthValue])));
  SECONDARY_BREAKPOINTS.forEach(bp=>{const input=els.modalContent.querySelector(`[data-breakpoint-enabled="${bp}"]`);enabled[bp]=input?input.checked:true;});
  return {values,widths,enabled};
}
function validateBreakpointSystem(form){
  const {values,enabled}=form;const errors=[];
  if(!(values.desktopXL>values.desktop))errors.push('Desktop XL debe ser mayor que Desktop.');
  if(!(values.desktop>values.tablet))errors.push('Desktop debe ser mayor que Tablet.');
  if(enabled.mobileL){if(!(values.tablet>values.mobileL&&values.mobileL>values.mobile))errors.push('Tablet > Mobile L > Mobile debe mantener orden descendente.');}
  else if(!(values.tablet>values.mobile))errors.push('Tablet debe ser mayor que Mobile.');
  if(values.mobile<320)errors.push('Mobile no puede ser menor de 320 px.');
  return errors;
}
function saveBreakpointManager(){
  const form=collectBreakpointForm();const errors=validateBreakpointSystem(form);const validation=els.modalContent.querySelector('#breakpoint-validation');
  if(errors.length){if(validation)validation.innerHTML=`<strong>Revisa la configuración</strong>${errors.map(error=>`<span>${escapeHtml(error)}</span>`).join('')}`;return;}
  const before=snapshot();state.breakpoints={...state.breakpoints,...form.values};state.canvasWidths={...state.canvasWidths,...form.widths};state.breakpointEnabled={...state.breakpointEnabled,...form.enabled};
  if(!breakpointIsEnabled(state.breakpoint))state.breakpoint='desktop';pushHistory(before);markUnsaved();closeModal();render();toast('Responsive System actualizado');
}
function resetCurrentBreakpoint(){
  if(state.breakpoint==='desktop')return;const node=selected();if(!node)return;commit(()=>{state.nodes=update(state.nodes,node.id,item=>{const styles={...item.styles};delete styles[state.breakpoint];return {...item,styles};});});
}
function copyBaseToBreakpoint(){
  if(state.breakpoint==='desktop')return;const node=selected();if(!node)return;commit(()=>{state.nodes=update(state.nodes,node.id,item=>({...item,styles:{...item.styles,[state.breakpoint]:clone(item.styles?.base||{})}}));});toast(`Base copiada a ${breakpointLabels[state.breakpoint]}`);
}
function showGlobalClassEditor(classId){
  const item=globalClassById(classId);if(!item)return;
  const declarations=cssRules(item.styles?.base||{}).replace(/^  /gm,'');
  openModal(`.${item.name}`,'GLOBAL CLASS',`<div class="global-class-editor">${field('Nombre de clase',`<input data-global-class-name value="${escapeHtml(item.name)}">`)}${field('Declaraciones CSS',`<textarea class="code-area" data-global-class-css rows="15" placeholder="display: flex;
gap: 24px;">${escapeHtml(declarations)}</textarea>`)}<div class="class-editor-meta"><span>${globalClassUsage(classId)} elementos usan esta clase</span><code>.${escapeHtml(item.name)}</code></div><button type="button" class="primary-action" data-save-global-class="${classId}">Guardar clase global</button></div>`,'global-class-modal');
}
function saveGlobalClass(classId){
  const item=globalClassById(classId);if(!item)return;const name=sanitizeClass(els.modalContent.querySelector('[data-global-class-name]')?.value||item.name);const css=els.modalContent.querySelector('[data-global-class-css]')?.value||'';if(!name){toast('La clase necesita un nombre');return;}
  const before=snapshot();item.name=name;item.styles={...(item.styles||{}),base:declarationsToOrbit(parseCssDeclarations(css))};pushHistory(before);markUnsaved();closeModal();render();toast(`Clase .${name} actualizada`);
}

function showImportHub(mode=state.importMode){
  state.importMode=mode;
  let body='';
  if(mode==='design-system')body=`<div class="import-copy"><h3>Import Design System</h3><p>Pega el CSS exportado por Core Framework o cualquier sistema basado en variables CSS.</p></div><textarea id="import-design-css" class="code-area" rows="13" placeholder=":root {\n  --color-primary: #ef5a24;\n  --space-m: 1.5rem;\n}"></textarea><div class="import-actions"><label class="secondary-action file-action">Subir CSS<input id="design-system-file" type="file" accept=".css,text/css" hidden></label><button class="primary-action" type="button" data-analyze-design-system>Analizar variables</button></div><div id="import-analysis"></div>`;
  if(mode==='html-css')body=`<div class="import-copy"><h3>Importar HTML y CSS</h3><p>Orbit convierte etiquetas semánticas, clases y estilos básicos en elementos editables. El código complejo puede requerir revisión.</p></div><label class="import-label">HTML<textarea id="import-html-source" class="code-area" rows="10" placeholder="<main class=\"landing\">...</main>"></textarea></label><label class="import-label">CSS<textarea id="import-css-source" class="code-area" rows="9" placeholder=".landing { display:grid; gap:2rem; }"></textarea></label><div class="import-actions"><select id="code-import-mode"><option value="replace">Reemplazar canvas</option><option value="append">Añadir al final</option></select><button class="primary-action" type="button" data-import-html-css>Convertir a Orbit</button></div>`;
  if(mode==='orbit-json')body=`<div class="import-copy ai-import-copy"><span class="ai-import-icon">${uiIcon('sparkles')}</span><div><h3>Orbit JSON / IA</h3><p>Pega el contenido JSON o carga un archivo <code>.json</code>. Orbit lo valida antes de analizar la estructura.</p></div></div><section class="orbit-json-source"><div class="orbit-json-source-head"><div><strong>Fuente del documento</strong><span>Pega el JSON manualmente o selecciónalo desde tu equipo.</span></div><span class="orbit-json-source-badge">JSON</span></div><label class="orbit-json-dropzone" data-orbit-json-dropzone><input id="orbit-json-file" type="file" accept=".json,application/json" hidden><span class="orbit-json-file-icon">${uiIcon('page')}</span><span class="orbit-json-file-copy"><strong data-orbit-file-title>Cargar archivo JSON</strong><small data-orbit-file-name>Selecciona o arrastra un archivo .json</small></span><span class="orbit-json-file-action" data-orbit-file-action>Seleccionar archivo</span></label><div class="orbit-json-file-status" data-orbit-file-status hidden><span class="orbit-json-status-dot"></span><div><strong data-orbit-status-title>Archivo listo</strong><small data-orbit-status-detail></small></div><button type="button" data-clear-orbit-json-file aria-label="Quitar archivo" title="Quitar archivo">${uiIcon('trash')}</button></div><div class="orbit-json-divider"><span>o pega el contenido</span></div><label class="orbit-json-editor-label"><span>Documento JSON</span><textarea id="import-orbit-json" class="code-area orbit-json-editor" rows="14" spellcheck="false" placeholder='{ "nodes": [ ... ], "tokens": { ... } }'></textarea></label></section><div class="import-actions ai-import-actions"><select id="orbit-import-mode"><option value="replace">Reemplazar página actual</option><option value="append">Insertar en la página actual</option><option value="new-page">Crear nueva página</option></select><button class="primary-action" type="button" data-analyze-orbit-json>${uiIcon('sparkles')} Analizar documento</button></div><div id="orbit-import-report" aria-live="polite"></div>`;
  openModal('Importar a Orbit','ORBIT IMPORT',`${importTabs(mode)}<div class="import-pane">${body}</div>`,'import-modal');
}

function parseCssDeclarations(text=''){
  const out={}; text.split(';').forEach(part=>{const index=part.indexOf(':');if(index<0)return;const prop=part.slice(0,index).trim();const value=part.slice(index+1).trim();if(prop&&value&&!prop.startsWith('--'))out[prop]=value;}); return out;
}
function parseCssRules(css=''){
  const clean=css.replace(/\/\*[\s\S]*?\*\//g,'').replace(/@(?:media|supports|container)[^{]*\{[\s\S]*?\}\s*\}/g,'');
  const rules=[]; const re=/([^{}]+)\{([^{}]*)\}/g; let match;
  while((match=re.exec(clean))){
    const declarations=parseCssDeclarations(match[2]);
    match[1].split(',').map(s=>s.trim()).filter(Boolean).forEach(selector=>{if(!selector.startsWith('@')&&selector!==':root')rules.push({selector,declarations});});
  }
  return rules;
}
function expandBox(out,prefix,value){
  const parts=String(value).trim().split(/\s+/); const [a,b=a,c=a,d=b]=parts;
  out[`${prefix}Top`]=a;out[`${prefix}Right`]=b;out[`${prefix}Bottom`]=c;out[`${prefix}Left`]=d;
}
function declarationsToOrbit(declarations){
  const out={};
  Object.entries(declarations).forEach(([prop,value])=>{
    if(prop==='padding'||prop==='margin'){expandBox(out,prop,value);return;}
    const camel=prop.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
    const map={flexDirection:'direction',backgroundColor:'background'};
    const key=map[camel]||camel;
    const allowed=['width','maxWidth','minWidth','height','maxHeight','minHeight','aspectRatio','boxSizing','paddingTop','paddingRight','paddingBottom','paddingLeft','marginTop','marginRight','marginBottom','marginLeft','gap','columnGap','rowGap','display','direction','flexWrap','justifyContent','alignItems','justifyItems','alignContent','gridTemplateColumns','gridTemplateRows','gridTemplateAreas','gridArea','gridColumn','gridRow','gridAutoColumns','gridAutoRows','gridAutoFlow','order','verticalAlign','background','color','fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','textAlign','fontStyle','textTransform','textDecoration','textShadow','fontVariationSettings','whiteSpace','textWrap','borderRadius','borderWidth','borderColor','opacity','boxShadow','objectFit','overflow'];
    if(allowed.includes(key))out[key]=value;
  });
  return out;
}
const supportedCssProperties=new Set(['width','max-width','min-width','height','min-height','padding','padding-top','padding-right','padding-bottom','padding-left','margin','margin-top','margin-right','margin-bottom','margin-left','gap','column-gap','row-gap','display','flex-direction','flex-wrap','justify-content','align-items','justify-items','align-content','grid-template-columns','grid-template-rows','grid-template-areas','grid-area','grid-column','grid-row','grid-auto-columns','grid-auto-rows','grid-auto-flow','order','vertical-align','background','background-color','color','font-family','font-size','font-weight','line-height','letter-spacing','text-align','font-style','text-transform','text-decoration','text-shadow','font-variation-settings','white-space','text-wrap','border-radius','border-width','border-color','opacity','box-shadow','object-fit','overflow']);
function stylesForElement(el,rules){
  const declarations={};
  rules.forEach(rule=>{try{if(el.matches(rule.selector))Object.assign(declarations,rule.declarations);}catch{}});
  Object.assign(declarations,parseCssDeclarations(el.getAttribute('style')||''));
  const customCss=Object.entries(declarations).filter(([prop])=>!supportedCssProperties.has(prop)).map(([prop,value])=>`${prop}: ${value};`).join(' ');
  return {styles:declarationsToOrbit(declarations),customCss};
}
function applyClassMetadata(node,el){
  const classes=[...el.classList]; node.customClasses=classes;
  const bem=classes.find(cls=>/^[a-z0-9-]+(?:__[a-z0-9-]+)?(?:--[a-z0-9-]+)?$/i.test(cls)&&(/__|--/.test(cls)));
  if(bem){
    const basePart=bem.split('--')[0],modifier=bem.includes('--')?bem.split('--')[1]:'';
    const [block,element='']=basePart.split('__'); node.bemBlock=block;node.bemElement=element;node.bemModifiers=modifier?[modifier]:[];
    node.customClasses=classes.filter(cls=>cls!==bem);
  }
}
function elementName(el){ return el.getAttribute('aria-label')||el.id||[...el.classList][0]||el.tagName.toLowerCase(); }
function domElementToNode(el,rules){
  const tag=el.tagName.toLowerCase(); if(['script','style','link','meta','title','noscript'].includes(tag))return null;
  let type='container';
  if(/^h[1-6]$/.test(tag))type='heading';
  else if(['p','span','small','label','blockquote','figcaption','address'].includes(tag)||(tag==='li'&&!el.children.length))type='text';
  else if(['a','button'].includes(tag)&&!el.children.length)type='button';
  else if(tag==='img')type='image';
  else if(tag==='hr')type='divider';
  else if(tag==='article')type='card';
  else if(['section','header','main','footer'].includes(tag))type='section';
  const node=makeNode(type); node.name=elementName(el); node.htmlTag=tag; node.ariaLabel=el.getAttribute('aria-label')||'';
  const importedStyle=stylesForElement(el,rules); node.styles.base={...(node.styles?.base||{}),...importedStyle.styles}; node.customCss=importedStyle.customCss;
  applyClassMetadata(node,el);
  if(type==='heading'||type==='text'){node.content=(el.textContent||'').trim(); if(type==='heading')node.tag=tag;}
  if(type==='button'){node.content=(el.textContent||'').trim()||'Link';node.href=el.getAttribute('href')||'';}
  if(type==='image'){node.src=el.getAttribute('src')||'';node.alt=el.getAttribute('alt')||'';}
  if(accepts(node)){
    const children=[];
    [...el.childNodes].forEach(child=>{
      if(child.nodeType===1){const converted=domElementToNode(child,rules);if(converted)children.push(converted);}
      else if(child.nodeType===3&&child.textContent.trim()){
        const text=makeNode('text');text.htmlTag='span';text.content=child.textContent.trim();text.name='Inline text';children.push(text);
      }
    });
    node.children=children;
  }
  return node;
}
function importHtmlCss(html,css,mode='replace'){
  const doc=new DOMParser().parseFromString(html,'text/html'); const rules=parseCssRules(css); const nodes=[];
  [...doc.body.children].forEach(el=>{const node=domElementToNode(el,rules);if(node)nodes.push(node);});
  if(!nodes.length)throw new Error('No se encontraron elementos HTML compatibles.');
  const importedTokens=analyzeDesignSystem(css); ensureTokenGroups(); importedTokens.forEach(item=>{state.tokens[item.category][item.key]={name:item.name,value:item.value,cssVar:item.cssVar};});
  state.nodes=hydrateNodes(mode==='append'?[...state.nodes,...nodes]:nodes);
  setSelection(nodes[0].id);
  return nodes.length;
}

const importNodeTypes=new Set(['section','container','heading','text','button','image','svg','card','divider','spacer']);
function normalizeOrbitImport(data){
  const warnings=[];const seen=new Set();const classSeen=new Set();const classNames=new Set();let repairedIds=0,unsupported=0,autoClasses=0;
  const source=Array.isArray(data)?{nodes:data}:data||{};
  if(!Array.isArray(source.nodes))throw new Error('El documento no contiene un arreglo nodes.');
  function cleanStyleGroups(raw,label){
    const result={};const groups=raw&&typeof raw==='object'?raw:{};
    Object.entries(groups).forEach(([group,values])=>{
      if(!values||typeof values!=='object'){result[group]={};return;}
      result[group]={};Object.entries(values).forEach(([prop,value])=>{
        if(supportedOrbitStyleProps.has(prop))result[group][prop]=value;
        else{unsupported++;warnings.push(`Propiedad “${prop}” omitida en ${label}.`);}
      });
    });
    return result;
  }
  const globalClasses=(Array.isArray(source.globalClasses)?source.globalClasses:[]).map((raw,index)=>{
    const original=raw&&typeof raw==='object'?raw:{};let id=String(original.id||uid('class'));
    if(classSeen.has(id)){id=uid('class');repairedIds++;warnings.push(`ID de clase duplicado reparado en ${original.name||`clase ${index+1}`}.`);}classSeen.add(id);
    let name=sanitizeClass(original.name||`shared-${index+1}`)||`shared-${index+1}`;const baseName=name;let suffix=2;while(classNames.has(name))name=`${baseName}-${suffix++}`;if(name!==baseName)warnings.push(`Nombre de clase duplicado renombrado a .${name}.`);classNames.add(name);
    const styles=cleanStyleGroups(original.styles||{base:{}},`clase .${name}`);styles.base=styles.base||{};const backgroundConfig=original.backgroundConfig?normalizeBackgroundConfig(original.backgroundConfig,styles.base.background||''):undefined;if(backgroundConfig)styles.base.background=composeBackground(backgroundConfig);
    return {...clone(original),id,name,styles,states:cleanStyleGroups(original.states||{},`estados de .${name}`),backgroundConfig};
  });
  const validClassIds=()=>new Set(globalClasses.map(item=>item.id));
  function cleanNode(raw,index=0){
    const original=raw&&typeof raw==='object'?raw:{};let type=importNodeTypes.has(original.type)?original.type:'container';if(type!==original.type){warnings.push(`Tipo “${original.type||'vacío'}” convertido a container.`);unsupported++;}
    let id=String(original.id||uid(type));if(seen.has(id)){id=uid(type);repairedIds++;warnings.push(`ID duplicado reparado en ${original.name||original.type||`elemento ${index+1}`}.`);}seen.add(id);
    const node={...makeNode(type),...clone(original),id,type};node.styles=cleanStyleGroups(original.styles||{base:{}},node.name||id);node.styles.base=node.styles.base||{};node.states=cleanStyleGroups(original.states||{},`estados de ${node.name||id}`);node.backgroundConfig=original.backgroundConfig?normalizeBackgroundConfig(original.backgroundConfig,node.styles.base.background||''):undefined;if(node.backgroundConfig)node.styles.base.background=composeBackground(node.backgroundConfig);
    const available=validClassIds();const requested=[...new Set(Array.isArray(original.globalClassIds)?original.globalClassIds.map(String):[])];node.globalClassIds=requested.filter(classId=>available.has(classId));
    if(node.globalClassIds.length!==requested.length)warnings.push(`${requested.length-node.globalClassIds.length} referencias de clase inexistentes omitidas en ${node.name||id}.`);
    const preferred=String(original.styleClassId||'');node.styleClassId=available.has(preferred)&&node.globalClassIds.includes(preferred)?preferred:(node.globalClassIds.length===1?node.globalClassIds[0]:'');
    node.styleEditMode=original.styleEditMode==='local'?'local':(node.styleClassId?'shared':undefined);
    node.children=Array.isArray(original.children)?original.children.map(cleanNode):undefined;
    return node;
  }
  const nodes=source.nodes.map(cleanNode);
  const flat=[];(function walk(list){list.forEach(node=>{flat.push(node);walk(node.children||[]);});})(nodes);
  const repeated=new Map();
  flat.forEach(node=>{
    if(node.styleClassId||(node.globalClassIds||[]).length)return;
    const hasStyles=Object.values(node.styles||{}).some(group=>Object.keys(group||{}).length)||Object.values(node.states||{}).some(group=>Object.keys(group||{}).length);if(!hasStyles)return;
    const signature=JSON.stringify({type:node.type,styles:node.styles,states:node.states});if(!repeated.has(signature))repeated.set(signature,[]);repeated.get(signature).push(node);
  });
  repeated.forEach(group=>{
    if(group.length<2)return;const first=group[0];let name=sanitizeClass(`shared-${first.type}-${slug(first.name||first.type)}`)||`shared-${first.type}`;const base=name;let suffix=2;while(classNames.has(name))name=`${base}-${suffix++}`;classNames.add(name);
    const id=uid('class');globalClasses.push({id,name,styles:clone(first.styles),states:clone(first.states)});classSeen.add(id);autoClasses++;
    group.forEach(node=>{node.globalClassIds=[...(node.globalClassIds||[]),id];node.styleClassId=id;node.styleEditMode='shared';node.styles={base:{}};node.states={};});
  });
  if(autoClasses)warnings.push(`${autoClasses} clases compartidas creadas automáticamente a partir de estilos repetidos.`);
  let autoComponents=0;const importedComponents=Array.isArray(source.components)?source.components:[];
  const treeSignatures=new Map();
  function getTreeTopologySignature(n){const childSigs=(n.children||[]).map(getTreeTopologySignature).join('|');return `${n.type}[${n.styleClassId||''}](${childSigs})`;}
  nodes.forEach(node=>{
    if(node.type==='container'||node.type==='card'||node.type==='section'){
      (node.children||[]).forEach(child=>{
        if((child.type==='container'||child.type==='card')&&(child.children||[]).length>0){
          const sig=getTreeTopologySignature(child);
          if(!treeSignatures.has(sig))treeSignatures.set(sig,[]);
          treeSignatures.get(sig).push(child);
        }
      });
    }
  });
  treeSignatures.forEach((group,sig)=>{
    if(group.length<2||sig.length<12)return;
    const masterNode=group[0];
    if(masterNode.componentRef||importedComponents.some(c=>c.masterId===masterNode.id))return;
    const compId=uid('comp');
    const compName=masterNode.name||`${masterNode.type.charAt(0).toUpperCase()+masterNode.type.slice(1)} Component`;
    masterNode.componentRef=compId;
    masterNode.componentSource='master';
    const props=(typeof detectComponentPropsFromTree==='function')?detectComponentPropsFromTree(masterNode):[];
    importedComponents.push({id:compId,name:compName,masterId:masterNode.id,instances:group.length-1,variants:[],props,createdAt:Date.now()});
    for(let i=1;i<group.length;i++){group[i].componentRef=compId;group[i].componentSource='instance';}
    autoComponents++;
  });
  if(autoComponents)warnings.push(`${autoComponents} componentes maestros promovidos automáticamente desde estructuras repetidas.`);
  const emptyImages=flat.filter(node=>node.type==='image'&&!String(node.src||'').trim()).length;if(emptyImages)warnings.push(`${emptyImages} imágenes no tienen una fuente definida.`);
  const missingAlt=flat.filter(node=>node.type==='image'&&!String(node.alt||'').trim()).length;if(missingAlt)warnings.push(`${missingAlt} imágenes requieren texto alternativo.`);
  const pages=Array.isArray(source.pages)?source.pages:[];
  const classAssignments=flat.reduce((sum,node)=>sum+(node.globalClassIds||[]).length,0);
  return {document:{...source,version:13,nodes:hydrateNodes(nodes),tokens:source.tokens||null,assets:Array.isArray(source.assets)?source.assets:[],components:importedComponents,globalClasses,pages},report:{nodes:flat.length,sections:flat.filter(node=>node.type==='section').length,images:flat.filter(node=>node.type==='image').length,components:importedComponents.length,classes:globalClasses.length,classAssignments,autoClasses,autoComponents,tokens:source.tokens?Object.values(source.tokens).reduce((sum,group)=>sum+Object.keys(group||{}).length,0):0,repairedIds,unsupported,warnings}};
}
const supportedOrbitStyleProps=new Set(['width','maxWidth','minWidth','height','maxHeight','minHeight','aspectRatio','boxSizing','paddingTop','paddingRight','paddingBottom','paddingLeft','marginTop','marginRight','marginBottom','marginLeft','gap','columnGap','rowGap','display','direction','flexWrap','justifyContent','justify','alignItems','align','justifyItems','alignContent','gridColumns','gridRows','gridTemplateColumns','gridTemplateRows','gridTemplateAreas','gridArea','gridColumn','gridRow','gridAutoColumns','gridAutoRows','gridAutoFlow','gridUseMinMax','gridColumnTracks','gridRowTracks','order','verticalAlign','alignSelf','justifySelf','flexGrow','flexShrink','flexBasis','position','zIndex','left','top','right','bottom','transform','transition','cursor','pointerEvents','background','color','fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','textAlign','fontStyle','textTransform','textDecoration','textShadow','fontVariationSettings','whiteSpace','textWrap','borderRadius','borderWidth','borderColor','opacity','boxShadow','objectFit','overflow']);
function clearOrbitImportReport(){
  state.pendingImport=null;
  const report=$('#orbit-import-report');
  if(report)report.innerHTML='';
}
function renderOrbitImportError(message,title='No se pudo leer el documento'){
  const target=$('#orbit-import-report');
  if(!target)return;
  target.innerHTML=`<div class="orbit-import-error"><span>${uiIcon('warning')}</span><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p></div></div>`;
}
function updateOrbitFileUi({name='',size=0,valid=true,message=''}={}){
  const dropzone=els.modalContent.querySelector('[data-orbit-json-dropzone]');
  const status=els.modalContent.querySelector('[data-orbit-file-status]');
  const fileName=els.modalContent.querySelector('[data-orbit-file-name]');
  const fileTitle=els.modalContent.querySelector('[data-orbit-file-title]');
  const fileAction=els.modalContent.querySelector('[data-orbit-file-action]');
  const statusTitle=els.modalContent.querySelector('[data-orbit-status-title]');
  const statusDetail=els.modalContent.querySelector('[data-orbit-status-detail]');
  if(dropzone)dropzone.classList.toggle('is-loaded',!!name);
  if(fileName)fileName.textContent=name||'Selecciona o arrastra un archivo .json';
  if(fileTitle)fileTitle.textContent=name?'Archivo cargado':'Cargar archivo JSON';
  if(fileAction)fileAction.textContent=name?'Cambiar archivo':'Seleccionar archivo';
  if(status){status.hidden=!name;status.classList.toggle('is-error',!valid);}
  if(statusTitle)statusTitle.textContent=valid?'JSON válido':'JSON con errores';
  if(statusDetail)statusDetail.textContent=message||(name?`${name}${size?` · ${Math.max(1,Math.round(size/1024))} KB`:''}`:'');
}
async function loadOrbitJsonFile(file){
  if(!file)return;
  const name=String(file.name||'documento.json');
  if(file.size>8*1024*1024){
    updateOrbitFileUi({name,size:file.size,valid:false,message:'El archivo supera el límite de 8 MB.'});
    renderOrbitImportError('Selecciona un archivo JSON menor de 8 MB.');
    return;
  }
  if(!/\.json$/i.test(name)&&file.type!=='application/json'){
    updateOrbitFileUi({name,size:file.size,valid:false,message:'El archivo debe tener extensión .json.'});
    renderOrbitImportError('El formato seleccionado no es compatible. Usa un archivo .json.');
    return;
  }
  try{
    const raw=await file.text();
    JSON.parse(raw);
    const area=$('#import-orbit-json');
    if(area)area.value=raw;
    clearOrbitImportReport();
    updateOrbitFileUi({name,size:file.size,valid:true,message:`${name} · ${Math.max(1,Math.round(file.size/1024))} KB · listo para analizar`});
    toast('Archivo JSON cargado');
  }catch(error){
    const area=$('#import-orbit-json');
    if(area)area.value=await file.text().catch(()=> '');
    clearOrbitImportReport();
    updateOrbitFileUi({name,size:file.size,valid:false,message:'El contenido no es un JSON válido.'});
    renderOrbitImportError(error.message,'El archivo contiene JSON inválido');
  }
}
function clearOrbitJsonFile(){
  const input=$('#orbit-json-file');
  const area=$('#import-orbit-json');
  if(input)input.value='';
  if(area)area.value='';
  clearOrbitImportReport();
  updateOrbitFileUi();
  area?.focus();
}

function analyzeOrbitJsonSource(){
  const raw=$('#import-orbit-json')?.value?.trim()||'';
  if(!raw){renderOrbitImportError('Pega un documento JSON o carga un archivo .json antes de analizar.','Falta el documento JSON');return;}
  try{
    const parsed=JSON.parse(raw);const result=normalizeOrbitImport(parsed);state.pendingImport={type:'orbit-ai',...result,mode:$('#orbit-import-mode')?.value||'replace'};const r=result.report;const target=$('#orbit-import-report');
    if(target)target.innerHTML=`<div class="ai-import-report"><div class="ai-report-title"><span>${uiIcon('sparkles')}</span><div><strong>Documento listo para importar</strong><p>Orbit revisó estructura, clases compartidas y referencias.</p></div></div><div class="ai-report-stats"><div><strong>${r.nodes}</strong><span>Nodos</span></div><div><strong>${r.sections}</strong><span>Secciones</span></div><div><strong>${r.images}</strong><span>Imágenes</span></div><div><strong>${r.tokens}</strong><span>Tokens</span></div><div><strong>${r.classes}</strong><span>Clases · ${r.classAssignments} usos</span></div></div>${r.warnings.length?`<div class="ai-report-warnings"><strong>${r.warnings.length} revisiones</strong>${r.warnings.slice(0,8).map(item=>`<p><span>!</span>${escapeHtml(item)}</p>`).join('')}</div>`:'<div class="ai-report-success">✓ No se detectaron problemas estructurales.</div>'}<button class="primary-action ai-import-commit" type="button" data-commit-orbit-import>Importar en Orbit</button></div>`;
  }catch(error){state.pendingImport=null;renderOrbitImportError(error.message,'El JSON no es válido');}
}
function prepareImportedSharedClasses(doc,mode){
  const incoming=clone(doc.globalClasses||[]);
  if(mode==='replace')return {nodes:clone(doc.nodes),classes:incoming};
  const classes=clone(state.globalClasses||[]);const remap=new Map();
  const sameDefinition=(a,b)=>JSON.stringify({styles:a?.styles||{},states:a?.states||{}})===JSON.stringify({styles:b?.styles||{},states:b?.states||{}});
  incoming.forEach(item=>{
    const byId=classes.find(existing=>existing.id===item.id);const byName=classes.find(existing=>existing.name===item.name);const reusable=[byId,byName].find(existing=>existing&&sameDefinition(existing,item));
    if(reusable){remap.set(item.id,reusable.id);return;}
    const next=clone(item);if(byId)next.id=uid('class');if(byName){const base=next.name;let suffix=2;while(classes.some(existing=>existing.name===next.name))next.name=`${base}-${suffix++}`;}classes.push(next);remap.set(item.id,next.id);
  });
  const rewrite=nodes=>(nodes||[]).map(node=>{const next={...clone(node)};next.globalClassIds=(next.globalClassIds||[]).map(id=>remap.get(id)||id);if(next.styleClassId)next.styleClassId=remap.get(next.styleClassId)||next.styleClassId;if(next.children)next.children=rewrite(next.children);return next;});
  return {nodes:rewrite(doc.nodes),classes};
}
function commitOrbitAiImport(){
  const pending=state.pendingImport;if(pending?.type!=='orbit-ai')return;const doc=pending.document,mode=pending.mode;const before=snapshot();const prepared=prepareImportedSharedClasses(doc,mode);const importedNodes=prepared.nodes;
  if(mode==='append'){state.nodes=hydrateNodes([...state.nodes,...clone(importedNodes)]);state.selectedId=importedNodes[0]?.id||state.selectedId;state.selectedIds=state.selectedId?[state.selectedId]:[];}
  else if(mode==='new-page'){
    syncCurrentPageRecord();const id=uid('page');const name=doc.projectName||`AI page ${state.pages.length+1}`;state.pages.push({id,name,slug:`/${slug(name)}`,nodes:hydrateNodes(clone(importedNodes)),meta:clone(doc.pageMeta||{language:'es',title:name,description:''})});state.currentPageId=id;state.nodes=hydrateNodes(clone(importedNodes));state.pageMeta=clone(doc.pageMeta||{language:'es',title:name,description:''});state.selectedId=state.nodes[0]?.id||null;state.selectedIds=state.selectedId?[state.selectedId]:[];
  }else{state.nodes=hydrateNodes(clone(importedNodes));state.pageMeta=clone(doc.pageMeta||state.pageMeta);state.selectedId=state.nodes[0]?.id||null;state.selectedIds=state.selectedId?[state.selectedId]:[];}
  state.globalClasses=prepared.classes;
  if(doc.tokens){state.tokens=clone(doc.tokens);ensureTokenGroups();}if(doc.assets?.length)state.assets=clone(doc.assets);if(doc.components?.length)state.components=clone(doc.components).map(normalizeComponentDefinition);if(doc.projectName)state.projectName=doc.projectName;
  syncCurrentPageRecord();pushHistory(before);markUnsaved();closeModal();render();els.projectName.value=state.projectName;toast(`Importación completada · ${pending.report.nodes} nodos`);
}



function getInterfaceProfile(){
  const width=window.innerWidth;
  if(width>=3840)return 'cinema';
  if(width>=2400)return 'ultrawide';
  if(width>=1600)return 'wide';
  if(width>=1440)return 'desktop';
  if(width>=1280)return 'laptop';
  if(width>=1200)return 'compact';
  return 'tablet';
}
function interfaceProfileLabel(profile=state.interfaceProfile){
  return ({cinema:'Super ultrawide',ultrawide:'Ultrawide',wide:'Wide desktop',desktop:'Desktop',laptop:'Laptop',compact:'Compact',tablet:'Tablet'})[profile]||'Desktop';
}
function panelLimits(side){
  const profile=state.interfaceProfile||getInterfaceProfile();
  const map={
    cinema:{left:[340,760],right:[320,700]},
    ultrawide:{left:[330,660],right:[310,620]},
    wide:{left:[320,560],right:[300,520]},
    desktop:{left:[300,440],right:[290,440]},
    laptop:{left:[280,350],right:[280,350]},
    compact:{left:[270,320],right:[270,320]},
    tablet:{left:[320,430],right:[300,420]}
  }[profile]||{left:[300,560],right:[300,520]};
  return side==='left'?map.left:map.right;
}
function effectivePanelWidth(side,value){
  const [min,max]=panelLimits(side);
  return Math.max(min,Math.min(max,Number(value)||min));
}
function applyAdaptiveWorkspace(){
  const next=getInterfaceProfile();
  const previous=state.interfaceProfile;
  state.previousInterfaceProfile=previous;
  state.interfaceProfile=next;
  els.builder.dataset.interfaceProfile=next;
  els.builder.classList.toggle('adaptive-tablet',next==='tablet');
  els.builder.classList.toggle('adaptive-compact',next==='compact');
  els.builder.classList.toggle('adaptive-laptop',next==='laptop');
  els.builder.classList.toggle('adaptive-ultrawide',next==='ultrawide'||next==='cinema');
  els.builder.classList.toggle('adaptive-cinema',next==='cinema');
  const profileLabel=document.getElementById('interface-profile-label');
  if(profileLabel){profileLabel.textContent=interfaceProfileLabel(next);profileLabel.dataset.profile=next;profileLabel.title=`Interfaz adaptada a ${window.innerWidth} × ${window.innerHeight}px`;}

  if(next==='tablet'&&previous!=='tablet'){
    state.preTabletPanelState={left:state.leftPanelCollapsed,right:state.rightPanelCollapsed};
    if(!state.adaptiveUserTouched){
      state.leftPanelCollapsed=true;
      state.rightPanelCollapsed=true;
      state.adaptiveTabletAutoCollapsed=true;
    }
  }
  if(previous==='tablet'&&next!=='tablet'&&state.adaptiveTabletAutoCollapsed&&!state.adaptiveUserTouched){
    state.leftPanelCollapsed=!!state.preTabletPanelState?.left;
    state.rightPanelCollapsed=!!state.preTabletPanelState?.right;
    state.adaptiveTabletAutoCollapsed=false;
  }
  document.documentElement.dataset.interfaceProfile=next;
}
function ensureLeftPanelChrome(){
  if(!document.getElementById('left-panel-resizer')){
    const handle=document.createElement('div');
    handle.id='left-panel-resizer';
    handle.className='panel-resizer-left';
    handle.setAttribute('aria-hidden','true');
    els.builder.appendChild(handle);
  }
  if(!document.getElementById('left-panel-toggle')){
    const toggle=document.createElement('button');
    toggle.id='left-panel-toggle';
    toggle.type='button';
    toggle.className='left-panel-toggle';
    toggle.title='Colapsar panel izquierdo';
    toggle.setAttribute('aria-label','Colapsar panel izquierdo');
    els.builder.appendChild(toggle);
  }
  if(!document.getElementById('left-panel-reveal')){
    const reveal=document.createElement('button');
    reveal.id='left-panel-reveal';
    reveal.type='button';
    reveal.className='left-panel-reveal';
    reveal.title='Abrir panel izquierdo';
    reveal.setAttribute('aria-label','Abrir panel izquierdo');
    reveal.innerHTML=`<span>${uiIcon('layout')}</span><small>Panel</small>`;
    els.builder.appendChild(reveal);
  }
}
let fluidCanvasFitTimer=0;
function scheduleFluidCanvasFit(){
  if(!viewportEngine)return;
  const fit=()=>viewportEngine.fitToWorkspace({silent:true,mode:preferredCanvasFitMode(state.breakpoint)});
  requestAnimationFrame(()=>requestAnimationFrame(fit));
  clearTimeout(fluidCanvasFitTimer);
  fluidCanvasFitTimer=setTimeout(fit,220);
}
function applyLeftPanelChrome(){
  ensureLeftPanelChrome();
  const width=effectivePanelWidth('left',state.leftPanelWidth);
  state.leftPanelEffectiveWidth=width;
  document.documentElement.style.setProperty('--left',state.leftPanelCollapsed?'0px':`${width}px`);
  document.documentElement.style.setProperty('--left-header',state.leftPanelCollapsed?'84px':`${width}px`);
  els.builder.classList.toggle('left-collapsed',!!state.leftPanelCollapsed);
  const toggle=document.getElementById('left-panel-toggle');
  if(toggle){
    toggle.innerHTML=uiIcon('arrowLeft');
    toggle.title='Colapsar panel izquierdo';
    toggle.setAttribute('aria-label',toggle.title);
  }
}
function toggleLeftPanel(force){
  state.adaptiveUserTouched=true;state.adaptiveTabletAutoCollapsed=false;
  state.leftPanelCollapsed=typeof force==='boolean'?force:!state.leftPanelCollapsed;
  applyLeftPanelChrome();
  scheduleFluidCanvasFit();
  markUnsaved();
}
function startLeftPanelResize(event){
  if(state.leftPanelCollapsed)return;
  event.preventDefault();
  state.adaptiveUserTouched=true;state.adaptiveTabletAutoCollapsed=false;
  state.leftPanelResizing={startX:event.clientX,startWidth:state.leftPanelEffectiveWidth||effectivePanelWidth('left',state.leftPanelWidth)};
  document.body.style.cursor='ew-resize';
  document.body.classList.add('is-resizing-panel');
}
function moveLeftPanelResize(event){
  if(!state.leftPanelResizing)return;
  const [min,max]=panelLimits('left');
  const next=Math.max(min,Math.min(max,state.leftPanelResizing.startWidth+(event.clientX-state.leftPanelResizing.startX)));
  state.leftPanelWidth=next;
  applyLeftPanelChrome();
  scheduleFluidCanvasFit();
}
function endLeftPanelResize(){
  if(!state.leftPanelResizing)return;
  state.leftPanelResizing=null;
  document.body.style.cursor='';
  document.body.classList.remove('is-resizing-panel');
  scheduleFluidCanvasFit();
  markUnsaved();
}

function ensureRightPanelChrome(){
  const header=document.querySelector('.right-header');
  if(header&&!document.getElementById('right-panel-toggle')){
    const button=document.createElement('button');
    button.id='right-panel-toggle';
    button.className='icon-button-pro inspector-collapse-toggle';
    button.type='button';
    button.title='Ocultar Editar';
    button.setAttribute('aria-label','Ocultar Editar');
    header.appendChild(button);
  }
  if(!document.getElementById('right-panel-resizer')){
    const handle=document.createElement('div');
    handle.id='right-panel-resizer';
    handle.className='panel-resizer-right';
    handle.setAttribute('aria-hidden','true');
    els.builder.appendChild(handle);
  }
  if(!document.getElementById('right-panel-reveal')){
    const reveal=document.createElement('button');
    reveal.id='right-panel-reveal';
    reveal.type='button';
    reveal.className='right-panel-reveal';
    reveal.title='Abrir Editar';
    reveal.setAttribute('aria-label','Abrir Editar');
    reveal.innerHTML=`<span>${uiIcon('settings')}</span><small>Editar</small>`;
    els.builder.appendChild(reveal);
  }
}
function applyRightPanelChrome(){
  ensureRightPanelChrome();
  const width=effectivePanelWidth('right',state.rightPanelWidth);
  const railWidth=Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--orbit-rail'))||74;
  state.rightPanelEffectiveWidth=width;
  document.documentElement.style.setProperty('--right', state.rightPanelCollapsed?`${railWidth}px`:`${width}px`);
  els.builder.classList.toggle('right-collapsed',!!state.rightPanelCollapsed);
  const toggle=document.getElementById('right-panel-toggle');
  if(toggle){
    toggle.innerHTML=state.rightPanelCollapsed?uiIcon('arrowLeft'):uiIcon('arrowRight');
    toggle.title=state.rightPanelCollapsed?'Abrir Editar':'Ocultar Editar';
    toggle.setAttribute('aria-label',toggle.title);
  }
  const topToggle=document.getElementById('inspector-top-toggle');
  if(topToggle){topToggle.classList.toggle('active',!state.rightPanelCollapsed);topToggle.title=state.rightPanelCollapsed?'Abrir Editar':'Ocultar Editar';topToggle.setAttribute('aria-label',topToggle.title);}
}
function toggleRightPanel(force){
  state.adaptiveUserTouched=true;state.adaptiveTabletAutoCollapsed=false;
  state.rightPanelCollapsed=typeof force==='boolean'?force:!state.rightPanelCollapsed;
  applyRightPanelChrome();
  scheduleFluidCanvasFit();
  markUnsaved();
}
function startRightPanelResize(event){
  if(state.rightPanelCollapsed)return;
  event.preventDefault();
  state.adaptiveUserTouched=true;state.adaptiveTabletAutoCollapsed=false;
  state.rightPanelResizing={startX:event.clientX,startWidth:state.rightPanelEffectiveWidth||effectivePanelWidth('right',state.rightPanelWidth)};
  document.body.style.cursor='ew-resize';
  document.body.classList.add('is-resizing-panel');
}
function moveRightPanelResize(event){
  if(!state.rightPanelResizing)return;
  const [min,max]=panelLimits('right');
  const next=Math.max(min,Math.min(max,state.rightPanelResizing.startWidth-(event.clientX-state.rightPanelResizing.startX)));
  state.rightPanelWidth=next;
  applyRightPanelChrome();
  scheduleFluidCanvasFit();
}
function endRightPanelResize(){
  if(!state.rightPanelResizing)return;
  state.rightPanelResizing=null;
  document.body.style.cursor='';
  document.body.classList.remove('is-resizing-panel');
  scheduleFluidCanvasFit();
  markUnsaved();
}

const renderErrors=new Set();
function renderPart(name,callback){
  try{callback();}
  catch(error){
    console.error(`[Orbit] ${name}`,error);
    if(!renderErrors.has(name)){renderErrors.add(name);toast(`Orbit detectó un problema en ${name}. El resto de la interfaz sigue disponible.`,'error',3200);}
  }
}
function syncTooltips(){
  const selector='.icon-button,.icon-button-pro,.element-actions button,.page-card-actions button,.component-card-actions button,.global-class-edit,.global-class-delete,.layer-visibility,.layer-lock,.element-favorite,.viewport-switcher button';
  document.querySelectorAll(selector).forEach(element=>{
    const label=element.getAttribute('title')||element.getAttribute('aria-label');
    if(!label)return;
    element.dataset.tooltip=label;
    element.setAttribute('aria-label',label);
    element.removeAttribute('title');
  });
}
function render(){
  renderPart('documento',ensureProjectPages);
  if(state.components.length)renderPart('componentes',refreshComponentCounts);
  const pageLabel=document.getElementById('current-page-label');if(pageLabel)pageLabel.textContent=currentPage()?.name||'Page';
  renderPart('responsive',renderViewport);
  renderPart('panel izquierdo',renderLeft);
  renderPart('canvas',renderCanvas);
  renderPart('breadcrumbs',renderBreadcrumbs);
  renderPart('inspector',renderInspector);
  renderPart('auditoría',renderAuditCount);
  renderPart('grid builder',renderGridBuilder);
  renderPart('selección múltiple',renderMultiToolbar);
  renderPart('workspace adaptable',applyAdaptiveWorkspace);
  renderPart('panel izquierdo adaptable',applyLeftPanelChrome);
  renderPart('inspector adaptable',applyRightPanelChrome);
  $('#undo').disabled=!state.history.length; $('#redo').disabled=!state.future.length;
  $('#toggle-grid').classList.toggle('active',state.grid);
  $('#toggle-guides')?.classList.toggle('active',state.rulers);
  $('#toggle-guide-visibility')?.classList.toggle('active',state.guidesVisible);
  $('#toggle-snap')?.classList.toggle('active',state.snap);
  $('#lock-guides')?.classList.toggle('active',state.guidesLocked);
  $('#toggle-guides')?.setAttribute('aria-pressed',String(state.rulers));
  $('#toggle-guide-visibility')?.setAttribute('aria-pressed',String(state.guidesVisible));
  $('#toggle-snap')?.setAttribute('aria-pressed',String(state.snap));
  $('#lock-guides')?.setAttribute('aria-pressed',String(state.guidesLocked));
  syncGuidesMenu();
  themeSystem?.sync();
  measurementTools?.scheduleRender();
  syncTooltips();
}

function insertionForClick(){
  if(!state.selectedId)return {parentId:null,index:state.nodes.length};
  const info=findInfo(state.nodes,state.selectedId); const node=info?.node;
  if(accepts(node))return {parentId:node.id,index:(node.children||[]).length};
  return info?{parentId:info.parentId,index:info.index+1}:{parentId:null,index:state.nodes.length};
}

function addElement(type,placement=insertionForClick()){ const node=makeNode(type); rememberRecentElement(type); commit(()=>{ state.nodes=insertAt(state.nodes,placement.parentId,placement.index,node); },node.id); toast(`${node.name} añadido`); }
function addTemplate(templateId,placement={parentId:null,index:state.nodes.length}){
  const template=sectionTemplates.find(item=>item.id===templateId); if(!template)return;
  const node=template.create(); commit(()=>{ state.nodes=insertAt(state.nodes,placement.parentId,placement.index,node); },node.id); toast(`${template.name} añadido`);
}
function moveSelected(direction){
  const info=findInfo(state.nodes,state.selectedId); if(!info)return;
  const parent=info.parentId?find(state.nodes,info.parentId):null; const siblings=parent?.children||state.nodes; const target=info.index+direction;
  if(target<0||target>=siblings.length)return;
  commit(()=>{ const result=extract(state.nodes,state.selectedId); state.nodes=insertAt(result.nodes,info.parentId,target,result.removed); });
}
function deleteSelected(){
  const ids=selectedIds();if(!ids.length)return;
  if(ids.some(id=>find(state.nodes,id)?.locked)){toast('Desbloquea las capas antes de eliminarlas');return;}
  const master=ids.map(id=>find(state.nodes,id)).find(node=>node?.componentRoot&&node.componentSource==='master');
  if(master?.componentRef){showDeleteComponentDialog(master.componentRef);return;}
  const fallback=findInfo(state.nodes,state.selectedId)?.parentId||null;
  const before=snapshot();state.nodes=removeSelectedIds(state.nodes,ids);setSelection(fallback);refreshComponentCounts();pushHistory(before);markUnsaved();render();
}
function duplicateSelected(){
  const ids=selectedIds();if(!ids.length)return;
  const before=snapshot();const copies=[];
  ids.forEach(id=>{
    const info=findInfo(state.nodes,id);if(!info)return;let copy;
    if(info.node.componentRef&&info.node.componentRoot){
      const variantId=info.node.componentSource==='instance'?(info.node.componentVariantId||''):'';
      const source=componentSourceTree(info.node.componentRef,variantId)||info.node;
      copy=prepareComponentInstance(source,info.node.componentRef,{name:`${info.node.name} copy`,variantId,overrides:info.node.componentSource==='instance'?(info.node.componentOverrides||{}):{}});
    }else if(info.node.componentRef){
      copy=clearComponentMetadataDeep(regenerate(info.node));copy.name=`${info.node.name} copy`;
    }else{copy=regenerate(info.node);copy.name=`${info.node.name} copy`;}
    state.nodes=insertAt(state.nodes,info.parentId,info.index+1,copy);copies.push(copy.id);
  });
  state.selectedIds=copies;state.selectedId=copies[copies.length-1]||null;refreshComponentCounts();pushHistory(before);markUnsaved();render();
}
function resetOverride(){
  if(!state.selectedId)return;
  if(state.styleState!=='default'){commit(()=>{state.nodes=update(state.nodes,state.selectedId,n=>{const states={...(n.states||{})};delete states[state.styleState];return {...n,states};});});return;}
  if(state.breakpoint==='desktop')return;
  commit(()=>{state.nodes=update(state.nodes,state.selectedId,n=>{const styles={...n.styles};delete styles[state.breakpoint];return {...n,styles};});});
}
function undo(){ const prev=state.history.pop(); if(!prev)return; state.future.unshift(snapshot()); restore(prev); markUnsaved(); render(); }
function redo(){ const next=state.future.shift(); if(!next)return; state.history.push(snapshot()); restore(next); markUnsaved(); render(); }

function toast(message,type='info',duration=1800){
  els.toast.textContent=message;
  els.toast.dataset.type=type;
  els.toast.setAttribute('role',type==='error'?'alert':'status');
  if(type==='error')accessibility?.announcer.alert(message);else accessibility?.announcer.status(message);
  els.toast.hidden=false;
  clearTimeout(toast.timer);
  toast.timer=setTimeout(()=>{els.toast.hidden=true;delete els.toast.dataset.type;},duration);
}
let saveTimer;
function markUnsaved(){
  els.saveDot.classList.remove('saved');els.saveLabel.textContent='Guardando proyecto…';markProjectSessionDirty();clearTimeout(saveTimer);
  saveTimer=setTimeout(async()=>{
    try{await saveActiveProject();}
    catch{els.saveLabel.textContent='Sesión temporal';try{safeLocalSet(STORAGE_KEY,JSON.stringify(workspaceSnapshot()));}catch{}}
  },450);
}

let dragPayload=null;
let dragGhost=null;
function dragPayloadLabel(payload=dragPayload){
  if(!payload)return 'Mover elemento';
  if(payload.kind==='element')return elementMeta(payload.type)?.label||payload.type;
  if(payload.kind==='template')return sectionTemplates.find(item=>item.id===payload.id)?.name||'Sección';
  if(payload.kind==='asset')return state.assets.find(item=>item.id===payload.id)?.name||'Imagen';
  if(payload.kind==='node')return find(state.nodes,payload.id)?.name||'Elemento';
  return 'Elemento';
}
function ensureDragGhost(){
  if(dragGhost)return dragGhost;
  dragGhost=document.createElement('div');
  dragGhost.className='orbit-drag-ghost';
  dragGhost.hidden=true;
  dragGhost.innerHTML=`<span>${uiIcon('move')}</span><strong></strong><small>Arrastra al canvas</small>`;
  document.body.appendChild(dragGhost);
  return dragGhost;
}
function updateDropTargets(active){
  document.body.classList.toggle('orbit-is-dragging',active);
  els.canvas?.classList.toggle('is-receiving-drag',active);
  els.canvas?.querySelectorAll('[data-id]').forEach(element=>{
    const node=find(state.nodes,element.dataset.id);
    const dragged=dragPayload?.kind==='node'?find(state.nodes,dragPayload.id):null;
    const blocked=!!dragged&&(element.dataset.id===dragPayload.id||isDescendant(dragged,element.dataset.id));
    element.classList.toggle('drop-target-ready',active&&accepts(node)&&!blocked&&!node?.locked);
  });
}
function startDragUi(event){
  const ghost=ensureDragGhost();
  ghost.querySelector('strong').textContent=dragPayloadLabel();
  ghost.hidden=false;
  ghost.style.left=`${event.clientX+16}px`;
  ghost.style.top=`${event.clientY+16}px`;
  updateDropTargets(true);
}
function moveDragUi(event){
  if(!dragPayload||!dragGhost||dragGhost.hidden)return;
  dragGhost.style.left=`${event.clientX+16}px`;
  dragGhost.style.top=`${event.clientY+16}px`;
}
function endDragUi(){
  if(dragGhost)dragGhost.hidden=true;
  updateDropTargets(false);
}

function showDropIndicator(drop){
  state.drop=drop;
  if(!drop){ els.indicator.hidden=true;els.indicator.removeAttribute('data-label');return; }
  const {rect,mode,axis}=drop;
  const parentName=drop.parentId?(find(state.nodes,drop.parentId)?.name||'contenedor'):'página';
  els.indicator.dataset.label=mode==='inside'?`Insertar dentro de ${parentName}`:mode==='before'?'Insertar antes':'Insertar después';
  els.indicator.hidden=false; els.indicator.className=`drop-indicator ${mode==='inside'?'inside':axis==='x'?'vertical':'horizontal'}`;
  if(mode==='inside'){
    els.indicator.style.left=`${rect.left}px`; els.indicator.style.top=`${rect.top}px`; els.indicator.style.width=`${rect.width}px`; els.indicator.style.height=`${rect.height}px`;
  }else if(axis==='x'){
    const x=mode==='before'?rect.left:rect.right; els.indicator.style.left=`${x-1}px`; els.indicator.style.top=`${rect.top}px`; els.indicator.style.width='3px'; els.indicator.style.height=`${rect.height}px`;
  }else{
    const y=mode==='before'?rect.top:rect.bottom; els.indicator.style.left=`${rect.left}px`; els.indicator.style.top=`${y-1}px`; els.indicator.style.width=`${rect.width}px`; els.indicator.style.height='3px';
  }
}

function computeDrop(event){
  const targetEl=event.target.closest?.('[data-id]');
  if(!targetEl){
    const rect=els.canvas.getBoundingClientRect();
    return {parentId:null,index:state.nodes.length,mode:'after',axis:'y',rect:{left:rect.left,top:rect.bottom-3,width:rect.width,height:3,right:rect.right,bottom:rect.bottom}};
  }
  const target=find(state.nodes,targetEl.dataset.id); if(!target)return null;
  const rect=targetEl.getBoundingClientRect();
  const overEmpty=!!event.target.closest?.('.empty-drop');
  const directSurface=event.target===targetEl;
  const centralY=event.clientY>rect.top+rect.height*.22&&event.clientY<rect.bottom-rect.height*.22;
  const centralX=event.clientX>rect.left+rect.width*.12&&event.clientX<rect.right-rect.width*.12;
  if(accepts(target)&&(overEmpty||(directSurface&&centralY&&centralX))){
    return {parentId:target.id,index:(target.children||[]).length,mode:'inside',axis:'y',rect};
  }
  const info=findInfo(state.nodes,target.id); if(!info)return null;
  const parent=info.parentId?find(state.nodes,info.parentId):null;
  const ps=parent?effective(parent):{display:'flex',direction:'column'};
  const axis=ps.display==='flex'&&ps.direction==='row'?'x':'y';
  const before=axis==='x'?event.clientX<rect.left+rect.width/2:event.clientY<rect.top+rect.height/2;
  return {parentId:info.parentId,index:info.index+(before?0:1),mode:before?'before':'after',axis,rect};
}

function performDrop(drop){
  if(!drop||!dragPayload)return;
  if(dragPayload.kind==='element'){ addElement(dragPayload.type,{parentId:drop.parentId,index:drop.index}); return; }
  if(dragPayload.kind==='template'){
    // Complete sections always live at the root.
    const rootIndex=drop.parentId?state.nodes.length:drop.index;
    addTemplate(dragPayload.id,{parentId:null,index:rootIndex}); return;
  }
  if(dragPayload.kind==='asset'){
    const asset=state.assets.find(a=>a.id===dragPayload.id); if(!asset)return;
    const node=makeNode('image'); node.src=asset.src; node.alt=asset.alt||asset.name;
    commit(()=>{state.nodes=insertAt(state.nodes,drop.parentId,drop.index,node);},node.id); return;
  }
  if(dragPayload.kind==='node'){
    const info=findInfo(state.nodes,dragPayload.id); if(!info)return;
    if(drop.parentId===dragPayload.id||isDescendant(info.node,drop.parentId)) { toast('No puedes mover un elemento dentro de sí mismo'); return; }
    let index=drop.index;
    if(info.parentId===drop.parentId&&info.index<index)index--;
    if(info.parentId===drop.parentId&&info.index===index)return;
    commit(()=>{ const result=extract(state.nodes,dragPayload.id); state.nodes=insertAt(result.nodes,drop.parentId,index,result.removed); },dragPayload.id);
  }
}

function startInlineEdit(contentEl){
  const id=contentEl.dataset.editable; const node=find(state.nodes,id); if(!node||!isTextual(node))return;
  setSelection(id); renderInspector(); renderBreadcrumbs();
  state.inlineEdit={id,before:snapshot(),original:node.content};
  const host=contentEl.closest('[data-id]'); host?.classList.add('inline-editing');
  contentEl.setAttribute('contenteditable','true'); contentEl.focus();
  const range=document.createRange(); range.selectNodeContents(contentEl); range.collapse(false); const sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
}

function finishInlineEdit(cancel=false){
  if(!state.inlineEdit)return;
  const edit=state.inlineEdit; const contentEl=els.canvas.querySelector(`[data-editable="${CSS.escape(edit.id)}"]`);
  if(cancel){ restore(edit.before); }
  else if(contentEl){ directNodeProp('content',contentEl.innerText.replace(/\n+/g,' ').trim()); pushHistory(edit.before); }
  state.inlineEdit=null; markUnsaved(); render();
}

let directEditDrag=null;
function ensureDirectReadout(){
  let node=document.getElementById('direct-edit-readout');
  if(!node){node=document.createElement('div');node.id='direct-edit-readout';node.className='direct-edit-readout';node.hidden=true;document.body.appendChild(node);}return node;
}
function startDirectEdit(event,handle){
  if(!state.directEditEnabled||!state.selectedId)return;
  event.preventDefault();event.stopPropagation();
  const prop=handle.dataset.directProp,axis=handle.dataset.directAxis||'x',sign=Number(handle.dataset.directSign)||1;
  directEditDrag={prop,axis,sign,startX:event.clientX,startY:event.clientY,startValue:Math.max(0,toNumber(effective(selected())[prop],0)),before:snapshot()};
  document.body.classList.add('is-direct-editing');document.body.style.cursor=axis==='x'?'ew-resize':'ns-resize';
}
function moveDirectEdit(event){
  if(!directEditDrag)return;
  const delta=(directEditDrag.axis==='x'?event.clientX-directEditDrag.startX:event.clientY-directEditDrag.startY)/state.zoom;
  const value=Math.max(0,Math.round((directEditDrag.startValue+delta*directEditDrag.sign)/4)*4);
  directStyle(directEditDrag.prop,`${value}px`);
  const readout=ensureDirectReadout();readout.hidden=false;readout.textContent=`${directEditDrag.prop.replace(/([A-Z])/g,' $1')} · ${value}px`;readout.style.left=`${event.clientX+14}px`;readout.style.top=`${event.clientY+14}px`;
  renderCanvas();
}
function endDirectEdit(){
  if(!directEditDrag)return;
  pushHistory(directEditDrag.before);directEditDrag=null;document.body.classList.remove('is-direct-editing');document.body.style.cursor='';
  const readout=ensureDirectReadout();readout.hidden=true;markUnsaved();render();
}
function adjustSelectedStyle(prop,delta,min=0,max=999){
  const node=selected();if(!node)return;const current=toNumber(effective(node)[prop],0);const value=Math.max(min,Math.min(max,current+delta));commit(()=>directStyle(prop,`${value}px`));
}
function startResize(event,handle){
  event.preventDefault(); event.stopPropagation();
  const node=selected(); const host=handle.closest('[data-id]'); if(!node||!host)return;
  const rect=host.getBoundingClientRect();
  state.resizing={mode:handle.dataset.resize,startX:event.clientX,startY:event.clientY,width:rect.width/state.zoom,height:rect.height/state.zoom,before:snapshot()};
  document.body.style.cursor=handle.dataset.resize==='e'?'ew-resize':handle.dataset.resize==='s'?'ns-resize':'nwse-resize';
}

function snapDimension(value,min=8){const raw=Math.max(min,value);return state.snap?Math.round(raw/8)*8:Math.round(raw);}
function resizeMove(event){
  if(!state.resizing)return;
  const r=state.resizing; const dx=(event.clientX-r.startX)/state.zoom; const dy=(event.clientY-r.startY)/state.zoom;
  if(r.mode.includes('e'))directStyle('width',`${snapDimension(r.width+dx,20)}px`);
  if(r.mode.includes('s'))directStyle('height',`${snapDimension(r.height+dy,10)}px`);
  renderCanvas(); markUnsaved();
}

function resizeEnd(){
  if(!state.resizing)return;
  pushHistory(state.resizing.before); state.resizing=null; document.body.style.cursor=''; markUnsaved(); render();
}

function unitValueFromControl(control){
  const wrapper=control.closest('.unit-input'); if(!wrapper)return control.value;
  const input=wrapper.querySelector('[data-unit-number]'); const select=wrapper.querySelector('[data-unit-select]');
  if(select.value==='auto')return 'auto';
  if(input.value==='')return undefined;
  return `${input.value}${select.value}`;
}

function normalizeSpacingValue(raw){
  const value=String(raw??'').trim();
  if(!value||value==='—')return undefined;
  if(/^-?\d*\.?\d+$/.test(value))return `${value}px`;
  return value;
}
function applySpacingValue(group,prop,value){
  spacingLinkedProps(group,prop).forEach(item=>directStyle(item,value));
}
function applyBoxInput(target){
  const prop=target.dataset.boxInput;
  const group=target.dataset.boxGroup;
  const value=normalizeSpacingValue(target.value);
  applySpacingValue(group,prop,value);
  renderCanvas();
  return true;
}

function updateFromInput(target){
  if(target.dataset.boxInput!==undefined)return applyBoxInput(target);
  if(target.dataset.nodeProp!==undefined){ const prop=target.dataset.nodeProp; directNodeProp(prop,target.value); if(prop==='htmlTag'&&selected()?.type==='heading')directNodeProp('tag',target.value); renderCanvas(); renderBreadcrumbs(); if(prop==='htmlTag')renderInspector(); return true; }
  if(target.dataset.styleProp!==undefined){ const prop=target.dataset.styleProp; let value=target.value; if(target.type==='number'||target.type==='range')value=value===''?undefined:Number(value); directStyle(prop,value); if(prop==='display'){state.layoutPanels.flex=String(value).includes('flex');state.layoutPanels.grid=String(value).includes('grid');state.layoutPanels.inline=String(value).startsWith('inline');renderInspector();} renderCanvas(); return true; }
  if(target.dataset.shadowPart!==undefined||target.dataset.shadowColor!==undefined){
    const host=target.closest('.text-shadow-control');
    const x=normalizeLengthValue(host?.querySelector('[data-shadow-part="x"]')?.value);
    const y=normalizeLengthValue(host?.querySelector('[data-shadow-part="y"]')?.value);
    const blur=normalizeLengthValue(host?.querySelector('[data-shadow-part="blur"]')?.value);
    const color=String(host?.querySelector('[data-shadow-part="color"]')?.value||host?.querySelector('[data-shadow-color]')?.value||'').trim();
    const value=(x||y||blur||color)?`${x||'0px'} ${y||'0px'} ${blur||'0px'} ${color||'rgba(0,0,0,0.25)'}`:'';
    directStyle('textShadow',value);
    const colorPicker=host?.querySelector('[data-shadow-color]');
    if(target.dataset.shadowColor!==undefined&&host?.querySelector('[data-shadow-part="color"]'))host.querySelector('[data-shadow-part="color"]').value=target.value;
    if(target.dataset.shadowPart==='color'&&colorPicker&&/^#[0-9a-fA-F]{6}$/.test(target.value.trim()))colorPicker.value=target.value.trim();
    renderCanvas(); return true; }
  if(target.dataset.colorProp){ directStyle(target.dataset.colorProp,target.value); renderCanvas(); return true; }
  if(target.dataset.unitNumber!==undefined||target.dataset.unitSelect!==undefined){ const prop=target.dataset.unitNumber||target.dataset.unitSelect; const value=unitValueFromControl(target); const group=target.dataset.boxGroup||target.closest('.unit-input')?.dataset.boxGroup; if(group)applySpacingValue(group,prop,value); else directStyle(prop,value); renderCanvas(); return true; }
  if(target.dataset.tokenValue){ const [category,key]=target.dataset.tokenValue.split(':'); directToken(category,key,target.value); renderCanvas(); return true; }
  if(target.dataset.tokenColor){ const [category,key]=target.dataset.tokenColor.split(':'); directToken(category,key,target.value); const text=target.closest('.token-card')?.querySelector('[data-token-value]'); if(text)text.value=target.value; renderCanvas(); return true; }
  return false;
}

function applyTokenSelection(select){
  const field=select.closest('[data-token-field]'); if(!field)return;
  const prop=field.dataset.tokenField;
  if(select.value==='__custom'){
    const current=effective(selected())[prop];
    const category=select.dataset.tokenProp;
    const fallback=category==='colors'?(resolveToken(current)||'#ffffff'):(resolveToken(current)||'0px');
    commit(()=>{directStyle(prop,fallback);});
  }else commit(()=>{directStyle(prop,select.value);});
}

async function readFiles(files){
  const valid=[...files].filter(file=>file.type.startsWith('image/')||/\.svg$/i.test(file.name));
  return Promise.all(valid.map(file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>{const src=reader.result;const base={id:uid('asset'),name:file.name,alt:file.name.replace(/\.[^.]+$/,''),src,type:file.type||'image/svg+xml',size:file.size||0,createdAt:Date.now()};if(file.type==='image/svg+xml'||/\.svg$/i.test(file.name)){resolve(base);return;}const image=new Image();image.onload=()=>resolve({...base,width:image.naturalWidth,height:image.naturalHeight});image.onerror=()=>resolve(base);image.src=src;};reader.onerror=reject;reader.readAsDataURL(file);})));
}

async function addAssets(files){
  const assets=await readFiles(files); if(!assets.length)return;
  const current=selected();
  commit(()=>{
    state.assets.push(...assets);
    if(current?.type==='image'){ state.nodes=update(state.nodes,current.id,n=>({...n,src:assets[0].src,alt:assets[0].alt})); }
  });
  state.tab='assets'; render(); toast(`${assets.length} asset${assets.length===1?'':'s'} añadido${assets.length===1?'':'s'}`);
}

function useAsset(id){
  const asset=state.assets.find(item=>item.id===id); if(!asset)return;
  const node=selected();
  if(node?.type==='image')commit(()=>{state.nodes=update(state.nodes,node.id,n=>({...n,src:asset.src,alt:n.alt||asset.alt}));});
  else{ const image=makeNode('image'); image.src=asset.src; image.alt=asset.alt; const placement=insertionForClick(); commit(()=>{state.nodes=insertAt(state.nodes,placement.parentId,placement.index,image);},image.id); }
}
function renameAsset(id){const asset=state.assets.find(item=>item.id===id);if(!asset)return;const value=prompt('Nuevo nombre del asset',asset.name);if(value===null||!value.trim())return;commit(()=>{asset.name=value.trim();});state.tab='assets';renderLeft();}
function deleteAsset(id){const asset=state.assets.find(item=>item.id===id);if(!asset)return;const usage=assetUsageCount(asset);if(!confirm(usage?`Este asset tiene ${usage} uso${usage===1?'':'s'}. ¿Eliminarlo de la biblioteca? Los elementos conservarán la imagen actual.`:'¿Eliminar este asset sin uso?'))return;commit(()=>{state.assets=state.assets.filter(item=>item.id!==id);});state.tab='assets';renderLeft();}
function cleanUnusedAssets(){const unused=(state.assets||[]).filter(asset=>assetUsageCount(asset)===0);if(!unused.length){toast('No hay assets sin uso');return;}if(!confirm(`¿Eliminar los ${unused.length} assets sin uso del proyecto?`))return;const unusedIds=new Set(unused.map(a=>a.id));commit(()=>{state.assets=state.assets.filter(a=>!unusedIds.has(a.id));});state.tab='assets';renderLeft();toast(`${unused.length} assets sin uso eliminados`);}
async function replaceAsset(id,file){const current=state.assets.find(item=>item.id===id);if(!current||!file)return;const [next]=await readFiles([file]);if(!next)return;const oldSrc=current.src;commit(()=>{state.assets=state.assets.map(item=>item.id===id?{...next,id,name:current.name,alt:current.alt}:item);const replaceNodes=nodes=>(nodes||[]).map(node=>({...node,src:node.src===oldSrc?next.src:node.src,children:node.children?replaceNodes(node.children):undefined}));state.nodes=replaceNodes(state.nodes);state.pages=state.pages.map(page=>page.id===state.currentPageId?page:{...page,nodes:replaceNodes(page.nodes||[])});});state.tab='assets';renderLeft();toast('Asset reemplazado en todo el proyecto');}
function setBreakpoint(bp){ viewportEngine?.setBreakpoint(bp); }
function setZoom(next){ viewportEngine?.setZoom(next); }
function fitCanvasToWorkspace(){ viewportEngine?.fitToWorkspace({mode:'screen'}); }
function centerSelectedInCanvas(){ viewportEngine?.centerSelection(); }

function cssRules(s){
  const map={
    'width':cssValue(s.width),'max-width':cssValue(s.maxWidth),'min-width':cssValue(s.minWidth),'height':cssValue(s.height),'max-height':cssValue(s.maxHeight),'min-height':cssValue(s.minHeight),'aspect-ratio':s.aspectRatio,'box-sizing':s.boxSizing,
    'padding-top':cssValue(s.paddingTop),'padding-right':cssValue(s.paddingRight),'padding-bottom':cssValue(s.paddingBottom),'padding-left':cssValue(s.paddingLeft),
    'margin-top':cssValue(s.marginTop),'margin-right':cssValue(s.marginRight),'margin-bottom':cssValue(s.marginBottom),'margin-left':cssValue(s.marginLeft),
    'gap':cssValue(s.gap),'column-gap':cssValue(s.columnGap),'row-gap':cssValue(s.rowGap),'display':s.display,'flex-direction':s.direction,'flex-wrap':s.flexWrap,
    'justify-content':s.justifyContent||s.justify,'align-items':s.alignItems||s.align,'justify-items':s.justifyItems,'align-content':s.alignContent,
    'grid-template-columns':['grid','inline-grid'].includes(s.display)?(s.gridTemplateColumns||((s.gridColumns!==undefined)?(Array.isArray(s.gridColumnTracks)&&s.gridColumnTracks.length?s.gridColumnTracks.join(' '):`repeat(${s.gridColumns||1},${s.gridUseMinMax?'minmax(0,1fr)':'1fr'})`):undefined)):undefined,
    'grid-template-rows':['grid','inline-grid'].includes(s.display)?(s.gridTemplateRows||((Number(s.gridRows)>0)?(Array.isArray(s.gridRowTracks)&&s.gridRowTracks.length?s.gridRowTracks.join(' '):`repeat(${s.gridRows},1fr)`):undefined)):undefined,'grid-template-areas':s.gridTemplateAreas,'grid-area':s.gridArea,'grid-column':s.gridColumn,'grid-row':s.gridRow,'grid-auto-columns':s.gridAutoColumns,'grid-auto-rows':s.gridAutoRows,'grid-auto-flow':s.gridAutoFlow,'order':s.order,'vertical-align':s.verticalAlign,'align-self':s.alignSelf,'justify-self':s.justifySelf,'flex-grow':s.flexGrow,'flex-shrink':s.flexShrink,'flex-basis':cssValue(s.flexBasis),'position':s.position,'z-index':s.zIndex,'left':cssValue(s.left),'top':cssValue(s.top),'right':cssValue(s.right),'bottom':cssValue(s.bottom),'transform':s.transform,'transition':s.transition,'cursor':s.cursor,'pointer-events':s.pointerEvents,
    'background':s.background,'color':s.color,'font-family':s.fontFamily,'font-size':cssValue(s.fontSize),'font-weight':s.fontWeight,'line-height':s.lineHeight,
    'letter-spacing':cssValue(s.letterSpacing),'text-align':s.textAlign,'font-style':s.fontStyle,'text-transform':s.textTransform,'text-decoration':s.textDecoration,
    'text-shadow':s.textShadow,'font-variation-settings':s.fontVariationSettings,'white-space':s.whiteSpace,'text-wrap':s.textWrap,'border-radius':cssValue(s.borderRadius),'border-width':cssValue(s.borderWidth),
    'border-style':s.borderWidth?'solid':undefined,'border-color':s.borderColor,'opacity':s.opacity,'box-shadow':s.boxShadow,'object-fit':s.objectFit,'overflow':s.overflow
  };
  return Object.entries(map).filter(([,v])=>v!==undefined&&v!==''&&v!==null).map(([k,v])=>`  ${k}: ${v};`).join('\n');
}

function className(node){ return bemBaseClass(node); }
function assetPathFor(src){
  const asset=state.assets.find(item=>item.src===src); if(!asset||!String(src).startsWith('data:'))return src;
  const rawType=asset.type?asset.type.split('/')[1]:src.match(/^data:image\/([^;]+)/)?.[1]||'png';
  const extension=rawType.replace('jpeg','jpg').replace('svg+xml','svg');
  return `/assets/${slug(asset.name.replace(/\.[^.]+$/,''))}-${asset.id.slice(-5)}.${extension}`;
}
function assetExportInfo(src){
  const asset=state.assets.find(item=>item.src===src);if(!asset||!String(src).startsWith('data:'))return null;
  const publicPath=assetPathFor(src);const file=publicPath.split('/').pop();return {asset,file,varName:`asset_${slug(asset.id).replace(/-/g,'_')}`};
}
function componentMasterAcrossPages(ref){
  syncCurrentPageRecord();let found=null;(function walk(nodes){for(const node of nodes||[]){if(node.componentRef===ref&&node.componentSource==='master'&&node.componentRoot){found=node;return;}walk(node.children||[]);if(found)return;}})(state.pages.flatMap(page=>page.nodes||[]));return found;
}
function componentExportName(component,index=0){const clean=(component?.name||`Component ${index+1}`).replace(/[^A-Za-z0-9 ]/g,' ').split(/\s+/).filter(Boolean).map(word=>word[0]?.toUpperCase()+word.slice(1)).join('');return clean||`OrbitComponent${index+1}`;}
function componentNameMap(){const used=new Set();const map=new Map();state.components.forEach((item,index)=>{let name=componentExportName(item,index),i=2;while(used.has(name))name=`${componentExportName(item,index)}${i++}`;used.add(name);map.set(item.id,name);});return map;}
function nodeAssets(nodes){const result=[];(function walk(list){(list||[]).forEach(node=>{if(node.type==='image'){const info=assetExportInfo(node.src);if(info&&!result.some(item=>item.file===info.file))result.push(info);}walk(node.children||[]);});})(nodes);return result;}
function nodeComponentRefs(nodes){const refs=new Set();(function walk(list){(list||[]).forEach(node=>{if(node.componentRoot&&node.componentRef)refs.add(node.componentRef);walk(node.children||[]);});})(nodes);return [...refs];}
function componentPropCodeMap(component){
  const map=new Map(),used=new Set();
  (component?.props||[]).forEach((prop,index)=>{
    const words=slug(prop.name||`prop-${index+1}`).split('-').filter(Boolean);
    let name=words.map((word,i)=>i?word[0].toUpperCase()+word.slice(1):word).join('')||`prop${index+1}`;
    if(/^\d/.test(name))name=`prop${name}`;
    if(['class','default','interface','const','let','var','new','function'].includes(name))name=`${name}Value`;
    let unique=name,i=2;while(used.has(unique))unique=`${name}${i++}`;used.add(unique);map.set(prop.id,unique);
  });
  return map;
}
function componentBinding(ctx,node,property){
  return ctx.componentBindings?.get(`${node.componentPath}|${property}`)||'';
}
function componentCanExportAsTag(node,component){
  if((node.componentVariantId||'')!=='')return false;
  const props=component?.props||[];
  return componentOverrideEntries(node).every(entry=>entry.kind==='prop'&&props.some(prop=>prop.path===entry.path&&prop.property===entry.property));
}
function componentTagProps(node,component){
  const names=componentPropCodeMap(component);
  return (component.props||[]).map(prop=>{
    const target=componentNodeByPath(node,prop.path);const value=target?.[prop.property]??prop.defaultValue??'';
    return `${names.get(prop.id)}={${JSON.stringify(value)}}`;
  }).join(' ');
}
function exportTextValue(node,property,ctx){
  const binding=componentBinding(ctx,node,property);
  return binding?`{${binding}}`:escapeHtml(node[property]??'').replace(/\n/g,'<br />');
}
function exportAttrValue(node,property,fallback,ctx){
  const binding=componentBinding(ctx,node,property);
  return binding?`{${binding}}`:`"${escapeHtml(node[property]??fallback)}"`;
}
function exportNode(node,depth=2,ctx={}){
  const pad='  '.repeat(depth),tag=semanticTag(node),cls=classAttribute(node),componentNames=ctx.componentNames||new Map();const orbitId=ctx.previewAssets?` data-orbit-id="${escapeHtml(node.id)}"`:'';
  if(ctx.useComponents&&!ctx.insideComponent&&node.componentRoot&&node.componentRef&&componentNames.has(node.componentRef)){
    const component=state.components.find(item=>item.id===node.componentRef);
    if(component&&componentCanExportAsTag(node,component)){const props=componentTagProps(node,component);return `${pad}<${componentNames.get(node.componentRef)}${props?` ${props}`:''} />`;}
  }
  const children=(node.children||[]).map(child=>exportNode(child,depth+1,ctx)).join('\n');
  const aria=node.ariaLabel?` aria-label="${escapeHtml(node.ariaLabel)}"`:'';
  if(['section','container','grid','block','div','card','gallery','form','list','statCard','testimonial','pricingCard','faqItem'].includes(node.type))return `${pad}<${tag} class="${cls}"${orbitId}${aria}>${children?`\n${children}\n${pad}`:''}</${tag}>`;
  if(node.type==='heading'||['text','richtext','badge','quote'].includes(node.type))return `${pad}<${tag} class="${cls}"${orbitId}${aria}>${exportTextValue(node,'content',ctx)}</${tag}>`;
  if(node.type==='link')return `${pad}<a class="${cls}"${orbitId} href=${exportAttrValue(node,'href','#',ctx)}${aria}>${exportTextValue(node,'content',ctx)}</a>`;
  if(node.type==='icon')return `${pad}<${tag} class="${cls}"${orbitId}${aria}>${exportTextValue(node,'content',ctx)}</${tag}>`;
  if(node.type==='svg')return `${pad}<${tag} class="${cls}"${orbitId}${aria}>${sanitizeSvgMarkup(node.svgCode||'')||escapeHtml(node.content||'SVG')}</${tag}>`;
  if(node.type==='button'){
    if(tag==='button')return `${pad}<button class="${cls}"${orbitId} type="button"${aria}>${exportTextValue(node,'content',ctx)}</button>`;
    return `${pad}<a class="${cls}"${orbitId} href=${exportAttrValue(node,'href','#',ctx)}${aria}>${exportTextValue(node,'content',ctx)}</a>`;
  }
  if(node.type==='image'){
    const srcBinding=componentBinding(ctx,node,'src'),altBinding=componentBinding(ctx,node,'alt');
    const info=srcBinding?null:assetExportInfo(node.src);
    let img='';
    if(ctx.optimizedImages&&info)img=`<Image class="${cls}${tag==='figure'?'__image':''}"${orbitId} src={${info.varName}} alt=${altBinding?`{${altBinding}}`:`"${escapeHtml(node.alt||'')}"`} widths={[480, 768, 1200, 1600]} sizes="(max-width: 768px) 100vw, 50vw" formats={['avif','webp']} />`;
    else{const source=ctx.previewAssets?node.src:assetPathFor(node.src);img=`<img class="${cls}${tag==='figure'?'__image':''}"${orbitId} src=${srcBinding?`{${srcBinding}}`:`"${escapeHtml(source)}"`} alt=${altBinding?`{${altBinding}}`:`"${escapeHtml(node.alt||'')}"`} loading="lazy" decoding="async" />`;}
    if(tag==='figure')return `${pad}<figure class="${cls}"${orbitId}${aria}>\n${pad}  ${img}${node.caption?`\n${pad}  <figcaption class="${cls}__caption">${escapeHtml(node.caption)}</figcaption>`:''}\n${pad}</figure>`;
    return `${pad}${img}`;
  }
  if(node.type==='video')return `${pad}<div class="${cls}"${orbitId}${aria}>\n${pad}  <iframe src="${escapeHtml(node.src||'')}" title="${escapeHtml(node.title||'Video embed')}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>\n${pad}</div>`;
  if(node.type==='input')return `${pad}<input class="${cls}"${orbitId} type="${escapeHtml(node.inputType||'text')}" placeholder=${exportAttrValue(node,'placeholder','',ctx)}${aria} />`;
  if(node.type==='textareaField')return `${pad}<textarea class="${cls}"${orbitId} rows="${Number(node.rows||5)}" placeholder=${exportAttrValue(node,'placeholder','',ctx)}${aria}></textarea>`;
  if(node.type==='selectField'){
    const binding=componentBinding(ctx,node,'content');
    if(binding)return `${pad}<select class="${cls}"${orbitId}${aria}>{String(${binding}).split('\\n').filter(Boolean).map((option) => <option>{option}</option>)}</select>`;
    const options=String(node.content||'').split('\n').filter(Boolean).map(option=>`${pad}  <option>${escapeHtml(option)}</option>`).join('\n');return `${pad}<select class="${cls}"${orbitId}${aria}>\n${options}\n${pad}</select>`;
  }
  if(node.type==='divider'&&tag==='hr')return `${pad}<hr class="${cls}"${aria} />`;
  return `${pad}<${tag} class="${cls}"${orbitId}${aria} aria-hidden="true"></${tag}>`;
}
function allProjectNodes(){syncCurrentPageRecord();return state.pages.flatMap(page=>page.nodes||[]);}
function flattenNodes(nodes){const flat=[];(function walk(list){(list||[]).forEach(node=>{flat.push(node);walk(node.children||[]);});})(nodes);return flat;}
function generatedTokensCss(){
  const variables=Object.entries(state.tokens).flatMap(([category,items])=>Object.entries(items).map(([key,item])=>`  ${varName(category,key)}: ${item.value};`)).join('\n');
  const mediaBlocks=['tablet','mobileL','mobile'].map(bp=>{
    const bpVars=Object.entries(state.tokens).flatMap(([category,items])=>Object.entries(items).map(([key,item])=>{
      const val=item.responsiveValues?.[bp];return val?`  ${varName(category,key)}: ${val};`:'';
    }).filter(Boolean)).join('\n');
    return bpVars&&state.breakpoints?.[bp]?`@media (max-width: ${state.breakpoints[bp]}px) {\n  :root {\n${bpVars}\n  }\n}`:'';
  }).filter(Boolean).join('\n\n');
  return `:root {\n${variables}\n}${mediaBlocks?`\n\n${mediaBlocks}`:''}\n`;
}
function responsiveCascadeKeys(bp){
  return ({
    desktopXL:['desktopXL'],
    desktop:[],
    tablet:['tablet'],
    mobileL:['tablet','mobileL'],
    mobile:['tablet','mobileL','mobile']
  }[bp]||[]).filter(breakpointIsEnabled);
}
function mergedResponsiveStyle(styleGroups={},bp='desktop'){
  let result={...(styleGroups.base||{}),...(styleGroups.desktop||{})};
  responsiveCascadeKeys(bp).forEach(key=>{result={...result,...(styleGroups[key]||{})};});
  return result;
}
function hasResponsiveOverride(styleGroups={},bp){
  return !!styleGroups?.[bp]&&Object.keys(styleGroups[bp]).length>0;
}
function responsiveMediaBlocks(blocksByBreakpoint){
  const desktopXL=breakpointIsEnabled('desktopXL')?(blocksByBreakpoint.desktopXL||''):'';
  const tablet=blocksByBreakpoint.tablet||'';
  const mobileL=breakpointIsEnabled('mobileL')?(blocksByBreakpoint.mobileL||''):'';
  const mobile=blocksByBreakpoint.mobile||'';
  return `${desktopXL?`\n\n@media (min-width: ${state.breakpoints.desktopXL}px) {\n${desktopXL}\n}`:''}${tablet?`\n\n@media (max-width: ${state.breakpoints.tablet}px) {\n${tablet}\n}`:''}${mobileL?`\n\n@media (max-width: ${state.breakpoints.mobileL}px) {\n${mobileL}\n}`:''}${mobile?`\n\n@media (max-width: ${state.breakpoints.mobile}px) {\n${mobile}\n}`:''}`;
}
function generatedGlobalClassesCss(){
  const classes=state.globalClasses||[];
  const baseAndStates=classes.map(item=>{
    const baseStyle=mergedResponsiveStyle(item.styles||{},'desktop');
    const base=`.${sanitizeClass(item.name)} {\n${cssRules(baseStyle)}\n}`;
    const states=[['hover',':hover'],['focus',':focus-visible'],['active',':active'],['disabled','[disabled]']].map(([key,pseudo])=>item.states?.[key]&&Object.keys(item.states[key]).length?`.${sanitizeClass(item.name)}${pseudo} {\n${cssRules(item.states[key])}\n}`:'').filter(Boolean).join('\n\n');
    return [base,states].filter(Boolean).join('\n\n');
  }).join('\n\n');
  const blocks={};
  ['desktopXL','tablet','mobileL','mobile'].forEach(bp=>{
    blocks[bp]=classes.filter(item=>hasResponsiveOverride(item.styles||{},bp)).map(item=>`.${sanitizeClass(item.name)} {\n${cssRules(mergedResponsiveStyle(item.styles||{},bp))}\n}`).join('\n\n');
  });
  return `${baseAndStates}${responsiveMediaBlocks(blocks)}\n`;
}
function generatedElementsCss(){
  const flat=flattenNodes(allProjectNodes());const unique=new Map();flat.forEach(node=>unique.set(className(node),node));const nodes=[...unique.values()];
  const customRules=n=>String(n.customCss||'').trim().split(';').map(line=>line.trim()).filter(Boolean).map(line=>`  ${line};`).join('\n');
  const base=nodes.map(n=>`.${className(n)} {\n${[cssRules(mergedResponsiveStyle(n.styles||{},'desktop')),customRules(n)].filter(Boolean).join('\n')}\n}`).join('\n\n');
  const stateRules=nodes.flatMap(n=>[['hover',':hover'],['focus',':focus-visible'],['active',':active'],['disabled','[disabled]']].map(([key,pseudo])=>n.states?.[key]&&Object.keys(n.states[key]).length?`.${className(n)}${pseudo} {\n${cssRules(n.states[key])}\n}`:'').filter(Boolean)).join('\n\n');
  const blocks={};
  ['desktopXL','tablet','mobileL','mobile'].forEach(bp=>{
    blocks[bp]=nodes.filter(n=>hasResponsiveOverride(n.styles||{},bp)).map(n=>`.${className(n)} {\n${cssRules(mergedResponsiveStyle(n.styles||{},bp))}\n}`).join('\n\n');
  });
  return `${base}${stateRules?`\n\n${stateRules}`:''}${responsiveMediaBlocks(blocks)}\n`;
}
function generatedStyles(){
  return `@import './tokens.css';\n@import './classes.css';\n@import './elements.css';\n\n* { box-sizing: border-box; }\nhtml { width: 100%; scroll-behavior: smooth; }\nhtml, body { margin: 0; min-height: 100%; }\nbody { width: 100%; overflow-x: clip; font-family: Geist, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--color-text); background: var(--color-surface); }\ncode, pre, input, select, textarea { font-family: "Geist Mono", ui-monospace, SFMono-Regular, Consolas, monospace; }\nimg, picture, video, iframe, svg { display: block; max-width: 100%; }\nimg, video, iframe { height: auto; }\na, button { text-decoration: none; }\nbutton { font: inherit; }\nh1,h2,h3,h4,h5,h6,p,figure { margin: 0; }\n`;
}
function pageFilePath(page){const route=pageRouteLabel(page);if(route==='/')return 'src/pages/index.astro';const clean=route.replace(/^\/+|\/+$/g,'');return `src/pages/${clean}.astro`;}
function generatedLayout(){
  return `---\nimport '../styles/global.css';\ninterface Props { title: string; description?: string; language?: string; ogImage?: string; canonicalUrl?: string; noIndex?: boolean; }\nconst { title, description = '', language = 'es', ogImage = '', canonicalUrl = '', noIndex = false } = Astro.props;\nconst schemaData = JSON.stringify({ "@context": "https://schema.org", "@type": "WebPage", "name": title, "description": description });\n---\n<!doctype html>\n<html lang={language}>\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width" />\n    <meta name="description" content={description} />${googleFontsHeadMarkup()}\n    {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}\n    {noIndex && <meta name="robots" content="noindex,nofollow" />}\n    <meta property="og:title" content={title} />\n    <meta property="og:description" content={description} />\n    <meta property="og:type" content="website" />\n    {ogImage && <meta property="og:image" content={ogImage} />}\n    <meta name="twitter:card" content="summary_large_image" />\n    <meta name="twitter:title" content={title} />\n    <meta name="twitter:description" content={description} />\n    {ogImage && <meta name="twitter:image" content={ogImage} />}\n    <script type="application/ld+json" set:html={schemaData} />\n    <title>{title}</title>\n  </head>\n  <body>\n    <slot />\n  </body>\n</html>\n`;
}
function safeInlineScript(value=''){
  return String(value).replace(new RegExp('<'+'/script','gi'),'<\\/script');
}
function inlineScriptMarkup(value='',attributes=''){
  const source=String(value||'').trim();
  return source?`\n  <script${attributes}>\n${safeInlineScript(source)}\n  `+'<'+'/script>':'';
}
function generatedPageAstro(page,componentNames){
  const nodes=page.nodes||[];const meta=page.meta||{};const refs=nodeComponentRefs(nodes).filter(ref=>componentNames.has(ref));const assets=nodeAssets(nodes);const imports=[`import BaseLayout from '../layouts/BaseLayout.astro';`];
  refs.forEach(ref=>imports.push(`import ${componentNames.get(ref)} from '../components/${componentNames.get(ref)}.astro';`));
  if(assets.length){imports.push(`import { Image } from 'astro:assets';`);assets.forEach(info=>imports.push(`import ${info.varName} from '../assets/${info.file}';`));}
  const body=nodes.map(node=>exportNode(node,1,{useComponents:true,componentNames,optimizedImages:true})).join('\n');
  const customScript=inlineScriptMarkup(page.customJs||'',' is:inline');
  return `---\n${imports.join('\n')}\n---\n<BaseLayout title=${JSON.stringify(meta.title||page.name)} description=${JSON.stringify(meta.description||'')} language=${JSON.stringify(meta.language||'es')} ogImage=${JSON.stringify(meta.ogImage||'')} canonicalUrl=${JSON.stringify(meta.canonicalUrl||'')} noIndex={${!!meta.noIndex}}>\n${body}${customScript}\n</BaseLayout>\n`;
}
function generatedComponentAstro(component,componentNames){
  const master=componentMasterAcrossPages(component.id);if(!master)return null;
  const assets=nodeAssets([master]);const imports=[];if(assets.length){imports.push(`import { Image } from 'astro:assets';`);assets.forEach(info=>imports.push(`import ${info.varName} from '../assets/${info.file}';`));}
  const propNames=componentPropCodeMap(component);const props=component.props||[];
  const bindings=new Map(props.map(prop=>[`${prop.path}|${prop.property}`,propNames.get(prop.id)]));
  const interfaceLines=props.map(prop=>`  ${propNames.get(prop.id)}?: string;`);
  const destructure=props.map(prop=>`${propNames.get(prop.id)} = ${JSON.stringify(prop.defaultValue??'')}`).join(', ');
  const frontLines=[...imports];
  if(props.length){frontLines.push(`interface Props {\n${interfaceLines.join('\n')}\n}`);frontLines.push(`const { ${destructure} } = Astro.props;`);}
  const front=frontLines.length?`---\n${frontLines.join('\n')}\n---\n`:'';
  return `${front}${exportNode(master,0,{insideComponent:true,useComponents:false,componentNames,optimizedImages:true,componentBindings:bindings})}\n`;
}
function generatedAstro(options={}){
  const meta=state.pageMeta||{};const body=state.nodes.map(n=>exportNode(n,2,{optimizedImages:false,previewAssets:!!options.previewAssets})).join('\n');
  const customScript=options.includeCustomJs===false?'':inlineScriptMarkup(currentPage()?.customJs||'');
  return `<!doctype html>\n<html lang="${escapeHtml(meta.language||'es')}">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width" />\n    <meta name="description" content="${escapeHtml(meta.description||'Sitio creado con Orbit')}" />${googleFontsHeadMarkup()}\n    <title>${escapeHtml(meta.title||state.projectName)}</title>\n  </head>\n  <body>\n${body}${customScript}\n  </body>\n</html>\n`;
}
function dataUrlBytes(dataUrl){ const [header,data]=dataUrl.split(','); if(header.includes(';base64')){ const raw=atob(data); return Uint8Array.from(raw,c=>c.charCodeAt(0)); } return new TextEncoder().encode(decodeURIComponent(data)); }
function projectFiles(){
  syncCurrentPageRecord();const componentNames=componentNameMap();const files=[
    {name:'package.json',data:JSON.stringify({name:slug(state.projectName),version:'0.1.0',private:true,type:'module',scripts:{dev:'astro dev',build:'astro build',preview:'astro preview'},dependencies:{astro:'^7.1.6'}},null,2)},
    {name:'astro.config.mjs',data:"import { defineConfig } from 'astro/config';\nexport default defineConfig({});\n"},
    {name:'src/layouts/BaseLayout.astro',data:generatedLayout()},
    {name:'src/styles/tokens.css',data:generatedTokensCss()},
    {name:'src/styles/classes.css',data:generatedGlobalClassesCss()},
    {name:'src/styles/elements.css',data:generatedElementsCss()},
    {name:'src/styles/global.css',data:generatedStyles()},
    {name:'README.md',data:`# ${state.projectName}\n\nProyecto multipágina generado con Orbit Design Studio v0.13 Pro.\n\n## Ejecutar\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n`},
    {name:'orbit/project.orbit.json',data:JSON.stringify({version:12,projectName:state.projectName,pages:state.pages,tokens:state.tokens,globalClasses:state.globalClasses,components:state.components,assets:state.assets,breakpoints:state.breakpoints,breakpointEnabled:state.breakpointEnabled,canvasWidths:state.canvasWidths},null,2)}
  ];
  state.pages.forEach(page=>files.push({name:pageFilePath(page),data:generatedPageAstro(page,componentNames)}));
  state.components.forEach(component=>{const data=generatedComponentAstro(component,componentNames);if(data)files.push({name:`src/components/${componentNames.get(component.id)}.astro`,data});});
  state.assets.filter(asset=>String(asset.src).startsWith('data:')).forEach(asset=>{const info=assetExportInfo(asset.src);files.push({name:`src/assets/${info.file}`,data:dataUrlBytes(asset.src)});});
  return files;
}

const crcTable=(()=>{ const table=new Uint32Array(256); for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1; table[n]=c>>>0; } return table; })();
function crc32(bytes){ let crc=0xffffffff; for(const byte of bytes)crc=crcTable[(crc^byte)&0xff]^(crc>>>8); return (crc^0xffffffff)>>>0; }
function u16(n){ return Uint8Array.of(n&255,(n>>>8)&255); }
function u32(n){ return Uint8Array.of(n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255); }
function concatBytes(parts){ const length=parts.reduce((sum,p)=>sum+p.length,0); const out=new Uint8Array(length); let offset=0; for(const part of parts){out.set(part,offset);offset+=part.length;} return out; }
function makeZip(files){
  const encoder=new TextEncoder(),locals=[],centrals=[]; let offset=0;
  for(const file of files){
    const name=encoder.encode(file.name); const data=file.data instanceof Uint8Array?file.data:encoder.encode(file.data); const crc=crc32(data);
    const local=concatBytes([u32(0x04034b50),u16(20),u16(0x0800),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name,data]);
    locals.push(local);
    const central=concatBytes([u32(0x02014b50),u16(20),u16(20),u16(0x0800),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name]);
    centrals.push(central); offset+=local.length;
  }
  const centralData=concatBytes(centrals); const localData=concatBytes(locals);
  const end=concatBytes([u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),u32(centralData.length),u32(localData.length),u16(0)]);
  return new Blob([localData,centralData,end],{type:'application/zip'});
}

function downloadBlob(name,blob){ const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1200); }
function downloadText(name,content,type='text/plain'){ downloadBlob(name,new Blob([content],{type})); }
function exportProject(force=false){
  const report=responsiveAudit();
  if(!force&&report.errors.length){
    openModal('Responsive QA antes de exportar','ORBIT EXPORT QA',`<div class="export-responsive-qa"><div class="export-qa-status"><span>!</span><div><strong>${report.errors.length} errores responsive</strong><p>Orbit encontró problemas que pueden afectar Mobile o Tablet. Puedes corregirlos o continuar bajo tu responsabilidad.</p></div></div><div class="export-qa-breakpoints"><span>Desktop <b>✓</b></span><span>Tablet <b>${report.issues.some(item=>item.id.includes('tablet'))?'!':'✓'}</b></span><span>Mobile <b>${report.errors.length?'×':'✓'}</b></span></div><div class="export-qa-actions"><button type="button" class="secondary-action" data-open-responsive-audit>Revisar responsive</button><button type="button" class="primary-action" data-export-anyway>Exportar de todas formas</button></div></div>`,'export-qa-modal');return;
  }
  downloadBlob(`${slug(state.projectName)}-astro.zip`,makeZip(projectFiles()));toast(`${state.pages.length} páginas exportadas a Astro`);
}
function responsiveSiteHtml(){
  const previewCss=[generatedTokensCss(),generatedStyles().replace(/^@import[^;]+;\s*/gm,''),generatedGlobalClassesCss(),generatedElementsCss()].join('\n');
  const selection=state.responsiveCompareSelected&&state.selectedId?`[data-orbit-id=\"${CSS.escape(state.selectedId)}\"]{outline:3px solid #ef5a24!important;outline-offset:3px!important}`:'';return generatedAstro({previewAssets:true}).replace('</head>',`<style>${previewCss}${selection}</style></head>`);
}
let codeStudioDirty=false;
let codeStudioTab='html';
let codeStudioOriginal={html:'',css:'',js:'',react:''};
let codeStudioPreviewTimer=0;
function mapStylesToTailwind(styles={}){
  const classes=[];
  if(styles.display==='flex')classes.push('flex');
  if(styles.display==='grid')classes.push('grid');
  if(styles.direction==='column')classes.push('flex-col');
  if(styles.direction==='row')classes.push('flex-row');
  if(styles.alignItems==='center')classes.push('items-center');
  if(styles.justifyContent==='center')classes.push('justify-center');
  if(styles.justifyContent==='space-between')classes.push('justify-between');
  if(styles.width==='100%')classes.push('w-full');
  if(styles.height==='100%')classes.push('h-full');
  if(styles.borderRadius)classes.push('rounded-xl');
  if(styles.boxShadow)classes.push('shadow-lg');
  return classes.join(' ');
}
function exportNodeReactTailwind(node,indentLevel=1){
  const pad=' '.repeat(indentLevel*2);
  const tag=node.htmlTag||(node.type==='heading'?'h2':node.type==='button'?'button':node.type==='image'?'img':'div');
  const tailwindClasses=mapStylesToTailwind(node.styles?.base||{});
  const classAttr=tailwindClasses?` className="${tailwindClasses}"`:'';
  if(node.type==='image')return `${pad}<img src="${escapeHtml(node.src||'')}" alt="${escapeHtml(node.alt||'')}"${classAttr} />`;
  const children=(node.children||[]).map(child=>exportNodeReactTailwind(child,indentLevel+1)).join('\n');
  const content=node.content?`${pad}  ${escapeHtml(node.content)}`:'';
  const inner=[content,children].filter(Boolean).join('\n');
  if(!inner)return `${pad}<${tag}${classAttr} />`;
  return `${pad}<${tag}${classAttr}>\n${inner}\n${pad}</${tag}>`;
}
function generatedReactTailwind(page=currentPage()){
  const name=slug(page?.name||'Page').replace(/(^|-)([a-z])/g,(_,a,b)=>b.toUpperCase());
  const body=((page?.nodes||state.nodes||[]).map(n=>exportNodeReactTailwind(n,2))).join('\n');
  return `import React from 'react';\n\nexport default function ${name}() {\n  return (\n    <main className="w-full min-h-screen bg-slate-950 text-slate-100 font-sans p-6">\n${body}\n    </main>\n  );\n}\n`;
}
function codeStudioCss(){
  return [generatedTokensCss(),generatedStyles().replace(/^@import[^;]+;\s*/gm,''),generatedGlobalClassesCss(),generatedElementsCss()].join('\n\n');
}
function codeStudioValues(){
  return {html:$('#code-editor-html')?.value||'',css:$('#code-editor-css')?.value||'',js:$('#code-editor-js')?.value||'',react:$('#code-editor-react')?.value||''};
}
function setCodeStudioDirty(value){
  codeStudioDirty=!!value;
  const status=$('#code-studio-status');
  if(status)status.textContent=codeStudioDirty?'Cambios sin aplicar':'Sin cambios';
}
function selectCodeStudioTab(tab='html'){
  codeStudioTab=['html','css','js','react'].includes(tab)?tab:'html';
  document.querySelectorAll('[data-code-tab]').forEach(button=>{const active=button.dataset.codeTab===codeStudioTab;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;});
  document.querySelectorAll('[data-code-panel]').forEach(panel=>{panel.hidden=panel.dataset.codePanel!==codeStudioTab;});
  document.querySelector(`[data-code-panel="${codeStudioTab}"] textarea`)?.focus();
}
function composeCodeStudioPreview({html,css,js}){
  const safeCss=String(css||'').replace(new RegExp('<'+'/style','gi'),'<\\/style');
  const styleMarkup=`<style>\n${safeCss}\n`+'<'+'/style>';
  const scriptMarkup=inlineScriptMarkup(js||'');
  let documentHtml=String(html||'').trim()||'<!doctype html><html><head></head><body></body></html>';
  documentHtml=documentHtml.includes('</head>')?documentHtml.replace('</head>',`${styleMarkup}</head>`):`${styleMarkup}${documentHtml}`;
  return documentHtml.includes('</body>')?documentHtml.replace('</body>',`${scriptMarkup}</body>`):`${documentHtml}${scriptMarkup}`;
}
function renderCodeStudioPreview(){
  const frame=$('#code-studio-frame');if(frame)frame.srcdoc=composeCodeStudioPreview(codeStudioValues());
}
function openCodeStudio(){
  const studio=$('#code-studio');if(!studio)return;
  if(!studio.hidden){studio.focus();return;}
  syncCurrentPageRecord();
  codeStudioOriginal={html:generatedAstro({previewAssets:true,includeCustomJs:false}),css:codeStudioCss(),js:String(currentPage()?.customJs||''),react:generatedReactTailwind()};
  if($('#code-editor-html'))$('#code-editor-html').value=codeStudioOriginal.html;
  if($('#code-editor-css'))$('#code-editor-css').value=codeStudioOriginal.css;
  if($('#code-editor-js'))$('#code-editor-js').value=codeStudioOriginal.js;
  if($('#code-editor-react'))$('#code-editor-react').value=codeStudioOriginal.react;
  const pageLabel=$('#code-studio-page');if(pageLabel)pageLabel.textContent=currentPage()?.name||'Página activa';
  studio.hidden=false;setCodeStudioDirty(false);selectCodeStudioTab('html');renderCodeStudioPreview();
}
function closeCodeStudio(force=false){
  const studio=$('#code-studio');if(!studio||studio.hidden)return true;
  if(codeStudioDirty&&!force&&!confirm('Hay cambios de código sin aplicar. ¿Cerrar de todas formas?'))return false;
  studio.hidden=true;clearTimeout(codeStudioPreviewTimer);setCodeStudioDirty(false);$('#code-studio-trigger')?.focus();return true;
}
function resetCodeStudio(){
  if($('#code-editor-html'))$('#code-editor-html').value=codeStudioOriginal.html;
  if($('#code-editor-css'))$('#code-editor-css').value=codeStudioOriginal.css;
  if($('#code-editor-js'))$('#code-editor-js').value=codeStudioOriginal.js;
  if($('#code-editor-react'))$('#code-editor-react').value=codeStudioOriginal.react;
  setCodeStudioDirty(false);renderCodeStudioPreview();
}
function formatCodeStudio(){
  const editor=document.querySelector(`[data-code-panel="${codeStudioTab}"] textarea`);if(!editor)return;
  editor.value=editor.value.split('\n').map(line=>line.replace(/\s+$/,'')).join('\n').trim()+'\n';setCodeStudioDirty(true);renderCodeStudioPreview();toast(`${codeStudioTab.toUpperCase()} ordenado`);
}
function applyCodeStudio(){
  const values=codeStudioValues();
  try{
    new Function(values.js);
    const parsed=new DOMParser().parseFromString(values.html,'text/html');
    if(!parsed.body||!parsed.body.children.length)throw new Error('El HTML necesita contenido dentro de body.');
    const before=snapshot();const count=importHtmlCss(values.html,values.css,'replace');
    if(!count)throw new Error('No se encontraron elementos HTML editables.');
    syncCurrentPageRecord();
    state.pages=state.pages.map(page=>page.id===state.currentPageId?{...page,customJs:values.js}:page);
    pushHistory(before);markUnsaved();render();codeStudioOriginal={...values};setCodeStudioDirty(false);renderCodeStudioPreview();toast(`Code Studio aplicado · ${count} elementos`);
  }catch(error){toast(`No se pudo aplicar: ${error.message}`,'error',4200);}
}
function setResponsiveSuiteOpen(open){
  const trigger=$('#responsive-suite-trigger'),menu=$('#responsive-suite-menu');if(!trigger||!menu)return;
  menu.hidden=!open;trigger.setAttribute('aria-expanded',String(!!open));
}
function setZoomMenuOpen(open){
  const trigger=$('#zoom-menu-trigger'),menu=$('#zoom-menu');if(!trigger||!menu)return;
  menu.hidden=!open;trigger.setAttribute('aria-expanded',String(!!open));
  if(open)document.querySelectorAll('[data-zoom-preset]').forEach(button=>button.classList.toggle('is-active',Math.abs(Number(button.dataset.zoomPreset)-state.zoom)<.01));
}
function syncGuidesMenu(){
  const pairs=[['toggle-guides',state.rulers],['toggle-guide-visibility',state.guidesVisible],['toggle-snap',state.snap],['lock-guides',state.guidesLocked]];
  pairs.forEach(([id,on])=>{const button=$(`#${id}`);if(!button)return;button.classList.toggle('active',!!on);button.setAttribute('aria-pressed',String(!!on));button.setAttribute('aria-checked',String(!!on));});
  const clear=$('#clear-guides');if(clear)clear.disabled=!(state.customGuides||[]).length;
}
function setGuidesMenuOpen(open){
  const trigger=$('#guides-menu-trigger'),menu=$('#guides-menu');if(!trigger||!menu)return;
  menu.hidden=!open;trigger.setAttribute('aria-expanded',String(!!open));
  if(open){syncGuidesMenu();setZoomMenuOpen(false);setResponsiveSuiteOpen(false);}
}
function compareTargetHeight(){const profile=state.interfaceProfile||getInterfaceProfile();return Math.max(760,Math.min(profile==='cinema'?1280:profile==='ultrawide'?1120:960,window.innerHeight-245));}
function fitResponsiveCompareFrame(bp){
  const width=state.canvasWidths[bp]||({desktop:1200,tablet:834,mobile:390}[bp]);const card=document.querySelector(`[data-compare-card="${bp}"]`);const stage=card?.querySelector('.responsive-device-stage');const wrap=card?.querySelector('.responsive-frame-wrap');const frame=card?.querySelector('iframe');if(!stage||!wrap||!frame)return;
  const targetHeight=compareTargetHeight();const auto=Math.max(.18,Math.min(1,(Math.max(160,stage.clientWidth-24))/width,(Math.max(360,stage.clientHeight-24))/targetHeight));const manual=state.responsiveCompareZoom?.[bp]||1;const scale=Math.max(.15,Math.min(1.4,auto*manual));frame.style.width=`${width}px`;frame.style.height=`${targetHeight}px`;frame.style.transform=`scale(${scale})`;wrap.style.width=`${Math.round(width*scale)}px`;wrap.style.height=`${Math.round(targetHeight*scale)}px`;wrap.dataset.scale=`${Math.round(scale*100)}%`;const label=card.querySelector('[data-compare-scale]');if(label)label.textContent=`${Math.round(scale*100)}%`;
}
function fitResponsiveCompareFrames(){CORE_BREAKPOINTS.forEach(fitResponsiveCompareFrame);}
function bindCompareScrollSync(){
  document.querySelectorAll('.responsive-device-stage').forEach(stage=>{stage.onscroll=()=>{if(!state.responsiveCompareSync||stage.dataset.syncing==='true')return;const maxX=Math.max(1,stage.scrollWidth-stage.clientWidth),maxY=Math.max(1,stage.scrollHeight-stage.clientHeight);const rx=stage.scrollLeft/maxX,ry=stage.scrollTop/maxY;document.querySelectorAll('.responsive-device-stage').forEach(other=>{if(other===stage)return;other.dataset.syncing='true';other.scrollLeft=rx*Math.max(0,other.scrollWidth-other.clientWidth);other.scrollTop=ry*Math.max(0,other.scrollHeight-other.clientHeight);requestAnimationFrame(()=>delete other.dataset.syncing);});};});
}
function renderResponsiveCompare(){
  if(!els.responsiveCompare||els.responsiveCompare.hidden)return;const html=responsiveSiteHtml();const widths={desktop:state.canvasWidths.desktop||1200,tablet:state.canvasWidths.tablet||834,mobile:state.canvasWidths.mobile||390};
  Object.entries(widths).forEach(([bp,width])=>{const frame=document.getElementById(`compare-${bp}-frame`);const label=document.getElementById(`compare-${bp}-width`);if(label)label.textContent=`${width} px`;if(frame)frame.srcdoc=html;});
  const sync=document.getElementById('responsive-compare-sync');if(sync){sync.classList.toggle('active',state.responsiveCompareSync);sync.setAttribute('aria-pressed',String(state.responsiveCompareSync));}
  const selectedToggle=document.getElementById('responsive-compare-selection');if(selectedToggle){selectedToggle.classList.toggle('active',state.responsiveCompareSelected);selectedToggle.setAttribute('aria-pressed',String(state.responsiveCompareSelected));}
  requestAnimationFrame(()=>{fitResponsiveCompareFrames();bindCompareScrollSync();});const status=document.getElementById('responsive-compare-status');if(status)status.innerHTML=`<span>Actualizado ${new Date().toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})}</span><small>${state.responsiveCompareSync?'Scroll sincronizado':'Scroll independiente'} · ${state.responsiveCompareSelected&&state.selectedId?'Selección resaltada':'Sin resaltado de selección'}</small>`;
}
function openResponsiveCompare(){const trigger=document.activeElement;state.responsiveCompareOpen=true;els.responsiveCompare.hidden=false;document.body.classList.add('responsive-compare-open');closeModal();renderResponsiveCompare();accessibility?.focus.openLayer(els.responsiveCompare,{trigger,initialFocus:$('#responsive-compare-close'),modal:true,onEscape:closeResponsiveCompare});}
function closeResponsiveCompare(){state.responsiveCompareOpen=false;els.responsiveCompare.hidden=true;document.body.classList.remove('responsive-compare-open');accessibility?.focus.closeLayer(els.responsiveCompare);}
function openShortcutHelp(){if(!els.shortcutHelp||!els.shortcutHelp.hidden)return;const trigger=document.activeElement;els.shortcutHelp.hidden=false;accessibility?.focus.openLayer(els.shortcutHelp,{trigger,initialFocus:els.shortcutHelp.querySelector('[data-shortcuts-close]'),modal:true,onEscape:closeShortcutHelp});accessibility?.announcer.status('Ayuda de atajos abierta.');}
function closeShortcutHelp(){if(!els.shortcutHelp||els.shortcutHelp.hidden)return;els.shortcutHelp.hidden=true;accessibility?.focus.closeLayer(els.shortcutHelp);}
function toggleDistractionFree(){focusView?.toggle(document.activeElement);}
function toggleInspectorAccessible(force){toggleRightPanel(force);if(!state.rightPanelCollapsed)requestAnimationFrame(()=>els.inspector?.querySelector('button,input,select,textarea,[tabindex="0"]')?.focus()||els.rightPanel?.focus());}
function selectNodeAccessible(id){setSelection(id);render();}

function preview(){
  syncCurrentPageRecord();
  const previewCss=[generatedTokensCss(),generatedStyles().replace(/^@import[^;]+;\s*/gm,''),generatedGlobalClassesCss(),generatedElementsCss()].join('\n');
  const responsiveMeta=`<!-- Orbit responsive: XL ${state.breakpoints.desktopXL}px · Tablet ${state.breakpoints.tablet}px · Mobile L ${state.breakpoints.mobileL}px · Mobile ${state.breakpoints.mobile}px -->`;
  const siteHtml=generatedAstro({previewAssets:true}).replace('</head>',`${responsiveMeta}<style>${previewCss}</style></head>`);
  const widths={desktopXL:state.canvasWidths.desktopXL||1440,desktop:state.canvasWidths.desktop||1200,tablet:state.canvasWidths.tablet||834,mobileL:state.canvasWidths.mobileL||640,mobile:state.canvasWidths.mobile||390};
  const labels={desktopXL:'XL',desktop:'Desktop',tablet:'Tablet',mobileL:'Mobile L',mobile:'Mobile'};
  const buttons=BREAKPOINTS.map(bp=>`<button type="button" data-preview-bp="${bp}" class="${state.breakpoint===bp?'active':''}">${labels[bp]} <small>${widths[bp]}px</small></button>`).join('');
  const shell=`<!doctype html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"><title>Preview · ${escapeHtml(state.projectName)}</title><style>*{box-sizing:border-box}html,body{margin:0;height:100%;overflow:hidden;font-family:Inter,system-ui,sans-serif;background:#0b0e13;color:#e8edf5}.preview-app{height:100%;display:grid;grid-template-rows:56px minmax(0,1fr)}.preview-bar{display:flex;align-items:center;gap:8px;padding:0 14px;border-bottom:1px solid #242a34;background:#11151c}.preview-title{display:flex;flex-direction:column;min-width:160px;margin-right:auto}.preview-title strong{font-size:12px}.preview-title small{font-size:9px;color:#7d8796}.preview-bar button{height:34px;padding:0 10px;border:1px solid #2b3340;border-radius:8px;background:#171d26;color:#9da8b8;font-size:10px;cursor:pointer}.preview-bar button small{margin-left:4px;color:#6f7b8c}.preview-bar button.active{border-color:#ef5a24;background:rgba(239,90,36,.12);color:#fff}.preview-fit{margin-left:4px}.preview-stage{min-height:0;overflow:auto;padding:24px;background-color:#0b0e13;background-image:radial-gradient(#252b35 .7px,transparent .7px);background-size:14px 14px}.preview-frame-wrap{width:${widths[state.breakpoint]}px;max-width:100%;height:100%;min-height:640px;margin:0 auto;background:var(--color-surface,transparent);box-shadow:0 24px 80px rgba(0,0,0,.38);transition:width .18s ease}.preview-frame{width:100%;height:100%;min-height:640px;border:0;background:transparent}@media(max-width:900px){.preview-title{display:none}.preview-bar{overflow:auto}.preview-bar button{flex:0 0 auto}.preview-stage{padding:12px}}</style></head><body><main class="preview-app"><header class="preview-bar"><div class="preview-title"><strong>${escapeHtml(state.projectName)}</strong><small>Responsive preview</small></div>${buttons}<button type="button" class="preview-fit" data-preview-fit>Fit</button></header><section class="preview-stage"><div class="preview-frame-wrap" id="preview-wrap"><iframe class="preview-frame" id="preview-frame" title="Orbit preview"></iframe></div></section></main><script>const siteHtml=${JSON.stringify(siteHtml)};const widths=${JSON.stringify(widths)};const frame=document.getElementById('preview-frame');const wrap=document.getElementById('preview-wrap');frame.srcdoc=siteHtml;document.addEventListener('click',event=>{const button=event.target.closest('[data-preview-bp]');if(button){document.querySelectorAll('[data-preview-bp]').forEach(item=>item.classList.toggle('active',item===button));wrap.style.width=widths[button.dataset.previewBp]+'px';}if(event.target.closest('[data-preview-fit]')){document.querySelectorAll('[data-preview-bp]').forEach(item=>item.classList.remove('active'));wrap.style.width='100%';}});<\/script></body></html>`;
  const url=URL.createObjectURL(new Blob([shell],{type:'text/html'}));
  const previewWindow=window.open(url,'_blank','noopener');
  if(!previewWindow)toast('El navegador bloqueó la ventana de preview');
  setTimeout(()=>URL.revokeObjectURL(url),120000);
}

viewportEngine = createViewportEngine({
  state,
  elements: els,
  callbacks: {
    breakpointIsEnabled, render, renderCanvas, renderRulers, renderSmartGuides,
    markUnsaved, toast, getInterfaceProfile, interfaceProfileLabel, scheduleContextualChrome
  }
});

measurementTools=createMeasurementOverlay({
  window,document,state,elements:els,viewportEngine,
  getSelectedElement:()=>state.selectedId?els.canvas.querySelector(`[data-id="${CSS.escape(state.selectedId)}"]`):null,
  actions:{renderGuides:renderSmartGuides,syncControls:()=>{syncGuidesMenu();const focus=$('#clean-canvas');focus?.classList.toggle('active',!!state.focusView);focus?.setAttribute('aria-pressed',String(!!state.focusView));},announce:message=>accessibility?.announcer.status(message),onFrame:()=>runtimePerformance.increment('measurementFrames')}
});

accessibility=initAccessibility({document,state,elements:els,viewportEngine,actions:{openShortcutHelp,selectNode:selectNodeAccessible,toggleDistractionFree,toggleInspector:toggleInspectorAccessible}});
themeSystem=createThemeSystem({window,document,state,announce:message=>accessibility?.announcer.status(message)});
focusView=createFocusView({document,state,elements:els,viewportEngine,actions:{applyLayout:()=>{applyAdaptiveWorkspace();applyLeftPanelChrome();applyRightPanelChrome();renderCanvas();},announce:message=>accessibility?.announcer.status(message)}});
canvasNavigation=createCanvasNavigation({window,document,state,elements:els,viewportEngine,actions:{announce:message=>accessibility?.announcer.status(message),getNode:id=>find(state.nodes,id),getPageLabel:()=>state.pages.find(page=>page.id===state.currentPageId)?.name||'Página',selectNode:id=>{setSelection(id);render();},escapeHtml}});

els.workspace?.addEventListener('scroll',scheduleContextualChrome,{passive:true});
window.addEventListener('resize',scheduleContextualChrome,{passive:true});
els.builder?.addEventListener('transitionend',scheduleContextualChrome);
document.addEventListener('pointerup',scheduleContextualChrome,{passive:true});

$('#code-studio-trigger')?.addEventListener('click',openCodeStudio);
$('#code-studio')?.addEventListener('click',event=>{
  const tab=event.target.closest('[data-code-tab]');if(tab){selectCodeStudioTab(tab.dataset.codeTab);event.stopPropagation();return;}
  if(event.target.closest('[data-code-close]')){closeCodeStudio();event.stopPropagation();return;}
  if(event.target.closest('[data-code-reset]')){resetCodeStudio();event.stopPropagation();return;}
  if(event.target.closest('[data-code-format]')){formatCodeStudio();event.stopPropagation();return;}
  if(event.target.closest('[data-code-apply]')){applyCodeStudio();event.stopPropagation();return;}
});
$('#code-studio')?.addEventListener('input',event=>{
  if(!event.target.matches('textarea'))return;setCodeStudioDirty(true);clearTimeout(codeStudioPreviewTimer);codeStudioPreviewTimer=setTimeout(renderCodeStudioPreview,220);
});
$('#responsive-suite-trigger')?.addEventListener('click',event=>{const trigger=event.currentTarget;setResponsiveSuiteOpen(trigger.getAttribute('aria-expanded')!=='true');event.stopPropagation();});
$('#responsive-compare')?.addEventListener('click',()=>setResponsiveSuiteOpen(false));
$('#breakpoint-manager')?.addEventListener('click',()=>setResponsiveSuiteOpen(false));
$('#zoom-menu-trigger')?.addEventListener('click',event=>{const trigger=event.currentTarget;setZoomMenuOpen(trigger.getAttribute('aria-expanded')!=='true');event.stopPropagation();});
$('#zoom-menu')?.addEventListener('click',event=>{
  const preset=event.target.closest('[data-zoom-preset]');if(preset){viewportEngine.setZoom(Number(preset.dataset.zoomPreset),{preserveAnchor:false});requestAnimationFrame(()=>viewportEngine.centerCanvas({behavior:'auto'}));setZoomMenuOpen(false);event.stopPropagation();return;}
  const fit=event.target.closest('[data-zoom-fit]');if(fit){viewportEngine.fitToWorkspace({mode:fit.dataset.zoomFit==='width'?'width':'screen'});setZoomMenuOpen(false);event.stopPropagation();return;}
});
$('#guides-menu-trigger')?.addEventListener('click',event=>{const trigger=event.currentTarget;setGuidesMenuOpen(trigger.getAttribute('aria-expanded')!=='true');event.stopPropagation();});
$('#guides-menu')?.addEventListener('click',event=>event.stopPropagation());
function closeContextColorMenu(){document.querySelectorAll('[data-context-color-popover]').forEach(popover=>popover.hidden=true);document.querySelectorAll('[data-context-color-menu]').forEach(trigger=>trigger.setAttribute('aria-expanded','false'));}
function closeInspectorColorMenus(){document.querySelectorAll('[data-inspector-color-popover]').forEach(popover=>popover.hidden=true);document.querySelectorAll('[data-inspector-color-menu]').forEach(trigger=>trigger.setAttribute('aria-expanded','false'));}
function positionInspectorColorPopover(trigger,popover){
  const triggerRect=trigger.getBoundingClientRect(),popoverRect=popover.getBoundingClientRect(),gap=8,padding=8;
  const left=Math.max(padding,Math.min(triggerRect.left,window.innerWidth-popoverRect.width-padding));
  const below=triggerRect.bottom+gap,above=triggerRect.top-popoverRect.height-gap;
  const top=below+popoverRect.height<=window.innerHeight-padding?below:Math.max(padding,above);
  popover.style.left=`${left}px`;popover.style.top=`${top}px`;
}
function applyInspectorColor(prop,value){
  if(String(prop).startsWith('backgroundConfig:')){updateBackgroundConfig({[String(prop).split(':')[1]]:value});return;}
  if(prop==='textShadowColor'){
    const shadow=parseTextShadow(effective(selected()).textShadow);
    const next=`${normalizeLengthValue(shadow.x)||'0px'} ${normalizeLengthValue(shadow.y)||'0px'} ${normalizeLengthValue(shadow.blur)||'0px'} ${value}`;
    commit(()=>directStyle('textShadow',next));return;
  }
  commit(()=>directStyle(prop,value));
}
document.addEventListener('click',event=>{if(!event.target.closest('.responsive-suite'))setResponsiveSuiteOpen(false);if(!event.target.closest('.zoom-pro-shell'))setZoomMenuOpen(false);if(!event.target.closest('.guides-pro-shell'))setGuidesMenuOpen(false);if(!event.target.closest('.context-color-menu'))closeContextColorMenu();if(!event.target.closest('.inspector-color-control'))closeInspectorColorMenus();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){setGuidesMenuOpen(false);closeContextColorMenu();closeInspectorColorMenus();}});

document.addEventListener('click',event=>{
  const backgroundMode=event.target.closest('[data-background-mode]');if(backgroundMode){updateBackgroundConfig({mode:backgroundMode.dataset.backgroundMode});return;}
  if(event.target.closest('[data-google-fonts-open]')){openGoogleFontManager();return;}
  const googleFontUse=event.target.closest('[data-google-font-use]');if(googleFontUse){installGoogleFont(googleFontUse);return;}
  const googleFontRemove=event.target.closest('[data-google-font-remove]');if(googleFontRemove){removeGoogleFont(googleFontRemove.dataset.googleFontRemove);return;}
  const googleFontApply=event.target.closest('[data-google-font-apply-token]');if(googleFontApply){if(!isTextual(selected())){toast('Selecciona un texto para aplicar la fuente');return;}commit(()=>directStyle('fontFamily',googleFontApply.dataset.googleFontApplyToken));refreshGoogleFontManager();return;}
  const tokenAdd=event.target.closest('[data-token-add]');if(tokenAdd){event.stopPropagation();showTokenEditor(tokenAdd.dataset.tokenAdd);return;}
  const tokenEdit=event.target.closest('[data-token-edit]');if(tokenEdit){const [category,key]=tokenEdit.dataset.tokenEdit.split(':');showTokenEditor(category,key);return;}
  const tokenDelete=event.target.closest('[data-token-delete]');if(tokenDelete){const [category,key]=tokenDelete.dataset.tokenDelete.split(':');showTokenDeleteDialog(category,key);return;}
  const tokenConfirmDelete=event.target.closest('[data-token-confirm-delete]');if(tokenConfirmDelete){const [category,key]=tokenConfirmDelete.dataset.tokenConfirmDelete.split(':');deleteToken(category,key);return;}
  const tokenClear=event.target.closest('[data-token-clear]');if(tokenClear&&!tokenClear.disabled){event.stopPropagation();showTokenClearDialog(tokenClear.dataset.tokenClear);return;}
  const tokenConfirmClear=event.target.closest('[data-token-confirm-clear]');if(tokenConfirmClear){clearTokenCategory(tokenConfirmClear.dataset.tokenConfirmClear);return;}
  if(event.target.closest('#shortcut-help-trigger')){openShortcutHelp();return;}
  if(event.target.closest('[data-shortcuts-close]')){closeShortcutHelp();return;}
  if(event.target.closest('[data-command-close]')){closeCommandPalette();return;}
  const commandResult=event.target.closest('[data-command-id]');if(commandResult){executeCommand(commandResult.dataset.commandId);return;}
  if(event.target.closest('[data-quick-close]')){closeQuickInsert();return;}
  const quickType=event.target.closest('[data-quick-type]');if(quickType){insertQuickElement(quickType.dataset.quickType);return;}
  if(state.quickInsertOpen&&!event.target.closest('#quick-insert-popover')&&!event.target.closest('#quick-add')&&!event.target.closest('[data-context-add]')&&!event.target.closest('[data-empty-add]'))closeQuickInsert();
  const contextAdd=event.target.closest('[data-context-add]');if(contextAdd){openQuickInsert({anchor:contextAdd.getBoundingClientRect(),placement:insertionForClick()});return;}
  if(event.target.closest('[data-empty-add]')){openQuickInsert({anchor:event.target.closest('[data-empty-add]').getBoundingClientRect(),placement:insertionForClick()});return;}
  if(event.target.closest('[data-empty-section]')){addTemplate('hero',{parentId:null,index:state.nodes.length});return;}
  if(event.target.closest('[data-open-layers]')){activateWorkspacePanel('layers');return;}
  if(event.target.closest('[data-open-seo]')){showPageSettings();return;}
  if(event.target.closest('[data-open-audit]')){showAudit();return;}
  if(event.target.closest('[data-open-inspector]')){toggleRightPanel(false);return;}
  const inspectorMode=event.target.closest('[data-inspector-mode]');if(inspectorMode){state.inspectorMode=inspectorMode.dataset.inspectorMode;renderInspector();markUnsaved();return;}
  const inspectorTab=event.target.closest('[data-inspector-tab]');if(inspectorTab){if(state.rightPanelCollapsed)toggleRightPanel(false);state.inspectorTab=inspectorTab.dataset.inspectorTab;renderInspector();requestAnimationFrame(()=>els.inspector?.querySelector(`[data-inspector-tab="${state.inspectorTab}"]`)?.focus());markUnsaved();return;}
  if(event.target.closest('[data-direct-toggle]')){state.directEditEnabled=!state.directEditEnabled;renderCanvas();renderMultiToolbar();markUnsaved();return;}
  const colorMenuTrigger=event.target.closest('[data-context-color-menu]');if(colorMenuTrigger){const popover=colorMenuTrigger.parentElement?.querySelector('[data-context-color-popover]');const willOpen=!!popover?.hidden;closeContextColorMenu();if(popover){popover.hidden=!willOpen;colorMenuTrigger.setAttribute('aria-expanded',String(willOpen));}event.stopPropagation();return;}
  if(event.target.closest('[data-context-color-close]')){closeContextColorMenu();return;}
  const colorTokenButton=event.target.closest('[data-context-color-token]');if(colorTokenButton){commit(()=>directStyle('color',colorTokenButton.dataset.contextColorToken));return;}
  const inspectorColorTrigger=event.target.closest('[data-inspector-color-menu]');if(inspectorColorTrigger){const popover=inspectorColorTrigger.parentElement?.querySelector('[data-inspector-color-popover]');const willOpen=!!popover?.hidden;closeInspectorColorMenus();if(popover&&willOpen){popover.hidden=false;inspectorColorTrigger.setAttribute('aria-expanded','true');positionInspectorColorPopover(inspectorColorTrigger,popover);}event.stopPropagation();return;}
  if(event.target.closest('[data-inspector-color-close]')){closeInspectorColorMenus();return;}
  const inspectorColorToken=event.target.closest('[data-inspector-color-token]');if(inspectorColorToken){applyInspectorColor(inspectorColorToken.dataset.inspectorColorToken,inspectorColorToken.dataset.inspectorColorValue);return;}
  const textAlignButton=event.target.closest('[data-context-text-align]');if(textAlignButton){commit(()=>directStyle('textAlign',textAlignButton.dataset.contextTextAlign));return;}
  const textToggle=event.target.closest('[data-context-text-toggle]');if(textToggle){const node=selected();if(!node)return;const current=effective(node);const kind=textToggle.dataset.contextTextToggle;commit(()=>{if(kind==='bold')directStyle('fontWeight',Number(current.fontWeight)>=600||['bold','bolder'].includes(String(current.fontWeight))?400:700);if(kind==='italic')directStyle('fontStyle',String(current.fontStyle||'normal')==='italic'?'normal':'italic');});return;}
  const directionButton=event.target.closest('[data-context-direction]');if(directionButton){commit(()=>{directStyle('display','flex');directStyle('direction',directionButton.dataset.contextDirection);});return;}
  const gapButton=event.target.closest('[data-context-gap]');if(gapButton){adjustSelectedStyle('gap',Number(gapButton.dataset.contextGap)||0,0,240);return;}
  const gridButton=event.target.closest('[data-context-grid]');if(gridButton){const node=selected();if(node){const current=Math.max(1,Number(effective(node).gridColumns)||1);commit(()=>directStyle('gridColumns',Math.max(1,Math.min(12,current+(Number(gridButton.dataset.contextGrid)||0)))));}return;}
  const tokenGroupButton=event.target.closest('[data-token-group]'); if(tokenGroupButton){const key=tokenGroupButton.dataset.tokenGroup;state.tokenGroupsOpen={...(state.tokenGroupsOpen||{}),[key]:state.tokenGroupsOpen?.[key]===false};renderLeft();markUnsaved();return;}
  const close=event.target.closest('[data-close-modal]'); if(close){closeModal();return;}
  const importTab=event.target.closest('[data-import-tab]'); if(importTab){showImportHub(importTab.dataset.importTab);return;}
  if(event.target.closest('[data-analyze-design-system]')){const css=$('#import-design-css')?.value||'';const items=analyzeDesignSystem(css);if(!items.length){toast('No se detectaron variables CSS');return;}state.pendingImport={type:'tokens',items};const host=$('#import-analysis');if(host)host.innerHTML=designSystemPreview(items);return;}
  if(event.target.closest('[data-commit-design-system]')){commitDesignSystem();return;}
  if(event.target.closest('[data-import-html-css]')){try{const before=snapshot();const count=importHtmlCss($('#import-html-source')?.value||'',$('#import-css-source')?.value||'',$('#code-import-mode')?.value||'replace');pushHistory(before);markUnsaved();render();closeModal();toast(`${count} elementos importados`);}catch(error){toast(error.message);}return;}
  if(event.target.closest('[data-clear-orbit-json-file]')){clearOrbitJsonFile();return;}
  if(event.target.closest('[data-analyze-orbit-json]')){analyzeOrbitJsonSource();return;}
  if(event.target.closest('[data-commit-orbit-import]')){commitOrbitAiImport();return;}
  if(event.target.closest('[data-add-page]')){addPage();return;}
  const addSystemPageButton=event.target.closest('[data-add-system-page]');if(addSystemPageButton){addSystemPage(addSystemPageButton.dataset.addSystemPage);return;}
  const pageStatusButton=event.target.closest('[data-toggle-page-status]');if(pageStatusButton){togglePageStatus(pageStatusButton.dataset.togglePageStatus);return;}
  const openPage=event.target.closest('[data-open-page]');if(openPage&&!event.target.closest('[data-duplicate-page],[data-page-settings-id],[data-delete-page],[data-toggle-page-status]')){switchPage(openPage.dataset.openPage);return;}
  const duplicatePageButton=event.target.closest('[data-duplicate-page]');if(duplicatePageButton){duplicatePage(duplicatePageButton.dataset.duplicatePage);return;}
  const deletePageButton=event.target.closest('[data-delete-page]');if(deletePageButton){deletePage(deletePageButton.dataset.deletePage);return;}
  const pageSettingsButton=event.target.closest('[data-page-settings-id]');if(pageSettingsButton){if(pageSettingsButton.dataset.pageSettingsId!==state.currentPageId)switchPage(pageSettingsButton.dataset.pageSettingsId);showPageSettings();return;}
  if(event.target.closest('[data-create-global-class]')){createGlobalClassFromSelection();return;}
  const sharedStyleMode=event.target.closest('[data-shared-style-mode]');if(sharedStyleMode){setSharedStyleMode(sharedStyleMode.dataset.sharedStyleMode);return;}
  const toggleGlobal=event.target.closest('[data-toggle-global-class]');if(toggleGlobal){toggleGlobalClass(toggleGlobal.dataset.toggleGlobalClass);return;}
  const editGlobal=event.target.closest('[data-edit-global-class]');if(editGlobal){showGlobalClassEditor(editGlobal.dataset.editGlobalClass);return;}
  const deleteGlobal=event.target.closest('[data-delete-global-class]');if(deleteGlobal){deleteGlobalClass(deleteGlobal.dataset.deleteGlobalClass);return;}
  const saveGlobal=event.target.closest('[data-save-global-class]');if(saveGlobal){saveGlobalClass(saveGlobal.dataset.saveGlobalClass);return;}
  const compareEdit=event.target.closest('[data-compare-edit]');if(compareEdit){setBreakpoint(compareEdit.dataset.compareEdit);closeResponsiveCompare();toast(`Editando ${breakpointLabels[compareEdit.dataset.compareEdit]||compareEdit.dataset.compareEdit}`);return;}
  if(event.target.closest('[data-open-breakpoints]')){showBreakpointManager();return;}
  if(event.target.closest('[data-save-breakpoints]')){saveBreakpointManager();return;}
  if(event.target.closest('[data-reset-breakpoints]')){state.breakpoints={desktopXL:1440,desktop:1200,tablet:1024,mobileL:768,mobile:480};state.canvasWidths={desktopXL:1440,desktop:1200,tablet:834,mobileL:640,mobile:390};state.breakpointEnabled={desktopXL:true,mobileL:true};showBreakpointManager();return;}
  if(event.target.closest('[data-copy-base]')){copyBaseToBreakpoint();return;}
  if(event.target.closest('[data-reset-breakpoint]')){resetCurrentBreakpoint();return;}
  if(event.target.closest('[data-generate-bem]')){generateBemForSelection();return;}
  if(event.target.closest('[data-create-component]')){createComponentFromSelection();return;}
  const componentFilter=event.target.closest('[data-component-filter]');if(componentFilter){state.componentFilter=componentFilter.dataset.componentFilter;renderLeft();return;}
  const addComponent=event.target.closest('[data-add-component]');if(addComponent){addComponentInstance(addComponent.dataset.addComponent);return;}
  const goComponentMaster=event.target.closest('[data-go-component-master]');if(goComponentMaster){goToComponentMaster(goComponentMaster.dataset.goComponentMaster);return;}
  const renameComponentButton=event.target.closest('[data-rename-component]');if(renameComponentButton){renameComponent(renameComponentButton.dataset.renameComponent);return;}
  const componentProperties=event.target.closest('[data-component-properties]');if(componentProperties){showComponentProperties(componentProperties.dataset.componentProperties);return;}
  const detectComponentPropertiesButton=event.target.closest('[data-detect-component-properties]');if(detectComponentPropertiesButton){detectComponentProperties(detectComponentPropertiesButton.dataset.detectComponentProperties);return;}
  const removeComponentPropertyButton=event.target.closest('[data-remove-component-property]');if(removeComponentPropertyButton){removeComponentProperty(removeComponentPropertyButton.dataset.componentRef,removeComponentPropertyButton.dataset.removeComponentProperty);return;}
  const saveComponentPropertiesButton=event.target.closest('[data-save-component-properties]');if(saveComponentPropertiesButton){saveComponentProperties(saveComponentPropertiesButton.dataset.saveComponentProperties);return;}
  const syncComponent=event.target.closest('[data-sync-component]');if(syncComponent){syncComponentInstances(syncComponent.dataset.syncComponent);return;}
  const componentVariants=event.target.closest('[data-component-variants]');if(componentVariants){showComponentVariants(componentVariants.dataset.componentVariants);return;}
  const createComponentVariantButton=event.target.closest('[data-create-component-variant]');if(createComponentVariantButton){createComponentVariant(createComponentVariantButton.dataset.createComponentVariant);return;}
  const updateComponentVariantButton=event.target.closest('[data-update-component-variant]');if(updateComponentVariantButton){updateComponentVariant(updateComponentVariantButton.dataset.componentRef,updateComponentVariantButton.dataset.updateComponentVariant);return;}
  const applyComponentVariantButton=event.target.closest('[data-apply-component-variant]');if(applyComponentVariantButton){applyComponentVariant(applyComponentVariantButton.dataset.componentRef,applyComponentVariantButton.dataset.applyComponentVariant);return;}
  const deleteComponentVariantButton=event.target.closest('[data-delete-component-variant]');if(deleteComponentVariantButton){deleteComponentVariant(deleteComponentVariantButton.dataset.componentRef,deleteComponentVariantButton.dataset.deleteComponentVariant);return;}
  const resetComponentOverrideButton=event.target.closest('[data-reset-component-override]');if(resetComponentOverrideButton){resetComponentOverride(resetComponentOverrideButton.dataset.componentRootId,resetComponentOverrideButton.dataset.resetComponentOverride);return;}
  const resetComponentOverridesButton=event.target.closest('[data-reset-component-overrides]');if(resetComponentOverridesButton){resetAllComponentOverrides(resetComponentOverridesButton.dataset.resetComponentOverrides);return;}
  const deleteComponentButton=event.target.closest('[data-delete-component]');if(deleteComponentButton){showDeleteComponentDialog(deleteComponentButton.dataset.deleteComponent);return;}
  const componentDeleteMode=event.target.closest('[data-component-delete-mode]');if(componentDeleteMode){deleteComponent(componentDeleteMode.dataset.componentRef,componentDeleteMode.dataset.componentDeleteMode);return;}
  if(event.target.closest('[data-detach-component]')){detachComponentSelection();return;}
  const multi=event.target.closest('[data-multi]');if(multi){multiCommand(multi.dataset.multi);return;}
  const styleState=event.target.closest('[data-style-state]');if(styleState){state.styleState=styleState.dataset.styleState;renderInspector();renderCanvas();return;}
  const layerVisible=event.target.closest('[data-layer-visible]');if(layerVisible){const id=layerVisible.dataset.layerVisible;commit(()=>{state.nodes=update(state.nodes,id,node=>({...node,hidden:!node.hidden}));},state.selectedId);return;}
  const layerLock=event.target.closest('[data-layer-lock]');if(layerLock){const id=layerLock.dataset.layerLock;commit(()=>{state.nodes=update(state.nodes,id,node=>({...node,locked:!node.locked}));},state.selectedId);return;}
  if(event.target.closest('[data-layers-expand]')){state.collapsed={};renderLeft();return;}
  if(event.target.closest('[data-layers-collapse]')){const collapsed={};(function walk(nodes){nodes.forEach(node=>{if(node.children?.length)collapsed[node.id]=true;walk(node.children||[]);});})(state.nodes);state.collapsed=collapsed;renderLeft();return;}
  const auditNode=event.target.closest('[data-audit-node]');if(auditNode){setSelection(auditNode.dataset.auditNode);closeModal();render();return;}
  if(event.target.closest('[data-save-page-meta]')){const before=snapshot();els.modalContent.querySelectorAll('[data-page-meta]').forEach(input=>{state.pageMeta[input.dataset.pageMeta]=input.value.trim();});els.modalContent.querySelectorAll('[data-page-meta-check]').forEach(input=>{state.pageMeta[input.dataset.pageMetaCheck]=input.checked;});const page=currentPage();els.modalContent.querySelectorAll('[data-page-record]').forEach(input=>{const key=input.dataset.pageRecord;page[key]=key==='slug'?(input.value.trim()==='/'?'/':`/${slug(input.value)}`):input.value.trim();});syncCurrentPageRecord();pushHistory(before);markUnsaved();closeModal();render();toast('Ajustes de página guardados');return;}
  if(event.target.closest('[data-grid-builder-open]')){openGridBuilder();return;}
  if(event.target.closest('[data-grid-builder-close]')){closeGridBuilder();return;}
  if(event.target.closest('[data-grid-builder-reset]')){resetGridBuilder();return;}
  if(event.target.closest('[data-grid-builder-fill]')){fillGridBuilder();return;}
  const gridStep=event.target.closest('[data-grid-builder-step]'); if(gridStep){gridBuilderStep(gridStep.dataset.gridBuilderStep,Number(gridStep.dataset.delta)||0);return;}
  if(event.target.closest('[data-grid-builder-minmax]')){const s=gridBuilderStyles();if(s)updateGridBuilderStyles({gridUseMinMax:!s.gridUseMinMax,gridColumnTracks:normalizeTrackList([],Math.max(1,Number(s.gridColumns)||1),!s.gridUseMinMax?'minmax(0,1fr)':'1fr')});return;}
  const collapse=event.target.closest('[data-collapse]'); if(collapse?.dataset.collapse){ event.preventDefault();event.stopPropagation();state.collapsed[collapse.dataset.collapse]=!state.collapsed[collapse.dataset.collapse];renderLeft();return; }
  const inspectorSection=event.target.closest('[data-section]'); if(inspectorSection){const id=inspectorSection.dataset.section;state.openSections[id]=!state.openSections[id];renderInspector();return;}
  const layoutPanel=event.target.closest('[data-layout-panel]'); if(layoutPanel){const id=layoutPanel.dataset.layoutPanel;state.layoutPanels[id]=!state.layoutPanels[id];renderInspector();return;}
  const layoutPosition=event.target.closest('[data-layout-position]'); if(layoutPosition){const x=Number(layoutPosition.dataset.x),y=Number(layoutPosition.dataset.y),kind=layoutPosition.dataset.layoutPosition;if(kind==='flex')commit(()=>{directStyle('justifyContent',['flex-start','center','flex-end'][x]);directStyle('alignItems',['flex-start','center','flex-end'][y]);});else commit(()=>{directStyle('justifyItems',['start','center','end'][x]);directStyle('alignItems',['start','center','end'][y]);});return;}
  const tab=event.target.closest('[data-tab]'); if(tab){state.tab=tab.dataset.tab;if(state.interfaceProfile==='tablet'&&state.leftPanelCollapsed)toggleLeftPanel(false);else renderLeft();return;}
  const moreBreakpoint=event.target.closest('[data-breakpoint-more]');if(moreBreakpoint){state.breakpointMenuOpen=!state.breakpointMenuOpen;renderViewport();return;}
  if(state.breakpointMenuOpen&&!event.target.closest('.viewport-more-wrap')){state.breakpointMenuOpen=false;renderViewport();}
  const responsiveReset=event.target.closest('[data-responsive-reset-prop]');if(responsiveReset){resetResponsiveProperty(state.selectedId,responsiveReset.dataset.responsiveResetProp,responsiveReset.dataset.responsiveBp);return;}
  const responsiveDown=event.target.closest('[data-responsive-apply-down]');if(responsiveDown){applyResponsivePropertyDown(state.selectedId,responsiveDown.dataset.responsiveApplyDown);return;}
  if(event.target.closest('[data-open-responsive-audit]')){showResponsiveAudit();return;}
  if(event.target.closest('[data-open-responsive-compare]')){openResponsiveCompare();return;}
  const responsiveFix=event.target.closest('[data-responsive-fix]');if(responsiveFix){applyResponsiveFix(responsiveFix.dataset.responsiveIssue,responsiveFix.dataset.responsiveFix);return;}
  const responsiveIgnore=event.target.closest('[data-responsive-ignore]');if(responsiveIgnore){state.responsiveAuditIgnored=[...new Set([...(state.responsiveAuditIgnored||[]),responsiveIgnore.dataset.responsiveIgnore])];markUnsaved();showResponsiveAudit();return;}
  if(event.target.closest('[data-export-anyway]')){closeModal();exportProject(true);return;}
  if(event.target.closest('#responsive-compare-sync')){state.responsiveCompareSync=!state.responsiveCompareSync;renderResponsiveCompare();markUnsaved();return;}
  if(event.target.closest('#responsive-compare-selection')){state.responsiveCompareSelected=!state.responsiveCompareSelected;renderResponsiveCompare();markUnsaved();return;}
  const compareZoom=event.target.closest('[data-compare-zoom]');if(compareZoom){const bp=compareZoom.dataset.compareBp;state.responsiveCompareZoom[bp]=Math.max(.5,Math.min(1.6,(state.responsiveCompareZoom[bp]||1)+Number(compareZoom.dataset.compareZoom)));fitResponsiveCompareFrame(bp);markUnsaved();return;}
  const bp=event.target.closest('[data-bp]'); if(bp){setBreakpoint(bp.dataset.bp);setResponsiveSuiteOpen(false);return;}
  const favoriteType=event.target.closest('[data-favorite-type]'); if(favoriteType){event.preventDefault();event.stopPropagation();toggleElementFavorite(favoriteType.dataset.favoriteType);return;}
  const elementView=event.target.closest('[data-element-view]'); if(elementView){state.elementView=elementView.dataset.elementView;renderLeft();return;}
  const elementCategory=event.target.closest('[data-element-category]'); if(elementCategory){state.elementCategory=elementCategory.dataset.elementCategory;renderLeft();return;}
  const add=event.target.closest('[data-type]'); if(add){addElement(add.dataset.type);return;}
  const template=event.target.closest('[data-template]'); if(template){addTemplate(template.dataset.template);return;}
  const layer=event.target.closest('[data-layer]'); if(layer&&!event.target.closest('.layer-drag,.layer-collapse,.layer-visibility,.layer-lock')){setSelection(layer.dataset.layer,event.shiftKey||event.metaKey||event.ctrlKey);render();return;}
  const assetFilter=event.target.closest('[data-asset-filter]');if(assetFilter){state.assetFilter=assetFilter.dataset.assetFilter;renderLeft();return;}
  const useAssetButton=event.target.closest('[data-use-asset]');if(useAssetButton){useAsset(useAssetButton.dataset.useAsset);return;}
  const renameAssetButton=event.target.closest('[data-rename-asset]');if(renameAssetButton){renameAsset(renameAssetButton.dataset.renameAsset);return;}
  const replaceAssetButton=event.target.closest('[data-replace-asset]');if(replaceAssetButton){state.assetReplaceId=replaceAssetButton.dataset.replaceAsset;els.assetReplaceUpload?.click();return;}
  const deleteAssetButton=event.target.closest('[data-delete-asset]');if(deleteAssetButton){deleteAsset(deleteAssetButton.dataset.deleteAsset);return;}
  if(event.target.closest('[data-clean-unused-assets]')){cleanUnusedAssets();return;}
  const asset=event.target.closest('[data-asset]'); if(asset&&!event.target.closest('.asset-card-actions')){useAsset(asset.dataset.asset);return;}
  if(event.target.closest('[data-upload-assets]')){els.assetUpload.click();return;}
  if(event.target.closest('[data-upload-svg]')){svgUploadInput.click();return;}
  if(event.target.closest('[data-clear-svg]')){commit(()=>directNodeProp('svgCode',''));return;}
  if(event.target.closest('[data-reset-override]')){resetOverride();return;}
  const shadowToggle=event.target.closest('[data-text-shadow-toggle]');
  if(shadowToggle){
    const control=shadowToggle.closest('.text-shadow-control');
    const panel=control?.querySelector('[data-text-shadow-panel]');
    if(panel){
      const open=panel.hidden;
      panel.hidden=!open;
      shadowToggle.setAttribute('aria-expanded',String(open));
      control.classList.toggle('is-open',open);
    }
    return;
  }
  const boxLink=event.target.closest('[data-box-link]'); if(boxLink){activateBoxLink(boxLink);return;}
  const styleButton=event.target.closest('[data-style-button]'); if(styleButton){const prop=styleButton.dataset.styleButton,value=styleButton.dataset.value;if(prop==='display'){state.layoutPanels.flex=value.includes('flex');state.layoutPanels.grid=value.includes('grid');state.layoutPanels.inline=value.startsWith('inline');}commit(()=>directStyle(prop,value));return;}
  const action=event.target.closest('[data-action]'); if(action){
    const name=action.dataset.action; if(name==='delete')deleteSelected(); if(name==='duplicate')duplicateSelected(); if(name==='up')moveSelected(-1); if(name==='down')moveSelected(1); return;
  }
  const element=event.target.closest('[data-id]');
  if(element&&!state.previewMode&&!event.target.closest('[data-resize],[data-direct-prop]')&&!state.inlineEdit){
    event.preventDefault(); event.stopPropagation();
    setSelection(element.dataset.id,event.shiftKey||event.metaKey||event.ctrlKey);render();
    return;
  }
  if(event.target===els.canvas&&!state.previewMode){setSelection(null);render();}
});

document.addEventListener('dblclick',event=>{
  const guide=event.target.closest('[data-guide-id]');
  if(guide){event.preventDefault();event.stopPropagation();state.customGuides=(state.customGuides||[]).filter(item=>item.id!==guide.dataset.guideId);renderSmartGuides();markUnsaved();return;}
  const editable=event.target.closest('[data-editable]'); if(editable&&!state.previewMode){event.preventDefault();event.stopPropagation();startInlineEdit(editable);}
});

document.addEventListener('pointerdown',event=>{ const boxLink=event.target.closest('[data-box-link]');if(boxLink){event.preventDefault();activateBoxLink(boxLink);return;} if(event.target.closest('#left-panel-resizer')){startLeftPanelResize(event);return;} if(event.target.closest('#right-panel-resizer')){startRightPanelResize(event);return;} const directHandle=event.target.closest('[data-direct-prop]');if(directHandle){startDirectEdit(event,directHandle);return;} const handle=event.target.closest('[data-resize]'); if(handle)startResize(event,handle); const guideEl=event.target.closest('[data-guide-id]'); if(guideEl){const guide=(state.customGuides||[]).find(item=>item.id===guideEl.dataset.guideId); if(guide)startGuideDrag(event,guide.orientation,guide.id);} if(event.target.closest('#canvas-ruler-x'))startGuideDrag(event,'vertical'); if(event.target.closest('#canvas-ruler-y'))startGuideDrag(event,'horizontal'); });
document.addEventListener('pointermove',event=>{resizeMove(event);moveDirectEdit(event);moveGuideDrag(event);moveRightPanelResize(event);moveLeftPanelResize(event);});
document.addEventListener('pointerup',event=>{resizeEnd(event);endDirectEdit(event);endGuideDrag(event);endRightPanelResize(event);endLeftPanelResize(event);});

document.addEventListener('dragover',event=>{
  const zone=event.target.closest?.('[data-orbit-json-dropzone]');
  if(!zone)return;
  event.preventDefault();
  event.stopPropagation();
  zone.classList.add('is-dragging');
  if(event.dataTransfer)event.dataTransfer.dropEffect='copy';
});
document.addEventListener('dragleave',event=>{
  const zone=event.target.closest?.('[data-orbit-json-dropzone]');
  if(zone&&!zone.contains(event.relatedTarget))zone.classList.remove('is-dragging');
});
document.addEventListener('drop',event=>{
  const zone=event.target.closest?.('[data-orbit-json-dropzone]');
  if(!zone)return;
  event.preventDefault();
  event.stopPropagation();
  zone.classList.remove('is-dragging');
  loadOrbitJsonFile(event.dataTransfer?.files?.[0]);
});

document.addEventListener('dragstart',event=>{
  const node=event.target.closest('[data-drag-node]');
  const item=event.target.closest('[data-type]');
  const template=event.target.closest('[data-template]');
  const asset=event.target.closest('[data-asset]');
  if(node){const dragNode=find(state.nodes,node.dataset.dragNode);if(dragNode?.locked){event.preventDefault();toast('Esta capa está bloqueada','error');return;}dragPayload={kind:'node',id:node.dataset.dragNode};}
  else if(item)dragPayload={kind:'element',type:item.dataset.type};
  else if(template)dragPayload={kind:'template',id:template.dataset.template};
  else if(asset)dragPayload={kind:'asset',id:asset.dataset.asset};
  if(dragPayload){event.dataTransfer.effectAllowed='copyMove';event.dataTransfer.setData('text/plain',JSON.stringify(dragPayload));requestAnimationFrame(()=>startDragUi(event));}
});
document.addEventListener('dragover',moveDragUi);
document.addEventListener('dragend',()=>{dragPayload=null;showDropIndicator(null);endDragUi();});

els.canvas.addEventListener('dragover',event=>{event.preventDefault();event.dataTransfer.dropEffect=dragPayload?.kind==='node'?'move':'copy';showDropIndicator(computeDrop(event));});
els.canvas.addEventListener('dragleave',event=>{if(!els.canvas.contains(event.relatedTarget))showDropIndicator(null);});
els.canvas.addEventListener('drop',event=>{event.preventDefault();const drop=state.drop||computeDrop(event);showDropIndicator(null);performDrop(drop);dragPayload=null;});

els.left.addEventListener('dragover',event=>{
  if(dragPayload?.kind!=='node')return;
  const row=event.target.closest('[data-layer]'); if(!row)return; event.preventDefault();
  const info=findInfo(state.nodes,row.dataset.layer); if(!info)return; const rect=row.getBoundingClientRect(); const before=event.clientY<rect.top+rect.height/2;
  showDropIndicator({parentId:info.parentId,index:info.index+(before?0:1),mode:before?'before':'after',axis:'y',rect});
});
els.left.addEventListener('drop',event=>{if(dragPayload?.kind!=='node')return;event.preventDefault();performDrop(state.drop);showDropIndicator(null);dragPayload=null;});

document.addEventListener('focusin',event=>{
  const t=event.target;
  if(t.matches('[data-node-prop],[data-style-prop],[data-color-prop],[data-unit-number],[data-unit-select],[data-token-value],[data-token-color],[data-box-input],[data-shadow-part],[data-shadow-color],[data-bem-block],[data-bem-element],[data-bem-modifiers],[data-custom-classes],[data-component-prop-input]'))beginTransaction('input');
});

document.addEventListener('submit',event=>{
  const form=event.target.closest?.('[data-token-editor-form]');
  if(!form)return;
  event.preventDefault();saveTokenEditor(form);
});

document.addEventListener('input',event=>{
  const t=event.target;
  if(t.dataset.tokenEditorColor!==undefined){const value=t.closest('.token-editor-value-row')?.querySelector('[data-token-editor-value]');if(value)value.value=t.value;return;}
  if(t.dataset.tokenEditorValue!==undefined&&/^#[0-9a-f]{6}$/i.test(t.value.trim())){const picker=t.closest('.token-editor-value-row')?.querySelector('[data-token-editor-color]');if(picker)picker.value=t.value.trim();return;}
  if(t.dataset.googleFontSearch!==undefined){googleFontQuery=t.value;refreshGoogleFontManager(true);return;}
  if(t===els.commandInput){state.commandQuery=t.value;state.commandIndex=0;renderCommandPalette();return;}
  if(t===els.quickInsertInput){state.quickInsertQuery=t.value;state.quickInsertIndex=0;renderQuickInsert();return;}
  if(t.matches('[data-editable][contenteditable=true]')){ const id=t.dataset.editable; state.nodes=update(state.nodes,id,n=>({...n,content:t.innerText})); markUnsaved(); return; }
  if(t===els.projectName){ if(!state.transaction)beginTransaction('project-name'); state.projectName=t.value||'Untitled project'; state.pageMeta.title=state.pageMeta.title==='Untitled landing page'?state.projectName:state.pageMeta.title; markUnsaved(); return; }
  if(t.dataset.layerSearch!==undefined){state.layerSearch=t.value;renderLeft();const input=els.left.querySelector('[data-layer-search]');if(input){input.focus();input.setSelectionRange(input.value.length,input.value.length);}return;}
  if(t.dataset.elementSearch!==undefined){state.elementSearch=t.value;renderLeft();const input=els.left.querySelector('[data-element-search]');if(input){input.focus();input.setSelectionRange(input.value.length,input.value.length);}return;}
  if(t.dataset.assetSearch!==undefined){state.assetSearch=t.value;renderLeft();const input=els.left.querySelector('[data-asset-search]');if(input){input.focus();input.setSelectionRange(input.value.length,input.value.length);}return;}
  if(t.dataset.componentSearch!==undefined){state.componentSearch=t.value;renderLeft();const input=els.left.querySelector('[data-component-search]');if(input){input.focus();input.setSelectionRange(input.value.length,input.value.length);}return;}
  if(t.dataset.componentPropInput!==undefined){setComponentPropertyValue(t.dataset.componentId,t.dataset.componentRootId,t.dataset.componentPropInput,t.value);return;}
  if(t.id==='import-orbit-json'){clearOrbitImportReport();const input=$('#orbit-json-file');if(input)input.value='';updateOrbitFileUi();return;}
  if(t.dataset.bemBlock!==undefined){updateBemBlock(state.selectedId,t.value);renderCanvas();markUnsaved();return;}
  if(t.dataset.bemElement!==undefined){directNodeProp('bemElement',sanitizeClass(t.value));renderCanvas();markUnsaved();return;}
  if(t.dataset.bemModifiers!==undefined){directNodeProp('bemModifiers',t.value.split(/[\s,]+/).map(sanitizeClass).filter(Boolean));renderCanvas();markUnsaved();return;}
  if(t.dataset.customClasses!==undefined){directNodeProp('customClasses',t.value.split(/\s+/).map(sanitizeClass).filter(Boolean));renderCanvas();markUnsaved();return;}
  if(updateFromInput(t)){ markUnsaved(); if(t.type==='range'){const small=t.parentElement.querySelector('small');if(small)small.textContent=`${t.value} columnas`; } }
});

document.addEventListener('change',async event=>{
  const t=event.target;
  if(t.dataset.backgroundField!==undefined){const key=t.dataset.backgroundField;const numeric=['gradientAngle','overlayOpacity'].includes(key);updateBackgroundConfig({[key]:numeric?Number(t.value):t.value});return;}
  if(t.dataset.backgroundAsset!==undefined){if(t.value)updateBackgroundConfig({imageSrc:t.value});return;}
  if(t.dataset.primaryStyleClass!==undefined){setPrimarySharedStyleClass(t.value);return;}
  if(t.dataset.inspectorColorCustom!==undefined){applyInspectorColor(t.dataset.inspectorColorCustom,t.value);return;}
  if(t.dataset.contextTextFont!==undefined){commit(()=>directStyle('fontFamily',t.value));return;}
  if(t.dataset.contextTextSize!==undefined){commit(()=>directStyle('fontSize',t.value));return;}
  if(t.dataset.contextTextColor!==undefined){commit(()=>directStyle('color',t.value));return;}
  if(t.dataset.shadowColorToken!==undefined){
    const shadow=parseTextShadow(effective(selected()).textShadow);
    const color=t.value==='__custom'?(resolveToken(shadow.color)||'#000000'):t.value;
    const value=`${normalizeLengthValue(shadow.x)||'0px'} ${normalizeLengthValue(shadow.y)||'0px'} ${normalizeLengthValue(shadow.blur)||'0px'} ${color}`;
    commit(()=>directStyle('textShadow',value));return;
  }
  if(t.dataset.componentVariantSelect!==undefined){const rootId=t.dataset.componentRootId;if(rootId){state.selectedId=rootId;state.selectedIds=[rootId];applyComponentVariant(t.dataset.componentVariantSelect,t.value);}return;}
  if(t.dataset.componentPropInput!==undefined){endTransaction();return;}
  if(t.id==='design-system-file'){const file=t.files?.[0];if(file){const area=$('#import-design-css');if(area)area.value=await file.text();}return;}
  if(t.id==='orbit-json-file'){await loadOrbitJsonFile(t.files?.[0]);return;}
  if(t.dataset.gridBuilderGap!==undefined){updateGridBuilderStyles({gap:t.value.trim()||'0px'});return;}
  if(t.dataset.gridTrackCol!==undefined){const s=gridBuilderStyles();if(s){const list=normalizeTrackList(s.gridColumnTracks,Math.max(1,Number(s.gridColumns)||1),s.gridUseMinMax?'minmax(0,1fr)':'1fr');list[Number(t.dataset.gridTrackCol)]=t.value.trim()||'1fr';updateGridBuilderStyles({gridColumnTracks:list});}return;}
  if(t.dataset.gridTrackRow!==undefined){const s=gridBuilderStyles();if(s){const list=normalizeTrackList(s.gridRowTracks,Math.max(1,Number(s.gridRows)||1),'1fr');list[Number(t.dataset.gridTrackRow)]=t.value.trim()||'1fr';updateGridBuilderStyles({gridRowTracks:list});}return;}
  if(t.dataset.tokenProp){applyTokenSelection(t);return;}
  if(t.dataset.unitSelect!==undefined){ const input=t.closest('.unit-input').querySelector('[data-unit-number]'); input.disabled=t.value==='auto'; updateFromInput(t); }
  else updateFromInput(t);
  endTransaction();
});

document.addEventListener('focusout',event=>{
  if(event.target.matches('[data-editable][contenteditable=true]')){finishInlineEdit(false);return;}
  if(state.transaction)setTimeout(()=>{ if(state.transaction&&!document.activeElement?.matches('[data-node-prop],[data-style-prop],[data-color-prop],[data-unit-number],[data-unit-select],[data-token-value],[data-token-color],[data-box-input],[data-shadow-part],[data-shadow-color],[data-bem-block],[data-bem-element],[data-bem-modifiers],[data-custom-classes],[data-component-prop-input]'))endTransaction(); },0);
});

document.addEventListener('keydown',event=>{
  if(event.key==='Alt'&&!state.measureMode){state.measureMode=true;renderSmartGuides();}
  const meta=event.ctrlKey||event.metaKey;
  if(!$('#code-studio')?.hidden){
    if(event.key==='Escape'){event.preventDefault();closeCodeStudio();return;}
    if(meta&&event.key==='Enter'){event.preventDefault();applyCodeStudio();return;}
  }
  if(event.key==='Escape'&&$('#responsive-suite-trigger')?.getAttribute('aria-expanded')==='true'){event.preventDefault();setResponsiveSuiteOpen(false);$('#responsive-suite-trigger')?.focus();return;}
  if(event.key==='Escape'&&$('#zoom-menu-trigger')?.getAttribute('aria-expanded')==='true'){event.preventDefault();setZoomMenuOpen(false);$('#zoom-menu-trigger')?.focus();return;}
  if(meta&&event.key.toLowerCase()==='k'){event.preventDefault();state.commandPaletteOpen?closeCommandPalette():openCommandPalette();return;}
  if(state.commandPaletteOpen){
    if(event.key==='Escape'){event.preventDefault();closeCommandPalette();return;}
    if(event.key==='ArrowDown'){event.preventDefault();moveCommandIndex(1);return;}
    if(event.key==='ArrowUp'){event.preventDefault();moveCommandIndex(-1);return;}
    if(event.key==='Enter'){event.preventDefault();executeActiveCommand();return;}
    return;
  }
  if(state.quickInsertOpen){
    if(event.key==='Escape'){event.preventDefault();closeQuickInsert();return;}
    if(event.key==='ArrowDown'){event.preventDefault();moveQuickInsertIndex(1);return;}
    if(event.key==='ArrowUp'){event.preventDefault();moveQuickInsertIndex(-1);return;}
    if(event.key==='Enter'){event.preventDefault();executeActiveQuickInsert();return;}
  }
  if(event.key==='Escape'&&state.breakpointMenuOpen){event.preventDefault();state.breakpointMenuOpen=false;renderViewport();requestAnimationFrame(()=>document.querySelector('[data-breakpoint-more]')?.focus());return;}
  if(event.key==='Escape'&&state.responsiveCompareOpen){event.preventDefault();closeResponsiveCompare();return;}
  if(event.key==='Escape'&&state.gridBuilder.open){event.preventDefault();closeGridBuilder();return;}
  const editing=event.target.matches('[data-editable][contenteditable=true]');
  if(editing){
    if(event.key==='Escape'){event.preventDefault();finishInlineEdit(true);}
    if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();finishInlineEdit(false);}
    return;
  }
  if(event.target.matches('input,textarea,select'))return;
  if(event.shiftKey&&event.key.toLowerCase()==='a'){event.preventDefault();openQuickInsert();return;}
  if(event.key==='?'){event.preventDefault();openCommandPalette();return;}
  if(event.key.toLowerCase()==='p'&&!meta&&!event.altKey){event.preventDefault();preview();return;}
  if(meta&&event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?redo():undo();}
  if(meta&&event.key.toLowerCase()==='y'){event.preventDefault();redo();}
  else if(meta&&event.key.toLowerCase()==='a'){event.preventDefault();const info=state.selectedId?findInfo(state.nodes,state.selectedId):null;const siblings=info?(info.parentId?find(state.nodes,info.parentId)?.children:state.nodes):state.nodes;state.selectedIds=(siblings||[]).map(node=>node.id);state.selectedId=state.selectedIds[state.selectedIds.length-1]||null;render();}
  else if(meta&&event.key.toLowerCase()==='d'){event.preventDefault();duplicateSelected();}
  else if(meta&&event.shiftKey&&event.key.toLowerCase()==='s'){event.preventDefault();createCheckpoint();}
  else if(meta&&event.key.toLowerCase()==='s'){event.preventDefault();markUnsaved();toast('Proyecto guardado en el workspace');}
  else if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();deleteSelected();}
  else if(event.key==='Escape'){setSelection(null);state.styleState='default';render();}
});

document.addEventListener('keyup',event=>{if(event.key==='Alt'&&state.measureMode){state.measureMode=false;renderSmartGuides();}});
window.addEventListener('blur',()=>{if(state.measureMode){state.measureMode=false;renderSmartGuides();}});

els.assetUpload.addEventListener('change',async event=>{await addAssets(event.target.files);event.target.value='';});
els.assetReplaceUpload?.addEventListener('change',async event=>{const file=event.target.files?.[0];const id=state.assetReplaceId;state.assetReplaceId=null;if(id&&file)await replaceAsset(id,file);event.target.value='';});
svgUploadInput.addEventListener('change',async event=>{ const file=event.target.files?.[0]; if(!file||selected()?.type!=='svg')return; const markup=await file.text(); commit(()=>directNodeProp('svgCode',markup)); event.target.value=''; });
els.jsonUpload.addEventListener('change',async event=>{
  const file=event.target.files[0]; if(!file)return;
  try{
    const result=normalizeOrbitImport(JSON.parse(await file.text()));const data=result.document;const before=snapshot();
    state.nodes=hydrateNodes(data.nodes);state.tokens=data.tokens||clone(defaultTokens);ensureTokenGroups();state.assets=data.assets||[];state.components=data.components||[];state.globalClasses=data.globalClasses||[];state.pageMeta=data.pageMeta||state.pageMeta;state.projectName=data.projectName||file.name.replace(/\.json$/,'');
    if(data.pages?.length){state.pages=clone(data.pages);state.currentPageId=data.currentPageId||state.pages[0].id;const page=state.pages.find(item=>item.id===state.currentPageId)||state.pages[0];state.nodes=hydrateNodes(clone(page.nodes||[]));state.pageMeta=clone(page.meta||state.pageMeta);}else{state.pages=[{id:'page-home',name:'Home',slug:'/',nodes:clone(state.nodes),meta:clone(state.pageMeta)}];state.currentPageId='page-home';}
    state.selectedId=state.nodes[0]?.id||null;state.selectedIds=state.selectedId?[state.selectedId]:[];pushHistory(before);markUnsaved();render();els.projectName.value=state.projectName;toast(`Proyecto importado · ${result.report.nodes} nodos`);
  }catch(error){toast(`No se pudo importar: ${error.message}`);} finally{event.target.value='';}
});

initCoreControls({
  document,
  window,
  state,
  elements: els,
  viewportEngine,
  actions: {
    undo, redo, render, renderCanvas, toast, preview, openResponsiveCompare, closeResponsiveCompare,
    renderResponsiveCompare, toggleRightPanel, toggleLeftPanel, showBreakpointManager, openQuickInsert,
    insertionForClick, openCommandPalette, applyAdaptiveWorkspace, applyLeftPanelChrome, applyRightPanelChrome,
    positionQuickInsert, fitResponsiveCompareFrames, showImportHub, showPageSettings, showAudit, exportProject,
    exportWorkspaceBackup, openProjectDashboard, createCheckpoint, renderProjectDashboard,
    exportAllWorkspaceProjects, cleanupWorkspaceVersions, importWorkspaceBackup,
    toggleFocusView:trigger=>focusView?.toggle(trigger),renderMeasurement:()=>measurementTools?.scheduleRender(),markUnsaved,
    onResize:()=>runtimePerformance.increment('resizeCallbacks')
  }
});
document.addEventListener('click',async event=>{
  const createButton=event.target.closest('[data-create-project]');if(createButton){await createWorkspaceProject(createButton.dataset.createProject||'starter');return;}
  const projectViewButton=event.target.closest('[data-project-view]');if(projectViewButton){state.projectView=projectViewButton.dataset.projectView;renderProjectDashboard();return;}
  if(event.target.closest('#import-project-backup')){els.projectBackupUpload?.click();return;}
  const openButton=event.target.closest('[data-open-project]');if(openButton){await openProjectById(openButton.dataset.openProject);return;}
  const renameButton=event.target.closest('[data-rename-project]');if(renameButton){await renameWorkspaceProject(renameButton.dataset.renameProject);return;}
  const statusButton=event.target.closest('[data-set-project-status]');if(statusButton){await setWorkspaceProjectStatus(statusButton.dataset.projectId,statusButton.dataset.setProjectStatus);return;}
  const tagsButton=event.target.closest('[data-edit-project-tags]');if(tagsButton){await editWorkspaceProjectTags(tagsButton.dataset.editProjectTags);return;}
  const archiveButton=event.target.closest('[data-archive-project]');if(archiveButton){await toggleWorkspaceProjectArchive(archiveButton.dataset.archiveProject);return;}
  const duplicateButton=event.target.closest('[data-duplicate-project]');if(duplicateButton){await duplicateWorkspaceProject(duplicateButton.dataset.duplicateProject);return;}
  const deleteButton=event.target.closest('[data-delete-project]');if(deleteButton){await deleteWorkspaceProject(deleteButton.dataset.deleteProject);return;}
  const exportButton=event.target.closest('[data-export-project-backup]');if(exportButton){await exportWorkspaceBackup(exportButton.dataset.exportProjectBackup);return;}
  const checkpointsButton=event.target.closest('[data-project-checkpoints]');if(checkpointsButton){await showProjectCheckpoints(checkpointsButton.dataset.projectCheckpoints);return;}
  const restoreButton=event.target.closest('[data-restore-checkpoint]');if(restoreButton){await restoreProjectCheckpoint(restoreButton.dataset.checkpointProject,restoreButton.dataset.restoreCheckpoint,restoreButton.dataset.checkpointKind||'manual');return;}
  const deleteCheckpointButton=event.target.closest('[data-delete-checkpoint]');if(deleteCheckpointButton){await deleteProjectCheckpoint(deleteCheckpointButton.dataset.checkpointProject,deleteCheckpointButton.dataset.deleteCheckpoint);return;}
  if(event.target.closest('[data-close-checkpoints]')){closeProjectCheckpoints();return;}
  if(event.target.closest('[data-recover-project]')){await recoverProjectSession();return;}
  if(event.target.closest('[data-dismiss-recovery]')){safeLocalRemove(SESSION_RECOVERY_KEY);renderRecoveryBanner();return;}
  if(event.target.closest('#repair-project-storage')||event.target.closest('#repair-project-storage-secondary')){await repairWorkspaceStorage();return;}
  if(event.target.closest('#dismiss-workspace-health')){$('#workspace-health-banner').hidden=true;return;}
  const menuButton=event.target.closest('[data-project-menu]');if(menuButton){const id=menuButton.dataset.projectMenu;const panel=document.querySelector(`[data-project-menu-panel="${CSS.escape(id)}"]`);const willOpen=!!panel?.hidden;closeProjectMenus({restore:false});if(willOpen&&panel){panel.hidden=false;menuButton.setAttribute('aria-expanded','true');accessibility?.focus.openLayer(panel,{trigger:menuButton,initialFocus:panel.querySelector('button'),modal:false,onEscape:()=>closeProjectMenus()});}return;}
  if(!event.target.closest('.project-card-menu')&&!event.target.closest('[data-project-menu]'))closeProjectMenus({restore:false});
});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&state.currentProjectId)saveActiveProject({silent:true}).catch(()=>{});});
window.addEventListener('pagehide',()=>{if(state.currentProjectId)saveActiveProject({silent:true}).catch(()=>{});});
$('#reset-demo').addEventListener('click',()=>{
  if(!confirm('¿Restablecer la demo y borrar los cambios guardados?'))return;
  commit(()=>{state.nodes=hydrateNodes(clone(starter));state.tokens=clone(defaultTokens);state.assets=[];state.components=[];state.globalClasses=[];state.selectedIds=['hero-title'];state.styleState='default';state.projectName='Untitled landing page';state.pageMeta={language:'es',title:'Untitled landing page',description:'Sitio creado con Orbit Astro Visual Builder'};state.breakpoints={desktopXL:1440,desktop:1200,tablet:1024,mobileL:768,mobile:480};state.breakpointEnabled={desktopXL:true,mobileL:true};state.canvasWidths={desktopXL:1440,desktop:1200,tablet:834,mobileL:640,mobile:390};state.pages=[{id:'page-home',name:'Home',slug:'/',nodes:clone(state.nodes),meta:clone(state.pageMeta)}];state.currentPageId='page-home';state.zoom=.85;state.rulers=true;state.guides=true;state.guidesVisible=true;state.guidesLocked=false;state.snap=true;state.customGuides=[];state.guideUnitVersion=2;state.rightPanelWidth=360;state.rightPanelCollapsed=false;state.leftPanelWidth=380;state.leftPanelCollapsed=false;state.tokenGroupsOpen={colors:true,typography:false,spacing:false,radius:false,shadows:false};state.inspectorMode='essentials';state.inspectorTab='content';state.directEditEnabled=true;state.canvasMinimapVisible=true;},'hero-title');
  els.projectName.value=state.projectName;markUnsaved();toast('Proyecto restablecido');
});

function loadSaved(){
  try{
    const raw=safeLocalGet(STORAGE_KEY)||safeLocalGet(PREVIOUS_STORAGE_KEY)||safeLocalGet(PREVIOUS_STORAGE_KEY_2)||safeLocalGet(LEGACY_STORAGE_KEY);const saved=raw?JSON.parse(raw):null;if(!saved){ensureProjectPages();return;}
    state.tokens=saved.tokens||clone(defaultTokens);ensureTokenGroups();state.assets=saved.assets||[];state.components=(saved.components||[]).map(normalizeComponentDefinition);state.globalClasses=saved.globalClasses||[];state.projectName=saved.projectName||state.projectName;state.breakpoints=saved.breakpoints||state.breakpoints;state.breakpointEnabled=saved.breakpointEnabled||state.breakpointEnabled||{desktopXL:true,mobileL:true};state.canvasWidths=saved.canvasWidths||state.canvasWidths;state.zoom=saved.zoom||state.zoom;state.rulers=saved.rulers===undefined?(saved.guides===undefined?state.rulers:!!saved.guides):!!saved.rulers;state.guides=saved.guides===undefined?state.guides:!!saved.guides;state.guidesVisible=saved.guidesVisible!==false;state.guidesLocked=!!saved.guidesLocked;state.exportSettings=saved.exportSettings||state.exportSettings;state.elementFavorites=saved.elementFavorites||state.elementFavorites;state.elementRecent=saved.elementRecent||state.elementRecent;state.customGuides=(saved.customGuides||state.customGuides).map(guide=>({...guide,position:saved.guideUnitVersion===2?Number(guide.position)||0:(Number(guide.position)||0)/(Number(saved.zoom)||.85)}));state.guideUnitVersion=2;state.rightPanelWidth=saved.rightPanelWidth||state.rightPanelWidth;state.rightPanelCollapsed=!!saved.rightPanelCollapsed;state.leftPanelWidth=saved.leftPanelWidth||state.leftPanelWidth;state.leftPanelCollapsed=!!saved.leftPanelCollapsed;state.tokenGroupsOpen=saved.tokenGroupsOpen||state.tokenGroupsOpen;state.inspectorMode=saved.inspectorMode||state.inspectorMode;state.inspectorTab=['content','design','layout','responsive','interactions','advanced'].includes(saved.inspectorTab)?saved.inspectorTab:state.inspectorTab;state.directEditEnabled=saved.directEditEnabled!==false;
    if(saved.pages?.length){state.pages=clone(saved.pages);state.currentPageId=saved.currentPageId||state.pages[0].id;const page=state.pages.find(item=>item.id===state.currentPageId)||state.pages[0];state.nodes=hydrateNodes(clone(page.nodes||[]));state.pageMeta=clone(page.meta||saved.pageMeta||state.pageMeta);}else if(saved.nodes?.length){state.nodes=hydrateNodes(saved.nodes);state.pageMeta=saved.pageMeta||state.pageMeta;state.pages=[{id:'page-home',name:'Home',slug:'/',nodes:clone(state.nodes),meta:clone(state.pageMeta)}];state.currentPageId='page-home';}
    state.selectedId=saved.selectedId&&find(state.nodes,saved.selectedId)?saved.selectedId:state.nodes[0]?.id||null;state.selectedIds=(saved.selectedIds||[state.selectedId]).filter(id=>find(state.nodes,id));els.projectName.value=state.projectName;
  }catch{}
  preferences?.apply();
  ensureProjectPages();
}

window.addEventListener('error',event=>{console.error('[Orbit runtime]',event.error||event.message);toast('Orbit encontró un error inesperado. Puedes seguir trabajando o deshacer el último cambio.','error',3500);});
window.addEventListener('unhandledrejection',event=>{console.error('[Orbit promise]',event.reason);toast('Una operación no pudo completarse. Revisa la consola si necesitas el detalle.','error',3500);});

window.__ORBIT_QA__={generatedElementsCss,generatedGlobalClassesCss,generatedStyles,generatedAstro,projectFiles,projectDbList,projectDbListRaw,projectDbPut,normalizeProjectRecord,repairWorkspaceStorage,renderProjectDashboard,workspaceSnapshot,normalizeOrbitImport,primarySharedStyleClass,setSharedStyleMode,directStyle,render,setSelection,loadOrbitDocument(data,selectedId=''){
  const result=normalizeOrbitImport(data);const doc=result.document;state.nodes=hydrateNodes(clone(doc.nodes));state.tokens=doc.tokens||clone(defaultTokens);ensureTokenGroups();state.assets=doc.assets||[];state.components=(doc.components||[]).map(normalizeComponentDefinition);state.globalClasses=doc.globalClasses||[];state.projectName=doc.projectName||'QA project';state.pageMeta=doc.pageMeta||state.pageMeta;state.pages=[{id:'page-qa',name:'QA',slug:'/',nodes:clone(state.nodes),meta:clone(state.pageMeta)}];state.currentPageId='page-qa';setSelection(selectedId&&find(state.nodes,selectedId)?selectedId:state.nodes[0]?.id||null);render();return result.report;
}};
setWorkspaceVisibility(true);
bootstrapProjectWorkspace().catch(error=>{
  console.error('[Orbit workspace]',error);state.currentProjectId=null;safeLocalRemove(ACTIVE_PROJECT_KEY);reportWorkspaceHealth(`Orbit mantuvo el inicio disponible: ${error?.message||'error de almacenamiento'}.`);setWorkspaceVisibility(true);els.projectGrid.innerHTML='';els.projectEmpty.hidden=false;renderWorkspaceHealth();renderRecoveryBanner();toast('El inicio se abrió en modo seguro','error',3500);
});
})();