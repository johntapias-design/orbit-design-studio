/** Lightweight runtime metrics used by QA and to detect duplicate listeners/frames. */
function createRuntimePerformance({ window }) {
  const metrics = {
    startedAt: performance.now(),
    resizeCallbacks: 0,
    measurementFrames: 0,
    preferenceWrites: 0,
    longTasks: 0,
    renderCount: 0,
    renderMs: 0,
    lastRenderMs: 0,
    maxRenderMs: 0,
    canvasCommits: 0,
    canvasSkips: 0,
    saveCount: 0,
    saveMs: 0,
    lastSaveMs: 0,
    projectTier: 'standard',
    projectNodes: 0,
    projectPages: 1
  };
  let observer = null;
  try {
    observer = new PerformanceObserver(list => { metrics.longTasks += list.getEntries().length; });
    observer.observe({ type: 'longtask', buffered: true });
  } catch {}
  window.__ORBIT_PERFORMANCE__ = metrics;
  return {
    increment(key) { if (key in metrics) metrics[key] += 1; },
    recordRender(duration, profile = {}) {
      const elapsed = Math.max(0, Number(duration) || 0);
      metrics.renderCount += 1;
      metrics.renderMs += elapsed;
      metrics.lastRenderMs = elapsed;
      metrics.maxRenderMs = Math.max(metrics.maxRenderMs, elapsed);
      metrics.projectTier = profile.tier || metrics.projectTier;
      metrics.projectNodes = Number(profile.nodeCount) || 0;
      metrics.projectPages = Number(profile.pageCount) || 1;
    },
    recordSave(duration) {
      const elapsed = Math.max(0, Number(duration) || 0);
      metrics.saveCount += 1;
      metrics.saveMs += elapsed;
      metrics.lastSaveMs = elapsed;
    },
    snapshot() { return { ...metrics, uptime: Math.round(performance.now() - metrics.startedAt) }; },
    destroy() { observer?.disconnect(); }
  };
}
