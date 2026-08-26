/** Orbit JSON Studio: parsing, v13 migration, validation, repair and sandboxed preview. */
const ORBIT_JSON_VERSION = 13;
const ORBIT_JSON_NODE_TYPES = Object.freeze(['section','container','heading','text','button','image','svg','card','carousel','slide','divider','spacer']);
const ORBIT_JSON_ROOT_KEYS = new Set(['version','projectName','pageMeta','tokens','assets','components','globalClasses','nodes']);
const ORBIT_JSON_NODE_KEYS = new Set(['id','type','name','content','src','alt','href','svgCode','ariaLabel','level','globalClassIds','styleClassId','styleEditMode','componentRef','componentSource','styles','states','backgroundConfig','swiper','children']);
const ORBIT_JSON_TOKEN_GROUPS = Object.freeze(['colors','typography','spacing','radius','shadows']);

function orbitJsonClone(value) { return JSON.parse(JSON.stringify(value)); }
function orbitJsonIsObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
function orbitJsonSlug(value = 'item') {
  return String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
}
function orbitJsonIssue(severity, code, path, message, repairable = true) { return { severity, code, path, message, repairable }; }

function parseOrbitJsonSource(raw = '') {
  const source = String(raw || '');
  try { return { ok: true, value: JSON.parse(source), source }; }
  catch (error) {
    const message = String(error?.message || '');
    let position = Number(message.match(/position\s+(\d+)/i)?.[1]);
    if (!Number.isFinite(position)) {
      const token = message.match(/Unexpected token ['"](.+?)['"]/i)?.[1];
      if (token) position = source.indexOf(token);
      else if (/unexpected end/i.test(message)) position = source.length;
    }
    let line = 1; let column = 1;
    if (Number.isFinite(position)) {
      const prefix = source.slice(0, position); line = prefix.split('\n').length; column = position - prefix.lastIndexOf('\n');
    }
    return { ok: false, value: null, source, error: { message: error?.message || 'JSON inválido', position: Number.isFinite(position) ? position : null, line, column } };
  }
}

function migrateOrbitJsonToV13(input) {
  const actions = [];
  const rootWasArray = Array.isArray(input);
  const source = rootWasArray ? { nodes: input } : (orbitJsonIsObject(input) ? orbitJsonClone(input) : null);
  if (!source) throw new Error('La raíz debe ser un objeto JSON o un arreglo de nodos.');
  const detectedVersion = rootWasArray ? 0 : Math.max(0, Number(source.version) || 0);
  if (detectedVersion > ORBIT_JSON_VERSION) throw new Error(`Orbit JSON v${detectedVersion} es más reciente que esta versión del editor.`);
  if (detectedVersion && detectedVersion !== 12 && detectedVersion !== ORBIT_JSON_VERSION) throw new Error(`Orbit JSON v${detectedVersion} no tiene una ruta de migración compatible.`);
  if (rootWasArray) actions.push('Raíz legacy convertida en documento Orbit.');
  if (detectedVersion === 12) actions.push('Documento migrado de v12 a v13.');
  if (!detectedVersion && !rootWasArray) actions.push('Documento sin versión identificado como formato legacy.');

  const document = orbitJsonClone(source);
  document.version = ORBIT_JSON_VERSION;
  if (!String(document.projectName || '').trim()) { document.projectName = 'Proyecto migrado'; actions.push('Nombre de proyecto predeterminado añadido.'); }
  if (!orbitJsonIsObject(document.pageMeta)) { document.pageMeta = { language: 'es', title: document.projectName, description: '' }; actions.push('Metadatos de página v13 añadidos.'); }
  if (!orbitJsonIsObject(document.tokens)) { document.tokens = {}; actions.push('Colección de tokens inicializada.'); }
  ORBIT_JSON_TOKEN_GROUPS.forEach(group => { if (!orbitJsonIsObject(document.tokens[group])) document.tokens[group] = {}; });
  for (const key of ['assets','components','globalClasses']) if (!Array.isArray(document[key])) { document[key] = []; actions.push(`${key} inicializado para v13.`); }
  if (Array.isArray(document.assets)) document.assets = document.assets.map(asset => {
    if (!orbitJsonIsObject(asset)) return asset;
    const type = String(asset.type || 'image');
    if (type.startsWith('image/svg')) return { ...asset, type: 'svg' };
    if (type.startsWith('image/')) return { ...asset, type: 'image' };
    return asset;
  });
  const migrateNodes = nodes => (Array.isArray(nodes) ? nodes : []).map(node => {
    if (!orbitJsonIsObject(node)) return node;
    const next = { ...node };
    if (next.type === 'heading' && !next.level && /^h[1-6]$/.test(next.tag || '')) next.level = Number(next.tag.slice(1));
    if (Array.isArray(next.children)) next.children = migrateNodes(next.children);
    return next;
  });
  if (Array.isArray(document.nodes)) document.nodes = migrateNodes(document.nodes);
  return { document, fromVersion: detectedVersion || 'legacy', toVersion: ORBIT_JSON_VERSION, migrated: detectedVersion !== ORBIT_JSON_VERSION, actions };
}

function validateOrbitJsonV13(document) {
  const errors = []; const warnings = []; const nodeIds = new Set();
  const addError = (code, path, message, repairable = true) => errors.push(orbitJsonIssue('error', code, path, message, repairable));
  const addWarning = (code, path, message, repairable = true) => warnings.push(orbitJsonIssue('warning', code, path, message, repairable));
  if (!orbitJsonIsObject(document)) return { valid: false, repairable: false, errors: [orbitJsonIssue('error','root.type','$','La raíz debe ser un objeto.',false)], warnings, stats: { nodes: 0 } };
  if (document.version !== ORBIT_JSON_VERSION) addError('version.const', '$.version', 'La versión debe ser 13.');
  if (!String(document.projectName || '').trim()) addError('projectName.required', '$.projectName', 'projectName es obligatorio.');
  if (!orbitJsonIsObject(document.pageMeta)) addError('pageMeta.type', '$.pageMeta', 'pageMeta debe ser un objeto.');
  else {
    if (!String(document.pageMeta.language || '').trim()) addError('pageMeta.language', '$.pageMeta.language', 'language es obligatorio.');
    if (!String(document.pageMeta.title || '').trim()) addError('pageMeta.title', '$.pageMeta.title', 'title es obligatorio.');
    if (typeof document.pageMeta.description !== 'string') addError('pageMeta.description', '$.pageMeta.description', 'description debe ser texto.');
  }
  if (!orbitJsonIsObject(document.tokens)) addError('tokens.type', '$.tokens', 'tokens debe ser un objeto.');
  else ORBIT_JSON_TOKEN_GROUPS.forEach(group => { if (!orbitJsonIsObject(document.tokens[group])) addError('tokens.group', `$.tokens.${group}`, `${group} debe ser un objeto.`); });
  for (const key of ['assets','components','globalClasses']) if (!Array.isArray(document[key])) addError(`${key}.type`, `$.${key}`, `${key} debe ser un arreglo.`);
  Object.keys(document).filter(key => !ORBIT_JSON_ROOT_KEYS.has(key)).forEach(key => addError('root.additional', `$.${key}`, `La propiedad raíz “${key}” no pertenece al contrato v13.`));
  if (!Array.isArray(document.nodes)) addError('nodes.type', '$.nodes', 'nodes debe ser un arreglo.', false);
  else if (!document.nodes.length) addError('nodes.empty', '$.nodes', 'El documento necesita al menos un nodo.');

  let nodeCount = 0;
  function inspectNode(node, path) {
    nodeCount += 1;
    if (!orbitJsonIsObject(node)) { addError('node.type', path, 'El nodo debe ser un objeto.'); return; }
    const id = String(node.id || '');
    if (!id) addError('node.id.required', `${path}.id`, 'El nodo necesita un ID.');
    else if (nodeIds.has(id)) addError('node.id.duplicate', `${path}.id`, `El ID “${id}” está duplicado.`);
    else nodeIds.add(id);
    if (!ORBIT_JSON_NODE_TYPES.includes(node.type)) addError('node.type.unsupported', `${path}.type`, `El tipo “${node.type || 'vacío'}” no es compatible.`);
    if (node.styles !== undefined && !orbitJsonIsObject(node.styles)) addError('node.styles.type', `${path}.styles`, 'styles debe ser un objeto.');
    if (node.states !== undefined && !orbitJsonIsObject(node.states)) addError('node.states.type', `${path}.states`, 'states debe ser un objeto.');
    Object.keys(node).filter(key => !ORBIT_JSON_NODE_KEYS.has(key)).forEach(key => addError('node.additional', `${path}.${key}`, `La propiedad “${key}” no pertenece al contrato de nodo v13.`));
    if (node.children !== undefined && !Array.isArray(node.children)) addError('node.children.type', `${path}.children`, 'children debe ser un arreglo.');
    else (node.children || []).forEach((child, index) => inspectNode(child, `${path}.children[${index}]`));
    if (node.type === 'image' && !String(node.alt || '').trim()) addWarning('image.alt', `${path}.alt`, 'La imagen necesita texto alternativo.');
  }
  (document.nodes || []).forEach((node, index) => inspectNode(node, `$.nodes[${index}]`));

  const classIds = new Set();
  (Array.isArray(document.globalClasses) ? document.globalClasses : []).forEach((item, index) => {
    const path = `$.globalClasses[${index}]`; const id = String(item?.id || '');
    if (!orbitJsonIsObject(item)) addError('class.type', path, 'La clase debe ser un objeto.');
    else if (!id) addError('class.id.required', `${path}.id`, 'La clase necesita un ID.');
    else if (classIds.has(id)) addError('class.id.duplicate', `${path}.id`, `El ID de clase “${id}” está duplicado.`);
    else classIds.add(id);
  });
  function inspectReferences(nodes, path = '$.nodes') { (nodes || []).forEach((node, index) => {
    if (!orbitJsonIsObject(node)) return; const nodePath = `${path}[${index}]`;
    (Array.isArray(node.globalClassIds) ? node.globalClassIds : []).forEach(id => { if (!classIds.has(String(id))) addWarning('class.reference', `${nodePath}.globalClassIds`, `La clase “${id}” no existe.`); });
    inspectReferences(node.children, `${nodePath}.children`);
  }); }
  inspectReferences(document.nodes);
  return { valid: errors.length === 0, repairable: errors.every(issue => issue.repairable), errors, warnings, issues: [...errors, ...warnings], stats: { nodes: nodeCount, classes: classIds.size, errors: errors.length, warnings: warnings.length } };
}

function repairOrbitJsonV13(input) {
  const source = orbitJsonIsObject(input) ? orbitJsonClone(input) : {};
  const actions = []; const usedNodeIds = new Set(); const usedClassIds = new Set();
  const uniqueId = (candidate, prefix, index, used) => {
    const base = orbitJsonSlug(candidate || `${prefix}-${index + 1}`); let id = base; let suffix = 2;
    while (used.has(id)) id = `${base}-${suffix++}`; used.add(id); return id;
  };
  const document = {
    version: ORBIT_JSON_VERSION,
    projectName: String(source.projectName || '').trim() || 'Proyecto reparado',
    pageMeta: {
      language: String(source.pageMeta?.language || 'es'),
      title: String(source.pageMeta?.title || source.projectName || 'Proyecto reparado').slice(0, 70),
      description: String(source.pageMeta?.description || '').slice(0, 180),
      ...(source.pageMeta?.ogImage ? { ogImage: String(source.pageMeta.ogImage) } : {}),
      ...(typeof source.pageMeta?.noIndex === 'boolean' ? { noIndex: source.pageMeta.noIndex } : {}),
    },
    tokens: {}, assets: [], components: [], globalClasses: [], nodes: [],
  };
  ORBIT_JSON_TOKEN_GROUPS.forEach(group => {
    const rawGroup = orbitJsonIsObject(source.tokens?.[group]) ? source.tokens[group] : {};
    document.tokens[group] = {};
    Object.entries(rawGroup).forEach(([key, token]) => { if (orbitJsonIsObject(token) && token.value !== undefined) document.tokens[group][orbitJsonSlug(key)] = { ...token, name: String(token.name || key), value: String(token.value) }; });
  });
  document.globalClasses = (Array.isArray(source.globalClasses) ? source.globalClasses : []).filter(orbitJsonIsObject).map((item, index) => {
    const id = uniqueId(item.id, 'class', index, usedClassIds); if (id !== item.id) actions.push(`ID de clase reparado: ${item.id || '(vacío)'} → ${id}.`);
    return { id, name: orbitJsonSlug(item.name || id), styles: orbitJsonIsObject(item.styles) ? item.styles : { base: {} }, ...(orbitJsonIsObject(item.states) ? { states: item.states } : {}), ...(orbitJsonIsObject(item.backgroundConfig) ? { backgroundConfig: item.backgroundConfig } : {}) };
  });
  const validClassIds = new Set(document.globalClasses.map(item => item.id));
  function repairNode(raw, index = 0) {
    const item = orbitJsonIsObject(raw) ? raw : {}; const type = ORBIT_JSON_NODE_TYPES.includes(item.type) ? item.type : 'container';
    if (type !== item.type) actions.push(`Tipo ${item.type || '(vacío)'} convertido a container.`);
    const id = uniqueId(item.id, type, index, usedNodeIds); if (id !== item.id) actions.push(`ID de nodo reparado: ${item.id || '(vacío)'} → ${id}.`);
    const node = {};
    for (const key of ORBIT_JSON_NODE_KEYS) if (item[key] !== undefined) node[key] = orbitJsonClone(item[key]);
    node.id = id; node.type = type;
    node.styles = orbitJsonIsObject(item.styles) ? item.styles : { base: {} }; node.styles.base = orbitJsonIsObject(node.styles.base) ? node.styles.base : {};
    if (node.states !== undefined && !orbitJsonIsObject(node.states)) node.states = {};
    const classIds = [...new Set((Array.isArray(item.globalClassIds) ? item.globalClassIds : []).map(String).filter(classId => validClassIds.has(classId)))];
    if (classIds.length) node.globalClassIds = classIds; else delete node.globalClassIds;
    if (!classIds.includes(String(node.styleClassId || ''))) delete node.styleClassId;
    node.children = (Array.isArray(item.children) ? item.children : []).map(repairNode);
    if (!node.children.length) delete node.children;
    return node;
  }
  document.nodes = (Array.isArray(source.nodes) ? source.nodes : []).map(repairNode);
  if (!document.nodes.length) { document.nodes = [{ id: 'recovered-section', type: 'section', name: 'Recovered Section', styles: { base: {} } }]; actions.push('Se creó una sección vacía porque el documento no contenía nodos válidos.'); }
  document.assets = (Array.isArray(source.assets) ? source.assets : []).filter(orbitJsonIsObject).map((asset, index) => ({ id: orbitJsonSlug(asset.id || `asset-${index + 1}`), name: String(asset.name || `Asset ${index + 1}`), type: ['image','svg','icon'].includes(asset.type) ? asset.type : 'image', src: String(asset.src || ''), alt: String(asset.alt || '') }));
  document.components = (Array.isArray(source.components) ? source.components : []).filter(orbitJsonIsObject).map((component, index) => ({ id: orbitJsonSlug(component.id || `component-${index + 1}`), name: String(component.name || `Component ${index + 1}`), masterId: String(component.masterId || ''), instances: Math.max(0, Number(component.instances) || 0), variants: Array.isArray(component.variants) ? component.variants : [], props: Array.isArray(component.props) ? component.props : [] }));
  return { document, actions, changed: JSON.stringify(document) !== JSON.stringify(input) };
}

function orbitJsonEscapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, character => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;' })[character]); }
function orbitJsonSafeUrl(value = '') { const url = String(value || '').trim(); return /^(https?:|data:image\/|blob:|\/|\.\/|\.\.\/)/i.test(url) ? url : ''; }
function orbitJsonCssName(value = '') { return String(value).replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`); }
function orbitJsonStyle(style = {}) {
  return Object.entries(orbitJsonIsObject(style) ? style : {}).map(([property, value]) => {
    const names = { direction:'flex-direction', justify:'justify-content', align:'align-items', gridColumns:'grid-template-columns' };
    const name = names[property] || orbitJsonCssName(property); let output = value;
    if (property === 'gridColumns' && Number(value)) output = `repeat(${value}, minmax(0, 1fr))`;
    return `${name}:${String(output)}`;
  }).join(';');
}
function createOrbitJsonPreviewHtml(document) {
  const tokens = ORBIT_JSON_TOKEN_GROUPS.flatMap(group => Object.entries(document?.tokens?.[group] || {}).map(([key, token]) => `--${orbitJsonSlug(group)}-${orbitJsonSlug(key)}:${String(token?.value || '')};`)).join('');
  const classes = (document?.globalClasses || []).map(item => `[data-orbit-class~="${orbitJsonEscapeHtml(item.id)}"]{${orbitJsonStyle(item.styles?.base)}}`).join('\n');
  function renderNode(node) {
    const children = (node.children || []).map(renderNode).join(''); const content = orbitJsonEscapeHtml(['heading','text','button'].includes(node.type) ? (node.content || node.name || '') : '');
    const tagMap = { section:'section',container:'div',card:'article',heading:`h${Math.min(6,Math.max(1,Number(node.level)||2))}`,text:'p',button:'a',image:'img',svg:'div',carousel:'div',slide:'article',divider:'hr',spacer:'div' };
    const tag = tagMap[node.type] || 'div'; const style = orbitJsonEscapeHtml(orbitJsonStyle(node.styles?.base)); const classRefs = orbitJsonEscapeHtml((node.globalClassIds || []).join(' '));
    const common = ` data-node="${orbitJsonEscapeHtml(node.id)}" data-orbit-class="${classRefs}" style="${style}"`;
    if (node.type === 'image') return `<img${common} src="${orbitJsonEscapeHtml(orbitJsonSafeUrl(node.src))}" alt="${orbitJsonEscapeHtml(node.alt || '')}">`;
    if (node.type === 'divider') return `<hr${common}>`;
    if (node.type === 'spacer') return `<div${common} aria-hidden="true"></div>`;
    if (node.type === 'svg') return `<div${common}><span class="orbit-svg-placeholder">SVG</span></div>`;
    if (node.type === 'button') return `<a${common}>${content || 'Button'}${children}</a>`;
    return `<${tag}${common}>${content}${children}</${tag}>`;
  }
  return `<!doctype html><html lang="${orbitJsonEscapeHtml(document?.pageMeta?.language || 'es')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{${tokens}}*{box-sizing:border-box}html,body{margin:0;min-height:100%;font-family:Inter,system-ui,sans-serif}body{background:#fff;color:#151513}section,div,article{min-width:0}img{display:block;max-width:100%}a{display:inline-flex;text-decoration:none}.orbit-svg-placeholder{display:grid;place-items:center;min-height:48px;border:1px dashed #aaa;color:#777;font-size:11px}${classes}</style></head><body>${(document?.nodes || []).map(renderNode).join('')}</body></html>`;
}
