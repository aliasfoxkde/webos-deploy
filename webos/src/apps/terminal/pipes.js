/* Shell pipe parsing for wosh: split a command line on unquoted '|' into
   pipeline segments. Quotes ('…' and "…") protect pipes; an unterminated
   quote yields null so the caller can report it instead of mis-parsing. */

export function splitPipes(cmd) {
  const segs = [];
  let cur = '';
  let quote = null;
  for (const ch of cmd) {
    if (quote) {
      if (ch === quote) quote = null;
      cur += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      cur += ch;
    } else if (ch === '|') {
      segs.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (quote) return null; // unterminated quote — caller reports the error
  segs.push(cur);
  return segs;
}
