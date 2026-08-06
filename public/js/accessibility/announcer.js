/**
 * Screen-reader announcer for transient Orbit state changes.
 * Uses dedicated polite and assertive live regions and replays repeated text.
 */
function createAnnouncer({ document, politeId = 'aria-status', assertiveId = 'aria-alert' }) {
  const regions = {
    polite: document.getElementById(politeId),
    assertive: document.getElementById(assertiveId),
  };
  const timers = new Map();

  function announce(message, { priority = 'polite', delay = 24 } = {}) {
    const region = regions[priority] || regions.polite;
    if (!region || !message) return;
    const key = priority === 'assertive' ? 'assertive' : 'polite';
    clearTimeout(timers.get(key));
    region.textContent = '';
    const timer = setTimeout(() => {
      region.textContent = String(message);
      timers.delete(key);
    }, Math.max(0, delay));
    timers.set(key, timer);
  }

  function status(message, options = {}) {
    announce(message, { ...options, priority: 'polite' });
  }

  function alert(message, options = {}) {
    announce(message, { ...options, priority: 'assertive', delay: 0 });
  }

  function destroy() {
    timers.forEach(clearTimeout);
    timers.clear();
    Object.values(regions).forEach(region => {
      if (region) region.textContent = '';
    });
  }

  return { alert, announce, destroy, regions, status };
}