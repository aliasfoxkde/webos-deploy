/* Markdown → block/inline token parser for the Editor's preview and the
   Notepad's note viewer. Pure data in, pure data out — rendering happens in
   MarkdownView.jsx as plain React elements (no HTML passthrough, no
   dangerouslySetInnerHTML: raw HTML in the source renders as text, which is
   the safety model). MDX is parsed as markdown; JSX tags surface as text. */

/* Split a table row on '|' outside of backticks/escapes is overkill for this
   renderer — trim the outer pipes and split, which matches CommonMark for
   the simple tables we render. */
const splitRow = (line) => line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|');

const HR = /^\s*([-*_])\s*(?:\1\s*){2,}$/;
const FENCE = /^\s*(```+|~~~+)\s*([\w+-]*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const QUOTE = /^\s*>/;
const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/;

/* Inline tokens: code, bold, italic, strike, image, link — one alternation
   pass, strongest markers first so ** wins over *. */
const INLINE_RE = new RegExp(
  [
    '(`+)([^`]|[^`][\\s\\S]*?[^`])\\1(?!`)', // code
    '\\*\\*\\*(?=\\S)([\\s\\S]*?\\S)\\*\\*\\*', // bold italic
    // backrefs point at their own group: \\4 for bold's delimiter, \\6 for
    // italic's — \\1 is the code fence group, and in JS a backref to a
    // non-participating group matches the empty string
    '(\\*\\*|__)(?=\\S)([\\s\\S]*?\\S)\\4', // bold
    '(\\*|_)(?=\\S)([\\s\\S]*?\\S)\\6', // italic
    '~~(?=\\S)([\\s\\S]*?\\S)~~', // strike
    '!\\[([^\\]]*)\\]\\(([^)\\s]+)(?:\\s+"[^"]*")?\\)', // image
    '\\[([^\\]]+)\\]\\(([^)\\s]+)(?:\\s+"[^"]*")?\\)', // link
  ].join('|'),
  'g',
);

export function parseInline(text) {
  const tokens = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    if (m.index > last) tokens.push({ t: 'text', text: text.slice(last, m.index) });
    if (m[1] !== undefined) tokens.push({ t: 'code', text: m[2] });
    else if (m[3] !== undefined) tokens.push({ t: 'bold', text: m[3], strong: true, em: true });
    else if (m[4] !== undefined) tokens.push({ t: 'bold', text: m[5] });
    else if (m[6] !== undefined) tokens.push({ t: 'italic', text: m[7] });
    else if (m[8] !== undefined) tokens.push({ t: 'strike', text: m[8] });
    else if (m[9] !== undefined) tokens.push({ t: 'image', alt: m[9], href: m[10] });
    else if (m[11] !== undefined) tokens.push({ t: 'link', text: m[11], href: m[12] });
    last = m.index + m[0].length;
  }
  if (last < text.length) tokens.push({ t: 'text', text: text.slice(last) });
  return tokens;
}

/* Block parse. Returns an array of:
   { type: 'heading', level, text } · { type: 'para', text } ·
   { type: 'code', lang, text } · { type: 'quote', text } ·
   { type: 'list', ordered, items: [{ text, nested: [...] }] } ·
   { type: 'table', align, header, rows } · { type: 'hr' } */
export function parseMarkdown(src) {
  const lines = String(src ?? '').split(/\r?\n/);
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }

    const fence = FENCE.exec(line);
    if (fence) {
      // closing fence = same marker char, at least as long as the opener
      const close = new RegExp(`^\\s*\\${fence[1][0]}{${fence[1].length},}\\s*$`);
      const body = [];
      i += 1;
      while (i < lines.length && !close.test(lines[i])) { body.push(lines[i]); i += 1; }
      i += 1; // swallow the closing fence (or run off the end — unclosed fence still renders)
      blocks.push({ type: 'code', lang: fence[2] || '', text: body.join('\n') });
      continue;
    }

    const head = HEADING.exec(line);
    if (head) { blocks.push({ type: 'heading', level: head[1].length, text: head[2] }); i += 1; continue; }

    if (HR.test(line)) { blocks.push({ type: 'hr' }); i += 1; continue; }

    if (QUOTE.test(line)) {
      const body = [];
      while (i < lines.length && QUOTE.test(lines[i])) { body.push(lines[i].replace(/^\s*>\s?/, '')); i += 1; }
      blocks.push({ type: 'quote', text: body.join('\n') });
      continue;
    }

    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      const align = splitRow(lines[i + 1]).map((c) => {
        const cell = c.trim();
        if (/^:-+:$/.test(cell)) return 'center';
        if (/-:$/.test(cell)) return 'right';
        return 'left';
      });
      const header = splitRow(line).map((c) => c.trim());
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) { rows.push(splitRow(lines[i]).map((c) => c.trim())); i += 1; }
      blocks.push({ type: 'table', align, header, rows });
      continue;
    }

    const item = LIST_ITEM.exec(line);
    if (item) {
      const ordered = /^\d/.test(item[2]);
      const flat = [];
      while (i < lines.length) {
        const m = LIST_ITEM.exec(lines[i]);
        if (m) { flat.push({ indent: m[1].length, text: m[3] }); i += 1; continue; }
        // continuation: an indented non-list line appends to the previous item
        if (/^\s{2,}\S/.test(lines[i]) && flat.length) { flat[flat.length - 1].text += ` ${lines[i].trim()}`; i += 1; continue; }
        break;
      }
      const items = [];
      for (const it of flat) {
        const top = { text: it.text, nested: [] };
        if (it.indent >= 2 && items.length) items[items.length - 1].nested.push(top);
        else items.push(top);
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    // paragraph: consume until a blank line or another block opener
    const para = [line];
    i += 1;
    while (
      i < lines.length
      && lines[i].trim()
      && !HEADING.test(lines[i])
      && !FENCE.test(lines[i])
      && !QUOTE.test(lines[i])
      && !LIST_ITEM.test(lines[i])
      && !HR.test(lines[i])
      && !(lines[i].includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]))
    ) { para.push(lines[i]); i += 1; }
    blocks.push({ type: 'para', text: para.join('\n') });
  }
  return blocks;
}

/* Only these link/image targets become clickable/navigable; anything else
   (javascript:, data:, vbscript:, garbage) renders as inert text. Relative
   URLs stay relative — the app is deployed under arbitrary sub-paths. */
export function safeHref(href) {
  return /^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(href || '') ? href : null;
}
