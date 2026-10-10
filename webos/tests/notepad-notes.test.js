// Notepad note store: pure reducer functions + persistence rules.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadState, persistState, createNote, updateNote, renameNote, deleteNote,
  searchNotes, byRecency, isMdTitle, exportName, uniqueTitle,
} from '../src/apps/notepad/notes.js';

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ now: 1_700_000_000_000 });
});

const st = (notes, activeId = notes[0]?.id, nextId = 10) => ({ notes, activeId, nextId });
const note = (id, title, text = '', mtime = 1) => ({ id, title, text, created: 1, mtime });

describe('persistence', () => {
  it('returns the seed note when nothing is stored', () => {
    const s = loadState();
    expect(s.notes).toHaveLength(1);
    expect(s.notes[0].title).toBe('Welcome');
    expect(s.restored).toBeUndefined();
  });

  it('round-trips state through localStorage', () => {
    const s = st([note(1, 'a', 'body')], 1, 2);
    expect(persistState(s)).toBe(true);
    const back = loadState();
    expect(back.restored).toBe(true);
    expect(back.notes).toEqual(s.notes);
    expect(back.activeId).toBe(1);
  });

  it('refuses to persist oversized payloads', () => {
    const big = st([note(1, 'a', 'x'.repeat(1_600_000))]);
    expect(persistState(big)).toBe(false);
    expect(localStorage.getItem('webos.notepad.v1')).toBeNull();
  });

  it('falls back to seed on corrupted JSON', () => {
    localStorage.setItem('webos.notepad.v1', '{not json');
    const s = loadState();
    expect(s.notes[0].title).toBe('Welcome');
  });
});

describe('create/rename/update', () => {
  it('creates with a unique title and activates it', () => {
    const s = createNote(st([note(1, 'Untitled')], 1), 'Untitled');
    expect(s.notes[1].title).toBe('Untitled 2');
    expect(s.activeId).toBe(s.notes[1].id);
    expect(s.notes[1].text).toBe('');
    expect(s.nextId).toBe(11);
  });

  it('bumps mtime on update and rename only for the target note', () => {
    const s0 = st([note(1, 'a', '', 5), note(2, 'b', '', 6)]);
    const s1 = updateNote(s0, 1, { text: 'new' });
    expect(s1.notes[0].text).toBe('new');
    expect(s1.notes[0].mtime).toBe(1_700_000_000_000);
    expect(s1.notes[1].mtime).toBe(6);
  });

  it('rename trims, defaults to Untitled, and avoids collisions', () => {
    const s0 = st([note(1, 'a'), note(2, 'b')]);
    expect(renameNote(s0, 2, '  a  ').notes[1].title).toBe('a 2');
    expect(renameNote(s0, 2, '   ').notes[1].title).toBe('Untitled');
  });

  it('uniqueTitle ignores the note being renamed', () => {
    const notes = [note(1, 'todo'), note(2, 'todo 2'), note(3, 'todo 3')];
    expect(uniqueTitle(notes, 'todo', 1)).toBe('todo');
    // note 2's own current name stays available; so does note 3's
    expect(uniqueTitle(notes, 'todo', 2)).toBe('todo 2');
    expect(uniqueTitle(notes, 'todo', 3)).toBe('todo 3');
    expect(uniqueTitle(notes, 'todo', 4)).toBe('todo 4');
  });
});

describe('delete', () => {
  it('activates the last remaining note', () => {
    const s = st([note(1, 'a', '', 5), note(2, 'b', '', 6), note(3, 'c', '', 7)], 3);
    const out = deleteNote(s, 3);
    expect(out.notes.map((n) => n.id)).toEqual([1, 2]);
    expect(out.activeId).toBe(2);
  });

  it('keeps deleting the last note by creating a fresh one', () => {
    const s = st([note(1, 'only')], 1);
    const out = deleteNote(s, 1);
    expect(out.notes).toHaveLength(1);
    expect(out.notes[0].title).toBe('Untitled');
    expect(out.notes[0].id).not.toBe(1);
    expect(out.activeId).toBe(out.notes[0].id);
  });
});

describe('search + ordering', () => {
  it('matches title or text case-insensitively, empty query returns all', () => {
    const notes = [note(1, 'Groceries', 'milk, eggs'), note(2, 'Work', 'STANDUP notes')];
    expect(searchNotes(notes, '').length).toBe(2);
    expect(searchNotes(notes, 'groceries').map((n) => n.id)).toEqual([1]);
    expect(searchNotes(notes, 'standup').map((n) => n.id)).toEqual([2]);
    expect(searchNotes(notes, '  ')).toEqual(notes);
    expect(searchNotes(notes, 'zzz')).toEqual([]);
  });

  it('sorts by recency descending', () => {
    const notes = [note(1, 'old', '', 100), note(2, 'new', '', 300), note(3, 'mid', '', 200)];
    expect(notes.sort(byRecency).map((n) => n.id)).toEqual([2, 3, 1]);
  });
});

describe('markdown triage + export names', () => {
  it('detects md-titled notes', () => {
    expect(isMdTitle('ideas.md')).toBe(true);
    expect(isMdTitle('IDEAS.MDX')).toBe(true);
    expect(isMdTitle('notes.txt')).toBe(false);
    expect(isMdTitle('')).toBe(false);
  });

  it('export names get .md and sanitize filesystem-hostile characters', () => {
    expect(exportName('ideas')).toBe('ideas.md');
    expect(exportName('ideas.md')).toBe('ideas.md');
    expect(exportName('a/b:c*?')).toBe('a-b-c-.md');
    expect(exportName('')).toBe('note.md');
  });

  it('dedupes against taken names with -2, -3…', () => {
    const taken = new Set(['ideas.md', 'ideas-2.md']);
    expect(exportName('ideas', taken)).toBe('ideas-3.md');
    expect(exportName('note.txt', new Set(['note.txt.md']))).toBe('note.txt-2.md');
  });
});
