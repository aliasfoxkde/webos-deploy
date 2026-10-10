// Markdown parser + link safety for the Editor preview / Notepad viewer.
import { describe, it, expect } from 'vitest';
import { parseMarkdown, parseInline, safeHref } from '../src/apps/editor/markdown.js';

describe('parseMarkdown blocks', () => {
  it('parses headings of every level', () => {
    const blocks = parseMarkdown('# a\n## b\n### c\n#### d\n##### e\n###### f');
    expect(blocks.map((b) => [b.type, b.level])).toEqual([
      ['heading', 1], ['heading', 2], ['heading', 3], ['heading', 4], ['heading', 5], ['heading', 6],
    ]);
  });

  it('parses fenced code with language and keeps body verbatim', () => {
    const blocks = parseMarkdown('```rust\nfn main() {}\nfn two() {}\n```');
    expect(blocks).toEqual([{ type: 'code', lang: 'rust', text: 'fn main() {}\nfn two() {}' }]);
  });

  it('handles unclosed fences without losing the body', () => {
    expect(parseMarkdown('```js\nlet x = 1;')).toEqual([{ type: 'code', lang: 'js', text: 'let x = 1;' }]);
  });

  it('pairs tildes only with tildes', () => {
    const blocks = parseMarkdown('~~~\ncode\n~~~\n```not code```\n');
    expect(blocks[0]).toEqual({ type: 'code', lang: '', text: 'code' });
    expect(blocks[1].type).toBe('para');
  });

  it('parses lists with nesting and continuation lines', () => {
    const blocks = parseMarkdown('- one\n  - one.a\n- two\n  continued');
    expect(blocks).toHaveLength(1);
    const list = blocks[0];
    expect(list.ordered).toBe(false);
    expect(list.items[0].text).toBe('one');
    expect(list.items[0].nested.map((n) => n.text)).toEqual(['one.a']);
    expect(list.items[1].text).toBe('two continued');
  });

  it('parses ordered lists', () => {
    expect(parseMarkdown('1. a\n2. b')[0].ordered).toBe(true);
    expect(parseMarkdown('1) a\n2) b')[0].ordered).toBe(true);
  });

  it('parses tables with alignment', () => {
    const blocks = parseMarkdown('| l | c | r |\n|---|:-:|--:|\n| 1 | 2 | 3 |');
    const t = blocks[0];
    expect(t.type).toBe('table');
    expect(t.header).toEqual(['l', 'c', 'r']);
    expect(t.align).toEqual(['left', 'center', 'right']);
    expect(t.rows).toEqual([['1', '2', '3']]);
  });

  it('parses blockquotes joining consecutive lines', () => {
    expect(parseMarkdown('> a\n> b')[0]).toEqual({ type: 'quote', text: 'a\nb' });
  });

  it('parses thematic breaks', () => {
    expect(parseMarkdown('---\n***\n___').every((b) => b.type === 'hr')).toBe(true);
  });

  it('groups paragraph lines until a blank line or block opener', () => {
    expect(parseMarkdown('one\ntwo\n\nthree')).toEqual([
      { type: 'para', text: 'one\ntwo' },
      { type: 'para', text: 'three' },
    ]);
    // a heading interrupts a paragraph
    expect(parseMarkdown('one\n## two')[1].type).toBe('heading');
  });

  it('renders raw HTML as text, never markup', () => {
    const blocks = parseMarkdown('hello <script>alert(1)</script> world');
    expect(blocks[0].text).toContain('<script>');
  });

  it('treats MDX JSX as text (parsed as markdown)', () => {
    // JSX is not a block opener: the export line and the tag merge into one
    // paragraph (a paragraph runs until a blank line) and both stay text
    const blocks = parseMarkdown('# Hi\nexport const x = 1\n<Component />');
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe('heading');
    expect(blocks[1].text).toContain('export const x = 1');
    expect(blocks[1].text).toContain('<Component />');
    // a blank line splits them into separate paragraphs
    const split = parseMarkdown('export const x = 1\n\n<Component />');
    expect(split).toHaveLength(2);
  });

  it('handles empty and null input', () => {
    expect(parseMarkdown('')).toEqual([]);
    expect(parseMarkdown(null)).toEqual([]);
  });
});

describe('parseInline', () => {
  it('finds bold, italic, code, strike in one pass', () => {
    const tks = parseInline('a **b** *c* `d` ~~e~~');
    expect(tks.map((t) => t.t)).toEqual(['text', 'bold', 'text', 'italic', 'text', 'code', 'text', 'strike']);
    expect(tks[1].text).toBe('b');
  });

  it('supports triple emphasis and underscore italic', () => {
    expect(parseInline('***x***')[0].text).toBe('x');
    expect(parseInline('_y_')[0].t).toBe('italic');
  });

  it('extracts links and images', () => {
    expect(parseInline('[site](https://x.y)')[0]).toEqual({ t: 'link', text: 'site', href: 'https://x.y' });
    expect(parseInline('![alt](https://x.y/i.png)')[0]).toEqual({ t: 'image', alt: 'alt', href: 'https://x.y/i.png' });
  });

  it('keeps plain text untouched', () => {
    expect(parseInline('just words')).toEqual([{ t: 'text', text: 'just words' }]);
  });
});

describe('safeHref', () => {
  it('allows web, mail, same-origin-relative and hash targets', () => {
    for (const ok of ['https://a.b/c', 'http://a.b', 'mailto:a@b.c', '/Home/notes.md', '#section']) {
      expect(safeHref(ok)).toBe(ok);
    }
  });

  it('blocks javascript:, data:, and protocol-relative URLs', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,<b>', 'vbscript:x', '//evil.example/x', 'file:///etc/passwd']) {
      expect(safeHref(bad)).toBeNull();
    }
  });
});
