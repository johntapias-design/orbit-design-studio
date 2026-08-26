/**
 * Orbit state store.
 *
 * Keeps the application state in one observable proxy while preserving the
 * existing mutation API during the incremental modular migration.
 */
let activeState = null;
const subscribers = new Map();
let batchDepth = 0;
const pendingKeys = new Set();

function notify(key, value, previous, meta = {}) {
  if (batchDepth) {
    pendingKeys.add(key);
    return;
  }
  const payload = { key, value, previous, state: activeState, meta };
  subscribers.get(key)?.forEach(listener => listener(payload));
  subscribers.get('*')?.forEach(listener => listener(payload));
}

function createOrbitState({ clone, hydrateNodes, starter, defaultTokens }) {
  if (activeState) return activeState;
  const target = {
    version:currentOrbitDocumentVersion(),
    projectName:'Untitled landing page',
    nodes:hydrateNodes(clone(starter)),
    tokens:clone(defaultTokens),
    assets:[],
    components:[],
    globalClasses:[],
    pages:[],
    currentPageId:'page-home',
    selectedId:'hero-title',
    selectedIds:['hero-title'],
    breakpoint:'desktop',
    breakpoints:{desktopXL:1440,desktop:1200,tablet:1024,mobileL:768,mobile:480},
    breakpointEnabled:{desktopXL:true,mobileL:true},
    canvasWidths:{...DEFAULT_CANVAS_WIDTHS},
    zoom:.85,
    theme:'dark',
    focusView:false,
    canvasMinimapVisible:true,
    grid:false,
    rulers:true,
    guides:true,
    guidesVisible:true,
    guidesLocked:false,
    guideUnitVersion:2,
    customGuides:[],
    snap:true,
    styleState:'default',
    layerSearch:'',
    elementSearch:'',
    elementCategory:'all',
    elementView:'all',
    elementFavorites:['section','container','heading','text','button','image'],
    elementRecent:[],
    tokenGroupsOpen:{colors:true,typography:false,spacing:false,radius:false,shadows:false},
    tab:'pages',
    previewMode:false,
    history:[],future:[],
    collapsed:{},
    openSections:{content:true,carousel:true,responsive:true,semantic:true,classes:true,layout:true,spacing:true,type:true,appearance:true,interaction:true,accessibility:false},
    drop:null,
    transaction:null,
    inlineEdit:null,
    resizing:null,
    boxLinks:{margin:'none',padding:'none'},
    layoutPanels:{flex:true,grid:false,inline:false,size:true,position:false,item:true},
    layoutNodeId:null,
    gridBuilder:{open:false,nodeId:null},
    pageMeta:{language:'es',title:'Untitled landing page',description:'Sitio creado con Orbit Astro Visual Builder'},
    importMode:'design-system',
    pendingImport:null,
    aiImportReport:null,
    exportSettings:{...ORBIT_PRODUCTION_EXPORT_DEFAULTS},
    rightPanelWidth:360,
    rightPanelCollapsed:false,
    rightPanelResizing:null,
    leftPanelWidth:380,
    leftPanelCollapsed:false,
    leftPanelResizing:null,
    inspectorMode:'advanced',
    inspectorTab:'content',
    commandPaletteOpen:false,
    commandQuery:'',
    commandIndex:0,
    quickInsertOpen:false,
    quickInsertQuery:'',
    quickInsertIndex:0,
    quickInsertPlacement:null,
    directEditEnabled:true,
    measureMode:false,
    interfaceProfile:'wide',
    previousInterfaceProfile:null,
    adaptiveUserTouched:false,
    adaptiveTabletAutoCollapsed:false,
    preTabletPanelState:null,
    currentProjectId:null,
    projectDashboardOpen:true,
    projectSearch:'',
    projectSort:'recent',
    projectView:'grid',
    projectShowArchived:false,
    assetSearch:'',
    assetFilter:'all',
    componentSearch:'',
    componentFilter:'all',
    assetReplaceId:null,
    responsiveCompareOpen:false,
    responsiveCompareSync:true,
    responsiveCompareSelected:true,
    responsiveCompareZoom:{desktop:1,tablet:1,mobile:1},
    breakpointMenuOpen:false,
    responsiveAuditIgnored:[],
    checkpointProjectId:null,
    projectDbReady:false,
    projectSaving:false
  };
  activeState = new Proxy(target, {
    set(object, key, value) {
      const previous = object[key];
      if (Object.is(previous, value)) return true;
      object[key] = value;
      notify(String(key), value, previous, { source: 'direct' });
      return true;
    }
  });
  return activeState;
}

function getState() {
  if (!activeState) throw new Error('Orbit state has not been initialized.');
  return activeState;
}

function setState(patch, meta = { source: 'setState' }) {
  const state = getState();
  batchState(() => {
    Object.entries(patch || {}).forEach(([key, value]) => {
      const previous = state[key];
      if (Object.is(previous, value)) return;
      Reflect.set(state, key, value);
      if (batchDepth) pendingKeys.add(key);
    });
  }, meta);
  return state;
}

function batchState(mutator, meta = { source: 'batch' }) {
  const state = getState();
  batchDepth += 1;
  try {
    return mutator(state);
  } finally {
    batchDepth -= 1;
    if (!batchDepth && pendingKeys.size) {
      const keys = [...pendingKeys];
      pendingKeys.clear();
      const payload = { key: keys.length === 1 ? keys[0] : '*', keys, state, meta };
      keys.forEach(key => subscribers.get(key)?.forEach(listener => listener(payload)));
      subscribers.get('*')?.forEach(listener => listener(payload));
    }
  }
}

function subscribe(keys, listener) {
  const list = Array.isArray(keys) ? keys : [keys];
  list.forEach(key => {
    const bucket = subscribers.get(key) || new Set();
    bucket.add(listener);
    subscribers.set(key, bucket);
  });
  return () => list.forEach(key => subscribers.get(key)?.delete(listener));
}
