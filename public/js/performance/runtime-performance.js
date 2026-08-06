/** Lightweight runtime metrics used by QA and to detect duplicate listeners/frames. */
function createRuntimePerformance({ window }) {
  const metrics = {
    startedAt: performance.now(),
    resizeCallbacks: 0,
    measurementFrames: 0,
    preferenceWrites: 0,
    longTasks: 0
  };
  let observer = null;
  try {
    observer = new PerformanceObserver(list => { metrics.longTasks += list.getEntries().length; });
    observer.observe({ type: 'longtask', buffered: true });
  } catch {}
  window.__ORBIT_PERFORMANCE__ = metrics;
  return {
    increment(key) { if (key in metrics) metrics[key] += 1; },
    snapshot() { return { ...metrics, uptime: Math.round(performance.now() - metrics.startedAt) }; },
    destroy() { observer?.disconnect(); }
  };
}