/* AI chat adapters — the integration seam for real models.
   An adapter is:
     { id, label, ready: () => boolean, run: (messages, { signal }) => AsyncGenerator<string> }
   `run` yields assistant text chunks (streaming-ready); a thrown error is
   shown inline in the thread. `ready()` false means "not configured" and the
   UI must say so honestly — no canned fake answers. */

const echo = {
  id: 'echo',
  label: 'No model configured',
  ready: () => false,
  async *run() {
    yield 'No AI model is configured yet — this WebOS build ships with the adapter API only (see src/apps/chat/adapters.js). Wire a provider adapter here and replies will stream into this thread.';
  },
};

export const ADAPTERS = [echo];
export const adapterById = (id) => ADAPTERS.find((a) => a.id === id) || echo;
