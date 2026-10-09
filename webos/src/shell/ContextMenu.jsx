import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

/* Global context-menu system. Right-click targets carry data-cm="<kind>:<arg>"
   attributes; App builds the item list per kind. Positioning flips inside the
   viewport on both axes. */

export function useContextMenu(buildItems) {
  const [menu, setMenu] = useState(null); // { x, y, items }
  const menuRef = useRef(null);

  useEffect(() => {
    const onCtx = (e) => {
      const el = e.target.closest('[data-cm]');
      if (!el) return;
      e.preventDefault();
      const [kind, arg] = el.dataset.cm.split(':');
      const items = buildItems(kind, arg);
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
  }, [buildItems]);

  // Flip near edges once rendered and measured.
  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return;
    const r = menuRef.current.getBoundingClientRect();
    let { x, y } = menu;
    if (x + r.width > window.innerWidth - 8) x = Math.max(8, window.innerWidth - r.width - 8);
    if (y + r.height > window.innerHeight - 8) y = Math.max(8, y - r.height);
    if (x !== menu.x || y !== menu.y) setMenu({ ...menu, x, y });
  }, [menu]);

  const node = menu ? (
    <div className="ctx-menu" ref={menuRef} style={{ left: menu.x, top: menu.y }} role="menu">
      {menu.items.map((it, i) =>
        it === '-' ? (
          <div className="ctx-sep" key={i} />
        ) : (
          <button
            key={i}
            className="ctx-item"
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
