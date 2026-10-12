// Editor app component: the CodeMirror host wiring (tabs, rename, wrap,
// dirty-close confirm, status bar), disk-backed open/save via args.path,
// the FSA and download-fallback save paths, and the MarkdownView renderer.
// buffers.js/language.js/markdown.js pure logic is covered in editor-libs.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import { EditorView } from 'codemirror';

const h = vi.hoisted(() => ({ files: new Map(), failGet: false }));

vi.mock('../src/os/db.js', () => ({
  fileGet: async (path) => {
    if (h.failGet) throw new Error('disk gone');
    return h.files.has(path) ? { blob: h.files.get(path) } : null;
  },
  filePut: async (path, blob) => { h.files.set(path, blob); },
}));

import Editor from '../src/apps/editor/Editor.jsx';
import MarkdownView from '../src/apps/editor/MarkdownView.jsx';

beforeEach(() => {
  localStorage.clear();
  cleanup();
  document.body.innerHTML = '';
  h.files.clear();
  h.failGet = false;
  vi.stubGlobal('fetch', () => new Promise(() => {})); // markdown <img> must stay hermetic
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:save');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// The CodeMirror instance lives in .cm-editor; its static finder reaches it.
const cmView = () => EditorView.findFromDOM(document.querySelector('.cm-editor'));
const type = (text) => act(() => cmView().dispatch({ changes: { from: 0, insert: text } }));

describe('Editor', () => {
  it('boots the scratch buffer with position, size and language status', () => {
    render(<Editor />);
    expect(screen.getByRole('tab', { selected: true }).textContent).toContain('scratch.js');
    expect(screen.getByText('Ln 1, Col 1')).toBeTruthy();
    expect(screen.getByText(/chars/)).toBeTruthy();
    expect(screen.getByText('JS')).toBeTruthy();
    expect(document.querySelector('.cm-content')).toBeTruthy(); // CM really mounted
    expect(screen.queryByRole('group', { name: 'Editor mode' })).toBeNull(); // .js: no preview
  });

  it('typing flows through CodeMirror into dirty state and counters', () => {
    render(<Editor />);
    const before = screen.getByText(/chars/).textContent;
    type('hello');
    expect(screen.getByText(/chars/).textContent).toBe('281 chars'); // 276-char seed + 'hello'
    expect(screen.getByRole('tab', { selected: true }).textContent).toContain('•'); // dirty dot
    expect(screen.getByText(/scratch\.js •/)).toBeTruthy();
    // position 0 maps before the insertion: the cursor stays put
    expect(screen.getByText('Ln 1, Col 1')).toBeTruthy();
    expect(before).not.toBe('281 chars');
  });

  it('the wrap toggle flips its state class', () => {
    render(<Editor />);
    const wrap = screen.getByText('Wrap');
    expect(wrap.className).toContain('toggled'); // on by default
    fireEvent.click(wrap);
    expect(wrap.className).not.toContain('toggled');
    fireEvent.click(wrap);
    expect(wrap.className).toContain('toggled');
  });

  it('+ New adds an auto-named buffer and tabs activate on click', () => {
    render(<Editor />);
    fireEvent.click(screen.getByText('+ New'));
    expect(screen.getByRole('tab', { selected: true }).textContent).toContain('untitled-2.txt');
    expect(screen.getByText('TEXT')).toBeTruthy(); // language label followed the tab
    fireEvent.click(screen.getByText('scratch.js'));
    expect(screen.getByRole('tab', { selected: true }).textContent).toContain('scratch.js');
  });

  it('double-click renames a tab; Enter commits, Escape cancels', () => {
    render(<Editor />);
    fireEvent.doubleClick(screen.getByText('scratch.js'));
    const input = screen.getByDisplayValue('scratch.js');
    fireEvent.change(input, { target: { value: 'notes.md' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.getByText(/^scratch\.js/)).toBeTruthy(); // untouched

    fireEvent.doubleClick(screen.getByText('scratch.js'));
    fireEvent.change(screen.getByDisplayValue('scratch.js'), { target: { value: 'notes.md' } });
    fireEvent.focusOut(screen.getByDisplayValue('notes.md')); // commit on blur
    expect(screen.getByText(/^notes\.md/)).toBeTruthy(); // tab shows the new name + dirty dot
    // a rename marks the buffer dirty — the preview group appears for .md
    expect(screen.getByRole('group', { name: 'Editor mode' })).toBeTruthy();
  });

  it('preview is derived from the title: on for .md, off again for .txt', () => {
    render(<Editor />);
    fireEvent.doubleClick(screen.getByText('scratch.js'));
    fireEvent.change(screen.getByDisplayValue('scratch.js'), { target: { value: 'read.md' } });
    fireEvent.focusOut(screen.getByDisplayValue('read.md'));
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.getByText('preview — editing paused')).toBeTruthy();
    expect(document.querySelector('.ed-preview')).toBeTruthy();
    expect(document.querySelector('.cm-editor')).toBeNull(); // CM unmounted while previewing

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(document.querySelector('.cm-editor')).toBeTruthy(); // rebuilt on return
    expect(screen.getByText('Ln 1, Col 1')).toBeTruthy();

    fireEvent.doubleClick(screen.getByText(/^read\.md/));
    fireEvent.change(screen.getByDisplayValue('read.md'), { target: { value: 'read.txt' } });
    fireEvent.focusOut(screen.getByDisplayValue('read.txt'));
    // title left .md — the mode group drops itself without touching `preview`
    expect(screen.queryByRole('group', { name: 'Editor mode' })).toBeNull();
    expect(document.querySelector('.cm-editor')).toBeTruthy();
  });

  it('closing a dirty buffer confirms; a clean one does not', () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    render(<Editor />);
    type('unsaved work');
    fireEvent.click(screen.getByLabelText('Close scratch.js'));
    expect(confirm).toHaveBeenCalledWith('scratch.js has unsaved changes. Close anyway?');
    expect(screen.getByText(/^scratch\.js/)).toBeTruthy(); // declined → kept

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByLabelText('Close scratch.js'));
    expect(screen.queryByText(/scratch\.js •/)).toBeNull();
    // closing the only buffer reseeds a fresh, empty scratch
    expect(screen.getByText('Ln 1, Col 1')).toBeTruthy();
    expect(screen.getByText('0 chars')).toBeTruthy();
    expect(confirm).toHaveBeenCalledTimes(2); // once per close attempt; the reseed is clean
    vi.unstubAllGlobals();
  });

  it('save without pickers exports through a download anchor', async () => {
    render(<Editor />);
    fireEvent.click(screen.getByText('Save'));
    await act(async () => {}); // save is async even on the anchor path
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    expect(screen.getByText('exported scratch.js')).toBeTruthy();
  });

  it('opens via the File System Access API and saves back through the handle', async () => {
    const writable = { write: vi.fn(), close: vi.fn(async () => {}) };
    const handle = {
      createWritable: vi.fn(async () => writable),
      getFile: async () => new File(['# from disk'], 'picked.md', { type: 'text/markdown' }),
    };
    window.showOpenFilePicker = vi.fn(async () => [handle]);
    render(<Editor />);
    fireEvent.click(screen.getByText('Open'));
    await act(async () => {});
    expect(screen.getByText('# from disk')).toBeTruthy(); // raw text: FSA opens don't auto-preview
    expect(screen.getByText('11 chars')).toBeTruthy();
    expect(screen.getByText('MD')).toBeTruthy();

    fireEvent.click(screen.getByText('Save'));
    await act(async () => {});
    expect(handle.createWritable).toHaveBeenCalled();
    expect(writable.write).toHaveBeenCalledWith('# from disk');
    expect(screen.getByText('saved picked.md')).toBeTruthy();
    expect(screen.queryByText(/picked\.md •/)).toBeNull(); // dirty cleared by the save
  });

  it('an open error surfaces as an honest status line', async () => {
    window.showOpenFilePicker = vi.fn(async () => { throw new Error('no handler'); });
    render(<Editor />);
    fireEvent.click(screen.getByText('Open'));
    await act(async () => {});
    expect(await screen.findByText('open failed: no handler')).toBeTruthy();
  });

  it('a user-cancelled picker is silent (no error status)', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    window.showOpenFilePicker = vi.fn(async () => { throw abort; });
    render(<Editor />);
    fireEvent.click(screen.getByText('Open'));
    await act(async () => {});
    expect(screen.queryByText(/open failed/)).toBeNull();
    expect(screen.getByText('276 chars')).toBeTruthy(); // seed buffer untouched
  });

  it('without the FSA the open dialog falls back to a plain file input', async () => {
    delete window.showOpenFilePicker;
    let created = null;
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function () { created = this; });
    render(<Editor />);
    fireEvent.click(screen.getByText('Open'));
    expect(created?.accept).toContain('.md');
    Reflect.defineProperty(created, 'files', { configurable: true, value: [new File(['fallback text'], 'notes.txt')] });
    await act(async () => { await created.onchange(); });
    clickSpy.mockRestore();
    expect(screen.getByText('fallback text')).toBeTruthy();
    expect(screen.getByText('13 chars')).toBeTruthy();
    expect(screen.getByText('TEXT')).toBeTruthy(); // .txt has no language group
  });

  it('a handle-less buffer saves through showSaveFilePicker', async () => {
    const writable = { write: vi.fn(), close: vi.fn(async () => {}) };
    const saveHandle = { createWritable: vi.fn(async () => writable) };
    window.showSaveFilePicker = vi.fn(async () => saveHandle);
    delete window.showOpenFilePicker;
    let created = null;
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function () { created = this; });
    render(<Editor />);
    fireEvent.click(screen.getByText('Open'));
    Reflect.defineProperty(created, 'files', { configurable: true, value: [new File(['to save'], 'memo.txt')] });
    await act(async () => { await created.onchange(); });
    clickSpy.mockRestore();
    type('!'); // dirty the buffer so the save has content to write
    fireEvent.click(screen.getByText('Save'));
    await act(async () => {});
    expect(window.showSaveFilePicker).toHaveBeenCalledWith({ suggestedName: 'memo.txt' });
    expect(writable.write).toHaveBeenCalledWith('!to save'); // CM insert lands at 0
    expect(screen.getByText('saved memo.txt')).toBeTruthy();
  });

  it('a failing save surfaces "save failed" instead of throwing', async () => {
    window.showSaveFilePicker = vi.fn(async () => { throw new Error('disk full'); });
    delete window.showOpenFilePicker;
    let created = null;
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function () { created = this; });
    render(<Editor />);
    fireEvent.click(screen.getByText('Open'));
    Reflect.defineProperty(created, 'files', { configurable: true, value: [new File(['x'], 'doom.txt')] });
    await act(async () => { await created.onchange(); });
    clickSpy.mockRestore();
    fireEvent.click(screen.getByText('Save'));
    await act(async () => {});
    expect(await screen.findByText('save failed: disk full')).toBeTruthy();
  });

  it('Mod-S saves through the CodeMirror keymap', async () => {
    h.files.set('/Home/km.md', new Blob(['# km'], { type: 'text/markdown' }));
    render(<Editor args={{ path: '/Home/km.md' }} />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    type('!');
    fireEvent.keyDown(document.querySelector('.cm-content'), { key: 's', ctrlKey: true, bubbles: true });
    await act(async () => {});
    expect(await screen.findByText('saved km.md → Files')).toBeTruthy();
  });

  it('a Files-disk file opens into a storePath buffer with live preview', async () => {
    h.files.set('/Home/readme.md', new Blob(['# Title\n\nbody'], { type: 'text/markdown' }));
    render(<Editor args={{ path: '/Home/readme.md' }} />);
    await act(async () => {});
    // markdown store files open straight into preview
    expect(screen.getByText('Title')).toBeTruthy();
    expect(screen.getByText('preview — editing paused')).toBeTruthy();
    expect(screen.getByTitle('/Home/readme.md').textContent).toBe('Files: /Home/readme.md');

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    type('more');
    fireEvent.click(screen.getByText('Save'));
    await act(async () => {});
    expect(h.files.has('/Home/readme.md')).toBe(true); // written back in place
    expect(await screen.findByText('saved readme.md → Files')).toBeTruthy();
  });

  it('a missing store path reports honestly instead of throwing', async () => {
    render(<Editor args={{ path: '/Home/gone.md' }} />);
    expect(await screen.findByText('not found: /Home/gone.md')).toBeTruthy();
  });

  it('a restored buffer whose handle was dropped says "link lost"', () => {
    localStorage.setItem('webos.editor.state', JSON.stringify({
      buffers: [{ id: 1, name: 'remote.md', text: 'x', dirty: false, needsHandle: true }],
      activeId: 1,
      nextId: 2,
    }));
    render(<Editor />);
    expect(screen.getByText('link lost')).toBeTruthy();
    expect(screen.getByTitle('Re-open the file to save in place again')).toBeTruthy();
  });
});

describe('MarkdownView', () => {
  const show = (src) => {
    const { container } = render(<MarkdownView src={src} />);
    return container.querySelector('.md-view');
  };

  it('renders headings, paragraphs and inline marks as elements', () => {
    const view = show('# Top\n\nplain **bold** *em* `code` ~~gone~~ text');
    expect(view.querySelector('h1').textContent).toBe('Top');
    expect(view.querySelector('p').textContent).toBe('plain bold em code gone text');
    expect(view.querySelector('strong').textContent).toBe('bold');
    expect(view.querySelector('em').textContent).toBe('em');
    expect(view.querySelector('code').textContent).toBe('code');
    expect(view.querySelector('del').textContent).toBe('gone');
  });

  it('safe links become anchors; unsafe targets degrade to plain text', () => {
    const view = show('[ok](https://x.test) [rel](/site) [bad](javascript:alert(1)) [p](//cdn.test)');
    const anchors = [...view.querySelectorAll('a')];
    expect(anchors).toHaveLength(2);
    expect(anchors[0]).toMatchObject({ href: 'https://x.test/', target: '_blank' });
    expect(anchors[0].rel).toContain('noreferrer');
    expect(anchors[1].getAttribute('href')).toBe('/site');
    expect(anchors[1].target).toBe('_blank');
    const spans = [...view.querySelectorAll('span')].map((s) => s.textContent);
    expect(spans).toContain('bad'); // javascript: → text, never an <a>
    expect(spans).toContain('p'); // protocol-relative → text
  });

  it('images require safe sources; unsafe alts fall back to text', () => {
    const view = show('![pic](https://x.test/i.png) ![nope](data:image/png;base64,x)');
    const img = view.querySelector('img');
    expect(img).toMatchObject({ src: 'https://x.test/i.png', loading: 'lazy' });
    expect(img.alt).toBe('pic');
    expect(view.querySelector('span').textContent).toBe('nope'); // data: URL refused
  });

  it('code blocks, quotes and rules keep their raw text', () => {
    const view = show('```\nconst a = 1;\n```\n\n> quoted\n\n---');
    expect(view.querySelector('pre > code').textContent).toBe('const a = 1;');
    expect(view.querySelector('blockquote').textContent).toBe('quoted');
    expect(view.querySelector('hr')).toBeTruthy();
  });

  it('lists nest up to depth classes and keep ordered/unordered tags', () => {
    const view = show('- a\n  - a1\n1. one\n2. two');
    const outer = view.querySelector('ul.md-list.d1');
    expect(outer.querySelector('li')).toBeTruthy();
    expect(outer.querySelector('ul.md-list.d2').textContent).toBe('a1');
    expect(view.querySelector('ol')).toBeTruthy();
    expect([...view.querySelectorAll('ol > li')].map((li) => li.textContent)).toEqual(['one', 'two']);
  });

  it('tables render with per-column alignment', () => {
    const view = show('| a | b |\n|:-:|---|\n| 1 | 2 |');
    const [tha, thb] = [...view.querySelectorAll('th')];
    expect(tha.style.textAlign).toBe('center');
    expect(thb.style.textAlign).toBe('left'); // separator fallback
    expect([...view.querySelectorAll('td')].map((td) => td.textContent)).toEqual(['1', '2']);
  });

  it('renders nothing for empty input without crashing', () => {
    const view = show('');
    expect(view.children).toHaveLength(0);
    expect(show(null).children).toHaveLength(0);
  });
});

describe('Editor — boot failure', () => {
  it('a failing disk surfaces "open failed" from the args.path boot', async () => {
    h.failGet = true;
    render(<Editor args={{ path: '/Home/lost.md' }} />);
    expect(await screen.findByText('open failed: disk gone')).toBeTruthy();
  });
});
