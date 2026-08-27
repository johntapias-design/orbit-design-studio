/** Orbit reusable component library: cross-project packages and resilient local persistence. */
const ORBIT_COMPONENT_LIBRARY_DB = 'orbit-reusable-components-v1';
const ORBIT_COMPONENT_LIBRARY_STORE = 'components';
const ORBIT_COMPONENT_LIBRARY_FALLBACK = 'orbit:reusable-components:v1';
const ORBIT_COMPONENT_CATEGORIES = Object.freeze(['headers','buttons','forms','sections','blocks']);
const ORBIT_COMPONENT_TOKEN_PREFIXES = Object.freeze({ colors: 'color', typography: 'font', spacing: 'space', radius: 'radius', shadows: 'shadow' });

function orbitComponentClone(value) { return JSON.parse(JSON.stringify(value)); }
function orbitComponentObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
function orbitComponentSlug(value = 'component') { return String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'component'; }
function orbitComponentCategory(node = {}) {
  const source = JSON.stringify({ type: node.type, name: node.name, htmlTag: node.htmlTag, children: node.children }).toLowerCase();
  if (node.type === 'button' || node.type === 'link') return 'buttons';
  if (/"htmltag":"(?:header|nav)"|navbar|navigation|header|menu principal/.test(source.slice(0, 900))) return 'headers';
  if (/"type":"(?:form|input|inputfield|textarea|textareafield|select|selectfield|checkbox|radio)"|formulario|contact form/.test(source)) return 'forms';
  if (node.type === 'section' || node.htmlTag === 'section') return 'sections';
  return 'blocks';
}
function orbitComponentCleanTree(node) {
  const next = orbitComponentClone(node || {});
  ['componentRef','componentPath','componentSource','componentRoot','componentVariantId','componentOverrides'].forEach(key => delete next[key]);
  if (Array.isArray(next.children)) next.children = next.children.map(orbitComponentCleanTree);
  return next;
}
function orbitComponentTokenRefs(tokens = {}) {
  const refs = [];
  Object.entries(tokens || {}).forEach(([category, group]) => Object.entries(orbitComponentObject(group) ? group : {}).forEach(([key, token]) => {
    refs.push({ category, key, token, names: [...new Set([`--${ORBIT_COMPONENT_TOKEN_PREFIXES[category] || category}-${orbitComponentSlug(key)}`, token?.cssVar].filter(Boolean))] });
  }));
  return refs;
}
function createReusableComponentPackage({ id, node, projectName = '', globalClasses = [], tokens = {}, assets = [], name = '', category = '', now = Date.now() } = {}) {
  if (!orbitComponentObject(node)) throw new Error('Selecciona un elemento válido para guardarlo.');
  const tree = orbitComponentCleanTree(node); const classIds = new Set(); const assetSources = new Set();
  (function walk(item) { (item.globalClassIds || []).forEach(value => classIds.add(String(value))); if (item.styleClassId) classIds.add(String(item.styleClassId)); if (item.src) assetSources.add(String(item.src)); if (item.backgroundConfig?.imageSrc) assetSources.add(String(item.backgroundConfig.imageSrc)); (item.children || []).forEach(walk); })(tree);
  const classes = (globalClasses || []).filter(item => classIds.has(String(item.id))).map(orbitComponentClone);
  const searchable = JSON.stringify({ tree, classes }); const packageTokens = {};
  orbitComponentTokenRefs(tokens).forEach(entry => { if (entry.names.some(ref => searchable.includes(`var(${ref})`))) { if (!packageTokens[entry.category]) packageTokens[entry.category] = {}; packageTokens[entry.category][entry.key] = orbitComponentClone(entry.token); } });
  const packageAssets = (assets || []).filter(item => { const src = String(item.src || ''); return src && (assetSources.has(src) || searchable.includes(src)); }).map(orbitComponentClone);
  return { format: 'orbit-reusable-component', version: 1, id: String(id || `library-${now}`), name: String(name || tree.name || 'Componente reutilizable'), category: ORBIT_COMPONENT_CATEGORIES.includes(category) ? category : orbitComponentCategory(tree), sourceProject: String(projectName || 'Proyecto Orbit'), tree, globalClasses: classes, tokens: packageTokens, assets: packageAssets, createdAt: now, updatedAt: now };
}
function orbitComponentReplaceDeep(value, replacements) {
  if (typeof value === 'string') { let output = value; replacements.forEach(([from, to]) => { output = output.split(`var(${from})`).join(`var(${to})`); }); return output; }
  if (Array.isArray(value)) return value.map(item => orbitComponentReplaceDeep(item, replacements));
  if (orbitComponentObject(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, orbitComponentReplaceDeep(item, replacements)]));
  return value;
}
function prepareReusableComponentImport(entry, project = {}, { uid = prefix => `${prefix}-${Math.random().toString(36).slice(2, 9)}` } = {}) {
  if (entry?.format !== 'orbit-reusable-component' || !orbitComponentObject(entry.tree)) throw new Error('El componente compartido no es compatible.');
  const targetTokens = orbitComponentClone(project.tokens || {}); const tokenReplacements = []; let tokensAdded = 0;
  Object.entries(entry.tokens || {}).forEach(([category, group]) => { if (!orbitComponentObject(targetTokens[category])) targetTokens[category] = {}; Object.entries(group || {}).forEach(([key, token]) => {
    let nextKey = key; const current = targetTokens[category][nextKey];
    if (current && JSON.stringify(current) !== JSON.stringify(token)) { const base = `${key}-${orbitComponentSlug(entry.name)}`; nextKey = base; let suffix = 2; while (targetTokens[category][nextKey]) nextKey = `${base}-${suffix++}`; }
    if (!targetTokens[category][nextKey]) { targetTokens[category][nextKey] = orbitComponentClone(token); tokensAdded += 1; }
    if (nextKey !== key) { const prefix = ORBIT_COMPONENT_TOKEN_PREFIXES[category] || category; tokenReplacements.push([`--${prefix}-${orbitComponentSlug(key)}`, `--${prefix}-${orbitComponentSlug(nextKey)}`]); if (token?.cssVar) { const nextCssVar = `${token.cssVar}-${orbitComponentSlug(entry.name)}`; targetTokens[category][nextKey].cssVar = nextCssVar; tokenReplacements.push([token.cssVar, nextCssVar]); } }
  }); });
  let tree = orbitComponentReplaceDeep(orbitComponentClone(entry.tree), tokenReplacements); const incomingClasses = orbitComponentReplaceDeep(orbitComponentClone(entry.globalClasses || []), tokenReplacements); const targetClasses = orbitComponentClone(project.globalClasses || []); const classRemap = new Map(); let classesAdded = 0;
  incomingClasses.forEach(item => { const same = targetClasses.find(existing => existing.name === item.name && JSON.stringify({ styles: existing.styles || {}, states: existing.states || {} }) === JSON.stringify({ styles: item.styles || {}, states: item.states || {} })); if (same) { classRemap.set(item.id, same.id); return; } const next = { ...item }; if (!next.id || targetClasses.some(existing => existing.id === next.id)) next.id = uid('class'); let nextName = next.name || 'shared'; const base = nextName; let suffix = 2; while (targetClasses.some(existing => existing.name === nextName)) nextName = `${base}-${suffix++}`; next.name = nextName; targetClasses.push(next); classRemap.set(item.id, next.id); classesAdded += 1; });
  (function rewriteClasses(node) { node.globalClassIds = (node.globalClassIds || []).map(id => classRemap.get(id) || id); if (node.styleClassId) node.styleClassId = classRemap.get(node.styleClassId) || node.styleClassId; (node.children || []).forEach(rewriteClasses); })(tree);
  const targetAssets = orbitComponentClone(project.assets || []); let assetsAdded = 0; (entry.assets || []).forEach(asset => { if (!targetAssets.some(existing => existing.src === asset.src)) { targetAssets.push({ ...orbitComponentClone(asset), id: targetAssets.some(existing => existing.id === asset.id) ? uid('asset') : asset.id || uid('asset') }); assetsAdded += 1; } });
  return { tree, tokens: targetTokens, globalClasses: targetClasses, assets: targetAssets, report: { tokensAdded, classesAdded, assetsAdded } };
}
function validateReusableComponentEntry(value) { return orbitComponentObject(value) && value.format === 'orbit-reusable-component' && value.version === 1 && typeof value.id === 'string' && orbitComponentObject(value.tree); }
function createReusableComponentStorage({ window } = {}) {
  let memory = [];
  const fallbackRead = () => { try { const value = JSON.parse(window.localStorage.getItem(ORBIT_COMPONENT_LIBRARY_FALLBACK) || '[]'); return Array.isArray(value) ? value.filter(validateReusableComponentEntry) : []; } catch { return []; } };
  const fallbackWrite = entries => { memory = entries.slice(0, 200); try { window.localStorage.setItem(ORBIT_COMPONENT_LIBRARY_FALLBACK, JSON.stringify(memory)); } catch {} return memory; };
  const open = () => new Promise((resolve, reject) => { if (!window?.indexedDB) { reject(new Error('IndexedDB no disponible')); return; } const request = window.indexedDB.open(ORBIT_COMPONENT_LIBRARY_DB, 1); request.onupgradeneeded = () => { const db = request.result; if (!db.objectStoreNames.contains(ORBIT_COMPONENT_LIBRARY_STORE)) { const store = db.createObjectStore(ORBIT_COMPONENT_LIBRARY_STORE, { keyPath: 'id' }); store.createIndex('updatedAt', 'updatedAt'); store.createIndex('category', 'category'); } }; request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  const requestResult = request => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  async function list() { try { const db = await open(); const tx = db.transaction(ORBIT_COMPONENT_LIBRARY_STORE, 'readonly'); const entries = await requestResult(tx.objectStore(ORBIT_COMPONENT_LIBRARY_STORE).getAll()); return entries.filter(validateReusableComponentEntry).sort((a, b) => b.updatedAt - a.updatedAt); } catch { memory = fallbackRead(); return [...memory].sort((a, b) => b.updatedAt - a.updatedAt); } }
  async function put(entry) { if (!validateReusableComponentEntry(entry)) throw new Error('El componente no cumple el formato compartido.'); try { const db = await open(); const tx = db.transaction(ORBIT_COMPONENT_LIBRARY_STORE, 'readwrite'); await requestResult(tx.objectStore(ORBIT_COMPONENT_LIBRARY_STORE).put(orbitComponentClone(entry))); return entry; } catch { const entries = await list(); fallbackWrite([entry, ...entries.filter(item => item.id !== entry.id)]); return entry; } }
  async function remove(id) { try { const db = await open(); const tx = db.transaction(ORBIT_COMPONENT_LIBRARY_STORE, 'readwrite'); await requestResult(tx.objectStore(ORBIT_COMPONENT_LIBRARY_STORE).delete(id)); } catch { fallbackWrite((await list()).filter(item => item.id !== id)); } }
  return { list, put, remove };
}
