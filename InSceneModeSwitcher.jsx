import React, { useState, useEffect, useRef } from 'react';

const FONT = "'Inter', sans-serif";

const MODES = [
  {
    id: 'view',
    label: 'Viewing',
    desc: 'Navigate, laser pointer',
    dotColor: '#92F5B5',
    outerColor: '#D3FAE3',
    visorColor: '#92F5B5',
    rowBg: '#D3FAE3',
    activeBg: '#92F5B5',
    icon: (stroke) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M2.017 10.594C1.903 10.415 1.847 10.325 1.815 10.186C1.791 10.082 1.791 9.918 1.815 9.814C1.847 9.675 1.903 9.585 2.017 9.406C2.955 7.921 5.746 4.167 10 4.167C14.255 4.167 17.046 7.921 17.984 9.406C18.097 9.585 18.154 9.675 18.186 9.814C18.21 9.918 18.21 10.082 18.186 10.186C18.154 10.325 18.097 10.415 17.984 10.594C17.046 12.079 14.255 15.833 10 15.833C5.746 15.833 2.955 12.079 2.017 10.594Z" stroke={stroke} strokeWidth="1.667" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M10 12.5C11.381 12.5 12.5 11.381 12.5 10C12.5 8.619 11.381 7.5 10 7.5C8.619 7.5 7.5 8.619 7.5 10C7.5 11.381 8.619 12.5 10 12.5Z" stroke={stroke} strokeWidth="1.667" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: 'review',
    label: 'Reviewing',
    desc: 'Comment, redline, screenshot',
    dotColor: '#FFBC3A',
    outerColor: '#FFDD9C',
    visorColor: '#FFBC3A',
    rowBg: '#FFDD9C',
    activeBg: '#FFBC3A',
    icon: (stroke) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M6.666 7.917H10M6.666 10.833H12.5M10.416 16.667C14.328 16.667 17.499 13.495 17.499 9.583C17.499 5.671 14.328 2.5 10.416 2.5C6.504 2.5 3.332 5.671 3.332 9.583C3.332 10.375 3.462 11.136 3.702 11.847C3.792 12.115 3.837 12.248 3.845 12.351C3.853 12.453 3.847 12.524 3.822 12.623C3.797 12.722 3.74 12.826 3.628 13.034L2.265 15.557C2.071 15.917 1.973 16.097 1.995 16.236C2.014 16.357 2.085 16.463 2.19 16.527C2.31 16.6 2.513 16.579 2.92 16.537L7.188 16.096C7.317 16.083 7.382 16.076 7.44 16.078C7.498 16.08 7.539 16.086 7.596 16.099C7.653 16.112 7.725 16.14 7.87 16.195C8.66 16.5 9.518 16.667 10.416 16.667Z" stroke={stroke} strokeWidth="1.667" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: 'create',
    label: 'Creating',
    desc: 'Edit, create, delete',
    dotColor: '#6530F7',
    outerColor: '#9885FF',
    visorColor: '#6530F7',
    rowBg: '#9885FF',
    activeBg: '#6530F7',
    icon: (stroke) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M9.166 3.333H5.666C4.266 3.333 3.566 3.333 3.031 3.606C2.561 3.845 2.178 4.228 1.939 4.698C1.666 5.233 1.666 5.933 1.666 7.333V14.333C1.666 15.733 1.666 16.433 1.939 16.968C2.178 17.439 2.561 17.821 3.031 18.061C3.566 18.333 4.266 18.333 5.666 18.333H12.666C14.066 18.333 14.766 18.333 15.301 18.061C15.771 17.821 16.154 17.439 16.393 16.968C16.666 16.433 16.666 15.733 16.666 14.333V10.833M6.666 13.333H8.061C8.469 13.333 8.673 13.333 8.865 13.287C9.035 13.246 9.197 13.179 9.346 13.088C9.515 12.985 9.659 12.84 9.947 12.552L17.916 4.583C18.606 3.893 18.606 2.774 17.916 2.083C17.226 1.393 16.106 1.393 15.416 2.083L7.447 10.052C7.159 10.34 7.015 10.485 6.912 10.653C6.82 10.802 6.753 10.964 6.712 11.135C6.666 11.326 6.666 11.53 6.666 11.938V13.333Z" stroke={stroke} strokeWidth="1.667" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

const ChevronDown = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
    <path d="M3.75 5.625L7.5 9.375L11.25 5.625" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const Checkmark = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
    <path d="M12.5 3.75L5.625 10.625L2.5 7.5" stroke="white" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// The VR headset visor shape + chin arc
const HeadsetVisor = ({ color }) => (
  <div style={{ position: 'relative', width: '125px', height: '73px', flexShrink: 0 }}>
    {/* Visor rect — 125×60, rx=23.4 */}
    <div style={{
      position: 'absolute', top: 0, left: 0,
      width: '125px', height: '60px',
      borderRadius: '23px',
      background: color,
      transition: 'background 0.2s',
    }} />
    {/* Chin strap arc */}
    <svg
      width="42" height="14"
      viewBox="0 0 42 14"
      fill="none"
      style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)' }}
    >
      <path
        d="M1 1C2.938 5.837 10.101 13.51 21 13.51C31.9 13.51 39.063 5.837 41 1"
        stroke={color}
        strokeWidth="3.5"
        strokeLinecap="round"
        transition="stroke 0.2s"
      />
    </svg>
  </div>
);

const InSceneModeSwitcher = ({ activeRoleId = 'view', onRoleChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const current = MODES.find(m => m.id === activeRoleId) || MODES[0];

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener('pointerdown', handler);
    return () => window.removeEventListener('pointerdown', handler);
  }, [open]);

  const select = (id) => {
    onRoleChange?.(id);
    setOpen(false);
  };

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px',
        userSelect: 'none',
        fontFamily: FONT,
      }}
    >
      {/* Dropdown panel — appears above, slides in */}
      <div style={{
        width: '258px',
        background: '#19181A',
        borderRadius: '12px',
        padding: '8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
        opacity: open ? 1 : 0,
        transform: open ? 'translateY(0) scale(1)' : 'translateY(8px) scale(0.97)',
        pointerEvents: open ? 'auto' : 'none',
        transition: 'opacity 0.18s ease, transform 0.18s ease',
        transformOrigin: 'bottom center',
        marginBottom: '4px',
      }}>
        {MODES.map((mode) => {
          const isActive = mode.id === activeRoleId;
          return (
            <button
              key={mode.id}
              onClick={() => select(mode.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                width: '100%', padding: '8px',
                background: isActive ? '#66616B' : 'transparent',
                border: 'none', borderRadius: '8px',
                cursor: 'pointer', textAlign: 'left',
                transition: 'background 0.12s',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
            >
              {/* Icon badge — outer pastel ring + inner saturated circle */}
              <div style={{
                width: '48px', height: '48px', borderRadius: '50%',
                background: mode.rowBg, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{
                  width: '40px', height: '40px', borderRadius: '50%',
                  background: mode.activeBg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {mode.icon(mode.id === 'create' ? 'white' : '#1A1A1B')}
                </div>
              </div>

              {/* Text */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#FFFFFF', lineHeight: 1.4 }}>
                  {mode.label}
                </span>
                <span style={{ fontSize: '12px', fontWeight: '400', color: '#BCBEC4', lineHeight: 1.4 }}>
                  {mode.desc}
                </span>
              </div>

              {/* Checkmark */}
              {isActive && <Checkmark />}
            </button>
          );
        })}
      </div>

      {/* Pill button */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '0 12px', height: '40px',
          background: '#19181A', border: 'none', borderRadius: '20px',
          cursor: 'pointer', color: 'white', fontFamily: FONT,
        }}
      >
        {/* Mode dot with outer ring */}
        <div style={{
          width: '8px', height: '8px', borderRadius: '50%',
          background: current.dotColor,
          boxShadow: `0 0 0 2px ${current.outerColor}`,
          flexShrink: 0,
        }} />
        <span style={{ fontSize: '14px', fontWeight: '400', color: '#FFFFFF', whiteSpace: 'nowrap' }}>
          {current.label}
        </span>
        <ChevronDown />
      </button>

      {/* Headset visor + chin arc */}
      <HeadsetVisor color={current.visorColor} />
    </div>
  );
};

export default InSceneModeSwitcher;
