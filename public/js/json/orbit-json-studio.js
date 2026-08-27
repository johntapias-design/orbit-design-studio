/** Orbit JSON Studio: parsing, v13 migration, validation, repair and sandboxed preview. */
const ORBIT_JSON_VERSION = 13;
const ORBIT_JSON_NODE_TYPES = Object.freeze(['section','container','heading','text','button','image','svg','card','carousel','slide','divider','spacer']);
const ORBIT_JSON_ROOT_KEYS = new Set(['version','projectName','pageMeta','tokens','assets','components','globalClasses','nodes']);
const ORBIT_JSON_NODE_KEYS = new Set(['id','type','name','content','src','alt','href','svgCode','ariaLabel','level','globalClassIds','styleClassId','styleEditMode','componentRef','componentSource','styles','states','backgroundConfig','swiper','children']);
const ORBIT_JSON_TOKEN_GROUPS = Object.freeze(['colors','typography','spacing','radius','shadows']);
const ORBIT_JSON_STYLE_GROUPS = Object.freeze(['base','desktopXL','desktop','tablet','mobileL','mobile']);
const ORBIT_JSON_STATE_GROUPS = Object.freeze(['hover','focus','active','disabled']);
const ORBIT_JSON_STYLE_PROPERTIES = Object.freeze(['width','maxWidth','minWidth','height','maxHeight','minHeight','aspectRatio','boxSizing','paddingTop','paddingRight','paddingBottom','paddingLeft','marginTop','marginRight','marginBottom','marginLeft','gap','columnGap','rowGap','display','direction','flexWrap','justifyContent','justify','alignItems','align','justifyItems','alignContent','gridColumns','gridRows','gridTemplateColumns','gridTemplateRows','gridTemplateAreas','gridArea','gridColumn','gridRow','gridAutoColumns','gridAutoRows','gridAutoFlow','gridUseMinMax','gridColumnTracks','gridRowTracks','order','verticalAlign','alignSelf','justifySelf','flexGrow','flexShrink','flexBasis','position','zIndex','left','top','right','bottom','transform','transition','cursor','pointerEvents','background','color','fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','textAlign','fontStyle','textTransform','textDecoration','textShadow','fontVariationSettings','whiteSpace','textWrap','borderRadius','borderWidth','borderColor','opacity','boxShadow','objectFit','overflow']);
const ORBIT_JSON_STYLE_PROPERTY_SET = new Set(ORBIT_JSON_STYLE_PROPERTIES);
const ORBIT_JSON_LIMITS = Object.freeze({ sourceBytes: 8 * 1024 * 1024, nodes: 2500, depth: 32, textLength: 20000 });

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
  const inspectStyleCollection = (value, path, groups) => {
    if (value === undefined) return;
    if (!orbitJsonIsObject(value)) { addError('style.collection.type', path, 'Debe ser un objeto de estilos.'); return; }
    Object.entries(value).forEach(([group, declarations]) => {
      const groupPath = `${path}.${group}`;
      if (!groups.includes(group)) addError('style.group.unsupported', groupPath, `El grupo “${group}” no es compatible.`);
      if (!orbitJsonIsObject(declarations)) { addError('style.group.type', groupPath, 'El grupo debe ser un objeto.'); return; }
      Object.entries(declarations).forEach(([property, styleValue]) => {
        const propertyPath = `${groupPath}.${property}`;
        if (!ORBIT_JSON_STYLE_PROPERTY_SET.has(property)) addError('style.property.unsupported', propertyPath, `La propiedad “${property}” no es editable en Orbit.`);
        if (styleValue === null || (typeof styleValue !== 'string' && typeof styleValue !== 'number' && typeof styleValue !== 'boolean')) addError('style.value.type', propertyPath, 'El valor debe ser texto, número o booleano.');
      });
    });
  };
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
  function inspectNode(node, path, depth = 1) {
    nodeCount += 1;
    if (nodeCount > ORBIT_JSON_LIMITS.nodes) { if (nodeCount === ORBIT_JSON_LIMITS.nodes + 1) addError('nodes.limit', '$.nodes', `El documento supera el límite seguro de ${ORBIT_JSON_LIMITS.nodes} nodos.`, false); return; }
    if (depth > ORBIT_JSON_LIMITS.depth) { addError('nodes.depth', path, `La estructura supera ${ORBIT_JSON_LIMITS.depth} niveles de profundidad.`, false); return; }
    if (!orbitJsonIsObject(node)) { addError('node.type', path, 'El nodo debe ser un objeto.'); return; }
    const id = String(node.id || '');
    if (!id) addError('node.id.required', `${path}.id`, 'El nodo necesita un ID.');
    else if (nodeIds.has(id)) addError('node.id.duplicate', `${path}.id`, `El ID “${id}” está duplicado.`);
    else nodeIds.add(id);
    if (!ORBIT_JSON_NODE_TYPES.includes(node.type)) addError('node.type.unsupported', `${path}.type`, `El tipo “${node.type || 'vacío'}” no es compatible.`);
    inspectStyleCollection(node.styles, `${path}.styles`, ORBIT_JSON_STYLE_GROUPS);
    inspectStyleCollection(node.states, `${path}.states`, ORBIT_JSON_STATE_GROUPS);
    Object.keys(node).filter(key => !ORBIT_JSON_NODE_KEYS.has(key)).forEach(key => addError('node.additional', `${path}.${key}`, `La propiedad “${key}” no pertenece al contrato de nodo v13.`));
    if (node.children !== undefined && !Array.isArray(node.children)) addError('node.children.type', `${path}.children`, 'children debe ser un arreglo.');
    else (node.children || []).forEach((child, index) => inspectNode(child, `${path}.children[${index}]`, depth + 1));
    if (['heading','text','button'].includes(node.type) && !String(node.content || '').trim()) addWarning('node.content.empty', `${path}.content`, `${node.type} necesita contenido visible.`);
    if (String(node.content || '').length > ORBIT_JSON_LIMITS.textLength) addError('node.content.limit', `${path}.content`, `El contenido supera ${ORBIT_JSON_LIMITS.textLength} caracteres.`);
    if (node.type === 'image' && !String(node.src || '').trim()) addWarning('image.src', `${path}.src`, 'La imagen no tiene una fuente; Orbit conservará un marcador para reemplazarla.');
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
    if (orbitJsonIsObject(item)) {
      inspectStyleCollection(item.styles, `${path}.styles`, ORBIT_JSON_STYLE_GROUPS);
      inspectStyleCollection(item.states, `${path}.states`, ORBIT_JSON_STATE_GROUPS);
    }
  });
  function inspectReferences(nodes, path = '$.nodes') { (nodes || []).forEach((node, index) => {
    if (!orbitJsonIsObject(node)) return; const nodePath = `${path}[${index}]`;
    (Array.isArray(node.globalClassIds) ? node.globalClassIds : []).forEach(id => { if (!classIds.has(String(id))) addWarning('class.reference', `${nodePath}.globalClassIds`, `La clase “${id}” no existe.`); });
    inspectReferences(node.children, `${nodePath}.children`);
  }); }
  inspectReferences(document.nodes);
  (document.nodes || []).forEach((node, index) => { if (orbitJsonIsObject(node) && node.type !== 'section') addWarning('root.section', `$.nodes[${index}].type`, 'Para una página completa se recomienda usar section como nodo raíz.'); });
  return { valid: errors.length === 0, repairable: errors.every(issue => issue.repairable), errors, warnings, issues: [...errors, ...warnings], stats: { nodes: nodeCount, classes: classIds.size, errors: errors.length, warnings: warnings.length } };
}

function repairOrbitJsonV13(input) {
  const source = orbitJsonIsObject(input) ? orbitJsonClone(input) : {};
  const actions = []; const repairs = []; const usedNodeIds = new Set(); const usedClassIds = new Set(); const usedAssetIds = new Set(); const usedComponentIds = new Set();
  const summary = { total: 0, identifiers: 0, properties: 0, styles: 0, references: 0, content: 0, structure: 0 };
  const recordRepair = (category, code, path, message, before, after) => {
    summary.total += 1; summary[category] = (summary[category] || 0) + 1;
    repairs.push({ category, code, path, message, ...(before !== undefined ? { before } : {}), ...(after !== undefined ? { after } : {}) });
    actions.push(message);
  };
  const uniqueId = (candidate, prefix, index, used) => {
    const base = orbitJsonSlug(candidate || `${prefix}-${index + 1}`); let id = base; let suffix = 2;
    while (used.has(id)) id = `${base}-${suffix++}`; used.add(id); return id;
  };
  const repairStyleCollection = (raw, groups, path) => {
    const output = {};
    if (raw !== undefined && !orbitJsonIsObject(raw)) recordRepair('styles', 'style.collection.reset', path, `Se reinició la colección de estilos en ${path} porque no era válida.`, raw, {});
    Object.entries(orbitJsonIsObject(raw) ? raw : {}).forEach(([group, declarations]) => {
      if (!groups.includes(group)) { recordRepair('styles', 'style.group.removed', `${path}.${group}`, `Se eliminó el grupo de estilos “${group}” porque Orbit no lo reconoce.`, declarations); return; }
      if (!orbitJsonIsObject(declarations)) { recordRepair('styles', 'style.group.reset', `${path}.${group}`, `Se reinició el grupo “${group}” porque sus estilos no eran válidos.`, declarations, {}); return; }
      output[group] = {};
      Object.entries(declarations).forEach(([property, value]) => {
        if (!ORBIT_JSON_STYLE_PROPERTY_SET.has(property)) { recordRepair('styles', 'style.property.removed', `${path}.${group}.${property}`, `Se eliminó “${property}” porque no es una propiedad editable en Orbit.`, value); return; }
        if (value === null || (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean')) { recordRepair('styles', 'style.value.removed', `${path}.${group}.${property}`, `Se eliminó el valor inválido de “${property}” para proteger el diseño.`, value); return; }
        output[group][property] = value;
      });
    });
    return output;
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
  Object.keys(source).filter(key => !ORBIT_JSON_ROOT_KEYS.has(key)).forEach(key => recordRepair('properties', 'root.property.removed', `$.${key}`, `Se eliminó la propiedad raíz “${key}” porque no pertenece a Orbit JSON v13.`, source[key]));
  ORBIT_JSON_TOKEN_GROUPS.forEach(group => {
    const rawGroup = orbitJsonIsObject(source.tokens?.[group]) ? source.tokens[group] : {};
    document.tokens[group] = {};
    Object.entries(rawGroup).forEach(([key, token]) => {
      const path = `$.tokens.${group}.${key}`;
      if (!orbitJsonIsObject(token) || token.value === undefined) { recordRepair('properties', 'token.removed', path, `Se omitió el token “${key}” porque no tenía un valor utilizable.`, token); return; }
      const safeKey = orbitJsonSlug(key);
      if (safeKey !== key) recordRepair('identifiers', 'token.id.normalized', path, `Se normalizó el identificador del token “${key}” a “${safeKey}”.`, key, safeKey);
      document.tokens[group][safeKey] = { ...token, name: String(token.name || key), value: String(token.value) };
    });
  });
  document.globalClasses = (Array.isArray(source.globalClasses) ? source.globalClasses : []).reduce((output, item, index) => {
    const path = `$.globalClasses[${index}]`;
    if (!orbitJsonIsObject(item)) { recordRepair('structure', 'class.removed', path, `Se omitió una clase vacía o dañada en la posición ${index + 1}.`, item); return output; }
    const id = uniqueId(item.id, 'class', index, usedClassIds); if (id !== item.id) recordRepair('identifiers', 'class.id.repaired', `${path}.id`, `Se reparó el ID de clase: “${item.id || 'vacío'}” → “${id}”.`, item.id, id);
    const styles = repairStyleCollection(item.styles, ORBIT_JSON_STYLE_GROUPS, `${path}.styles`); if (!styles.base) { styles.base = {}; recordRepair('styles', 'class.styles.base.added', `${path}.styles.base`, `Se añadió el estilo base que faltaba en la clase “${id}”.`, undefined, {}); }
    const states = repairStyleCollection(item.states, ORBIT_JSON_STATE_GROUPS, `${path}.states`);
    output.push({ id, name: orbitJsonSlug(item.name || id), styles, ...(Object.keys(states).length ? { states } : {}), ...(orbitJsonIsObject(item.backgroundConfig) ? { backgroundConfig: item.backgroundConfig } : {}) });
    return output;
  }, []);
  const validClassIds = new Set(document.globalClasses.map(item => item.id));
  function repairNode(raw, index = 0, path = `$.nodes[${index}]`) {
    const item = orbitJsonIsObject(raw) ? raw : {};
    if (!orbitJsonIsObject(raw)) recordRepair('structure', 'node.object.rebuilt', path, `Se reconstruyó el elemento ${index + 1} porque no era un nodo válido.`, raw, {});
    const type = ORBIT_JSON_NODE_TYPES.includes(item.type) ? item.type : 'container';
    if (type !== item.type) recordRepair('properties', 'node.type.repaired', `${path}.type`, `Se convirtió el tipo “${item.type || 'vacío'}” a “container”, que sí es editable.`, item.type, type);
    const id = uniqueId(item.id, type, index, usedNodeIds); if (id !== item.id) recordRepair('identifiers', 'node.id.repaired', `${path}.id`, `Se reparó el ID del nodo: “${item.id || 'vacío'}” → “${id}”.`, item.id, id);
    const node = {};
    for (const key of ORBIT_JSON_NODE_KEYS) if (item[key] !== undefined) node[key] = orbitJsonClone(item[key]);
    Object.keys(item).filter(key => !ORBIT_JSON_NODE_KEYS.has(key)).forEach(key => recordRepair('properties', 'node.property.removed', `${path}.${key}`, `Se eliminó “${key}” porque no pertenece a un nodo Orbit v13.`, item[key]));
    node.id = id; node.type = type;
    node.styles = repairStyleCollection(item.styles, ORBIT_JSON_STYLE_GROUPS, `${path}.styles`); if (!node.styles.base) { node.styles.base = {}; recordRepair('styles', 'node.styles.base.added', `${path}.styles.base`, `Se añadió styles.base al nodo “${id}” para que sus estilos puedan editarse.`, undefined, {}); }
    const states = repairStyleCollection(item.states, ORBIT_JSON_STATE_GROUPS, `${path}.states`); if (Object.keys(states).length) node.states = states; else delete node.states;
    if (node.content !== undefined) { const repairedContent = String(node.content).slice(0, ORBIT_JSON_LIMITS.textLength); if (repairedContent !== node.content) recordRepair('content', 'node.content.normalized', `${path}.content`, `Se convirtió o recortó el contenido del nodo “${id}” a texto seguro.`, node.content, repairedContent); node.content = repairedContent; }
    if (['heading','text','button'].includes(type) && !String(node.content || '').trim()) { const fallback = type === 'heading' ? 'Título pendiente' : type === 'button' ? 'Botón' : 'Texto pendiente'; node.content = fallback; recordRepair('content', 'node.content.added', `${path}.content`, `Se añadió contenido provisional al ${type} “${id}”.`, item.content, fallback); }
    if (type === 'image' && !String(node.alt || '').trim()) { const fallback = String(item.name || 'Imagen pendiente'); node.alt = fallback; recordRepair('content', 'image.alt.added', `${path}.alt`, `Se añadió texto alternativo a la imagen “${id}”.`, item.alt, fallback); }
    const classIds = [...new Set((Array.isArray(item.globalClassIds) ? item.globalClassIds : []).map(String).filter(classId => validClassIds.has(classId)))];
    const rejectedClassIds = [...new Set((Array.isArray(item.globalClassIds) ? item.globalClassIds : []).map(String).filter(classId => !validClassIds.has(classId)))];
    if (rejectedClassIds.length) recordRepair('references', 'class.references.removed', `${path}.globalClassIds`, `Se quitaron referencias a clases inexistentes: ${rejectedClassIds.join(', ')}.`, rejectedClassIds, classIds);
    if (classIds.length) node.globalClassIds = classIds; else delete node.globalClassIds;
    if (node.styleClassId && !classIds.includes(String(node.styleClassId))) { recordRepair('references', 'class.active-reference.removed', `${path}.styleClassId`, `Se quitó la clase activa “${node.styleClassId}” porque no está vinculada al nodo “${id}”.`, node.styleClassId); delete node.styleClassId; }
    if (item.children !== undefined && !Array.isArray(item.children)) recordRepair('structure', 'node.children.reset', `${path}.children`, `Se reinició children en “${id}” porque no era una lista válida.`, item.children, []);
    node.children = (Array.isArray(item.children) ? item.children : []).map((child, childIndex) => repairNode(child, childIndex, `${path}.children[${childIndex}]`));
    if (!node.children.length) delete node.children;
    return node;
  }
  document.nodes = (Array.isArray(source.nodes) ? source.nodes : []).map((node, index) => repairNode(node, index, `$.nodes[${index}]`));
  if (!document.nodes.length) { document.nodes = [{ id: 'recovered-section', type: 'section', name: 'Sección recuperada', styles: { base: {} } }]; recordRepair('structure', 'nodes.fallback.created', '$.nodes', 'Se creó una sección vacía porque el documento no contenía nodos utilizables.', source.nodes, document.nodes); }
  document.assets = (Array.isArray(source.assets) ? source.assets : []).reduce((output, asset, index) => {
    const path = `$.assets[${index}]`; if (!orbitJsonIsObject(asset)) { recordRepair('structure', 'asset.removed', path, `Se omitió el recurso ${index + 1} porque estaba dañado.`, asset); return output; }
    const id = uniqueId(asset.id, 'asset', index, usedAssetIds); if (id !== asset.id) recordRepair('identifiers', 'asset.id.repaired', `${path}.id`, `Se reparó el ID del recurso: “${asset.id || 'vacío'}” → “${id}”.`, asset.id, id);
    output.push({ id, name: String(asset.name || `Recurso ${index + 1}`), type: ['image','svg','icon'].includes(asset.type) ? asset.type : 'image', src: String(asset.src || ''), alt: String(asset.alt || '') }); return output;
  }, []);
  document.components = (Array.isArray(source.components) ? source.components : []).reduce((output, component, index) => {
    const path = `$.components[${index}]`; if (!orbitJsonIsObject(component)) { recordRepair('structure', 'component.removed', path, `Se omitió el componente ${index + 1} porque estaba dañado.`, component); return output; }
    const id = uniqueId(component.id, 'component', index, usedComponentIds); if (id !== component.id) recordRepair('identifiers', 'component.id.repaired', `${path}.id`, `Se reparó el ID del componente: “${component.id || 'vacío'}” → “${id}”.`, component.id, id);
    output.push({ id, name: String(component.name || `Componente ${index + 1}`), masterId: String(component.masterId || ''), instances: Math.max(0, Number(component.instances) || 0), variants: Array.isArray(component.variants) ? component.variants : [], props: Array.isArray(component.props) ? component.props : [] }); return output;
  }, []);
  return { document, actions, repairs, summary, changed: JSON.stringify(document) !== JSON.stringify(input) };
}

function orbitJsonEscapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, character => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;' })[character]); }
function orbitJsonSafeUrl(value = '') { const url = String(value || '').trim(); return /^(https?:|data:image\/|blob:|\/|\.\/|\.\.\/)/i.test(url) ? url : ''; }
function orbitJsonCssName(value = '') { return String(value).replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`); }
function createOrbitJsonAiTemplate() {
  return {
    version: ORBIT_JSON_VERSION,
    projectName: 'Nombre del proyecto',
    pageMeta: { language: 'es', title: 'Título SEO', description: 'Descripción breve de la página.' },
    tokens: { colors: {}, typography: {}, spacing: {}, radius: {}, shadows: {} },
    assets: [], components: [], globalClasses: [],
    nodes: [{ id: 'hero', type: 'section', name: 'Hero', styles: { base: { width: '100%', paddingTop: '80px', paddingRight: '40px', paddingBottom: '80px', paddingLeft: '40px' }, mobile: { paddingTop: '48px', paddingRight: '20px', paddingBottom: '48px', paddingLeft: '20px' } }, children: [{ id: 'hero-title', type: 'heading', level: 1, content: 'Título principal', styles: { base: { fontSize: '64px', lineHeight: 1.05 }, mobile: { fontSize: '40px' } } }] }],
  };
}
function createOrbitJsonAiAuthoringPrompt({ provider = 'chatgpt', brief = '', reference = '' } = {}) {
  const providerName = provider === 'claude' ? 'Claude' : 'ChatGPT';
  const styleList = ORBIT_JSON_STYLE_PROPERTIES.join(', ');
  return [
    `INSTRUCCIONES OFICIALES ORBIT PARA ${providerName.toUpperCase()}`,
    'Convierte el diseño de referencia en un documento Orbit JSON v13 editable. Prioriza fidelidad visual, estructura clara y facilidad de ajuste manual.',
    `OBJETIVO: ${String(brief || 'Reconstruir fielmente el diseño adjunto como una página web responsive.').trim()}`,
    `REFERENCIA: ${String(reference || 'La imagen o diseño adjunto en esta conversación.').trim()}`,
    '',
    'ENTREGA OBLIGATORIA:',
    '- Devuelve exclusivamente un objeto JSON válido. No uses Markdown, comentarios ni texto antes o después.',
    '- La raíz debe contener exactamente: version, projectName, pageMeta, tokens, assets, components, globalClasses y nodes.',
    '- version debe ser 13. nodes debe contener al menos una sección.',
    `- Tipos de nodo permitidos: ${ORBIT_JSON_NODE_TYPES.join(', ')}.`,
    '- Cada nodo necesita id único, type y styles.base. Usa level de 1 a 6 para headings.',
    `- Grupos responsive permitidos: ${ORBIT_JSON_STYLE_GROUPS.join(', ')}.`,
    `- Propiedades visuales permitidas: ${styleList}.`,
    '- Usa únicamente valores CSS válidos como texto, número o booleano; nunca objetos dentro de una propiedad visual.',
    '- Añade tablet y mobile cuando cambien columnas, espacios, tamaños o alineación.',
    '- No inventes rutas de imágenes. Si falta un recurso, deja src vacío, escribe un alt descriptivo y conserva el espacio visual.',
    '- Mantén un único heading level 1 y contenido visible en headings, textos y botones.',
    '- No uses propiedades adicionales aunque parezcan útiles: Orbit rechazará las que estén fuera del contrato.',
    '',
    'PLANTILLA MÍNIMA VÁLIDA:',
    JSON.stringify(createOrbitJsonAiTemplate(), null, 2),
  ].join('\n');
}
function auditOrbitJsonImportReadiness(document) {
  const validation = validateOrbitJsonV13(document); const flat = []; let depth = 0;
  (function walk(nodes, level = 1) { (nodes || []).forEach(node => { if (!orbitJsonIsObject(node)) return; flat.push(node); depth = Math.max(depth, level); walk(node.children, level + 1); }); })(document?.nodes);
  const sections = flat.filter(node => node.type === 'section').length;
  const responsive = flat.filter(node => ORBIT_JSON_STYLE_GROUPS.slice(1).some(group => Object.keys(node.styles?.[group] || {}).length)).length;
  const unstyled = flat.filter(node => !Object.keys(node.styles?.base || {}).length).length;
  const missingContent = flat.filter(node => ['heading','text','button'].includes(node.type) && !String(node.content || '').trim()).length;
  const missingAssets = flat.filter(node => node.type === 'image' && !String(node.src || '').trim()).length;
  const deductions = validation.errors.length * 25 + validation.warnings.length * 4 + Math.min(20, unstyled * 2) + Math.min(12, missingAssets * 3);
  const score = Math.max(0, Math.min(100, 100 - deductions));
  return { ready: validation.valid, status: !validation.valid ? 'blocked' : score >= 85 ? 'ready' : 'review', score, validation, stats: { nodes: flat.length, sections, responsive, unstyled, missingContent, missingAssets, depth } };
}
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
