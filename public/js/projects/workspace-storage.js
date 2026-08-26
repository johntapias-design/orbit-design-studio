/**
 * Resilient project persistence for Orbit.
 * Keeps the project dashboard available even when IndexedDB or legacy records fail.
 */
function createWorkspaceStorage({
  window,
  document,
  state,
  constants,
  clone,
  uid,
  slug,
  defaultProjectSnapshot,
  projectRecordFromSnapshot,
}) {
  const {
    storageKey,
    dbName,
    dbVersion,
    storeName,
  } = constants;

  let memoryProjects = [];
  let dbPromise = null;
  let healthIssues = [];

  const safeGet = key => {
    try { return window.localStorage.getItem(key); } catch { return null; }
  };
  const safeSet = (key, value) => {
    try { window.localStorage.setItem(key, value); return true; } catch { return false; }
  };
  const isRecord = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
  const safeClone = (value, fallback = null) => {
    try { return typeof structuredClone === 'function' ? structuredClone(value) : clone(value); } catch { return fallback; }
  };

  function reportHealth(message) {
    const text = String(message || '').trim();
    if (text && !healthIssues.includes(text)) healthIssues.push(text);
    state.workspaceNeedsRepair = healthIssues.length > 0;
  }

  function clearHealth() {
    healthIssues = [];
    state.workspaceNeedsRepair = false;
  }

  function renderHealth() {
    const banner = document.querySelector('#workspace-health-banner');
    if (!banner) return;
    const visible = healthIssues.length > 0;
    banner.hidden = !visible;
    if (!visible) return;
    const title = document.querySelector('#workspace-health-title');
    const copy = document.querySelector('#workspace-health-copy');
    if (title) title.textContent = 'Orbit protegió tus proyectos';
    if (copy) copy.textContent = healthIssues.length === 1
      ? healthIssues[0]
      : `${healthIssues.length} registros necesitaron protección. Puedes repararlos sin borrar tus proyectos.`;
  }

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window) || !window.indexedDB) {
        reject(new Error('IndexedDB no está disponible'));
        return;
      }
      const request = window.indexedDB.open(dbName, dbVersion);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt');
          store.createIndex('name', 'name');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('No se pudo abrir la base de proyectos'));
      request.onblocked = () => reject(new Error('La base de proyectos está bloqueada por otra pestaña'));
    });
    dbPromise.catch(() => { dbPromise = null; });
    return dbPromise;
  }

  const requestResult = request => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  function normalizePage(page, index, fallbackMeta) {
    const source = isRecord(page) ? safeClone(page, {}) : {};
    const id = typeof source.id === 'string' && source.id.trim() ? source.id : `page-${index + 1}`;
    const name = typeof source.name === 'string' && source.name.trim() ? source.name : `Página ${index + 1}`;
    const rawSlug = typeof source.slug === 'string' && source.slug.trim() ? source.slug : index === 0 ? '/' : `/${slug(name)}`;
    return {
      id,
      name,
      slug: rawSlug.startsWith('/') ? rawSlug : `/${rawSlug}`,
      nodes: Array.isArray(source.nodes) ? source.nodes : [],
      meta: isRecord(source.meta) ? source.meta : clone(fallbackMeta),
    };
  }

  function normalizeSnapshot(snapshot, name = 'Proyecto recuperado') {
    const base = defaultProjectSnapshot('blank', name);
    const source = isRecord(snapshot) ? safeClone(snapshot, {}) : {};
    const meta = isRecord(source.pageMeta) ? source.pageMeta : base.pageMeta;
    let pages = Array.isArray(source.pages)
      ? source.pages.map((page, index) => normalizePage(page, index, meta))
      : [];
    if (!pages.length && Array.isArray(source.nodes)) {
      pages = [normalizePage({ id: 'page-home', name: 'Home', slug: '/', nodes: source.nodes, meta }, 0, meta)];
    }
    if (!pages.length) pages = clone(base.pages);
    const currentPageId = typeof source.currentPageId === 'string' && pages.some(page => page.id === source.currentPageId)
      ? source.currentPageId
      : pages[0].id;
    const currentPage = pages.find(page => page.id === currentPageId) || pages[0];
    return {
      ...base,
      ...source,
      version: normalizeOrbitDocumentVersion(source.version),
      projectName: typeof source.projectName === 'string' && source.projectName.trim() ? source.projectName : name,
      pageMeta: isRecord(currentPage.meta) ? currentPage.meta : clone(meta),
      pages,
      currentPageId,
      nodes: Array.isArray(currentPage.nodes) ? currentPage.nodes : [],
      tokens: isRecord(source.tokens) ? source.tokens : clone(base.tokens),
      assets: Array.isArray(source.assets) ? source.assets : [],
      components: Array.isArray(source.components) ? source.components : [],
      globalClasses: Array.isArray(source.globalClasses) ? source.globalClasses : [],
      breakpoints: isRecord(source.breakpoints) ? source.breakpoints : clone(base.breakpoints),
      breakpointEnabled: isRecord(source.breakpointEnabled) ? source.breakpointEnabled : clone(base.breakpointEnabled),
      canvasWidths: isRecord(source.canvasWidths) ? source.canvasWidths : clone(base.canvasWidths),
      selectedIds: Array.isArray(source.selectedIds) ? source.selectedIds : [],
      customGuides: Array.isArray(source.customGuides) ? source.customGuides : [],
      elementFavorites: Array.isArray(source.elementFavorites) ? source.elementFavorites : clone(base.elementFavorites),
      elementRecent: Array.isArray(source.elementRecent) ? source.elementRecent : [],
      responsiveAuditIgnored: Array.isArray(source.responsiveAuditIgnored) ? source.responsiveAuditIgnored : [],
      responsiveCompareZoom: isRecord(source.responsiveCompareZoom) ? source.responsiveCompareZoom : clone(base.responsiveCompareZoom),
      exportSettings: isRecord(source.exportSettings) ? source.exportSettings : clone(base.exportSettings),
      tokenGroupsOpen: isRecord(source.tokenGroupsOpen) ? source.tokenGroupsOpen : clone(base.tokenGroupsOpen),
      collapsed: isRecord(source.collapsed) ? source.collapsed : {},
    };
  }

  function normalizeVersions(entries = []) {
    if (!Array.isArray(entries)) return [];
    return entries.map((entry, index) => {
      if (!isRecord(entry) || !isRecord(entry.snapshot)) return null;
      const name = typeof entry.name === 'string' && entry.name.trim() ? entry.name : `Versión ${index + 1}`;
      return {
        ...entry,
        id: typeof entry.id === 'string' && entry.id ? entry.id : uid('version'),
        name,
        createdAt: Number(entry.createdAt) || Date.now(),
        snapshot: normalizeSnapshot(entry.snapshot, name),
      };
    }).filter(Boolean).slice(0, 20);
  }

  function normalizeRecord(record, { fallbackId = 'project-recovered' } = {}) {
    const source = isRecord(record) ? safeClone(record, {}) : {};
    const id = typeof source.id === 'string' && source.id.trim() ? source.id : fallbackId;
    const name = typeof source.name === 'string' && source.name.trim()
      ? source.name
      : source.snapshot?.projectName || 'Proyecto recuperado';
    const validSnapshot = isRecord(source.snapshot) && (Array.isArray(source.snapshot.pages) || Array.isArray(source.snapshot.nodes));
    const snapshot = normalizeSnapshot(source.snapshot || source, name);
    if (!validSnapshot) reportHealth(`“${name}” tenía una estructura antigua o incompleta y se abrió en modo seguro.`);
    return projectRecordFromSnapshot(id, name, snapshot, {
      ...source,
      createdAt: Number(source.createdAt) || Date.now(),
      updatedAt: Number(source.updatedAt) || Date.now(),
      status: ['progress', 'review', 'done'].includes(source.status) ? source.status : 'progress',
      tags: Array.isArray(source.tags) ? source.tags.map(tag => String(tag).trim()).filter(Boolean).slice(0, 8) : [],
      archived: Boolean(source.archived),
      checkpoints: normalizeVersions(source.checkpoints),
      autoVersions: normalizeVersions(source.autoVersions),
      repaired: !validSnapshot || Boolean(source.repaired),
    });
  }

  async function listRaw() {
    try {
      const db = await openDb();
      const tx = db.transaction(storeName, 'readonly');
      const result = await requestResult(tx.objectStore(storeName).getAll());
      state.projectDbReady = true;
      return Array.isArray(result) ? result : [];
    } catch (error) {
      state.projectDbReady = false;
      reportHealth('El almacenamiento principal no respondió. Orbit mantiene disponible el inicio usando el respaldo local.');
      const raw = safeGet(`${storageKey}:projects`);
      if (raw) {
        try {
          const saved = JSON.parse(raw);
          if (Array.isArray(saved)) memoryProjects = saved;
          else reportHealth('El respaldo local tenía un formato antiguo y fue aislado.');
        } catch {
          reportHealth('El respaldo local estaba dañado y fue aislado para proteger el inicio.');
        }
      }
      return Array.isArray(memoryProjects) ? memoryProjects : [];
    }
  }

  async function list() {
    const rawList = await listRaw();
    const normalized = [];
    rawList.forEach((raw, index) => {
      try { normalized.push(normalizeRecord(raw, { fallbackId: `recovered-${index + 1}` })); }
      catch (error) { reportHealth(`Un proyecto no pudo leerse por completo y fue aislado: ${error?.message || 'estructura inválida'}.`); }
    });
    return normalized.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  async function get(id) {
    try {
      const db = await openDb();
      const tx = db.transaction(storeName, 'readonly');
      const raw = await requestResult(tx.objectStore(storeName).get(id));
      return raw ? normalizeRecord(raw, { fallbackId: id }) : null;
    } catch {
      return (await list()).find(item => item.id === id) || null;
    }
  }

  async function put(record) {
    const normalized = normalizeRecord(record, { fallbackId: record?.id || uid('project') });
    try {
      const db = await openDb();
      const tx = db.transaction(storeName, 'readwrite');
      await requestResult(tx.objectStore(storeName).put(normalized));
      state.projectDbReady = true;
      return normalized;
    } catch {
      state.projectDbReady = false;
      reportHealth('Orbit guardó el proyecto en el respaldo local porque IndexedDB no estaba disponible.');
      const current = await list();
      const next = [normalized, ...current.filter(item => item.id !== normalized.id)];
      memoryProjects = next;
      safeSet(`${storageKey}:projects`, JSON.stringify(next));
      return normalized;
    }
  }

  async function remove(id) {
    try {
      const db = await openDb();
      const tx = db.transaction(storeName, 'readwrite');
      await requestResult(tx.objectStore(storeName).delete(id));
    } catch {
      const current = await list();
      memoryProjects = current.filter(item => item.id !== id);
      safeSet(`${storageKey}:projects`, JSON.stringify(memoryProjects));
    }
  }

  function setMemoryProjects(projects) {
    memoryProjects = Array.isArray(projects) ? projects : [];
    safeSet(`${storageKey}:projects`, JSON.stringify(memoryProjects));
  }

  return {
    projectDbGet: get,
    projectDbList: list,
    projectDbListRaw: listRaw,
    projectDbPut: put,
    projectDbDelete: remove,
    normalizeProjectRecord: normalizeRecord,
    normalizeProjectSnapshot: normalizeSnapshot,
    normalizeProjectVersions: normalizeVersions,
    reportWorkspaceHealth: reportHealth,
    clearWorkspaceHealth: clearHealth,
    renderWorkspaceHealth: renderHealth,
    setMemoryProjects,
    getWorkspaceHealthIssues: () => [...healthIssues],
  };
}
