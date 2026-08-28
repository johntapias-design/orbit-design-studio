/**
 * DOM-free helpers for Orbit Production Export.
 * The editor owns rendering and downloads; this module owns deterministic
 * settings, preflight analysis, and generated production configuration.
 */
const ORBIT_PRODUCTION_EXPORT_DEFAULTS = Object.freeze({
  componentize: true,
  astroImage: true,
  splitCss: true,
  minify: false,
  siteUrl: '',
  siteName: '',
  author: '',
  sitemap: true,
  robots: true,
  webManifest: true,
  lighthouse: true,
  imageQuality: 'high',
});

function normalizeOrbitSiteUrl(value = '') {
  const source = String(value || '').trim();
  if (!source) return '';
  try {
    const url = new URL(source);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.hash = '';
    url.search = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

function normalizeOrbitProductionExportSettings(settings = {}, projectName = '') {
  const merged = { ...ORBIT_PRODUCTION_EXPORT_DEFAULTS, ...(settings || {}) };
  return {
    componentize: merged.componentize !== false,
    astroImage: merged.astroImage !== false,
    splitCss: merged.splitCss !== false,
    minify: !!merged.minify,
    siteUrl: normalizeOrbitSiteUrl(merged.siteUrl),
    siteName: String(merged.siteName || projectName || 'Orbit site').trim(),
    author: String(merged.author || '').trim(),
    sitemap: merged.sitemap !== false,
    robots: merged.robots !== false,
    webManifest: merged.webManifest !== false,
    lighthouse: merged.lighthouse !== false,
    imageQuality: ['low', 'mid', 'high', 'max'].includes(merged.imageQuality) ? merged.imageQuality : 'high',
  };
}

function orbitExportFlattenNodes(nodes = []) {
  const result = [];
  (function walk(items) {
    (items || []).forEach(node => {
      if (!node || typeof node !== 'object') return;
      result.push(node);
      walk(node.children || []);
    });
  })(nodes);
  return result;
}

function normalizeOrbitExportRoute(value = '/', index = 0) {
  let route = String(value || '').trim();
  if (!route) route = index === 0 ? '/' : `/page-${index + 1}`;
  route = `/${route.replace(/^\/+|\/+$/g, '')}`;
  return route === '/' ? route : route.replace(/\/{2,}/g, '/');
}

function auditOrbitProductionExport(project = {}, settings = {}) {
  const normalized = normalizeOrbitProductionExportSettings(settings, project.projectName);
  const pages = Array.isArray(project.pages) && project.pages.length
    ? project.pages
    : [{ id: 'page-home', name: project.projectName || 'Home', slug: '/', nodes: project.nodes || [], meta: project.pageMeta || {} }];
  const issues = [];
  const add = (severity, area, code, path, title, detail) => issues.push({ severity, area, code, path, title, detail });
  const routes = new Set();
  let imageCount = 0;
  let optimizedImageCount = 0;
  let remoteImageCount = 0;

  if (!pages.length) add('error', 'structure', 'pages.empty', '$.pages', 'El proyecto no tiene páginas', 'Añade al menos una página antes de exportar.');
  if ((normalized.sitemap || normalized.robots) && !normalized.siteUrl) {
    add('warning', 'seo', 'site.url.missing', '$.exportSettings.siteUrl', 'Falta la URL pública', 'El proyecto compilará, pero sitemap y canonical automáticos necesitan el dominio final.');
  }

  pages.forEach((page, pageIndex) => {
    const path = `$.pages[${pageIndex}]`;
    const route = normalizeOrbitExportRoute(page?.slug, pageIndex);
    const meta = page?.meta || {};
    const nodes = orbitExportFlattenNodes(page?.nodes || []);
    const headings = nodes.filter(node => node.type === 'heading' && String(node.tag || node.level || 'h2').toLowerCase() === 'h1');
    const nodeIds = new Set();
    let previousHeadingLevel = 0;

    if (routes.has(route)) add('error', 'structure', 'route.duplicate', `${path}.slug`, `Ruta duplicada: ${route}`, 'Cada página debe tener una ruta única para que Astro pueda compilarla.');
    routes.add(route);
    if (!String(meta.language || '').trim()) add('warning', 'accessibility', 'page.language.missing', `${path}.meta.language`, `Idioma pendiente en ${page?.name || route}`, 'Define el idioma para lectores de pantalla y buscadores.');
    if (!String(meta.title || '').trim()) add('error', 'seo', 'seo.title.missing', `${path}.meta.title`, `Título SEO pendiente en ${page?.name || route}`, 'Define un título único y descriptivo.');
    else if (String(meta.title).length > 70) add('warning', 'seo', 'seo.title.long', `${path}.meta.title`, `Título extenso en ${page?.name || route}`, 'Reduce el título a 70 caracteres o menos.');
    if (!String(meta.description || '').trim()) add('warning', 'seo', 'seo.description.missing', `${path}.meta.description`, `Descripción SEO pendiente en ${page?.name || route}`, 'Añade una descripción para buscadores y redes sociales.');
    else if (String(meta.description).length > 180) add('warning', 'seo', 'seo.description.long', `${path}.meta.description`, `Descripción extensa en ${page?.name || route}`, 'Reduce la descripción a 180 caracteres o menos.');
    if (!headings.length) add('warning', 'seo', 'seo.h1.missing', `${path}.nodes`, `Falta un H1 en ${page?.name || route}`, 'Incluye un encabezado principal por página.');
    if (headings.length > 1) add('warning', 'seo', 'seo.h1.multiple', `${path}.nodes`, `Hay ${headings.length} encabezados H1 en ${page?.name || route}`, 'Mantén un único encabezado principal por página.');

    nodes.forEach((node, nodeIndex) => {
      const nodePath = `${path}.nodes#${node.id || nodeIndex + 1}`;
      if (node.id && nodeIds.has(node.id)) add('error', 'structure', 'node.id.duplicate', `${nodePath}.id`, `Identificador repetido: ${node.id}`, 'Cada elemento debe tener un identificador único.');
      if (node.id) nodeIds.add(node.id);
      if (node.type === 'heading') {
        const level = Number(String(node.tag || node.level || 'h2').replace(/\D/g, '')) || 2;
        if (previousHeadingLevel && level > previousHeadingLevel + 1) add('warning', 'accessibility', 'heading.level.jump', nodePath, 'Salto en la jerarquía de títulos', `El encabezado cambia de H${previousHeadingLevel} a H${level}.`);
        previousHeadingLevel = level;
      }
      if (['button', 'link'].includes(node.type) && !String(node.content || node.ariaLabel || '').trim()) {
        add('error', 'accessibility', 'interactive.name.missing', nodePath, 'Control sin nombre accesible', 'Añade texto visible o una etiqueta ARIA.');
      }
      if (node.type === 'link' && (!String(node.href || '').trim() || node.href === '#')) {
        add('warning', 'accessibility', 'link.href.placeholder', `${nodePath}.href`, 'Enlace sin destino real', 'Reemplaza # por una URL o ruta válida.');
      }
      if (node.type === 'input' && !String(node.ariaLabel || '').trim()) {
        add('warning', 'accessibility', 'form.label.missing', nodePath, 'Campo sin etiqueta accesible', 'Añade una etiqueta ARIA que explique qué dato debe ingresar el usuario.');
      }
      if (node.type === 'video' && !String(node.title || node.ariaLabel || '').trim()) {
        add('warning', 'accessibility', 'video.title.missing', nodePath, 'Video sin título', 'Describe el contenido del video para tecnologías de asistencia.');
      }
    });

    nodes.filter(node => node.type === 'image').forEach(node => {
      imageCount += 1;
      const nodePath = `${path}.nodes#${node.id || imageCount}`;
      const src = String(node.src || '').trim();
      if (!src) add('error', 'performance', 'image.src.missing', `${nodePath}.src`, 'Imagen sin archivo', 'Asigna una imagen o elimina el elemento vacío.');
      if (!String(node.alt ?? '').trim()) add('warning', 'accessibility', 'image.alt.missing', `${nodePath}.alt`, 'Imagen sin texto alternativo', 'Describe la imagen o marca explícitamente la imagen como decorativa.');
      if (/^https?:\/\//i.test(src)) remoteImageCount += 1;
      else if (/^data:image\//i.test(src)) optimizedImageCount += 1;
    });
    if (nodes.length > 1500) add('warning', 'performance', 'page.nodes.large', `${path}.nodes`, `Página grande: ${nodes.length} elementos`, 'Divide contenido no esencial o reutiliza componentes para reducir el trabajo inicial del navegador.');
  });

  if (remoteImageCount) add('warning', 'performance', 'image.remote.unoptimized', '$.pages', `${remoteImageCount} imágenes externas`, 'Orbit no puede comprimir recursos alojados en otros dominios; conviene importarlos antes de exportar.');

  const errors = issues.filter(issue => issue.severity === 'error');
  const warnings = issues.filter(issue => issue.severity === 'warning');
  const score = Math.max(0, 100 - errors.length * 18 - warnings.length * 5);
  const quality = Object.fromEntries(['seo', 'accessibility', 'performance', 'structure'].map(area => {
    const areaIssues = issues.filter(issue => issue.area === area);
    return [area, Math.max(0, 100 - areaIssues.filter(issue => issue.severity === 'error').length * 25 - areaIssues.filter(issue => issue.severity === 'warning').length * 8)];
  }));
  return {
    ready: errors.length === 0,
    score,
    errors,
    warnings,
    issues,
    pages: pages.length,
    routes: [...routes],
    images: { total: imageCount, optimized: normalized.astroImage ? optimizedImageCount : 0, remote: remoteImageCount },
    quality,
    settings: normalized,
  };
}

function createOrbitProductionReadinessReport(report = {}) {
  return JSON.stringify({
    format: 'orbit-production-readiness',
    version: 1,
    ready: !!report.ready,
    score: Number(report.score) || 0,
    quality: report.quality || { seo: 0, accessibility: 0, performance: 0, structure: 0 },
    pages: Number(report.pages) || 0,
    routes: report.routes || [],
    images: report.images || { total: 0, optimized: 0, remote: 0 },
    issues: (report.issues || []).map(({ severity, area, code, path, title, detail }) => ({ severity, area, code, path, title, detail })),
    checklist: {
      html: 'HTML estático incluido en la raíz del ZIP',
      astro: 'Código fuente Astro incluido en src/',
      seo: 'Metadatos, sitemap y robots revisados en el pre-flight',
      accessibility: 'Nombres accesibles, alternativas y jerarquía revisados',
      performance: 'Imágenes y límites Lighthouse configurados',
    },
  }, null, 2);
}

function createOrbitNetlifyConfig() {
  return `[build]\n  command = "npm run build"\n  publish = "dist"\n\n[build.environment]\n  NODE_VERSION = "26"\n\n[[headers]]\n  for = "/*"\n  [headers.values]\n    X-Content-Type-Options = "nosniff"\n    Referrer-Policy = "strict-origin-when-cross-origin"\n    Permissions-Policy = "camera=(), microphone=(), geolocation=()"\n\n[[headers]]\n  for = "/assets/*"\n  [headers.values]\n    Cache-Control = "public, max-age=31536000, immutable"\n`;
}

function createOrbitAstroConfig(settings = {}, projectName = '') {
  const normalized = normalizeOrbitProductionExportSettings(settings, projectName);
  const imports = ["import { defineConfig } from 'astro/config';"];
  const integrations = [];
  if (normalized.sitemap && normalized.siteUrl) {
    imports.push("import sitemap from '@astrojs/sitemap';");
    integrations.push('sitemap()');
  }
  const lines = [
    `  output: 'static',`,
    `  compressHTML: true,`,
    normalized.siteUrl ? `  site: ${JSON.stringify(normalized.siteUrl)},` : '',
    integrations.length ? `  integrations: [${integrations.join(', ')}],` : '',
  ].filter(Boolean);
  return `${imports.join('\n')}\n\nexport default defineConfig({\n${lines.join('\n')}\n});\n`;
}

function createOrbitRobotsTxt(settings = {}, projectName = '') {
  const normalized = normalizeOrbitProductionExportSettings(settings, projectName);
  const lines = ['User-agent: *', 'Allow: /'];
  if (normalized.sitemap && normalized.siteUrl) lines.push('', `Sitemap: ${normalized.siteUrl}/sitemap-index.xml`);
  return `${lines.join('\n')}\n`;
}

function createOrbitWebManifest(settings = {}, projectName = '') {
  const normalized = normalizeOrbitProductionExportSettings(settings, projectName);
  return JSON.stringify({
    name: normalized.siteName,
    short_name: normalized.siteName.slice(0, 24),
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ef5a24',
  }, null, 2);
}

function createOrbitLighthouseConfig(routes = ['/']) {
  const urls = [...new Set((routes || ['/']).map((route, index) => normalizeOrbitExportRoute(route, index)))].slice(0, 5);
  return JSON.stringify({
    ci: {
      collect: {
        staticDistDir: './dist',
        numberOfRuns: 3,
        url: urls.map(route => `http://localhost${route}`),
      },
      assert: {
        assertions: {
          'categories:performance': ['error', { minScore: 0.9, aggregationMethod: 'median-run' }],
          'categories:accessibility': ['error', { minScore: 0.95, aggregationMethod: 'median-run' }],
          'categories:best-practices': ['error', { minScore: 0.9, aggregationMethod: 'median-run' }],
          'categories:seo': ['error', { minScore: 0.95, aggregationMethod: 'median-run' }],
          'cumulative-layout-shift': ['error', { maxNumericValue: 0.1, aggregationMethod: 'median-run' }],
          'largest-contentful-paint': ['error', { maxNumericValue: 2500, aggregationMethod: 'median-run' }],
          'total-blocking-time': ['error', { maxNumericValue: 300, aggregationMethod: 'median-run' }],
        },
      },
      upload: { target: 'filesystem', outputDir: './lighthouse-reports' },
    },
  }, null, 2);
}

function createOrbitProductionPackage({ name = 'orbit-site', usesSwiper = false, settings = {} } = {}) {
  const normalized = normalizeOrbitProductionExportSettings(settings, name);
  const dependencies = { astro: '^7.2.6' };
  if (normalized.sitemap && normalized.siteUrl) dependencies['@astrojs/sitemap'] = '^3.7.3';
  if (usesSwiper) dependencies.swiper = '^14.0.6';
  return {
    name,
    version: '1.0.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'astro dev',
      build: 'astro build',
      preview: 'astro preview',
      ...(normalized.lighthouse ? { lighthouse: 'npx --yes @lhci/cli@0.15.1 autorun' } : {}),
    },
    dependencies,
  };
}
