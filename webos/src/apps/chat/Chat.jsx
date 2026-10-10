import React, { useCallback, useEffect, useRef, useState } from 'react';
import { adapterById, ADAPTERS } from './adapters.js';
import { loadHistory, saveHistory, clearHistory, onHistory } from './store.js';
import './chat.css';

/* AI Chat — message thread over a streaming-ready adapter interface.
   Ships with the honest "no model configured" adapter; wiring a provider
   into adapters.js is all a real integration needs. History persists. */
export default function ChatApp() {
  const [msgs, setMsgs] = useState(loadHistory);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const adapter = adapterById(localStorage.getItem('webos.chat.adapter') || 'echo');
  const scroller = useRef(null);
  const abort = useRef(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; abort.current?.abort(); }, []);
  useEffect(() => onHistory(() => { if (alive.current) setMsgs(loadHistory()); }), []);

  const scrollDown = () => { const el = scroller.current; if (el) el.scrollTop = el.scrollHeight; };
  useEffect(scrollDown, [msgs.length, busy]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    const user = { id: `u${Date.now()}`, role: 'user', text, t: Date.now() };
    const afterUser = [...loadHistory(), user];
    saveHistory(afterUser);
    setMsgs(afterUser);
    setBusy(true);
    const ctrl = new AbortController();
    abort.current = ctrl;
    const ai = { id: `a${Date.now()}`, role: 'assistant', text: '', t: Date.now() };
    try {
      for await (const chunk of adapter.run(afterUser.slice(-20), { signal: ctrl.signal })) {
        ai.text += chunk;
        if (alive.current) setMsgs([...afterUser, { ...ai }]);
      }
    } catch (err) {
      if (!ctrl.signal.aborted) ai.text += `${ai.text ? '\n' : ''}The adapter failed — ${err?.message || err}`;
    }
    if (ai.text) {
      if (ctrl.signal.aborted) ai.text += ' (stopped)';
      saveHistory([...afterUser, ai]); // persist once, complete — not per chunk
      if (alive.current) setMsgs([...afterUser, ai]);
    }
    if (alive.current) { setBusy(false); abort.current = null; }
  }, [draft, busy, adapter]);

  const stop = () => abort.current?.abort();

  return (
    <div className="chat">
      <header className="c-bar">
        <span className="c-name">AI Chat</span>
        <span className={`c-state ${adapter.ready() ? 'ok' : ''}`}>{adapter.label}</span>
        <span className="flex1" />
        <button className="btn slim" onClick={() => { if (msgs.length && window.confirm('Clear the whole conversation?')) clearHistory(); }} disabled={!msgs.length}>Clear</button>
      </header>
      {!adapter.ready() && (
        <div className="c-note">
          No model is configured yet — the adapter API is wired for a later
          integration (adapters.js). Messages you send are stored in this
          browser only.
        </div>
      )}
      <div className="c-thread" ref={scroller} aria-live="polite">
        {!msgs.length && (
          <div className="c-empty">
            Say something to get started.<br />
            <span className="dim">Until a model is configured, replies are honest placeholders.</span>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={m.id || i} className={`c-msg ${m.role}`}>
            <span className="c-who" aria-hidden="true">{m.role === 'user' ? 'You' : 'AI'}</span>
            <div className="c-bubble">{m.text}</div>
          </div>
        ))}
        {busy && <div className="c-typing">…</div>}
      </div>
      <footer className="c-entry">
        <textarea
          rows={1}
          value={draft}
          placeholder={busy ? 'Waiting for the reply…' : 'Ask something…'}
          aria-label="Chat message"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        />
        {busy
          ? <button className="btn" onClick={stop} title="Stop generating">Stop</button>
          : <button className="btn accent" onClick={send} disabled={!draft.trim()}>Send</button>}
      </footer>
    </div>
  );
}
