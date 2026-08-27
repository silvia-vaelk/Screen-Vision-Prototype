import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronRight, ChevronDown,
  Lock, Unlock, Eye, EyeOff, Plus, X, Folder,
} from 'lucide-react';
import { DS } from './tokens.js';

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
  radius: '12px',
};

/* ── Tree helpers ─────────────────────────────────────────────────────────── */
const uid = () => Math.random().toString(36).slice(2, 9);

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

const removeFromTree = (tree, id) => {
  let removed = null;
  const recurse = (node) => {
    const next = node.children.filter(c => {
      if (c.id === id) { removed = c; return false; }
      return true;
    }).map(recurse);
    return { ...node, children: next };
  };
  return [recurse(tree), removed];
};

const insertIntoTree = (tree, parentId, node, index) => {
  if (tree.id === parentId) {
    const children = [...tree.children];
    children.splice(Math.max(0, Math.min(index, children.length)), 0, node);
    return { ...tree, children };
  }
  return { ...tree, children: tree.children.map(c => insertIntoTree(c, parentId, node, index)) };
};

const findInTree = (tree, id) => {
  if (tree.id === id) return tree;
  for (const c of tree.children) { const f = findInTree(c, id); if (f) return f; }
  return null;
};

/* ── BareIcon ─────────────────────────────────────────────────────────────── */
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

/* ── EyeOpacityBare ───────────────────────────────────────────────────────── */
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
      style={{ display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0, opacity: visible ? 1 : 0, pointerEvents: visible ? 'auto' : 'none', transition: 'opacity 0.12s' }}>
      {showBadge && (
        editing ? (
          <input
            ref={inputRef}
            value={editVal}
            onChange={(e) => setEditVal(e.target.value.replace(/[^0-9]/g, ''))}
            onBlur={commitEdit}
            onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false); e.stopPropagation(); }}
            onClick={(e) => e.stopPropagation()}
            style={{ width: '32px', fontSize: '11px', fontWeight: 500, color: L.text, fontFamily: L.font, background: L.divider, border: 'none', borderRadius: '3px', textAlign: 'right', padding: '1px 3px', outline: 'none', caretColor: L.text }}
          />
        ) : (
          <span
            onMouseDown={(e) => {
              if (e.button !== 0) return;
              e.stopPropagation(); e.preventDefault();
              const startX = e.clientX, startOpacity = opacity;
              let moved = false;
              const onMove = (me) => {
                const dx = me.clientX - startX;
                if (!moved && Math.abs(dx) < 4) return;
                moved = true; setScrubbing(true);
                const next = Math.min(100, Math.max(0, Math.round(startOpacity + dx * 0.8)));
                setScrubVal(next); onOpacity(next);
              };
              const onUp = () => {
                window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp);
                if (!moved) { setEditVal(String(opacity)); setEditing(true); setTimeout(() => { inputRef.current?.select(); }, 0); }
                setScrubbing(false);
              };
              window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
            }}
            style={{ fontSize: '11px', fontWeight: 500, color: scrubbing || hasCustomOpacity ? L.text : L.textDim, fontFamily: L.font, minWidth: '26px', textAlign: 'right', cursor: 'ew-resize', userSelect: 'none', transition: 'color 0.15s, opacity 0.15s', opacity: scrubbing || hasCustomOpacity || eyeHovered ? 1 : 0 }}
          >{badgeVal}%</span>
        )
      )}
      <button
        title={isolated ? 'Exit isolation' : effectivelyHidden ? 'Show' : 'Hide'}
        onMouseDown={handleMouseDown}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', border: 'none', padding: 0, background: 'none', cursor: 'pointer', flexShrink: 0, color: (effectivelyHidden || iconWhite) ? L.active : eyeHovered ? L.iconHover : L.iconDim, transition: 'color 0.12s', userSelect: 'none' }}
      >
        {isolated ? (
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
            <path d="M2.017 10.594C1.903 10.415 1.847 10.325 1.815 10.186 1.791 10.082 1.791 9.918 1.815 9.814 1.847 9.675 1.903 9.585 2.017 9.406 2.955 7.921 5.746 4.167 10 4.167c4.255 0 7.046 3.754 7.984 5.239.114.179.17.269.203.408.024.104.024.268 0 .372-.033.139-.089.229-.203.408C17.046 12.079 14.255 15.833 10 15.833c-4.254 0-7.045-3.754-7.983-5.239z" stroke="currentColor" strokeWidth="1.67" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" stroke="currentColor" strokeWidth="1.67" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ) : effectivelyHidden ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
};

// ─── Opacity control variant toggle ─────────────────────────────────────────
// 'inline' = Figma-style inline row control (new default)
// 'popover' = click % badge → floating slider
// 'scrub'   = original drag-to-scrub
const OPACITY_CONTROL = 'inline';

/* ── OpacityPopover — click % badge → floating slider + direct input ─────── */
const OpacityPopover = ({ nodeId, opacity, onOpacity, visible, hidden, isolated, onToggle, onExitIsolation, open, onOpen, onClose }) => {
  const [eyeHovered, setEyeHovered] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const wrapRef = useRef(null);
  const badgeRef = useRef(null);
  const effectivelyHidden = hidden || opacity === 0;
  const hasCustomOpacity = opacity < 100 && opacity > 0;
  const showBadge = !open && (hasCustomOpacity || (eyeHovered && !effectivelyHidden && !isolated));

  // Sync inputVal when popover opens or opacity changes externally
  useEffect(() => { if (!inputFocused) setInputVal(String(opacity)); }, [opacity, open, inputFocused]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!wrapRef.current?.contains(e.target)) onClose(); };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open, onClose]);

  const commitInput = () => {
    const n = parseInt(inputVal, 10);
    if (!isNaN(n)) onOpacity(Math.min(100, Math.max(0, n)));
    else setInputVal(String(opacity));
    setInputFocused(false);
  };

  const handleEyeClick = (e) => {
    e.stopPropagation();
    if (isolated) { onExitIsolation?.(); return; }
    onToggle();
  };

  return (
    <div
      ref={wrapRef}
      onMouseEnter={() => setEyeHovered(true)}
      onMouseLeave={() => setEyeHovered(false)}
      onPointerDown={(e) => e.stopPropagation()}
      style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0, opacity: visible ? 1 : 0, pointerEvents: visible ? 'auto' : 'none', transition: 'opacity 0.12s' }}
    >
      {showBadge && (
        <button
          ref={badgeRef}
          onClick={(e) => { e.stopPropagation(); open ? onClose() : onOpen(); }}
          style={{ fontSize: '11px', fontWeight: 500, color: open || hasCustomOpacity ? L.text : L.textDim, fontFamily: L.font, minWidth: '26px', textAlign: 'right', cursor: 'pointer', userSelect: 'none', background: 'none', border: 'none', padding: 0, transition: 'color 0.15s' }}
        >{opacity}%</button>
      )}
      <button
        title={isolated ? 'Exit isolation' : effectivelyHidden ? 'Show' : 'Hide'}
        onClick={handleEyeClick}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', border: 'none', padding: 0, background: 'none', cursor: 'pointer', flexShrink: 0, color: effectivelyHidden ? L.active : eyeHovered ? L.iconHover : L.iconDim, transition: 'color 0.12s', userSelect: 'none' }}
      >
        {isolated ? (
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
            <path d="M2.017 10.594C1.903 10.415 1.847 10.325 1.815 10.186 1.791 10.082 1.791 9.918 1.815 9.814 1.847 9.675 1.903 9.585 2.017 9.406 2.955 7.921 5.746 4.167 10 4.167c4.255 0 7.046 3.754 7.984 5.239.114.179.17.269.203.408.024.104.024.268 0 .372-.033.139-.089.229-.203.408C17.046 12.079 14.255 15.833 10 15.833c-4.254 0-7.045-3.754-7.983-5.239z" stroke="currentColor" strokeWidth="1.67" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" stroke="currentColor" strokeWidth="1.67" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ) : effectivelyHidden ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>

      {open && createPortal(
        <div
          onPointerDown={(e) => e.stopPropagation()}
          style={{ position: 'fixed', right: (() => { const r = wrapRef.current?.getBoundingClientRect(); return r ? window.innerWidth - r.right : 12; })(), top: (() => { const r = wrapRef.current?.getBoundingClientRect(); return r ? r.top + r.height / 2 - 20 : 0; })(), background: L.bg, border: `1px solid ${L.border}`, borderRadius: '12px', padding: '10px 12px', zIndex: 300, boxShadow: '0 8px 24px rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', gap: '8px', minWidth: '160px' }}
        >
          <button
            title={isolated ? 'Exit isolation' : effectivelyHidden ? 'Show' : 'Hide'}
            onClick={(e) => { e.stopPropagation(); if (isolated) { onExitIsolation?.(); } else { onToggle(); } }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', border: 'none', padding: 0, background: 'none', cursor: 'pointer', flexShrink: 0, color: effectivelyHidden ? L.active : L.iconDim, transition: 'color 0.12s' }}
          >
            {isolated ? (
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                <path d="M2.017 10.594C1.903 10.415 1.847 10.325 1.815 10.186 1.791 10.082 1.791 9.918 1.815 9.814 1.847 9.675 1.903 9.585 2.017 9.406 2.955 7.921 5.746 4.167 10 4.167c4.255 0 7.046 3.754 7.984 5.239.114.179.17.269.203.408.024.104.024.268 0 .372-.033.139-.089.229-.203.408C17.046 12.079 14.255 15.833 10 15.833c-4.254 0-7.045-3.754-7.983-5.239z" stroke="currentColor" strokeWidth="1.67" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" stroke="currentColor" strokeWidth="1.67" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : effectivelyHidden ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          <input
            type="range" min={0} max={100} value={opacity}
            onChange={(e) => onOpacity(Number(e.target.value))}
            style={{ flex: 1, accentColor: L.active, cursor: 'pointer' }}
          />
          <input
            type="text" inputMode="numeric"
            value={inputFocused ? inputVal : `${opacity}%`}
            onFocus={() => { setInputFocused(true); setInputVal(String(opacity)); }}
            onBlur={commitInput}
            onChange={(e) => setInputVal(e.target.value.replace(/[^0-9]/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } e.stopPropagation(); }}
            style={{ width: '36px', fontSize: '11px', fontWeight: 600, color: L.text, fontFamily: L.font, background: L.divider, border: 'none', borderRadius: '4px', textAlign: 'center', padding: '2px 4px', outline: 'none' }}
          />
        </div>,
        document.body
      )}
    </div>
  );
};

/* ── Context menu ─────────────────────────────────────────────────────────── */
const ContextMenu = ({ menu, onClose }) => {
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
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
      style={{ position: 'fixed', top: menu.y - 8, left: menu.x - 8, zIndex: 200, background: L.bg, border: `1px solid ${L.border}`, borderRadius: '12px', padding: '6px', minWidth: '190px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)', fontFamily: L.font }}
    >
      {items.map((item) => (
        <div
          key={item.label}
          onClick={item.action}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', borderRadius: '7px', cursor: 'pointer', fontSize: '13px', fontWeight: 400, color: item.danger ? '#e5484d' : L.text, gap: '24px' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-overlay-subtle)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <span>{item.label}</span>
          {item.shortcut && <span style={{ fontSize: '10px', color: L.textDisabled }}>{item.shortcut}</span>}
        </div>
      ))}
    </div>
  );
};

/* ── InlineOpacity — Figma-style inline row slider (click % to open) ─────── */
const OpacityTrack = ({ opacity, onOpacity, labelRef }) => {
  const wrapRef = useRef(null);
  const fillRef = useRef(null);
  const thumbRef = useRef(null);
  const liveVal = useRef(opacity);

  // Sync DOM when React re-renders with new opacity value
  useEffect(() => {
    liveVal.current = opacity;
    if (fillRef.current) fillRef.current.style.width = `${opacity}%`;
    if (thumbRef.current) thumbRef.current.style.left = `calc(${opacity}% - 6px)`;
    if (labelRef?.current) labelRef.current.textContent = `${opacity}%`;
  }, [opacity, labelRef]);

  const onTrackDown = (e) => {
    e.stopPropagation();
    const compute = (clientX) => {
      const rect = wrapRef.current.getBoundingClientRect();
      return Math.round(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)));
    };
    const updateDOM = (v) => {
      liveVal.current = v;
      if (fillRef.current) fillRef.current.style.width = `${v}%`;
      if (thumbRef.current) thumbRef.current.style.left = `calc(${v}% - 6px)`;
      if (labelRef?.current) labelRef.current.textContent = `${v}%`;
    };
    updateDOM(compute(e.clientX));
    const onMove = (me) => updateDOM(compute(me.clientX));
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      onOpacity(liveVal.current);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div
      ref={wrapRef}
      onPointerDown={onTrackDown}
      style={{ position: 'relative', width: '48px', height: '20px', display: 'flex', alignItems: 'center', cursor: 'ew-resize', flexShrink: 0, marginRight: '6px' }}
    >
      <div style={{ position: 'absolute', left: 0, right: 0, height: '4px', borderRadius: '2px', background: L.divider, overflow: 'hidden' }}>
        <div ref={fillRef} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${opacity}%`, background: L.iconHover, borderRadius: '2px' }} />
      </div>
      <div ref={thumbRef} style={{ position: 'absolute', left: `calc(${opacity}% - 6px)`, width: '12px', height: '12px', borderRadius: '50%', background: L.iconHover, boxShadow: '0 1px 4px rgba(0,0,0,0.3)', pointerEvents: 'none' }} />
    </div>
  );
};

const InlineOpacity = ({ opacity, onOpacity, onClose }) => {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const labelRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('pointerdown', handler, true);
    return () => document.removeEventListener('pointerdown', handler, true);
  }, [onClose]);

  const commit = () => {
    const n = parseInt(val, 10);
    if (!isNaN(n)) onOpacity(Math.min(100, Math.max(0, n)));
    else setVal(String(opacity));
    setEditing(false);
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={(e) => e.stopPropagation()}
      style={{ display: 'flex', alignItems: 'center', gap: '8px', background: L.overlay, borderRadius: '8px', padding: '3px 10px', height: '28px', flexShrink: 0 }}
    >
      <OpacityTrack opacity={opacity} onOpacity={onOpacity} labelRef={labelRef} />
      {editing ? (
        <input
          ref={inputRef} type="text" inputMode="numeric" value={val}
          onChange={(e) => setVal(e.target.value.replace(/[^0-9]/g, ''))}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); e.stopPropagation(); }}
          style={{ width: '32px', fontSize: '11px', fontWeight: 500, color: L.text, fontFamily: L.font, background: 'transparent', border: 'none', outline: 'none', textAlign: 'right', padding: 0 }}
        />
      ) : (
        <span
          ref={labelRef}
          onClick={() => { setVal(String(opacity)); setEditing(true); setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 0); }}
          style={{ fontSize: '11px', fontWeight: 500, color: L.text, fontFamily: L.font, minWidth: '30px', textAlign: 'right', cursor: 'text', userSelect: 'none' }}
        >{opacity}%</span>
      )}
    </div>
  );
};

const showChevronForType = (type) => type === 'group';

/* ── Keyframe animations ──────────────────────────────────────────────────── */
const LAYER_ANIM_CSS = `
  @keyframes layerGapExpand {
    0%   { height: 0;    opacity: 0; }
    65%  { height: 50px; opacity: 1; }
    100% { height: 44px; opacity: 1; }
  }
  @keyframes layerGhostIn {
    0%   { opacity: 0; transform: scale(0.82) translateY(-6px); }
    100% { opacity: 0.95; transform: scale(1) translateY(0); }
  }
`;
// Inject once
if (typeof document !== 'undefined' && !document.getElementById('layer-anim-style')) {
  const s = document.createElement('style');
  s.id = 'layer-anim-style';
  s.textContent = LAYER_ANIM_CSS;
  document.head.appendChild(s);
}

/* ── Drop gap ─────────────────────────────────────────────────────────────── */
const DropGap = () => (
  <div style={{
    height: '44px', background: 'var(--color-overlay-subtle)',
    flexShrink: 0, pointerEvents: 'none',
  }} />
);

/* ── TreeNode ─────────────────────────────────────────────────────────────── */
const TreeNode = ({ node, depth, ctx }) => {
  const hasChildren = node.children && node.children.length > 0;
  const showChevron = hasChildren || node.type === 'group';
  const open = ctx.expandedIds.has(node.id);
  const [hovered, setHovered] = useState(false);
  const [showOpacity, setShowOpacity] = useState(false);
  const [nameTooltip, setNameTooltip] = useState(null); // {x, y} when showing
  const nameSpanRef = useRef(null);
  const [renameVal, setRenameVal] = useState(node.name);
  const inputRef = useRef(null);
  const rowRef = useRef(null);

  const handleNameMouseEnter = () => {
    const el = nameSpanRef.current;
    if (el && el.scrollWidth > el.clientWidth) {
      const rect = el.getBoundingClientRect();
      setNameTooltip({ x: rect.left, y: rect.bottom + 6 });
    }
  };
  const handleNameMouseLeave = () => setNameTooltip(null);
  const renaming = ctx.renamingId === node.id;

  const startRename = () => { setRenameVal(node.name); ctx.startRename(node); };

  useEffect(() => {
    if (renaming) setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 0);
  }, [renaming]);
  const commitRename = () => {
    const v = renameVal.trim();
    if (v && node.obj) node.obj.name = v;
    if (v) node.name = v;
    ctx.startRename({ id: null });
  };

  const hidden = (ctx.opacityMap.get(node.id) ?? 100) === 0;
  const locked = ctx.lockedIds.has(node.id);
  const selected = ctx.selectedId === node.id;
  const opacity = ctx.opacityMap.get(node.id) ?? 100;
  const isolated = ctx.isolatedId === node.id;
  const effectivelyOff = hidden || opacity === 0;
  const isDragging = ctx.dragId === node.id;
  const showLock = HOVER_ICONS ? (hovered || locked) : true;
  const showEye  = HOVER_ICONS ? (hovered || hidden || opacity < 100 || isolated) : true;

  const basePad = 16 + depth * 20;
  // Leaves at root align with the group chevron (basePad).
  // Leaves nested inside a group align with the parent group's text: 40 + (depth-1)*20.
  const paddingLeft = showChevron || depth === 0 ? `${basePad}px` : `${40 + (depth - 1) * 20}px`;

  const dt = ctx.dropTarget;
  const dropAbove = dt?.type === 'between' && dt.afterId === null && dt.parentId === ctx.parentId && ctx.siblingIndex === 0;
  const dropBelow = dt?.type === 'between' && dt.afterId === node.id;
  const dropInto  = dt?.type === 'into' && dt.groupId === node.id;

  const handlePointerDown = (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('button') || e.target.closest('input')) return;
    // Commit any active rename before taking focus away
    if (ctx.renamingId && ctx.renamingId !== node.id) {
      document.querySelector('input[data-rename]')?.blur();
    }
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    const rowRect = e.currentTarget.getBoundingClientRect();
    const grabOffsetX = e.clientX - rowRect.left;
    const grabOffsetY = e.clientY - rowRect.top;
    let started = false;

    const onMove = (me) => {
      if (!started) {
        const dx = Math.abs(me.clientX - startX), dy = Math.abs(me.clientY - startY);
        if (dx < 10 && dy < 10) return; // sticky: needs deliberate pull
        started = true;
        setShowOpacity(false);
        ctx.startDrag(node, me.clientX, me.clientY, grabOffsetX, grabOffsetY);
      }
      ctx.onDragMove(me.clientX, me.clientY);
    };
    const onUp = (me) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (started) {
        ctx.onDragEnd();
      } else {
        // treat as click
        if (me.altKey) { if (!e.target.closest('button')) ctx.toggleIsolate(node); }
        else ctx.setSelectedId(selected ? null : node.id);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div>
      {dropAbove && <DropGap key={`gap-above-${node.id}`} />}

      <div
        ref={rowRef}
        data-row
        data-node-id={node.id}
        data-node-type={node.type}
        data-parent-id={ctx.parentId}
        data-sibling-index={ctx.siblingIndex}
        onContextMenu={(e) => { e.preventDefault(); ctx.openMenu(node, e.clientX, e.clientY); }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onPointerDown={handlePointerDown}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          height: '44px', paddingLeft, paddingRight: '12px',
          cursor: isDragging ? 'grabbing' : 'grab', boxSizing: 'border-box', width: '100%',
          background: isDragging ? 'transparent' : dropInto ? 'var(--color-background-bolder-default)' : selected ? L.rowSelected : isolated ? L.overlay : (hovered && !ctx.dragId) ? L.overlay : 'transparent',
          transition: 'background 0.1s, opacity 0.18s ease',
          opacity: isDragging ? 0.28 : (ctx.isolatedId && !isolated) ? 0.35 : 1,
          pointerEvents: isDragging ? 'none' : 'auto',
          userSelect: 'none',
        }}
      >
        {/* Chevron for groups only; leaves render nothing so text aligns with chevron */}
        {showChevron && (
          <div
            onPointerDown={(e) => { e.stopPropagation(); ctx.toggleExpanded(node.id); }}
            style={{ width: '16px', height: '16px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: L.text, cursor: 'pointer', opacity: effectivelyOff ? 0.4 : 1, transition: 'opacity 0.15s' }}
          >
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </div>
        )}

        {/* Name */}
        {renaming ? (
          /* Grid overlay: span sizes cell to content, input fills same cell.
             maxWidth caps growth before hitting the action icons. */
          <div style={{ display: 'inline-grid', marginLeft: '-4px', maxWidth: 'calc(100% - 56px)', minWidth: 0, overflow: 'hidden' }}>
            <span aria-hidden style={{ gridArea: '1/1', fontSize: '14px', fontWeight: 400, fontFamily: L.font, lineHeight: '20px', whiteSpace: 'pre', padding: '2px 4px', visibility: 'hidden', pointerEvents: 'none' }}>{renameVal || ' '}</span>
            <input
              ref={inputRef}
              data-rename
              value={renameVal}
              onChange={(e) => setRenameVal(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') ctx.startRename({ id: null }); e.stopPropagation(); }}
              onClick={(e) => e.stopPropagation()}
              style={{ gridArea: '1/1', width: 0, minWidth: '100%', fontSize: '14px', fontWeight: 400, color: L.text, fontFamily: L.font, lineHeight: '20px', background: L.divider, border: 'none', borderRadius: '4px', padding: '2px 4px', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
        ) : (
          <>
            <span
              ref={nameSpanRef}
              onMouseEnter={handleNameMouseEnter}
              onMouseLeave={handleNameMouseLeave}
              onDoubleClick={(e) => { e.stopPropagation(); startRename(); }}
              style={{ flex: 1, fontSize: '14px', fontWeight: 400, color: L.text, fontFamily: L.font, lineHeight: '20px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: effectivelyOff ? 0.4 : 1, transition: 'opacity 0.15s, color 0.12s' }}
            >{node.name}</span>
            {nameTooltip && createPortal(
              <div style={{ position: 'fixed', left: nameTooltip.x, top: nameTooltip.y, background: 'var(--color-greys-900)', borderRadius: '16px', padding: '8px 12px', fontFamily: L.font, fontSize: '12px', fontWeight: 600, color: '#ffffff', whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 9999, boxShadow: '0 4px 8px rgba(16,24,40,0.1)' }}>
                {node.name}
              </div>,
              document.body
            )}
          </>
        )}

        {/* Action icons */}
        <div onPointerDown={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: 'auto' }}>
          {OPACITY_CONTROL === 'inline' ? (
            <>
              {showOpacity && !ctx.dragId ? (
                <InlineOpacity
                  opacity={opacity}
                  onOpacity={(val) => ctx.setOpacity(node, val)}
                  onClose={() => setShowOpacity(false)}
                />
              ) : ((hovered || opacity < 100) && !ctx.dragId && !renaming) ? (
                <span
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setShowOpacity(true)}
                  style={{ fontSize: '11px', fontWeight: 500, color: opacity < 100 ? L.text : L.textDim, fontFamily: L.font, cursor: 'pointer', userSelect: 'none', flexShrink: 0 }}
                >{opacity}%</span>
              ) : null}
              {/* Eye — always fixed position, never moves */}
              <button
                title={isolated ? 'Exit isolation' : effectivelyOff ? 'Show' : 'Hide'}
                onClick={() => { if (isolated) ctx.toggleIsolate(node); else ctx.toggleHidden(node); }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', border: 'none', padding: 0, background: 'none', cursor: 'pointer', flexShrink: 0, color: (showOpacity || opacity < 100) ? L.iconHover : effectivelyOff ? L.active : L.iconDim, opacity: (showEye || showOpacity || opacity < 100) ? 1 : 0, pointerEvents: (showEye || showOpacity || opacity < 100) ? 'auto' : 'none', transition: 'color 0.12s, opacity 0.12s' }}
              >
                {isolated ? (
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                    <path d="M2.017 10.594C1.903 10.415 1.847 10.325 1.815 10.186 1.791 10.082 1.791 9.918 1.815 9.814 1.847 9.675 1.903 9.585 2.017 9.406 2.955 7.921 5.746 4.167 10 4.167c4.255 0 7.046 3.754 7.984 5.239.114.179.17.269.203.408.024.104.024.268 0 .372-.033.139-.089.229-.203.408C17.046 12.079 14.255 15.833 10 15.833c-4.254 0-7.045-3.754-7.983-5.239z" stroke="currentColor" strokeWidth="1.67" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" stroke="currentColor" strokeWidth="1.67" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : effectivelyOff ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </>
          ) : OPACITY_CONTROL === 'popover' ? (
            <OpacityPopover nodeId={node.id} hidden={hidden} opacity={opacity} visible={showEye} isolated={isolated}
              open={ctx.opacityPopoverId === node.id}
              onOpen={() => ctx.setOpacityPopoverId(node.id)}
              onClose={() => ctx.setOpacityPopoverId(null)}
              onToggle={() => ctx.toggleHidden(node)}
              onOpacity={(val) => ctx.setOpacity(node, val)}
              onExitIsolation={() => ctx.toggleIsolate(node)} />
          ) : (
            <EyeOpacityBare hidden={hidden} opacity={opacity} visible={showEye} isolated={isolated}
              onToggle={() => ctx.toggleHidden(node)}
              onOpacity={(val) => ctx.setOpacity(node, val)}
              onExitIsolation={() => ctx.toggleIsolate(node)} />
          )}
          <BareIcon active={locked} visible={showLock} title={locked ? 'Unlock' : 'Lock'} onClick={() => ctx.toggleLock(node)}>
            {locked ? <Lock size={16} /> : <Unlock size={16} />}
          </BareIcon>
        </div>
      </div>

      {dropBelow && <DropGap key={`gap-below-${node.id}`} />}

      {/* Children */}
      {open && hasChildren && node.children.map((c, i) => (
        <TreeNode key={c.id} node={c} depth={depth + 1} ctx={{ ...ctx, parentId: node.id, siblingIndex: i }} />
      ))}

    </div>
  );
};

/* ── LayersDrawer ─────────────────────────────────────────────────────────── */
const LayersDrawer = ({ meshesRef, open: openProp, onOpenChange, panelTop = '120px' }) => {
  const [openLocal, setOpenLocal] = useState(false);
  const isControlled = typeof openProp === 'boolean';
  const open = isControlled ? openProp : openLocal;
  const setOpen = (next) => {
    const value = typeof next === 'function' ? next(open) : next;
    if (isControlled) onOpenChange?.(value);
    else setOpenLocal(value);
  };

  const [displayTree, setDisplayTree] = useState(() => buildTree(meshesRef.current || []));
  const [expandedIds, setExpandedIds] = useState(() => new Set(['root']));
  const prevOpacityRef = useRef(new Map()); // stores last non-zero opacity per node for eye-toggle restore
  const [lockedIds, setLockedIds] = useState(() => new Set());
  const [opacityMap, setOpacityMap] = useState(() => new Map());
  const [opacityPopoverId, setOpacityPopoverId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [locatedId, setLocatedId] = useState(null);
  const [isolatedId, setIsolatedId] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [menu, setMenu] = useState(null);
  const [pos, setPos] = useState(null);
  const [size, setSize] = useState({ w: 280, h: null });

  // Drag state
  const [dragId, setDragId] = useState(null);
  const [dragNode, setDragNode] = useState(null);
  const [dragPos, setDragPos] = useState(null);       // { x, y } pointer position
  const [grabOffset, setGrabOffset] = useState({ x: 0, y: 0 }); // where in row user grabbed
  const [dropTarget, setDropTarget] = useState(null);
  const dragStateRef = useRef({ dragId: null, dropTarget: null });
  const rowSnapshotRef = useRef(null); // cached row positions at drag-start, never updated mid-drag
  const treeScrollRef = useRef(null);
  const panelRef = useRef(null);

  // Sync new meshes from scene but preserve virtual nodes and order
  useEffect(() => {
    let lastLen = -1;
    const id = setInterval(() => {
      const meshes = meshesRef.current || [];
      if (meshes.length !== lastLen) {
        lastLen = meshes.length;
        setDisplayTree(buildTree(meshes));
      }
    }, 400);
    return () => clearInterval(id);
  }, [meshesRef]);

  const prevOpen = useRef(open);
  useEffect(() => {
    if (open && !prevOpen.current) { setPos(null); setSize({ w: 280, h: null }); }
    prevOpen.current = open;
  }, [open]);

  /* ── Expand / collapse ──────────────────────────────────────────────────── */
  const toggleExpanded = useCallback((id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  /* ── Add layer / group ──────────────────────────────────────────────────── */
  const addLayer = useCallback(() => {
    const selectedNode = selectedId ? findInTree(displayTree, selectedId) : null;
    const parentId = selectedNode?.type === 'group' ? selectedId : 'root';
    const newNode = { name: 'New Layer', children: [], type: 'mesh', id: uid(), obj: null, virtual: true };
    setDisplayTree(prev => insertIntoTree(prev, parentId, newNode, 0));
    setExpandedIds(prev => { const s = new Set(prev); s.add(parentId); return s; });
    setSelectedId(newNode.id);
    setRenamingId(newNode.id);
  }, [selectedId, displayTree]);

  const addGroup = useCallback(() => {
    const selectedNode = selectedId ? findInTree(displayTree, selectedId) : null;
    const parentId = selectedNode?.type === 'group' ? selectedId : 'root';
    const newGroup = { name: 'New Group', children: [], type: 'group', id: uid(), obj: null, virtual: true };
    setDisplayTree(prev => insertIntoTree(prev, parentId, newGroup, 0));
    setExpandedIds(prev => { const s = new Set(prev); s.add(parentId); s.add(newGroup.id); return s; });
    setSelectedId(newGroup.id);
    setRenamingId(newGroup.id);
  }, [selectedId, displayTree]);

  /* ── Drag-to-reorder ────────────────────────────────────────────────────── */
  const computeDropTarget = useCallback((clientX, clientY) => {
    const rows = rowSnapshotRef.current;
    if (!rows || rows.length === 0) return;
    let best = null, bestDist = Infinity;

    rows.forEach(row => {
      const midY = (row.top + row.bottom) / 2;
      const dist = Math.abs(clientY - midY);
      if (dist < bestDist) {
        bestDist = dist;
        const edgeZone = row.height * 0.28;
        const inTopHalf = clientY < midY;
        const inMiddle = clientY >= row.top + edgeZone && clientY <= row.bottom - edgeZone;

        if (inMiddle && row.nodeType === 'group') {
          best = { type: 'into', groupId: row.nodeId };
        } else if (inTopHalf) {
          // Insert before this row = after its previous sibling in the same parent
          const prevSibling = rows.find(r => r.parentId === row.parentId && r.siblingIndex === row.siblingIndex - 1);
          best = { type: 'between', parentId: row.parentId, afterId: prevSibling?.nodeId ?? null };
        } else {
          // Insert after this row
          best = { type: 'between', parentId: row.parentId, afterId: row.nodeId };
        }
      }
    });
    setDropTarget(best);
  }, []);

  const onDragMove = useCallback((clientX, clientY) => {
    setDragPos({ x: clientX, y: clientY });
    computeDropTarget(clientX, clientY);
  }, [computeDropTarget]);

  useEffect(() => { dragStateRef.current = { dragId, dropTarget }; }, [dragId, dropTarget]);

  const startDrag = useCallback((node, x, y, ox, oy) => {
    // Snapshot row positions BEFORE anything changes — this prevents the feedback loop
    // where inserting a DropGap shifts rows and causes drop target to flicker
    const container = treeScrollRef.current;
    if (container) {
      rowSnapshotRef.current = Array.from(container.querySelectorAll('[data-row]'))
        .filter(r => r.getAttribute('data-node-id') !== node.id)
        .map(r => {
          const rect = r.getBoundingClientRect();
          return {
            nodeId: r.getAttribute('data-node-id'),
            nodeType: r.getAttribute('data-node-type'),
            parentId: r.getAttribute('data-parent-id') || 'root',
            siblingIndex: parseInt(r.getAttribute('data-sibling-index') || '0', 10),
            top: rect.top, bottom: rect.bottom, height: rect.height,
          };
        });
    }
    setDragId(node.id);
    setDragNode(node);
    setDragPos({ x, y });
    setGrabOffset({ x: ox, y: oy });
  }, []);

  const onDragEnd = useCallback(() => {
    const { dragId: dId, dropTarget: dTarget } = dragStateRef.current;
    if (dId && dTarget) {
      setDisplayTree(prev => {
        const [treeWithout, removed] = removeFromTree(prev, dId);
        if (!removed) return prev;

        if (dTarget.type === 'into') {
          // Drop into a group — insert at position 0
          const group = findInTree(treeWithout, dTarget.groupId);
          if (!group) return prev;
          setExpandedIds(s => { const n = new Set(s); n.add(dTarget.groupId); return n; });
          return insertIntoTree(treeWithout, dTarget.groupId, removed, 0);
        }

        // Drop between rows
        const parent = findInTree(treeWithout, dTarget.parentId);
        if (!parent) return prev;
        let idx;
        if (dTarget.afterId === null) {
          idx = 0;
        } else {
          idx = parent.children.findIndex(c => c.id === dTarget.afterId);
          idx = idx === -1 ? parent.children.length : idx + 1;
        }
        return insertIntoTree(treeWithout, dTarget.parentId, removed, idx);
      });
    }
    setDragId(null);
    setDragNode(null);
    setDragPos(null);
    setDropTarget(null);
    rowSnapshotRef.current = null;
  }, []); // stable — reads from ref, no stale closure

  /* ── Visibility / lock / opacity ────────────────────────────────────────── */
  const applyOpacityToMesh = useCallback((node, val) => {
    if (!node.obj) return;
    const fraction = val / 100;
    node.obj.traverse?.((o) => {
      o.visible = fraction > 0;
      if (o.material) { o.material.transparent = fraction < 1; o.material.opacity = fraction; o.material.needsUpdate = true; }
    });
  }, []);

  const toggleHidden = useCallback((node) => {
    setOpacityMap(prev => {
      const current = prev.get(node.id) ?? 100;
      const isHidden = current === 0;
      const next = new Map(prev);
      if (isHidden) {
        // Restore: use saved previous or 100
        const restored = prevOpacityRef.current.get(node.id) || 100;
        next.set(node.id, restored);
        applyOpacityToMesh(node, restored);
      } else {
        // Hide: save current, set to 0
        prevOpacityRef.current.set(node.id, current);
        next.set(node.id, 0);
        applyOpacityToMesh(node, 0);
      }
      return next;
    });
  }, [applyOpacityToMesh]);

  const toggleLock = useCallback((node) => {
    setLockedIds(prev => { const next = new Set(prev); if (next.has(node.id)) next.delete(node.id); else next.add(node.id); return next; });
  }, []);

  const setOpacity = useCallback((node, val) => {
    if (val > 0) prevOpacityRef.current.set(node.id, val);
    setOpacityMap(prev => {
      const next = new Map(prev);
      next.set(node.id, val);
      applyOpacityToMesh(node, val);
      return next;
    });
  }, [applyOpacityToMesh]);

  const toggleIsolate = useCallback((node) => {
    setIsolatedId(prev => {
      const turningOn = prev !== node.id;
      const next = turningOn ? node.id : null;
      const meshes = meshesRef.current || [];
      if (turningOn) {
        meshes.forEach(m => { m.visible = false; });
        if (node.obj) { node.obj.visible = true; node.obj.traverse?.((o) => { o.visible = true; }); }
        // If this node was at 0 opacity, restore it
        setOpacityMap(om => {
          const cur = om.get(node.id) ?? 100;
          if (cur === 0) {
            const restored = prevOpacityRef.current.get(node.id) || 100;
            applyOpacityToMesh(node, restored);
            const m = new Map(om); m.set(node.id, restored); return m;
          }
          return om;
        });
      } else {
        meshes.forEach(m => { m.visible = true; });
      }
      return next;
    });
  }, [meshesRef]);

  const duplicate = useCallback((node) => {
    if (!node.obj) return;
    const clone = node.obj.clone();
    clone.name = (node.obj.name || 'Copy') + '_copy';
    node.obj.parent?.add(clone);
    setDisplayTree(buildTree(meshesRef.current || []));
  }, [meshesRef]);

  const deleteNode = useCallback((node) => {
    if (node.obj) node.obj.parent?.remove(node.obj);
    setDisplayTree(prev => removeFromTree(prev, node.id)[0]);
  }, []);

  const openMenu = useCallback((node, x, y) => setMenu({ node, x, y }), []);
  const closeMenu = useCallback(() => setMenu(null), []);
  const startRename = useCallback((node) => setRenamingId(node.id), []);

  const ctx = useMemo(() => ({
    lockedIds, opacityMap, selectedId, locatedId, isolatedId, renamingId,
    expandedIds, dragId, dropTarget,
    opacityPopoverId, setOpacityPopoverId,
    setSelectedId, toggleHidden, toggleLock, setOpacity, toggleIsolate, duplicate, deleteNode,
    openMenu, startRename, toggleExpanded, startDrag, onDragMove, onDragEnd,
    parentId: 'root', siblingIndex: 0,
  }), [lockedIds, opacityMap, selectedId, locatedId, isolatedId, renamingId, expandedIds, dragId, dropTarget, opacityPopoverId, setOpacityPopoverId, toggleHidden, toggleLock, setOpacity, toggleIsolate, duplicate, deleteNode, openMenu, startRename, toggleExpanded, startDrag, onDragMove, onDragEnd]);

  /* ── Drag-to-move panel ─────────────────────────────────────────────────── */
  const [dragging, setDragging] = useState(false);
  const [headerHovered, setHeaderHovered] = useState(false);

  const onHeaderMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    const startLeft = pos ? pos.left : 8;
    const startTop = pos ? pos.top : parseInt(panelTop, 10);
    setDragging(true);
    const onMove = (me) => setPos({ left: startLeft + me.clientX - startX, top: startTop + me.clientY - startY });
    const onUp = () => { setDragging(false); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [pos, panelTop]);

  useEffect(() => { setPos(null); }, [panelTop]);

  const MAX_W = 600, MIN_W = 220, MIN_H = 200;

  const makeResizeHandler = useCallback((dirs) => (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX, startY = e.clientY;
    const panel = e.currentTarget.closest('[data-panel]');
    const startW = size.w, startH = size.h ?? panel.offsetHeight;
    const startLeft = pos ? pos.left : 8;
    const onMove = (me) => {
      const dx = me.clientX - startX, dy = me.clientY - startY;
      setSize(prev => ({
        w: dirs.includes('e') ? Math.min(MAX_W, Math.max(MIN_W, startW + dx)) : dirs.includes('w') ? Math.min(MAX_W, Math.max(MIN_W, startW - dx)) : prev.w,
        h: dirs.includes('s') ? Math.max(MIN_H, startH + dy) : prev.h,
      }));
      if (dirs.includes('w')) setPos(p => ({ left: Math.min(startLeft + dx, startLeft + startW - MIN_W), top: p ? p.top : parseInt(panelTop, 10) }));
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
        backdropFilter: (dragging || headerHovered) ? 'blur(8px)' : 'none',
        WebkitBackdropFilter: (dragging || headerHovered) ? 'blur(8px)' : 'none',
        borderRadius: '16px', padding: '4px',
        transition: 'transform 0.26s cubic-bezier(0.22,1,0.36,1), opacity 0.2s ease, background 0.25s ease',
      }}>
        <div data-panel ref={panelRef} style={{
          width: `${size.w}px`,
          height: size.h ? `${size.h}px` : undefined,
          maxHeight: size.h ? undefined : 'calc(100vh - 140px)',
          minWidth: `${MIN_W}px`, minHeight: `${MIN_H}px`, maxWidth: `${MAX_W}px`,
          background: L.bg,
          border: `1px solid ${L.border}`,
          borderRadius: '12px',
          display: 'flex', flexDirection: 'column',
          boxSizing: 'border-box', overflow: 'hidden',
          position: 'relative',
        }}>
          {/* Header */}
          <div
            onMouseDown={onHeaderMouseDown}
            onMouseEnter={(e) => { setHeaderHovered(true); e.currentTarget.querySelector('.drag-pill').style.opacity = '1'; }}
            onMouseLeave={(e) => { setHeaderHovered(false); e.currentTarget.querySelector('.drag-pill').style.opacity = '0.5'; }}
            style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '36px', padding: '0 8px', boxShadow: '0 1px 0 var(--color-overlay-divider)', flexShrink: 0, cursor: 'grab' }}
          >
            <span style={{ fontSize: '14px', fontWeight: 400, color: L.text, fontFamily: L.font, lineHeight: '20px' }}>Layers</span>
            <div className="drag-pill" style={{ position: 'absolute', left: '50%', top: '8px', transform: 'translateX(-50%)', width: '64px', height: '2px', borderRadius: '1px', background: L.dragPill, opacity: 0.5, pointerEvents: 'none', transition: 'background 0.2s, opacity 0.2s' }} />
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => setOpen(false)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: '6px', border: 'none', background: 'transparent', cursor: 'pointer', color: L.iconDim, padding: 0 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = L.iconHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = L.iconDim; }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Tree */}
          <div ref={treeScrollRef} style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
            {displayTree.children.length === 0 ? (
              <div style={{ padding: '16px', fontSize: '14px', color: L.border, textAlign: 'center', fontFamily: L.font }}>No model loaded</div>
            ) : (
              displayTree.children.map((node, i) => (
                <TreeNode key={node.id} node={node} depth={0} ctx={{ ...ctx, parentId: 'root', siblingIndex: i }} />
              ))
            )}
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', gap: '4px', padding: '8px', justifyContent: 'flex-end', boxShadow: '0 -1px 0 var(--color-overlay-divider)', flexShrink: 0 }}>
            <button
              title="New layer"
              onClick={addLayer}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-background-subtle-hovered)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = L.footerBtn; }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: '4px', border: 'none', cursor: 'pointer', background: L.footerBtn, color: L.text, transition: 'background 0.15s', flexShrink: 0 }}
            >
              <Plus size={14} />
            </button>
            <button
              title="New group"
              onClick={addGroup}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-background-subtle-hovered)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = L.footerBtn; }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: '4px', border: 'none', cursor: 'pointer', background: L.footerBtn, color: L.text, transition: 'background 0.15s', flexShrink: 0 }}
            >
              <Folder size={14} />
            </button>
          </div>

          {/* Resize handles */}
          <div onMouseDown={makeResizeHandler(['e'])} style={{ position: 'absolute', top: 0, right: 0, width: '5px', height: '100%', cursor: 'ew-resize' }} />
          <div onMouseDown={makeResizeHandler(['s'])} style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: '5px', cursor: 'ns-resize' }} />
          <div onMouseDown={makeResizeHandler(['e', 's'])} style={{ position: 'absolute', bottom: 0, right: 0, width: '12px', height: '12px', cursor: 'nwse-resize', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: '3px' }}>
            <svg width="6" height="6" viewBox="0 0 8 8" fill="none"><path d="M7 1L1 7M7 4L4 7" stroke="var(--color-drag-pill)" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </div>
        </div>
      </div>
      {menu && createPortal(<ContextMenu menu={{ ...menu, ctx }} onClose={closeMenu} />, document.body)}
      {dragNode && dragPos && createPortal(
        <div style={{
          position: 'fixed',
          left: dragPos.x + 12,
          top: dragPos.y - 14,
          maxWidth: '180px',
          height: '28px',
          background: L.bg,
          border: `1px solid ${L.border}`,
          borderRadius: '6px',
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '0 10px 0 8px',
          pointerEvents: 'none',
          zIndex: 400,
          opacity: 0.95,
          boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
          animation: 'layerGhostIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
          fontFamily: L.font,
          fontSize: '12px',
          color: L.text,
          boxSizing: 'border-box',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
        }}>
          {showChevronForType(dragNode.type) && <ChevronRight size={12} style={{ flexShrink: 0, color: L.iconDim }} />}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{dragNode.name}</span>
        </div>,
        document.body
      )}
    </>
  );
};

export default LayersDrawer;
