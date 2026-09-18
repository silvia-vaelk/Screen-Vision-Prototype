import React, { useEffect, useRef } from 'react';
import { useSpring } from './useSpring.js';
import { DS } from './tokens.js';

/* ───────────────────────────────────────────────────────────────────────────
   ToolBelt — hold-B radial tool picker, centered on screen.
   Ported from the earlier prototypes' ModeBar (same hold-key + delta-scroll
   interaction) and re-skinned onto this app's 4 bottom-toolbar tool groups
   and design tokens instead of the old role system's raster icon assets.
   ─────────────────────────────────────────────────────────────────────────── */

const CHIP = 64;       // flat icons: circular badge diameter
const CHIP_3D = 92;     // 3D icons: no badge, just a bigger floating render
const SPACING = 104;
const SCALE_REST = 0.92;
const SCALE_HOVER = 1.08;
const LIFT_HOVER = -10;

const computePositions = (modes) => {
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  const totalWidth = (modes.length - 1) * SPACING;
  const leftX = cx - totalWidth / 2;
  return modes.map((_, i) => ({ x: leftX + i * SPACING, y: cy }));
};

const ToolChip = ({ mode, targetX, targetY, isHovered, onHover, onCommit }) => {
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;

  const [posVals, setPosVals] = useSpring([cx, cy], { speed: 0.28 });
  const [animVals, setAnimVals] = useSpring([SCALE_REST, 0, 0], { speed: 0.28 });

  useEffect(() => { setPosVals([targetX, targetY]); }, [targetX, targetY, setPosVals]);
  useEffect(() => {
    setAnimVals([isHovered ? SCALE_HOVER : SCALE_REST, isHovered ? LIFT_HOVER : 0, isHovered ? 1 : 0]);
  }, [isHovered, setAnimVals]);

  const [curX, curY] = posVals;
  const [scale, liftY, labelOp] = animVals;
  const Icon = typeof mode.icon === 'string' ? null : mode.icon;
  const boxSize = Icon ? CHIP : CHIP_3D;

  return (
    <div
      onPointerEnter={() => onHover(mode.id)}
      onPointerLeave={() => onHover(null)}
      onClick={() => onCommit(mode.id)}
      style={{
        position: 'absolute', left: `${curX}px`, top: `${curY + liftY}px`,
        transform: `translate(-50%, -50%) scale(${scale})`,
        cursor: 'pointer', pointerEvents: 'auto', userSelect: 'none',
      }}
    >
      {isHovered && (
        <div style={{
          // Clear of the icon (flat's circular badge included) with room to spare —
          // was touching the badge's bottom edge at small gaps.
          position: 'absolute', left: '50%', top: `${boxSize + 22}px`,
          transform: `translateX(-50%) translateY(${(1 - labelOp) * -6}px)`,
          background: 'var(--color-surface-content-default)', border: `1px solid ${DS.borderLight}`,
          color: 'var(--color-text-default)', fontFamily: DS.font, fontSize: '12px', fontWeight: 500,
          borderRadius: '999px', padding: '5px 12px', whiteSpace: 'nowrap',
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)', opacity: labelOp, pointerEvents: 'none',
        }}>{mode.label}</div>
      )}
      {Icon ? (
        <div style={{
          width: `${CHIP}px`, height: `${CHIP}px`, borderRadius: '50%', overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: isHovered ? DS.accent : DS.surface,
          boxShadow: isHovered ? '0 6px 20px rgba(0,0,0,0.28)' : '0 2px 10px rgba(0,0,0,0.18)',
          color: isHovered ? DS.white : 'var(--color-icon-default)',
          transition: 'background 0.12s, color 0.12s, box-shadow 0.12s',
        }}>
          <Icon size={26} />
        </div>
      ) : (
        // 3D icons float free — no circular badge behind them, just the render
        // itself with a soft drop shadow, closer to the reference screenshots.
        <div style={{
          width: `${CHIP_3D}px`, height: `${CHIP_3D}px`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <img
            src={mode.icon}
            draggable={false}
            style={{
              width: `${(mode.iconScale ?? 0.68) * 100}%`,
              height: `${(mode.iconScale ?? 0.68) * 100}%`,
              objectFit: 'contain', display: 'block', pointerEvents: 'none',
              filter: isHovered
                ? 'drop-shadow(0 8px 16px rgba(0,0,0,0.35))'
                : 'drop-shadow(0 4px 10px rgba(0,0,0,0.22))',
              transition: 'filter 0.12s',
            }}
          />
        </div>
      )}
    </div>
  );
};

if (typeof document !== 'undefined' && !document.getElementById('toolbelt-style')) {
  const s = document.createElement('style');
  s.id = 'toolbelt-style';
  s.textContent = `
    @keyframes toolBeltFadeIn {
      from { opacity: 0; backdrop-filter: blur(0px); -webkit-backdrop-filter: blur(0px); }
      to   { opacity: 1; backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); }
    }
  `;
  document.head.appendChild(s);
}

const ToolBelt = ({ open, hovered, modes, onHover, onCommit }) => {
  const list = modes || [];
  const positionsRef = useRef([]);
  positionsRef.current = computePositions(list);

  if (!open || list.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 200, userSelect: 'none',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse 70% 55% at 50% 50%, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.06) 55%, transparent 100%)',
        backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        animation: 'toolBeltFadeIn 0.2s ease forwards', pointerEvents: 'none',
      }} />
      {list.map((m, i) => (
        <ToolChip
          key={m.id}
          mode={m}
          targetX={positionsRef.current[i].x}
          targetY={positionsRef.current[i].y}
          isHovered={hovered === m.id}
          onHover={onHover}
          onCommit={onCommit}
        />
      ))}
    </div>
  );
};

export default ToolBelt;
