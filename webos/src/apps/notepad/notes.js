/* Notepad note store: pure functions + localStorage persistence. Notes are
   { id, title, text, created, mtime }; autosave is a debounced persist of
   the whole list (notes are small; quota safety caps the payload). */

const KEY = 'webos.notepad.v1';
// Skip persisting absurd payloads (quota safety, same spirit as the Editor).
const MAX_PERSIST = 1_500_000;

const seed = () => [{
  id: 1,
  title: 'Welcome',
  text: [
    'Notes autosave here as you type — close the window, reload, they persist.',
    '',
    'Title a note like ideas.md (or .txt) and it gains a matching preview:',
    '## Markdown works',
    '- **bold**, *italic*, `code`',
    '- links and tables render in Preview',
    '',
    'Use "Save to Files" to export a copy into the WebOS disk.',
  ].join('\n'),
  created: Date.now(),
  mtime: Date.now(),
}];

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw && JSON.parse(raw);
    if (Array.isArray(parsed?.notes)) return { ...parsed, restored: true };
  } catch {
    // corrupted state falls through to defaults
  }
  return { notes: seed(), activeId: 1, nextId: 2 };
}

export function persistState(state) {
  const size = state.notes.reduce((n, x) => n + x.title.length + x.text.length, 0);
  if (size > MAX_PERSIST) return false;
  try {
    localStorage.setItem(KEY, JSON.stringify({ notes: state.notes, activeId: state.activeId }));
    return true;
  } catch {
    return false;
  }
}

export function uniqueTitle(notes, base, skipId = null) {
  const taken = new Set(notes.filter((n) => n.id !== skipId).map((n) => n.title.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`.toLowerCase())) n += 1;
  return `${base} ${n}`;
}

export function createNote(state, title = 'Untitled') {
  const id = state.nextId;
  const now = Date.now();
  return {
    ...state,
    nextId: id + 1,
    activeId: id,
    notes: [...state.notes, { id, title: uniqueTitle(state.notes, title), text: '', created: now, mtime: now }],
  };
}

export function updateNote(state, id, patch) {
  return {
    ...state,
    notes: state.notes.map((n) => (n.id === id ? { ...n, ...patch, mtime: Date.now() } : n)),
  };
}

export function renameNote(state, id, title) {
  const clean = String(title || '').trim() || 'Untitled';
  return updateNote(state, id, { title: uniqueTitle(state.notes, clean, id) });
}

export function deleteNote(state, id) {
  const notes = state.notes.filter((n) => n.id !== id);
  if (!notes.length) {
    const fresh = createNote({ notes: [], nextId: state.nextId }, 'Untitled');
    return fresh;
  }
  const activeId = state.activeId === id ? notes[notes.length - 1].id : state.activeId;
  return { ...state, notes, activeId };
}

/* Case-insensitive substring match across title + text; empty query = all. */
export function searchNotes(notes, q) {
  const needle = q.trim().toLowerCase();
  if (!needle) return notes;
  return notes.filter((n) => n.title.toLowerCase().includes(needle) || n.text.toLowerCase().includes(needle));
}

/* Most-recently-edited first. */
export const byRecency = (a, b) => b.mtime - a.mtime;

export const isMdTitle = (title) => /\.(md|mdx|markdown)$/i.test(title || '');

export const exportName = (title, taken = new Set()) => {
  const base = (String(title || 'note').trim() || 'note').replace(/[\\/:*?"<>|]+/g, '-');
  const name = isMdTitle(base) ? base : `${base}.md`;
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let n = 2;
  while (taken.has(`${stem}-${n}${ext}`)) n += 1;
  return `${stem}-${n}${ext}`;
};
