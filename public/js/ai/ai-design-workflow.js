/**
 * DOM-free foundation for Orbit AI Design Workflow.
 * The editor owns file access and rendering; this module owns context,
 * deterministic local generation, prompt assembly and visual auditing.
 */
const ORBIT_AI_WORKFLOW_VERSION = 1;

function orbitAiFlattenNodes(nodes = []) {
  const result = [];
  (function walk(items, parentId = '') {
    (items || []).forEach(node => {
      if (!node || typeof node !== 'object') return;
      result.push({ node, parentId });
      walk(node.children || [], node.id || parentId);
    });
  })(nodes);
  return result;
}

function normalizeOrbitAiCapture(capture = {}) {
  const type = String(capture.type || '').toLowerCase();
  const width = Math.max(0, Math.round(Number(capture.width) || 0));
  const height = Math.max(0, Math.round(Number(capture.height) || 0));
  return {
    name: String(capture.name || 'referencia-visual').trim().slice(0, 160),
    type: /^image\/(png|jpe?g|webp|gif|avif)$/.test(type) ? type : 'image/png',
    size: Math.max(0, Math.round(Number(capture.size) || 0)),
    width,
    height,
    aspectRatio: width && height ? Number((width / height).toFixed(3)) : 0,
    attached: capture.attached !== false,
  };
}

function orbitAiStyleValues(flat, property) {
  const values = new Set();
  flat.forEach(({ node }) => {
    ['base', 'desktop', 'tablet', 'mobile'].forEach(group => {
      const value = node.styles?.[group]?.[property];
      if (value !== undefined && String(value).trim()) values.add(String(value).trim());
    });
  });
  return [...values];
}

function createOrbitAiContext(project = {}, options = {}) {
  const nodes = Array.isArray(project.nodes) ? project.nodes : [];
  const flat = orbitAiFlattenNodes(nodes);
  const selectedId = String(options.selectedId || '');
  const selected = flat.find(item => item.node.id === selectedId)?.node || null;
  const scope = ['selection', 'page', 'project'].includes(options.scope) ? options.scope : (selected ? 'selection' : 'page');
  const scopedNodes = scope === 'selection' && selected ? orbitAiFlattenNodes([selected]) : flat;
  const typeCounts = {};
  scopedNodes.forEach(({ node }) => { typeCounts[node.type || 'unknown'] = (typeCounts[node.type || 'unknown'] || 0) + 1; });
  const textSamples = scopedNodes
    .map(({ node }) => String(node.content || '').trim())
    .filter(Boolean)
    .slice(0, 12)
    .map(value => value.slice(0, 180));
  const tokens = project.tokens || {};
  const tokenSummary = Object.fromEntries(Object.entries(tokens).map(([group, values]) => [group, Object.values(values || {}).slice(0, 12).map(token => ({
    name: String(token?.name || ''),
    value: String(token?.value || ''),
    cssVar: String(token?.cssVar || ''),
  }))]));
  return {
    workflowVersion: ORBIT_AI_WORKFLOW_VERSION,
    orbitDocumentVersion: Number(project.version) || 13,
    projectName: String(project.projectName || 'Orbit project'),
    page: {
      id: String(project.currentPageId || ''),
      name: String(project.pageName || project.pageMeta?.title || 'Página actual'),
      language: String(project.pageMeta?.language || 'es'),
      title: String(project.pageMeta?.title || ''),
      description: String(project.pageMeta?.description || ''),
    },
    scope,
    selected: selected ? { id: selected.id, type: selected.type, name: selected.name || selected.type, content: String(selected.content || '').slice(0, 240) } : null,
    stats: {
      nodes: scopedNodes.length,
      sections: scopedNodes.filter(({ node }) => node.type === 'section').length,
      images: scopedNodes.filter(({ node }) => node.type === 'image').length,
      components: Array.isArray(project.components) ? project.components.length : 0,
      globalClasses: Array.isArray(project.globalClasses) ? project.globalClasses.length : 0,
    },
    typeCounts,
    designLanguage: {
      colors: orbitAiStyleValues(scopedNodes, 'color').concat(orbitAiStyleValues(scopedNodes, 'background')).slice(0, 16),
      fontFamilies: orbitAiStyleValues(scopedNodes, 'fontFamily').slice(0, 8),
      fontSizes: orbitAiStyleValues(scopedNodes, 'fontSize').slice(0, 12),
      radii: orbitAiStyleValues(scopedNodes, 'borderRadius').slice(0, 12),
      spacing: [...new Set(['gap', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].flatMap(prop => orbitAiStyleValues(scopedNodes, prop)))].slice(0, 18),
    },
    tokens: tokenSummary,
    textSamples,
  };
}

function orbitAiNumericPx(value) {
  const match = String(value ?? '').trim().match(/^(-?\d+(?:\.\d+)?)px$/i);
  return match ? Number(match[1]) : null;
}

function auditOrbitVisualDesign(project = {}) {
  const flat = orbitAiFlattenNodes(project.nodes || []);
  const issues = [];
  const add = (severity, category, code, node, title, detail, suggestion) => issues.push({
    id: `${node?.id || 'page'}:${code}`,
    severity,
    category,
    code,
    nodeId: node?.id || '',
    title,
    detail,
    suggestion,
  });
  const headings = flat.filter(({ node }) => node.type === 'heading').map(({ node }) => node);
  const h1s = headings.filter(node => String(node.tag || '').toLowerCase() === 'h1');
  if (h1s.length !== 1) add('critical', 'hierarchy', 'h1-count', h1s[0], `La composición tiene ${h1s.length} H1`, 'La jerarquía visual necesita un foco principal inequívoco.', 'Conserva un único H1 y convierte los demás en H2 o H3.');
  if (!headings.length) add('critical', 'hierarchy', 'no-headings', null, 'No hay encabezados visibles', 'El contenido no ofrece puntos claros de exploración.', 'Añade un título principal y encabezados por sección.');
  const sections = flat.filter(({ node }) => node.type === 'section').map(({ node }) => node);
  sections.forEach(section => {
    const descendants = orbitAiFlattenNodes(section.children || []).map(item => item.node);
    if (!descendants.some(node => node.type === 'heading')) add('warning', 'hierarchy', 'section-heading', section, `${section.name || 'Sección'} sin encabezado`, 'La sección puede resultar difícil de identificar al recorrer la página.', 'Añade un encabezado visible o usa un contenedor si es solo una envoltura.');
  });
  flat.forEach(({ node }) => {
    const fontSize = orbitAiNumericPx(node.styles?.base?.fontSize);
    if (fontSize !== null && fontSize < 12 && ['heading', 'text', 'button', 'link'].includes(node.type)) add('warning', 'typography', 'small-text', node, `Texto muy pequeño en ${node.name || node.type}`, `${fontSize}px puede perder legibilidad en pantallas normales.`, 'Usa al menos 12px para texto auxiliar y 16px para cuerpo.');
    const content = String(node.content || '').trim();
    if (['text', 'richtext'].includes(node.type) && content.length > 320) add('opportunity', 'content', 'dense-copy', node, `Bloque de texto denso en ${node.name || node.type}`, `${content.length} caracteres en un solo bloque reducen la exploración visual.`, 'Divide el contenido, añade subtítulos o limita el ancho de lectura.');
    if (node.type === 'image' && !String(node.alt || '').trim()) add('warning', 'content', 'image-alt', node, `Imagen sin descripción: ${node.name || 'Imagen'}`, 'La intención visual no queda documentada para accesibilidad ni generación contextual.', 'Añade un alt descriptivo o marca la imagen como decorativa.');
    const mobileWidth = orbitAiNumericPx(node.styles?.mobile?.width ?? node.styles?.base?.width);
    if (mobileWidth !== null && mobileWidth > 480 && !node.styles?.mobile?.width) add('critical', 'responsive', 'fixed-mobile-width', node, `Ancho fijo riesgoso en ${node.name || node.type}`, `${mobileWidth}px sin ajuste Mobile puede crear overflow.`, 'Define width: 100% o un max-width específico en Mobile.');
  });
  const colors = [...new Set(orbitAiStyleValues(flat, 'color').concat(orbitAiStyleValues(flat, 'background')).filter(value => !/^var\(/.test(value)))];
  if (colors.length > 12) add('opportunity', 'color', 'color-fragmentation', null, `${colors.length} colores directos detectados`, 'Una paleta extensa de valores no tokenizados reduce la coherencia visual.', 'Consolida los colores repetidos en tokens semánticos.');
  const fonts = orbitAiStyleValues(flat, 'fontFamily').filter(value => !/^var\(/.test(value));
  if (fonts.length > 3) add('warning', 'typography', 'font-fragmentation', null, `${fonts.length} familias tipográficas directas`, 'Demasiadas familias compiten por atención y hacen inconsistente el sistema.', 'Limita el sistema a una familia de display y otra de lectura.');
  const spacing = [...new Set(['gap', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].flatMap(prop => orbitAiStyleValues(flat, prop)).filter(value => !/^var\(/.test(value)))];
  if (spacing.length > 14) add('opportunity', 'spacing', 'spacing-fragmentation', null, `${spacing.length} valores de espaciado directos`, 'La cadencia puede sentirse irregular y ser difícil de mantener.', 'Agrupa el espaciado en una escala de 6 a 10 tokens.');
  const buttons = flat.filter(({ node }) => ['button', 'link'].includes(node.type));
  if (flat.length > 8 && !buttons.length) add('opportunity', 'content', 'no-action', null, 'No se detecta una acción principal', 'La página tiene contenido pero no una ruta de acción visible.', 'Añade una llamada a la acción alineada con el objetivo de la página.');
  const weights = { critical: 16, warning: 8, opportunity: 4 };
  const score = Math.max(0, Math.min(100, 100 - issues.reduce((sum, issue) => sum + weights[issue.severity], 0)));
  return {
    score,
    issues,
    critical: issues.filter(issue => issue.severity === 'critical'),
    warnings: issues.filter(issue => issue.severity === 'warning'),
    opportunities: issues.filter(issue => issue.severity === 'opportunity'),
    checked: flat.length,
    categories: [...new Set(issues.map(issue => issue.category))],
  };
}

function createOrbitAiPrompt({ context = {}, capture = null, audit = null, brief = '', task = 'rebuild', provider = 'chatgpt' } = {}) {
  const taskLabels = {
    rebuild: 'Reconstruir fielmente la referencia visual como Orbit JSON v13.',
    improve: 'Mejorar el alcance indicado conservando el lenguaje visual y la estructura útil existente.',
    variant: 'Crear una variante visual coherente, claramente diferenciada y lista para comparar.',
    audit: 'Corregir los hallazgos visuales priorizados sin rediseñar innecesariamente.',
  };
  const compactAudit = audit ? audit.issues.slice(0, 14).map(issue => ({ severity: issue.severity, category: issue.category, nodeId: issue.nodeId, title: issue.title, suggestion: issue.suggestion })) : [];
  const compactCapture = capture ? normalizeOrbitAiCapture(capture) : null;
  const contract = typeof createOrbitJsonAiAuthoringPrompt === 'function'
    ? createOrbitJsonAiAuthoringPrompt({ provider, brief, reference: compactCapture ? `${compactCapture.name}, ${compactCapture.width || '?'}x${compactCapture.height || '?'} px.` : 'La referencia adjunta en la conversación.' })
    : 'Genera exclusivamente un objeto Orbit JSON version 13 válido, editable y responsive.';
  return [
    contract,
    '',
    'CONTEXTO ESPECÍFICO DE ESTA TAREA:',
    taskLabels[task] || taskLabels.improve,
    '',
    `BRIEF: ${String(brief || 'Mantén la intención y mejora jerarquía, consistencia y responsive.').trim()}`,
    `ALCANCE: ${context.scope || 'page'}`,
    compactCapture ? `REFERENCIA ADJUNTA: ${compactCapture.name}, ${compactCapture.width || '?'}x${compactCapture.height || '?'} px, relación ${compactCapture.aspectRatio || '?'}.` : 'REFERENCIA ADJUNTA: no.',
    '',
    'CONTEXTO ORBIT (fuente de verdad):',
    JSON.stringify(context, null, 2),
    compactAudit.length ? `\nHALLAZGOS DEL AUDITOR:\n${JSON.stringify(compactAudit, null, 2)}` : '',
    '',
    'REGLAS ADICIONALES:',
    '- Conserva IDs existentes cuando modifiques nodos.',
    '- Reutiliza tokens, clases globales y componentes del contexto antes de crear nuevos.',
    '- Mantén semántica, accesibilidad, alt de imágenes y un único H1.',
    '- El resultado debe poder validarse e importarse directamente en Orbit JSON Studio.',
  ].filter(Boolean).join('\n');
}

function orbitAiSlug(value = '') {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 42) || 'section';
}

function createOrbitContextualSection({ brief = '', context = {}, now = Date.now() } = {}) {
  const cleanBrief = String(brief || '').trim();
  const words = cleanBrief.replace(/\s+/g, ' ').split(' ').filter(Boolean);
  const title = words.slice(0, 8).join(' ') || 'Una nueva sección con propósito';
  const sentenceTitle = title.charAt(0).toUpperCase() + title.slice(1).replace(/[.!?]+$/, '');
  const idBase = `${orbitAiSlug(sentenceTitle)}-${String(now).slice(-6)}`;
  const colorToken = context.tokens?.colors?.find(token => /primary|accent|brand/i.test(`${token.name} ${token.cssVar}`))?.cssVar;
  const surfaceToken = context.tokens?.colors?.find(token => /surface|background|neutral/i.test(`${token.name} ${token.cssVar}`))?.cssVar;
  const textToken = context.tokens?.colors?.find(token => /text|foreground|ink/i.test(`${token.name} ${token.cssVar}`))?.cssVar;
  const accent = colorToken ? `var(${colorToken})` : '#ef5a24';
  const surface = surfaceToken ? `var(${surfaceToken})` : '#f7f5f2';
  const text = textToken ? `var(${textToken})` : '#17181c';
  return {
    id: `section-${idBase}`,
    type: 'section',
    name: sentenceTitle,
    htmlTag: 'section',
    styles: { base: { display: 'flex', direction: 'column', alignItems: 'center', gap: '20px', paddingTop: '88px', paddingRight: '40px', paddingBottom: '88px', paddingLeft: '40px', background: surface, color: text, textAlign: 'center' }, tablet: { paddingTop: '64px', paddingRight: '28px', paddingBottom: '64px', paddingLeft: '28px' }, mobile: { paddingTop: '48px', paddingRight: '20px', paddingBottom: '48px', paddingLeft: '20px' } },
    children: [
      { id: `heading-${idBase}`, type: 'heading', name: 'Section heading', tag: 'h2', content: sentenceTitle, styles: { base: { maxWidth: '820px', fontSize: 'clamp(36px, 6vw, 72px)', lineHeight: '1.02', fontWeight: 700, letterSpacing: '-0.04em', color: text }, mobile: { fontSize: '40px' } } },
      { id: `text-${idBase}`, type: 'text', name: 'Section description', htmlTag: 'p', content: cleanBrief || 'Describe aquí el valor principal de esta sección y cómo ayuda a la audiencia.', styles: { base: { maxWidth: '640px', fontSize: '18px', lineHeight: '1.6', color: text, opacity: 0.78 }, mobile: { fontSize: '16px' } } },
      { id: `button-${idBase}`, type: 'button', name: 'Primary action', htmlTag: 'a', content: 'Explorar', href: '#', styles: { base: { display: 'inline-flex', paddingTop: '14px', paddingRight: '24px', paddingBottom: '14px', paddingLeft: '24px', borderRadius: '999px', background: accent, color: '#ffffff', fontWeight: 700 } } },
    ],
  };
}

function extractOrbitJsonFromAiResponse(source = '') {
  const raw = String(source || '').trim();
  const candidates = [raw];
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.unshift(fenced[1].trim());
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) candidates.push(raw.slice(first, last + 1));
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate);
      if (value && typeof value === 'object' && !Array.isArray(value)) return { ok: true, value, source: candidate };
    } catch {}
  }
  return { ok: false, value: null, source: '', error: 'No se encontró un objeto JSON válido en la respuesta.' };
}
