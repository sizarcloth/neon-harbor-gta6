// Save/load via localStorage: money, missions, position, owned car.
// No save = no Continue button. Everything is wrapped in try/catch so
// a blocked storage never breaks the game.
const KEY = 'neon-harbor-save-v1';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveGame(state) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(KEY);
  } catch { /* ignore */ }
}
