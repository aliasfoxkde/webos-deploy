// Buffer model for the Editor plugin: pure reducer + localStorage persistence.
// Buffers hold plain text; a `handle` (File System Access API) is session-only
// and never persisted, so a restored buffer with `needsHandle` must be
// re-linked via Open before Save writes in place again.

const KEY = 'webos.editor.state';
// Skip persisting when the combined text is absurdly large (quota safety).
const MAX_PERSIST = 1_500_000;

const DEFAULT_SCRATCH = `// Editor — a plain code editor inside WebOS.
// Ctrl/Cmd+S saves to a local file where the browser supports it.

const fib = (n) => (n < 2 ? n : fib(n - 1) + fib(n - 2));

const seq = [...Array(10).keys()]
  .map((i) => \`\${i}: \${fib(i)}\`)
  .join("\\n");

export default seq;
`;

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw && JSON.parse(raw);
    if (Array.isArray(parsed?.buffers) && parsed.buffers.length > 0) {
      return { ...parsed, restored: true };
    }
  } catch {
    // corrupted state falls through to defaults
  }
  return {
    buffers: [{ id: 1, name: 'scratch.js', text: DEFAULT_SCRATCH, dirty: false }],
    activeId: 1,
    nextId: 2,
  };
}

export function persist(state) {
  const total = state.buffers.reduce((n, b) => n + b.text.length, 0);
  if (total > MAX_PERSIST) return false;
  const slim = {
    buffers: state.buffers.map(({ handle, ...rest }) => ({
      ...rest,
      needsHandle: rest.needsHandle || Boolean(handle),
    })),
    activeId: state.activeId,
    nextId: state.nextId,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(slim));
    return true;
  } catch {
    return false;
  }
}

export function reducer(state, action) {
  switch (action.type) {
    case 'new': {
      const id = state.nextId;
      const name = action.name || `untitled-${id}.txt`;
      return {
        ...state,
        nextId: id + 1,
        activeId: id,
        buffers: [...state.buffers, { id, name, text: action.text ?? '', dirty: false, handle: action.handle }],
      };
    }
    case 'edit':
      return {
        ...state,
        buffers: state.buffers.map((b) =>
          b.id === state.activeId ? { ...b, text: action.text, dirty: true } : b
        ),
      };
    case 'activate':
      return { ...state, activeId: action.id };
    case 'rename':
      return {
        ...state,
        buffers: state.buffers.map((b) => (b.id === action.id ? { ...b, name: action.name, dirty: true } : b)),
      };
    case 'saved':
      // Wrote through a handle (or exported): clear dirty + handle bookkeeping.
      return {
        ...state,
        buffers: state.buffers.map((b) =>
          b.id === action.id
            ? { ...b, dirty: false, handle: action.handle ?? b.handle, needsHandle: action.handle ? false : b.needsHandle, name: action.name ?? b.name }
            : b
        ),
      };
    case 'close': {
      const buffers = state.buffers.filter((b) => b.id !== action.id);
      if (buffers.length === 0) {
        return {
          buffers: [{ id: state.nextId, name: 'scratch.js', text: '', dirty: false }],
          activeId: state.nextId,
          nextId: state.nextId + 1,
        };
      }
      const activeId = state.activeId === action.id
        ? buffers[Math.max(0, state.buffers.findIndex((b) => b.id === action.id) - 1)].id
        : state.activeId;
      return { ...state, buffers, activeId };
    }
    default:
      return state;
  }
}
