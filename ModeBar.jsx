import React, { useEffect, useRef } from 'react';
import { useSpring } from './useSpring.js';

const FONT        = "'Inter', sans-serif";
const ICON_SIZE   = 120;   // large — takes main focus
const SPACING     = 160;   // wide spread
const SCALE_REST  = 0.78;
const SCALE_HOVER = 1.1;
const LIFT_HOVER  = -18;

const computePositions = (modes) => {
  const cx = window.innerWidth  / 2;
  const cy = window.innerHeight / 2;
  const totalWidth = (modes.length - 1) * SPACING;
  const leftX = cx - totalWidth / 2;
  return modes.map((_, i) => ({ x: leftX + i * SPACING, y: cy }));
};

const ToolIcon = ({
  mode, targetX, targetY, open,
  isHovered, isActive, onHover, onCommit,
}) => {
  const cx = window.innerWidth  / 2;
  const cy = window.innerHeight / 2;

  const [posVals, setPosVals] = useSpring([cx, cy], { speed: 0.2 });
  const [animVals, setAnimVals] = useSpring([SCALE_REST, 0, 0], { speed: 0.2 });

  useEffect(() => {
    setPosVals([targetX, targetY]);
  }, [targetX, targetY, setPosVals]);

  useEffect(() => {
    setAnimVals([
      isHovered ? SCALE_HOVER : SCALE_REST,
      isHovered ? LIFT_HOVER : 0,
      isHovered && open ? 1 : 0,
    ]);
  }, [isHovered, open, setAnimVals]);

  const [curX, curY]            = posVals;
  const [scale, liftY, labelOp] = animVals;

  // All tools use the gray hover asset when the bar is open
  const iconSrc = mode.iconHover || mode.icon;

  return (
    <div
      onPointerEnter={() => onHover(mode.id)}
      onPointerLeave={() => onHover(null)}
      onClick={() => onCommit(mode.id)}
      style={{
        position: 'absolute',
        left: `${curX}px`,
        top:  `${curY + liftY}px`,
        transform: `translate(-50%, -50%) scale(${scale})`,
        cursor: 'pointer',
        pointerEvents: 'auto',
        userSelect: 'none',
      }}
    >
      {/* Hover label — tooltip pill, only visible on hovered tool */}
      {isHovered && (
        <div style={{
          position: 'absolute',
          left: '50%',
          top: `${ICON_SIZE + 12}px`,
          transform: `translateX(-50%) translateY(${(1 - labelOp) * -6}px)`,
          background: '#1a1a1b',
          borderRadius: '999px',
          padding: '4px 10px',
          fontFamily: FONT,
          fontSize: '12px',
          fontWeight: '600',
          color: '#ffffff',
          whiteSpace: 'nowrap',
          opacity: labelOp,
          pointerEvents: 'none',
          letterSpacing: '0',
          textTransform: 'none',
        }}>{mode.label}</div>
      )}

      <div style={{
        width: `${ICON_SIZE}px`,
        height: `${ICON_SIZE}px`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <img
          src={iconSrc}
          draggable={false}
          style={{
            width: `${(mode.iconScale ?? 1) * 100}%`,
            height: `${(mode.iconScale ?? 1) * 100}%`,
            objectFit: 'contain',
            display: 'block',
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
};

// Inject fade-in keyframe once
if (typeof document !== 'undefined' && !document.getElementById('modebar-style')) {
  const s = document.createElement('style');
  s.id = 'modebar-style';
  s.textContent = `
    @keyframes modeBarFadeIn {
      from { opacity: 0; backdrop-filter: blur(0px); -webkit-backdrop-filter: blur(0px); }
      to   { opacity: 1; backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); }
    }
  `;
  document.head.appendChild(s);
}

const ModeBar = ({ open, hovered, activeMode, modes, onHover, onCommit, onBackdropClick }) => {
  const currentModes = modes || [];
  const positionsRef = useRef([]);
  positionsRef.current = computePositions(currentModes);

  // Hover driven externally via the `hovered` prop (App.jsx owns the pointermove listener)

  if (!open || currentModes.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', left: 0, top: 0,
      width: '100vw', height: '100vh',
      pointerEvents: 'none', zIndex: 1000, userSelect: 'none',
    }}>
      {/* Full-screen modal backdrop — captures every pointer event so nothing
          behind the menu can be interacted with. Clicking it dismisses the menu. */}
      <div
        onPointerDown={(e) => { e.stopPropagation(); onBackdropClick?.(); }}
        style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse 70% 55% at 50% 50%, rgba(0,0,0,0.16) 0%, rgba(0,0,0,0.05) 55%, transparent 100%)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          opacity: 1,
          animation: 'modeBarFadeIn 0.4s ease forwards',
          pointerEvents: 'auto',
        }}
      />
      {currentModes.map((m, i) => {
        const pos = positionsRef.current[i];
        return (
          <ToolIcon
            key={m.id}
            mode={m}
            targetX={pos.x}
            targetY={pos.y}
            open={open}
            isHovered={hovered === m.id}
            isActive={m.id === activeMode}
            onHover={onHover}
            onCommit={onCommit}
          />
        );
      })}
    </div>
  );
};

export default ModeBar;
