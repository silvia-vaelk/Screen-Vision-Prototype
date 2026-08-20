import React, { useEffect, useRef } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { Edges, Html } from '@react-three/drei';
import * as THREE from 'three';
import { VIEWPOINTS } from './viewpoints.js';

const FONT = "'Space Grotesk', 'DM Sans', sans-serif";
const CUBE_PX = 200;
const CUBE_SIZE = 1.2;

const FACE_DEFS = [
  { id: 'front',  normal: [0, 0, 1],  label: 'Front'  },
  { id: 'back',   normal: [0, 0, -1], label: 'Back'   },
  { id: 'right',  normal: [1, 0, 0],  label: 'Right'  },
  { id: 'left',   normal: [-1, 0, 0], label: 'Left'   },
  { id: 'top',    normal: [0, 1, 0],  label: 'Top'    },
  { id: 'bottom', normal: [0, -1, 0], label: 'Bottom' },
];

const faceQuaternion = (normal) => {
  const q = new THREE.Quaternion();
  q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...normal).normalize());
  return q;
};

const CubeMesh = ({ hovered, onHover, onCommit, groupRef }) => (
  <group ref={groupRef}>
    <mesh>
      <boxGeometry args={[CUBE_SIZE, CUBE_SIZE, CUBE_SIZE]} />
      <meshPhysicalMaterial
        transparent opacity={0.12} roughness={0.35} metalness={0.0}
        transmission={0.85} thickness={0.4} ior={1.3} color="#ffffff"
        depthWrite={false}
      />
      <Edges threshold={1} color="rgba(108,92,231,0.7)" />
    </mesh>

    {FACE_DEFS.map((face) => {
      const isHover = hovered === face.id;
      const q = faceQuaternion(face.normal);
      const offset = new THREE.Vector3(...face.normal).multiplyScalar(CUBE_SIZE / 2 + 0.001);
      return (
        <mesh
          key={face.id}
          position={offset.toArray()}
          quaternion={q}
          onPointerEnter={(e) => { e.stopPropagation(); onHover(face.id); }}
          onPointerLeave={(e) => { e.stopPropagation(); onHover(null); }}
          onClick={(e) => { e.stopPropagation(); onCommit(face.id); }}
        >
          <planeGeometry args={[CUBE_SIZE * 0.98, CUBE_SIZE * 0.98]} />
          <meshStandardMaterial
            transparent
            opacity={isHover ? 0.4 : 0.08}
            color={isHover ? '#a29bfe' : '#ffffff'}
            emissive={isHover ? '#6c5ce7' : '#000000'}
            emissiveIntensity={isHover ? 0.6 : 0}
            roughness={0.6} metalness={0}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
          {isHover && (
            <Html center distanceFactor={undefined} style={{ pointerEvents: 'none' }}>
              <div style={{
                fontFamily: FONT,
                fontSize: '11px',
                fontWeight: '600',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: '#ffffff',
                textShadow: '0 1px 6px rgba(28,28,30,0.55)',
                whiteSpace: 'nowrap',
              }}>{face.label}</div>
            </Html>
          )}
        </mesh>
      );
    })}
  </group>
);

const SceneLights = () => (
  <>
    <ambientLight intensity={0.55} />
    <directionalLight position={[3, 5, 4]} intensity={0.9} color="#ffffff" />
    <directionalLight position={[-3, -2, -3]} intensity={0.35} color="#a29bfe" />
  </>
);

const CubeStage = ({ hovered, onHover, onCommit, projection }) => {
  const groupRef = useRef();
  const { gl } = useThree();
  const dragRef = useRef({ active: false, lastX: 0, lastY: 0 });
  const inertiaRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const el = gl.domElement;
    const onDown = (e) => {
      dragRef.current.active = true;
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastY = e.clientY;
      el.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e) => {
      if (!dragRef.current.active) return;
      const dx = e.clientX - dragRef.current.lastX;
      const dy = e.clientY - dragRef.current.lastY;
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastY = e.clientY;
      if (groupRef.current) {
        groupRef.current.rotation.y += dx * 0.01;
        groupRef.current.rotation.x += dy * 0.01;
      }
      inertiaRef.current.x = dy * 0.01;
      inertiaRef.current.y = dx * 0.01;
    };
    const onUp = (e) => {
      dragRef.current.active = false;
      try { el.releasePointerCapture?.(e.pointerId); } catch {}
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, [gl]);

  useFrame(() => {
    if (!groupRef.current) return;
    if (!dragRef.current.active) {
      groupRef.current.rotation.y += inertiaRef.current.y;
      groupRef.current.rotation.x += inertiaRef.current.x;
      inertiaRef.current.x *= 0.92;
      inertiaRef.current.y *= 0.92;
    }
  });

  return (
    <>
      <SceneLights />
      <CubeMesh hovered={hovered} onHover={onHover} onCommit={onCommit} groupRef={groupRef} />
    </>
  );
};

// Small icon button used in the control row.
const IconButton = ({ active, onClick, title, children }) => (
  <button
    onClick={onClick}
    title={title}
    style={{
      width: '28px', height: '28px', borderRadius: '8px',
      background: active ? 'rgba(108,92,231,0.18)' : 'rgba(255,255,255,0.04)',
      border: `1px solid ${active ? 'rgba(108,92,231,0.45)' : 'rgba(0,0,0,0.10)'}`,
      color: active ? '#6c5ce7' : 'rgba(28,28,30,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', padding: 0,
      transition: 'background 0.15s, color 0.15s, border-color 0.15s',
    }}
    onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = '#1c1c1e'; }}
    onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = 'rgba(28,28,30,0.6)'; }}
  >
    {children}
  </button>
);

// Icons
const IconPersp = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path d="M2 5l6-2 6 2v6l-6 2-6-2V5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    <path d="M2 5l6 2 6-2M8 7v6" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
  </svg>
);
const IconIso = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path d="M8 2l5.5 3v6L8 14l-5.5-3V5L8 2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    <path d="M2.5 5L8 8l5.5-3M8 8v6" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
  </svg>
);
const IconFind = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <circle cx="7" cy="7" r="4.2" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M10.2 10.2L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    <path d="M7 5v4M5 7h4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
  </svg>
);
const IconLock = ({ locked }) => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <rect x="3.5" y="7" width="9" height="6.5" rx="1.2" stroke="currentColor" strokeWidth="1.3"/>
    {locked
      ? <path d="M5.2 7V5.2a2.8 2.8 0 015.6 0V7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      : <path d="M5.2 7V5.2a2.8 2.8 0 014.9-1.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>}
    <circle cx="8" cy="10.3" r="0.9" fill="currentColor"/>
  </svg>
);

const ViewpointCube = ({
  open, x, y, centered, hovered, onHover, onCommit,
  projection, onToggleProjection,
  onFindSketch,
  verticalLocked, onToggleVerticalLock,
}) => {
  const [hoveredBtn, setHoveredBtn] = React.useState(null);
  if (!open) return null;

  const wrapperStyle = centered
    ? { left: '50%', bottom: '90px', transform: 'translateX(-50%)' }
    : { left: `${x - CUBE_PX / 2}px`, top: `${y - CUBE_PX / 2}px` };

  const isIso = projection === 'iso';

  const controlItems = [
    {
      key: 'proj',
      node: (
        <IconButton
          active={isIso}
          onClick={() => onToggleProjection?.()}
          title={isIso ? 'Isometric (click for perspective)' : 'Perspective (click for isometric)'}
        >
          {isIso ? <IconIso /> : <IconPersp />}
        </IconButton>
      ),
      label: isIso ? 'Isometric' : 'Perspective',
    },
    {
      key: 'find',
      node: (
        <IconButton onClick={() => onFindSketch?.()} title="Find my sketch (zoom to fit)">
          <IconFind />
        </IconButton>
      ),
      label: 'Find Sketch',
    },
    {
      key: 'lock',
      node: (
        <IconButton
          active={!!verticalLocked}
          onClick={() => onToggleVerticalLock?.()}
          title={verticalLocked ? 'Vertical rotation locked' : 'Lock vertical rotation'}
        >
          <IconLock locked={!!verticalLocked} />
        </IconButton>
      ),
      label: verticalLocked ? 'Locked' : 'Vert. Lock',
    },
  ];

  return (
    <div
      onPointerDown={e => e.stopPropagation()}
      style={{
        position: 'fixed', zIndex: 60, userSelect: 'none',
        width: `${CUBE_PX}px`,
        ...wrapperStyle,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
        pointerEvents: 'auto',
      }}
    >
      <div style={{ width: '100%', height: `${CUBE_PX}px`, cursor: 'grab' }}>
        <Canvas
          key={isIso ? 'iso' : 'persp'}
          gl={{ alpha: true, antialias: true, premultipliedAlpha: false }}
          orthographic={isIso}
          camera={isIso
            ? { position: [2, 1.6, 2.4], zoom: 70, near: 0.1, far: 100 }
            : { position: [2, 1.6, 2.4], fov: 35 }
          }
          style={{ background: 'transparent' }}
        >
          <CubeStage hovered={hovered} onHover={onHover} onCommit={onCommit} projection={projection} />
        </Canvas>
      </div>

      <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
        {controlItems.map(({ key, node, label }) => (
          <div
            key={key}
            style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onPointerEnter={() => setHoveredBtn(key)}
            onPointerLeave={() => setHoveredBtn(null)}
          >
            {node}
            {hoveredBtn === key && (
              <div style={{
                position: 'absolute', bottom: '100%', left: '50%',
                transform: 'translateX(-50%) translateY(-4px)',
                background: 'rgba(28,28,30,0.82)', color: '#fff',
                fontFamily: FONT, fontSize: '9px', fontWeight: '500',
                letterSpacing: '0.06em',
                padding: '3px 7px', borderRadius: '5px',
                whiteSpace: 'nowrap', pointerEvents: 'none',
                boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
              }}>{label}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ViewpointCube;
