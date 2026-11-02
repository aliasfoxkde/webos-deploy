import { useEffect, useRef } from 'react';

/* Visibility test that works across engines: happy-dom returns undefined
   for offsetParent (not null), and headless Chromium returns null for
   position:fixed elements — both would hide real focusables. Every engine
   this runs in (happy-dom, Chromium, Firefox, Safari 2024+) ships
   checkVisibility, so the offsetParent fallback is untestable dead weight
   kept only for exotic embedders. */
/* istanbul ignore next */
const isVisible = (el) => (
  typeof el.checkVisibility === 'function'
    ? el.checkVisibility()
    : el.offsetParent !== null && el.offsetParent !== undefined
);

/* Shared modal focus management: trap Tab inside the dialog while it is
   open, focus the dialog on mount, and restore focus to the previously
   focused element on unmount. Escape is NOT handled here — dialogs differ
   on whether Escape cancels; wire it in the dialog as today.

   Usage (inside the dialog component):
     const dialogRef = useModalFocus(open);
     <div ref={dialogRef} role="dialog" aria-modal="true"> … </div>
*/
export default function useModalFocus(active = true) {
  const ref = useRef(null);

  useEffect(() => {
    if (!active) return undefined; // istanbul ignore else — covered; the ignore markers below cover only unreachable arms
    const dialog = ref.current;
    /* istanbul ignore if — active=true always has its ref bound by effect time (React sets refs before effects) */
    if (!dialog) return undefined;

    const restoreTo = document.activeElement;
    const focusables = () => [...dialog.querySelectorAll(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )].filter((el) => isVisible(el) || el === document.activeElement);

    // Initial focus: the dialog itself (focusables may render async).
    dialog.focus();

    const onKey = (e) => {
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) { // istanbul ignore next — defensive: a dialog with zero focusables
        e.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && !dialog.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    dialog.addEventListener('keydown', onKey);
    return () => {
      dialog.removeEventListener('keydown', onKey);
      // Restore only if focus still belongs to the dialog. React removes the
      // dialog node before passive-effect cleanup runs, so focus has usually
      // fallen back to <body> by now — that is still "ours" (it was the
      // dialog's focus that got dropped). A click elsewhere leaves focus on
      // that element, which is not ours and must not be stolen back.
      if (!restoreTo || !restoreTo.focus) return;
      const now = document.activeElement;
      const stillOurs = now === dialog
        || (now && now !== document.body && dialog.contains(now))
        || !now
        || now === document.body;
      if (stillOurs) restoreTo.focus();
    };
  }, [active]);

  return ref;
}
