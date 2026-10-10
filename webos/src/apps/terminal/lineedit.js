/* Pure line-editing transitions for the wosh input line. The component owns
   the buffer + cursor state and key→action mapping; every mutation goes
   through edit() so the readline-style behaviour is unit-testable. */

/* Start of the word before `cur` (readline M-b: skip spaces back, then
   non-spaces back). */
export const wordBack = (buf, cur) => {
  let i = cur;
  while (i > 0 && /\s/.test(buf[i - 1])) i -= 1;
  while (i > 0 && !/\s/.test(buf[i - 1])) i -= 1;
  return i;
};

/* End of the word after `cur` (readline M-f). */
export const wordFwd = (buf, cur) => {
  let i = cur;
  while (i < buf.length && /\s/.test(buf[i])) i += 1;
  while (i < buf.length && !/\s/.test(buf[i])) i += 1;
  return i;
};

/* Apply one editing action. Returns the new { buf, cur }, or null when the
   action is unknown for this state (no change). `ch` is the payload for
   `insert`. */
export function edit(buf, cur, action, ch) {
  const clamp = (c) => Math.max(0, Math.min(buf.length, c));
  const at = (c) => ({ buf, cur: clamp(c) });
  switch (action) {
    case 'insert': {
      if (!ch) return null;
      return { buf: buf.slice(0, cur) + ch + buf.slice(cur), cur: cur + ch.length };
    }
    case 'left': return cur > 0 ? at(cur - 1) : null;
    case 'right': return cur < buf.length ? at(cur + 1) : null;
    case 'home': return cur > 0 ? at(0) : null;
    case 'end': return cur < buf.length ? at(buf.length) : null;
    case 'backspace': {
      if (cur === 0) return null;
      return { buf: buf.slice(0, cur - 1) + buf.slice(cur), cur: cur - 1 };
    }
    case 'delete': {
      if (cur >= buf.length) return null;
      return { buf: buf.slice(0, cur) + buf.slice(cur + 1), cur };
    }
    case 'wordback': return cur > 0 ? at(wordBack(buf, cur)) : null;
    case 'wordfwd': return cur < buf.length ? at(wordFwd(buf, cur)) : null;
    case 'killword': { // delete the word before the cursor (readline M-d is fwd; Ctrl+W is back)
      if (cur === 0) return null;
      const w = wordBack(buf, cur);
      return { buf: buf.slice(0, w) + buf.slice(cur), cur: w };
    }
    case 'killbefore': { // Ctrl+U — clear from start to cursor
      if (cur === 0) return null;
      return { buf: buf.slice(cur), cur: 0 };
    }
    case 'killafter': { // Ctrl+K — clear from cursor to end
      if (cur >= buf.length) return null;
      return { buf: buf.slice(0, cur), cur };
    }
    default: return null;
  }
}
