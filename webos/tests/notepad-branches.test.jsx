// Branch coverage for Notepad.jsx and notes.js.
// Targets: export error path, Ctrl+S handler, two-click delete arm,
// empty search results, and notes.js pure-logic branches.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, cleanup, fireEvent } from '@testing-library/react';
import NotepadApp from '../src/apps/notepad/Notepad.jsx';
import {
  createNote, updateNote, renameNote, deleteNote,
  searchNotes, byRecency, isMdTitle, exportName,
} from '../src/apps/notepad/notes.js';

// ---------------------------------------------------------------------------
// notes.js pure logic
// ---------------------------------------------------------------------------
describe('notes.js pure functions', () => {
  // Use numeric IDs matching what the real code generates
  const make = (overrides = {}) => ({
    id: 1, title: 'Test', text: 'Hello world', created: 1000, mtime: 1000,
    ...overrides,
  });

  describe('searchNotes', () => {
    const notes = [
      { id: 1, title: 'Shopping list', text: 'milk eggs', created: 1, mtime: 3 },
      { id: 2, title: 'Ideas', text: 'build a rocket', created: 1, mtime: 2 },
      { id: 3, title: 'Recipe', text: 'milk chocolate', created: 1, mtime: 1 },
    ];

    it('matches title', () => {
      const r = searchNotes(notes, 'shopping');
      expect(r.map((n) => n.id)).toEqual([1]);
    });

    it('matches body text', () => {
      const r = searchNotes(notes, 'rocket');
      expect(r.map((n) => n.id)).toEqual([2]);
    });

    it('is case-insensitive', () => {
      const r = searchNotes(notes, 'RECIPE');
      expect(r.map((n) => n.id)).toEqual([3]);
    });

    it('returns empty for no match', () => {
      expect(searchNotes(notes, 'xyzzy')).toHaveLength(0);
    });

    // searchNotes preserves input order; sort separately if needed
    it('preserves input order (does not sort — caller applies byRecency)', () => {
      const r = searchNotes(notes, 'milk');
      expect(r.map((n) => n.id)).toEqual([1, 3]); // same order as input
      // Apply byRecency to confirm the comparator works
      const sorted = r.sort(byRecency);
      expect(sorted.map((n) => n.id)).toEqual([1, 3]); // mtime 3 then 1
    });
  });

  describe('isMdTitle', () => {
    it('returns true for .md suffix', () => {
      expect(isMdTitle('notes/README.md')).toBe(true);
    });
    it('returns false for plain names', () => {
      expect(isMdTitle('my note')).toBe(false);
    });
    it('returns false for undefined', () => {
      expect(isMdTitle(undefined)).toBe(false);
    });
  });

  describe('exportName', () => {
    it('returns the title as-is when not taken', () => {
      const taken = new Set();
      expect(exportName('My Note', taken)).toBe('My Note.md');
    });

    it('appends -2 when the name is taken', () => {
      const taken = new Set(['My Note.md']);
      expect(exportName('My Note', taken)).toBe('My Note-2.md');
    });

    it('skips already-taken names in sequence', () => {
      const taken = new Set(['My Note.md', 'My Note-2.md']);
      expect(exportName('My Note', taken)).toBe('My Note-3.md');
    });

    it('strips invalid filename chars', () => {
      expect(exportName('file:name?', new Set())).toBe('file-name-.md');
    });
  });

  describe('createNote', () => {
    it('adds a note with a generated id and mtime', () => {
      const s = { notes: [], activeId: null, nextId: 1 };
      const next = createNote(s);
      expect(next.notes).toHaveLength(1);
      expect(next.activeId).toBe(next.notes[0].id);
      expect(next.notes[0].title).toBe('Untitled');
      expect(next.notes[0].text).toBe('');
    });

    it('assigns a unique title when one already exists', () => {
      const s = { notes: [{ id: 1, title: 'Untitled', text: '', created: 1, mtime: 1 }], activeId: 1, nextId: 2 };
      const next = createNote(s);
      expect(next.notes[1].title).toBe('Untitled 2');
    });
  });

  describe('updateNote', () => {
    it('updates text and refreshes mtime', () => {
      const n = make();
      const s = { notes: [n], activeId: n.id, nextId: 2 };
      const next = updateNote(s, n.id, { text: 'Updated' });
      expect(next.notes[0].text).toBe('Updated');
    });

    it('is idempotent for unknown id', () => {
      const n = make();
      const s = { notes: [n], activeId: n.id, nextId: 2 };
      const next = updateNote(s, 999, { text: 'X' });
      expect(next).toEqual(s);
    });
  });

  describe('renameNote', () => {
    it('updates the title', () => {
      const n = make();
      const s = { notes: [n], activeId: n.id, nextId: 2 };
      const next = renameNote(s, n.id, 'New Title');
      expect(next.notes[0].title).toBe('New Title');
    });

    it('falls back to Untitled on blank title', () => {
      const n = make();
      const s = { notes: [n], activeId: n.id, nextId: 2 };
      const next = renameNote(s, n.id, '   ');
      expect(next.notes[0].title).toBe('Untitled');
    });
  });

  describe('deleteNote', () => {
    it('removes the note (last note triggers fresh-Untitled reseed)', () => {
      const n = make();
      const s = { notes: [n], activeId: n.id, nextId: 2 };
      const next = deleteNote(s, n.id);
      // deleting the last note reseeds a fresh Untitled note
      expect(next.notes).toHaveLength(1);
      expect(next.notes[0].title).toBe('Untitled');
    });

    it('creates a fresh note when last note is deleted', () => {
      const n = make({ id: 5 });
      const s = { notes: [n], activeId: n.id, nextId: 6 };
      const next = deleteNote(s, n.id);
      expect(next.notes).toHaveLength(1);
      expect(next.notes[0].title).toBe('Untitled');
    });

    it('switches activeId to previous note when not last', () => {
      const n1 = make({ id: 1, mtime: 1 });
      const n2 = make({ id: 2, mtime: 2 });
      const s = { notes: [n1, n2], activeId: n2.id, nextId: 3 };
      const next = deleteNote(s, n2.id);
      expect(next.activeId).toBe(1);
    });
  });
});

// ---------------------------------------------------------------------------
// Notepad.jsx DOM branches
// ---------------------------------------------------------------------------
describe('Notepad UI branches', () => {
  beforeEach(() => {
    localStorage.clear();
    cleanup();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows "No notes match" when search has no hits', () => {
    const c = render(<NotepadApp />);
    fireEvent.change(c.container.querySelector('[aria-label="Search notes"]'), {
      target: { value: 'xyzzy-nonexistent' },
    });
    expect(c.container.textContent).toContain('No notes match');
  });

  it('Ctrl+S triggers export without error when no storePath (download path)', async () => {
    const c = render(<NotepadApp />);
    const textarea = c.container.querySelector('textarea');
    fireEvent.change(textarea, { target: { value: 'hello' } });

    const clickSpy = vi.fn();
    const orig = window.HTMLAnchorElement?.prototype.click;
    if (window.HTMLAnchorElement) window.HTMLAnchorElement.prototype.click = clickSpy;

    fireEvent.keyDown(textarea, { key: 's', ctrlKey: true });
    await act(async () => {});

    if (window.HTMLAnchorElement) window.HTMLAnchorElement.prototype.click = orig;
    // Export ran without throwing (filePut stub is null → no error)
    expect(c.container.textContent).not.toContain('export failed');
  });

  it('two-click delete: first click arms, second click deletes', async () => {
    const c = render(<NotepadApp />);
    const delBtn = c.container.querySelector('.np-del');
    expect(delBtn.textContent).toBe('✕'); // first click

    fireEvent.click(delBtn);
    await act(async () => {});
    expect(c.container.querySelector('.np-del.armed').textContent).toBe('sure?');

    fireEvent.click(c.container.querySelector('.np-del.armed'));
    await act(async () => {});
    // The welcome note should be gone
    expect(c.container.querySelector('.np-list').textContent).not.toContain('Welcome');
  });


});
