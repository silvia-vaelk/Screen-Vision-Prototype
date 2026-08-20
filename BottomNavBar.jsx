import React from 'react';
import { useSpring } from './useSpring.js';

const Wordmark = ({ src, alt, onClick, height = 24 }) => {
  const [scale, setScale] = useSpring(1, { speed: 0.22 });
  const [glow, setGlow] = useSpring(0, { speed: 0.18 });

  return (
    <button
      onClick={onClick}
      onPointerEnter={() => { setScale(1.18); setGlow(1); }}
      onPointerLeave={() => { setScale(1); setGlow(0); }}
      style={{
        background: 'none', border: 'none', padding: '6px 4px', cursor: 'pointer',
        display: 'flex', alignItems: 'center',
        transform: `scale(${scale})`,
        transformOrigin: 'center center',
        filter: `drop-shadow(0 ${2 + glow * 4}px ${6 + glow * 10}px rgba(123,89,255,${0.18 + glow * 0.35}))`,
      }}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        style={{ height: `${height}px`, width: 'auto', display: 'block', userSelect: 'none', opacity: 0.55 + glow * 0.45 }}
      />
    </button>
  );
};

const BottomNavBar = ({ onClickG, onClickS }) => {
  return (
    <div
      style={{
        position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
        zIndex: 40, userSelect: 'none',
        display: 'flex', alignItems: 'center', gap: '0px',
        padding: '4px 4px',
        pointerEvents: 'auto',
      }}
    >
      <Wordmark src="/icons/Gravity.svg" alt="Gravity (G)" onClick={onClickG} />
      <Wordmark src="/icons/Sketch.svg" alt="Sketch (S)" onClick={onClickS} />
    </div>
  );
};

export default BottomNavBar;
