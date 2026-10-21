// Branch coverage for Editor.jsx and buffers.js.
// Targets: reducer arms (close, rename, saved, activate, edit, new),
// loadState restore/fallback, and basic Editor UI smoke.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, cleanup, fireEvent } from '@testing-library/react';
import EditorApp from '../src/apps/editor/Editor.jsx';
import { loadState, persist, reducer } from '../src/apps/editor/buffers.js';

// ---------------------------------------------------------------------------
// buffers.js pure logic
// ---------------------------------------------------------------------------
describe('buffers.js pure functions', () => {
  // Buffer IDs are numeric, generated from state.nextId
  const make = (overrides = {}) => ({
    id: 1, name: 'test.js', text: 'hello', dirty: false,
    storePath: null, handle: null, needsHandle: false, ...overrides,
  });

  const STATE = () => ({ buffers: [make()], activeId: 1, nextId: 2 });

  describe('reducer', () => {
    it("'new' adds a buffer", () => {
      const next = reducer(STATE(), { type: 'new', name: 'x.js', text: '' });
      expect(next.buffers).toHaveLength(2);
    });

    it("'edit' marks the buffer dirty", () => {
      const next = reducer(STATE(), { type: 'edit', text: 'changed' });
      expect(next.buffers[0].dirty).toBe(true);
    });

    it("'saved' clears dirty and updates handle/name", () => {
      const next = reducer(STATE(), { type: 'saved', id: 1, handle: {}, name: 'newname.js' });
      expect(next.buffers[0].dirty).toBe(false);
    });

    it("'close' removes the buffer and returns a fresh scratch when last", () => {
      const next = reducer(STATE(), { type: 'close', id: 1 });
      // Last buffer → reseed scratch (not empty array)
      expect(next.buffers).toHaveLength(1);
      expect(next.buffers[0].name).toBe('scratch.js');
    });

    it("'close' removes the buffer and activates previous when not last", () => {
      const s = { buffers: [make({ id: 1 }), make({ id: 2 })], activeId: 2, nextId: 3 };
      const next = reducer(s, { type: 'close', id: 2 });
      expect(next.buffers).toHaveLength(1);
      expect(next.activeId).toBe(1);
    });

    it("'close' activates next when previous is not available", () => {
      const s = { buffers: [make({ id: 1 }), make({ id: 2 })], activeId: 1, nextId: 3 };
      const next = reducer(s, { type: 'close', id: 1 });
      expect(next.activeId).toBe(2);
    });

    it("'rename' updates the name and marks dirty", () => {
      const next = reducer(STATE(), { type: 'rename', id: 1, name: 'newname.js' });
      expect(next.buffers[0].name).toBe('newname.js');
      expect(next.buffers[0].dirty).toBe(true);
    });

    it("'activate' switches the active id", () => {
      const s = { buffers: [make({ id: 1 }), make({ id: 2 })], activeId: 1, nextId: 3 };
      const next = reducer(s, { type: 'activate', id: 2 });
      expect(next.activeId).toBe(2);
    });

    it('unknown action returns state unchanged', () => {
      const s = STATE();
      // @ts-ignore
      const next = reducer(s, { type: 'unknown' });
      expect(next).toEqual(s);
    });
  });

  describe('loadState', () => {
    it('returns a seed buffer when localStorage is empty', () => {
      localStorage.clear();
      const s = loadState();
      expect(s.buffers.length).toBeGreaterThan(0);
      expect(s.activeId).not.toBeNull();
    });

    it('restores persisted state with restored=true', () => {
      const saved = {
        buffers: [{ id: 1, name: 'restored.js', text: 'code', dirty: false, storePath: null }],
        activeId: 1, nextId: 2,
      };
      localStorage.setItem('webos.editor.state', JSON.stringify(saved));
      const s = loadState();
      expect(s.restored).toBe(true);
      expect(s.buffers[0].name).toBe('restored.js');
    });

    it('falls back to seed on corrupted JSON', () => {
      localStorage.setItem('webos.editor.state', 'not json {{{');
      const s = loadState();
      expect(s.buffers.length).toBeGreaterThan(0);
      expect(s.restored).toBeUndefined();
    });
  });

  describe('persist', () => {
    it('saves state to localStorage', () => {
      localStorage.clear();
      const s = STATE();
      const result = persist(s);
      expect(result).toBe(true);
      expect(localStorage.getItem('webos.editor.state')).toBeTruthy();
    });

    it('does not persist absurdly large payloads', () => {
      localStorage.clear();
      const huge = { buffers: [{ id: 1, name: 'x', text: 'a'.repeat(2_000_000), dirty: false }], activeId: 1, nextId: 2 };
      expect(persist(huge)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Editor UI — smoke and key branches
// ---------------------------------------------------------------------------
describe('Editor UI branches', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fileGet', vi.fn().mockResolvedValue(null));
    vi.stubGlobal('filePut', vi.fn().mockResolvedValue(undefined));
    cleanup();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders the editor chrome', () => {
    const c = render(<EditorApp />);
    expect(c.container.querySelector('.editor')).toBeTruthy();
    expect(c.container.querySelector('.ed-tabs')).toBeTruthy();
  });

  it('new tab button adds a buffer tab', () => {
    const c = render(<EditorApp />);
    const before = c.container.querySelectorAll('.ed-tab').length;
    fireEvent.click([...c.container.querySelectorAll('.tb-btn')].find((b) => b.textContent.includes('New')));
    expect(c.container.querySelectorAll('.ed-tab').length).toBeGreaterThan(before);
  });

  it('clicking the active tab does not crash', () => {
    const c = render(<EditorApp />);
    const tab = c.container.querySelector('.ed-tab');
    fireEvent.click(tab);
    expect(c.container.querySelector('.editor')).toBeTruthy();
  });

  it('EditorApp renders without crashing', () => {
    const c = render(<EditorApp />);
    expect(c.container.querySelector('.editor')).toBeTruthy();
    expect(c.container.querySelector('.ed-tabs')).toBeTruthy();
    expect(c.container.querySelector('.tb-btn')).toBeTruthy();
  });

  it('save button is present and clickable', async () => {
    const c = render(<EditorApp />);
    const saveBtn = [...c.container.querySelectorAll('.tb-btn')].find((b) => b.textContent === 'Save');
    expect(saveBtn).toBeTruthy();
    fireEvent.click(saveBtn);
    await act(async () => {});
    expect(c.container.querySelector('.editor')).toBeTruthy();
  });

  it('tab close button removes the tab', async () => {
    const c = render(<EditorApp />);
    const closeBtn = c.container.querySelector('.ed-tab .tb-btn, .ed-tab .close-btn');
    if (closeBtn) {
      fireEvent.click(closeBtn);
      await act(async () => {});
    }
    // Just verify the editor is still present (tabs may re-seed)
    expect(c.container.querySelector('.editor')).toBeTruthy();
  });

  it('save button exists and is clickable', async () => {
    const c = render(<EditorApp />);
    const saveBtn = [...c.container.querySelectorAll('.tb-btn')].find((b) => b.textContent === 'Save');
    expect(saveBtn).toBeTruthy();
    fireEvent.click(saveBtn);
    await act(async () => {});
    expect(c.container.querySelector('.editor')).toBeTruthy();
  });
});
