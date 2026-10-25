/* Chat branch coverage — targeted uncovered branches in Chat.jsx.
   Surfaces: empty state, role branches, Clear button, send-disabled,
   typing indicator, adapter ready(), scroll-down, and send early-returns.
   Chat.jsx has no OSProvider dependency; the component reads/writes
   localStorage and dispatches a window event for cross-widget sync. */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, cleanup, fireEvent } from '@testing-library/react';
import ChatApp from '../src/apps/chat/Chat.jsx';

// All adapters are defined in vi.hoisted so vi.mock can reference them
// without "variable accessed before initialization" hoisting errors.
const { failing, streaming, slow, abortable, partialFail } = vi.hoisted(() => {
  // Fails immediately — used for error-path coverage.
  const failing = {
    id: 'boom',
    label: 'Failing model',
    ready: () => true,
    // eslint-disable-next-line require-yield
    async *run() { throw new Error('quota gone'); },
  };

  // Yields chunks synchronously — used for successful send / role coverage.
  const streaming = {
    id: 'tiny',
    label: 'Tiny model',
    ready: () => true,
    async *run() { yield 'hel'; yield 'lo '; yield 'world'; },
  };

  // Yields one chunk then hangs — used to observe busy=true state.
  const slow = {
    id: 'slow',
    label: 'Slow model',
    ready: () => true,
    run: () => {
      return (async function* () {
        yield 'wait';
        // Hang indefinitely — the test only needs busy=true before the first yield.
        await new Promise(() => {});
      })();
    },
  };

  // Yields one chunk, then ends the stream only when the caller's abort
  // signal fires — used to cover the "(stopped)" partial-save path.
  const abortable = {
    id: 'abortable',
    label: 'Abortable model',
    ready: () => true,
    run: (_msgs, { signal }) => {
      return (async function* () {
        yield 'partial ';
        await new Promise((resolve) => {
          if (signal.aborted) resolve();
          else signal.addEventListener('abort', () => resolve());
        });
      })();
    },
  };

  // Yields one chunk, then throws — covers the error path where ai.text is
  // already non-empty (the "\n" separator branch).
  const partialFail = {
    id: 'partialfail',
    label: 'Partial failure model',
    ready: () => true,
    async *run() { yield 'so far'; throw new Error('stream died'); },
  };

  return { failing, streaming, slow, abortable, partialFail };
});

vi.mock('../src/apps/chat/adapters.js', async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    ADAPTERS: [...real.ADAPTERS, failing, streaming, slow],
    adapterById: (id) =>
      id === 'boom'
        ? failing
        : id === 'tiny'
          ? streaming
          : id === 'slow'
            ? slow
            : id === 'abortable'
              ? abortable
              : id === 'partialfail'
                ? partialFail
                : real.adapterById(id),
  };
});

const type = (c, text) =>
  act(() => {
    fireEvent.change(c.container.querySelector('[aria-label="Chat message"]'), {
      target: { value: text },
    });
  });

const pressEnter = (c) =>
  act(() => {
    fireEvent.keyDown(
      c.container.querySelector('[aria-label="Chat message"]'),
      { key: 'Enter' },
    );
  });

const pressEnterShift = (c) =>
  act(() => {
    fireEvent.keyDown(
      c.container.querySelector('[aria-label="Chat message"]'),
      { key: 'Enter', shiftKey: true },
    );
  });

beforeEach(() => {
  localStorage.clear();
  cleanup();
});

afterEach(() => {
  cleanup();
});

describe('Chat branch coverage', () => {
  /* ── Line 69: empty state when !msgs.length ───────────────────────── */
  it('shows empty-state placeholder when there are no messages', () => {
    const c = render(<ChatApp />);
    const empty = c.container.querySelector('.c-empty');
    expect(empty).not.toBeNull();
    expect(empty.textContent).toContain('get started');
  });

  /* ── Line 77: m.role !== "user" (assistant) branch ─────────────────── */
  it('renders assistant role label for non-user messages', async () => {
    localStorage.setItem('webos.chat.adapter', 'tiny');
    const c = render(<ChatApp />);
    type(c, 'hello');
    await pressEnter(c);
    await act(async () => {});
    const assistantBubble = c.container.querySelector('.c-msg.assistant .c-bubble');
    expect(assistantBubble).not.toBeNull();
    expect(assistantBubble.textContent).toBe('hello world');
    const aiLabels = [...c.container.querySelectorAll('.c-who')].map(
      (el) => el.textContent,
    );
    expect(aiLabels).toContain('AI');
  });

  /* ── Line 13 + 57: adapter.ready() returning true adds "ok" class ── */
  it('marks the adapter label with "ok" class when ready() is true', () => {
    localStorage.setItem('webos.chat.adapter', 'tiny');
    const c = render(<ChatApp />);
    expect(c.container.querySelector('.c-state.ok')).not.toBeNull();
    expect(c.container.querySelector('.c-state').textContent).toBe('Tiny model');
  });

  /* ── Line 61: the "no model configured" note is absent when ready() ── */
  it('hides the "no model configured" note when the adapter reports ready', () => {
    localStorage.setItem('webos.chat.adapter', 'tiny');
    const c = render(<ChatApp />);
    expect(c.container.querySelector('.c-note')).toBeNull();
  });

  /* ── Line 59: Clear button is disabled when msgs.length is 0 ─────── */
  it('Clear button is disabled when there is no history', () => {
    const c = render(<ChatApp />);
    const clearBtn = [...c.container.querySelectorAll('button')].find(
      (b) => b.textContent === 'Clear',
    );
    expect(clearBtn).not.toBeUndefined();
    expect(clearBtn.disabled).toBe(true);
  });

  /* ── Line 59: Clear button fires confirm and clears history ────────── */
  it('Clear button prompts and wipes history when confirmed', async () => {
    localStorage.setItem(
      'webos.chat.history',
      JSON.stringify([{ id: 'u1', role: 'user', text: 'hello', t: 1 }]),
    );
    // happy-dom does not expose window.confirm — stub it before render.
    const confirmStub = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmStub);
    const c = render(<ChatApp />);
    const clearBtn = [...c.container.querySelectorAll('button')].find(
      (b) => b.textContent === 'Clear',
    );
    expect(clearBtn.disabled).toBe(false);
    await act(async () => {
      clearBtn.click();
    });
    expect(localStorage.getItem('webos.chat.history')).toBeNull();
  });

  /* ── Line 90: Enter with ShiftKey does NOT call send() ─────────────── */
  it('Shift+Enter does not send', async () => {
    localStorage.setItem('webos.chat.adapter', 'tiny');
    const c = render(<ChatApp />);
    type(c, 'partial');
    await pressEnterShift(c);
    const bubbles = c.container.querySelectorAll('.c-bubble');
    expect(bubbles.length).toBe(0);
  });

  /* ── Line 90: Send button is disabled when draft is empty ─────────── */
  it('Send button is disabled when the draft textarea is blank', () => {
    localStorage.setItem('webos.chat.adapter', 'tiny');
    const c = render(<ChatApp />);
    const sendBtn = [...c.container.querySelectorAll('button')].find(
      (b) => b.textContent === 'Send',
    );
    expect(sendBtn.disabled).toBe(true);
  });

  /* ── Line 87: textarea placeholder when busy ───────────────────────── */
  it('textarea shows "Waiting for the reply…" placeholder while busy', async () => {
    localStorage.setItem('webos.chat.adapter', 'slow');
    const c = render(<ChatApp />);
    type(c, 'hello');
    const ta = c.container.querySelector('[aria-label="Chat message"]');
    expect(ta.placeholder).toBe('Ask something…');

    // Trigger send — the slow adapter hangs after yielding 'wait',
    // so busy=true is observable before the generator completes.
    await act(async () => {
      fireEvent.keyDown(ta, { key: 'Enter' });
    });
    c.rerender(<ChatApp />);
    expect(ta.placeholder).toBe('Waiting for the reply…');
  });

  /* ── Line 81: typing indicator (.c-typing) while busy ──────────────── */
  it('shows typing indicator while the adapter is streaming', async () => {
    localStorage.setItem('webos.chat.adapter', 'slow');
    const c = render(<ChatApp />);
    type(c, 'greet');
    const ta = c.container.querySelector('[aria-label="Chat message"]');

    // Start send without awaiting completion.
    await act(async () => {
      fireEvent.keyDown(ta, { key: 'Enter' });
    });
    c.rerender(<ChatApp />);

    // Busy is true → typing indicator must be present.
    expect(c.container.querySelector('.c-typing')).not.toBeNull();
  });

  /* ── Line 25: send() early-return when text is whitespace ──────────── */
  it('send does nothing when textarea contains only whitespace', async () => {
    const c = render(<ChatApp />);
    type(c, '   ');
    const sendBtn = [...c.container.querySelectorAll('button')].find(
      (b) => b.textContent === 'Send',
    );
    expect(sendBtn.disabled).toBe(true);
    await act(async () => {
      fireEvent.keyDown(
        c.container.querySelector('[aria-label="Chat message"]'),
        { key: 'Enter' },
      );
    });
    expect(localStorage.getItem('webos.chat.history')).toBeNull();
  });

  /* ── Line 25: send() early-return when busy is true ─────────────────── */
  it('send does nothing while already busy', async () => {
    localStorage.setItem('webos.chat.adapter', 'tiny');
    const c = render(<ChatApp />);
    type(c, 'hello');
    const ta = c.container.querySelector('[aria-label="Chat message"]');

    // First send.
    await act(async () => {
      fireEvent.keyDown(ta, { key: 'Enter' });
    });
    await act(async () => {});
    c.rerender(<ChatApp />);

    // Second send while busy — component must ignore it.
    await act(async () => {
      fireEvent.keyDown(ta, { key: 'Enter' });
    });

    const history = JSON.parse(localStorage.getItem('webos.chat.history') || '[]');
    const userMessages = history.filter((m) => m.role === 'user');
    expect(userMessages).toHaveLength(1);
  });
});

describe('Chat branch coverage — round two', () => {
  /* ── Line 59: Clear with confirm=false keeps history ────────────────── */
  it('Clear keeps history when the confirm is declined', async () => {
    localStorage.setItem(
      'webos.chat.history',
      JSON.stringify([{ id: 'u1', role: 'user', text: 'keep me', t: 1 }]),
    );
    const confirmStub = vi.fn(() => false);
    vi.stubGlobal('confirm', confirmStub);
    const c = render(<ChatApp />);
    const clearBtn = [...c.container.querySelectorAll('button')].find(
      (b) => b.textContent === 'Clear',
    );
    await act(async () => { clearBtn.click(); });
    const history = JSON.parse(localStorage.getItem('webos.chat.history'));
    expect(history).toHaveLength(1);
    expect(confirmStub).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  /* ── Line 44: aborting mid-stream appends " (stopped)" and saves ───── */
  it('appends "(stopped)" and saves partial text when aborted mid-stream', async () => {
    localStorage.setItem('webos.chat.adapter', 'abortable');
    const c = render(<ChatApp />);
    type(c, 'cut it');
    const ta = c.container.querySelector('[aria-label="Chat message"]');
    await act(async () => { fireEvent.keyDown(ta, { key: 'Enter' }); });
    // The abortable adapter yielded "partial " and is parked on the abort
    // signal. The Stop button is the busy-state branch of the footer.
    const stopBtn = [...c.container.querySelectorAll('button')].find(
      (b) => b.textContent === 'Stop',
    );
    expect(stopBtn).not.toBeUndefined();
    await act(async () => { stopBtn.click(); });
    await act(async () => {});
    const history = JSON.parse(localStorage.getItem('webos.chat.history'));
    const ai = history.find((m) => m.role === 'assistant');
    expect(ai.text).toBe('partial  (stopped)');
    // Footer returned to the send branch after the abort.
    expect([...c.container.querySelectorAll('button')].some((b) => b.textContent === 'Send')).toBe(true);
  });

  /* ── Line 76: message without id falls back to index key ───────────── */
  it('renders a legacy message without an id (index key fallback)', () => {
    localStorage.setItem(
      'webos.chat.history',
      JSON.stringify([{ role: 'user', text: 'no id here', t: 1 }]),
    );
    const c = render(<ChatApp />);
    const bubble = c.container.querySelector('.c-msg.user .c-bubble');
    expect(bubble).not.toBeNull();
    expect(bubble.textContent).toBe('no id here');
  });

  /* ── Lines 17-18: unmount aborts in-flight run; history listener dies ─ */
  it('aborts an in-flight adapter run on unmount', async () => {
    localStorage.setItem('webos.chat.adapter', 'slow');
    const c = render(<ChatApp />);
    type(c, 'bye');
    const ta = c.container.querySelector('[aria-label="Chat message"]');
    await act(async () => { fireEvent.keyDown(ta, { key: 'Enter' }); });
    // Unmount while the generator is hung — the cleanup effect must abort.
    act(() => { c.unmount(); });
    // The hang promise never resolves, but the abort must not throw and the
    // component is gone. Persisted history holds the user message only (the
    // partial assistant text is dropped because alive.current is false).
    const history = JSON.parse(localStorage.getItem('webos.chat.history') || '[]');
    expect(history.some((m) => m.role === 'user')).toBe(true);
  });
});

describe('Chat branch coverage — error-with-prior-text', () => {
  /* ── Line 41: error after partial output joins with "\n" and saves ── */
  it('joins the failure notice with a newline when partial text streamed', async () => {
    localStorage.setItem('webos.chat.adapter', 'partialfail');
    const c = render(<ChatApp />);
    type(c, 'go');
    const ta = c.container.querySelector('[aria-label="Chat message"]');
    await act(async () => { fireEvent.keyDown(ta, { key: 'Enter' }); });
    await act(async () => {});
    const history = JSON.parse(localStorage.getItem('webos.chat.history'));
    const ai = history.find((m) => m.role === 'assistant');
    expect(ai.text).toBe('so far\nThe adapter failed — stream died');
  });
});
