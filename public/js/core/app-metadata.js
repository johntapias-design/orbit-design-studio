/**
 * Single runtime source of truth for Orbit product and document versions.
 * Keep this value aligned with package.json; the engineering baseline check
 * fails when they diverge.
 */
const ORBIT_APP = Object.freeze({
  name: 'Orbit Design Studio',
  version: '0.26.0-alpha',
  versionLabel: 'v0.26',
  releaseName: 'Performance & Reliability',
  documentVersion: 13,
  supportedDocumentVersions: Object.freeze([12, 13]),
});

function currentOrbitDocumentVersion() {
  return ORBIT_APP.documentVersion;
}

function normalizeOrbitDocumentVersion(value) {
  const parsed = Number(value);
  return ORBIT_APP.supportedDocumentVersions.includes(parsed)
    ? parsed
    : currentOrbitDocumentVersion();
}
