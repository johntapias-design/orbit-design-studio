/**
 * Policies shared by the editor for large projects, autosave and crash recovery.
 * This module stays DOM-free so its behavior can be verified with unit tests.
 */
const ORBIT_RECOVERY_KIND = 'orbit-recovery-draft';
const ORBIT_RECOVERY_VERSION = 1;

function countOrbitNodes(nodes = []) {
  let count = 0;
  const stack = [...(Array.isArray(nodes) ? nodes : [])];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    count += 1;
    if (Array.isArray(node.children)) stack.push(...node.children);
  }
  return count;
}

function orbitProjectProfile({ nodes = [], pages = [], currentPageId = '' } = {}) {
  const otherPageNodes = (Array.isArray(pages) ? pages : [])
    .filter(page => page?.id !== currentPageId)
    .reduce((total, page) => total + countOrbitNodes(page?.nodes), 0);
  const nodeCount = countOrbitNodes(nodes) + otherPageNodes;
  const pageCount = Math.max(1, Array.isArray(pages) ? pages.length : 0);

  if (nodeCount >= 1200 || pageCount >= 40) {
    return { tier: 'huge', nodeCount, pageCount, autosaveDelay: 2600, recoveryDelay: 900, historyLimit: 20, maxRecoveryBytes: 4_000_000 };
  }
  if (nodeCount >= 350 || pageCount >= 15) {
    return { tier: 'large', nodeCount, pageCount, autosaveDelay: 1500, recoveryDelay: 700, historyLimit: 40, maxRecoveryBytes: 4_000_000 };
  }
  return { tier: 'standard', nodeCount, pageCount, autosaveDelay: 700, recoveryDelay: 450, historyLimit: 80, maxRecoveryBytes: 4_000_000 };
}

function orbitStringChecksum(value = '') {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function createOrbitRecoveryEnvelope({ projectId, name = '', snapshot, revision = 0, createdAt = Date.now() } = {}) {
  if (!projectId || !snapshot || typeof snapshot !== 'object') throw new Error('Recovery draft requires a project and snapshot.');
  const snapshotText = JSON.stringify(snapshot);
  const envelope = {
    kind: ORBIT_RECOVERY_KIND,
    formatVersion: ORBIT_RECOVERY_VERSION,
    projectId,
    name,
    revision: Math.max(0, Number(revision) || 0),
    createdAt: Number(createdAt) || Date.now(),
    checksum: orbitStringChecksum(snapshotText),
    snapshot,
  };
  const serialized = JSON.stringify(envelope);
  return { envelope, serialized, bytes: new Blob([serialized]).size };
}

function parseOrbitRecoveryEnvelope(raw) {
  try {
    const envelope = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (envelope?.kind !== ORBIT_RECOVERY_KIND || envelope?.formatVersion !== ORBIT_RECOVERY_VERSION || !envelope.projectId || !envelope.snapshot) return null;
    const snapshotText = JSON.stringify(envelope.snapshot);
    if (orbitStringChecksum(snapshotText) !== envelope.checksum) return null;
    return envelope;
  } catch {
    return null;
  }
}

function createOrbitAutosaveScheduler({ window, getProfile, save, persistRecovery, onState = () => {} }) {
  let revision = 0;
  let savedRevision = 0;
  let saveTimer = 0;
  let recoveryTimer = 0;
  let retryTimer = 0;
  let retryCount = 0;
  let inFlight = null;
  let pending = false;

  const clearTimer = timer => { if (timer) window.clearTimeout(timer); };
  function cancelTimers() {
    clearTimer(saveTimer); clearTimer(recoveryTimer); clearTimer(retryTimer);
    saveTimer = recoveryTimer = retryTimer = 0;
  }
  function profile() { return getProfile?.() || orbitProjectProfile(); }
  function writeRecovery(reason) {
    clearTimer(recoveryTimer); recoveryTimer = 0;
    try { return persistRecovery?.({ revision, reason }); } catch { return false; }
  }
  function scheduleSave(delay) {
    clearTimer(saveTimer);
    saveTimer = window.setTimeout(() => { saveTimer = 0; void flush('idle', { recovery: false }); }, Math.max(0, delay));
  }
  async function runSave(reason, targetRevision) {
    onState('saving', { revision: targetRevision, reason, retryCount });
    try {
      await save({ revision: targetRevision, reason });
      savedRevision = Math.max(savedRevision, targetRevision);
      retryCount = 0;
      onState(savedRevision >= revision ? 'saved' : 'dirty', { revision, savedRevision, reason });
    } catch (error) {
      if (retryCount < 3) {
        retryCount += 1;
        const delay = 600 * (2 ** (retryCount - 1));
        onState('retrying', { revision, reason, retryCount, delay, error });
        clearTimer(retryTimer);
        retryTimer = window.setTimeout(() => { retryTimer = 0; void flush('retry', { recovery: false }); }, delay);
      } else {
        onState('error', { revision, reason, retryCount, error });
      }
      return null;
    } finally {
      inFlight = null;
      if (pending || (savedRevision < revision && retryCount < 3)) {
        pending = false;
        if (!retryTimer) scheduleSave(0);
      }
    }
  }
  function flush(reason = 'manual', { recovery = true } = {}) {
    clearTimer(saveTimer); saveTimer = 0;
    if (recovery) writeRecovery(reason);
    if (inFlight) { pending = true; return inFlight; }
    const targetRevision = revision;
    inFlight = runSave(reason, targetRevision);
    return inFlight;
  }
  function markDirty() {
    revision += 1;
    const current = profile();
    clearTimer(recoveryTimer);
    recoveryTimer = window.setTimeout(() => writeRecovery('idle'), current.recoveryDelay);
    scheduleSave(current.autosaveDelay);
    onState('dirty', { revision, savedRevision, profile: current });
    return revision;
  }
  function reset(nextRevision = 0, nextSavedRevision = nextRevision) {
    cancelTimers();
    revision = Math.max(0, Number(nextRevision) || 0);
    savedRevision = Math.max(0, Number(nextSavedRevision) || 0);
    retryCount = 0; pending = false; inFlight = null;
  }
  function snapshot() { return { revision, savedRevision, retryCount, pending, saving: !!inFlight }; }

  return { flush, markDirty, reset, snapshot, writeRecovery };
}
