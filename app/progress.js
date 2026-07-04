/* Read-progress tracking in localStorage. Key per module: F3/M3 → "read:F3/M3". */

const PREFIX = 'ledgerbook.read:';

export function isRead(unitId, moduleId) {
  try {
    return localStorage.getItem(PREFIX + unitId + '/' + moduleId) === '1';
  } catch {
    return false;
  }
}

export function setRead(unitId, moduleId, value) {
  try {
    if (value) {
      localStorage.setItem(PREFIX + unitId + '/' + moduleId, '1');
    } else {
      localStorage.removeItem(PREFIX + unitId + '/' + moduleId);
    }
  } catch {
    /* storage unavailable (private mode) — feature degrades silently */
  }
}

export function unitProgress(unit) {
  const ready = unit.modules.filter((m) => m.status === 'ready');
  const read = ready.filter((m) => isRead(unit.id, m.id));
  return { read: read.length, total: unit.modules.length };
}
