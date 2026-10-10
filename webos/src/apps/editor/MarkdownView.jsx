// Markdown renderer — blocks/tokens from markdown.js to plain React elements.
// No HTML passthrough: untrusted text can only ever become text nodes, and
// link/image targets pass through safeHref().
import React from 'react';
import { parseMarkdown, parseInline, safeHref } from './markdown.js';

function Inline({ text }) {
  return parseInline(text).map((tk, i) => {
    switch (tk.t) {
      case 'code': return <code key={i}>{tk.text}</code>;
      case 'bold': return <strong key={i}>{tk.text}</strong>;
      case 'italic': return <em key={i}>{tk.text}</em>;
      case 'strike': return <del key={i}>{tk.text}</del>;
      case 'image': {
        const href = safeHref(tk.href);
        return href ? <img key={i} src={href} alt={tk.alt} loading="lazy" /> : <span key={i}>{tk.alt}</span>;
      }
      case 'link': {
        const href = safeHref(tk.href);
        // unsafe targets degrade to plain text — never an <a>
        return href
          ? <a key={i} href={href} target={href.startsWith('#') ? undefined : '_blank'} rel="noreferrer noopener">{tk.text}</a>
          : <span key={i}>{tk.text}</span>;
      }
      default: return <React.Fragment key={i}>{tk.text}</React.Fragment>;
    }
  });
}

function ListItem({ item, ordered, depth }) {
  const Tag = ordered ? 'ol' : 'ul';
  return (
    <li>
      <Inline text={item.text} />
      {item.nested.length > 0 && (
        <Tag className={`md-list d${Math.min(depth + 1, 3)}`}>
          {item.nested.map((n, i) => <ListItem key={i} item={n} ordered={ordered} depth={depth + 1} />)}
        </Tag>
      )}
    </li>
  );
}

export default function MarkdownView({ src }) {
  const blocks = parseMarkdown(src);
  return (
    <div className="md-view">
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'heading': {
            const H = `h${Math.min(b.level, 6)}`;
            return <H key={i}><Inline text={b.text} /></H>;
          }
          case 'para': return <p key={i}><Inline text={b.text} /></p>;
          case 'code': return <pre key={i}><code>{b.text}</code></pre>;
          case 'quote': return <blockquote key={i}><Inline text={b.text} /></blockquote>;
          case 'hr': return <hr key={i} />;
          case 'list': {
            const Tag = b.ordered ? 'ol' : 'ul';
            return (
              <Tag key={i} className="md-list d1">
                {b.items.map((it, j) => <ListItem key={j} item={it} ordered={b.ordered} depth={1} />)}
              </Tag>
            );
          }
          case 'table':
            return (
              <div key={i} className="md-table-wrap">
                <table>
                  <thead>
                    <tr>{b.header.map((h, j) => <th key={j} style={{ textAlign: b.align[j] || 'left' }}><Inline text={h} /></th>)}</tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j}>{r.map((c, k) => <td key={k} style={{ textAlign: b.align[k] || 'left' }}><Inline text={c} /></td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          default: return null;
        }
      })}
    </div>
  );
}
