import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { resolveChromePath } from './scripts/lib/chrome-path.js';

const here = dirname(fileURLToPath(import.meta.url));
const chromePath = resolveChromePath();
const profile = mkdtempSync(join(tmpdir(), 'orbit-contextual-qa-'));
const updateEvidence = process.argv.includes('--update-evidence');
const productionExportArg = process.argv.find(argument => argument.startsWith('--export-production='));
const productionExportDir = productionExportArg ? resolve(productionExportArg.split('=').slice(1).join('=')) : '';
const evidenceDir = updateEvidence
  ? join(here, 'qa-evidence')
  : mkdtempSync(join(tmpdir(), 'orbit-qa-evidence-'));
mkdirSync(evidenceDir, { recursive: true });

const portServer = createServer();
portServer.listen(0, '127.0.0.1');
await once(portServer, 'listening');
const port = portServer.address().port;
portServer.close();

const chrome = spawn(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--disable-background-networking',
  '--disable-default-apps',
  '--disable-extensions',
  '--disable-sync',
  '--no-first-run',
  '--no-default-browser-check',
  '--allow-file-access-from-files',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
chrome.stderr.resume();
let chromeSpawnError = null;
chrome.once('error', error => { chromeSpawnError = error; });

async function json(path, options) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, options);
  if (!response.ok) throw new Error(`${response.status} ${path}`);
  return response.json();
}

async function waitForTarget() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (chromeSpawnError) throw new Error(`No se pudo iniciar Chrome: ${chromeSpawnError.message}`);
    try {
      const targets = await json('/json/list');
      const page = targets.find(target => target.type === 'page');
      if (page?.webSocketDebuggerUrl) return page;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Chrome DevTools no estuvo disponible');
}

const target = await waitForTarget();
process.stderr.write('qa:target\n');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('Tiempo agotado conectando con Chrome')), 10000);
  ws.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
  ws.addEventListener('error', event => { clearTimeout(timeout); reject(event.error || new Error('Error de WebSocket')); }, { once: true });
});
process.stderr.write('qa:websocket\n');
let sequence = 0;
const pending = new Map();
const runtimeErrors = [];

ws.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const resolver = pending.get(message.id);
    if (!resolver) return;
    pending.delete(message.id);
    if (message.error) resolver.reject(new Error(message.error.message));
    else resolver.resolve(message.result);
    return;
  }
  if (message.method === 'Runtime.exceptionThrown') {
    const details=message.params.exceptionDetails;
    runtimeErrors.push(`${details.exception?.description || details.text || 'Runtime exception'}${Number.isFinite(details.lineNumber)?` @${details.lineNumber+1}:${(details.columnNumber||0)+1}`:''}`);
  }
  if (message.method === 'Runtime.consoleAPICalled' && ['error', 'assert'].includes(message.params.type)) {
    runtimeErrors.push(message.params.args.map(item => item.value || item.description || '').join(' '));
  }
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
    runtimeErrors.push(message.params.entry.text);
  }
  if (message.method === 'Page.javascriptDialogOpening') {
    call('Page.handleJavaScriptDialog', { accept: true, promptText: 'Orbit Contextual QA' }).catch(error => runtimeErrors.push(error.message));
  }
});

function call(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await call('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}

async function poll(expression, label, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await evaluate(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Tiempo agotado: ${label}${runtimeErrors.length?` · ${runtimeErrors.join(' | ')}`:''}`);
}

async function setViewport(width, height) {
  await call('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: width,
    screenHeight: height,
  });
  await evaluate(`window.dispatchEvent(new Event('resize')); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
}

async function screenshot(name) {
  const result = await call('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(join(evidenceDir, name), Buffer.from(result.data, 'base64'));
}

try {
  await call('Page.enable');
  process.stderr.write('qa:page-enabled\n');
  await call('Runtime.enable');
  await call('Log.enable');
  await call('Page.navigate', { url: pathToFileURL(join(here, 'index.html')).href });
  await poll(`document.readyState === 'complete'`, 'carga del documento');
  process.stderr.write('qa:loaded\n');
  await poll(`document.querySelector('[data-create-project="starter"]') !== null`, 'dashboard');
  await setViewport(1600,900);
  const dashboardState = await evaluate(`(() => {
    const theme=document.getElementById('dashboard-theme-toggle');
    theme.click();
    const menu=document.getElementById('theme-menu');
    const state={
      themeControl:!!theme,
      themeMenuVisible:!!menu&&!menu.hidden,
      themeChoices:menu?.querySelectorAll('[data-theme-choice]').length||0,
      themeMenuOnTop:!!menu&&menu.contains(document.elementFromPoint(menu.getBoundingClientRect().left+20,menu.getBoundingClientRect().top+20)),
    };
    menu?.querySelector('[data-theme-choice="light"]')?.click();
    state.lightApplied=document.documentElement.dataset.theme==='light';
    theme.click();
    menu?.querySelector('[data-theme-choice="dark"]')?.click();
    return state;
  })()`);
  await screenshot('orbit-dashboard-theme.png');
  await evaluate(`document.querySelector('[data-create-project="starter"]').click()`);
  await poll(`document.getElementById('project-dashboard').hidden && document.querySelectorAll('.canvas-element').length > 0`, 'apertura del editor', 160);
  process.stderr.write('qa:editor-open\n');

  const resolutions = [
    [1024, 768],
    [1600, 900],
    [3440, 1440],
  ];
  const report = [];

  for (const [width, height] of resolutions) {
    process.stderr.write(`qa:${width}x${height}\n`);
    await setViewport(width, height);
    await evaluate(`(async()=>{
      const builder=document.getElementById('builder');
      const shouldOpen=${width}>=1280;
      const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
      if(shouldOpen&&builder.classList.contains('left-collapsed'))document.getElementById('left-panel-reveal').click();
      if(!shouldOpen&&!builder.classList.contains('left-collapsed'))document.getElementById('left-panel-toggle').click();
      if(shouldOpen&&builder.classList.contains('right-collapsed'))document.getElementById('right-panel-reveal').click();
      if(!shouldOpen&&!builder.classList.contains('right-collapsed'))document.getElementById('right-panel-toggle').click();
      await wait(420);
    })()`);
    const globalState = await evaluate(`(() => {
      document.getElementById('canvas-page').dispatchEvent(new MouseEvent('click',{bubbles:true}));
      document.getElementById('fit-page').click();
      return new Promise(resolve => setTimeout(() => requestAnimationFrame(() => {
        const bar=document.getElementById('contextual-toolbar');
        const global=document.getElementById('context-global-actions');
        const dock=document.getElementById('canvas-info-dock');
        const dockRect=dock.getBoundingClientRect();
        resolve({
          mode:bar?.dataset.contextMode,
          globalVisible:!!global&&!global.hidden,
          bottomStatusPresent:!!document.getElementById('canvas-statusbar'),
          documentOverflow:document.documentElement.scrollWidth>window.innerWidth,
          toolbarWithinViewport:bar.getBoundingClientRect().left>=0&&bar.getBoundingClientRect().right<=window.innerWidth,
          accessibleActions:[...global.querySelectorAll('button')].every(button=>button.getAttribute('aria-label')),
          contextMovedToDock:!!dock.querySelector('.contextual-toolbar-copy')&&!!dock.querySelector('.contextual-toolbar-meta')&&!bar.querySelector('.contextual-toolbar-copy'),
          dockAtBottom:dockRect.bottom<=window.innerHeight&&window.innerHeight-dockRect.bottom<=16,
        });
      }),240));
    })()`);

    if (width === 1600) await screenshot('orbit-contextual-global-1600x900.png');

    const selectedState = await evaluate(`(() => {
      const first=document.querySelector('[data-id="hero-title"]')||document.querySelector('.canvas-element');
      first.dispatchEvent(new MouseEvent('click',{bubbles:true}));
      document.getElementById('fit-page').click();
      return new Promise(resolve => setTimeout(() => requestAnimationFrame(() => {
        const bar=document.getElementById('contextual-toolbar');
        const selection=document.getElementById('multi-toolbar');
        const selectionRect=selection.getBoundingClientRect();
        const selectedRect=document.querySelector('.canvas-element.is-primary-selected')?.getBoundingClientRect()||{left:0,top:0,right:0,bottom:0};
        const dock=document.getElementById('canvas-info-dock');
        const dockRect=dock.getBoundingClientRect();
        const quickRect=document.getElementById('quick-add').getBoundingClientRect();
        const canvas=document.getElementById('canvas-page').getBoundingClientRect();
        const stage=document.getElementById('canvas-stage').getBoundingClientRect();
        const workspace=document.getElementById('workspace').getBoundingClientRect();
        const workspaceStyle=getComputedStyle(document.getElementById('workspace'));
        const insetLeft=parseFloat(workspaceStyle.getPropertyValue('--canvas-inset-left'))||0;
        const insetRight=parseFloat(workspaceStyle.getPropertyValue('--canvas-inset-right'))||0;
        const visible={left:workspace.left+insetLeft,right:workspace.right-insetRight,top:bar.getBoundingClientRect().bottom,bottom:workspace.bottom};
        const inspectorActions=document.getElementById('element-actions');
        const actionButtons=[...selection.querySelectorAll('button')];
        const editRail=document.querySelector('.inspector-edit-workspace>.inspector-tabs');
        const editRailRect=editRail?.getBoundingClientRect();
        const importButton=document.getElementById('import-tools');
        const codeButton=document.getElementById('code-studio-trigger');
        const leftIcon=document.querySelector('.left-tabs [data-tab="pages"] svg')?.getBoundingClientRect();
        const rightIcon=document.querySelector('.inspector-edit-workspace>[class~="inspector-tabs"] [data-inspector-tab] svg')?.getBoundingClientRect();
        const history=document.querySelector('.history-actions'),topbar=document.querySelector('.topbar');
        const historyRect=history?.getBoundingClientRect(),topbarRect=topbar?.getBoundingClientRect();
        const isVisible=element=>{const rect=element?.getBoundingClientRect();return !!element&&rect.width>0&&rect.height>0&&getComputedStyle(element).visibility!=='hidden'&&getComputedStyle(element).opacity!=='0';};
        resolve({
          mode:bar?.dataset.contextMode,
          selectionVisible:!!selection&&!selection.hidden,
          globalHidden:document.getElementById('context-global-actions').hidden,
          inspectorActionsHidden:inspectorActions.hidden,
          accessibleActions:actionButtons.length>0&&actionButtons.every(button=>button.getAttribute('aria-label')),
          inspectorTabs:document.querySelectorAll('[role="tab"][data-inspector-tab]').length,
          inspectorPropertySearch:!!document.querySelector('[data-inspector-property-search]'),
          floatingDockAbsent:!document.querySelector('.canvas-navigation-dock'),
          minimapCanCollapse:!!document.querySelector('[data-minimap-collapse]'),
          completeOnly:!document.querySelector('.inspector-mode-switch'),
          directEditRail:!!document.querySelector('.inspector-edit-workspace>.inspector-tabs'),
          duplicateEditHeaderAbsent:!document.querySelector('.inspector-edit-content>.responsive-inspector-bar')&&!document.querySelector('.inspector-edit-content>.selection-summary'),
          editName:document.querySelector('.right-header span')?.textContent.trim()==='Editar',
          projectsInRail:!!document.querySelector('.left-tabs>#project-dashboard-trigger'),
          importInRail:isVisible(importButton),
          codeInRail:isVisible(codeButton),
          editRailAlwaysVisible:!!editRailRect&&editRailRect.left>=-2&&editRailRect.right<=window.innerWidth+2,
          responsiveGrouped:isVisible(document.getElementById('responsive-suite-trigger'))&&document.querySelectorAll('#viewport-switcher [data-bp]').length>=3&&document.querySelectorAll('#viewport-switcher .viewport-copy').length===document.querySelectorAll('#viewport-switcher [data-bp]').length,
          zoomProfessional:isVisible(document.getElementById('fit-screen'))&&isVisible(document.getElementById('zoom-menu-trigger')),
          iconParity:!!leftIcon&&!!rightIcon&&Math.abs(leftIcon.width-rightIcon.width)<=1&&Math.abs(leftIcon.height-rightIcon.height)<=1,
          saveIcon:!!document.querySelector('#save-checkpoint svg')&&!document.querySelector('#save-checkpoint .checkpoint-button-icon'),
          historyAligned:!isVisible(history)||Math.abs((historyRect.top+historyRect.bottom)/2-(topbarRect.top+topbarRect.bottom)/2)<=2,
          duplicateFooterImportAbsent:!document.getElementById('import-json'),
          themeSystem:!!document.getElementById('theme-toggle')&&!!getComputedStyle(bar).getPropertyValue('--surface-panel').trim(),
          fitSafe:canvas.left>=stage.left-2&&canvas.right<=stage.right+2&&canvas.top>=stage.top-2,
          centered:Math.abs((stage.left+stage.right)/2-(visible.left+visible.right)/2)<=2,
          alignmentDebug:{stageLeft:stage.left,stageRight:stage.right,visibleLeft:visible.left,visibleRight:visible.right,offset:getComputedStyle(document.getElementById('workspace')).getPropertyValue('--canvas-stage-offset')},
          toolbarWithinViewport:bar.getBoundingClientRect().left>=0&&bar.getBoundingClientRect().right<=window.innerWidth,
          selectionToolbarFloating:getComputedStyle(selection).position==='fixed'&&['top','right','bottom','left','inside'].includes(selection.dataset.placement),
          selectionToolbarAdjacent:Math.min(Math.abs(selectionRect.bottom-selectedRect.top),Math.abs(selectionRect.top-selectedRect.bottom),Math.abs(selectionRect.right-selectedRect.left),Math.abs(selectionRect.left-selectedRect.right))<=14||selection.dataset.placement==='inside',
          textTypographyContext:selection.classList.contains('is-text-context'),
          textFontControl:!!selection.querySelector('[data-context-text-font]'),
          textFontVariables:[...selection.querySelectorAll('[data-context-text-font] option')].some(option=>option.value.startsWith('var(--font-family')),
          fontVariableLabelsClean:[...selection.querySelectorAll('[data-context-text-font] option')].every(option=>!option.textContent.includes('◆')),
          textSizeVariables:[...selection.querySelectorAll('[data-context-text-size] option')].some(option=>option.value.startsWith('var(--font-')),
          sizeVariableLabelsClean:[...selection.querySelectorAll('[data-context-text-size] option')].every(option=>!option.textContent.includes('◆')),
          textStyleControls:selection.querySelectorAll('[data-context-text-toggle]').length===2,
          textColorControl:selection.querySelector('[data-context-text-color]')?.type==='color',
          colorTriggerIconAbsent:!selection.querySelector('[data-context-color-menu] svg'),
          textColorVariables:selection.querySelectorAll('[data-context-color-token]').length>=6,
          fixedColorPaletteAbsent:selection.querySelectorAll('[data-context-color-value]').length===0,
          customColorControl:!!selection.querySelector('.context-color-custom [data-context-text-color]'),
          textAlignmentControls:selection.querySelectorAll('[data-context-text-align]').length===4,
          inspectorColorVariables:window.innerWidth<1100||[...document.querySelectorAll('[data-inspector-color-popover]')].some(popover=>popover.querySelectorAll('[data-inspector-color-token]').length>=6),
          inspectorColorCustom:window.innerWidth<1100||!!document.querySelector('[data-inspector-color-custom]'),
          selectionToolbarDebug:{placement:selection.dataset.placement,selection:{left:selectionRect.left,top:selectionRect.top,right:selectionRect.right,bottom:selectionRect.bottom},element:{left:selectedRect.left,top:selectedRect.top,right:selectedRect.right,bottom:selectedRect.bottom}},
          contextDockVisible:dockRect.width>0&&dockRect.bottom<=window.innerHeight&&dockRect.left>=visible.left-2&&dockRect.right<=visible.right+2,
          contextDockAvoidsQuickInsert:dockRect.right<=quickRect.left-8||dockRect.top>=quickRect.bottom||dockRect.bottom<=quickRect.top,
        });
      }),240));
    })()`);
    await screenshot(`orbit-contextual-selected-${width}x${height}.png`);
    if(width===1600){
      await evaluate(`document.querySelector('[data-context-color-menu]')?.click()`);
      await new Promise(resolve=>setTimeout(resolve,180));
      await screenshot('orbit-contextual-color-palette-1600x900.png');
      await evaluate(`document.querySelector('[data-context-color-close]')?.click()`);
    }
    const deviceFit = await evaluate(`(async()=>{
      const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
      const active=document.querySelector('#viewport-switcher [data-bp].active')?.dataset.bp||'desktop';
      document.querySelector('#viewport-switcher [data-bp="mobile"]').click();await wait(650);
      const measure=()=>{const workspace=document.getElementById('workspace'),style=getComputedStyle(workspace),rect=workspace.getBoundingClientRect(),stage=document.getElementById('canvas-stage').getBoundingClientRect();const left=rect.left+(parseFloat(style.getPropertyValue('--canvas-inset-left'))||0),right=rect.right-(parseFloat(style.getPropertyValue('--canvas-inset-right'))||0);return {zoom:parseFloat(document.getElementById('zoom-label').textContent)/100,centered:Math.abs((stage.left+stage.right)/2-(left+right)/2)<=2,fits:stage.width<=right-left+2,left,right,stageLeft:stage.left,stageRight:stage.right};};
      const automatic=measure();document.getElementById('zoom-out').click();await wait(260);const reduced=measure();
      document.querySelector('#viewport-switcher [data-bp="'+active+'"]').click();await wait(520);
      return {automaticFit:automatic.fits,automaticCentered:automatic.centered,automaticZoomSafe:automatic.zoom<=1.5,zoomReduced:reduced.zoom<automatic.zoom,reducedCentered:reduced.centered,fitControl:!!document.getElementById('fit-screen')};
    })()`);
    const horizontalNavigation = await evaluate(`(async()=>{
      const wait=()=>new Promise(resolve=>setTimeout(resolve,320));
      for(let index=0;index<70;index++)document.getElementById('zoom-in').click();
      await wait();
      const workspace=document.getElementById('workspace');
      const overflow=workspace.scrollWidth>workspace.clientWidth;
      workspace.scrollLeft=Math.min(80,Math.max(0,workspace.scrollWidth-workspace.clientWidth));
      const moved=workspace.scrollLeft>0;
      document.getElementById('fit-screen').click();
      await wait();
      return {overflow,moved,debug:{zoom:document.getElementById('zoom-label').textContent,stage:document.getElementById('canvas-stage').getBoundingClientRect().width,scroll:workspace.scrollWidth,client:workspace.clientWidth}};
    })()`);
    const panelReflow = await evaluate(`(async()=>{
      const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
      const measure=()=>{
        const workspaceElement=document.getElementById('workspace');
        const workspace=workspaceElement.getBoundingClientRect();
        const style=getComputedStyle(workspaceElement);
        const left=workspace.left+(parseFloat(style.getPropertyValue('--canvas-inset-left'))||0);
        const right=workspace.right-(parseFloat(style.getPropertyValue('--canvas-inset-right'))||0);
        const stage=document.getElementById('canvas-stage').getBoundingClientRect();
        const fits=stage.width<=right-left+2;
        const aligned=fits?Math.abs((stage.left+stage.right)/2-(left+right)/2)<=2:Math.abs(stage.left-left)<=2;
        return {width:stage.width,edge:aligned};
      };
      const builder=document.getElementById('builder');
      const rightWasCollapsed=builder.classList.contains('right-collapsed');
      const beforeRight=measure();
      if(rightWasCollapsed)document.querySelector('[data-inspector-tab="design"]').click();else document.getElementById('right-panel-toggle').click();
      await wait(560);
      const rightOpenedByRail=!rightWasCollapsed||!builder.classList.contains('right-collapsed');
      const afterRight=measure();
      document.getElementById(rightWasCollapsed?'right-panel-toggle':'right-panel-reveal').click();
      await wait(560);
      const restoredRight=measure();
      const leftWasCollapsed=builder.classList.contains('left-collapsed');
      const beforeLeft=measure();
      document.getElementById(leftWasCollapsed?'left-panel-reveal':'left-panel-toggle').click();
      await wait(560);
      const afterLeft=measure();
      document.getElementById(leftWasCollapsed?'left-panel-toggle':'left-panel-reveal').click();
      await wait(560);
      const restoredLeft=measure();
      return {
        rightChanged:Math.abs(afterRight.width-beforeRight.width)>20,
        rightOpenedByRail,
        rightEdgeAfter:afterRight.edge,
        rightEdgeRestored:restoredRight.edge,
        leftChanged:Math.abs(afterLeft.width-beforeLeft.width)>20,
        leftEdgeAfter:afterLeft.edge,
        leftEdgeRestored:restoredLeft.edge,
      };
    })()`);
    if(width===1600){
      await evaluate(`(async()=>{
        const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
        const builder=document.getElementById('builder');
        if(!builder.classList.contains('left-collapsed'))document.getElementById('left-panel-toggle').click();
        if(!builder.classList.contains('right-collapsed'))document.getElementById('right-panel-toggle').click();
        await wait(420);
      })()`);
      await screenshot('orbit-fluid-panels-collapsed-1600x900.png');
      await evaluate(`(async()=>{
        const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
        document.getElementById('left-panel-reveal').click();
        document.getElementById('right-panel-reveal').click();
        await wait(420);
      })()`);
    }
    report.push({ resolution: `${width}x${height}`, globalState, selectedState, deviceFit, horizontalNavigation, panelReflow });
  }

  await setViewport(1600, 900);
  const textDirectEditSuite=await evaluate(`(async()=>{
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    document.querySelector('[data-id="hero-title"]')?.dispatchEvent(new MouseEvent('click',{bubbles:true}));await wait(120);
    let button=document.querySelector('#multi-toolbar [data-direct-toggle]');const visible=!!button&&button.getBoundingClientRect().width>0;const initiallyActive=button?.getAttribute('aria-pressed')==='true'&&button.classList.contains('is-active');
    button?.click();await wait(120);button=document.querySelector('#multi-toolbar [data-direct-toggle]');const disabled=button?.getAttribute('aria-pressed')==='false'&&!button.classList.contains('is-active')&&!document.querySelector('.canvas-element.is-primary-selected .direct-edit-overlay');
    button?.click();await wait(120);button=document.querySelector('#multi-toolbar [data-direct-toggle]');const restored=button?.getAttribute('aria-pressed')==='true'&&button.classList.contains('is-active')&&!!document.querySelector('.canvas-element.is-primary-selected .direct-edit-overlay');
    return {visible,initiallyActive,disabled,restored,accessible:!!button?.getAttribute('aria-label')};
  })()`);
  const backgroundStudioSuite=await evaluate(`(async()=>{
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));const find=(nodes,id)=>{for(const node of nodes){if(node.id===id)return node;const hit=find(node.children||[],id);if(hit)return hit;}};
    document.querySelector('[data-id="hero-section"]')?.dispatchEvent(new MouseEvent('click',{bubbles:true}));document.querySelector('[data-inspector-tab="design"]')?.click();await wait(160);
    const modes=document.querySelectorAll('[data-background-mode]').length;document.querySelector('[data-background-mode="image"]')?.click();await wait(100);
    let source=document.querySelector('[data-background-field="imageSrc"]');source.value='https://picsum.photos/seed/orbit-background-qa/1600/900';source.dispatchEvent(new Event('change',{bubbles:true}));await wait(100);
    document.querySelector('[data-background-mode="gradient"]')?.click();await wait(100);const gradientControls=!!document.querySelector('[data-background-field="gradientType"]')&&document.querySelectorAll('[data-inspector-color-menu^="backgroundConfig:gradient"]').length>=2;
    document.querySelector('[data-background-mode="overlay"]')?.click();await wait(100);source=document.querySelector('[data-background-field="imageSrc"]');source.value='https://picsum.photos/seed/orbit-background-qa/1600/900';source.dispatchEvent(new Event('change',{bubbles:true}));await wait(100);
    const opacity=document.querySelector('[data-background-field="overlayOpacity"]');opacity.value='.6';opacity.dispatchEvent(new Event('change',{bubbles:true}));await wait(120);
    const node=find(window.__ORBIT_QA__.workspaceSnapshot().nodes,'hero-section');const preview=document.querySelector('.background-preview');
    return {fourModes:modes===4,imageSource:true,gradientControls,overlayControls:!!opacity,stored:node.backgroundConfig?.mode==='overlay'&&node.backgroundConfig?.overlayOpacity===.6,composed:String(node.styles?.base?.background||'').includes('linear-gradient')&&String(node.styles?.base?.background||'').includes('url('),preview:!!preview&&preview.getBoundingClientRect().height>60};
  })()`);
  const googleFontsSuite = await evaluate(`(async()=>{
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    document.querySelector('[data-id="hero-title"]')?.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    document.querySelector('[data-inspector-tab="design"]')?.click();await wait(180);
    const trigger=document.querySelector('.font-family-stack [data-google-fonts-open]');trigger?.click();await wait(220);
    const modal=document.querySelector('.modal-card.google-font-modal'),cards=[...document.querySelectorAll('[data-google-font-card]')],search=document.querySelector('[data-google-font-search]');
    const before={opened:!!modal&&!document.getElementById('modal').hidden,catalog:cards.length>=10,search:!!search,withinViewport:!!modal&&modal.getBoundingClientRect().left>=0&&modal.getBoundingClientRect().right<=window.innerWidth&&modal.getBoundingClientRect().bottom<=window.innerHeight,aboveCanvasChrome:Number(getComputedStyle(document.getElementById('modal')).zIndex)>Number(getComputedStyle(document.getElementById('canvas-info-dock')).zIndex)};
    const inter=cards.find(card=>card.dataset.googleFontCard==='Inter')||cards[0];inter?.querySelector('[data-google-font-use]')?.click();await wait(500);
    const snapshot=window.__ORBIT_QA__.workspaceSnapshot(),token=Object.values(snapshot.tokens.typography).find(item=>item.source==='google'&&item.family==='Inter');
    const fontLink=document.getElementById('orbit-google-fonts'),html=window.__ORBIT_QA__.generatedAstro(),layout=window.__ORBIT_QA__.projectFiles().find(file=>file.name==='src/layouts/BaseLayout.astro')?.data||'';
    const selected=JSON.stringify(snapshot.nodes).includes('var(--font-google-inter)');
    return {...before,installed:!!token,weights:token?.weights?.includes(400)&&token?.weights?.includes(700),applied:selected,loaded:fontLink?.href.includes('fonts.googleapis.com/css2'),standaloneExport:html.includes('fonts.googleapis.com/css2')&&html.includes('display=swap'),astroExport:layout.includes('fonts.googleapis.com/css2')&&layout.includes('fonts.gstatic.com'),projectVariable:!!document.querySelector('[data-google-font-apply-token="var(--font-google-inter)"]')};
  })()`);
  await screenshot('orbit-google-fonts-manager-1600x900.png');
  await setViewport(1024,768);
  const googleFontsCompact = await evaluate(`(()=>{const modal=document.querySelector('.modal-card.google-font-modal'),rect=modal.getBoundingClientRect();return {withinViewport:rect.left>=0&&rect.right<=window.innerWidth&&rect.top>=0&&rect.bottom<=window.innerHeight,usableWidth:rect.width>=700,contentScroll:modal.querySelector('.modal-content').scrollHeight>=modal.querySelector('.modal-content').clientHeight};})()`);
  await screenshot('orbit-google-fonts-manager-1024x768.png');
  await setViewport(3440,1440);
  const googleFontsWide = await evaluate(`(()=>{const modal=document.querySelector('.modal-card.google-font-modal'),rect=modal.getBoundingClientRect();return {withinViewport:rect.left>=0&&rect.right<=window.innerWidth&&rect.top>=0&&rect.bottom<=window.innerHeight,controlledWidth:rect.width<=940,centered:Math.abs((rect.left+rect.right)/2-window.innerWidth/2)<=2};})()`);
  await screenshot('orbit-google-fonts-manager-3440x1440.png');
  await setViewport(1600,900);
  await evaluate(`document.querySelector('[data-close-modal]')?.click()`);
  const tokenCrudBeforeDelete = await evaluate(`(async()=>{
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    document.querySelector('[data-tab="tokens"]')?.click();await wait(160);
    document.querySelector('[data-token-add="colors"]')?.click();await wait(120);
    let form=document.querySelector('[data-token-editor-form]');
    form.querySelector('[data-token-editor-name]').value='QA Brand';
    form.querySelector('[data-token-editor-cssvar]').value='--color-qa-brand';
    form.querySelector('[data-token-editor-value]').value='#123456';
    form.requestSubmit();await wait(220);
    const created=window.__ORBIT_QA__.workspaceSnapshot().tokens.colors['qa-brand'];
    document.querySelector('[data-id="hero-title"]')?.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    document.querySelector('[data-inspector-tab="design"]')?.click();await wait(120);
    const colorTrigger=document.querySelector('[data-inspector-color-menu="color"]');colorTrigger?.click();await wait(80);
    colorTrigger?.parentElement?.querySelector('[data-inspector-color-value="var(--color-qa-brand)"]')?.click();
    await wait(120);
    document.querySelector('[data-tab="tokens"]')?.click();await wait(120);
    document.querySelector('[data-token-edit="colors:qa-brand"]')?.click();await wait(120);
    form=document.querySelector('[data-token-editor-form]');
    form.querySelector('[data-token-editor-name]').value='QA Brand Updated';
    form.querySelector('[data-token-editor-cssvar]').value='--color-qa-renamed';
    form.querySelector('[data-token-editor-value]').value='#654321';
    form.requestSubmit();await wait(220);
    const snapshot=window.__ORBIT_QA__.workspaceSnapshot();const serialized=JSON.stringify(snapshot.nodes);
    return {created:created?.value==='#123456',edited:snapshot.tokens.colors['qa-brand']?.name==='QA Brand Updated'&&snapshot.tokens.colors['qa-brand']?.value==='#654321',referenceMigrated:serialized.includes('var(--color-qa-renamed)')&&!serialized.includes('var(--color-qa-brand)'),controlsVisible:!!document.querySelector('[data-token-add="colors"]')&&!!document.querySelector('[data-token-edit="colors:qa-brand"]')&&!!document.querySelector('[data-token-delete="colors:qa-brand"]')};
  })()`);
  await screenshot('orbit-token-management-1600x900.png');
  const tokenCrudAfterDelete = await evaluate(`(async()=>{
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    document.querySelector('[data-token-delete="colors:qa-brand"]')?.click();await wait(120);
    const safeDelete=!!document.querySelector('[data-token-confirm-delete]')&&document.querySelector('.token-delete-summary')?.textContent.includes('conservará su aspecto');
    document.querySelector('[data-token-confirm-delete]')?.click();await wait(220);
    const snapshot=window.__ORBIT_QA__.workspaceSnapshot(),serialized=JSON.stringify(snapshot.nodes);
    return {safeDelete,deleted:!snapshot.tokens.colors['qa-brand'],valueMaterialized:serialized.includes('#654321')&&!serialized.includes('var(--color-qa-renamed)'),modalClosed:document.getElementById('modal').hidden};
  })()`);
  const tokenCrudSuite={...tokenCrudBeforeDelete,...tokenCrudAfterDelete};
  const inspectorColorSuite = await evaluate(`(async()=>{
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    document.querySelector('[data-id="hero-title"]')?.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    document.querySelector('[data-inspector-tab="design"]')?.click();await wait(160);
    let trigger=document.querySelector('[data-inspector-color-menu="color"]');trigger?.scrollIntoView({block:'center'});trigger?.click();await wait(100);
    let popover=trigger?.parentElement?.querySelector('[data-inspector-color-popover]');
    const rect=popover?.getBoundingClientRect()||{left:-1,right:99999,top:-1,bottom:99999};
    const visible=!!popover&&!popover.hidden;
    const projectVariables=popover?.querySelectorAll('[data-inspector-color-token]').length>=6;
    const customOnly=!!popover?.querySelector('[data-inspector-color-custom]')&&!popover?.querySelector('.palette-grid,[data-context-color-value]');
    const withinViewport=rect.left>=0&&rect.right<=window.innerWidth&&rect.top>=0&&rect.bottom<=window.innerHeight;
    popover?.querySelector('[data-inspector-color-value="var(--color-accent)"]')?.click();await wait(140);
    const find=(nodes,id)=>{for(const node of nodes||[]){if(node.id===id)return node;const hit=find(node.children,id);if(hit)return hit;}return null;};
    let snapshot=window.__ORBIT_QA__.workspaceSnapshot(),hero=find(snapshot.nodes,'hero-title');
    const colorApplied=JSON.stringify(hero).includes('var(--color-accent)');
    document.querySelector('[data-text-shadow-toggle]')?.click();await wait(100);
    trigger=document.querySelector('[data-inspector-color-menu="textShadowColor"]');trigger?.scrollIntoView({block:'center'});trigger?.click();await wait(100);
    popover=trigger?.parentElement?.querySelector('[data-inspector-color-popover]');
    popover?.querySelector('[data-inspector-color-value="var(--color-primary)"]')?.click();await wait(140);
    snapshot=window.__ORBIT_QA__.workspaceSnapshot();hero=find(snapshot.nodes,'hero-title');
    const shadowApplied=JSON.stringify(hero).includes('var(--color-primary)');
    const unified=!document.querySelector('.inspector-edit-content .color-input')&&!document.querySelector('[data-shadow-color-token]');
    trigger=document.querySelector('[data-inspector-color-menu="color"]');trigger?.scrollIntoView({block:'center'});trigger?.click();await wait(100);
    return {visible,projectVariables,customOnly,withinViewport,colorApplied,shadowApplied,unified};
  })()`);
  await screenshot('orbit-inspector-project-colors-1600x900.png');
  await evaluate(`document.querySelector('[data-inspector-color-close]')?.click()`);
  const tokenClearBefore = await evaluate(`(async()=>{
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    document.querySelector('[data-tab="tokens"]')?.click();await wait(140);
    const button=document.querySelector('[data-token-clear="colors"]'),before=Object.keys(window.__ORBIT_QA__.workspaceSnapshot().tokens.colors).length;
    button?.click();await wait(100);
    const modal=document.querySelector('.token-delete-summary'),counts=[...modal?.querySelectorAll('.token-delete-usage strong')||[]].map(item=>Number(item.textContent));
    return {buttonVisible:!!button&&!button.disabled,confirmation:!!modal&&!!document.querySelector('[data-token-confirm-clear="colors"]'),tokenCountShown:counts[0]===before&&before>=6,referencesShown:counts[1]>0};
  })()`);
  await screenshot('orbit-token-clear-category-1600x900.png');
  const tokenClearAfter = await evaluate(`(async()=>{
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    document.querySelector('[data-token-confirm-clear="colors"]')?.click();await wait(180);
    let snapshot=window.__ORBIT_QA__.workspaceSnapshot(),serialized=JSON.stringify(snapshot.nodes);
    const cleared=Object.keys(snapshot.tokens.colors).length===0;
    const referencesMaterialized=!serialized.includes('var(--color-');
    const emptyState=!!document.querySelector('.token-group-colors .token-empty-state')&&document.querySelector('[data-token-clear="colors"]')?.disabled;
    document.getElementById('undo')?.click();await wait(220);
    snapshot=window.__ORBIT_QA__.workspaceSnapshot();serialized=JSON.stringify(snapshot.nodes);
    const undoRestored=Object.keys(snapshot.tokens.colors).length>=6&&serialized.includes('var(--color-');
    return {cleared,referencesMaterialized,emptyState,undoRestored};
  })()`);
  const tokenClearSuite={...tokenClearBefore,...tokenClearAfter};
  await evaluate(`(async()=>{document.querySelector('#viewport-switcher [data-bp="mobile"]').click();await new Promise(resolve=>setTimeout(resolve,650));})()`);
  await screenshot('orbit-mobile-fit-centered-1600x900.png');
  await evaluate(`(async()=>{document.getElementById('zoom-out').click();await new Promise(resolve=>setTimeout(resolve,320));})()`);
  await screenshot('orbit-mobile-zoomout-centered-1600x900.png');
  await evaluate(`(async()=>{document.querySelector('#viewport-switcher [data-bp="desktop"]').click();await new Promise(resolve=>setTimeout(resolve,560));})()`);
  const responsiveSuite = await evaluate(`(async()=>{
    document.getElementById('fit-page').click();
    const trigger=document.getElementById('responsive-suite-trigger');trigger.click();
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const menu=document.getElementById('responsive-suite-menu');
    const rect=menu.getBoundingClientRect();const deviceLabels=[...menu.querySelectorAll('.viewport-copy small')];const deviceWidths=[...menu.querySelectorAll('.viewport-copy em')];
    return {visible:!menu.hidden,views:menu.querySelectorAll('[data-bp]').length,measurementsVisible:deviceWidths.length===deviceLabels.length&&deviceWidths.every(item=>item.textContent.includes('px')),readableLabels:deviceLabels.every(item=>parseFloat(getComputedStyle(item).fontSize)>=11),withinViewport:rect.left>=0&&rect.right<=window.innerWidth&&rect.bottom<=window.innerHeight,compare:!!menu.querySelector('#responsive-compare'),manager:!!menu.querySelector('#breakpoint-manager')};
  })()`);
  await screenshot('orbit-responsive-suite-1600x900.png');
  await setViewport(1024,768);
  const responsiveCompactLayout = await evaluate(`(async()=>{await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const rect=document.getElementById('responsive-suite-menu').getBoundingClientRect();return {withinViewport:rect.left>=0&&rect.right<=window.innerWidth&&rect.top>=0&&rect.bottom<=window.innerHeight,readable:[...document.querySelectorAll('#responsive-suite-menu .viewport-copy small')].every(item=>parseFloat(getComputedStyle(item).fontSize)>=11)};})()`);
  await screenshot('orbit-responsive-suite-1024x768.png');
  await setViewport(1600,900);
  await evaluate(`document.getElementById('responsive-suite-trigger').click()`);

  const zoomSuite = await evaluate(`(async()=>{
    const trigger=document.getElementById('zoom-menu-trigger');trigger.click();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const menu=document.getElementById('zoom-menu');return {visible:!menu.hidden,fitModes:menu.querySelectorAll('[data-zoom-fit]').length,presets:menu.querySelectorAll('[data-zoom-preset]').length,fitButton:!!document.getElementById('fit-screen')};
  })()`);
  await screenshot('orbit-zoom-controls-1600x900.png');
  await evaluate(`document.querySelector('[data-zoom-fit="screen"]').click()`);

  const guidesSuite = await evaluate(`(async()=>{
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    document.querySelector('.canvas-element')?.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    await wait(120);
    const trigger=document.getElementById('guides-menu-trigger');trigger.click();await wait(120);
    const menu=document.getElementById('guides-menu'),stage=document.getElementById('canvas-stage'),overlay=document.getElementById('smart-guides');
    const initialOrange=overlay.querySelectorAll('.smart-guide,.alt-measure-line,.selection-bounds,.measure-badge').length;
    document.getElementById('toggle-guide-visibility').click();await wait(120);
    const guidesHidden=overlay.hidden&&overlay.querySelectorAll('.smart-guide,.alt-measure-line,.selection-bounds,.measure-badge').length===0;
    const rulersIndependent=stage.classList.contains('show-rulers');
    document.getElementById('toggle-guides').click();await wait(120);
    const rulersHidden=!stage.classList.contains('show-rulers')&&document.getElementById('canvas-ruler-x').hidden&&document.getElementById('canvas-ruler-y').hidden;
    const switches=menu.querySelectorAll('[role="menuitemcheckbox"]').length;
    document.getElementById('toggle-guides').click();
    document.getElementById('toggle-guide-visibility').click();
    await wait(120);
    return {visible:!menu.hidden,permanentTrigger:!!trigger,switches:switches===4,orangeGuideExplained:menu.textContent.includes('líneas naranjas'),initialGuidesRendered:initialOrange>0,guidesHidden,rulersIndependent,rulersHidden,restored:stage.classList.contains('show-rulers')&&!overlay.hidden};
  })()`);
  await screenshot('orbit-rulers-guides-menu-1600x900.png');
  await evaluate(`(async()=>{document.getElementById('toggle-guides').click();document.getElementById('toggle-guide-visibility').click();await new Promise(resolve=>setTimeout(resolve,160));})()`);
  await screenshot('orbit-rulers-guides-hidden-1600x900.png');
  await evaluate(`(async()=>{document.getElementById('toggle-guides').click();document.getElementById('toggle-guide-visibility').click();await new Promise(resolve=>setTimeout(resolve,160));document.getElementById('guides-menu-trigger').click();})()`);

  const minimapSuite = await evaluate(`(async()=>{const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));const minimap=document.querySelector('.canvas-minimap'),button=minimap?.querySelector('[data-minimap-collapse]');if(!minimap||!button)return {available:false,canCollapse:false,canExpand:false,autoBehavior:false};const initial=minimap.classList.contains('is-collapsed');button.click();await wait(120);const toggled=minimap.classList.contains('is-collapsed');button.click();await wait(120);const restored=minimap.classList.contains('is-collapsed')===initial;const canvas=document.getElementById('canvas-page').getBoundingClientRect(),workspace=document.getElementById('workspace'),workspaceRect=workspace.getBoundingClientRect(),style=getComputedStyle(workspace),visibleWidth=workspaceRect.width-(parseFloat(style.getPropertyValue('--canvas-inset-left'))||0)-(parseFloat(style.getPropertyValue('--canvas-inset-right'))||0);const pageFits=canvas.width<=visibleWidth-12&&canvas.height<=workspaceRect.height-12;return {available:true,canCollapse:initial||toggled,canExpand:!initial||!toggled,autoBehavior:initial===pageFits,restored};})()`);

  const codeStudio = await evaluate(`(async()=>{
    document.getElementById('code-studio-trigger').click();
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const studio=document.getElementById('code-studio');const rect=studio.getBoundingClientRect();
    const html=document.getElementById('code-editor-html'),css=document.getElementById('code-editor-css'),js=document.getElementById('code-editor-js');
    studio.querySelector('[data-code-tab="js"]').click();
    js.value="document.documentElement.dataset.codeStudioQa = 'ok';";js.dispatchEvent(new Event('input',{bubbles:true}));
    studio.querySelector('[data-code-apply]').click();
    await new Promise(resolve=>setTimeout(resolve,500));
    return {opened:!studio.hidden,tabs:studio.querySelectorAll('[data-code-tab]').length,htmlReady:html.value.includes('<!doctype html>'),cssReady:css.value.includes(':root'),jsEditable:js.value.includes('codeStudioQa'),wide:rect.width>window.innerWidth*.72&&rect.height>window.innerHeight*.72,splitter:!!studio.querySelector('[data-code-splitter]'),previewDevices:studio.querySelectorAll('[data-code-preview-width]').length===3,lineMetrics:/línea/.test(document.getElementById('code-studio-metrics').textContent),applied:window.__ORBIT_QA__.generatedAstro().includes('codeStudioQa'),clean:document.getElementById('code-studio-status').textContent==='Sin cambios'};
  })()`);
  await screenshot('orbit-code-studio-1600x900.png');
  await evaluate(`document.querySelector('[data-code-close]').click()`);

  const lightTheme = await evaluate(`(() => {
    document.getElementById('canvas-page').dispatchEvent(new MouseEvent('click',{bubbles:true}));
    document.documentElement.dataset.theme='light';
    return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
      const bar=document.getElementById('contextual-toolbar');
      const global=document.getElementById('context-global-actions');
      const dock=document.getElementById('canvas-info-dock');
      const style=getComputedStyle(global);
      resolve({
        mode:bar.dataset.contextMode,
        surface:style.backgroundColor,
        color:style.color,
        visible:bar.getBoundingClientRect().height>0&&dock.getBoundingClientRect().height>0,
        themeTogglePresent:!!document.getElementById('theme-toggle'),
      });
    })));
  })()`);
  await screenshot('orbit-contextual-light-1600x900.png');

  const typographyAudit = await evaluate(`(() => {
    const selectors=['.document-name input','.left-tabs button span','.panel-intro p','.right-header>div:first-child','.inspector-edit-workspace>.inspector-tabs small','.field-label','.field input:not([type="color"])','.contextual-mode-label','.zoom-fit-options small','.guides-menu-copy small'];
    const samples=selectors.map(selector=>{const element=document.querySelector(selector);return {selector,size:element?parseFloat(getComputedStyle(element).fontSize):null};}).filter(item=>item.size!==null);
    return {samples,minimum:Math.min(...samples.map(item=>item.size)),coherent:samples.every(item=>item.size>=9.5&&item.size<=16)};
  })()`);

  const authoringExample=JSON.parse(readFileSync(join(here,'examples/landing-page-ai.orbit.json'),'utf8'));
  const sharedClassesSuite=await evaluate(`(()=>{
    const qa=window.__ORBIT_QA__;const report=qa.loadOrbitDocument(${JSON.stringify(authoringExample)},'feature-title-clarity');
    const before=qa.workspaceSnapshot();const sharedId='class-feature-title';const classBefore=before.globalClasses.find(item=>item.id===sharedId);const initialColor=classBefore.styles.base.color;
    qa.directStyle('fontSize','37px');qa.render();
    const shared=qa.workspaceSnapshot();const classAfter=shared.globalClasses.find(item=>item.id===sharedId);const titleA=(function find(nodes,id){for(const n of nodes){if(n.id===id)return n;const hit=find(n.children||[],id);if(hit)return hit;}})(shared.nodes,'feature-title-clarity');
    const titleB=(function find(nodes,id){for(const n of nodes){if(n.id===id)return n;const hit=find(n.children||[],id);if(hit)return hit;}})(shared.nodes,'feature-title-speed');
    const banner=document.querySelector('.shared-style-banner');
    qa.setSharedStyleMode('local');qa.directStyle('color','#123456');qa.render();
    const local=qa.workspaceSnapshot();const localClass=local.globalClasses.find(item=>item.id===sharedId);const localNode=(function find(nodes,id){for(const n of nodes){if(n.id===id)return n;const hit=find(n.children||[],id);if(hit)return hit;}})(local.nodes,'feature-title-clarity');
    const legacy=qa.normalizeOrbitImport({nodes:[{id:'a',type:'heading',name:'A',styles:{base:{fontSize:'20px',color:'#111'}}},{id:'b',type:'heading',name:'B',styles:{base:{fontSize:'20px',color:'#111'}}}]});
    const v13Import=qa.normalizeOrbitImport({version:13,nodes:[{id:'grid',type:'container',children:[{id:'card-1',type:'card',name:'Card 1',children:[{id:'t1',type:'heading',content:'Hero 1'},{id:'p1',type:'text',content:'Desc 1'}]},{id:'card-2',type:'card',name:'Card 2',children:[{id:'t2',type:'heading',content:'Hero 2'},{id:'p2',type:'text',content:'Desc 2'}]}]}]});
    const svg=qa.normalizeOrbitImport({nodes:[{id:'icon-search',type:'svg',name:'Search icon',htmlTag:'span',ariaLabel:'Buscar',svgCode:'<svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor"/><path d="m20 20-4-4" stroke="currentColor"/></svg>',styles:{base:{width:'24px',height:'24px',color:'#fff'}},states:{}}]});
    const astroFiles=qa.projectFiles();const layoutFile=astroFiles.find(f=>f.name==='src/layouts/BaseLayout.astro');const layoutContent=layoutFile?layoutFile.data:'';const packageContent=JSON.parse(astroFiles.find(f=>f.name==='package.json').data);
    return {classesImported:report.classes===4,assignmentsImported:report.classAssignments>=11,sharedPrimary:titleA.styleClassId===sharedId&&titleB.styleClassId===sharedId,sharedEdit:classAfter.styles.base.fontSize==='37px'&&!titleA.styles.base.fontSize&&!titleB.styles.base.fontSize,bannerVisible:!!banner&&banner.textContent.includes('3 elementos vinculados'),localOverride:localNode.styleEditMode==='local'&&localNode.styles.base.color==='#123456'&&localClass.styles.base.color===initialColor,autoDetection:legacy.report.autoClasses===1&&legacy.report.classAssignments===2,v13AutoComponents:v13Import.document.version===13&&v13Import.report.autoComponents>=1,svgIconImport:svg.document.nodes[0].type==='svg'&&svg.document.nodes[0].svgCode.includes('<svg'),productionSeoExport:layoutContent.includes('og:title')&&layoutContent.includes('schema.org')&&layoutContent.includes('twitter:card'),swiperAbsentWithoutCarousel:!packageContent.dependencies.swiper};
  })()`);

  const coreBridgeSuite=await evaluate(`(async()=>{
    const qa=window.__ORBIT_QA__,before=qa.workspaceSnapshot(),beforeNodes=JSON.stringify(before.nodes);
    const preset={name:'Core QA',app_version:'2.0.1',preferences:{root_font_size:16,min_screen_width:320,max_screen_width:1440,is_rem:true},modulesData:{COLOR_SYSTEM:{groups:[{id:'brand',name:'Brand',colors:[{id:'orange',name:'color-core-qa',value:'#f0642f'}]}]},FLUID_SPACING:{groups:[{id:'space',name:'Space',min:{size:16,scaleRatio:1.25},max:{size:24,scaleRatio:1.333},steps:'s,m,l',namingConvention:'core-space',baseScaleIndex:1}]}},styleSheetData:{}};
    const parsed=parseCoreDesignSystemSource(JSON.stringify(preset),{filename:'core-qa.json'});document.getElementById('import-tools')?.click();document.querySelector('[data-import-tab="design-system"]')?.click();const input=document.getElementById('design-system-file'),accept=input?.accept||'',transfer=new DataTransfer();transfer.items.add(new File([JSON.stringify(preset)],'core-qa.json',{type:'application/json'}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,180));
    const preview={source:document.querySelector('.core-import-summary')?.textContent.includes('Core QA'),groups:document.querySelectorAll('[data-import-token-group]').length>=2,selectable:document.querySelectorAll('[data-import-token-enabled]').length===parsed.items.length,acceptsCore:accept.includes('.core')};
    const spacing=document.querySelector('[data-import-token-group="spacing"]');spacing.checked=false;spacing.dispatchEvent(new Event('change',{bubbles:true}));const count=Number(document.querySelector('[data-import-selected-count]')?.textContent||0),selection=count===parsed.items.filter(item=>item.category!=='spacing').length;
    document.querySelector('[data-commit-design-system]')?.click();const after=qa.workspaceSnapshot(),color=Object.values(after.tokens.colors).find(item=>item.cssVar==='--color-core-qa'),spacingImported=Object.values(after.tokens.spacing).some(item=>item.cssVar.startsWith('--core-space-'));
    return {...preview,selection,applied:color?.value==='#f0642f',excluded:!spacingImported,structureProtected:JSON.stringify(after.nodes)===beforeNodes,modalClosed:document.getElementById('modal').hidden};
  })()`);

  const orbitJsonStudioSuite=await evaluate(`(()=>{
    const studio=window.__ORBIT_QA__.orbitJsonStudio;
    const parsed=studio.parse('{"version":12,"projectName":"Legacy QA","nodes":[{"id":"hero","type":"heading","level":1,"content":"QA"}]}');
    const migrated=studio.migrate(parsed.value);const migratedValidation=studio.validate(migrated.document);
    const broken={...migrated.document,nodes:[{id:'same',type:'heading',content:'<script>alert(1)</script>'},{id:'same',type:'mystery'}]};
    const brokenValidation=studio.validate(broken);const repaired=studio.repair(broken);const repairedValidation=studio.validate(repaired.document);const preview=studio.preview(repaired.document);
    const template=studio.template(),chatgpt=studio.prompt({provider:'chatgpt',brief:'QA import'}),claude=studio.prompt({provider:'claude',brief:'QA import'}),readiness=studio.readiness(template);template.nodes[0].styles.base.filter='blur(2px)';const strict=studio.validate(template);
    return {available:!!studio,parsed:parsed.ok,migrated:migrated.fromVersion===12&&migrated.document.version===13,migrationValid:migratedValidation.valid,paths:brokenValidation.errors.some(issue=>issue.path==='$.nodes[1].id'),repairValid:repairedValidation.valid&&repaired.document.nodes[1].type==='container',previewSafe:preview.includes('&lt;script&gt;alert')&&!preview.includes('<script>alert'),contracts:chatgpt.includes('CHATGPT')&&claude.includes('CLAUDE')&&readiness.ready,strictStyles:strict.errors.some(issue=>issue.code==='style.property.unsupported')};
  })()`);
  const orbitJsonStudioUi=await evaluate(`(async()=>{
    document.getElementById('import-tools')?.click();document.querySelector('[data-import-tab="orbit-json"]')?.click();
    const contractUi=!!document.querySelector('[data-orbit-ai-provider]')&&!!document.querySelector('[data-orbit-ai-brief]')&&!!document.querySelector('[data-copy-orbit-ai-prompt]')&&!!document.querySelector('[data-download-orbit-ai-template]');const beforeNodes=window.__ORBIT_QA__.workspaceSnapshot().nodes.length;
    const area=document.getElementById('import-orbit-json');area.value=JSON.stringify({version:13,projectName:'Repair UI',pageMeta:{language:'es',title:'Repair UI',description:''},tokens:{colors:{},typography:{},spacing:{},radius:{},shadows:{}},assets:[],components:[],globalClasses:[],nodes:[{id:'same',type:'heading',content:'Preview',styles:{base:{fontFamily:'Ghost Font, serif'}}},{id:'same',type:'unknown'},{id:'missing-photo',type:'image',name:'Hero photo',src:'',alt:'Hero',styles:{base:{}}}]});
    document.querySelector('[data-analyze-orbit-json]')?.click();const blocked=!!document.querySelector('.orbit-json-studio-result.is-blocked');const paths=document.querySelector('.orbit-json-issue-list')?.textContent.includes('$.nodes[1].id');const noMutation=window.__ORBIT_QA__.workspaceSnapshot().nodes.length===beforeNodes;document.querySelector('[data-repair-orbit-json]')?.click();
    const resourceInitial=document.querySelector('.orbit-resource-manager'),imageInput=document.querySelector('[data-orbit-resource-image="missing-photo"]'),transfer=new DataTransfer();transfer.items.add(new File(['<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="orange"/></svg>'],'hero.svg',{type:'image/svg+xml'}));imageInput.files=transfer.files;imageInput.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,120));const fontSelect=document.querySelector('[data-orbit-resource-font="Ghost Font"]');if(fontSelect){fontSelect.value='system';document.querySelector('[data-apply-orbit-resource-font="Ghost Font"]')?.click();}await new Promise(resolve=>setTimeout(resolve,50));
    const frame=document.getElementById('orbit-json-preview'),repairReport=document.querySelector('.orbit-json-repair-report'),resourceFinal=document.querySelector('.orbit-resource-manager');const result={opened:document.getElementById('modal-title')?.textContent==='Importar a Orbit',contractUi,blocked,paths,noMutation,preview:!!frame&&frame.getAttribute('sandbox')===''&&frame.srcdoc.includes('Preview'),readiness:!!document.querySelector('.orbit-json-readiness'),repairReport:!!repairReport,repairExplanation:repairReport?.textContent.includes('Se reparó el ID del nodo')&&repairReport?.textContent.includes('Se convirtió el tipo'),repairPaths:repairReport?.textContent.includes('$.nodes[1].id'),repairPending:repairReport?.textContent.includes('Tu proyecto todavía no ha cambiado'),resourcesDetected:resourceInitial?.textContent.includes('2 pendientes')&&!!imageInput&&!!fontSelect,resourcesReplaced:!!resourceFinal&&resourceFinal.textContent.includes('0 pendientes'),resourceChanges:document.querySelector('.orbit-resource-changes')?.textContent.includes('Ghost Font')&&document.querySelector('.orbit-resource-changes')?.textContent.includes('hero.svg'),projectStillProtected:window.__ORBIT_QA__.workspaceSnapshot().nodes.length===beforeNodes,download:!!document.querySelector('[data-download-orbit-v13]'),commit:!!document.querySelector('[data-commit-orbit-import]')};document.querySelector('[data-close-modal]')?.click();return result;
  })()`);

  const aiDesignWorkflowSuite=await evaluate(`(()=>{
    const qa=window.__ORBIT_QA__,ai=qa.aiDesignWorkflow,snapshot=qa.workspaceSnapshot();
    const context=ai.context(snapshot,{scope:'selection',selectedId:snapshot.selectedId});
    const audit=ai.audit(snapshot);const prompt=ai.prompt({context,audit,brief:'Mejorar la jerarquía sin perder el sistema visual',task:'improve'});
    const local=ai.localSection({brief:'Presenta una propuesta de valor clara',context,now:123456});
    const extracted=ai.extract('\`\`\`json\\n{"version":13,"nodes":[]}\\n\`\`\`');
    ai.open('capture');const modal=document.querySelector('.ai-workflow-modal'),workflowGrid=modal?.querySelector('.ai-workflow-grid'),workflowCards=[...(workflowGrid?.children||[])],gridRect=workflowGrid?.getBoundingClientRect(),captureRect=workflowCards[0]?.getBoundingClientRect(),intentRect=workflowCards[1]?.getBoundingClientRect();const captureUi={opened:!!modal,tabs:modal?.querySelectorAll('[data-ai-workflow-tab]').length===3,dropzone:!!modal?.querySelector('[data-ai-capture-dropzone]'),brief:!!modal?.querySelector('[data-ai-brief]'),localGeneration:!!modal?.querySelector('[data-ai-local-generate]'),readableColumns:!!captureRect&&!!intentRect&&captureRect.width>=320&&intentRect.width>=440,noHorizontalOverflow:!!gridRect&&workflowGrid.scrollWidth<=Math.ceil(gridRect.width)};
    modal?.querySelector('[data-ai-workflow-tab="audit"]')?.click();const auditUi={score:!!document.querySelector('.ai-audit-score'),issues:document.querySelectorAll('.ai-audit-issue').length===audit.issues.length,correction:!!document.querySelector('[data-ai-audit-prompt]')};
    document.querySelector('[data-close-modal]')?.click();
    return {available:!!ai,context:context.orbitDocumentVersion===13&&context.stats.nodes>=1,audit:audit.checked>=1&&Number.isFinite(audit.score),prompt:prompt.includes('Orbit JSON v13')&&prompt.includes('Mejorar la jerarquía'),local:local.type==='section'&&local.children.length===3&&!!local.styles.mobile,extract:extracted.ok&&extracted.value.version===13,captureUi,auditUi};
  })()`);

  await setViewport(820,620);
  const aiWorkflowScrollSuite=await evaluate(`(async()=>{
    const ai=window.__ORBIT_QA__.aiDesignWorkflow;ai.open('capture');await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const modal=document.querySelector('.ai-workflow-modal'),card=modal,content=modal?.querySelector('.modal-content'),tabs=modal?.querySelector('.ai-workflow-tabs'),cardRect=card?.getBoundingClientRect();
    const scrollable=!!content&&content.scrollHeight>content.clientHeight;content.scrollTop=content.scrollHeight;await new Promise(resolve=>requestAnimationFrame(resolve));const scrollWorks=content.scrollTop>0;
    const scrollContained=getComputedStyle(content).overscrollBehaviorY==='contain'&&getComputedStyle(content).overflowY==='auto';const stickyTabs=getComputedStyle(tabs).position==='sticky';
    tabs.querySelector('[data-ai-workflow-tab="audit"]')?.click();await new Promise(resolve=>requestAnimationFrame(resolve));const tabReset=content.scrollTop===0;const withinViewport=!!cardRect&&cardRect.top>=0&&cardRect.bottom<=window.innerHeight;
    document.querySelector('[data-close-modal]')?.click();return {scrollable,scrollWorks,scrollContained,stickyTabs,tabReset,withinViewport,pageFixed:document.documentElement.scrollTop===0&&document.body.scrollTop===0};
  })()`);
  await setViewport(1600,900);

  const productionExportSuite=await evaluate(`(()=>{
    const qa=window.__ORBIT_QA__;const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    qa.loadOrbitDocument({version:13,projectName:'Production QA',pageMeta:{language:'es',title:'Production QA',description:'Salida Astro lista para producción',ogImage:'/og.jpg'},assets:[{id:'asset-qa-image',name:'hero.png',alt:'Hero de producción',src:image,type:'image/png'}],nodes:[{id:'production-main',type:'section',name:'Main',htmlTag:'main',styles:{base:{}},children:[{id:'production-title',type:'heading',name:'Title',tag:'h1',htmlTag:'h1',content:'Production QA',styles:{base:{}}},{id:'production-image',type:'image',name:'Hero',src:image,alt:'Hero de producción',styles:{base:{width:'100%',maxWidth:'1200px'}}}]}]},'production-title');
    qa.productionExportSettings({siteUrl:'https://orbit.example',siteName:'Production QA',astroImage:true,sitemap:true,robots:true,webManifest:true,lighthouse:true,imageQuality:'high'});
    const report=qa.productionExportAudit(),files=qa.projectFiles(),byName=name=>files.find(file=>file.name===name)?.data||'';const pkg=JSON.parse(byName('package.json'));const page=byName('src/pages/index.astro'),layout=byName('src/layouts/BaseLayout.astro'),config=byName('astro.config.mjs'),lhci=JSON.parse(byName('lighthouserc.json'));
    qa.showProductionExport();const modal=document.querySelector('.production-export-modal');const ui={opened:!!modal,score:!!modal?.querySelector('.production-export-score'),settings:modal?.querySelectorAll('[data-production-setting]').length>=9,preflight:!!modal?.querySelector('.production-export-issues'),action:!!modal?.querySelector('[data-production-export]:not([disabled])')};modal?.querySelector('[data-close-modal]')?.click();
    return {ready:report.ready&&report.errors.length===0,astroVersion:pkg.dependencies.astro==='^7.2.6',sitemapDependency:pkg.dependencies['@astrojs/sitemap']==='^3.7.3',lighthousePinned:pkg.scripts.lighthouse.includes('@lhci/cli@0.15.1'),picture:page.includes("import { Picture } from 'astro:assets'")&&page.includes('<Picture')&&page.includes("formats={['avif','webp']}")&&page.includes(' priority'),seo:layout.includes('og:site_name')&&layout.includes('canonical')&&layout.includes('application/ld+json'),crawler:files.some(file=>file.name==='public/robots.txt')&&files.some(file=>file.name==='public/site.webmanifest'),sitemapConfig:config.includes('@astrojs/sitemap')&&config.includes('https://orbit.example'),lighthouse:lhci.ci.assert.assertions['categories:performance'][1].minScore===0.9&&lhci.ci.upload.target==='filesystem',workflow:files.some(file=>file.name==='.github/workflows/lighthouse.yml'),ui};
  })()`);
  if(productionExportDir){
    const exportedFiles=await evaluate(`window.__ORBIT_QA__.projectFiles().map(file=>({name:file.name,binary:file.data instanceof Uint8Array,data:file.data instanceof Uint8Array?Array.from(file.data):file.data}))`);
    mkdirSync(productionExportDir,{recursive:true});
    exportedFiles.forEach(file=>{const target=join(productionExportDir,file.name);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,file.binary?Buffer.from(file.data):file.data);});
    process.stderr.write(`qa:production-export:${productionExportDir}\n`);
  }

  await setViewport(1600,900);
  const swiperSuite=await evaluate(`(async()=>{
    const qa=window.__ORBIT_QA__;
    const slide=(id,label)=>({id,type:'slide',name:label,htmlTag:'article',styles:{base:{width:'100%',minHeight:'250px',paddingTop:'20px',paddingRight:'20px',paddingBottom:'20px',paddingLeft:'20px',display:'flex',direction:'column',gap:'12px',background:'var(--color-surface)',borderRadius:'16px'}},children:[{id:id+'-title',type:'heading',name:label+' title',content:label,tag:'h3',htmlTag:'h3',styles:{base:{fontSize:'24px',fontWeight:700}}},{id:id+'-copy',type:'text',name:label+' copy',content:'Contenido editable',styles:{base:{fontSize:'15px'}}}]});
    const carousel={id:'qa-carousel',type:'carousel',name:'Historias destacadas',htmlTag:'div',ariaLabel:'Historias destacadas',styles:{base:{width:'100%',minHeight:'300px'}},swiper:{slidesPerView:{desktopXL:4,desktop:3,tablet:2,mobileL:1.25,mobile:1},spaceBetween:{desktopXL:24,desktop:20,tablet:16,mobileL:14,mobile:12},speed:520,effect:'slide',direction:'horizontal',loop:true,centered:false,navigation:true,pagination:true,keyboard:true,autoplay:false,autoplayDelay:3600,pauseOnMouseEnter:true},children:[slide('qa-slide-1','Historia 01'),slide('qa-slide-2','Historia 02'),slide('qa-slide-3','Historia 03')]};
    const report=qa.loadOrbitDocument({version:13,projectName:'Swiper QA',pageMeta:{language:'es',title:'Swiper QA',description:'Carousel QA'},nodes:[{id:'qa-section',type:'section',name:'Carousel section',styles:{base:{width:'100%',minHeight:'620px',paddingTop:'80px',paddingRight:'64px',paddingBottom:'80px',paddingLeft:'64px'}},children:[carousel]}]},'qa-carousel');
    document.querySelector('[data-inspector-tab="content"]')?.click();
    const designer=document.querySelector('.canvas-carousel.is-carousel-design'),inspector=document.querySelector('.carousel-inspector');
    const speedInput=document.querySelector('[data-carousel-field="speed"]');speedInput.value='975';speedInput.dispatchEvent(new Event('input',{bubbles:true}));const instantSnapshot=qa.workspaceSnapshot();const instantCarousel=(function find(nodes,id){for(const n of nodes){if(n.id===id)return n;const hit=find(n.children||[],id);if(hit)return hit;}})(instantSnapshot.nodes,'qa-carousel');const livePayload=qa.livePreviewPayload();speedInput.dispatchEvent(new Event('change',{bubbles:true}));
    const beforeSlides=document.querySelectorAll('.canvas-slide').length;document.querySelector('[data-carousel-add-slide]')?.click();qa.setSelection('qa-carousel');qa.render();
    const standalone=qa.generatedAstro(),previewHtml=qa.generatedPreviewHtml(),serializedPreview=qa.safeInlineScriptJson(previewHtml);const files=qa.projectFiles();const packageFile=JSON.parse(files.find(file=>file.name==='package.json').data);const pageFile=files.find(file=>file.name==='src/pages/index.astro')?.data||'';
    const frame=document.createElement('iframe');frame.style.cssText='position:fixed;left:-2400px;top:0;width:1200px;height:700px;border:0';document.body.appendChild(frame);const loaded=new Promise(resolve=>{frame.onload=()=>resolve();setTimeout(resolve,5000);});frame.srcdoc=previewHtml;await loaded;await new Promise(resolve=>setTimeout(resolve,900));const previewSwiper=frame.contentDocument?.querySelector('swiper-container');const previewSlide=frame.contentDocument?.querySelector('swiper-slide');const runtimeVisible=!!previewSwiper?.swiper&&previewSwiper.getBoundingClientRect().height>0&&previewSlide?.getBoundingClientRect().height>0;frame.remove();
    return {imported:report.nodes>=9,staticDesigner:!!designer&&!document.querySelector('#canvas-page swiper-container'),inspector:!!inspector,responsiveControls:inspector?.querySelectorAll('[data-carousel-responsive]').length===2,toggles:(inspector?.querySelectorAll('[data-carousel-field]').length||0)>=8,livePreviewUi:!!inspector?.querySelector('.carousel-live-status')&&inspector?.querySelectorAll('[data-carousel-field-button="direction"]').length===2,instantControlUpdate:instantCarousel?.swiper?.speed===975&&livePayload.type==='orbit-preview-update'&&livePayload.html.includes('&quot;speed&quot;:975'),slideAdded:document.querySelectorAll('.canvas-slide').length===beforeSlides+1,standaloneElement:standalone.includes('<swiper-container')&&standalone.includes('<swiper-slide'),standaloneRuntime:standalone.includes('swiper@14.0.6')&&standalone.includes('initialize()')&&standalone.includes('watchOverflow'),previewSerializationSafe:!serializedPreview.includes('</script>')&&JSON.parse(serializedPreview)===previewHtml,previewRuntimeVisible:runtimeVisible,conditionalDependency:packageFile.dependencies.swiper==='^14.0.6',astroRuntime:pageFile.includes("swiper/element/bundle")&&pageFile.includes('data-orbit-swiper'),responsiveConfig:standalone.includes('breakpoints')};
  })()`);
  await screenshot('orbit-swiper-carousel-1600x900.png');

  const awardDashboard = await evaluate(`(async()=>{
    document.documentElement.dataset.theme='dark';
    document.getElementById('project-dashboard-trigger').click();
    await new Promise(resolve=>setTimeout(resolve,900));
    const dashboard=document.getElementById('project-dashboard'),card=document.querySelector('.project-card'),summary=document.querySelector('.project-dashboard-summary'),heading=document.querySelector('.project-dashboard-heading h1');
    const cardRect=card?.getBoundingClientRect(),summaryRect=summary?.getBoundingClientRect();
    return {visible:!dashboard.hidden,editorHidden:document.getElementById('builder').hidden,editorialHeading:!!heading?.querySelector('em'),compactSummary:!!summaryRect&&summaryRect.height<=100,projectCard:!!card,balancedCard:!!cardRect&&cardRect.width>=340&&cardRect.width<=540,svgActions:(card?.querySelectorAll('.project-card-actions svg').length||0)>=5,duplicateBlankAbsent:!document.querySelector('.project-dashboard-header [data-create-project="blank"]'),documentOverflow:document.documentElement.scrollWidth>window.innerWidth};
  })()`);
  await screenshot('orbit-award-dashboard-1600x900.png');
  await setViewport(3440,1440);
  const awardDashboardWide = await evaluate(`(async()=>{await new Promise(resolve=>setTimeout(resolve,450));const main=document.querySelector('.project-dashboard-main'),card=document.querySelector('.project-card'),heading=document.querySelector('.project-dashboard-heading h1'),textNode=heading?.firstChild;let firstLine=true;if(textNode){const range=document.createRange();range.selectNodeContents(textNode);firstLine=range.getClientRects().length===1;}const mainRect=main.getBoundingClientRect(),cardRect=card.getBoundingClientRect();return {usesWideSpace:mainRect.width/window.innerWidth>=.65,balancedProject:cardRect.width>=360&&cardRect.width<=540,headlineSingleLine:firstLine,documentOverflow:document.documentElement.scrollWidth>window.innerWidth};})()`);
  await screenshot('orbit-award-dashboard-3440x1440.png');

  const failures = report.flatMap(item => {
    const failed = [];
    for (const [key, value] of Object.entries(item.globalState)) {
      if (key === 'bottomStatusPresent' || key === 'documentOverflow') {
        if (value) failed.push(`global.${key}`);
      } else if (!value || (key === 'mode' && value !== 'global')) failed.push(`global.${key}`);
    }
    for (const [key, value] of Object.entries(item.selectedState)) {
      if (key === 'mode') { if (value !== 'selection') failed.push('selection.mode'); }
      else if (key === 'inspectorTabs') { if (value < 6) failed.push('selection.inspectorTabs'); }
      else if (key === 'selectionToolbarDebug') {}
      else if (!value) failed.push(`selection.${key}`);
    }
    for (const [key,value] of Object.entries(item.panelReflow)) if(!value) failed.push(`panels.${key}`);
    for (const [key,value] of Object.entries(item.deviceFit)) if(!value) failed.push(`device.${key}`);
    for (const [key,value] of Object.entries(item.horizontalNavigation)) if(!value) failed.push(`canvas.${key}`);
    return failed.map(check => `${item.resolution}:${check}`);
  });
  if (!dashboardState.themeControl || !dashboardState.themeMenuVisible || !dashboardState.themeMenuOnTop || dashboardState.themeChoices !== 3 || !dashboardState.lightApplied) failures.push('dashboard:theme-selector');
  for (const [key,value] of Object.entries(responsiveSuite)) if(!value) failures.push(`responsive-suite:${key}`);
  for (const [key,value] of Object.entries(responsiveCompactLayout)) if(!value) failures.push(`responsive-compact:${key}`);
  if(!zoomSuite.visible||zoomSuite.fitModes!==2||zoomSuite.presets!==4||!zoomSuite.fitButton)failures.push('zoom-suite:controls');
  for (const [key,value] of Object.entries(guidesSuite)) if(!value) failures.push(`guides-suite:${key}`);
  for (const [key,value] of Object.entries(minimapSuite)) if(!value) failures.push(`minimap-suite:${key}`);
  for (const [key,value] of Object.entries(googleFontsSuite)) if(!value) failures.push(`google-fonts:${key}`);
  for (const [key,value] of Object.entries(googleFontsCompact)) if(!value) failures.push(`google-fonts-compact:${key}`);
  for (const [key,value] of Object.entries(googleFontsWide)) if(!value) failures.push(`google-fonts-wide:${key}`);
  for (const [key,value] of Object.entries(tokenCrudSuite)) if(!value) failures.push(`token-crud:${key}`);
  for (const [key,value] of Object.entries(inspectorColorSuite)) if(!value) failures.push(`inspector-colors:${key}`);
  for (const [key,value] of Object.entries(tokenClearSuite)) if(!value) failures.push(`token-clear:${key}`);
  for (const [key,value] of Object.entries(codeStudio)) if(!value) failures.push(`code-studio:${key}`);
  for (const [key,value] of Object.entries(textDirectEditSuite)) if(!value) failures.push(`text-direct-edit:${key}`);
  for (const [key,value] of Object.entries(backgroundStudioSuite)) if(!value) failures.push(`background-studio:${key}`);
  for (const [key,value] of Object.entries(sharedClassesSuite)) if(!value) failures.push(`shared-classes:${key}`);
  for (const [key,value] of Object.entries(coreBridgeSuite)) if(!value) failures.push(`core-bridge:${key}`);
  for (const [key,value] of Object.entries(orbitJsonStudioSuite)) if(!value) failures.push(`orbit-json-studio:${key}`);
  for (const [key,value] of Object.entries(orbitJsonStudioUi)) if(!value) failures.push(`orbit-json-studio-ui:${key}`);
  for (const [key,value] of Object.entries(aiDesignWorkflowSuite)) {if(key==='captureUi'||key==='auditUi'){for(const [uiKey,uiValue] of Object.entries(value))if(!uiValue)failures.push(`ai-workflow-${key}:${uiKey}`);}else if(!value)failures.push(`ai-workflow:${key}`);}
  for (const [key,value] of Object.entries(aiWorkflowScrollSuite)) if(!value) failures.push(`ai-workflow-scroll:${key}`);
  for (const [key,value] of Object.entries(productionExportSuite)) {if(key==='ui'){for(const [uiKey,uiValue] of Object.entries(value))if(!uiValue)failures.push(`production-export-ui:${uiKey}`);}else if(!value)failures.push(`production-export:${key}`);}
  for (const [key,value] of Object.entries(swiperSuite)) if(!value) failures.push(`swiper:${key}`);
  if (lightTheme.mode !== 'global' || !lightTheme.visible || !lightTheme.themeTogglePresent || lightTheme.surface === 'rgba(0, 0, 0, 0)') failures.push('theme:light-contextual-toolbar');
  if(!typographyAudit.coherent)failures.push(`typography:scale-${typographyAudit.minimum}`);
  for(const [key,value] of Object.entries(awardDashboard)){if(key==='documentOverflow'){if(value)failures.push('award-dashboard:overflow');}else if(!value)failures.push(`award-dashboard:${key}`);}
  for(const [key,value] of Object.entries(awardDashboardWide)){if(key==='documentOverflow'){if(value)failures.push('award-wide:overflow');}else if(!value)failures.push(`award-wide:${key}`);}
  if (runtimeErrors.length) failures.push(...runtimeErrors.map(error => `runtime:${error}`));

  const output = { ok: failures.length === 0, failures, runtimeErrors, dashboardState, report, textDirectEditSuite, backgroundStudioSuite, googleFontsSuite, googleFontsCompact, googleFontsWide, tokenCrudSuite, inspectorColorSuite, tokenClearSuite, responsiveSuite, responsiveCompactLayout, zoomSuite, guidesSuite, minimapSuite, codeStudio, sharedClassesSuite, coreBridgeSuite, orbitJsonStudioSuite, orbitJsonStudioUi, aiDesignWorkflowSuite, aiWorkflowScrollSuite, productionExportSuite, swiperSuite, lightTheme, typographyAudit, awardDashboard, awardDashboardWide, evidenceDir };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (failures.length) process.exitCode = 1;
} finally {
  ws.close();
  chrome.kill('SIGTERM');
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 80 });
  if (!updateEvidence) rmSync(evidenceDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 80 });
}
