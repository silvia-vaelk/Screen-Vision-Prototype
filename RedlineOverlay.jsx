import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { UI } from './constants.js';
import {
  CURSOR_ANNOTATE_ON_MODEL,
  CURSOR_ANNOTATE_IDLE,
  CURSOR_ORBIT_PAN,
  CURSOR_ORBIT_ROTATE,
} from './cursors.js';
import shoeModelMeshes from './shoeModelMeshes.js';

export const REDLINE_COLORS = ['#e05a5a', '#ff6b35', '#f5c842', '#5ae06a', '#5a8fe0', '#b05ae0', '#ffffff', '#222222'];
export const REDLINE_WIDTHS = [
  { label: 'S', value: 0.5, display: 1 }, { label: 'M', value: 1.0, display: 2 },
  { label: 'L', value: 2.0, display: 3.5 }, { label: 'XL', value: 3.5, display: 5 },
];

/* ─── RedlineStrokes3D ─────────────────────────────────────────────────────── */
// Fix #6: memoize per-stroke Vector3 arrays so they are not reallocated every render.
export const RedlineStrokes3D = ({ redlines, modelPosition, selectedId }) => {
  const [mpx, mpy, mpz] = modelPosition || [0, 0, 0];

  const strokePointArrays = useMemo(
    () => redlines.map(stroke =>
      stroke.points3D?.map(p => new THREE.Vector3(p.x + mpx, p.y + mpy, p.z + mpz)) ?? []
    ),
    [redlines, mpx, mpy, mpz],
  );

  return (
    <>
      {redlines.map((stroke, idx) => {
        if (!stroke.visible || !stroke.points3D || stroke.points3D.length < 2) return null;
        const points = strokePointArrays[idx];
        const isSelected = stroke.id === selectedId;
        const baseWidth = Math.max(1, (stroke.width || 2) * 2.2);
        return (
          <React.Fragment key={stroke.id}>
            {isSelected && (
              <Line points={points} color="#ffffff" lineWidth={baseWidth * 1.6 * 4} opacity={0.3} transparent depthTest />
            )}
            <Line
              points={points}
              color={stroke.color || '#e5484d'}
              lineWidth={baseWidth * (isSelected ? 1.6 : 1)}
              opacity={isSelected ? 1 : (stroke.opacity ?? 0.92)}
              transparent
              depthTest
            />
          </React.Fragment>
        );
      })}
    </>
  );
};

/* ─── LiveRedlineStroke ────────────────────────────────────────────────────── */
// Fix #6: memoize the Vector3 array so re-renders from unrelated state don't reallocate.
export const LiveRedlineStroke = ({ points, color, width, modelPosition }) => {
  const [mpx, mpy, mpz] = modelPosition || [0, 0, 0];
  const pts = useMemo(
    () => points?.map(p => new THREE.Vector3(p.x + mpx, p.y + mpy, p.z + mpz)) ?? [],
    [points, mpx, mpy, mpz],
  );
  if (pts.length < 2) return null;
  return (
    <Line
      points={pts}
      color={color}
      lineWidth={Math.max(1, (width || 2) * 2.2)}
      opacity={0.92}
      transparent
      depthTest
    />
  );
};

/* ─── StrokeDetailPopup ────────────────────────────────────────────────────── */
export const StrokeDetailPopup = ({ stroke, screenPos, onClose, onFlyTo, onUpdate }) => {
  const [comment, setComment] = useState(stroke.comment || '');
  const [pos, setPos] = useState(() => ({
    x: Math.min((screenPos?.x ?? 300) + 18, window.innerWidth - 262),
    y: Math.max(10, Math.min((screenPos?.y ?? 200) - 40, window.innerHeight - 240)),
  }));
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const [dragging, setDragging] = useState(false);

  useEffect(() => { setComment(stroke.comment || ''); }, [stroke.id, stroke.comment]);

  const save = () => { if (comment !== stroke.comment) onUpdate(stroke.id, { comment }); };

  const handleDragStart = (e) => {
    if (e.button !== 0) return;
    isDragging.current = true;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
    e.preventDefault();
    const onMove = (me) => {
      if (!isDragging.current) return;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 262, dragStart.current.px + me.clientX - dragStart.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 240, dragStart.current.py + me.clientY - dragStart.current.y)),
      });
    };
    const onUp = () => {
      isDragging.current = false;
      setDragging(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div style={{
      position: 'fixed', left: pos.x, top: pos.y, zIndex: 45,
      width: '244px', background: 'rgba(255,255,255,0.97)',
      border: '1px solid rgba(0,0,0,0.09)', borderRadius: '16px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.07)',
      backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      fontFamily: UI.font, userSelect: 'none', overflow: 'hidden',
    }}>
      <div
        onPointerDown={handleDragStart}
        style={{
          padding: '12px 14px', borderBottom: '1px solid rgba(0,0,0,0.07)',
          display: 'flex', alignItems: 'center', gap: '8px',
          cursor: dragging ? 'grabbing' : 'grab',
        }}
      >
        <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: stroke.color, flexShrink: 0 }} />
        <span style={{ fontSize: '12px', fontWeight: '600', color: '#1c1c1e', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stroke.name}</span>
        <button onClick={onFlyTo} title="Fly to stroke" style={{ background: 'none', border: 'none', color: '#aeaeb2', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
          onMouseEnter={e => e.currentTarget.style.color = '#6c5ce7'} onMouseLeave={e => e.currentTarget.style.color = '#aeaeb2'}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2"/><path d="M8 5v3l2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#aeaeb2', cursor: 'pointer', padding: '2px 4px', fontSize: '13px', lineHeight: 1, display: 'flex', alignItems: 'center' }}
          onMouseEnter={e => e.currentTarget.style.color = '#e5484d'} onMouseLeave={e => e.currentTarget.style.color = '#aeaeb2'}>✕</button>
      </div>
      <div style={{ padding: '12px 14px' }}>
        <div style={{ fontSize: '7px', letterSpacing: '0.22em', color: '#aeaeb2', textTransform: 'uppercase', marginBottom: '7px' }}>Comment</div>
        <textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          onBlur={save}
          placeholder="Add a note about this annotation…"
          rows={3}
          style={{
            width: '100%', background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.09)',
            borderRadius: '8px', color: '#1c1c1e', fontFamily: UI.font, fontSize: '11px',
            lineHeight: '1.5', padding: '8px 10px', resize: 'none', outline: 'none',
            boxSizing: 'border-box', userSelect: 'text',
          }}
          onFocus={e => e.currentTarget.style.borderColor = 'rgba(108,92,231,0.4)'}
          onBlurCapture={e => e.currentTarget.style.borderColor = 'rgba(0,0,0,0.09)'}
        />
      </div>
    </div>
  );
};

/* ─── RedlineToolbar ───────────────────────────────────────────────────────── */
export const RedlineToolbar = ({ color, setColor, width, setWidth, onUndo, onRedo, onClear, strokeCount, redlines, setRedlines, undoStack, surfaceOffset, setSurfaceOffset, onEditStroke }) => {
  const [pos, setPos] = useState({ x: 20, y: 100 });
  const [collapsed, setCollapsed] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal] = useState('');
  const [showLayers, setShowLayers] = useState(true);
  const [expandedStrokeId, setExpandedStrokeId] = useState(null);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 });

  const handleDragStart = (e) => {
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
    e.preventDefault();
    const onMove = (me) => {
      if (!isDragging.current) return;
      setPos({ x: Math.max(0, Math.min(window.innerWidth - 280, dragStart.current.px + me.clientX - dragStart.current.x)), y: Math.max(0, Math.min(window.innerHeight - 100, dragStart.current.py + me.clientY - dragStart.current.y)) });
    };
    const onUp = () => { isDragging.current = false; window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
  };

  const startRename = (stroke) => { setRenamingId(stroke.id); setRenameVal(stroke.name || ''); };
  const commitRename = (id) => { setRedlines(prev => prev.map(r => r.id === id ? { ...r, name: renameVal.trim() || r.name } : r)); setRenamingId(null); setRenameVal(''); };
  const toggleVisibility = (id) => { setRedlines(prev => prev.map(r => r.id === id ? { ...r, visible: !r.visible } : r)); };
  const toggleAllLayers = () => { const allVisible = redlines.every(r => r.visible); setRedlines(prev => prev.map(r => ({ ...r, visible: !allVisible }))); };

  return (
    <div style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 35, width: collapsed ? '46px' : '274px', background: UI.glass, border: `1px solid ${UI.glassBorder}`, borderRadius: UI.radius, backdropFilter: UI.glassBlur, WebkitBackdropFilter: UI.glassBlur, fontFamily: UI.font, userSelect: 'none', transition: 'width 0.2s ease', boxShadow: UI.panelShadow, maxHeight: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div onPointerDown={handleDragStart} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: collapsed ? '10px 12px' : '10px 14px', borderBottom: collapsed ? 'none' : `1px solid rgba(0,0,0,0.08)`, cursor: 'grab', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M11.5 1.5l3 3-9 9H2.5v-3l9-9z" stroke="#e5484d" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/><path d="M9.5 3.5l3 3" stroke="#e5484d" strokeWidth="1.2"/></svg>
          {!collapsed && <span style={{ fontSize: '10px', letterSpacing: '0.18em', color: '#e5484d', textTransform: 'uppercase', fontWeight: '600' }}>Redline</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {!collapsed && strokeCount > 0 && <span style={{ fontSize: '9px', color: '#636366' }}>{strokeCount}</span>}
          <button onClick={(e) => { e.stopPropagation(); setCollapsed(v => !v); }} style={{ background: 'none', border: 'none', color: '#aeaeb2', cursor: 'pointer', fontSize: '11px', lineHeight: 1, padding: '2px', display: 'flex', alignItems: 'center' }}>
            {collapsed ? <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              : <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M3 7.5l3-3 3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto', flex: 1 }}>
          <div>
            <div style={{ fontSize: '7px', letterSpacing: '0.22em', color: '#aeaeb2', textTransform: 'uppercase', marginBottom: '8px' }}>Pen Color</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {REDLINE_COLORS.map(c => (
                <div key={c} onClick={() => setColor(c)} style={{ width: '22px', height: '22px', borderRadius: '6px', background: c, cursor: 'pointer', border: color === c ? '2px solid rgba(0,0,0,0.4)' : `1px solid rgba(0,0,0,0.12)`, boxSizing: 'border-box', transition: 'transform 0.1s', transform: color === c ? 'scale(1.1)' : 'scale(1)' }} />
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '7px', letterSpacing: '0.22em', color: '#aeaeb2', textTransform: 'uppercase', marginBottom: '8px' }}>Stroke Width</div>
            <div style={{ display: 'flex', gap: '4px' }}>
              {REDLINE_WIDTHS.map(w => (
                <button key={w.label} onClick={() => setWidth(w.value)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '5px', padding: '8px 4px', background: width === w.value ? 'rgba(0,0,0,0.05)' : 'transparent', border: width === w.value ? '1px solid rgba(0,0,0,0.15)' : '1px solid rgba(0,0,0,0.06)', borderRadius: '6px', cursor: 'pointer' }}>
                  <div style={{ width: '20px', height: `${w.display}px`, borderRadius: '1px', background: width === w.value ? color : '#d1d1d6' }} />
                  <span style={{ fontSize: '8px', fontWeight: '600', letterSpacing: '0.12em', color: width === w.value ? '#1c1c1e' : '#aeaeb2' }}>{w.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ fontSize: '7px', letterSpacing: '0.22em', color: '#aeaeb2', textTransform: 'uppercase' }}>Surface Gap</div>
              <span style={{ fontSize: '9px', color: '#636366', fontVariantNumeric: 'tabular-nums' }}>{(surfaceOffset ?? 0.08).toFixed(2)}</span>
            </div>
            <input type="range" min="0" max="0.5" step="0.01" value={surfaceOffset ?? 0.08} onChange={e => setSurfaceOffset(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: '#dc2626', cursor: 'pointer' }} />
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            {[
              { label: 'Undo', onClick: onUndo, disabled: strokeCount === 0, danger: false },
              { label: 'Redo', onClick: onRedo, disabled: undoStack.length === 0, danger: false },
              { label: 'Clear', onClick: onClear, disabled: strokeCount === 0, danger: true },
            ].map(({ label, onClick, disabled, danger }) => (
              <button key={label} onClick={onClick} disabled={disabled} style={{ flex: 1, background: 'transparent', border: `1px solid ${!disabled ? (danger ? 'rgba(240,79,79,0.25)' : 'rgba(255,255,255,0.12)') : 'rgba(255,255,255,0.05)'}`, borderRadius: '6px', color: !disabled ? (danger ? '#f04f4f' : '#9898a6') : 'rgba(255,255,255,0.15)', fontFamily: UI.font, fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '8px 0', cursor: !disabled ? 'pointer' : 'default' }}>
                {label}
              </button>
            ))}
          </div>

          {redlines.length > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ fontSize: '7px', letterSpacing: '0.22em', color: '#aeaeb2', textTransform: 'uppercase' }}>Layers <span style={{ color: '#d1d1d6', marginLeft: '4px' }}>{redlines.length}</span></div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={toggleAllLayers} style={{ background: 'none', border: 'none', color: '#aeaeb2', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 2L1 6l7 4 7-4-7-4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/><path d="M1 10l7 4 7-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                  <button onClick={() => setShowLayers(v => !v)} style={{ background: 'none', border: 'none', color: '#aeaeb2', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}>
                    {showLayers ? <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M3 7.5l3-3 3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      : <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </button>
                </div>
              </div>
              {showLayers && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '200px', overflowY: 'auto' }}>
                  {redlines.map((stroke) => {
                    const isRenaming = renamingId === stroke.id;
                    const isExpanded = expandedStrokeId === stroke.id;
                    return (
                      <div key={stroke.id} style={{ background: isExpanded ? 'rgba(108,92,231,0.04)' : 'rgba(0,0,0,0.03)', border: `1px solid ${isExpanded ? 'rgba(108,92,231,0.2)' : stroke.visible ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.03)'}`, borderRadius: '6px', padding: '7px 10px', opacity: stroke.visible ? 1 : 0.5, transition: 'background 0.15s, border-color 0.15s' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                            <button onClick={() => toggleVisibility(stroke.id)} style={{ background: 'none', border: 'none', color: stroke.visible ? '#636366' : '#d1d1d6', cursor: 'pointer', padding: '1px', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                              {stroke.visible ? <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.1"/><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.1"/></svg>
                                : <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.1"/><line x1="2" y1="2" x2="14" y2="14" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>}
                            </button>
                            <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: stroke.color, flexShrink: 0 }} />
                            {isRenaming ? (
                              <input value={renameVal} onChange={e => setRenameVal(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') commitRename(stroke.id); if (e.key === 'Escape') setRenamingId(null); }}
                                onBlur={() => commitRename(stroke.id)} autoFocus
                                style={{ flex: 1, background: 'white', border: '1px solid rgba(0,0,0,0.12)', borderRadius: '4px', color: '#1c1c1e', fontFamily: UI.font, fontSize: '10px', padding: '3px 6px', outline: 'none', minWidth: 0 }} />
                            ) : (
                              <span onClick={() => startRename(stroke)} title="Click to rename" style={{ fontSize: '10px', color: '#1c1c1e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text', flex: 1 }}>{stroke.name}</span>
                            )}
                          </div>
                          <button
                            onClick={() => setExpandedStrokeId(isExpanded ? null : stroke.id)}
                            title="Add comment"
                            style={{ background: 'none', border: 'none', color: isExpanded ? '#6c5ce7' : stroke.comment ? '#6c5ce7' : '#d1d1d6', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                            onMouseEnter={e => { if (!isExpanded && !stroke.comment) e.currentTarget.style.color = '#6c5ce7'; }}
                            onMouseLeave={e => { if (!isExpanded && !stroke.comment) e.currentTarget.style.color = '#d1d1d6'; }}>
                            <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M2 3h12v8H8.5L6 14v-3H2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>
                          </button>
                          <button onClick={() => setRedlines(prev => prev.filter(r => r.id !== stroke.id))} style={{ background: 'none', border: 'none', color: '#d1d1d6', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', fontSize: '10px', flexShrink: 0 }} onMouseEnter={e => e.currentTarget.style.color = '#e5484d'} onMouseLeave={e => e.currentTarget.style.color = '#d1d1d6'}>✕</button>
                        </div>
                        {isExpanded && (
                          <div style={{ marginTop: '8px' }}>
                            <textarea
                              key={stroke.id}
                              defaultValue={stroke.comment || ''}
                              placeholder="Add a note about this stroke…"
                              rows={3}
                              autoFocus
                              onBlur={e => {
                                const val = e.currentTarget.value;
                                setRedlines(prev => prev.map(r => r.id === stroke.id ? { ...r, comment: val } : r));
                              }}
                              style={{
                                width: '100%', background: 'white', border: '1px solid rgba(108,92,231,0.25)',
                                borderRadius: '6px', color: '#1c1c1e', fontFamily: UI.font, fontSize: '10px',
                                lineHeight: '1.5', padding: '6px 8px', resize: 'none', outline: 'none',
                                boxSizing: 'border-box', userSelect: 'text',
                              }}
                              onFocus={e => e.currentTarget.style.borderColor = 'rgba(108,92,231,0.5)'}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {redlines.length === 0 && (
            <div style={{ textAlign: 'center', padding: '8px 0 2px', fontSize: '10px', color: '#aeaeb2', lineHeight: '1.7' }}>Draw on the shoe surface to<br />annotate design changes</div>
          )}
        </div>
      )}
    </div>
  );
};

/* ─── RedlineCanvasOverlay ─────────────────────────────────────────────────── */
export const RedlineCanvasOverlay = ({ active, redlines, setRedlines, color, width, threeStateRef, orbitRef, onStrokeCommitted, surfaceOffset, strokeCounter, modelPosition, onStrokeClick, setLivePoints, precisionMode, setPrecisionMode }) => {
  const canvasRef = useRef(null);
  const isDrawing = useRef(false);
  const currentPoints3D = useRef([]);
  const lastClientPt = useRef(null);
  const dpr = window.devicePixelRatio || 1;
  const orbitLockedRef = useRef(null);
  const activeRef = useRef(active);
  useEffect(() => { activeRef.current = active; }, [active]);
  const firstScreenRef = useRef(null);
  const firstLocalRef = useRef(null);
  const startIndicatorRef = useRef(null);

  // Fix #5: reuse a single Raycaster instead of allocating one per getShoeHit call.
  const raycasterRef = useRef(new THREE.Raycaster());

  const surfaceOffsetRef = useRef(surfaceOffset ?? 0.08);
  useEffect(() => { surfaceOffsetRef.current = surfaceOffset ?? 0.08; }, [surfaceOffset]);
  const strokeCounterRef = useRef(strokeCounter ?? 1);
  useEffect(() => { strokeCounterRef.current = strokeCounter ?? 1; }, [strokeCounter]);
  const modelPositionRef = useRef(modelPosition ?? [0, 0, 0]);
  useEffect(() => { modelPositionRef.current = modelPosition ?? [0, 0, 0]; }, [modelPosition]);

  const redlinesRef = useRef(redlines);
  useEffect(() => { redlinesRef.current = redlines; }, [redlines]);

  const onStrokeClickRef = useRef(onStrokeClick);
  useEffect(() => { onStrokeClickRef.current = onStrokeClick; }, [onStrokeClick]);

  const precisionRef = useRef(false);
  useEffect(() => {
    const onKD = (e) => { if (e.key === 'Shift' && !precisionRef.current) { precisionRef.current = true; setPrecisionMode?.(true); } };
    const onKU = (e) => { if (e.key === 'Shift' && precisionRef.current) { precisionRef.current = false; setPrecisionMode?.(false); } };
    window.addEventListener('keydown', onKD);
    window.addEventListener('keyup', onKU);
    return () => { window.removeEventListener('keydown', onKD); window.removeEventListener('keyup', onKU); };
  }, [setPrecisionMode]);

  useEffect(() => {
    const resize = () => {
      const c = canvasRef.current;
      if (!c) return;
      c.style.width = window.innerWidth + 'px';
      c.style.height = window.innerHeight + 'px';
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const getShoeHit = useCallback((clientX, clientY) => {
    const st = threeStateRef.current;
    if (!st) return null;
    const { camera, gl } = st;
    const rect = gl.domElement.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycasterRef.current.setFromCamera(new THREE.Vector2(nx, ny), camera);
    const meshes = shoeModelMeshes.current;
    if (!meshes || meshes.length === 0) return null;
    const hits = raycasterRef.current.intersectObjects(meshes, true);
    if (hits.length > 0) {
      const p = hits[0].point.clone();
      const n = hits[0].face?.normal?.clone();
      if (n) { n.transformDirection(hits[0].object.matrixWorld); p.add(n.multiplyScalar(surfaceOffsetRef.current)); }
      return p;
    }
    return null;
  }, [threeStateRef]);

  const project = useCallback((pt3, camera, w, h) => {
    const v = new THREE.Vector3(pt3.x, pt3.y, pt3.z).project(camera);
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h };
  }, []);

  const findNearestStroke = useCallback((clientX, clientY) => {
    const st = threeStateRef.current;
    if (!st) return null;
    const { camera } = st;
    const mp = modelPositionRef.current;
    const strokes = redlinesRef.current;
    const w = window.innerWidth * dpr;
    const h = window.innerHeight * dpr;
    const cx = clientX * dpr, cy = clientY * dpr;

    const distToSeg = (px, py, x1, y1, x2, y2) => {
      const dx = x2 - x1, dy = y2 - y1;
      const lenSq = dx * dx + dy * dy;
      if (lenSq === 0) return Math.hypot(px - x1, py - y1);
      const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
      return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    };

    let nearest = null;
    let minDist = 16 * dpr;
    const toWorld = (p) => ({ x: p.x + mp[0], y: p.y + mp[1], z: p.z + mp[2] });

    for (const stroke of strokes) {
      if (!stroke.visible || !stroke.points3D || stroke.points3D.length < 2) continue;
      const pts2D = stroke.points3D.map(p => project(toWorld(p), camera, w, h));
      for (let i = 0; i < pts2D.length - 1; i++) {
        const d = distToSeg(cx, cy, pts2D[i].x, pts2D[i].y, pts2D[i + 1].x, pts2D[i + 1].y);
        if (d < minDist) { minDist = d; nearest = stroke; }
      }
    }
    if (!nearest) return null;

    const pts = nearest.points3D;
    const mid = Math.floor(pts.length / 2);
    const cp = toWorld(pts[mid]);
    const sc = project(cp, camera, w, h);
    return { stroke: nearest, centroid3D: cp, screenPos: { x: sc.x / dpr, y: sc.y / dpr } };
  }, [threeStateRef, dpr, project]);

  // Fix #4: throttle cursor raycast to once per animation frame.
  useEffect(() => {
    if (!active) return;
    const cvs = canvasRef.current;
    if (!cvs) return;
    let rafId = null;
    let pendingX = 0, pendingY = 0, pendingButtons = 0;
    const updateCursor = (e) => {
      if (isDrawing.current) return;
      if (orbitLockedRef.current) return;
      pendingX = e.clientX; pendingY = e.clientY; pendingButtons = e.buttons;
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (pendingButtons & 2) { cvs.style.cursor = CURSOR_ORBIT_PAN; return; }
        if (pendingButtons & 1) { cvs.style.cursor = CURSOR_ORBIT_ROTATE; return; }
        const hit = getShoeHit(pendingX, pendingY);
        cvs.style.cursor = hit ? CURSOR_ANNOTATE_ON_MODEL : CURSOR_ANNOTATE_IDLE;
      });
    };
    const onLeave = (e) => {
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      if (!(e.buttons & (1 | 2))) cvs.style.cursor = '';
    };
    window.addEventListener('pointermove', updateCursor, { passive: true });
    cvs.addEventListener('pointerleave', onLeave);
    cvs.addEventListener('pointerenter', updateCursor, { passive: true });
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', updateCursor);
      cvs.removeEventListener('pointerleave', onLeave);
      cvs.removeEventListener('pointerenter', updateCursor);
      cvs.style.cursor = '';
    };
  }, [active, getShoeHit]);

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs || !active) return;

    const handOffToOrbit = (e, mode) => {
      orbitLockedRef.current = mode;
      const orbitCursor = mode === 'pan' ? CURSOR_ORBIT_PAN : CURSOR_ORBIT_ROTATE;
      cvs.style.pointerEvents = 'none';
      try { cvs.releasePointerCapture(e.pointerId); } catch (_) { /* not captured yet */ }
      const glCanvas = threeStateRef.current?.gl?.domElement;
      if (glCanvas) glCanvas.style.cursor = orbitCursor;
      if (glCanvas && orbitRef.current) {
        orbitRef.current.enabled = true;
        glCanvas.dispatchEvent(new PointerEvent('pointerdown', {
          bubbles: true, cancelable: true,
          clientX: e.clientX, clientY: e.clientY,
          screenX: e.screenX, screenY: e.screenY,
          button: e.button, buttons: e.buttons,
          pointerId: e.pointerId, pointerType: e.pointerType || 'mouse',
          isPrimary: e.isPrimary,
        }));
      }
      const restore = () => {
        orbitLockedRef.current = null;
        const gl = threeStateRef.current?.gl?.domElement;
        if (gl) gl.style.cursor = '';
        if (canvasRef.current) {
          canvasRef.current.style.pointerEvents = activeRef.current ? 'auto' : 'none';
        }
        window.removeEventListener('pointerup', restore);
      };
      window.addEventListener('pointerup', restore);
    };

    const onDown = (e) => {
      e.preventDefault();
      if (e.button !== 0) { handOffToOrbit(e, 'pan'); return; }
      const hit = getShoeHit(e.clientX, e.clientY);
      if (!hit) { handOffToOrbit(e, 'rotate'); return; }
      if (orbitRef.current) orbitRef.current.enabled = false;
      isDrawing.current = true; currentPoints3D.current = []; lastClientPt.current = null;
      cvs.style.cursor = CURSOR_ANNOTATE_ON_MODEL;
      const mp = modelPositionRef.current;
      const local = { x: hit.x - mp[0], y: hit.y - mp[1], z: hit.z - mp[2] };
      currentPoints3D.current.push(local);
      setLivePoints?.([local]);
      lastClientPt.current = { x: e.clientX, y: e.clientY };
      firstScreenRef.current = { x: e.clientX, y: e.clientY };
      firstLocalRef.current = { ...local };
      const ind = startIndicatorRef.current;
      if (ind) {
        ind.style.display = 'block';
        ind.style.left = (e.clientX - 8) + 'px';
        ind.style.top = (e.clientY - 8) + 'px';
        ind.style.background = 'rgba(108,92,231,0.25)';
        ind.style.boxShadow = 'none';
        ind.style.transform = 'scale(1)';
      }
    };

    const onMove = (e) => {
      if (!isDrawing.current) return;
      if (orbitLockedRef.current) return;
      e.preventDefault();
      const precision = precisionRef.current;
      const threshold = precision ? 1.4 : 2.5;
      if (lastClientPt.current) {
        const dx = e.clientX - lastClientPt.current.x, dy = e.clientY - lastClientPt.current.y;
        if (Math.sqrt(dx * dx + dy * dy) < threshold) return;
      }
      const hit = getShoeHit(e.clientX, e.clientY);
      if (!hit) return;
      const mp = modelPositionRef.current;
      const raw = { x: hit.x - mp[0], y: hit.y - mp[1], z: hit.z - mp[2] };
      const alpha = precision ? 0.28 : 0.45;
      const arr = currentPoints3D.current;
      const last = arr[arr.length - 1];
      const smoothed = last ? {
        x: last.x + (raw.x - last.x) * alpha,
        y: last.y + (raw.y - last.y) * alpha,
        z: last.z + (raw.z - last.z) * alpha,
      } : raw;
      arr.push(smoothed);
      if (arr.length >= 4) {
        const vecs = arr.map(p => new THREE.Vector3(p.x, p.y, p.z));
        const curve = new THREE.CatmullRomCurve3(vecs, false, 'catmullrom', 0.5);
        const samples = Math.min(Math.max(arr.length, 16), 90);
        setLivePoints?.(curve.getPoints(samples).map(v => ({ x: v.x, y: v.y, z: v.z })));
      } else {
        setLivePoints?.(arr.slice());
      }
      lastClientPt.current = { x: e.clientX, y: e.clientY };
      const fs = firstScreenRef.current;
      if (fs && arr.length > 5) {
        const dist = Math.hypot(e.clientX - fs.x, e.clientY - fs.y);
        const near = dist < 32;
        const ind = startIndicatorRef.current;
        if (ind) {
          ind.style.background = near ? 'rgba(108,92,231,0.65)' : 'rgba(108,92,231,0.25)';
          ind.style.boxShadow = near ? '0 0 0 5px rgba(108,92,231,0.18)' : 'none';
          ind.style.transform = near ? 'scale(1.5)' : 'scale(1)';
        }
      }
    };

    const onUp = (e) => {
      if (!isDrawing.current) return;
      e.preventDefault();
      if (orbitRef.current) orbitRef.current.enabled = true;
      const ind = startIndicatorRef.current;
      if (ind) ind.style.display = 'none';
      if (currentPoints3D.current.length >= 2) {
        const raw = currentPoints3D.current;
        const fs = firstScreenRef.current;
        const fl = firstLocalRef.current;
        if (fs && fl && raw.length > 5) {
          const dist = Math.hypot(e.clientX - fs.x, e.clientY - fs.y);
          if (dist < 32) raw.push({ ...fl });
        }
        let final = raw;
        if (raw.length >= 3) {
          const vecs = raw.map(p => new THREE.Vector3(p.x, p.y, p.z));
          const closed = raw.length > 5 && fs && Math.hypot(e.clientX - fs.x, e.clientY - fs.y) < 32;
          const curve = new THREE.CatmullRomCurve3(vecs, closed, 'catmullrom', 0.5);
          const samples = Math.min(Math.max(raw.length * 2, 32), 300);
          final = curve.getPoints(samples).map(v => ({ x: v.x, y: v.y, z: v.z }));
        }
        // Fix #3: use random suffix to prevent ID collision when strokes are drawn in rapid succession.
        const newStroke = { id: Date.now() + Math.random(), points3D: final.map(p => ({ x: p.x, y: p.y, z: p.z })), color, width, visible: true, name: `Stroke ${strokeCounterRef.current}`, opacity: 0.92, comment: '' };
        setRedlines(prev => [...prev, newStroke]);
        if (onStrokeCommitted) onStrokeCommitted();
      } else {
        const hit = findNearestStroke(e.clientX, e.clientY);
        if (hit && onStrokeClickRef.current) onStrokeClickRef.current(hit);
      }
      isDrawing.current = false; currentPoints3D.current = []; lastClientPt.current = null;
      firstScreenRef.current = null; firstLocalRef.current = null;
      setLivePoints?.([]);
    };

    const onCtxMenu = (e) => e.preventDefault();

    const onWheel = (e) => {
      e.preventDefault();
      const glCanvas = threeStateRef.current?.gl?.domElement;
      if (glCanvas) {
        glCanvas.dispatchEvent(new WheelEvent('wheel', {
          bubbles: true, cancelable: true,
          deltaX: e.deltaX, deltaY: e.deltaY, deltaZ: e.deltaZ,
          deltaMode: e.deltaMode,
          clientX: e.clientX, clientY: e.clientY,
          ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey,
        }));
      }
    };

    cvs.addEventListener('pointerdown', onDown, { passive: false });
    cvs.addEventListener('pointermove', onMove, { passive: false });
    cvs.addEventListener('pointerup', onUp, { passive: false });
    cvs.addEventListener('pointerleave', onUp, { passive: false });
    cvs.addEventListener('contextmenu', onCtxMenu);
    cvs.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      cvs.removeEventListener('pointerdown', onDown);
      cvs.removeEventListener('pointermove', onMove);
      cvs.removeEventListener('pointerup', onUp);
      cvs.removeEventListener('pointerleave', onUp);
      cvs.removeEventListener('contextmenu', onCtxMenu);
      cvs.removeEventListener('wheel', onWheel);
    };
  }, [active, color, width, getShoeHit, setRedlines, orbitRef, onStrokeCommitted, findNearestStroke, setLivePoints]);

  useEffect(() => {
    const onWindowMove = (e) => {
      const glCanvas = threeStateRef.current?.gl?.domElement;
      if (!glCanvas) return;
      if (e.target !== glCanvas) { glCanvas.style.cursor = ''; return; }
      if (active) return;
      const hit = findNearestStroke(e.clientX, e.clientY);
      glCanvas.style.cursor = hit ? 'pointer' : '';
    };
    const onWindowClick = (e) => {
      if (active) return;
      const glCanvas = threeStateRef.current?.gl?.domElement;
      if (!glCanvas || e.target !== glCanvas) return;
      const hit = findNearestStroke(e.clientX, e.clientY);
      if (hit && onStrokeClickRef.current) onStrokeClickRef.current(hit);
    };
    window.addEventListener('pointermove', onWindowMove);
    window.addEventListener('click', onWindowClick);
    return () => {
      const glCanvas = threeStateRef.current?.gl?.domElement;
      if (glCanvas) glCanvas.style.cursor = '';
      window.removeEventListener('pointermove', onWindowMove);
      window.removeEventListener('click', onWindowClick);
    };
  }, [active, findNearestStroke, threeStateRef]);

  return (
    <>
      <canvas ref={canvasRef} style={{ position: 'fixed', top: 0, left: 0, zIndex: active ? 6 : 3, pointerEvents: active ? 'auto' : 'none', touchAction: 'none' }} />
      <div ref={startIndicatorRef} style={{
        display: 'none', position: 'fixed', width: '16px', height: '16px',
        borderRadius: '50%', border: '2px solid #6c5ce7',
        background: 'rgba(108,92,231,0.25)',
        transition: 'background 0.12s, box-shadow 0.12s, transform 0.12s',
        pointerEvents: 'none', zIndex: active ? 7 : 0,
      }} />
    </>
  );
};
