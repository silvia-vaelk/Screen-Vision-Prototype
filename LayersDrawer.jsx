import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronRight, ChevronDown,
  Lock, Unlock, Eye, EyeOff, Plus, X,
} from 'lucide-react';
import { DS } from './tokens.js';

/* ───────────────────────────────────────────────────────────────────────────
   LayersDrawer — Figma node 11-3234. Draggable from header.

   HOVER_ICONS = true  → lock/eye/search only appear on row hover (or if active)
   HOVER_ICONS = false → icons always visible (revert flag)
   ─────────────────────────────────────────────────────────────────────────── */
const HOVER_ICONS = true;

const L = {
  bg:          'var(--color-surface-content-default)',
  border:      'var(--color-border-default)',
  text:        'var(--color-text-default)',
  iconDim:     'var(--color-icon-subtle)',
  iconHover:   'var(--color-icon-default)',
  active:      'var(--color-icon-default)',
  textDim:     'var(--color-text-subtle)',
  textDisabled:'var(--color-text-disabled)',
  rowSelected: 'var(--color-background-subtle-default)',
  footerBtn:   'var(--color-background-subtle-default)',
  overlay:     'var(--color-overlay-subtle)',
  divider:     'var(--color-overlay-divider)',
  dragPill:    'var(--color-drag-pill)',
  dragPillHov: 'var(--color-drag-pill-hover)',
  font: "'Inter', sans-serif",
  radius: '24px',
};

const buildTree = (meshes) => {
  const root = { name: 'Scene', children: [], type: 'group', id: 'root', obj: null };
  const groupMap = new Map();
  groupMap.set('root', root);
  for (const mesh of meshes) {
    const chain = [];
    let cur = mesh.parent;
    while (cur && cur.type !== 'Scene') { chain.unshift(cur); cur = cur.parent; }
    let parentNode = root;
    for (const g of chain) {
      const key = g.uuid;
      let node = groupMap.get(key);
      if (!node) {
        node = { name: g.name || g.type, children: [], type: 'group', id: key, obj: g };
        groupMap.set(key, node);
        parentNode.children.push(node);
      }
      parentNode = node;
    }
    parentNode.children.push({ name: mesh.name || 'Mesh', children: [], type: 'mesh', id: mesh.uuid, obj: mesh });
  }
  return root;
};

/* Bare icon button — no background box, just the icon glyph. Active = red. */
const BareIcon = ({ children, active, onClick, title, visible }) => (
  <button
    title={title}
    onClick={(e) => { e.stopPropagation(); onClick?.(); }}
    style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: '20px', height: '20px', border: 'none', padding: 0, background: 'none',
      cursor: 'pointer', flexShrink: 0,
      color: active ? L.active : L.iconDim,
      transition: 'color 0.12s, opacity 0.12s',
      opacity: visible ? 1 : 0,
      pointerEvents: visible ? 'auto' : 'none',
    }}
    onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = L.iconHover; }}
    onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = L.iconDim; }}
  >
    {children}
  </button>
);

/* Eye+Opacity combined: click = toggle visibility, drag horizontal = scrub opacity. */
const EyeOpacityBare = ({ hidden, opacity, onToggle, onOpacity, visible, isolated, onExitIsolation }) => {
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubVal, setScrubVal] = useState(opacity);
  const [eyeHovered, setEyeHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState('');
  const inputRef = useRef(null);

  const commitEdit = () => {
    const n = parseInt(editVal, 10);
    if (!isNaN(n)) onOpacity(Math.min(100, Math.max(0, n)));
    setEditing(false);
  };

  const handleBadgeMouseDown = (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startOpacity = opacity;
    let moved = false;

    const onMove = (me) => {
      const dx = me.clientX - startX;
      if (!moved && Math.abs(dx) < 4) return;
      moved = true;
      setScrubbing(true);
      const next = Math.min(100, Math.max(0, Math.round(startOpacity + dx * 0.8)));
      setScrubVal(next);
      onOpacity(next);
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (!moved) {
        setEditVal(String(opacity));
        setEditing(true);
        setTimeout(() => { inputRef.current?.select(); }, 0);
      }
      setScrubbing(false);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startOpacity = opacity;
    let moved = false;

    const onMove = (me) => {
      const dx = me.clientX - startX;
      if (!moved && Math.abs(dx) < 4) return;
      moved = true;
      setScrubbing(true);
      const next = Math.min(100, Math.max(0, Math.round(startOpacity + dx * 0.8)));
      setScrubVal(next);
      onOpacity(next);
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (!moved) {
        if (isolated) onExitIsolation?.();
        else onToggle();
      }
      setScrubbing(false);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const effectivelyHidden = hidden || (!scrubbing && opacity === 0) || (scrubbing && scrubVal === 0);
  const hasCustomOpacity = opacity < 100 && opacity > 0;
  const showBadge = scrubbing || (!hidden && hasCustomOpacity) || (eyeHovered && !effectivelyHidden && !isolated);
  const iconWhite = scrubbing || hasCustomOpacity || isolated;
  const badgeVal = scrubbing ? scrubVal : opacity;

  return (
    <div
      onMouseEnter={() => setEyeHovered(true)}
      onMouseLeave={() => setEyeHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0,
        opacity: visible ? 1 : 0, pointerEvents: visible ? 'auto' : 'none',
        transition: 'opacity 0.12s',
      }}>
      {showBadge && (
        editing ? (
          <input
            ref={inputRef}
            value={editVal}
            onChange={(e) => setEditVal(e.target.value.replace(/[^0-9]/g, ''))}
            onBlur={commitEdit}
            onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false); e.stopPropagation(); }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '32px', fontSize: '11px', fontWeight: 500,
              color: L.text, fontFamily: L.font, background: L.divider,
              border: 'none', borderRadius: '3px', textAlign: 'right',
              padding: '1px 3px', outline: 'none', caretColor: L.text,
            }}
          />
        ) : (
          <span
            onMouseDown={handleBadgeMouseDown}
            style={{
              fontSize: '11px', fontWeight: 500,
              color: scrubbing || hasCustomOpacity ? L.text : L.textDim,
              fontFamily: L.font, minWidth: '26px', textAlign: 'right',
              cursor: 'ew-resize', userSelect: 'none',
              transition: 'color 0.15s, opacity 0.15s',
              opacity: scrubbing || hasCustomOpacity || eyeHovered ? 1 : 0,
            }}
          >
            {badgeVal}%
          </span>
        )
      )}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
      <button
        title={isolated ? 'Exit isolation' : effectivelyHidden ? 'Show' : 'Hide'}
        onMouseDown={handleMouseDown}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '20px', height: '20px', border: 'none', padding: 0, background: 'none',
          cursor: 'pointer',
          flexShrink: 0,
          color: (effectivelyHidden || iconWhite) ? L.active : eyeHovered ? L.iconHover : L.iconDim,
          transition: 'color 0.12s',
          userSelect: 'none',
        }}
      >
        {isolated ? (
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2.01677 10.5943C1.90328 10.4146 1.84654 10.3248 1.81477 10.1862C1.79091 10.0821 1.79091 9.91792 1.81477 9.81382C1.84654 9.67523 1.90328 9.58538 2.01677 9.40568C2.95461 7.9207 5.74617 4.16667 10.0003 4.16667C14.2545 4.16667 17.0461 7.9207 17.9839 9.40568C18.0974 9.58538 18.1541 9.67523 18.1859 9.81382C18.2098 9.91792 18.2098 10.0821 18.1859 10.1862C18.1541 10.3248 18.0974 10.4146 17.9839 10.5943C17.0461 12.0793 14.2545 15.8333 10.0003 15.8333C5.74617 15.8333 2.95461 12.0793 2.01677 10.5943Z" stroke="currentColor" strokeWidth="1.67" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M10.0003 12.5C11.381 12.5 12.5003 11.3807 12.5003 10C12.5003 8.61929 11.381 7.5 10.0003 7.5C8.61962 7.5 7.50034 8.61929 7.50034 10C7.50034 11.3807 8.61962 12.5 10.0003 12.5Z" stroke="currentColor" strokeWidth="1.67" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M5.66667 1.5H5.5C4.09987 1.5 3.3998 1.5 2.86502 1.77248C2.39462 2.01217 2.01217 2.39462 1.77248 2.86502C1.5 3.3998 1.5 4.09987 1.5 5.5V5.66667M5.66667 18.5H5.5C4.09987 18.5 3.3998 18.5 2.86502 18.2275C2.39462 17.9878 2.01217 17.6054 1.77248 17.135C1.5 16.6002 1.5 15.9001 1.5 14.5V14.3333M18.5 5.66667V5.5C18.5 4.09987 18.5 3.3998 18.2275 2.86502C17.9878 2.39462 17.6054 2.01217 17.135 1.77248C16.6002 1.5 15.9001 1.5 14.5 1.5H14.3333M18.5 14.3333V14.5C18.5 15.9001 18.5 16.6002 18.2275 17.135C17.9878 17.6054 17.6054 17.9878 17.135 18.2275C16.6002 18.5 15.9001 18.5 14.5 18.5H14.3333" stroke="currentColor" strokeWidth="1.67" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ) : effectivelyHidden ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
      </div>
    </div>
  );
};

/* ── Context menu ─────────────────────────────────────────────────────────── */
const ContextMenu = ({ menu, onClose }) => {
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') onClose(); });
    return () => { window.removeEventListener('pointerdown', close); };
  }, [onClose]);

  if (!menu) return null;

  const items = [
    { label: menu.ctx.isolatedId === menu.node.id ? 'Exit Isolation' : 'Isolate', shortcut: 'Alt+click', action: () => { menu.ctx.toggleIsolate(menu.node); onClose(); } },
    { label: 'Rename', shortcut: 'Double-click', action: () => { menu.ctx.startRename(menu.node); onClose(); } },
    { label: 'Duplicate', action: () => { menu.ctx.duplicate(menu.node); onClose(); } },
    { label: 'Delete', danger: true, action: () => { menu.ctx.deleteNode(menu.node); onClose(); } },
  ];

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: 'fixed', top: menu.y - 8, left: menu.x - 8, zIndex: 200,
        background: L.bg, border: `1px solid ${L.border}`,
        borderRadius: '12px', padding: '6px',
        minWidth: '190px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        fontFamily: L.font,
      }}
    >
      {items.map((item, i) =>
        item === null ? (
          <div key={i} style={{ height: '1px', background: L.border, margin: '4px 0' }} />
        ) : (
          <div
            key={item.label}
            onClick={item.action}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '7px 10px', borderRadius: '7px', cursor: 'pointer',
              fontSize: '13px', fontWeight: 400,
              color: item.danger ? '#e5484d' : L.text,
              gap: '24px',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-overlay-subtle)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <span>{item.label}</span>
            {item.shortcut && <span style={{ fontSize: '10px', color: L.textDisabled }}>{item.shortcut}</span>}
          </div>
        )
      )}
    </div>
  );
};

const TreeNode = ({ node, depth, ctx }) => {
  const [open, setOpen] = useState(depth < 2);
  const [hovered, setHovered] = useState(false);
  const [renameVal, setRenameVal] = useState(node.name);
  const inputRef = useRef(null);
  const hasChildren = node.children && node.children.length > 0;
  const renaming = ctx.renamingId === node.id;

  const startRename = () => { setRenameVal(node.name); ctx.startRename(node); setTimeout(() => { inputRef.current?.select(); }, 0); };
  const commitRename = () => {
    const v = renameVal.trim();
    if (v && node.obj) node.obj.name = v;
    if (v) node.name = v;
    ctx.startRename({ id: null }); // clear renamingId
  };
  const hidden = ctx.hiddenIds.has(node.id);
  const locked = ctx.lockedIds.has(node.id);
  const selected = ctx.selectedId === node.id;
  const located = ctx.locatedId === node.id;
  const opacity = ctx.opacityMap.get(node.id) ?? 100;
  const isolated = ctx.isolatedId === node.id;

  const paddingLeft = `${16 + depth * 20}px`;

  const showLock = HOVER_ICONS ? (hovered || locked)                       : true;
  const showEye  = HOVER_ICONS ? (hovered || hidden || opacity < 100 || isolated) : true;

  return (
    <div>
      <div
        onClick={(e) => {
          if (e.altKey) {
            // exclude clicks on buttons/inputs — only the row background/name area
            if (e.target.closest('button')) return;
            ctx.toggleIsolate(node);
            return;
          }
          ctx.setSelectedId(selected ? null : node.id);
        }}
        onContextMenu={(e) => { e.preventDefault(); ctx.openMenu(node, e.clientX, e.clientY); }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          height: '56px', paddingLeft, paddingRight: '16px',
          cursor: 'pointer', boxSizing: 'border-box', width: '100%',
          background: selected ? L.rowSelected : isolated ? L.overlay : hovered ? L.overlay : 'transparent',
          transition: 'background 0.1s',
          opacity: ctx.isolatedId && !isolated ? 0.35 : 1,
        }}
      >
        {/* Chevron — click only expands/collapses */}
        <div
          onClick={(e) => { e.stopPropagation(); if (hasChildren) setOpen((v) => !v); }}
          style={{
            width: '16px', height: '16px', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: L.text, visibility: hasChildren ? 'visible' : 'hidden',
            cursor: hasChildren ? 'pointer' : 'default',
          }}
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>

        {/* Name */}
        {renaming ? (
          <input
            ref={inputRef}
            value={renameVal}
            onChange={(e) => setRenameVal(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') ctx.startRename({ id: null }); e.stopPropagation(); }}
            onClick={(e) => e.stopPropagation()}
            style={{
              flex: 1, fontSize: '14px', fontWeight: 400, color: L.text,
              fontFamily: L.font, lineHeight: '20px', background: L.divider,
              border: `1px solid ${L.border}`, borderRadius: '4px',
              padding: '0 6px', outline: 'none', minWidth: 0,
            }}
          />
        ) : (
          <span
            onDoubleClick={(e) => { e.stopPropagation(); startRename(); }}
            style={{
              flex: 1, fontSize: '14px', fontWeight: 400, color: L.text,
              fontFamily: L.font, lineHeight: '20px',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{node.name}</span>
        )}

        {/* Bare action icons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <EyeOpacityBare
            hidden={hidden}
            opacity={opacity}
            visible={showEye}
            isolated={isolated}
            onToggle={() => ctx.toggleHidden(node)}
            onOpacity={(val) => ctx.setOpacity(node, val)}
            onExitIsolation={() => ctx.toggleIsolate(node)}
          />
          <BareIcon active={locked} visible={showLock} title={locked ? 'Unlock' : 'Lock'} onClick={() => ctx.toggleLock(node)}>
            {locked ? <Lock size={16} /> : <Unlock size={16} />}
          </BareIcon>
        </div>
      </div>

      {open && hasChildren && node.children.map((c) => (
        <TreeNode key={c.id} node={c} depth={depth + 1} ctx={ctx} />
      ))}
    </div>
  );
};

const LayersDrawer = ({ meshesRef, open: openProp, onOpenChange, panelTop = '120px' }) => {
  const [openLocal, setOpenLocal] = useState(false);
  const isControlled = typeof openProp === 'boolean';
  const open = isControlled ? openProp : openLocal;
  const setOpen = (next) => {
    const value = typeof next === 'function' ? next(open) : next;
    if (isControlled) onOpenChange?.(value);
    else setOpenLocal(value);
  };

  const [tree, setTree] = useState(() => buildTree(meshesRef.current || []));
  const [hiddenIds, setHiddenIds] = useState(() => new Set());
  const [lockedIds, setLockedIds] = useState(() => new Set());
  const [opacityMap, setOpacityMap] = useState(() => new Map());
  const [selectedId, setSelectedId] = useState(null);
  const [locatedId, setLocatedId] = useState(null);
  const [isolatedId, setIsolatedId] = useState(null);
  const [menu, setMenu] = useState(null);
  const [pos, setPos] = useState(null);
  const [size, setSize] = useState({ w: 320, h: null }); // null h = auto

  // Reset position + size whenever panel opens
  const prevOpen = useRef(open);
  useEffect(() => {
    if (open && !prevOpen.current) { setPos(null); setSize({ w: 320, h: null }); }
    prevOpen.current = open;
  }, [open]);

  useEffect(() => {
    let lastLen = -1;
    const id = setInterval(() => {
      const meshes = meshesRef.current || [];
      if (meshes.length !== lastLen) { lastLen = meshes.length; setTree(buildTree(meshes)); }
    }, 400);
    return () => clearInterval(id);
  }, [meshesRef]);

  const toggleHidden = useCallback((node) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      const willHide = !next.has(node.id);
      if (willHide) {
        next.add(node.id);
        if (node.obj) { node.obj.visible = false; node.obj.traverse?.((o) => { o.visible = false; }); }
      } else {
        next.delete(node.id);
        // restore to 100% opacity on show
        if (node.obj) {
          node.obj.visible = true;
          node.obj.traverse?.((o) => {
            o.visible = true;
            if (o.material) { o.material.transparent = false; o.material.opacity = 1; o.material.needsUpdate = true; }
          });
        }
        setOpacityMap((om) => { const m = new Map(om); m.set(node.id, 100); return m; });
      }
      return next;
    });
  }, []);

  const toggleLock = useCallback((node) => {
    setLockedIds((prev) => {
      const next = new Set(prev);
      if (next.has(node.id)) next.delete(node.id); else next.add(node.id);
      return next;
    });
  }, []);

  const setOpacity = useCallback((node, val) => {
    setOpacityMap((prev) => {
      const next = new Map(prev);
      next.set(node.id, val);
      if (node.obj) {
        const fraction = val / 100;
        node.obj.traverse?.((o) => {
          if (o.material) {
            o.material.transparent = fraction < 1;
            o.material.opacity = fraction;
            o.material.needsUpdate = true;
          }
        });
      }
      return next;
    });
  }, []);

  const locate = useCallback((node) => { setSelectedId(node.id); setLocatedId(node.id); }, []);

  const toggleIsolate = useCallback((node) => {
    setIsolatedId((prev) => {
      const turningOn = prev !== node.id;
      const next = turningOn ? node.id : null;
      const meshes = meshesRef.current || [];
      if (turningOn) {
        // hide everything except this node
        meshes.forEach((m) => { m.visible = false; });
        if (node.obj) { node.obj.visible = true; node.obj.traverse?.((o) => { o.visible = true; }); }
        // if node was hidden, un-hide it and reset opacity to 100
        setHiddenIds((hPrev) => {
          if (!hPrev.has(node.id)) return hPrev;
          const s = new Set(hPrev); s.delete(node.id);
          // also reset opacity to 100 since it was toggled off
          setOpacityMap((om) => { const m = new Map(om); m.set(node.id, 100); return m; });
          if (node.obj) node.obj.traverse?.((o) => { if (o.material) { o.material.transparent = false; o.material.opacity = 1; o.material.needsUpdate = true; } });
          return s;
        });
      } else {
        // exit isolation — restore all visible
        meshes.forEach((m) => { m.visible = true; });
      }
      return next;
    });
  }, [meshesRef]);

  const duplicate = useCallback((node) => {
    if (!node.obj) return;
    const clone = node.obj.clone();
    clone.name = (node.obj.name || 'Copy') + '_copy';
    node.obj.parent?.add(clone);
    setTree(buildTree(meshesRef.current || []));
  }, [meshesRef]);

  const deleteNode = useCallback((node) => {
    if (!node.obj) return;
    node.obj.parent?.remove(node.obj);
    setTree(buildTree(meshesRef.current || []));
  }, [meshesRef]);

  const openMenu = useCallback((node, x, y) => setMenu((prev) => ({ node, x, y })), []);
  const closeMenu = useCallback(() => setMenu(null), []);

  const [renamingId, setRenamingId] = useState(null);
  const startRename = useCallback((node) => setRenamingId(node.id), []);

  const ctx = useMemo(() => ({ hiddenIds, lockedIds, opacityMap, selectedId, locatedId, isolatedId, renamingId, setSelectedId, toggleHidden, toggleLock, setOpacity, locate, toggleIsolate, duplicate, deleteNode, openMenu, startRename }),
    [hiddenIds, lockedIds, opacityMap, selectedId, locatedId, isolatedId, renamingId, toggleHidden, toggleLock, setOpacity, locate, toggleIsolate, duplicate, deleteNode, openMenu, startRename]);

  const [dragging, setDragging] = useState(false);
  const [headerHovered, setHeaderHovered] = useState(false);

  /* Drag-to-move — entire header is the drag target */
  const onHeaderMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = pos ? pos.left : 8;
    const startTop = pos ? pos.top : parseInt(panelTop, 10);
    setDragging(true);
    const onMove = (me) => setPos({ left: startLeft + me.clientX - startX, top: startTop + me.clientY - startY });
    const onUp = () => { setDragging(false); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [pos, panelTop]);

  useEffect(() => { setPos(null); }, [panelTop]);

  const MAX_W = 600;
  const MIN_W = 220;
  const MIN_H = 200;

  const makeResizeHandler = useCallback((dirs) => (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX, startY = e.clientY;
    const panel = e.currentTarget.closest('[data-panel]');
    const startW = size.w, startH = size.h ?? panel.offsetHeight;
    const startLeft = pos ? pos.left : 8;
    const onMove = (me) => {
      const dx = me.clientX - startX, dy = me.clientY - startY;
      setSize((prev) => ({
        w: dirs.includes('e') ? Math.min(MAX_W, Math.max(MIN_W, startW + dx))
          : dirs.includes('w') ? Math.min(MAX_W, Math.max(MIN_W, startW - dx))
          : prev.w,
        h: dirs.includes('s') ? Math.max(MIN_H, startH + dy) : prev.h,
      }));
      if (dirs.includes('w')) setPos((p) => ({ left: Math.min(startLeft + dx, startLeft + startW - MIN_W), top: p ? p.top : parseInt(panelTop, 10) }));
    };
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [size, pos, panelTop]);

  const left = pos ? `${pos.left}px` : '8px';
  const top = pos ? `${pos.top}px` : panelTop;

  return (
    <>
    <div style={{
      position: 'fixed', top: `calc(${top} - 4px)`, left: `calc(${left} - 4px)`, zIndex: 150, userSelect: 'none',
      transformOrigin: 'top left',
      transform: open ? 'translateX(0) scale(1)' : 'translateX(-12px) scale(0.985)',
      opacity: open ? 1 : 0,
      pointerEvents: open ? 'auto' : 'none',
      background: (dragging || headerHovered) ? 'var(--color-panel-halo)' : 'transparent',
      backdropFilter: (dragging || headerHovered) ? 'blur(8px)' : 'none', WebkitBackdropFilter: (dragging || headerHovered) ? 'blur(8px)' : 'none',
      borderRadius: '28px',
      padding: '4px',
      transition: 'transform 0.26s cubic-bezier(0.22,1,0.36,1), opacity 0.2s ease, background 0.25s ease, backdrop-filter 0.25s ease',
    }}>
      <div data-panel style={{
        width: `${size.w}px`,
        height: size.h ? `${size.h}px` : undefined,
        maxHeight: size.h ? undefined : 'calc(100vh - 140px)',
        minWidth: `${MIN_W}px`, minHeight: `${MIN_H}px`, maxWidth: `${MAX_W}px`,
        background: L.bg,
        border: `1px solid ${L.border}`,
        borderRadius: '24px',
        display: 'flex', flexDirection: 'column',
        boxSizing: 'border-box', overflow: 'hidden',
        position: 'relative',
      }}>
        {/* Header — 56px, single row: title | drag pill (absolute center) | close */}
        <div
          onMouseDown={onHeaderMouseDown}
          onMouseEnter={(e) => { setHeaderHovered(true); e.currentTarget.querySelector('.drag-pill').style.opacity = '1'; }}
          onMouseLeave={(e) => { setHeaderHovered(false); e.currentTarget.querySelector('.drag-pill').style.opacity = '0.5'; }}
          style={{
            position: 'relative',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            height: '56px', padding: '0 16px',
            boxShadow: '0 1px 0 var(--color-overlay-divider)',
            flexShrink: 0, cursor: 'grab',
          }}
        >
          <span style={{ fontSize: '14px', fontWeight: 500, color: L.text, fontFamily: L.font, lineHeight: '20px' }}>Layers</span>

          {/* Drag pill — absolutely centered */}
          <div className="drag-pill" style={{
            position: 'absolute', left: '50%', top: '8px',
            transform: 'translateX(-50%)',
            width: '64px', height: '2px', borderRadius: '1px',
            background: L.dragPill, opacity: 0.5, pointerEvents: 'none',
            transition: 'background 0.2s, opacity 0.2s',
          }} />

          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => setOpen(false)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '24px', height: '24px', borderRadius: '6px', border: 'none',
              background: 'transparent', cursor: 'pointer', color: L.iconDim, padding: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = L.iconHover; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = L.iconDim; }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Tree */}
        <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {tree.children.length === 0 ? (
            <div style={{ padding: '16px', fontSize: '14px', color: L.border, textAlign: 'center', fontFamily: L.font }}>
              No model loaded
            </div>
          ) : (
            tree.children.map((node) => (
              <TreeNode key={node.id} node={node} depth={0} ctx={ctx} />
            ))
          )}
        </div>

        {/* Footer */}
        {(() => { const compact = size.w < 319; return (
        <div style={{
          display: 'flex', gap: '8px', padding: '16px',
          boxShadow: '0 -1px 0 var(--color-overlay-divider)', flexShrink: 0,
        }}>
          <button
            title="New layer"
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-background-subtle-hovered)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = L.footerBtn; }}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
              background: L.footerBtn, color: L.text,
              fontSize: '14px', fontWeight: 500, fontFamily: L.font, lineHeight: '20px',
              transition: 'background 0.15s',
            }}>
            <Plus size={16} />
            {!compact && 'New layer'}
          </button>
          <button
            title="New group"
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-background-subtle-hovered)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = L.footerBtn; }}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
              background: L.footerBtn, color: L.text,
              fontSize: '14px', fontWeight: 500, fontFamily: L.font, lineHeight: '20px',
              transition: 'background 0.15s',
            }}>
            <svg width="16" height="16" viewBox="0 0 16.67 16.67" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M5.00167 0.835001H4.835C3.43487 0.835001 2.7348 0.835001 2.20002 1.10748C1.72962 1.34717 1.34717 1.72962 1.10748 2.20002C0.835001 2.7348 0.835001 3.43487 0.835001 4.835V5.00167M5.00167 15.835H4.835C3.43487 15.835 2.7348 15.835 2.20002 15.5625C1.72962 15.3228 1.34717 14.9404 1.10748 14.47C0.835001 13.9352 0.835001 13.2351 0.835001 11.835V11.6683M15.835 5.00167V4.835C15.835 3.43487 15.835 2.7348 15.5625 2.20002C15.3228 1.72962 14.9404 1.34717 14.47 1.10748C13.9352 0.835001 13.2351 0.835001 11.835 0.835001H11.6683M15.835 11.6683V11.835C15.835 13.2351 15.835 13.9352 15.5625 14.47C15.3228 14.9404 14.9404 15.3228 14.47 15.5625C13.9352 15.835 13.2351 15.835 11.835 15.835H11.6683" stroke="currentColor" strokeWidth="1.67" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {!compact && 'New group'}
          </button>
        </div>
        ); })()}

        {/* Resize — right edge */}
        <div onMouseDown={makeResizeHandler(['e'])} style={{ position: 'absolute', top: 0, right: 0, width: '5px', height: '100%', cursor: 'ew-resize' }} />
        {/* Resize — bottom edge */}
        <div onMouseDown={makeResizeHandler(['s'])} style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: '5px', cursor: 'ns-resize' }} />
        {/* Resize — bottom-right corner */}
        <div onMouseDown={makeResizeHandler(['e', 's'])} style={{ position: 'absolute', bottom: 0, right: 0, width: '12px', height: '12px', cursor: 'nwse-resize', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: '3px' }}>
          <svg width="6" height="6" viewBox="0 0 8 8" fill="none"><path d="M7 1L1 7M7 4L4 7" stroke="var(--color-drag-pill)" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </div>
      </div>
    </div>
    {menu && createPortal(<ContextMenu menu={{ ...menu, ctx }} onClose={closeMenu} />, document.body)}
    </>
  );
};

export default LayersDrawer;
