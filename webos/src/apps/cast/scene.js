// Pure scene state helpers — no DOM, unit-testable.

export function addSource(sources, source) {
  return [...sources, { ...source, visible: true, z: sources.length }];
}

export function removeSource(sources, id) {
  return sources
    .filter((s) => s.id !== id)
    .map((s, i) => ({ ...s, z: i }));
}

export function toggleSource(sources, id) {
  return sources.map((s) => (s.id === id ? { ...s, visible: !s.visible } : s));
}

// Visible sources in paint order (lower z first).
export function paintOrder(sources) {
  return sources.filter((s) => s.visible).sort((a, b) => a.z - b.z);
}

// Stop every track of every source — the teardown contract. Safe to call
// twice; null/missing streams are skipped.
export function stopAll(sources) {
  for (const s of sources) {
    try { s.stream?.getTracks().forEach((t) => t.stop()); } catch { /* already dead */ }
  }
}

let seq = 0;
export function nextSourceId(prefix = 'src') {
  seq += 1;
  return `${prefix}-${seq}`;
}
