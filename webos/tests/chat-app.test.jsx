// Chat over a failing adapter: the run() throw must surface inline as an
// honest "adapter failed" bubble (not a silent thread), and a working
// adapter streams its chunks into the thread and persists once, complete.
// adapters.js itself only ships the honest "no model" echo — the failure and
// streaming paths need injected doubles, which is exactly what the adapter
// seam exists for.
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, act, cleanup, fireEvent } from '@testing-library/react';
import ChatApp from '../src/apps/chat/Chat.jsx';

const { failing, streaming } = vi.hoisted(() => ({
  failing: {
    id: 'boom',
    label: 'Failing model',
    ready: () => true,
    // eslint-disable-next-line require-yield -- the whole point is to throw before any yield
  async *run() { throw new Error('quota gone'); },
  },
  streaming: {
    id: 'tiny',
    label: 'Tiny model',
    ready: () => true,
    async *run() { yield 'hel'; yield 'lo '; yield 'world'; },
  },
}));

vi.mock('../src/apps/chat/adapters.js', async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    ADAPTERS: [...real.ADAPTERS, failing, streaming],
    adapterById: (id) => (id === 'boom' ? failing : id === 'tiny' ? streaming : real.adapterById(id)),
  };
});

const type = (c, text) => act(() => {
  fireEvent.change(c.container.querySelector('[aria-label="Chat message"]'), { target: { value: text } });
});
const send = async (c) => {
  act(() => { fireEvent.keyDown(c.container.querySelector('[aria-label="Chat message"]'), { key: 'Enter' }); });
  await act(async () => {});
};

beforeEach(() => {
  localStorage.clear();
  cleanup();
});

describe('Chat adapter seam', () => {
  it('a thrown adapter error surfaces inline and the turn still persists', async () => {
    localStorage.setItem('webos.chat.adapter', 'boom');
    const c = render(<ChatApp />);
    type(c, 'hi');
    await send(c);
    const bubbles = [...c.container.querySelectorAll('.c-msg .c-bubble')].map((b) => b.textContent);
    expect(bubbles).toEqual(['hi', 'The adapter failed — quota gone']);
    // the failed turn persisted (user + assistant), so a reload keeps history
    const saved = JSON.parse(localStorage.getItem('webos.chat.history'));
    expect(saved.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(saved[1].text).toBe('The adapter failed — quota gone');
  });

  it('a working adapter streams chunks and saves the message once, complete', async () => {
    localStorage.setItem('webos.chat.adapter', 'tiny');
    const c = render(<ChatApp />);
    expect(c.container.querySelector('.c-state').textContent).toBe('Tiny model');
    type(c, 'greet');
    await send(c);
    expect(c.container.querySelector('.c-bubble.assistant, .c-msg.assistant .c-bubble').textContent).toBe('hello world');
    const saved = JSON.parse(localStorage.getItem('webos.chat.history'));
    expect(saved).toHaveLength(2);
    expect(saved[1].text).toBe('hello world'); // one complete entry, not per-chunk rows
    expect(c.container.querySelector('.c-typing')).toBeNull(); // busy cleared
  });
});
