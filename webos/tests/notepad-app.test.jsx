// Notepad: notes list (search/recency/delete-arm), the editor with autosave,
// markdown preview for .md-titled notes, and Save-to-Files export over a
// mocked disk. notes.js is the real store (pure fns covered in app-libs).
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';

const h = vi.hoisted(() => ({ files: new Map() }));

vi.mock('../src/os/db.js', () => ({
  fileGet: async (path) => (h.files.has(path) ? { blob: h.files.get(path), type: 'text/markdown' } : null),
  filePut: async (path, blob) => { h.files.set(path, blob); },
}));

import Notepad from '../src/apps/notepad/Notepad.jsx';

beforeEach(() => {
  localStorage.clear();
  cleanup();
  document.body.innerHTML = '';
  h.files.clear();
});

afterEach(() => vi.restoreAllMocks());

const flushSave = async () => {
  // autosave debounces persistState by 400 ms
  await act(async () => { await new Promise((r) => setTimeout(r, 450)); });
};

describe('Notepad', () => {
  it('seeds the welcome note on first open', () => {
    render(<Notepad />);
    expect(screen.getByDisplayValue('Welcome')).toBeTruthy();
    expect(document.querySelector('.np-item-snippet').textContent).toContain('they persist');
    expect(screen.getByText('just now')).toBeTruthy();
    expect(localStorage.getItem('webos.notepad.v1')).toBeNull(); // seed isn't persisted until an edit
  });

  it('edits autosave to localStorage with live counters', async () => {
    render(<Notepad />);
    const box = screen.getByLabelText('Note text');
    fireEvent.change(box, { target: { value: 'one two three' } });
    expect(screen.getByText('13 chars · 3 words')).toBeTruthy();
    await flushSave();
    const saved = JSON.parse(localStorage.getItem('webos.notepad.v1'));
    expect(saved.notes[0].text).toBe('one two three');
    expect(saved.notes[0].title).toBe('Welcome');
  });

  it('creates uniquely-named notes and switches by click', () => {
    render(<Notepad />);
    fireEvent.click(screen.getByTitle('New note'));
    expect(screen.getByDisplayValue('Untitled')).toBeTruthy();
    fireEvent.click(screen.getByTitle('New note'));
    expect(screen.getByDisplayValue('Untitled 2')).toBeTruthy(); // deduped
    // the list now has three entries; click the first note back on
    fireEvent.click(screen.getByText('Welcome'));
    expect(screen.getByDisplayValue('Welcome')).toBeTruthy();
    expect(screen.getByRole('option', { selected: true }).textContent).toContain('Welcome');
  });

  it('search filters the list and reports empty queries honestly', () => {
    render(<Notepad />);
    fireEvent.change(screen.getByLabelText('Search notes'), { target: { value: 'zzz' } });
    expect(screen.getByText(/No notes match .zzz./)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search notes'), { target: { value: '' } });
    expect(screen.getByText('Welcome')).toBeTruthy();
  });

  it('renaming to a .md title enables the markdown preview; editing back drops it', () => {
    render(<Notepad />);
    expect(screen.queryByRole('group', { name: 'Note view' })).toBeNull(); // .txt title: no preview
    fireEvent.change(screen.getByLabelText('Note title'), { target: { value: 'ideas.md' } });
    expect(screen.getByRole('group', { name: 'Note view' })).toBeTruthy();
    expect(screen.getByText('markdown preview available')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    // the welcome note's markdown renders as elements, not raw source
    expect(screen.getByText('Markdown works')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Note title'), { target: { value: 'plain.txt' } });
    // derived mode: preview drops itself when the title leaves .md
    expect(screen.queryByRole('group', { name: 'Note view' })).toBeNull();
    expect(screen.getByLabelText('Note text')).toBeTruthy();
  });

  it('deletes with a two-click arm; the last deletion reseeds a fresh note', () => {
    render(<Notepad />);
    const del = () => screen.getByLabelText('Delete Welcome');
    fireEvent.click(del());
    expect(screen.getByLabelText(/Confirm delete Welcome/)).toBeTruthy(); // armed
    expect(screen.getByDisplayValue('Welcome')).toBeTruthy(); // still there
    fireEvent.click(screen.getByLabelText(/Confirm delete Welcome/));
    expect(screen.getByDisplayValue('Untitled')).toBeTruthy(); // fresh note took its place
    expect(screen.queryByText('Welcome')).toBeNull();
  });

  it('Save to Files exports markdown into /Home with collision-avoiding names', async () => {
    render(<Notepad />);
    fireEvent.click(screen.getByText('Save to Files'));
    await act(async () => {});
    expect(h.files.has('/Home/Welcome.md')).toBe(true);
    expect(screen.getByText('saved Welcome.md → Files')).toBeTruthy();

    fireEvent.click(screen.getByText('Save to Files'));
    await act(async () => {});
    expect(h.files.has('/Home/Welcome-2.md')).toBe(true); // first export taken
    expect(screen.getByText('saved Welcome-2.md → Files')).toBeTruthy();
  });

  it('Ctrl+S exports too', async () => {
    render(<Notepad />);
    fireEvent.keyDown(screen.getByLabelText('Note text'), { key: 's', ctrlKey: true });
    await act(async () => {});
    expect(h.files.has('/Home/Welcome.md')).toBe(true);
  });

  it('list snippets show the first non-empty line or empty note', () => {
    render(<Notepad />);
    // the snippet mirrors the note body (it lives in the textarea too)
    expect(document.querySelector('.np-item-snippet').textContent).toContain('they persist');
    fireEvent.change(screen.getByLabelText('Note text'), { target: { value: '' } });
    expect(screen.getByText('empty note')).toBeTruthy();
  });
});
