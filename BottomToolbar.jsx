import React, { useState, useEffect, useRef } from 'react';
import {
  MousePointer2, PenTool, Pencil, MessageSquare, Camera,
  Undo2, Redo2, ChevronDown, Check,
} from 'lucide-react';
import { DS } from './tokens.js';

/* ───────────────────────────────────────────────────────────────────────────
   BottomToolbar — always-open bottom-center tool bar (Figma redesign).
   Purely presentational: every button routes through the handler props, which
   call the SAME existing state setters the keyboard shortcuts use (single state
   path — see App.jsx). Geometry + tokens verified from Figma (DESIGN_SPEC §2,§5).
   Icons: lucide-react, except Laser pointer + Section tool which use the exact
   Figma exports (Figma_Redesign/icons/{laser-pointer,section-tool}.svg).
   ─────────────────────────────────────────────────────────────────────────── */

// Swatch palette — black default maps to the existing #1C1C1E pen/pencil/redline
// default; green uses the verified Brand/Mint token.
const PALETTE = [
  { id: 'black',  value: '#1C1C1E' },
  { id: 'red',    value: '#EE6B5E' },
  { id: 'amber',  value: '#F6A831' },
  { id: 'green',  value: DS.green },
  { id: 'purple', value: '#8470F0' },
];

/* Exact Figma exports (magic-wand-02 / section box) — not substituted by lucide */
const LaserGlyph = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" style={{ display: 'block' }}>
    <path d="M7.5 3.33317V1.6665M7.5 13.3332V11.6665M13.3333 7.49984H11.6667M3.33333 7.49984H1.66667M5.16667 9.83317L4.16667 10.8332M5.16667 5.1665L4.16667 4.1665M17.5 17.4998L10 9.99984M9.83333 5.1665L10.8333 4.1665" stroke="currentColor" strokeWidth="1.66667" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const SectionGlyph = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="10 10 20 20" fill="none" style={{ display: 'block' }}>
    <path d="M20.0003 17.4999L13.3869 21.7987C12.8137 22.1712 12.5271 22.3575 12.4278 22.5938C12.3411 22.8002 12.3411 23.0329 12.4278 23.2394M20.0003 17.4999L26.6138 21.7987C27.187 22.1712 27.4736 22.3575 27.5728 22.5938C27.6596 22.8002 27.6596 23.0329 27.5728 23.2394M20.0003 17.4999V12.0832M20.0003 22.4999L13.3869 18.2012C12.8137 17.8286 12.5271 17.6423 12.4278 17.406C12.3411 17.1996 12.3411 16.9669 12.4278 16.7604M20.0003 22.4999L26.6138 18.2012C27.187 17.8286 27.4736 17.6423 27.5728 17.406C27.6596 17.1996 27.6596 16.9669 27.5728 16.7604M20.0003 22.4999V27.9166M27.727 23.3109L20.727 27.8609C20.464 28.0319 20.3324 28.1174 20.1908 28.1506C20.0655 28.18 19.9351 28.18 19.8099 28.1506C19.6682 28.1174 19.5367 28.0319 19.2737 27.8609L12.2737 23.3109C12.052 23.1668 11.9412 23.0948 11.8609 22.9987C11.7898 22.9136 11.7364 22.8152 11.7038 22.7093C11.667 22.5896 11.667 22.4574 11.667 22.193V17.8068C11.667 17.5424 11.667 17.4102 11.7038 17.2905C11.7364 17.1846 11.7898 17.0862 11.8609 17.0011C11.9412 16.905 12.052 16.833 12.2737 16.6889L19.2737 12.1389C19.5367 11.9679 19.6682 11.8825 19.8099 11.8492C19.9351 11.8198 20.0655 11.8198 20.1908 11.8492C20.3324 11.8825 20.464 11.9679 20.727 12.1389L27.727 16.6889C27.9486 16.833 28.0595 16.905 28.1398 17.0011C28.2109 17.0862 28.2643 17.1846 28.2968 17.2905C28.3337 17.4102 28.3337 17.5424 28.3337 17.8068V22.193C28.3337 22.4574 28.3337 22.5896 28.2968 22.7093C28.2643 22.8152 28.2109 22.9136 28.1398 22.9987C28.0595 23.0948 27.9486 23.1668 27.727 23.3109Z" stroke="currentColor" strokeWidth="1.66667" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* Callout — exact Figma export (callout_correct.svg): pin circle + drop line */
const CalloutGlyph = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="10 10 20 20" fill="none" style={{ display: 'block' }}>
    <circle cx="20" cy="15.7119" r="4.165" stroke="currentColor" strokeWidth="1.5" />
    <path d="M20 28.7119L20 20.7119" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
/* Direct select — filled navigation cursor */
const DirectSelectGlyph = ({ size = 22 }) => (
  <MousePointer2 size={size} fill="currentColor" />
);

// camera-popover toggles (grid / crop) — kept as small inline glyphs
const GridGlyph = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" /><path d="M4 9.5 H20 M4 14.5 H20 M9.5 4 V20 M14.5 4 V20" stroke="currentColor" strokeWidth="1.4" /></svg>
);
const CropGlyph = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 8 V6.5 A2.5 2.5 0 0 1 6.5 4 H8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M16 4 H17.5 A2.5 2.5 0 0 1 20 6.5 V8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M20 16 V17.5 A2.5 2.5 0 0 1 17.5 20 H16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M8 20 H6.5 A2.5 2.5 0 0 1 4 17.5 V16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.6" /></svg>
);
/* Section-tool popover glyphs — exact Figma exports (gumball.svg / reset.svg) + eye */
const GumballGlyph = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10.0145 1.76367V12.0934M12.6124 4.36164L10.0145 1.76367L7.41651 4.36164M18.9291 16.7447L10.9987 12.6401C10.6395 12.4406 10.4599 12.3408 10.2696 12.3017C10.1013 12.267 9.92767 12.267 9.75932 12.3017C9.56911 12.3408 9.3895 12.4406 9.03028 12.6401L1.07031 16.7447M16.3477 18.2351L18.9291 16.7447L18.0404 13.4279M3.65175 18.2351L1.07031 16.7447L1.95905 13.4279" stroke="currentColor" strokeWidth="1.67" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const ResetGlyph = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M11.6667 1.66699C11.6667 1.66699 12.3744 1.76809 15.3033 4.69702C18.2322 7.62596 18.2322 12.3747 15.3033 15.3036C14.2656 16.3414 12.9994 17.0114 11.6667 17.3138M11.6667 6.66699L11.6667 1.66699L16.6667 1.66699M8.33333 18.3335C8.33333 18.3335 7.62563 18.2324 4.6967 15.3035C1.76777 12.3745 1.76777 7.62579 4.6967 4.69686C5.73443 3.65913 7.0006 2.98907 8.33333 2.68669M8.33333 13.3337L8.33333 18.3335L3.33333 18.3337" stroke="currentColor" strokeWidth="1.67" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const EyeGlyph = ({ off = false }) => off ? (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M6.5 7.2 C4.6 8.4 3.2 10 2.5 12 C4.5 16.5 8 18.5 12 18.5 C13.7 18.5 15.3 18.1 16.7 17.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M19.5 14.5 C20.4 13.7 21 12.9 21.5 12 C19.5 7.5 16 5.5 12 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M4 4 L20 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
) : (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M2.5 12 C4.5 7.5 8 5.5 12 5.5 C16 5.5 19.5 7.5 21.5 12 C19.5 16.5 16 18.5 12 18.5 C8 18.5 4.5 16.5 2.5 12 Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" /></svg>
);

const ICON = 22;

export default function BottomToolbar({
  selectActive, penActive, commentActive, cameraActive,
  navVariant = 'navigation', penVariant = 'pen', commentVariant = 'default', cameraVariant = 'camera',
  onSelectNavigation, onSelectDirectSelect, onSelectLaser,
  onSelectDrawing, onSelectPen, onSelectPencil,
  onSelectComment, onSelectCamera, onSelectSection,
  penColor, setPenColor, pencilColor, setPencilColor,
  commentColor, setCommentColor,
  opacity, setOpacity,
  onCapture, cropOn, onToggleCrop,
  onUndo, onRedo, canUndo, canRedo,
}) {
  const [openMenu, setOpenMenu] = useState(null); // 'select' | 'pen' | 'comment' | 'camera' | null
  const [camGrid, setCamGrid] = useState(false);
  // Section-tool popover (UI only)
  const [sectionOn, setSectionOn] = useState(true);
  const [gumballOn, setGumballOn] = useState(false);
  const [sectionVisible, setSectionVisible] = useState(true);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!openMenu) return;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpenMenu(null); };
    const onEsc = (e) => { if (e.key === 'Escape') setOpenMenu(null); };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onEsc);
    return () => { window.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onEsc); };
  }, [openMenu]);

  const drawColor = penVariant === 'pencil' ? pencilColor : penColor;
  const setDrawColor = penVariant === 'pencil' ? setPencilColor : setPenColor;

  /* ── Tool group: 58×40 unit (40×40 icon button + 18px chevron) ── */
  const ToolGroup = ({ id, active, icon, onMain }) => (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '58px', height: '40px', flexShrink: 0 }}>
      <button
        title={id}
        onClick={() => { onMain?.(); setOpenMenu(null); }}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '40px', height: '40px', borderRadius: '10px', border: 'none',
          cursor: 'pointer', padding: 0, flexShrink: 0,
          background: active ? DS.accent : 'transparent',
          color: active ? 'var(--color-icon-inverse-light)' : 'var(--color-icon-default)',
          transition: 'background 0.12s, color 0.12s',
        }}
        onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--color-overlay-subtle)'; }}
        onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
      >
        {icon}
      </button>
      <button
        title="More"
        onClick={() => setOpenMenu((m) => (m === id ? null : id))}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '18px', height: '40px', border: 'none', borderRadius: '8px',
          cursor: 'pointer', padding: 0, flexShrink: 0,
          background: openMenu === id ? 'var(--color-overlay-medium)' : 'transparent',
          color: 'var(--color-icon-subtle)', transition: 'color 0.12s, background 0.12s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-overlay-medium)'; e.currentTarget.style.color = 'var(--color-icon-default)'; }}
        onMouseLeave={(e) => { if (openMenu !== id) e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-icon-subtle)'; }}
      >
        <ChevronDown size={16} />
      </button>
    </div>
  );

  /* ── Undo / Redo (20×20, dim when stack empty) ── */
  const HistoryBtn = ({ icon, onClick, enabled, title }) => (
    <button
      title={title}
      onClick={() => enabled && onClick?.()}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: '36px', height: '40px', borderRadius: '10px', border: 'none',
        background: 'transparent', padding: 0, flexShrink: 0,
        cursor: enabled ? 'pointer' : 'default',
        color: enabled ? 'var(--color-icon-subtle)' : 'var(--color-icon-disabled)', transition: 'color 0.12s, background 0.12s',
      }}
      onMouseEnter={(e) => { if (enabled) { e.currentTarget.style.background = 'var(--color-overlay-subtle)'; e.currentTarget.style.color = 'var(--color-icon-default)'; } }}
      onMouseLeave={(e) => { if (enabled) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-icon-subtle)'; } }}
    >
      {icon}
    </button>
  );

  /* ── Chevron dropdown menu ── */
  const MenuRow = ({ active, icon, label, hint, onClick }) => (
    <button
      onClick={() => { onClick?.(); setOpenMenu(null); }}
      style={{
        display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
        height: '36px', padding: '0 10px', border: 'none', background: 'transparent',
        cursor: 'pointer', borderRadius: '8px', textAlign: 'left',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-overlay-subtle)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{ width: '16px', display: 'inline-flex', justifyContent: 'center', color: active ? DS.accent : 'var(--color-icon-subtle)', flexShrink: 0 }}>
        {active ? <Check size={14} strokeWidth={2.4} /> : null}
      </span>
      <span style={{ color: 'var(--color-icon-default)', display: 'inline-flex', flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, color: 'var(--color-text-default)', fontFamily: DS.font, fontWeight: 500, fontSize: '13px', whiteSpace: 'nowrap' }}>{label}</span>
      {hint && <span style={{ color: 'var(--color-text-subtle)', fontFamily: DS.font, fontSize: '12px', flexShrink: 0 }}>{hint}</span>}
    </button>
  );

  const Menu = ({ children }) => (
    <div
      className="btb-menu"
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: 'absolute', bottom: 'calc(100% + 10px)', left: '50%', transform: 'translateX(-50%)',
        background: DS.surface, borderRadius: '12px', padding: '4px', minWidth: '156px',
        boxShadow: DS.shadowLg, display: 'flex', flexDirection: 'column', gap: '1px',
      }}
    >{children}</div>
  );

  /* ── Contextual options popover ── */
  const SwatchRow = ({ value, onChange }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      {PALETTE.map((c) => {
        const on = value === c.value;
        return (
          <button key={c.id} title={c.id} onClick={() => onChange(c.value)} style={{
            width: '24px', height: '24px', borderRadius: '50%', background: c.value,
            border: on ? '2px solid #fff' : '2px solid rgba(255,255,255,0.18)',
            boxShadow: on ? '0 0 0 2px rgba(255,255,255,0.25)' : 'none',
            cursor: 'pointer', padding: 0, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'transform 0.1s, border 0.1s', transform: on ? 'scale(1.06)' : 'scale(1)',
          }}>{on && <Check size={13} color="#fff" strokeWidth={2.6} />}</button>
        );
      })}
    </div>
  );

  // Popover matches the bar's height exactly: plate(4) + surface(4) + 40px row.
  // `variant='icons'` aligns icon-button popovers (camera/section) to the bar's
  // tool inset (no extra row padding, tight gap); `'controls'` keeps swatch/slider
  // popovers a little roomier.
  const popoverShell = (children, variant = 'controls') => {
    const icons = variant === 'icons';
    return (
      <div
        className="btb-pop"
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          position: 'absolute', bottom: 'calc(100% + 4px)', left: '50%', transform: 'translateX(-50%)',
          background: DS.plate, borderRadius: '16px', padding: '4px', boxShadow: DS.shadowLg,
        }}
      >
        <div style={{ background: DS.surface, borderRadius: '12px', padding: '4px' }}>
          <div style={{ height: '40px', display: 'flex', alignItems: 'center', gap: icons ? '2px' : '8px', padding: icons ? '0' : '0 8px', whiteSpace: 'nowrap' }}>
            {children}
          </div>
        </div>
      </div>
    );
  };

  const sliderCss = `
    .btb-slider { -webkit-appearance:none; appearance:none; width:88px; height:4px; border-radius:2px; outline:none; cursor:pointer;
      background: linear-gradient(to right, var(--color-icon-default) 0%, var(--color-icon-default) var(--fill,100%), var(--color-overlay-medium) var(--fill,100%), var(--color-overlay-medium) 100%); }
    .btb-slider::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:15px; height:15px; border-radius:50%; background:var(--color-icon-default); border:none; cursor:pointer; box-shadow:0 1px 4px rgba(0,0,0,0.4); }
    .btb-slider::-moz-range-thumb { width:15px; height:15px; border-radius:50%; background:var(--color-icon-default); border:none; cursor:pointer; box-shadow:0 1px 4px rgba(0,0,0,0.4); }
    @keyframes btbPopIn { from { opacity:0; transform:translateX(-50%) translateY(6px) scale(0.96); } to { opacity:1; transform:translateX(-50%) translateY(0) scale(1); } }
    @keyframes btbMenuIn { from { opacity:0; transform:translateX(-50%) translateY(6px) scale(0.96); } to { opacity:1; transform:translateX(-50%) translateY(0) scale(1); } }
    .btb-pop { animation: btbPopIn 0.18s cubic-bezier(0.22,1,0.36,1); }
    .btb-menu { animation: btbMenuIn 0.16s cubic-bezier(0.22,1,0.36,1); }
  `;

  const camToggle = (on, onClick, glyph, title) => (
    <button title={title} onClick={onClick} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: '40px', height: '40px', borderRadius: '10px', border: 'none', cursor: 'pointer',
      padding: 0, background: on ? DS.accent : 'transparent',
      color: on ? 'var(--color-icon-inverse-light)' : 'var(--color-icon-default)', transition: 'background 0.12s',
    }}
      onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = 'var(--color-overlay-subtle)'; }}
      onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent'; }}
    >{glyph}</button>
  );

  const penPopover = penActive && !openMenu && popoverShell(
    <>
      <SwatchRow value={drawColor} onChange={setDrawColor} />
      <div style={{ width: '1px', height: '24px', background: DS.divider, margin: '0 2px' }} />
      <input
        className="btb-slider" type="range" min="0" max="100"
        value={Math.round((opacity ?? 1) * 100)}
        style={{ ['--fill']: `${Math.round((opacity ?? 1) * 100)}%` }}
        onChange={(e) => setOpacity(Number(e.target.value) / 100)}
      />
      <span style={{ color: 'var(--color-text-default)', fontFamily: DS.font, fontWeight: 500, fontSize: '12px', minWidth: '24px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {Math.round((opacity ?? 1) * 100)}
      </span>
    </>
  );

  const commentPopover = commentActive && !openMenu && popoverShell(
    <SwatchRow value={commentColor} onChange={setCommentColor} />
  );

  const cameraPopover = cameraActive && cameraVariant !== 'section' && !openMenu && popoverShell(
    <>
      {camToggle(camGrid, () => setCamGrid((v) => !v), <GridGlyph />, 'Grid')}
      <button title="Capture" onClick={() => onCapture?.()} style={{
        width: '34px', height: '34px', borderRadius: '50%', border: 'none', cursor: 'pointer',
        padding: 0, background: '#fff', boxShadow: '0 0 0 3px rgba(255,255,255,0.18)', flexShrink: 0,
        margin: '0 8px',  // keep the toggle squares from crowding the shutter
      }} />
      {camToggle(!!cropOn, () => onToggleCrop?.(), <CropGlyph />, 'Square crop')}
    </>, 'icons'
  );

  // Section-tool popover — section toggle · gumball · reset · visibility (UI only)
  const sectionPopover = cameraActive && cameraVariant === 'section' && !openMenu && popoverShell(
    <>
      {camToggle(sectionOn, () => setSectionOn((v) => !v), <SectionGlyph size={20} />, 'Section')}
      {camToggle(gumballOn, () => setGumballOn((v) => !v), <GumballGlyph />, 'Move (gumball)')}
      {camToggle(false, () => { setGumballOn(false); /* TODO: reset section plane */ }, <ResetGlyph />, 'Reset')}
      {camToggle(!sectionVisible, () => setSectionVisible((v) => !v), <EyeGlyph off={!sectionVisible} />, 'Visibility')}
    </>, 'icons'
  );

  return (
    <div ref={wrapRef} style={{
      position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
      zIndex: 50, userSelect: 'none', fontFamily: DS.font,
    }}>
      <style>{sliderCss}</style>

      {/* translucent backplate (matches top-left/right chrome) */}
      <div style={{ background: DS.plate, borderRadius: '16px', padding: '4px', boxShadow: DS.shadowLg }}>
      <div style={{
        position: 'relative',
        display: 'flex', alignItems: 'center',
        background: DS.surface, borderRadius: '12px', padding: '4px',
      }}>
        {penPopover}
        {commentPopover}
        {cameraPopover}
        {sectionPopover}

        {/* Tools group — 268px, 12px gaps */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ position: 'relative' }}>
            <ToolGroup id="select" active={selectActive}
              icon={navVariant === 'laser' ? <LaserGlyph size={ICON} /> : navVariant === 'direct' ? <DirectSelectGlyph size={ICON} /> : <MousePointer2 size={ICON} />}
              onMain={onSelectNavigation} />
            {openMenu === 'select' && (
              <Menu>
                <MenuRow active={navVariant === 'navigation'} icon={<MousePointer2 size={16} />} label="Navigation" hint="V" onClick={onSelectNavigation} />
                <MenuRow active={navVariant === 'direct'} icon={<DirectSelectGlyph size={16} />} label="Direct select" hint="⇧V" onClick={onSelectDirectSelect} />
                <MenuRow active={navVariant === 'laser'} icon={<LaserGlyph size={16} />} label="Laser pointer" hint="L" onClick={onSelectLaser} />
              </Menu>
            )}
          </div>

          <div style={{ position: 'relative' }}>
            <ToolGroup id="pen" active={penActive}
              icon={penVariant === 'pencil' ? <Pencil size={ICON} /> : <PenTool size={ICON} />}
              onMain={onSelectDrawing} />
            {openMenu === 'pen' && (
              <Menu>
                <MenuRow active={penVariant === 'pen'} icon={<PenTool size={16} />} label="Pen" hint="⇧P" onClick={onSelectPen} />
                <MenuRow active={penVariant === 'pencil'} icon={<Pencil size={16} />} label="Pencil" hint="P" onClick={onSelectPencil} />
              </Menu>
            )}
          </div>

          <div style={{ position: 'relative' }}>
            <ToolGroup id="comment" active={commentActive}
              icon={commentVariant === 'callout' ? <CalloutGlyph size={ICON} /> : <MessageSquare size={ICON} />}
              onMain={() => onSelectComment?.(commentVariant)} />
            {openMenu === 'comment' && (
              <Menu>
                <MenuRow active={commentVariant === 'default'} icon={<MessageSquare size={16} />} label="Comment" hint="C" onClick={() => onSelectComment?.('default')} />
                <MenuRow active={commentVariant === 'callout'} icon={<CalloutGlyph size={16} />} label="Callout" hint="⇧C" onClick={() => onSelectComment?.('callout')} />
              </Menu>
            )}
          </div>

          <div style={{ position: 'relative' }}>
            <ToolGroup id="camera" active={cameraActive}
              icon={cameraVariant === 'section' ? <SectionGlyph size={ICON} /> : <Camera size={ICON} />}
              onMain={onSelectCamera} />
            {openMenu === 'camera' && (
              <Menu>
                <MenuRow active={cameraVariant === 'camera'} icon={<Camera size={16} />} label="Camera" hint="S" onClick={onSelectCamera} />
                <MenuRow active={cameraVariant === 'section'} icon={<SectionGlyph size={16} />} label="Section tool" hint="⇧S" onClick={onSelectSection} />
              </Menu>
            )}
          </div>
        </div>

        {/* divider */}
        <div style={{ width: '1px', height: '26px', background: DS.divider, margin: '0 8px', flexShrink: 0 }} />

        {/* Undo / Redo — 20×20 icons */}
        <HistoryBtn icon={<Undo2 size={20} />} onClick={onUndo} enabled={!!canUndo} title="Undo" />
        <HistoryBtn icon={<Redo2 size={20} />} onClick={onRedo} enabled={!!canRedo} title="Redo" />
      </div>
      </div>
    </div>
  );
}
