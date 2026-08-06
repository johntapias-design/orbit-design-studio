/** Centralized DOM registry for Orbit. */
function createDomRegistry(root = document) {
  const $ = selector => root.querySelector(selector);
  const els = {
    builder:$('#builder'), left:$('#left-content'), canvas:$('#canvas-page'), shell:$('#canvas-shell'), stage:$('#canvas-stage'),
    workspace:$('#workspace'), inspector:$('#inspector'), actions:$('#element-actions'), viewport:$('#viewport-switcher'), rightPanel:$('#right-panel'), leftPanel:$('#left-panel'),
    size:$('#canvas-size'), width:$('#canvas-width'), zoomLabel:$('#zoom-label'), saveDot:$('#save-dot'), saveLabel:$('#save-label'),
    toast:$('#toast'), breadcrumbs:$('#breadcrumbs'), indicator:$('#drop-indicator'), modal:$('#modal'), modalContent:$('#modal-content'),
    multiToolbar:$('#multi-toolbar'), canvasInfoDock:$('#canvas-info-dock'), smartGuides:$('#smart-guides'), rulerX:$('#canvas-ruler-x'), rulerY:$('#canvas-ruler-y'), canvasStatus:$('#canvas-statusbar'), focusViewHud:$('#focus-view-hud'),
    assetUpload:$('#asset-upload'), jsonUpload:$('#json-upload'), projectName:$('#project-name'),
    commandPalette:$('#command-palette'), commandInput:$('#command-palette-input'), commandResults:$('#command-palette-results'),
    quickInsert:$('#quick-insert-popover'), quickInsertInput:$('#quick-insert-input'), quickInsertResults:$('#quick-insert-results'),
    dashboard:$('#project-dashboard'), projectGrid:$('#project-grid'), projectEmpty:$('#project-empty'), projectSearch:$('#project-search'),
    recoveryBanner:$('#project-recovery-banner'), recoveryCopy:$('#project-recovery-copy'), checkpointDrawer:$('#checkpoint-drawer'),
    checkpointList:$('#checkpoint-list'), checkpointDrawerTitle:$('#checkpoint-drawer-title'), projectBackupUpload:$('#project-backup-upload'),
    projectSort:$('#project-sort'), projectArchiveToggle:$('#project-archive-toggle'), storageDetail:$('#workspace-storage-detail'),
    responsiveCompare:$('#responsive-compare-panel'), shortcutHelp:$('#shortcut-help'), ariaStatus:$('#aria-status'), ariaAlert:$('#aria-alert'), assetReplaceUpload:$('#asset-replace-upload')
  };
  return { $, els };
}