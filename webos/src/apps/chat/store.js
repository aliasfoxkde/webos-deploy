/* Shared chat history (the app window and the sidebar widget both use it).
   Persisted under webos.chat.history; components sync via the webos:chat
   window event. Capped — old turns fall off the front. */
const KEY = 'webos.chat.history';
const CAP = 100;

export const loadHistory = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
};

export const saveHistory = (msgs) => {
  try { localStorage.setItem(KEY, JSON.stringify(msgs.slice(-CAP))); } catch { /* private mode */ }
  window.dispatchEvent(new CustomEvent('webos:chat'));
};

export const clearHistory = () => {
  try { localStorage.removeItem(KEY); } catch { /* private mode */ }
  window.dispatchEvent(new CustomEvent('webos:chat'));
};

export const onHistory = (fn) => {
  window.addEventListener('webos:chat', fn);
  return () => window.removeEventListener('webos:chat', fn);
};
