// Editor pure libraries: the markdown tokenizer (shared with Notepad's
// preview), the buffer reducer + persistence, and language detection. The
// CodeMirror import chain in language.js is real — same extensions the app
// ships.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseInline, parseMarkdown, safeHref } from '../src/apps/editor/markdown.js';
import { loadState, persist, reducer } from '../src/apps/editor/buffers.js';
import { detectLanguage, languageLabel, editorExtensions } from '../src/apps/editor/language.js';

describe('language detection', () => {
  it('covers every extension group and labels unknowns TEXT', () => {
    for (const name of ['app.js', 'mod.tsx', 'page.html', 'theme.css', 'data.json', 'READ.md', 'main.py', 'lib.rs']) {
      expect(detectLanguage(name), name).not.toEqual([]); // the no-match fallback is exactly []
    }
    expect(detectLanguage('archive.tar')).toEqual([]); // no group matches
    expect(languageLabel('styles.CSS')).toBe('CSS');
    expect(languageLabel('noext')).toBe('TEXT');
  });
});

describe('markdown blocks', () => {
  it('headings, paragraphs, hr and quotes', () => {
    expect(parseMarkdown('# h1\n## h2\n###### h6')).toEqual([
      { type: 'heading', level: 1, text: 'h1' },
      { type: 'heading', level: 2, text: 'h2' },
      { type: 'heading', level: 6, text: 'h6' },
    ]);
    expect(parseMarkdown('para one\nwrapped line\n\npara two')).toEqual([
      { type: 'para', text: 'para one\nwrapped line' },
      { type: 'para', text: 'para two' },
    ]);
    expect(parseMarkdown('***\n---\n___')).toEqual([{ type: 'hr' }, { type: 'hr' }, { type: 'hr' }]);
    expect(parseMarkdown('> quoted\n> more\n>still same')).toEqual([
      { type: 'quote', text: 'quoted\nmore\nstill same' },
    ]);
  });

  it('fenced code keeps lang and body; unclosed fence still renders', () => {
    expect(parseMarkdown('```js\nlet x = 1;\nlet y = 2;\n```')).toEqual([
      { type: 'code', lang: 'js', text: 'let x = 1;\nlet y = 2;' },
    ]);
    expect(parseMarkdown('~~~\nno close')).toEqual([{ type: 'code', lang: '', text: 'no close' }]);
  });

  it('tables parse alignment from the separator row', () => {
    expect(parseMarkdown('| a | b | c |\n|:-:|--:|---|\n| 1 | 2 | 3 |')).toEqual([
      {
        type: 'table',
        align: ['center', 'right', 'left'],
        header: ['a', 'b', 'c'],
        rows: [['1', '2', '3']],
      },
    ]);
  });

  it('lists nest on two-space indent and join continuation lines', () => {
    expect(parseMarkdown('- top\n  - nested\n  continued\n1. one\n2. two')).toEqual([
      {
        type: 'list',
        ordered: false,
        items: [{ text: 'top', nested: [{ text: 'nested continued', nested: [] }] }],
      },
      { type: 'list', ordered: true, items: [{ text: 'one', nested: [] }, { text: 'two', nested: [] }] },
    ]);
  });

  it('is total: CRLF input, empty string and null all yield arrays', () => {
    expect(parseMarkdown('a\r\nb')).toEqual([{ type: 'para', text: 'a\nb' }]);
    expect(parseMarkdown('')).toEqual([]);
    expect(parseMarkdown(null)).toEqual([]);
  });
});

describe('markdown inline tokens', () => {
  const kinds = (text) => parseInline(text).map((t) => t.t);

  it('strongest markers win; each inline form tokenizes', () => {
    // triple stars are bold-italic; ** around nested single * is plain bold
    expect(parseInline('***both***')).toEqual([
      { t: 'bold', text: 'both', strong: true, em: true },
    ]);
    expect(parseInline('**bold *both* b**')).toEqual([
      { t: 'bold', text: 'bold *both* b' },
    ]);
    expect(kinds('a `code` b **bold** c *it* d ~~gone~~')).toEqual([
      'text', 'code', 'text', 'bold', 'text', 'italic', 'text', 'strike',
    ]); // no trailing token: the last match ends the string
    expect(parseInline('see [docs](https://x.y/a) now')[1]).toEqual({
      t: 'link', text: 'docs', href: 'https://x.y/a',
    });
    expect(parseInline('![alt text](/i.png "title")')[0]).toEqual({
      t: 'image', alt: 'alt text', href: '/i.png',
    });
  });

  it('raw HTML stays inert text — that is the safety model', () => {
    expect(parseInline('<script>alert(1)</script>')).toEqual([
      { t: 'text', text: '<script>alert(1)</script>' },
    ]);
  });

  it('plain text passes through as a single token', () => {
    expect(parseInline('just words')).toEqual([{ t: 'text', text: 'just words' }]);
  });
});

describe('safeHref', () => {
  it('allows http(s), mailto, site-relative and hash targets', () => {
    expect(safeHref('https://x.y/z')).toBe('https://x.y/z');
    expect(safeHref('http://x.y')).toBe('http://x.y');
    expect(safeHref('mailto:a@b.c')).toBe('mailto:a@b.c');
    expect(safeHref('/docs/a.md')).toBe('/docs/a.md'); // sub-path safe
    expect(safeHref('#frag')).toBe('#frag');
  });

  it('blocks scheme smuggling and empty targets', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('DATA:text/html,<b>hi</b>')).toBeNull();
    expect(safeHref('vbscript:x')).toBeNull();
    expect(safeHref('//evil.example')).toBeNull(); // protocol-relative offsite
    expect(safeHref('')).toBeNull();
    expect(safeHref(undefined)).toBeNull();
  });
});

describe('buffers persistence', () => {
  beforeEach(() => localStorage.clear());

  it('fresh state is one scratch buffer; saved state restores with the flag', () => {
    const fresh = loadState();
    expect(fresh.buffers).toHaveLength(1);
    expect(fresh.buffers[0].name).toBe('scratch.js');
    expect(fresh.restored).toBeUndefined();

    persist({ buffers: [{ id: 5, name: 'a.js', text: 'hi', dirty: true }], activeId: 5, nextId: 6 });
    const restored = loadState();
    expect(restored.restored).toBe(true);
    expect(restored.activeId).toBe(5);
    expect(restored.buffers[0].dirty).toBe(true);
  });

  it('corrupted JSON falls back to defaults', () => {
    localStorage.setItem('webos.editor.state', '{nope');
    expect(loadState().buffers[0].name).toBe('scratch.js');
    localStorage.setItem('webos.editor.state', '{"buffers":[]}');
    expect(loadState().buffers[0].name).toBe('scratch.js'); // empty list is not a state
  });

  it('persist strips File handles into needsHandle and refuses oversized payloads', () => {
    const handle = { kind: 'file' };
    const state = {
      buffers: [
        { id: 1, name: 'a.js', text: 'x', dirty: false, handle },
        { id: 2, name: 'b.js', text: 'y', dirty: true, needsHandle: true, handle: null },
      ],
      activeId: 2,
      nextId: 3,
    };
    expect(persist(state)).toBe(true);
    const saved = JSON.parse(localStorage.getItem('webos.editor.state'));
    expect(saved.buffers[0].needsHandle).toBe(true);
    expect(saved.buffers[0].handle).toBeUndefined(); // never persisted
    expect(saved.buffers[1].needsHandle).toBe(true);
    expect(persist({ buffers: [{ id: 1, name: 'big', text: 'x'.repeat(1_500_001) }], activeId: 1, nextId: 2 })).toBe(false);
    const boom = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(persist(state)).toBe(false);
    boom.mockRestore();
  });
});

describe('buffer reducer', () => {
  const base = {
    buffers: [
      { id: 1, name: 'one.js', text: '1', dirty: false },
      { id: 2, name: 'two.js', text: '2', dirty: false },
      { id: 3, name: 'three.js', text: '3', dirty: false },
    ],
    activeId: 2,
    nextId: 4,
  };

  it('new buffers take the next id, custom names and optional targets', () => {
    const s = reducer(base, { type: 'new', name: 'n.txt', text: 'hi', storePath: '/Home/n.txt' });
    expect(s.activeId).toBe(4);
    expect(s.nextId).toBe(5);
    expect(s.buffers[3]).toMatchObject({ id: 4, name: 'n.txt', text: 'hi', storePath: '/Home/n.txt' });
    expect(reducer(base, { type: 'new' }).buffers[3].name).toBe('untitled-4.txt');
  });

  it('edit dirties only the active buffer', () => {
    const s = reducer(base, { type: 'edit', text: '22' });
    expect(s.buffers.find((b) => b.id === 2)).toMatchObject({ text: '22', dirty: true });
    expect(s.buffers.find((b) => b.id === 1).dirty).toBe(false);
  });

  it('activate / rename / saved do the obvious thing', () => {
    expect(reducer(base, { type: 'activate', id: 3 }).activeId).toBe(3);
    expect(reducer(base, { type: 'rename', id: 1, name: 'renamed.js' }).buffers[0]).toMatchObject({
      name: 'renamed.js', dirty: true,
    });
    const saved = reducer(
      { ...base, buffers: [{ ...base.buffers[1], dirty: true, needsHandle: true }] },
      { type: 'saved', id: 2, name: 'final.js' }
    );
    expect(saved.buffers[0]).toMatchObject({ dirty: false, name: 'final.js' });
    // without a handle the re-link flag survives; with one it clears
    expect(saved.buffers[0].needsHandle).toBe(true);
    const relinked = reducer(
      { ...base, buffers: [{ ...base.buffers[1], dirty: true, needsHandle: true }] },
      { type: 'saved', id: 2, handle: 'H' }
    );
    expect(relinked.buffers[0]).toMatchObject({ handle: 'H', needsHandle: false });
  });

  it('close picks the neighbour; closing the last buffer reseeds scratch', () => {
    expect(reducer(base, { type: 'close', id: 2 })).toMatchObject({ activeId: 1, nextId: 4 });
    expect(reducer({ ...base, activeId: 3 }, { type: 'close', id: 3 }).activeId).toBe(2);
    const last = reducer({ ...base, activeId: 1 }, { type: 'close', id: 1 });
    expect(last.buffers.find((b) => b.id === 1)).toBeUndefined();
    const only = reducer({ ...base, buffers: [base.buffers[1]] }, { type: 'close', id: 2 });
    expect(only.buffers).toEqual([{ id: 4, name: 'scratch.js', text: '', dirty: false }]);
    expect(only.activeId).toBe(4);
    expect(only.nextId).toBe(5);
    expect(reducer(base, { type: 'wat' })).toBe(base); // unknown actions are no-ops
  });
});

describe('language detection', () => {
  it('maps extensions to real CodeMirror language support', () => {
    expect(detectLanguage('app.jsx')).toBeTruthy(); // javascript({jsx:true})
    expect(detectLanguage('main.rs')).toBeTruthy();
    expect(detectLanguage('data.json')).toBeTruthy();
    expect(detectLanguage('README.unknownext')).toEqual([]); // plain text
  });

  it('labels show the uppercased known extension or TEXT', () => {
    expect(languageLabel('script.JS')).toBe('JS');
    expect(languageLabel('readme.md')).toBe('MD');
    expect(languageLabel('noext')).toBe('TEXT');
  });

  it('editorExtensions includes the update listener; wrap is opt-in', () => {
    expect(editorExtensions(() => {}, [], false)).toHaveLength(4);
    expect(editorExtensions(() => {}, [], true)).toHaveLength(5);
  });
});
