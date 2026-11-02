import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

/* Global context-menu system. Right-click targets carry data-cm="<kind>:<arg>"
   attributes; App builds the item list per kind. Positioning flips inside the
   viewport on both axes. */

export function useContextMenu(buildItems) {
  const [menu, setMenu] = useState(null); // { x, y, items }
  const menuRef = useRef(null);

  // The item builder is read at dispatch time through a ref mirrored in a
  // layout effect: layout effects run synchronously with their commit, so a
  // right-click always sees the latest committed list. (Reaching the builder
  // through the effect closure instead meant the listeners were re-subscribed
  // passively — a right-click landing between a listing's commit and its
  // effect flush built items from the stale closure and silently opened
  // nothing.) Listeners therefore subscribe once.
  const buildRef = useRef(buildItems);
  useLayoutEffect(() => { buildRef.current = buildItems; });

  useEffect(() => {
    const onCtx = (e) => {
      const el = e.target.closest('[data-cm]');
      if (!el) return;
      e.preventDefault();
      const [kind, arg] = el.dataset.cm.split(':');
      const items = buildRef.current(kind, arg);
      if (!items || !items.length) return;
      setMenu({ x: e.clientX, y: e.clientY, items });
    };
    const onClose = () => setMenu(null);
    window.addEventListener('contextmenu', onCtx);
    window.addEventListener('click', onClose);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('contextmenu', onCtx);
      window.removeEventListener('click', onClose);
      window.removeEventListener('blur', onClose);
    };
  }, []);

  // Flip near edges once rendered and measured.
  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return;
    const r = menuRef.current.getBoundingClientRect();
    let { x, y } = menu;
    if (x + r.width > window.innerWidth - 8) x = Math.max(8, window.innerWidth - r.width - 8);
    if (y + r.height > window.innerHeight - 8) y = Math.max(8, y - r.height);
    if (x !== menu.x || y !== menu.y) setMenu({ ...menu, x, y });
  }, [menu]);

  // Keyboard model (WAI-ARIA menu pattern): focus enters the menu on open,
  // ArrowUp/Down move (wrapping), Home/End jump, Escape closes and returns
  // focus to the invoking element, Enter/Space run the item.
  useEffect(() => {
    if (!menu) return undefined;
    const el = menuRef.current;
    el?.focus();
    const onKey = (e) => {
      if (!menuRef.current) return;
      const items = [...menuRef.current.querySelectorAll('.ctx-item:not([disabled])')];
      const active = () => items.indexOf(document.activeElement);
      if (e.key === 'Escape') {
        e.preventDefault();
        setMenu(null);
        (e.target.closest?.('[data-cm]') || document.activeElement)?.focus?.();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!items.length) return;
        const i = active();
        const next = i === -1
          ? 0
          : (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[next].focus();
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        if (items.length) (e.key === 'Home' ? items[0] : items[items.length - 1]).focus();
      } else if ((e.key === 'Enter' || e.key === ' ') && document.activeElement?.classList.contains('ctx-item')) {
        e.preventDefault();
        document.activeElement.click();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menu]);

  const node = menu ? (
    <div className="ctx-menu" ref={menuRef} style={{ left: menu.x, top: menu.y }} role="menu" tabIndex={-1}>
      {menu.items.map((it, i) =>
        it === '-' ? (
          <div className="ctx-sep" key={i} role="separator" />
        ) : (
          <button
            key={i}
            className="ctx-item"
            role="menuitem"
            tabIndex={-1}
            onClick={() => { setMenu(null); it.run(); }}
            disabled={it.disabled}
          >
            {it.icon ? <img src={it.icon} alt="" /> : null}
            <span>{it.label}</span>
            {it.hint ? <small>{it.hint}</small> : null}
          </button>
        )
      )}
    </div>
  ) : null;

  return { menu: node, isOpen: !!menu, close: () => setMenu(null) };
}
