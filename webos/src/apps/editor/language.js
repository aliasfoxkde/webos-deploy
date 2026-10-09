// Language detection + CodeMirror wiring (extensions, theme, highlight style).
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { rust } from '@codemirror/lang-rust';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { keymap } from '@codemirror/view';
import { EditorView } from 'codemirror';

const LANGS = [
  { ext: ['js', 'jsx', 'mjs', 'cjs'], lang: () => javascript({ jsx: true }) },
  { ext: ['ts', 'tsx', 'mts'], lang: () => javascript({ jsx: true, typescript: true }) },
  { ext: ['html', 'htm', 'svg', 'vue'], lang: () => html() },
  { ext: ['css'], lang: () => css() },
  { ext: ['json', 'webmanifest', 'map'], lang: () => json() },
  { ext: ['md', 'markdown'], lang: () => markdown() },
  { ext: ['py', 'pyw'], lang: () => python() },
  { ext: ['rs'], lang: () => rust() },
];

export function detectLanguage(name) {
  const ext = name.split('.').pop().toLowerCase();
  return LANGS.find((l) => l.ext.includes(ext))?.lang() ?? [];
}

export function languageLabel(name) {
  const ext = name.split('.').pop().toUpperCase();
  return LANGS.some((l) => l.ext.includes(ext.toLowerCase())) ? ext : 'TEXT';
}

// Palette mirrors the WebOS shell CSS variables.
const webosTheme = EditorView.theme({
  '&': { color: 'var(--text)', backgroundColor: 'transparent', fontSize: '13px' },
  '.cm-content': { fontFamily: 'ui-monospace, "JetBrains Mono", Menlo, monospace', caretColor: 'var(--accent)' },
  '.cm-scroller': { fontFamily: 'ui-monospace, "JetBrains Mono", Menlo, monospace', lineHeight: '1.55' },
  '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--text-dim)', border: 'none', opacity: 0.7 },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--text)' },
  '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.04)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'color-mix(in srgb, var(--accent) 30%, transparent)' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)' },
  '.cm-matchingBracket': { backgroundColor: 'color-mix(in srgb, var(--accent) 25%, transparent)', outline: 'none' },
}, { dark: true });

const highlight = HighlightStyle.define([
  { tag: t.comment, color: '#6b7280', fontStyle: 'italic' },
  { tag: [t.keyword, t.modifier], color: '#c084fc' },
  { tag: [t.string, t.special(t.string)], color: '#a3e635' },
  { tag: [t.number, t.bool, t.null], color: '#fbbf24' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#60a5fa' },
  { tag: [t.typeName, t.className, t.namespace], color: '#2dd4bf' },
  { tag: [t.propertyName, t.attributeName], color: '#7dd3fc' },
  { tag: [t.operator, t.punctuation, t.bracket], color: '#9ca3af' },
  { tag: t.definition(t.variableName), color: '#e5e7eb' },
  { tag: t.invalid, color: '#f87171' },
]);

export function editorExtensions(onChange, saveBinding, wrapOn) {
  const ext = [
    webosTheme,
    syntaxHighlighting(highlight),
    keymap.of(saveBinding),
    EditorView.updateListener.of((v) => {
      if (v.docChanged) onChange(v.state.doc.toString());
    }),
  ];
  if (wrapOn) ext.push(EditorView.lineWrapping);
  return ext;
}
