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
  const add = (severity, code, path, title, detail) => issues.push({ severity, code, path, title, detail });
  const routes = new Set();
  let imageCount = 0;
  let optimizedImageCount = 0;
  let remoteImageCount = 0;

  if (!pages.length) add('error', 'pages.empty', '$.pages', 'El proyecto no tiene páginas', 'Añade al menos una página antes de exportar.');
  if ((normalized.sitemap || normalized.robots) && !normalized.siteUrl) {
    add('warning', 'site.url.missing', '$.exportSettings.siteUrl', 'Falta la URL pública', 'El proyecto compilará, pero sitemap y canonical automáticos necesitan el dominio final.');
  }

  pages.forEach((page, pageIndex) => {
    const path = `$.pages[${pageIndex}]`;
    const route = normalizeOrbitExportRoute(page?.slug, pageIndex);
    const meta = page?.meta || {};
    const nodes = orbitExportFlattenNodes(page?.nodes || []);
    const headings = nodes.filter(node => node.type === 'heading' && String(node.tag || node.level || 'h2').toLowerCase() === 'h1');

    if (routes.has(route)) add('error', 'route.duplicate', `${path}.slug`, `Ruta duplicada: ${route}`, 'Cada página debe tener una ruta única para que Astro pueda compilarla.');
    routes.add(route);
    if (!String(meta.title || '').trim()) add('error', 'seo.title.missing', `${path}.meta.title`, `Título SEO pendiente en ${page?.name || route}`, 'Define un título único y descriptivo.');
    else if (String(meta.title).length > 70) add('warning', 'seo.title.long', `${path}.meta.title`, `Título extenso en ${page?.name || route}`, 'Reduce el título a 70 caracteres o menos.');
    if (!String(meta.description || '').trim()) add('warning', 'seo.description.missing', `${path}.meta.description`, `Descripción SEO pendiente en ${page?.name || route}`, 'Añade una descripción para buscadores y redes sociales.');
    else if (String(meta.description).length > 180) add('warning', 'seo.description.long', `${path}.meta.description`, `Descripción extensa en ${page?.name || route}`, 'Reduce la descripción a 180 caracteres o menos.');
    if (!headings.length) add('warning', 'seo.h1.missing', `${path}.nodes`, `Falta un H1 en ${page?.name || route}`, 'Incluye un encabezado principal por página.');
    if (headings.length > 1) add('warning', 'seo.h1.multiple', `${path}.nodes`, `Hay ${headings.length} encabezados H1 en ${page?.name || route}`, 'Mantén un único encabezado principal por página.');

    nodes.filter(node => node.type === 'image').forEach(node => {
      imageCount += 1;
      const nodePath = `${path}.nodes#${node.id || imageCount}`;
      const src = String(node.src || '').trim();
      if (!src) add('error', 'image.src.missing', `${nodePath}.src`, 'Imagen sin archivo', 'Asigna una imagen o elimina el elemento vacío.');
      if (!String(node.alt ?? '').trim()) add('warning', 'image.alt.missing', `${nodePath}.alt`, 'Imagen sin texto alternativo', 'Describe la imagen o usa alt vacío únicamente si es decorativa.');
      if (/^https?:\/\//i.test(src)) remoteImageCount += 1;
      else if (/^data:image\//i.test(src)) optimizedImageCount += 1;
    });
  });

  const errors = issues.filter(issue => issue.severity === 'error');
  const warnings = issues.filter(issue => issue.severity === 'warning');
  const score = Math.max(0, 100 - errors.length * 18 - warnings.length * 5);
  return {
    ready: errors.length === 0,
    score,
    errors,
    warnings,
    issues,
    pages: pages.length,
    routes: [...routes],
    images: { total: imageCount, optimized: normalized.astroImage ? optimizedImageCount : 0, remote: remoteImageCount },
    settings: normalized,
  };
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
