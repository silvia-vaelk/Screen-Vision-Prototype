import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, Html, ContactShadows, Line, TransformControls } from '@react-three/drei';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { MessageSquare as NotesIcon, PenTool as SketchIcon } from 'lucide-react';
import LayersDrawer from './LayersDrawer.jsx';
import BottomToolbar from './BottomToolbar.jsx';
import { DS } from './tokens.js';
import ViewpointCube from './ViewpointCube.jsx';
import ViewpointCubeV2 from './ViewpointCubeV2.jsx';
import LaserTrail from './LaserTrail.jsx';
import { VIEWPOINTS, DEFAULT_MODE, PRESENTATION_VIEWS, PRES_INTERVAL } from './viewpoints.js';

const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.matchMedia('(pointer: coarse)').matches;

// Layout variant — set via ?layout=a/b/c in the URL (default: a)
const LAYOUT = (new URLSearchParams(window.location.search).get('layout') || 'a').toLowerCase();

const ThemeToggle = () => {
  const [dark, setDark] = useState(document.documentElement.classList.contains('dark'));
  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    setDark(next);
  };
  return (
    <button
      onClick={toggle}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{
        position: 'fixed', bottom: '72px', right: '16px', zIndex: 9999,
        width: '36px', height: '36px', borderRadius: '10px', border: 'none',
        background: 'rgba(128,128,128,0.25)', backdropFilter: 'blur(8px)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '16px', transition: 'background 0.2s',
      }}
    >
      {dark ? '☀️' : '🌙'}
    </button>
  );
};

const UI = {
  bg:           'var(--color-surface-page-default)',
  bgPanel:      'var(--color-surface-content-default)',
  bgRow:        'rgba(0,0,0,0.03)',
  bgHover:      'rgba(0,0,0,0.05)',
  border:       'var(--color-overlay-medium)',
  borderAccent: 'rgba(108,92,231,0.25)',
  gold:         'var(--color-background-accent-default)',
  goldDim:      'rgba(108,92,231,0.5)',
  goldFaint:    'rgba(108,92,231,0.06)',
  text:         'var(--color-text-default)',
  textMid:      'var(--color-text-subtle)',
  textDim:      'var(--color-text-disabled)',
  red:          'var(--color-brand-raspberry)',
  font: "'Inter', sans-serif",
  mono: "'DM Mono', monospace",
  barBg:        'var(--color-surface-content-default)',
  barBorder:    'var(--color-overlay-medium)',
  barText:      'var(--color-text-default)',
  barTextDim:   'var(--color-text-disabled)',
  purple:       'var(--color-background-accent-default)',
  purpleLight:  'var(--color-primary-400)',
  purpleDim:    'rgba(108,92,231,0.3)',
  glass:        'var(--color-surface-float-default)',
  glassBorder:  'var(--color-border-default)',
  glassBlur:    'blur(20px)',
  panelShadow:  '0 8px 40px rgba(0,0,0,0.12), 0 2px 12px var(--color-overlay-divider)',
  radius: '18px',
  unreadRowBg:   'rgba(214, 156, 45, 0.07)',
  unreadAccent:  'rgba(200, 130, 32, 0.85)',
  unreadBadgeBg: 'rgba(214, 156, 45, 0.18)',
};

const DEFAULT_SCENE = {
  ambientIntensity: 0.4, sunIntensity: 2.0, sunColor: '#fff5e0', bounceIntensity: 0.8,
  envPreset: 'studio', skyColor: '#c7c7c7', bgColor: '#c7c7c7', fogColor: '#c7c7c7', fogNear: 5.5, fogFar: 20,
  floorColor: '#808080', floorRoughness: 0.7, floorMetalness: 0.0, tonemapping: 0.8, autoRotateSpeed: 0.6,
  cameraFov: 47,
};

const DEFAULT_CAMERA = { position: [3, 2.5, 4], target: [0, 1.0, 0] };
const AXIS_COLORS = { x: '#e05a5a', y: '#6abf7b', z: '#5b8fe0' };
const SEEN_PINS_STORAGE_KEY = '3d-viewer-seen-pin-ids';

/** Data-URL cursors for Comments mode (hotspot x y in px, then CSS fallback). */
const svgDataCursor = (body, hotX, hotY) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${body}</svg>`)}") ${hotX} ${hotY}, crosshair`;

/* Pin hover cursor = same disc + flat + as in-canvas previews; soft shadow like UI chip. */
const CURSOR_COMMENT_ON_MODEL = svgDataCursor(
  '<defs><filter id="cmPinShadow" x="-45%" y="-45%" width="190%" height="190%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.6" flood-color="#000000" flood-opacity="0.26"/></filter></defs><g filter="url(#cmPinShadow)"><circle cx="16" cy="16" r="11" fill="#6c5ce7"/><rect x="15" y="12" width="2" height="8" fill="#ffffff"/><rect x="12" y="15" width="8" height="2" fill="#ffffff"/></g>',
  16, 16,
);
const CURSOR_COMMENT_IDLE = svgDataCursor(
  '<circle cx="16" cy="16" r="11" fill="none" stroke="#6c5ce7" stroke-width="1.5"/><rect x="15" y="12" width="2" height="8" fill="#6c5ce7"/><rect x="12" y="15" width="8" height="2" fill="#6c5ce7"/>',
  16, 16,
);
/* Orbit / pan: neutral black, DCC-style. Rotate = two curved arrows forming a
   circular loop (the universal "rotate" glyph); pan = four-way move. White halo
   under each so they stay legible over light model surfaces and the floor. */
const CURSOR_ORBIT_ROTATE = svgDataCursor(
  // white halo (drawn first, underneath)
  '<g fill="none" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round" opacity="0.95"><path d="M8.5 11.5 A9 9 0 0 1 23.5 11.5"/><path d="M23.5 20.5 A9 9 0 0 1 8.5 20.5"/></g>' +
  '<path d="M21 10 L26 12 L23 16 Z" fill="none" stroke="#ffffff" stroke-width="3" stroke-linejoin="round"/>' +
  '<path d="M11 22 L6 20 L9 16 Z" fill="none" stroke="#ffffff" stroke-width="3" stroke-linejoin="round"/>' +
  // black glyph on top
  '<g fill="none" stroke="#171717" stroke-width="2.2" stroke-linecap="round"><path d="M8.5 11.5 A9 9 0 0 1 23.5 11.5"/><path d="M23.5 20.5 A9 9 0 0 1 8.5 20.5"/></g>' +
  '<path d="M21 10 L26 12 L23 16 Z" fill="#171717"/>' +
  '<path d="M11 22 L6 20 L9 16 Z" fill="#171717"/>',
  16, 16,
);
const CURSOR_ORBIT_PAN = svgDataCursor(
  '<path d="M16 4.5l-2.8 4h5.6L16 4.5zM16 27.5l2.8-4h-5.6l2.8 4zM4.5 16l4 2.8v-5.6l-4 2.8zM27.5 16l-4-2.8v5.6l4-2.8z" fill="#171717"/><line x1="16" y1="9" x2="16" y2="23" stroke="#171717" stroke-width="1.5" stroke-linecap="round"/><line x1="9" y1="16" x2="23" y2="16" stroke="#171717" stroke-width="1.5" stroke-linecap="round"/>',
  16, 16,
);
/* Pan modifier (Shift OR Space held) — module-level so the in-scene cursor
   components can read it live without prop drilling. Set by App's pan-modifier
   effect; `e.shiftKey` alone is true only for Shift, so cursors check this too. */
const PAN_MOD = { active: false };
/* Pen cursors for Annotation (redline) mode — filled when on surface, outline when off. */
const CURSOR_ANNOTATE_ON_MODEL = svgDataCursor(
  '<path d="M22 4L28 10L10 28L4 28L4 22Z" fill="#6c5ce7"/>' +
  '<path d="M4 28L4 22L6 26Z" fill="#4a3abd"/>' +
  '<path d="M22 4L28 10L30 8L24 2Z" fill="#a29bfe"/>' +
  '<line x1="24" y1="7" x2="10" y2="23" stroke="rgba(255,255,255,0.3)" stroke-width="1.2" stroke-linecap="round"/>',
  4, 28,
);
const CURSOR_ANNOTATE_IDLE = svgDataCursor(
  '<path d="M22 4L28 10L10 28L4 28L4 22Z" fill="none" stroke="#6c5ce7" stroke-width="1.5" stroke-linejoin="round"/>' +
  '<path d="M22 4L28 10L30 8L24 2Z" fill="none" stroke="#6c5ce7" stroke-width="1.5" stroke-linejoin="round"/>',
  4, 28,
);
/* Pen (Bézier) tool cursors — pen nib shape, filled on surface / outline off */
const CURSOR_PEN_ON_MODEL = svgDataCursor(
  '<path d="M21 3L29 11L13 27L4 27L4 20Z" fill="#6c5ce7" stroke="#4a3abd" stroke-width="0.5" stroke-linejoin="round"/>' +
  '<path d="M4 27L4 20L7 25Z" fill="#4a3abd"/>' +
  '<path d="M21 3L29 11L31 9L23 1Z" fill="#a29bfe"/>' +
  '<line x1="23" y1="7" x2="9" y2="23" stroke="rgba(255,255,255,0.35)" stroke-width="1.2" stroke-linecap="round"/>' +
  '<circle cx="4" cy="27" r="2.5" fill="#ffffff" opacity="0.9"/>',
  4, 27,
);
const CURSOR_PEN_IDLE = svgDataCursor(
  '<path d="M21 3L29 11L13 27L4 27L4 20Z" fill="none" stroke="#6c5ce7" stroke-width="1.5" stroke-linejoin="round"/>' +
  '<path d="M21 3L29 11L31 9L23 1Z" fill="none" stroke="#6c5ce7" stroke-width="1.5" stroke-linejoin="round"/>' +
  '<circle cx="4" cy="27" r="2" fill="none" stroke="#6c5ce7" stroke-width="1.5"/>',
  4, 27,
);

/* Custom file-based tool cursors (assets in /public/icons). Hotspot = tip of each
   icon: pen nib at top-left (~3,3), pencil point at bottom-left (~3,21), comment
   bubble tail at bottom-left (~5,21). Unfilled while hovering, filled while
   drawing/placing (pointer down). */
const fileCursor = (file, hotX, hotY) => `url("/icons/${file}") ${hotX} ${hotY}, crosshair`;
const CURSOR_PEN_HOVER     = fileCursor('Pen-unfilled.svg', 3, 3);
const CURSOR_PEN_DRAW      = fileCursor('Pen-filled.svg', 3, 3);
const CURSOR_PENCIL_HOVER  = fileCursor('Pencil-unfilled.svg', 3, 21);
const CURSOR_PENCIL_DRAW   = fileCursor('Pencil-filled.svg', 3, 21);
const CURSOR_COMMENT_HOVER = fileCursor('comment_unfilled.svg', 5, 21);
const CURSOR_COMMENT_PLACE = fileCursor('comment_filled.svg', 5, 21);
const CURSOR_TEXT = `url("/icons/text_cursor.svg") 12 4, text`;

const makeEmojiCursor = (emoji) => {
  const size = 40;
  try {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    ctx.font = `${Math.round(size * 0.82)}px serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(emoji, size / 2, size / 2);
    return `url("${c.toDataURL()}") ${size / 2} ${size / 2}, auto`;
  } catch { return 'crosshair'; }
};

const firstInitialFromAuthorOrLabel = (author, label) => {
  const src = String(author || label || '?').trim();
  const m = src.match(/[A-Za-zÀ-ÿ0-9]/);
  return m ? m[0].toUpperCase() : '?';
};

// Global ref for shoe meshes so redline raycaster can find them
const shoeModelMeshes = { current: [] };
// True while the selection gumball is hovered/dragged, so box-select doesn't also fire.
const gizmoBusyRef = { current: false };

/* ═══════════════════════════════════════════════════════════════════════════════
   FBX DROP ZONE — shown when no model is loaded yet
   ═══════════════════════════════════════════════════════════════════════════════ */
const FbxDropZone = ({ onModelLoaded }) => {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef();

  const processFile = (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.fbx')) {
      setError('Please drop an FBX file.');
      return;
    }
    setError(null);
    setLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      onModelLoaded({ name: file.name, dataUrl: e.target.result });
    };
    reader.onerror = () => { setError('Failed to read file.'); setLoading(false); };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    processFile(e.dataTransfer.files[0]);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f0f13 0%, #1a1a24 50%, #0f0f13 100%)',
      fontFamily: UI.font, zIndex: 9999,
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&family=Space+Grotesk:wght@400;500;600&display=swap" rel="stylesheet" />

      {/* Subtle grid background */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.04,
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }} />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '32px', position: 'relative' }}>
        {/* Wordmark */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '11px', letterSpacing: '0.3em', color: UI.purpleLight, textTransform: 'uppercase', marginBottom: '10px', fontWeight: '500' }}>
            3D Showcase · Design Review
          </div>
          <div style={{ fontSize: '32px', fontWeight: '300', color: DS.white, letterSpacing: '-0.02em', lineHeight: 1 }}>
            Load your model
          </div>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          style={{
            width: '360px', height: '220px', borderRadius: '20px',
            border: `1.5px dashed ${dragging ? UI.purpleLight : 'rgba(255,255,255,0.15)'}`,
            background: dragging ? 'rgba(124,58,237,0.08)' : 'rgba(255,255,255,0.03)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px',
            cursor: 'pointer', transition: 'all 0.2s ease',
            boxShadow: dragging ? `0 0 40px rgba(124,58,237,0.15)` : 'none',
          }}
        >
          <input ref={inputRef} type="file" accept=".fbx" style={{ display: 'none' }}
            onChange={(e) => processFile(e.target.files[0])} />

          {loading ? (
            <>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              <div style={{ width: '36px', height: '36px', border: '2px solid rgba(255,255,255,0.1)', borderTop: `2px solid ${UI.purpleLight}`, borderRadius: '50%', animation: 'spin 0.9s linear infinite' }} />
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em' }}>Reading file…</div>
            </>
          ) : (
            <>
              {/* Cube icon */}
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <path d="M24 4L44 14V34L24 44L4 34V14L24 4Z" stroke={dragging ? UI.purpleLight : 'rgba(255,255,255,0.25)'} strokeWidth="1.5" strokeLinejoin="round" fill="none" style={{ transition: 'stroke 0.2s' }} />
                <path d="M24 4L24 44M4 14L44 14M4 34L44 34" stroke={dragging ? UI.purpleLight : 'rgba(255,255,255,0.1)'} strokeWidth="1" strokeLinejoin="round" style={{ transition: 'stroke 0.2s' }} />
              </svg>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.75)', fontWeight: '500', marginBottom: '6px' }}>
                  {dragging ? 'Drop to load' : 'Drop FBX here'}
                </div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.05em' }}>
                  or click to browse
                </div>
              </div>
            </>
          )}
        </div>

        {error && (
          <div style={{ fontSize: '12px', color: '#f87171', letterSpacing: '0.05em', background: 'rgba(220,38,38,0.1)', padding: '8px 16px', borderRadius: '8px', border: '1px solid rgba(220,38,38,0.2)' }}>
            {error}
          </div>
        )}

        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.1em', textAlign: 'center', lineHeight: 1.8 }}>
          FBX files only · Processed locally, not uploaded
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   GL UPDATER — fixes tone mapping not reacting to scene state changes
   ═══════════════════════════════════════════════════════════════════════════════ */
const GlUpdater = ({ tonemapping, cameraFov }) => {
  const { gl, camera } = useThree();
  useEffect(() => {
    gl.toneMappingExposure = tonemapping;
  }, [gl, tonemapping]);
  useEffect(() => {
    if (cameraFov && camera.isPerspectiveCamera && camera.fov !== cameraFov) {
      camera.fov = cameraFov;
      camera.updateProjectionMatrix();
    }
  }, [camera, cameraFov]);
  return null;
};

/* ═══════════════════════════════════════════════════════════════════════════════
   SHOE MODEL
   ═══════════════════════════════════════════════════════════════════════════════ */
const ShoeModel = ({ onLoaded, modelPosition, onBoundsReady, fbxDataUrl, onError }) => {
  const groupRef = useRef();
  const [model, setModel] = useState(null);

  useEffect(() => {
    if (!fbxDataUrl) return;
    shoeModelMeshes.current = [];
    const loader = new FBXLoader();

    const processModel = (fbx) => {
      const wrapper = new THREE.Group();
      wrapper.add(fbx);
      fbx.rotation.x = -Math.PI / 2;
      wrapper.updateMatrixWorld(true);

      const box = new THREE.Box3().setFromObject(wrapper);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const scaleFactor = 3.5 / maxDim;
      wrapper.scale.setScalar(scaleFactor);
      wrapper.updateMatrixWorld(true);

      const box2 = new THREE.Box3().setFromObject(wrapper);
      const center2 = box2.getCenter(new THREE.Vector3());
      wrapper.position.x -= center2.x;
      wrapper.position.z -= center2.z;
      wrapper.position.y -= box2.min.y;
      wrapper.updateMatrixWorld(true);

      const finalBox = new THREE.Box3().setFromObject(wrapper);
      if (onBoundsReady) onBoundsReady(finalBox);

      const meshes = [];
      wrapper.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = !isMobile;
          child.receiveShadow = !isMobile;
          child.userData.isShoe = true;
          meshes.push(child);
          if (child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach(m => {
              m.envMapIntensity = isMobile ? 1.2 : 2.5;
              // DoubleSide fixes FBX meshes with inverted normals that would otherwise
              // be invisible from the outside due to Three.js's default FrontSide culling.
              m.side = THREE.DoubleSide;
            });
          }
        }
      });
      shoeModelMeshes.current = meshes;
      setModel(wrapper);
      if (onLoaded) onLoaded();
    };

    loader.load(fbxDataUrl, processModel, undefined, (err) => {
      console.error('Model load error:', err);
      if (onError) onError('Failed to load model. The file may be corrupt or unsupported.');
      if (onLoaded) onLoaded();
    });
  }, [fbxDataUrl]);

  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.position.set(modelPosition[0], modelPosition[1], modelPosition[2]);
    }
  }, [modelPosition]);

  if (!model) return null;
  return <primitive ref={groupRef} object={model} />;
};

/* ═══════════════════════════════════════════════════════════════════════════════
   GROUND
   ═══════════════════════════════════════════════════════════════════════════════ */
const Ground = ({ color, roughness, metalness }) => (
  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0]} receiveShadow>
    <planeGeometry args={[30, 30]} />
    <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} envMapIntensity={0} />
  </mesh>
);

/** 12×12 viewBox: flat white + with square ends (matches comment-hover cursor & screenshot). */
const PinPlusIcon12 = () => (
  <>
    <rect x="5.25" y="1" width="1.5" height="10" fill="#ffffff" />
    <rect x="1" y="5.25" width="10" height="1.5" fill="#ffffff" />
  </>
);

const PinNumberBadge = ({ number }) => (
  <text
    x="6" y="8.5"
    textAnchor="middle"
    fontSize={number > 9 ? "6" : "7"}
    fontWeight="700"
    fontFamily="system-ui, sans-serif"
    fill="#ffffff"
    style={{ userSelect: 'none' }}
  >{number}</text>
);

/* ═══════════════════════════════════════════════════════════════════════════════
   PIN SNAPPER
   Runs once inside Canvas after the FBX loads. Casts rays in 7 directions toward
   each tooltip's approximate surface position and snaps surfaceX/Y/Z to the
   nearest actual shoe mesh hit (within 2 units). Badge Y is re-elevated by
   LEADER_LIFT above the snapped point so the leader line always starts on mesh.
   Remounts (resets) when fbxKey changes so a newly dropped model re-snaps.
   ═══════════════════════════════════════════════════════════════════════════════ */
const PinSnapper = ({ tooltips, onSnapped }) => {
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    const meshes = shoeModelMeshes.current;
    if (!meshes.length) return;
    done.current = true;

    const rc  = new THREE.Raycaster();
    // Approximate geometric centre of a shoe scaled to maxDim=3.5, bottom at y=0
    const centre = new THREE.Vector3(0, 0.85, 0);

    const snapped = tooltips.map(t => {
      const approx = new THREE.Vector3(t.surfaceX, t.surfaceY, t.surfaceZ);

      // Primary ray: outward from shoe centre through approx, then reverse it so
      // we enter the surface from the outside.
      const outward = approx.clone().sub(centre).normalize();
      const origins = [
        approx.clone().add(outward.clone().multiplyScalar(2.5)), // primary: outward
        new THREE.Vector3(approx.x, approx.y + 2.5, approx.z),  // from above
        new THREE.Vector3(approx.x, approx.y - 1.2, approx.z),  // from below
        new THREE.Vector3(approx.x + 2.5, approx.y, approx.z),  // +X
        new THREE.Vector3(approx.x - 2.5, approx.y, approx.z),  // -X
        new THREE.Vector3(approx.x, approx.y, approx.z + 2.5),  // +Z
        new THREE.Vector3(approx.x, approx.y, approx.z - 2.5),  // -Z
      ];

      const castNearest = (cap) => {
        let best = null;
        let bestDist = cap;
        for (const origin of origins) {
          const dir = approx.clone().sub(origin).normalize();
          if (dir.lengthSq() < 0.001) continue;
          rc.set(origin, dir);
          // meshes is a flat list — no need for recursive traversal
          const hits = rc.intersectObjects(meshes, false);
          if (!hits.length) continue;
          // First hit = outermost surface travelling from outside in
          const d = hits[0].point.distanceTo(approx);
          if (d < bestDist) { bestDist = d; best = hits[0].point.clone(); }
        }
        return best;
      };

      // Pass 1: precise — accept only a surface within 2 units of the authored spot.
      // Pass 2: guaranteed — if nothing close, snap to the nearest footwear surface
      // from any direction so the callout is always attached (never floats in space).
      const best = castNearest(2.0) || castNearest(Infinity);

      if (best) {
        return { ...t, surfaceX: best.x, surfaceY: best.y, surfaceZ: best.z,
                       x: best.x, y: best.y + LEADER_LIFT, z: best.z };
      }
      return t; // no mesh at all — leave as-is
    });

    onSnapped(snapped);
  });
  return null;
};

/* ═══════════════════════════════════════════════════════════════════════════════
   CLICK MARKER
   ═══════════════════════════════════════════════════════════════════════════════ */
// World-space lift for the leader line (in scene units)
const LEADER_LIFT = 0.32;

/* Leader line + surface dot for a single pin. Isolated into its own component so
   we can use refs + useEffect to imperatively update material.depthTest — drei's
   <Line> spreads extra props onto the Line2 Object3D (not its material), so
   depthTest={prop} never reaches the LineMaterial without this pattern. */
const LeaderLine = ({ surface, elevated, renderAbove, color = UI.purple }) => {
  const lineRef = useRef();
  const dotRef = useRef();

  useEffect(() => {
    if (lineRef.current?.material) {
      lineRef.current.material.depthTest = !renderAbove;
      lineRef.current.material.needsUpdate = true;
    }
    if (dotRef.current?.material) {
      dotRef.current.material.depthTest = !renderAbove;
      dotRef.current.material.needsUpdate = true;
    }
  }, [renderAbove]);

  return (
    <>
      <Line
        ref={lineRef}
        points={[surface, elevated]}
        color={color}
        lineWidth={1.5}
        opacity={0.45}
        transparent
      />
      <mesh ref={dotRef} position={surface} userData={{ isPinDot: true }}>
        <sphereGeometry args={[0.018, 10, 10]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} />
      </mesh>
    </>
  );
};

/* Comment bubble (MODE A): circular speech-bubble with squared bottom-left corner,
   showing the first letter of the author's name. */
const CommentBubble = ({ letter = '?', color = UI.purple, scale = 1, unseen = false }) => (
  <div style={{
    transform: `translate(0, -100%) scale(${scale})`, transformOrigin: 'left bottom',
    width: '30px', height: '30px',
    background: color, borderRadius: '50% 50% 50% 0',
    border: '2px solid #fff',
    // Unseen comments get a bright white halo so they stand out at a glance.
    boxShadow: unseen
      ? '0 3px 12px rgba(0,0,0,0.35), 0 0 0 3px #ffffff, 0 0 10px 2px rgba(255,255,255,0.7)'
      : '0 3px 12px rgba(0,0,0,0.35)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: DS.white, fontSize: '13px', fontWeight: 400, lineHeight: 1,
    fontFamily: "system-ui, sans-serif",
  }}>{letter}</div>
);

const ClickMarker = ({ point, nextNumber, commentMode = 'callout', color = UI.purple }) => {
  if (!point) return null;
  // surface = immutable raycast hit; elevated = badge position (may have been moved by user)
  const surface = [point.surfaceX ?? point.x, point.surfaceY ?? point.y, point.surfaceZ ?? point.z];
  const elevated = [point.x, point.y, point.z];

  // MODE A (default) — speech bubble pinned at the click point, no line/dot
  if (commentMode === 'default') {
    return (
      <Html position={surface} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <CommentBubble letter="?" color={color} />
      </Html>
    );
  }

  // MODE B (callout) — leader line + dot + elevated badge
  return (
    <>
      <LeaderLine surface={surface} elevated={elevated} renderAbove={false} color={color} />
      <Html position={elevated} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
        <div style={{
          width: '28px', height: '28px', borderRadius: '50%', background: color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transform: 'translate(-50%, -50%)',
          boxShadow: `0 2px 12px ${UI.purpleDim}, 0 0 0 2.5px #ffffff`,
          color: DS.white, fontSize: '13px', fontWeight: 400, fontFamily: 'system-ui, sans-serif',
        }}>
          {nextNumber ?? '?'}
        </div>
      </Html>
    </>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   PIN DRAG HELPERS
   ═══════════════════════════════════════════════════════════════════════════════ */

/** Project screen coords onto a camera-facing plane passing through refWorldPos.
 *  Returns a THREE.Vector3 in world space, or null on miss. */
function projectToPlane(clientX, clientY, refWorldPos, camera, gl) {
  const rect = gl.domElement.getBoundingClientRect();
  const ndcX = ((clientX - rect.left) / rect.width)  *  2 - 1;
  const ndcY = -((clientY - rect.top)  / rect.height) *  2 + 1;
  const rc = new THREE.Raycaster();
  rc.setFromCamera({ x: ndcX, y: ndcY }, camera);
  const camDir = camera.getWorldDirection(new THREE.Vector3());
  const plane  = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, refWorldPos);
  const result = new THREE.Vector3();
  return rc.ray.intersectPlane(plane, result) ? result : null;
}

/** Raycast screen coords onto the loaded shoe mesh. Returns hit point or null. */
function projectToSurface(clientX, clientY, camera, gl) {
  const rect = gl.domElement.getBoundingClientRect();
  const ndcX = ((clientX - rect.left) / rect.width)  *  2 - 1;
  const ndcY = -((clientY - rect.top)  / rect.height) *  2 + 1;
  const rc = new THREE.Raycaster();
  rc.setFromCamera({ x: ndcX, y: ndcY }, camera);
  const meshes = shoeModelMeshes.current;
  if (!meshes.length) return null;
  const hits = rc.intersectObjects(meshes, false);
  return hits.length > 0 ? hits[0].point.clone() : null;
}

/* ═══════════════════════════════════════════════════════════════════════════════
   TOOLTIP PINS
   ═══════════════════════════════════════════════════════════════════════════════ */
/* Single pin: line + dot + badge all driven by ONE raycaster in useFrame so they
   always show / hide together. No drei occlude — we do the occlusion ourselves.
   Both the badge and the surface anchor dot are grab-able:
     • Badge drag  → moves the label freely in 3D (camera-facing plane)
     • Surface drag → slides the surface anchor along the shoe mesh              */
const PinLeader = ({ t, renderAbove, selectedId, onSelect, editMode, onFlyTo, expandedId, onSetExpanded, onPinViewed, onUpdatePin, seen = true }) => {
  const { camera, gl } = useThree();
  const lineGroupRef  = useRef();   // Three.js group — set .visible imperatively
  const badgeDivRef   = useRef();   // HTML div for badge  — set style.visibility
  const surfaceDivRef = useRef();   // HTML div for anchor — set style.visibility
  const rc = useRef(new THREE.Raycaster());
  const renderAboveRef = useRef(renderAbove);
  renderAboveRef.current = renderAbove;
  // Suppress occlusion while a drag is in progress so the pin stays visible
  const dragActiveRef = useRef(false);

  useFrame(() => {
    if (dragActiveRef.current) return;
    const lineGroup  = lineGroupRef.current;   // null in default (bubble) mode
    const badgeDiv   = badgeDivRef.current;
    const surfaceDiv = surfaceDivRef.current;
    if (!badgeDiv) return;

    const setVisible = (vis) => {
      if (lineGroup) lineGroup.visible = vis;
      badgeDiv.style.visibility = vis ? 'visible' : 'hidden';
      if (surfaceDiv) surfaceDiv.style.visibility = vis ? 'visible' : 'hidden';
    };

    if (renderAboveRef.current) { setVisible(true); return; }

    // Only raycast against the shoe model meshes — NOT scene.children.
    const meshes = shoeModelMeshes.current;
    if (!meshes.length) { setVisible(true); return; }

    // Raycast camera → badge position; occluded if shoe geometry is in the way.
    // In default mode the bubble is pinned at the surface point, so use that.
    const badgePos = mode === 'default'
      ? new THREE.Vector3(surface[0], surface[1], surface[2])
      : new THREE.Vector3(t.x, t.y, t.z);
    const dist = camera.position.distanceTo(badgePos);
    rc.current.set(camera.position, badgePos.clone().sub(camera.position).normalize());
    const hits = rc.current.intersectObjects(meshes, false);
    const occluded = hits.length > 0 && hits[0].distance < dist - 0.05;
    setVisible(!occluded);
  });

  const isSelected  = selectedId === t.id;
  const hasCam      = !!t.hasCamera;
  const isExpanded  = expandedId === t.id;
  const pinIconOpen = isExpanded || (editMode && isSelected);
  const hasContent  = !!t.description;
  const surface  = [t.surfaceX ?? t.x, t.surfaceY ?? (t.y - LEADER_LIFT), t.surfaceZ ?? t.z];
  const elevated = [t.x, t.y, t.z];
  // Legacy comments (no commentMode stamp) render as callouts to preserve old data
  const mode     = t.commentMode === 'default' ? 'default' : 'callout';
  const pinColor = t.color || UI.purple;

  // ── Badge drag: free movement on camera-facing plane ──────────────────────
  const handleBadgePointerDown = (e) => {
    e.stopPropagation();
    e.nativeEvent?.stopImmediatePropagation();
    const startX = e.clientX, startY = e.clientY;
    let moved = false;
    dragActiveRef.current = true;
    // Fix the projection plane at the badge's current world position
    const refPos = new THREE.Vector3(t.x, t.y, t.z);

    const onMove = (me) => {
      if (!moved && (Math.abs(me.clientX - startX) > 4 || Math.abs(me.clientY - startY) > 4)) moved = true;
      if (!moved) return;
      const np = projectToPlane(me.clientX, me.clientY, refPos, camera, gl);
      if (np && onUpdatePin) onUpdatePin(t.id, { x: np.x, y: np.y, z: np.z });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      dragActiveRef.current = false;
      if (!moved) {
        // Treat as click — existing fly-to / expand / select behavior
        if (editMode) { onSelect(t.id); }
        else {
          onFlyTo(t);
          onSetExpanded(isExpanded ? null : t.id);
          onPinViewed?.(t.id);
        }
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // ── Surface anchor drag: slides along shoe mesh ───────────────────────────
  const handleSurfacePointerDown = (e) => {
    e.stopPropagation();
    e.nativeEvent?.stopImmediatePropagation();
    const startX = e.clientX, startY = e.clientY;
    let moved = false;

    const onMove = (me) => {
      if (!moved && (Math.abs(me.clientX - startX) > 4 || Math.abs(me.clientY - startY) > 4)) moved = true;
      if (!moved) return;
      const hit = projectToSurface(me.clientX, me.clientY, camera, gl);
      if (hit && onUpdatePin) onUpdatePin(t.id, { surfaceX: hit.x, surfaceY: hit.y, surfaceZ: hit.z });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // ── MODE A bubble: drag slides along mesh; tap selects / expands ───────────
  const handleBubblePointerDown = (e) => {
    e.stopPropagation();
    e.nativeEvent?.stopImmediatePropagation();
    const startX = e.clientX, startY = e.clientY;
    let moved = false;
    dragActiveRef.current = true;
    const onMove = (me) => {
      if (!moved && (Math.abs(me.clientX - startX) > 4 || Math.abs(me.clientY - startY) > 4)) moved = true;
      if (!moved) return;
      const hit = projectToSurface(me.clientX, me.clientY, camera, gl);
      if (hit && onUpdatePin) onUpdatePin(t.id, { surfaceX: hit.x, surfaceY: hit.y, surfaceZ: hit.z, x: hit.x, y: hit.y, z: hit.z });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      dragActiveRef.current = false;
      if (!moved) {
        if (editMode) { onSelect(t.id); }
        else { onFlyTo(t); onSetExpanded(isExpanded ? null : t.id); onPinViewed?.(t.id); }
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // ── MODE A (default): Figma-style bubble pinned at the surface point ───────
  if (mode === 'default') {
    const authorLetter = (t.author || '?')[0].toUpperCase();
    return (
      <Html position={surface} zIndexRange={[38, 0]} style={{ overflow: 'visible' }}>
        <div ref={badgeDivRef} style={{ position: 'relative', pointerEvents: 'auto' }}>
          <div onPointerDown={handleBubblePointerDown} style={{ cursor: 'grab' }}>
            <CommentBubble letter={authorLetter} color={pinColor} scale={(isSelected || pinIconOpen) ? 1.18 : 1} unseen={!seen} />
          </div>
        </div>
      </Html>
    );
  }

  return (
    <>
      <group ref={lineGroupRef}>
        <LeaderLine surface={surface} elevated={elevated} renderAbove={renderAbove} color={pinColor} />
      </group>

      {/* Surface anchor grab handle — transparent hit-area over the dot sphere */}
      <Html position={surface} zIndexRange={[36, 0]} style={{ overflow: 'visible' }}>
        <div ref={surfaceDivRef} style={{ position: 'relative' }}>
          <div
            onPointerDown={handleSurfacePointerDown}
            title="Drag to move anchor"
            style={{
              position: 'absolute', top: '-10px', left: '-10px',
              width: '20px', height: '20px', borderRadius: '50%',
              cursor: 'grab', pointerEvents: 'auto',
            }}
          />
        </div>
      </Html>

      {/* Badge — visibility driven by unified raycaster above.
          zIndexRange is STATIC — changing it remounts the Html and breaks the anchor. */}
      <Html position={elevated} zIndexRange={[38, 0]} style={{ overflow: 'visible' }}>
        <div ref={badgeDivRef} style={{ position: 'relative', pointerEvents: 'auto' }}>
          <div
            onPointerDown={handleBadgePointerDown}
            style={{
              width: '28px', height: '28px', borderRadius: '50%',
              background: pinColor,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transform: (isSelected || pinIconOpen)
                ? 'translate(-50%, -50%) scale(1.22)'
                : 'translate(-50%, -50%) scale(1)',
              transformOrigin: 'center center',
              cursor: 'grab',
              color: DS.white, fontSize: '13px', fontWeight: 400, fontFamily: 'system-ui, sans-serif',
              boxShadow: (isSelected || pinIconOpen)
                ? `0 4px 20px rgba(108,92,231,0.45), 0 0 0 2.5px #ffffff, 0 0 0 5px ${UI.purple}`
                : !seen
                  // Unseen → bright white halo so it's easy to spot.
                  ? `0 2px 12px rgba(0,0,0,0.4), 0 0 0 2.5px #ffffff, 0 0 10px 2px rgba(255,255,255,0.6)`
                  : hasCam && !editMode
                    ? `0 2px 12px rgba(0,0,0,0.4), 0 0 0 2px ${UI.purpleLight}`
                    : `0 2px 12px rgba(0,0,0,0.4), 0 0 0 1.5px ${UI.purpleDim}`,
              transition: 'transform 0.18s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.15s ease',
              flexShrink: 0, position: 'relative', zIndex: 2,
            }}
          >
            {t.sequenceNumber ?? '?'}
          </div>
        </div>
      </Html>
    </>
  );
};

const TooltipPins = ({ tooltips, selectedId, onSelect, editMode, onFlyTo, expandedId, onSetExpanded, onPinViewed, renderAbove, onUpdatePin, isPinSeen }) => {
  return tooltips.map((t) => (
    <PinLeader
      key={t.id} t={t} renderAbove={renderAbove}
      selectedId={selectedId} onSelect={onSelect}
      editMode={editMode} onFlyTo={onFlyTo}
      expandedId={expandedId} onSetExpanded={onSetExpanded}
      onPinViewed={onPinViewed} onUpdatePin={onUpdatePin}
      seen={isPinSeen ? isPinSeen(t.id) : true}
    />
  ));
};

/* ═══════════════════════════════════════════════════════════════════════════════
   COMMENT DETAIL POPUP — draggable popup shown when a pin is clicked
   ═══════════════════════════════════════════════════════════════════════════════ */
const CommentDetailPopup = ({ tooltip, onClose, onUpdate, currentUser }) => {
  const [reply, setReply] = useState('');
  const [pos, setPos] = useState({ x: window.innerWidth / 2 - 150, y: 140 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const [dragging, setDragging] = useState(false);

  const handleDragStart = (e) => {
    if (e.button !== 0) return;
    isDragging.current = true; setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
    e.preventDefault();
    const onMove = (me) => {
      if (!isDragging.current) return;
      setPos({
        x: Math.max(8, Math.min(window.innerWidth - 308, dragStart.current.px + me.clientX - dragStart.current.x)),
        y: Math.max(54, Math.min(window.innerHeight - 80, dragStart.current.py + me.clientY - dragStart.current.y)),
      });
    };
    const onUp = () => { isDragging.current = false; setDragging(false); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
  };

  const handleAddReply = () => {
    if (!reply.trim()) return;
    onUpdate(tooltip.id, { description: tooltip.description ? tooltip.description + '\n\n' + reply.trim() : reply.trim() });
    setReply('');
  };

  return (
    <div style={{
      position: 'fixed', left: pos.x, top: pos.y, zIndex: 55,
      width: '300px', background: UI.glass, border: `1px solid ${UI.glassBorder}`,
      borderRadius: UI.radius, boxShadow: UI.panelShadow,
      backdropFilter: UI.glassBlur, WebkitBackdropFilter: UI.glassBlur,
      fontFamily: UI.font, overflow: 'hidden',
    }}>
      {/* Drag handle */}
      <div onPointerDown={handleDragStart} style={{
        padding: '10px 12px', borderBottom: `1px solid ${UI.border}`,
        display: 'flex', alignItems: 'center', gap: '8px',
        cursor: dragging ? 'grabbing' : 'grab', userSelect: 'none', flexShrink: 0,
      }}>
        <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: UI.purple, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: '8px', fontWeight: '700', color: DS.white }}>{tooltip.sequenceNumber || '?'}</span>
        </div>
        <span style={{ flex: 1, fontSize: '12px', fontWeight: '600', color: UI.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tooltip.label}</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: UI.textDim, cursor: 'pointer', fontSize: '14px', padding: '2px 4px', borderRadius: '5px', lineHeight: 1, flexShrink: 0 }}
          onMouseEnter={e => { e.currentTarget.style.color = UI.text; e.currentTarget.style.background = UI.bgRow; }}
          onMouseLeave={e => { e.currentTarget.style.color = UI.textDim; e.currentTarget.style.background = 'none'; }}>✕</button>
      </div>
      {/* Comment text */}
      {tooltip.description && (
        <div style={{ padding: '12px 14px', fontSize: '12px', color: UI.textMid, lineHeight: '1.65', borderBottom: `1px solid ${UI.border}` }}>
          {tooltip.description}
        </div>
      )}
      {/* Reply area */}
      <div style={{ padding: '10px 14px 14px' }}>
        <textarea value={reply} onChange={e => setReply(e.target.value)} placeholder="Add a reply…" rows={2}
          style={{ width: '100%', resize: 'none', border: `1px solid ${UI.border}`, borderRadius: '8px', fontFamily: UI.font, fontSize: '12px', color: UI.text, padding: '8px 10px', background: 'rgba(0,0,0,0.02)', outline: 'none', boxSizing: 'border-box', lineHeight: '1.55' }}
          onFocus={e => e.target.style.borderColor = UI.purple}
          onBlur={e => e.target.style.borderColor = UI.border} />
        <button onClick={handleAddReply} disabled={!reply.trim()} style={{
          marginTop: '8px', width: '100%', background: reply.trim() ? UI.purple : 'rgba(0,0,0,0.06)',
          border: 'none', borderRadius: '8px', color: reply.trim() ? '#fff' : UI.textDim,
          fontFamily: UI.font, fontSize: '10px', fontWeight: '700', letterSpacing: '0.14em',
          textTransform: 'uppercase', padding: '9px 0', cursor: reply.trim() ? 'pointer' : 'default',
          transition: 'background 0.15s, color 0.15s',
        }}>Reply</button>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   RAYCAST PLANE
   ═══════════════════════════════════════════════════════════════════════════════ */
const RaycastPlane = ({ onPick, draggingId, onModelClick, onContextMenu, orbitRef }) => {
  const { gl, camera, scene } = useThree();
  useEffect(() => {
    const canvas = gl.domElement;
    let downX = 0, downY = 0;
    const handleMouseDown = (e) => { downX = e.clientX; downY = e.clientY; };
    const guardedClick = (e) => {
      const dx = e.clientX - downX, dy = e.clientY - downY;
      if (Math.sqrt(dx * dx + dy * dy) > 5) return;
      if (draggingId) return;
      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera({ x, y }, camera);
      const meshes = shoeModelMeshes.current.length > 0 ? [...shoeModelMeshes.current] : [];
      if (meshes.length === 0) {
        scene.traverse((obj) => { if (obj.isMesh && obj.geometry?.type !== 'PlaneGeometry') meshes.push(obj); });
      }
      const hits = raycaster.intersectObjects(meshes, false);
      let p = null;
      if (hits.length > 0) {
        const rayDir = raycaster.ray.direction;
        const frontHit = hits.find(h => {
          if (!h.face) return true;
          const wn = h.face.normal.clone().transformDirection(h.object.matrixWorld);
          return wn.dot(rayDir) < 0;
        }) ?? hits[0];
        p = frontHit.point.clone();
        const n = frontHit.face?.normal?.clone();
        if (n) { n.transformDirection(frontHit.object.matrixWorld); p.add(n.multiplyScalar(0.05)); }
      } else {
        // Missed the model → drop the comment into space on the orbit-target plane.
        p = planePointFromScreen(camera, gl, e.clientX, e.clientY, orbitRef?.current?.target?.clone?.());
      }
      if (p) onPick({ x: parseFloat(p.x.toFixed(3)), y: parseFloat(p.y.toFixed(3)), z: parseFloat(p.z.toFixed(3)), screenX: e.clientX, screenY: e.clientY });
    };
    // Right-drag orbits (OrbitControls). Suppress the browser menu so the drag isn't
    // interrupted — our menu opens on MIDDLE click (handled globally via auxclick).
    const handleContextMenu = (e) => { e.preventDefault(); };
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('click', guardedClick);
    canvas.addEventListener('contextmenu', handleContextMenu);
    return () => { canvas.removeEventListener('mousedown', handleMouseDown); canvas.removeEventListener('click', guardedClick); canvas.removeEventListener('contextmenu', handleContextMenu); };
  }, [gl, camera, scene, onPick, draggingId, onModelClick, onContextMenu]);
  return null;
};

/* Opens the right-click context menu from an annotation overlay (where RaycastPlane
   isn't mounted). Raycasts the model so the menu still shows the object name and the
   surface-aware items, matching the View-mode menu exactly. */
function openContextMenuFromOverlay(threeState, clientX, clientY, onContextMenu) {
  if (!onContextMenu || !threeState) return;
  const { camera, gl } = threeState;
  const rect = gl.domElement.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((clientY - rect.top) / rect.height) * 2 + 1;
  const rc = new THREE.Raycaster();
  rc.setFromCamera({ x, y }, camera);
  const meshes = shoeModelMeshes.current.length ? [...shoeModelMeshes.current] : [];
  const hits = rc.intersectObjects(meshes, false);
  const hp = hits.length ? hits[0].point : null;
  const hitName = (() => {
    if (!hits.length) return null;
    const isGenId = (n) => /^[a-zA-Z]{1,3}\d+(_\w+)?$/.test(n);
    const skip = new Set(['scene', 'group', 'meshes', 'objects']);
    let obj = hits[0].object;
    while (obj && obj.type !== 'Scene') { const n = obj.name?.trim(); if (n && !isGenId(n) && !skip.has(n.toLowerCase())) return n; obj = obj.parent; }
    obj = hits[0].object;
    while (obj && obj.type !== 'Scene') { const n = obj.name?.trim(); if (n && !skip.has(n.toLowerCase())) return n; obj = obj.parent; }
    return null;
  })();
  onContextMenu(clientX, clientY, hits.length > 0, hp ? { x: hp.x, y: hp.y, z: hp.z } : null, hitName);
}

/* Projects a screen point onto a camera-facing plane that passes through `through`
   (the orbit target by default). Lets annotation tools place input in empty space,
   not just on the model surface. Returns a THREE.Vector3 or null. */
function planePointFromScreen(camera, gl, clientX, clientY, through) {
  const rect = gl.domElement.getBoundingClientRect();
  const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ny = -((clientY - rect.top) / rect.height) * 2 + 1;
  const rc = new THREE.Raycaster();
  rc.setFromCamera({ x: nx, y: ny }, camera);
  const camDir = camera.getWorldDirection(new THREE.Vector3());
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, through || new THREE.Vector3(0, 1, 0));
  const hit = new THREE.Vector3();
  return rc.ray.intersectPlane(plane, hit) ? hit : null;
}

/* ═══════════════════════════════════════════════════════════════════════════════
   BOX SELECT — left-drag marquee selection of meshes (View mode). Right-drag still
   orbits (OrbitControls), middle opens the menu (RaycastPlane), so we only consume
   the LEFT button here. Shift toggles selection (add/remove) instead of replacing.
   ═══════════════════════════════════════════════════════════════════════════════ */
const BoxSelect = ({ active, selectedUuids, setSelectedUuids, setMarquee }) => {
  const { gl, camera } = useThree();
  const selRef = useRef(selectedUuids);
  useEffect(() => { selRef.current = selectedUuids; }, [selectedUuids]);

  useEffect(() => {
    if (!active) return;
    const canvas = gl.domElement;
    const projectCenter = (mesh) => {
      const box = new THREE.Box3().setFromObject(mesh);
      const c = box.getCenter(new THREE.Vector3());
      c.project(camera);
      const rect = canvas.getBoundingClientRect();
      return { x: rect.left + (c.x * 0.5 + 0.5) * rect.width, y: rect.top + (-c.y * 0.5 + 0.5) * rect.height, z: c.z };
    };
    const pickSingle = (cx, cy) => {
      const rect = canvas.getBoundingClientRect();
      const nx = ((cx - rect.left) / rect.width) * 2 - 1;
      const ny = -((cy - rect.top) / rect.height) * 2 + 1;
      const rc = new THREE.Raycaster();
      rc.setFromCamera({ x: nx, y: ny }, camera);
      const hits = rc.intersectObjects(shoeModelMeshes.current, false);
      return hits.length ? hits[0].object.uuid : null;
    };

    let startX = 0, startY = 0, dragging = false;
    const onDown = (e) => {
      if (e.button !== 0) return; // only the left button box-selects
      if (gizmoBusyRef.current) return; // clicking the move gumball — don't box-select
      startX = e.clientX; startY = e.clientY; dragging = true;
      setMarquee({ x0: startX, y0: startY, x1: startX, y1: startY });
    };
    const onMove = (e) => {
      if (!dragging) return;
      setMarquee({ x0: startX, y0: startY, x1: e.clientX, y1: e.clientY });
    };
    const onUp = (e) => {
      if (!dragging) return;
      dragging = false;
      setMarquee(null);
      const moved = Math.hypot(e.clientX - startX, e.clientY - startY);
      const additive = e.shiftKey;
      const prev = new Set(selRef.current);
      if (moved < 5) {
        // Click — select the mesh under the cursor (or clear when clicking empty space)
        const uuid = pickSingle(e.clientX, e.clientY);
        if (!uuid) { if (!additive) setSelectedUuids([]); return; }
        if (additive) { prev.has(uuid) ? prev.delete(uuid) : prev.add(uuid); setSelectedUuids([...prev]); }
        else setSelectedUuids([uuid]);
        return;
      }
      // Marquee — every mesh whose screen-projected centre falls inside the rectangle
      const minX = Math.min(startX, e.clientX), maxX = Math.max(startX, e.clientX);
      const minY = Math.min(startY, e.clientY), maxY = Math.max(startY, e.clientY);
      const inside = [];
      shoeModelMeshes.current.forEach(m => {
        const p = projectCenter(m);
        if (p.z < 1 && p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY) inside.push(m.uuid);
      });
      if (additive) { inside.forEach(u => prev.add(u)); setSelectedUuids([...prev]); }
      else setSelectedUuids(inside);
    };
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setMarquee(null);
    };
  }, [active, gl, camera, setSelectedUuids, setMarquee]);
  return null;
};

/* Highlights the selected meshes with an emissive tint. Clones each mesh's material
   the first time it's touched so shared materials don't bleed the highlight onto
   unselected meshes, and restores the tint to black when deselected. */
const SelectionHighlight = ({ selected }) => {
  useEffect(() => {
    const set = new Set(selected);
    shoeModelMeshes.current.forEach(m => {
      const on = set.has(m.uuid);
      let mats = Array.isArray(m.material) ? m.material : [m.material];
      if (on && !m.userData.__selClone) {
        // clone so the emissive tint is unique to this mesh
        m.material = Array.isArray(m.material) ? m.material.map(x => x.clone()) : m.material.clone();
        m.userData.__selClone = true;
        mats = Array.isArray(m.material) ? m.material : [m.material];
      }
      mats.forEach(mat => {
        if (!mat || !mat.emissive) return;
        mat.emissive.setHex(on ? 0x6c5ce7 : 0x000000);
        mat.emissiveIntensity = on ? 0.45 : 1.0; // subtle fill; the edge outline carries the highlight
        mat.needsUpdate = true;
      });
    });
  }, [selected]);
  return null;
};

/* Bright edge outline drawn over each selected mesh so the selection reads clearly
   regardless of lighting. Edges are computed once per selection and follow each
   mesh's live world matrix (so they track the gumball while it moves objects).
   depthTest is off so the outline stays visible even where it sits behind geometry. */
const SelectionOutlines = ({ selected }) => {
  const groupRef = useRef();
  const items = useMemo(() => {
    const set = new Set(selected);
    return shoeModelMeshes.current
      .filter(m => set.has(m.uuid) && m.geometry)
      .map(m => ({ mesh: m, edges: new THREE.EdgesGeometry(m.geometry, 25) }));
  }, [selected]);

  // dispose edge geometries when the selection changes
  useEffect(() => () => items.forEach(it => it.edges.dispose()), [items]);

  // keep each outline locked to its mesh's world transform every frame
  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    g.children.forEach((seg, i) => {
      const m = items[i]?.mesh;
      if (m) { m.updateWorldMatrix(true, false); seg.matrix.copy(m.matrixWorld); }
    });
  });

  if (!items.length) return null;
  return (
    <group ref={groupRef}>
      {items.map((it, i) => (
        <lineSegments key={it.mesh.uuid} geometry={it.edges} matrixAutoUpdate={false} renderOrder={999}>
          <lineBasicMaterial color="#6c5ce7" depthTest={false} transparent opacity={0.95} toneMapped={false} />
        </lineSegments>
      ))}
    </group>
  );
};

/* Translate gumball for the current box-selection. A pivot Object3D sits at the
   selection centroid; TransformControls moves it, and the selected meshes are
   re-parented under the pivot for the duration of the drag (THREE.attach preserves
   world transforms) so they move with it. OrbitControls is disabled while dragging. */
const SelectionGizmo = ({ selected, orbitRef }) => {
  const { scene } = useThree();
  const pivot = useMemo(() => { const o = new THREE.Object3D(); o.name = '__selPivot'; return o; }, []);
  const tcRef = useRef();
  const meshesRef = useRef([]);

  const recentre = useCallback(() => {
    const meshes = shoeModelMeshes.current.filter(m => selected.includes(m.uuid));
    meshesRef.current = meshes;
    if (!meshes.length) return;
    const box = new THREE.Box3();
    meshes.forEach(m => box.expandByObject(m));
    pivot.position.copy(box.getCenter(new THREE.Vector3()));
    pivot.rotation.set(0, 0, 0);
    pivot.scale.set(1, 1, 1);
    pivot.updateMatrixWorld(true);
  }, [selected, pivot]);

  useEffect(() => { recentre(); }, [recentre]);

  // Drive re-parenting + OrbitControls lock off the gizmo's drag state.
  useEffect(() => {
    const tc = tcRef.current;
    if (!tc) return;
    const onDrag = (e) => {
      const dragging = e.value;
      if (orbitRef?.current) orbitRef.current.enabled = !dragging;
      const meshes = meshesRef.current;
      if (dragging) {
        meshes.forEach(m => { m.userData.__origParent = m.parent || scene; pivot.attach(m); });
      } else {
        meshes.forEach(m => { (m.userData.__origParent || scene).attach(m); m.userData.__origParent = null; });
        recentre();
      }
    };
    tc.addEventListener('dragging-changed', onDrag);
    return () => { tc.removeEventListener('dragging-changed', onDrag); gizmoBusyRef.current = false; };
  }, [orbitRef, pivot, scene, recentre]);

  // Flag when the gumball is hovered or dragging so box-select stands down.
  useFrame(() => { const tc = tcRef.current; gizmoBusyRef.current = !!(tc && (tc.dragging || tc.axis)); });

  if (!selected.length) return null;
  return (
    <>
      <primitive object={pivot} />
      <TransformControls ref={tcRef} object={pivot} mode="translate" size={0.8} />
    </>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   SCRUB INPUT
   ═══════════════════════════════════════════════════════════════════════════════ */
const ScrubInput = ({ axis, value, onChange }) => {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState('');
  const inputRef = useRef();
  const handlePointerDown = (e) => {
    if (editing) return; e.preventDefault();
    const startX = e.clientX, startVal = value; let moved = false;
    const onMove = (me) => { const dx = me.clientX - startX; if (Math.abs(dx) > 2) moved = true; if (moved) onChange(parseFloat((startVal + dx * 0.005).toFixed(3))); };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); if (!moved) { setRaw(value.toFixed(3)); setEditing(true); setTimeout(() => inputRef.current?.select(), 0); } };
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
  };
  const commitEdit = () => { const parsed = parseFloat(raw); if (!isNaN(parsed)) onChange(parseFloat(parsed.toFixed(3))); setEditing(false); };
  const col = AXIS_COLORS[axis];
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: '7px', color: col, letterSpacing: '0.2em', marginBottom: '5px', textAlign: 'center', textTransform: 'uppercase', opacity: 0.9 }}>{axis.toUpperCase()}</div>
      {editing ? (
        <input ref={inputRef} value={raw} onChange={(e) => setRaw(e.target.value)} onBlur={commitEdit}
          onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false); }}
          style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: `1px solid ${col}`, color: UI.text, fontFamily: UI.mono, fontSize: '11px', padding: '3px 0', textAlign: 'center', outline: 'none', boxSizing: 'border-box' }} />
      ) : (
        <div onPointerDown={handlePointerDown}
          style={{ background: 'transparent', borderBottom: `1px solid rgba(0,0,0,0.1)`, color: UI.textMid, fontFamily: UI.mono, fontSize: '11px', padding: '3px 0', textAlign: 'center', cursor: 'ew-resize', userSelect: 'none', fontVariantNumeric: 'tabular-nums', transition: 'color 0.15s, border-color 0.15s' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = UI.text; e.currentTarget.style.borderColor = col; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = UI.textMid; e.currentTarget.style.borderColor = 'rgba(0,0,0,0.1)'; }}>
          {value.toFixed(3)}
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   ADD TOOLTIP PANEL (kept for reference, replaced by CommentFloatingPanel in UI)
   ═══════════════════════════════════════════════════════════════════════════════ */
const commentFieldLabel = {
  display: 'block', fontFamily: UI.font, fontSize: '9px', fontWeight: '600', letterSpacing: '0.22em',
  color: UI.textDim, textTransform: 'uppercase', marginBottom: '6px',
};
const commentFieldInput = {
  width: '100%', boxSizing: 'border-box', fontFamily: UI.font, fontSize: '13px', fontWeight: '400',
  lineHeight: '1.45', color: UI.text, background: 'transparent', border: 'none',
  borderBottom: `1px solid ${UI.border}`, padding: '8px 0', outline: 'none',
};
const AddTooltipPanel = ({ point, onAdd, onClear, onUpdatePoint, nextNumber }) => {
  const [description, setDescription] = useState('');
  useEffect(() => { setDescription(''); }, [point]);
  if (!point) return null;
  const handleAdd = () => {
    const autoLabel = `Comment ${nextNumber ?? 1}`;
    onAdd({ ...point, label: autoLabel, description, details: [], id: Date.now() });
    setDescription('');
  };
  return (
    <div style={{
      position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
      background: UI.bgPanel, border: `1px solid ${UI.border}`, boxShadow: UI.panelShadow,
      fontFamily: UI.font, zIndex: 20, width: '300px', boxSizing: 'border-box', borderRadius: UI.radius, overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', padding: '10px 10px 0' }}>
        <button type="button" onClick={onClear} title="Dismiss"
          style={{ background: 'none', border: 'none', color: UI.textDim, cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: '6px 10px', borderRadius: '8px', flexShrink: 0 }}
          onMouseEnter={e => { e.currentTarget.style.color = UI.text; e.currentTarget.style.background = UI.bgRow; }}
          onMouseLeave={e => { e.currentTarget.style.color = UI.textDim; e.currentTarget.style.background = 'transparent'; }}>✕</button>
      </div>
      <div style={{ padding: '4px 16px 18px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <div>
          <label htmlFor="new-pin-desc" style={commentFieldLabel}>Description</label>
          <textarea id="new-pin-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
            style={{ ...commentFieldInput, resize: 'none', minHeight: '72px', marginBottom: 0 }} autoFocus />
        </div>
        <button type="button" onClick={handleAdd} style={{
          width: '100%', marginTop: '2px', background: UI.gold, border: `1px solid ${UI.gold}`,
          color: '#ffffff', fontFamily: UI.font, fontSize: '10px', fontWeight: '700', letterSpacing: '0.18em', textTransform: 'uppercase', padding: '11px 0',
          cursor: 'pointer', transition: 'background 0.15s, border-color 0.15s, color 0.15s', borderRadius: '10px',
        }}>Add comment</button>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   COMMENT FLOATING PANEL — draggable, comment-only (v3: no annotation tab)
   ═══════════════════════════════════════════════════════════════════════════════ */
const CommentFloatingPanel = ({ point, onAdd, onClear, nextNumber, currentUser }) => {
  const [description, setDescription] = useState('');
  const clampX = (raw) => Math.max(8, Math.min(raw, window.innerWidth - 308));
  const [pos, setPos] = useState(() => ({
    x: clampX((point?.screenX ?? window.innerWidth / 2) + 20),
    y: Math.max(60, (point?.screenY ?? window.innerHeight / 2) - 80),
  }));
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const [dragging, setDragging] = useState(false);

  useEffect(() => { setDescription(''); }, [point]);
  useEffect(() => {
    if (point) setPos({
      x: Math.max(8, Math.min((point.screenX ?? window.innerWidth / 2) + 20, window.innerWidth - 308)),
      y: Math.max(60, (point.screenY ?? window.innerHeight / 2) - 80),
    });
  }, [point?.screenX, point?.screenY]);

  if (!point) return null;

  const handleDragStart = (e) => {
    if (e.button !== 0) return;
    isDragging.current = true; setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
    e.preventDefault();
    const onMove = (me) => {
      if (!isDragging.current) return;
      setPos({
        x: Math.max(8, Math.min(window.innerWidth - 308, dragStart.current.px + me.clientX - dragStart.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 60, dragStart.current.py + me.clientY - dragStart.current.y)),
      });
    };
    const onUp = () => { isDragging.current = false; setDragging(false); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
  };

  const handleAdd = () => {
    const autoLabel = `Comment ${nextNumber ?? 1}`;
    onAdd({ ...point, label: autoLabel, description, details: [], id: Date.now(), created: Date.now(), author: currentUser || 'You' });
    setDescription('');
  };

  return (
    <div style={{
      position: 'fixed', left: pos.x, top: pos.y, zIndex: 45,
      width: '280px', background: UI.glass, border: `1px solid ${UI.glassBorder}`,
      borderRadius: UI.radius, boxShadow: UI.panelShadow,
      backdropFilter: UI.glassBlur, WebkitBackdropFilter: UI.glassBlur,
      fontFamily: UI.font, overflow: 'hidden', display: 'flex', flexDirection: 'column',
    }}>
      {/* Header — drag handle */}
      <div onPointerDown={handleDragStart} style={{ padding: '10px 12px', borderBottom: `1px solid ${UI.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: dragging ? 'grabbing' : 'grab', flexShrink: 0, userSelect: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 2h12v9H9l-3 3v-3H2V2z" stroke={UI.purple} strokeWidth="1.4" strokeLinejoin="round"/></svg>
          <span style={{ fontSize: '12px', fontWeight: '600', color: UI.text }}>New comment</span>
        </div>
        <button type="button" onClick={onClear} style={{ background: 'none', border: 'none', color: UI.textDim, cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: '4px 6px', borderRadius: '6px' }}
          onMouseEnter={e => { e.currentTarget.style.color = UI.text; e.currentTarget.style.background = UI.bgRow; }}
          onMouseLeave={e => { e.currentTarget.style.color = UI.textDim; e.currentTarget.style.background = 'transparent'; }}>✕</button>
      </div>

      {/* Fields */}
      <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Add a note…" rows={3}
          style={{ width: '100%', resize: 'none', border: `1px solid ${UI.border}`, borderRadius: '8px', fontFamily: UI.font, fontSize: '12px', color: UI.text, padding: '8px 10px', background: 'rgba(0,0,0,0.02)', outline: 'none', boxSizing: 'border-box', lineHeight: '1.55' }}
          onFocus={e => e.target.style.borderColor = UI.purple}
          onBlur={e => e.target.style.borderColor = UI.border} />
        <button type="button" onClick={handleAdd} style={{
          width: '100%', background: UI.purple, border: 'none',
          color: '#ffffff', fontFamily: UI.font, fontSize: '10px',
          fontWeight: '700', letterSpacing: '0.18em', textTransform: 'uppercase', padding: '11px 0',
          cursor: 'pointer', transition: 'background 0.15s', borderRadius: '10px',
        }}>Add Comment</button>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   EXPANDED EDITOR
   ═══════════════════════════════════════════════════════════════════════════════ */
const ExpandedEditor = ({ t, onMove, onRename, onSetCamera, onClearCamera, onUpdateTooltip }) => {
  const [labelVal, setLabelVal] = useState(t.label);
  const [labelEditing, setLabelEditing] = useState(false);
  const [descVal, setDescVal] = useState(t.description || '');
  const labelInputRef = useRef();
  useEffect(() => { setLabelVal(t.label); }, [t.label]);
  useEffect(() => { setDescVal(t.description || ''); }, [t.description]);
  const commitDesc = () => { onUpdateTooltip(t.id, { description: descVal }); };
  const commitLabel = () => { const tr = labelVal.trim(); if (tr && tr !== t.label) onRename(t.id, tr); else setLabelVal(t.label); setLabelEditing(false); };
  return (
    <div style={{ background: UI.bgRow, borderBottom: `1px solid ${UI.border}`, padding: '16px 16px 18px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div>
        <div style={commentFieldLabel}>Title</div>
        <div style={{ marginBottom: 0 }}>
          {labelEditing ? (
            <input ref={labelInputRef} value={labelVal} onChange={(e) => setLabelVal(e.target.value)} onBlur={commitLabel}
              onKeyDown={(e) => { if (e.key === 'Enter') commitLabel(); if (e.key === 'Escape') { setLabelVal(t.label); setLabelEditing(false); } }}
              style={{ ...commentFieldInput, borderBottomColor: UI.gold }} />
          ) : (
            <div onClick={() => { setLabelEditing(true); setTimeout(() => labelInputRef.current?.select(), 0); }}
              style={{ ...commentFieldInput, borderBottom: `1px solid ${UI.border}`, cursor: 'text', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 0 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</span>
              <span style={{ fontSize: '10px', color: UI.textDim, marginLeft: '8px', flexShrink: 0 }}>✎</span>
            </div>
          )}
        </div>
      </div>
      <div>
        <div style={commentFieldLabel}>Description</div>
        <textarea value={descVal} onChange={e => setDescVal(e.target.value)} onBlur={commitDesc} rows={3}
          style={{ ...commentFieldInput, resize: 'none', minHeight: '72px', marginBottom: 0 }} />
      </div>
      <div style={{ padding: '12px', borderRadius: '12px', background: UI.bgPanel, border: `1px solid ${UI.border}` }}>
        <div style={{ ...commentFieldLabel, marginBottom: '10px' }}>Position</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {['x', 'y', 'z'].map((axis) => (<ScrubInput key={axis} axis={axis} value={t[axis]} onChange={(val) => onMove(t.id, { ...t, [axis]: val })} />))}
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   SETTINGS ROW HELPERS
   ═══════════════════════════════════════════════════════════════════════════════ */
const SettingsRow = ({ label, children }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '7px 0', borderBottom: `1px solid rgba(0,0,0,0.06)` }}>
    <span style={{ fontSize: '9px', letterSpacing: '0.15em', color: UI.textMid, textTransform: 'uppercase', flexShrink: 0 }}>{label}</span>
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>{children}</div>
  </div>
);
const SliderInput = ({ value, min, max, step = 0.01, onChange }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} style={{ width: '90px', accentColor: UI.gold, cursor: 'pointer' }} />
    <span style={{ fontFamily: UI.mono, fontSize: '10px', color: UI.textMid, minWidth: '34px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{value.toFixed(2)}</span>
  </div>
);
const ColorInput = ({ value, onChange }) => (
  <input type="color" value={value} onChange={e => onChange(e.target.value)} style={{ width: '28px', height: '20px', border: `1px solid rgba(0,0,0,0.12)`, cursor: 'pointer', background: 'none', padding: '1px', borderRadius: '4px' }} />
);
const SelectInput = ({ value, options, onChange }) => (
  <select value={value} onChange={e => onChange(e.target.value)} style={{ background: 'rgba(0,0,0,0.04)', border: `1px solid rgba(0,0,0,0.1)`, color: UI.text, fontFamily: UI.font, fontSize: '9px', letterSpacing: '0.1em', padding: '3px 6px', cursor: 'pointer', outline: 'none', borderRadius: '4px' }}>
    {options.map(o => <option key={o} value={o}>{o}</option>)}
  </select>
);

/* ═══════════════════════════════════════════════════════════════════════════════
   SCENE SETTINGS PANEL
   ═══════════════════════════════════════════════════════════════════════════════ */
const ENV_PRESETS = [
  { id: 'studio',    label: 'Studio' },
  { id: 'warehouse', label: 'Warehouse' },
  { id: 'apartment', label: 'Apartment' },
  { id: 'dawn',      label: 'Dawn' },
  { id: 'sunset',    label: 'Sunset' },
  { id: 'city',      label: 'City' },
  { id: 'park',      label: 'Park' },
  { id: 'forest',    label: 'Forest' },
  { id: 'lobby',     label: 'Lobby' },
  { id: 'night',     label: 'Night' },
];

const SceneSettingsPanel = ({ scene, onUpdate, settingsOpen, setSettingsOpen, autoRotate, onToggleAutoRotate, panelTop = '120px' }) => {
  const isDefault = Object.keys(DEFAULT_SCENE).every(k => scene[k] === DEFAULT_SCENE[k]);

  const hazeValue = Math.max(0, Math.min(1, 1 - (scene.fogNear - 3) / 47));
  const setHaze = (v) => {
    const fogNear = 3 + (1 - v) * 47;
    onUpdate({ ...scene, fogNear, fogFar: fogNear + 10, fogColor: scene.bgColor });
  };

  return (
    <div style={{
      position: 'fixed', top: panelTop, left: '8px',
      transformOrigin: 'top left',
      transform: settingsOpen ? 'translateX(0) scale(1)' : 'translateX(-12px) scale(0.985)',
      opacity: settingsOpen ? 1 : 0,
      pointerEvents: settingsOpen ? 'auto' : 'none',
      transition: 'transform 0.26s cubic-bezier(0.22,1,0.36,1), opacity 0.2s ease',
      zIndex: 45, userSelect: 'none',
      filter: 'drop-shadow(0 8px 32px rgba(0,0,0,0.5))',
    }}>
      <div style={{
        width: '328px', maxHeight: 'calc(100vh - 140px)',
        background: DS.surface, border: `1px solid var(--color-border-default)`,
        borderRadius: '12px', position: 'relative',
        display: 'flex', flexDirection: 'column', boxSizing: 'border-box',
        overflow: 'hidden', fontFamily: UI.font,
      }}>
        {/* Header — title + Reset + » collapse on the right (matches Annotations) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 12px 10px 16px', borderBottom: '1px solid var(--color-overlay-divider)', flexShrink: 0 }}>
          <span style={{ flex: 1, fontSize: '14px', fontWeight: '600', color: 'var(--color-text-default)', fontFamily: DS.font }}>Environment</span>
          <button
            onClick={() => onUpdate(DEFAULT_SCENE)}
            disabled={isDefault}
            title="Reset to defaults"
            style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', cursor: isDefault ? 'default' : 'pointer', color: isDefault ? 'var(--color-text-disabled)' : 'var(--color-text-subtle)', fontFamily: DS.font, fontSize: '12px', fontWeight: 500, padding: '2px 6px', borderRadius: '6px', transition: 'color 0.15s' }}
            onMouseEnter={e => { if (!isDefault) e.currentTarget.style.color = 'var(--color-text-default)'; }}
            onMouseLeave={e => { if (!isDefault) e.currentTarget.style.color = 'var(--color-text-subtle)'; }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 8a6 6 0 0111.5-2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M14 8a6 6 0 01-11.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><polyline points="2,3 2,7 6,7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Reset
          </button>
          <button title="Collapse" onClick={() => setSettingsOpen(false)} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '26px', height: '26px', borderRadius: '7px', border: 'none', background: 'transparent',
            cursor: 'pointer', color: 'var(--color-icon-subtle)', padding: 0, transition: 'background 0.12s, color 0.12s',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-overlay-subtle)'; e.currentTarget.style.color = 'var(--color-icon-default)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-icon-subtle)'; }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M7 7 L12 12 L7 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><path d="M13 7 L18 12 L13 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>

        {/* Content — unchanged internals, white-themed inside dark wrapper */}
        <div style={{ padding: '14px 16px 18px', display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto', flex: 1, fontFamily: DS.font }}>
          <style>{`
            .env-slider { -webkit-appearance:none; appearance:none; width:100%; height:4px; border-radius:2px; outline:none; cursor:pointer; }
            .env-slider::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:15px; height:15px; border-radius:50%; background:#fff; border:none; cursor:pointer; box-shadow:0 1px 4px rgba(0,0,0,0.4); }
            .env-slider::-moz-range-thumb { width:15px; height:15px; border-radius:50%; background:#fff; border:none; cursor:pointer; box-shadow:0 1px 4px rgba(0,0,0,0.4); }
          `}</style>

          {/* Presets */}
          <div>
            <div style={{ fontSize: '11px', letterSpacing: '0.04em', color: 'var(--color-text-subtle)', textTransform: 'uppercase', fontWeight: '600', marginBottom: '10px' }}>Presets</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
              {ENV_PRESETS.slice(0, 8).map(({ id, label }) => {
                const active = scene.envPreset === id;
                return (
                  <button key={id} onClick={() => onUpdate({ ...scene, envPreset: id })} style={{
                    padding: '7px 2px', background: active ? DS.accent : 'var(--color-overlay-subtle)',
                    border: `1px solid ${active ? DS.accent : 'var(--color-border-default)'}`,
                    borderRadius: '8px', color: active ? '#fff' : 'var(--color-text-subtle)',
                    fontFamily: DS.font, fontSize: '11px', fontWeight: active ? '600' : '500',
                    cursor: 'pointer', transition: 'all 0.12s', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}
                    onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'var(--color-overlay-medium)'; e.currentTarget.style.color = 'var(--color-text-default)'; } }}
                    onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'var(--color-overlay-subtle)'; e.currentTarget.style.color = 'var(--color-text-subtle)'; } }}
                  >{label}</button>
                );
              })}
            </div>
          </div>

          {/* Brightness */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ fontSize: '11px', letterSpacing: '0.04em', color: 'var(--color-text-subtle)', textTransform: 'uppercase', fontWeight: '600' }}>Brightness</div>
              <span style={{ fontSize: '12px', color: 'var(--color-text-subtle)', fontFamily: DS.font, fontVariantNumeric: 'tabular-nums' }}>{scene.tonemapping.toFixed(1)}</span>
            </div>
            <input className="env-slider" type="range" min={0.3} max={2.0} step={0.05} value={scene.tonemapping}
              onChange={e => onUpdate({ ...scene, tonemapping: parseFloat(e.target.value) })}
              style={{ background: `linear-gradient(to right, var(--color-text-default) 0%, var(--color-text-default) ${((scene.tonemapping - 0.3) / 1.7) * 100}%, var(--color-overlay-medium) ${((scene.tonemapping - 0.3) / 1.7) * 100}%, var(--color-overlay-medium) 100%)` }} />
          </div>

          {/* Background — Sky / Horizon / Floor */}
          <div>
            <div style={{ fontSize: '11px', letterSpacing: '0.04em', color: 'var(--color-text-subtle)', textTransform: 'uppercase', fontWeight: '600', marginBottom: '10px' }}>Background</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { label: 'Sky', key: 'skyColor' },
                { label: 'Horizon', key: 'bgColor' },
                { label: 'Floor', key: 'floorColor' },
              ].map(({ label, key }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: 'var(--color-text-default)', fontFamily: DS.font }}>{label}</span>
                  <input type="color" value={scene[key]}
                    onChange={e => onUpdate({ ...scene, [key]: e.target.value, ...(key === 'bgColor' ? { fogColor: e.target.value } : {}) })}
                    style={{ width: '28px', height: '22px', border: '1px solid var(--color-border-default)', cursor: 'pointer', background: 'none', padding: '1px', borderRadius: '6px' }} />
                </div>
              ))}
            </div>
          </div>

          {/* Camera — FOV + auto rotate */}
          <div>
            <div style={{ fontSize: '11px', letterSpacing: '0.04em', color: 'var(--color-text-subtle)', textTransform: 'uppercase', fontWeight: '600', marginBottom: '10px' }}>Camera</div>

            {/* Field of view */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '13px', color: 'var(--color-text-default)', fontFamily: DS.font }}>Field of view</span>
                <span style={{ fontSize: '12px', color: 'var(--color-text-subtle)', fontFamily: DS.font, fontVariantNumeric: 'tabular-nums' }}>{Math.round(scene.cameraFov ?? 47)}°</span>
              </div>
              <input className="env-slider" type="range" min={20} max={90} step={1} value={scene.cameraFov ?? 47}
                onChange={e => onUpdate({ ...scene, cameraFov: parseFloat(e.target.value) })}
                style={{ background: `linear-gradient(to right, var(--color-text-default) 0%, var(--color-text-default) ${(((scene.cameraFov ?? 47) - 20) / 70) * 100}%, var(--color-overlay-medium) ${(((scene.cameraFov ?? 47) - 20) / 70) * 100}%, var(--color-overlay-medium) 100%)` }} />
            </div>

            {/* Auto rotate toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '13px', color: 'var(--color-text-default)', fontFamily: DS.font }}>Auto rotate</span>
              <button
                onClick={() => onToggleAutoRotate?.()}
                role="switch" aria-checked={!!autoRotate}
                style={{
                  position: 'relative', width: '36px', height: '20px', borderRadius: '999px',
                  border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0,
                  background: autoRotate ? DS.accent : 'var(--color-overlay-medium)',
                  transition: 'background 0.18s',
                }}
              >
                <span style={{
                  position: 'absolute', top: '2px', left: autoRotate ? '18px' : '2px',
                  width: '16px', height: '16px', borderRadius: '50%', background: '#fff',
                  transition: 'left 0.18s', boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                }} />
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   SAVED TOOLTIPS PANEL — works in both view and edit mode
   ═══════════════════════════════════════════════════════════════════════════════ */
const SavedTooltipsPanel = ({ tooltips, onRemove, selectedId, onSelect, onMove, onRename, onSetCamera, onClearCamera, onUpdateTooltip, panelOpen, setPanelOpen, editMode, onFlyTo, sortBy, setSortBy, currentUser, setCurrentUser, isPinSeen, redlines, activeCommentId }) => {
  const displayList = useMemo(() => {
    const list = [...tooltips];
    if (sortBy === 'alpha') list.sort((a, b) => a.label.localeCompare(b.label));
    else list.sort((a, b) => (a.sequenceNumber || a.id) - (b.sequenceNumber || b.id));
    return list;
  }, [tooltips, sortBy]);

  const isOpen = panelOpen && tooltips.length > 0;
  return (
    <div style={{
      position: 'fixed', top: '100px', right: isOpen ? '16px' : '-288px',
      transition: 'right 0.3s cubic-bezier(0.4,0,0.2,1)',
      display: 'flex', flexDirection: 'row', alignItems: 'flex-start',
      zIndex: 30, userSelect: 'none',
      filter: 'drop-shadow(0 8px 32px rgba(0,0,0,0.11)) drop-shadow(0 2px 8px rgba(0,0,0,0.06))',
    }}>
      {/* Tab — ear tucked behind panel's rounded corner */}
      <div onClick={() => tooltips.length > 0 && setPanelOpen((v) => !v)} style={{
        width: '44px', height: '80px', flexShrink: 0,
        background: '#fafafa',
        border: '1px solid rgba(0,0,0,0.10)',
        borderRadius: '10px 0 0 10px',
        cursor: tooltips.length > 0 ? 'pointer' : 'default',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', zIndex: 1,
      }}>
        <div style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', transform: 'rotate(180deg)', fontFamily: UI.font, fontSize: '9px', letterSpacing: '0.14em', color: UI.gold, textTransform: 'uppercase', fontWeight: '700' }}>
          {tooltips.length > 0 ? `${tooltips.length} Pins` : 'Pins'}
        </div>
      </div>

      {/* Panel — sits over the tab's right edge */}
      <div style={{
        width: '288px', maxHeight: 'calc(100vh - 120px)', overflow: 'hidden',
        background: '#fafafa',
        border: '1px solid var(--color-overlay-medium)',
        borderRadius: '18px',
        backdropFilter: UI.glassBlur, WebkitBackdropFilter: UI.glassBlur,
        position: 'relative', zIndex: 2,
        marginLeft: '-10px',           /* slide 10px over the tab */
        display: 'flex', flexDirection: 'column', fontFamily: UI.font, boxSizing: 'border-box',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 18px 12px', borderBottom: `1px solid var(--color-overlay-divider)`, flexShrink: 0, background: UI.bgPanel }}>
          <div style={{ fontSize: '9px', letterSpacing: '0.2em', color: UI.textDim, textTransform: 'uppercase', marginBottom: '8px', fontWeight: '600' }}>
            {editMode ? 'Comments' : 'Design Notes'}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '12px' }}>
            <div style={{ fontSize: '16px', fontWeight: '600', color: UI.text, letterSpacing: '-0.02em' }}>Pins</div>
            {tooltips.length > 0 && <div style={{ fontSize: '11px', color: UI.textMid, fontWeight: '500' }}>{tooltips.length} placed</div>}
          </div>

          {/* Sort controls */}
          {tooltips.length > 0 && (
            <div style={{ display: 'flex', gap: '6px' }}>
              {[{ label: '1 → 9', value: 'sequence', title: 'Sort by creation order' }, { label: 'A → Z', value: 'alpha', title: 'Sort alphabetically by title' }].map(({ label, value, title }) => (
                <button key={value} type="button" title={title} onClick={() => setSortBy(value)} style={{
                  flex: 1, padding: '7px 4px', fontSize: '9px', fontWeight: sortBy === value ? '700' : '500',
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  background: sortBy === value ? UI.gold : 'rgba(0,0,0,0.04)',
                  color: sortBy === value ? '#fff' : UI.textMid,
                  border: `1px solid ${sortBy === value ? UI.gold : 'rgba(0,0,0,0.1)'}`,
                  borderRadius: '8px', cursor: 'pointer', transition: 'background 0.15s, border-color 0.15s, color 0.15s',
                }}>{label}</button>
              ))}
            </div>
          )}
        </div>

        {/* Current user row — only in Comments mode */}
        {editMode && (
          <div style={{ padding: '10px 18px', borderBottom: `1px solid rgba(0,0,0,0.06)`, display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0, background: 'rgba(108,92,231,0.05)' }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}><circle cx="8" cy="5" r="3" stroke={UI.purple} strokeWidth="1.2"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke={UI.purple} strokeWidth="1.2" strokeLinecap="round"/></svg>
            <span style={{ fontSize: '9px', letterSpacing: '0.12em', color: UI.textDim, textTransform: 'uppercase', flexShrink: 0, fontWeight: '600' }}>You</span>
            <input value={currentUser} onChange={e => setCurrentUser(e.target.value)} placeholder="Your name"
              style={{ flex: 1, background: 'transparent', border: 'none', borderBottom: `1px solid rgba(0,0,0,0.1)`, color: UI.purple, fontFamily: UI.font, fontSize: '12px', fontWeight: '500', padding: '2px 0', outline: 'none', minWidth: 0 }} />
          </div>
        )}

        {/* Comment list */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '6px 0 10px', display: 'flex', flexDirection: 'column', background: '#fafafa' }}>
          {displayList.length === 0 ? (
            <div style={{ textAlign: 'center', color: UI.textMid, fontSize: '12px', marginTop: '36px', lineHeight: '1.65', padding: '0 22px' }}>
              <span style={{ color: UI.text }}>{editMode ? 'Click on the model to add a comment.' : 'Switch to Comments mode to add comments.'}</span>
            </div>
          ) : displayList.map((t, i) => {
            const isSelected = selectedId === t.id;
            const seqNum = t.sequenceNumber || (tooltips.findIndex(x => x.id === t.id) + 1);
            const seen = isPinSeen(t.id);
            const previewGlyph = sortBy === 'alpha' ? firstInitialFromAuthorOrLabel(t.author, t.label) : String(seqNum);
            const isAlphaGlyph = sortBy === 'alpha';
            const rowBg = isSelected ? 'rgba(108,92,231,0.08)' : (!seen ? UI.unreadRowBg : 'transparent');
            const leftBar = isSelected ? UI.gold : (!seen ? UI.unreadAccent : 'transparent');
            return (
              <div key={t.id}>
                {i > 0 && <div style={{ height: '1px', margin: '0 12px', background: UI.border }} />}
                <div
                  onClick={() => {
                    const newSelected = isSelected ? null : t.id;
                    onSelect(newSelected);
                    if (newSelected && !editMode && onFlyTo && (t.hasCamera || t.cameraView)) { onFlyTo(t); }
                  }}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: rowBg, padding: '11px 16px 11px 14px',
                    cursor: 'pointer', userSelect: 'none', transition: 'background 0.18s',
                    borderLeft: `3px solid ${leftBar}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                    <div style={{
                      width: '22px', height: '22px', borderRadius: '50%',
                      background: isSelected ? UI.gold : (!seen ? UI.unreadBadgeBg : 'var(--color-overlay-divider)'),
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <span style={{
                        fontSize: isAlphaGlyph ? '10px' : '9px', fontWeight: '700',
                        color: isSelected ? '#fff' : (!seen ? UI.unreadAccent : UI.textMid),
                        fontVariantNumeric: isAlphaGlyph ? 'normal' : 'tabular-nums', lineHeight: 1,
                      }}>{previewGlyph}</span>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontSize: '12px',
                        color: isSelected || !seen ? UI.text : UI.textMid,
                        fontWeight: isSelected || !seen ? '600' : '500',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        letterSpacing: '-0.01em',
                      }}>{t.label}</div>
                      {t.author && <div style={{ fontSize: '10px', color: isSelected ? UI.textMid : UI.textDim, marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.author}</div>}
                      {!editMode && t.description && <div style={{ fontSize: '11px', color: UI.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '3px', lineHeight: 1.35 }}>{t.description}</div>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                    {(() => {
                      const annotCount = (redlines || []).filter(r => r.parentCommentId === t.id).length;
                      if (annotCount === 0) return null;
                      return (
                        <span style={{
                          fontSize: '9px', fontWeight: '600', color: '#e05a5a',
                          background: 'rgba(224,90,90,0.10)', borderRadius: '999px', padding: '1px 6px',
                          flexShrink: 0,
                        }}>✏ {annotCount}</span>
                      );
                    })()}
                    {!editMode && (t.hasCamera || t.cameraView) && (
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{ opacity: 0.35, color: UI.textMid }}>
                        <path d="M12 4l-4 3 4 3V4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                        <rect x="1" y="3" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                      </svg>
                    )}
                    <button
                      type="button"
                      title={isSelected ? 'Collapse' : 'Expand'}
                      onClick={(e) => {
                        e.stopPropagation();
                        const newSelected = isSelected ? null : t.id;
                        onSelect(newSelected);
                        if (newSelected && !editMode && onFlyTo && (t.hasCamera || t.cameraView)) onFlyTo(t);
                      }}
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: '32px', height: '32px', margin: '-4px -2px -4px 0', color: isSelected ? UI.purple : UI.textDim,
                        flexShrink: 0, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', borderRadius: '8px',
                        transition: 'color 0.15s, background 0.15s',
                      }}
                      onMouseEnter={(e) => { if (!isSelected) { e.currentTarget.style.color = UI.textMid; e.currentTarget.style.background = UI.bgRow; } }}
                      onMouseLeave={(e) => { if (!isSelected) { e.currentTarget.style.color = UI.textDim; e.currentTarget.style.background = 'transparent'; } }}
                    >
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: '22px', height: '22px',
                        transition: 'transform 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
                        transform: isSelected ? 'rotate(45deg)' : 'none',
                      }}>
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden style={{ display: 'block' }}>
                          <line x1="6" y1="1.5" x2="6" y2="10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                          <line x1="1.5" y1="6" x2="10.5" y2="6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                        </svg>
                      </span>
                    </button>
                    {editMode && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(t.id); }} style={{ background: 'none', border: 'none', color: '#d1d1d6', cursor: 'pointer', fontSize: '12px', lineHeight: 1, padding: '0 4px' }}
                        onMouseEnter={(e) => e.currentTarget.style.color = UI.red} onMouseLeave={(e) => e.currentTarget.style.color = '#d1d1d6'}>✕</button>
                    )}
                  </div>
                </div>
                {isSelected && <ExpandedEditor t={t} onMove={onMove} onRename={onRename} onSetCamera={onSetCamera} onClearCamera={onClearCamera} onUpdateTooltip={onUpdateTooltip} />}
                {isSelected && (() => {
                  const linked = (redlines || []).filter(r => r.parentCommentId === t.id);
                  if (linked.length === 0) return null;
                  return (
                    <div style={{ background: 'rgba(224,90,90,0.04)', borderTop: '1px solid var(--color-overlay-divider)', padding: '10px 16px' }}>
                      <div style={{ fontSize: '7px', letterSpacing: '0.2em', color: UI.textDim, textTransform: 'uppercase', marginBottom: '8px', fontWeight: '600' }}>Linked Annotations <span style={{ color: UI.textMid }}>{linked.length}</span></div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {linked.map(stroke => (
                          <div key={stroke.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 8px', background: 'rgba(0,0,0,0.03)', borderRadius: '6px', border: '1px solid var(--color-overlay-divider)' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: stroke.color, flexShrink: 0 }} />
                            <span style={{ fontSize: '10px', color: UI.textMid, flex: 1 }}>{stroke.name}</span>
                            <span style={{ fontSize: '9px', color: UI.textDim }}>Stroke</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 18px', borderTop: `1px solid var(--color-overlay-divider)`, flexShrink: 0, background: UI.bgPanel }}>
          <button type="button" onClick={() => setPanelOpen(false)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: UI.gold, border: `1px solid ${UI.gold}`, borderRadius: '10px', color: '#ffffff', fontFamily: UI.font, fontSize: '10px', fontWeight: '700', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '10px 0', cursor: 'pointer' }}>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><polyline points="2,8 6,12 14,4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   TOP BAR
   ═══════════════════════════════════════════════════════════════════════════════ */
const HOTKEYS = [
  { group: 'Navigation' },
  { key: '1 – 6',        desc: 'Jump to viewpoint' },
  { key: 'Shift + ← →', desc: 'Step through viewpoints' },
  { key: 'V',            desc: 'View cube' },
  { key: 'S',            desc: 'Mode selector' },
  { key: 'L',            desc: 'Layers drawer' },
  { key: 'E',            desc: 'Scene drawer' },
  { key: 'H',            desc: 'Keyboard shortcuts' },
  { group: 'Presentation' },
  { key: 'Tab',          desc: 'Enter / exit mode' },
  { key: '← →',         desc: 'Navigate views' },
  { key: 'Enter',        desc: 'Play / pause' },
];

const ROLES = [
  { id: 'view',   label: 'View',   desc: 'Navigate, laser pointer',
    dotColor: '#92F5B5', outerColor: '#D3FAE3', innerColor: '#92F5B5',
    iconStroke: '#1A1A1B', iconWhite: false },
  { id: 'review', label: 'Review', desc: 'Comment, redline, screenshot',
    dotColor: '#FFBC3A', outerColor: '#FFDD9C', innerColor: '#FFBC3A',
    iconStroke: '#1A1A1B', iconWhite: false },
  { id: 'create', label: 'Create', desc: 'Edit, create, delete',
    dotColor: DS.accent, outerColor: UI.purpleLight, innerColor: DS.accent,
    iconStroke: 'white', iconWhite: true },
];

/* ── Figma design tokens ── */
const FG = {
  pill:      'var(--color-surface-float-default)',  // theme-responsive: white / greys-800
  bar:       'var(--color-panel-halo)',
  text:      'var(--color-text-default)',
  textDim:   'var(--color-text-subtle)',
  textMuted: 'var(--color-text-disabled)',
  titleSub:  'var(--color-text-subtle)',
  font: "'Inter', sans-serif",
};

/* Shared dark pill button */
const DarkPillBtn = ({ onClick, children, style = {}, title, onMouseEnter, onMouseLeave }) => {
  const [hov, setHov] = useState(false);
  return (
    <button
      title={title}
      onPointerDown={e => { e.stopPropagation(); onClick?.(); }}
      onMouseEnter={e => { setHov(true); onMouseEnter?.(e); }} onMouseLeave={e => { setHov(false); onMouseLeave?.(e); }}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: hov ? 'var(--color-background-subtle-hovered)' : FG.pill,
        border: 'none', borderRadius: '8px', cursor: 'pointer',
        color: FG.text, fontFamily: FG.font, transition: 'background 0.15s',
        ...style,
      }}
    >{children}</button>
  );
};

/* Chevron down icon */
const ChevronDown = ({ color = '#504C55' }) => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
    <path d="M3.75 5.625L7.5 9.375L11.25 5.625" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const ROLE_CURSORS = {
  view:   '/icons/cursor-view.png',
  review: '/icons/cursor-review.png',
  create: '/icons/cursor-create.png',
};

const BottomCursorIndicator = ({ role }) => (
  <div style={{
    position: 'fixed', bottom: '32px', left: '50%', transform: 'translateX(-50%)',
    zIndex: 40, pointerEvents: 'none', userSelect: 'none',
  }}>
    <img
      src={ROLE_CURSORS[role] || ROLE_CURSORS.view}
      alt=""
      style={{ width: '72px', height: '72px', objectFit: 'contain', display: 'block' }}
    />
  </div>
);

/* Top-left toggle icons — exact Figma exports (Layers_icon / Environment_icon). Uses currentColor so the button's color prop drives them. */
const LayersToggleGlyph = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 18.3337 18.235" fill="none" style={{ display: 'block' }}>
    <path d="M0.833516 9.11749L8.86871 13.1351C8.97803 13.1897 9.03268 13.2171 9.09002 13.2278C9.14079 13.2374 9.1929 13.2374 9.24368 13.2278C9.30101 13.2171 9.35567 13.1897 9.46499 13.1351L17.5002 9.11749M0.833516 13.2842L8.86871 17.3017C8.97803 17.3564 9.03268 17.3837 9.09002 17.3945C9.14079 17.404 9.1929 17.404 9.24368 17.3945C9.30101 17.3837 9.35567 17.3564 9.46499 17.3017L17.5002 13.2842M0.833516 4.95082L8.86871 0.933224C8.97803 0.878564 9.03268 0.851235 9.09002 0.840478C9.14079 0.830952 9.1929 0.830952 9.24368 0.840478C9.30101 0.851235 9.35567 0.878564 9.46499 0.933224L17.5002 4.95082L9.46499 8.96841C9.35567 9.02307 9.30101 9.0504 9.24368 9.06116C9.1929 9.07069 9.14079 9.07069 9.09002 9.06116C9.03268 9.0504 8.97803 9.02307 8.86871 8.96841L0.833516 4.95082Z" stroke="currentColor" strokeWidth="1.66667" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const EnvironmentToggleGlyph = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" style={{ display: 'block' }}>
    <path fillRule="evenodd" clipRule="evenodd" d="M10 1.53846C5.32682 1.53846 1.53846 5.32682 1.53846 10C1.53846 12.5295 2.64843 14.7998 4.40789 16.3504L12.1224 8.63586C12.2893 8.46894 12.4457 8.31255 12.5877 8.19197C12.7418 8.06113 12.9289 7.92791 13.1694 7.84979C13.5092 7.73936 13.8754 7.73936 14.2153 7.84979C14.4557 7.92791 14.6428 8.06113 14.7969 8.19197C14.9389 8.31254 15.0953 8.46892 15.2621 8.63583L18.2967 11.6704C18.4048 11.1304 18.4615 10.5718 18.4615 10C18.4615 5.32682 14.6732 1.53846 10 1.53846ZM4.00744 18.0063C5.67749 19.2583 7.75213 20 10 20C15.5228 20 20 15.5228 20 10C20 4.47715 15.5228 0 10 0C4.47715 0 0 4.47715 0 10C0 13.2682 1.56782 16.1702 3.99238 17.995C3.99736 17.9988 4.00239 18.0026 4.00744 18.0063ZM6.76923 5.69231C6.17446 5.69231 5.69231 6.17446 5.69231 6.76923C5.69231 7.364 6.17446 7.84615 6.76923 7.84615C7.364 7.84615 7.84615 7.364 7.84615 6.76923C7.84615 6.17446 7.364 5.69231 6.76923 5.69231ZM4.15385 6.76923C4.15385 5.32479 5.32479 4.15385 6.76923 4.15385C8.21367 4.15385 9.38462 5.32479 9.38462 6.76923C9.38462 8.21367 8.21367 9.38462 6.76923 9.38462C5.32479 9.38462 4.15385 8.21367 4.15385 6.76923Z" fill="currentColor" />
  </svg>
);

/* Comments / Sketches floating-button icons — exact Figma exports */
const CommentsPanelGlyph = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" style={{ display: 'block' }}>
    <path d="M5.83333 7.08333H10M5.83333 10H12.5M8.06979 15H13.5C14.9001 15 15.6002 15 16.135 14.7275C16.6054 14.4878 16.9878 14.1054 17.2275 13.635C17.5 13.1002 17.5 12.4001 17.5 11V6.5C17.5 5.09987 17.5 4.3998 17.2275 3.86502C16.9878 3.39462 16.6054 3.01217 16.135 2.77248C15.6002 2.5 14.9001 2.5 13.5 2.5H6.5C5.09987 2.5 4.3998 2.5 3.86502 2.77248C3.39462 3.01217 3.01217 3.39462 2.77248 3.86502C2.5 4.3998 2.5 5.09987 2.5 6.5V16.9463C2.5 17.3903 2.5 17.6123 2.59102 17.7263C2.67019 17.8255 2.79022 17.8832 2.91712 17.8831C3.06302 17.8829 3.23639 17.7442 3.58313 17.4668L5.57101 15.8765C5.9771 15.5517 6.18014 15.3892 6.40624 15.2737C6.60683 15.1712 6.82036 15.0963 7.04101 15.051C7.28972 15 7.54975 15 8.06979 15Z" stroke="currentColor" strokeWidth="1.39167" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const AnnotationsPanelGlyph = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" style={{ display: 'block' }}>
    <path d="M1.66797 8.66255C1.66797 8.66255 6.09748 1.76751 8.7508 3.66264C11.668 5.74621 -0.415365 14.4959 4.16797 16.5793C7.5013 18.0944 11.6677 5.74593 14.5846 6.99593C17.5015 8.24593 10.0018 14.9125 13.3346 16.5793C15.8341 17.8293 19.1675 9.91273 19.1675 9.91273" stroke="currentColor" strokeWidth="1.66667" strokeLinecap="round" />
  </svg>
);

const TopBar = ({ logoMenuOpen, setLogoMenuOpen, onNewFile, onImportFile, fileName, layersOpen, setLayersOpen, settingsOpen, setSettingsOpen, cubeDocked, setCubeDocked }) => {
  const [eyeOpen, setEyeOpen] = useState(false);

  /* H key → shortcuts */
  useEffect(() => {
    const onKey = (e) => {
      if ((e.key === 'h' || e.key === 'H') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
        setEyeOpen(v => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* Close all dropdowns on outside click */
  useEffect(() => {
    if (!eyeOpen && !logoMenuOpen) return;
    const close = () => { setEyeOpen(false); setLogoMenuOpen(false); };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [eyeOpen, logoMenuOpen, setLogoMenuOpen]);

  return (
    <>
      {/* ══════════════════════════════════════
          LEFT NAV — logo header, then Layers / Environment toggles below
          ══════════════════════════════════════ */}
      <div style={{
        position: 'fixed', top: '8px', left: '8px', zIndex: 50,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '8px',
        userSelect: 'none', fontFamily: FG.font,
      }}>
        {/* Header row — logo (32×32) + title */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '4px',
          background: FG.bar, borderRadius: '12px', padding: '4px',
        }}>
        {/* Logo + title pill */}
        <div style={{ position: 'relative' }}>
          <DarkPillBtn
            onClick={() => setLogoMenuOpen(v => !v)}
            style={{ height: '40px', padding: '0 10px 0 8px', gap: '8px', borderRadius: '8px', minWidth: 0 }}
          >
            {/* GS Logo — dark: silver gradients, light: Figma 14:5448 purple. CSS in tokens.css. */}
            <svg className="gs-logo-dark" width="24" height="24" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
              <path d="M12.4301 30.0739C12.1281 30.5076 11.9742 30.975 11.8379 31.4564C13.1541 31.8071 14.5371 31.9941 15.9637 31.9941C17.0919 31.9941 18.1929 31.8773 19.2552 31.655C21.1489 31.2588 22.4182 30.3261 24.0001 29.3245L24.4379 28.3566L23.4373 24.2039L19.6848 23.9229C19.6848 23.9229 19.7064 24.108 19.6223 24.1726C19.5851 24.2014 19.2593 24.3344 19.2593 24.3344C18.2355 24.7437 17.1182 24.9688 15.9481 24.9688C15.8608 24.9688 15.7739 24.9673 15.6873 24.9648C15.4918 25.9692 14.9236 26.8819 14.3376 27.7946C13.7748 28.6688 13.0243 29.1996 12.4301 30.0739Z" fill="url(#gsL0)"/>
              <path d="M0 16.0549C0 23.4333 5.02106 29.6408 11.8377 31.4568C11.974 30.9756 12.1278 30.5079 12.4299 30.0742C13.0241 29.2 13.7745 28.6692 14.3374 27.7949C14.9234 26.8822 15.4916 25.9696 15.687 24.9651C11.2942 24.839 7.69873 21.539 7.11836 17.2814C4.59235 17.1143 2.28773 16.0324 0.0490945 14.7979C0.0165735 15.2125 0 15.6318 0 16.0549Z" fill="#CCCCCC"/>
              <path d="M9.08405 2.59741C9.28199 2.18994 9.48744 1.78872 9.69632 1.39062C4.36162 3.6665 0.520696 8.75966 0.0488281 14.7976C2.28746 16.0322 4.59239 17.1141 7.11809 17.2811C7.06399 16.8852 7.03554 16.4812 7.03554 16.0703C7.03554 13.4188 8.19723 11.0387 10.0397 9.40848C9.06279 7.23502 7.93768 4.93885 9.08374 2.59741H9.08405Z" fill="url(#gsL1)"/>
              <path d="M20.148 8.22051C19.502 6.2319 18.7074 4.25827 19.0592 2.09792C19.1477 1.53902 19.2987 1.0101 19.5004 0.508025C18.3628 0.251056 17.1789 0.115234 15.9635 0.115234C14.748 0.115234 13.5875 0.248246 12.4599 0.500219C11.5034 0.714099 10.5794 1.01384 9.69628 1.39071C9.48708 1.78881 9.28164 2.19003 9.08401 2.59749C7.93827 4.93894 9.06306 7.23511 10.0399 9.40857C11.6125 8.01694 13.681 7.17172 15.9478 7.17172C17.4666 7.17172 18.8966 7.55171 20.148 8.22051Z" fill="url(#gsL2)"/>
              <path d="M31.9266 16.0546C31.9266 8.4651 26.6144 2.11488 19.5001 0.507812C19.2984 1.00957 19.1477 1.53881 19.0589 2.09771C18.7074 4.25805 19.502 6.23168 20.1477 8.2203C22.9517 9.71934 24.8595 12.6721 24.8595 16.0702C24.8595 16.0702 24.7814 17.3035 25.6882 18.3339C26.6964 19.4791 29.0654 20.4883 31.0041 18.49C31.9488 17.5164 31.9266 16.0546 31.9266 16.0546Z" fill="#CCCCCC"/>
              <path d="M19.2156 31.6662C19.2156 31.6662 22.0925 31.2916 24.5628 29.4182C27.5813 27.1292 27.94 23.0486 24.7817 19.9575C19.2706 14.5636 12.6801 7.78034 12.6801 7.78034C12.6801 7.78034 10.7733 6.01435 10.4287 4.59556C9.67817 1.50444 12.8677 0.411621 12.8677 0.411621C12.8677 0.411621 9.99087 0.911195 7.42672 2.59726C4.88257 4.27021 3.22087 8.35797 7.64561 12.7761C12.0703 17.1942 19.2781 24.2663 19.2781 24.2663C19.2781 24.2663 21.3467 26.2696 21.6547 27.8258C22.1863 30.511 19.2156 31.6662 19.2156 31.6662Z" fill="#CCCCCC"/>
              <defs>
                <linearGradient id="gsL0" x1="12.385" y1="27.298" x2="24.899" y2="28.767" gradientUnits="userSpaceOnUse"><stop offset="0.19" stopColor="#CCCCCC"/><stop offset="0.7" stopColor="#999999"/></linearGradient>
                <linearGradient id="gsL1" x1="3.193" y1="14.018" x2="6.441" y2="6.994" gradientUnits="userSpaceOnUse"><stop stopColor="#CCCCCC"/><stop offset="1" stopColor="#999999"/></linearGradient>
                <linearGradient id="gsL2" x1="10.365" y1="4.812" x2="20.091" y2="4.284" gradientUnits="userSpaceOnUse"><stop stopColor="white"/><stop offset="0.71" stopColor="#CCCCCC"/></linearGradient>
              </defs>
            </svg>
            <svg className="gs-logo-purple" width="24" height="24" viewBox="0 0 31.927 31.8791" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
              <path d="M12.4299 29.9588C12.1278 30.3925 11.974 30.8599 11.8377 31.3414C13.1538 31.6921 14.5369 31.8791 15.9635 31.8791C17.0917 31.8791 18.1927 31.7623 19.255 31.54C21.1487 31.1438 22.4179 30.2111 23.9999 29.2095L24.4377 28.2416L23.437 24.0888L19.6846 23.8078C19.6846 23.8078 19.7062 23.993 19.6221 24.0576C19.5849 24.0863 19.259 24.2194 19.259 24.2194C18.2352 24.6287 17.1179 24.8538 15.9478 24.8538C15.8606 24.8538 15.7736 24.8523 15.687 24.8498C15.4916 25.8542 14.9234 26.7669 14.3374 27.6795C13.7745 28.5538 13.0241 29.0846 12.4299 29.9588Z" fill="url(#gla0)"/>
              <path d="M0 15.9395C0 23.3179 5.02106 29.5255 11.8377 31.3414C11.974 30.8603 12.1278 30.3925 12.4299 29.9588C13.0241 29.0846 13.7745 28.5538 14.3374 27.6795C14.9234 26.7669 15.4916 25.8542 15.687 24.8498C11.2942 24.7236 7.69873 21.4236 7.11836 17.166C4.59235 16.9989 2.28773 15.9171 0.0490945 14.6825C0.0165735 15.0971 0 15.5165 0 15.9395Z" fill="#6530F7"/>
              <path d="M9.084 2.48226C9.28194 2.07479 9.48739 1.67357 9.69627 1.27548C4.36157 3.55135 0.520649 8.64451 0.0487815 14.6825C2.28742 15.9171 4.59235 16.999 7.11804 17.166C7.06395 16.7701 7.03549 16.3661 7.03549 15.9552C7.03549 13.3037 8.19718 10.9235 10.0396 9.29333C9.06274 7.11987 7.93764 4.8237 9.08369 2.48226H9.084Z" fill="url(#gla1)"/>
              <path d="M20.148 8.10528C19.502 6.11666 18.7074 4.14303 19.0592 1.98269C19.1477 1.42379 19.2987 0.894862 19.5004 0.39279C18.3628 0.135822 17.1789 0 15.9635 0C14.748 0 13.5875 0.133012 12.4599 0.384984C11.5034 0.598865 10.5793 0.898609 9.69627 1.27548C9.48708 1.67357 9.28163 2.07479 9.084 2.48226C7.93826 4.8237 9.06305 7.11987 10.0399 9.29333C11.6125 7.9017 13.681 7.05649 15.9478 7.05649C17.4666 7.05649 18.8966 7.43648 20.148 8.10528Z" fill="url(#gla2)"/>
              <path d="M31.9269 15.9395C31.9269 8.35007 26.6147 1.99986 19.5004 0.39279C19.2987 0.89455 19.148 1.42379 19.0592 1.98269C18.7077 4.14303 19.5023 6.11666 20.148 8.10528C22.952 9.60432 24.8598 12.5571 24.8598 15.9552C24.8598 15.9552 24.7817 17.1885 25.6885 18.2189C26.6966 19.3641 29.0657 20.3733 31.0044 18.375C31.9491 17.4014 31.9269 15.9395 31.9269 15.9395Z" fill="#6530F7"/>
              <path transform="translate(4.885,0.411)" d="M14.3201 31.2546C14.3201 31.2546 17.1969 30.8799 19.6673 29.0065C22.6858 26.7175 23.0445 22.637 19.8862 19.5458C14.3751 14.152 7.78461 7.36872 7.78461 7.36872C7.78461 7.36872 5.87775 5.60273 5.53315 4.18393C4.78266 1.09282 7.97223 0 7.97223 0C7.97223 0 5.09537 0.499574 2.53121 2.18564C-0.0129388 3.85859 -1.67464 7.94635 2.7501 12.3645C7.17484 16.7826 14.3826 23.8547 14.3826 23.8547C14.3826 23.8547 16.4512 25.858 16.7592 27.4141C17.2908 30.0994 14.3201 31.2546 14.3201 31.2546Z" fill="#6530F7"/>
              <defs>
                <linearGradient id="gla0" x1="12.385" y1="27.183" x2="24.899" y2="28.652" gradientUnits="userSpaceOnUse"><stop offset="0.3" stopColor="#6530F7"/><stop offset="0.81" stopColor="#3D169C"/></linearGradient>
                <linearGradient id="gla1" x1="3.193" y1="13.903" x2="6.441" y2="6.879" gradientUnits="userSpaceOnUse"><stop stopColor="#6530F7"/><stop offset="1" stopColor="#3D169C"/></linearGradient>
                <linearGradient id="gla2" x1="10.365" y1="4.697" x2="20.091" y2="4.169" gradientUnits="userSpaceOnUse"><stop stopColor="#9885FF"/><stop offset="0.71" stopColor="#6530F7"/></linearGradient>
              </defs>
            </svg>
            <span style={{ fontSize: '14px', fontWeight: '500', color: FG.text, whiteSpace: 'nowrap', lineHeight: 1.25 }}>
              Screen Experience V1
            </span>
          </DarkPillBtn>

          {logoMenuOpen && (
            <div onPointerDown={e => e.stopPropagation()} style={{
              position: 'absolute', top: '52px', left: 0, zIndex: 200,
              background: DS.surface, borderRadius: '12px', padding: '8px 0',
              boxShadow: '0 4px 6px rgba(16,24,40,0.08), 0 12px 16px rgba(16,24,40,0.14)',
              minWidth: '220px', userSelect: 'none',
            }}>
              {(() => {
                const MENU_FONT = "'Noto Sans', sans-serif";
                const Item = ({ label, shortcut, chevron, externalLink, onClick: handleClick }) => (
                  <div
                    onClick={() => { handleClick?.(); setLogoMenuOpen(false); }}
                    style={{ height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px 0 16px', cursor: 'pointer', borderRadius: '8px', margin: '0 0' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--color-overlay-subtle)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{ fontFamily: MENU_FONT, fontSize: '12px', fontWeight: 400, color: 'var(--color-text-default)', lineHeight: '18px', whiteSpace: 'nowrap' }}>{label}</span>
                    {shortcut && <span style={{ fontFamily: MENU_FONT, fontSize: '12px', fontWeight: 400, color: 'var(--color-text-subtle)', lineHeight: '18px', whiteSpace: 'nowrap', paddingRight: '8px' }}>{shortcut}</span>}
                    {chevron && (
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0 }}>
                        <path d="M7 5l4 4-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                    {externalLink && (
                      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginRight: '3px' }}>
                        <path d="M13.5 6.5V2.5M13.5 2.5H9.5M13.5 2.5L8 8M6.5 3.5H3.5C2.948 3.5 2.5 3.948 2.5 4.5V12.5C2.5 13.052 2.948 13.5 3.5 13.5H11.5C12.052 13.5 12.5 13.052 12.5 12.5V9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                );
                const Divider = () => (
                  <div style={{ height: '16px', display: 'flex', alignItems: 'center', padding: '0 16px' }}>
                    <div style={{ height: '1px', background: 'var(--color-overlay-divider)', width: '100%' }} />
                  </div>
                );
                const ToggleItem = ({ label, active, onClick: handleClick }) => (
                  <div
                    onClick={() => { handleClick?.(); setLogoMenuOpen(false); }}
                    style={{ height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px 0 16px', cursor: 'pointer', borderRadius: '8px', margin: '0 0' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--color-overlay-subtle)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{ fontFamily: MENU_FONT, fontSize: '12px', fontWeight: 400, color: 'var(--color-text-default)', lineHeight: '18px', whiteSpace: 'nowrap' }}>{label}</span>
                    {active && (
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginRight: '4px' }}>
                        <path d="M3 8l4 4 6-7" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                );
                return (
                  <>
                    <Item label="Undo" shortcut="Cmd + Z" />
                    <Item label="Redo" shortcut="Cmd + Y" />
                    <Item label="Views" chevron />
                    <Item label="Windows" chevron />
                    <ToggleItem label="Dock View Cube" active={cubeDocked} onClick={() => setCubeDocked(v => !v)} />
                    <Divider />
                    <Item label="Settings" chevron />
                    <Divider />
                    <Item label="Import" shortcut="Cmd + I" onClick={onImportFile} />
                    <Item label="Export as..." shortcut="Cmd + E" />
                    <Item label="Export selected" />
                    <Divider />
                    <Item label="Help" />
                    <Divider />
                    <Item label="Open in VR" externalLink />
                    <Item label="Files" externalLink />
                    <Item label="Exit Room" externalLink />
                  </>
                );
              })()}
            </div>
          )}
        </div>
        </div>{/* end header row */}

        {/* Layers / Environment toggles — directly below the logo header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '4px',
          background: FG.bar, borderRadius: '12px', padding: '4px',
        }}>
          <DarkPillBtn onClick={() => { setLayersOpen(v => !v); setSettingsOpen(false); }} style={{ width: '40px', height: '40px', background: layersOpen ? DS.accent : FG.pill, color: layersOpen ? DS.white : FG.text }} title="Layers"
            onMouseEnter={e => { if (!layersOpen) e.currentTarget.style.background = 'var(--color-background-subtle-hovered)'; }}
            onMouseLeave={e => { if (!layersOpen) e.currentTarget.style.background = FG.pill; }}>
            <LayersToggleGlyph size={20} />
          </DarkPillBtn>
          <DarkPillBtn style={{ width: '40px', height: '40px', background: FG.pill, color: FG.text }} title="Environment"
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-background-subtle-hovered)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = FG.pill; }}>
            <EnvironmentToggleGlyph size={20} />
          </DarkPillBtn>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          RIGHT NAV — VR button + mode pill + members + share
          ══════════════════════════════════════════════════════ */}
      <div style={{
        position: 'fixed', top: '8px', right: '8px', zIndex: 50,
        display: 'flex', alignItems: 'center', gap: '4px',
        userSelect: 'none', fontFamily: FG.font,
      }}>
        {/* Nav bar group (members + share) */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '4px',
          background: FG.bar, borderRadius: '12px', padding: '4px',
        }}>
          {/* Online members pill — exact Figma layout */}
          <DarkPillBtn style={{ height: '40px', padding: '0 10px', gap: '8px', borderRadius: '8px' }} title="Online members">
            {/* Slot 1: single avatar + mic-off badge */}
            <div style={{ position: 'relative', width: '32px', height: '32px', flexShrink: 0 }}>
              {/* Avatar circle */}
              <div style={{
                width: '32px', height: '32px', borderRadius: '50%',
                background: '#5a8fe0',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '11px', fontWeight: '700', color: DS.white,
              }}>SV</div>
              {/* Mic-off badge bottom-right */}
              <div style={{
                position: 'absolute', bottom: '-3px', right: '-3px',
                width: '16px', height: '16px', borderRadius: '50%',
                background: DS.red,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                  <line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="white" strokeWidth="1.2" strokeLinecap="round"/>
                  <path d="M5 1.5C5.83 1.5 6.5 2.17 6.5 3V5M3.5 4C3.5 4.83 4.17 5.5 5 5.5C5.42 5.5 5.8 5.33 6.08 5.05M5 7V8.5M3.5 8.5H6.5M3 3C3 2.17 3.94 1.5 5 1.5" stroke="white" strokeWidth="0.9" strokeLinecap="round"/>
                </svg>
              </div>
            </div>

            {/* Slot 2: stacked overlapping avatars (count + photo + initials) */}
            <div style={{ display: 'flex', alignItems: 'center', position: 'relative', width: '64px', height: '32px', flexShrink: 0 }}>
              {/* Count circle — leftmost */}
              <div style={{
                width: '32px', height: '32px', borderRadius: '50%',
                background: 'var(--color-background-subtle-default)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '13px', fontWeight: '600', color: 'var(--color-text-default)',
                position: 'absolute', left: '0', zIndex: 3,
              }}>8</div>
              {/* Photo avatar — middle */}
              <div style={{
                width: '32px', height: '32px', borderRadius: '50%',
                background: '#6abf7b',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '11px', fontWeight: '700', color: DS.white,
                position: 'absolute', left: '16px', zIndex: 2,
              }}>TM</div>
              {/* Initials avatar KL — rightmost */}
              <div style={{
                width: '32px', height: '32px', borderRadius: '50%',
                background: '#FFC9C6',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '11px', fontWeight: '700', color: '#FF4C00',
                position: 'absolute', left: '32px', zIndex: 1,
              }}>KL</div>
            </div>

          </DarkPillBtn>

          {/* Share button */}
          <DarkPillBtn style={{ height: '40px', padding: '0 16px', borderRadius: '8px' }} title="Share">
            <span style={{ fontSize: '14px', fontWeight: '500', color: FG.text }}>Share</span>
          </DarkPillBtn>
        </div>
      </div>

    </>
  );
};

/* ─── Shared right nav — online members + share (used by all layouts) ────────── */
const RightNav = () => (
  <div style={{
    position: 'fixed', top: '8px', right: '8px', zIndex: 50,
    display: 'flex', alignItems: 'center', gap: '4px',
    userSelect: 'none', fontFamily: FG.font,
  }}>
    <div style={{
      display: 'flex', alignItems: 'center', gap: '4px',
      background: FG.bar, borderRadius: '12px', padding: '4px',
    }}>
      <DarkPillBtn style={{ height: '40px', padding: '0 10px', gap: '8px', borderRadius: '8px' }} title="Online members">
        <div style={{ position: 'relative', width: '32px', height: '32px', flexShrink: 0 }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#5a8fe0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', color: DS.white }}>SV</div>
          <div style={{ position: 'absolute', bottom: '-3px', right: '-3px', width: '16px', height: '16px', borderRadius: '50%', background: DS.red, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="white" strokeWidth="1.2" strokeLinecap="round"/><path d="M5 1.5C5.83 1.5 6.5 2.17 6.5 3V5M3.5 4C3.5 4.83 4.17 5.5 5 5.5C5.42 5.5 5.8 5.33 6.08 5.05M5 7V8.5M3.5 8.5H6.5M3 3C3 2.17 3.94 1.5 5 1.5" stroke="white" strokeWidth="0.9" strokeLinecap="round"/></svg>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', position: 'relative', width: '64px', height: '32px', flexShrink: 0 }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--color-background-subtle-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '600', color: 'var(--color-text-default)', position: 'absolute', left: '0', zIndex: 3 }}>8</div>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#6abf7b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', color: DS.white, position: 'absolute', left: '16px', zIndex: 2 }}>TM</div>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#FFC9C6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', color: '#FF4C00', position: 'absolute', left: '32px', zIndex: 1 }}>KL</div>
        </div>
      </DarkPillBtn>
      <DarkPillBtn style={{ height: '40px', padding: '0 16px', borderRadius: '8px' }} title="Share">
        <span style={{ fontSize: '14px', fontWeight: '500', color: FG.text }}>Share</span>
      </DarkPillBtn>
    </div>
  </div>
);

/* ─── Layout B TopBar — icon-only left nav, no visible title in bar ─────────── */
const TopBarB = ({ logoMenuOpen, setLogoMenuOpen, onImportFile, layersOpen, setLayersOpen, settingsOpen, setSettingsOpen, cubeDocked, setCubeDocked }) => {
  useEffect(() => {
    if (!logoMenuOpen) return;
    const close = () => setLogoMenuOpen(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [logoMenuOpen, setLogoMenuOpen]);

  const MENU_FONT = "'Noto Sans', sans-serif";
  const Item = ({ label, shortcut, chevron, externalLink, onClick: handleClick }) => (
    <div onClick={() => { handleClick?.(); setLogoMenuOpen(false); }}
      style={{ height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px 0 16px', cursor: 'pointer' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-overlay-subtle)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      <span style={{ fontFamily: MENU_FONT, fontSize: '12px', color: 'var(--color-text-default)', whiteSpace: 'nowrap' }}>{label}</span>
      {shortcut && <span style={{ fontFamily: MENU_FONT, fontSize: '12px', color: 'var(--color-text-subtle)', paddingRight: '8px', whiteSpace: 'nowrap' }}>{shortcut}</span>}
      {chevron && <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M7 5l4 4-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      {externalLink && <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{ marginRight: '3px' }}><path d="M13.5 6.5V2.5M13.5 2.5H9.5M13.5 2.5L8 8M6.5 3.5H3.5C2.948 3.5 2.5 3.948 2.5 4.5V12.5C2.5 13.052 2.948 13.5 3.5 13.5H11.5C12.052 13.5 12.5 13.052 12.5 12.5V9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
    </div>
  );
  const ToggleItem = ({ label, active, onClick: handleClick }) => (
    <div onClick={() => { handleClick?.(); setLogoMenuOpen(false); }}
      style={{ height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px 0 16px', cursor: 'pointer' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-overlay-subtle)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      <span style={{ fontFamily: MENU_FONT, fontSize: '12px', color: 'var(--color-text-default)', whiteSpace: 'nowrap' }}>{label}</span>
      {active && <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ marginRight: '4px' }}><path d="M3 8l4 4 6-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
    </div>
  );
  const Divider = () => <div style={{ height: '16px', display: 'flex', alignItems: 'center', padding: '0 16px' }}><div style={{ height: '1px', background: 'var(--color-overlay-divider)', width: '100%' }} /></div>;

  return (
    <div style={{ position: 'fixed', top: '8px', left: '8px', zIndex: 50, display: 'flex', flexDirection: 'column', gap: '8px', userSelect: 'none' }}>
      {/* Single pill: logo icon + layers + env */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: FG.bar, borderRadius: '12px', padding: '4px' }}>
        {/* Logo / menu icon */}
        <div style={{ position: 'relative' }}>
          <DarkPillBtn onClick={() => { setLogoMenuOpen(v => !v); setLayersOpen(false); setSettingsOpen(false); }} style={{ width: '40px', height: '40px', borderRadius: '8px' }} title="Menu">
            {/* Dark mode: silver gradients. Light mode: solid purple. Controlled by tokens.css .gs-logo-* rules. */}
            <svg className="gs-logo-dark" width="24" height="24" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12.4301 30.0739C12.1281 30.5076 11.9742 30.975 11.8379 31.4564C13.1541 31.8071 14.5371 31.9941 15.9637 31.9941C17.0919 31.9941 18.1929 31.8773 19.2552 31.655C21.1489 31.2588 22.4182 30.3261 24.0001 29.3245L24.4379 28.3566L23.4373 24.2039L19.6848 23.9229C19.6848 23.9229 19.7064 24.108 19.6223 24.1726C19.5851 24.2014 19.2593 24.3344 19.2593 24.3344C18.2355 24.7437 17.1182 24.9688 15.9481 24.9688C15.8608 24.9688 15.7739 24.9673 15.6873 24.9648C15.4918 25.9692 14.9236 26.8819 14.3376 27.7946C13.7748 28.6688 13.0243 29.1996 12.4301 30.0739Z" fill="url(#gsB0)"/>
              <path d="M0 16.0549C0 23.4333 5.02106 29.6408 11.8377 31.4568C11.974 30.9756 12.1278 30.5079 12.4299 30.0742C13.0241 29.2 13.7745 28.6692 14.3374 27.7949C14.9234 26.8822 15.4916 25.9696 15.687 24.9651C11.2942 24.839 7.69873 21.539 7.11836 17.2814C4.59235 17.1143 2.28773 16.0324 0.0490945 14.7979C0.0165735 15.2125 0 15.6318 0 16.0549Z" fill="#CCCCCC"/>
              <path d="M9.08405 2.59741C9.28199 2.18994 9.48744 1.78872 9.69632 1.39062C4.36162 3.6665 0.520696 8.75966 0.0488281 14.7976C2.28746 16.0322 4.59239 17.1141 7.11809 17.2811C7.06399 16.8852 7.03554 16.4812 7.03554 16.0703C7.03554 13.4188 8.19723 11.0387 10.0397 9.40848C9.06279 7.23502 7.93768 4.93885 9.08374 2.59741H9.08405Z" fill="url(#gsB1)"/>
              <path d="M20.148 8.22051C19.502 6.2319 18.7074 4.25827 19.0592 2.09792C19.1477 1.53902 19.2987 1.0101 19.5004 0.508025C18.3628 0.251056 17.1789 0.115234 15.9635 0.115234C14.748 0.115234 13.5875 0.248246 12.4599 0.500219C11.5034 0.714099 10.5794 1.01384 9.69628 1.39071C9.48708 1.78881 9.28164 2.19003 9.08401 2.59749C7.93827 4.93894 9.06306 7.23511 10.0399 9.40857C11.6125 8.01694 13.681 7.17172 15.9478 7.17172C17.4666 7.17172 18.8966 7.55171 20.148 8.22051Z" fill="url(#gsB2)"/>
              <path d="M31.9266 16.0546C31.9266 8.4651 26.6144 2.11488 19.5001 0.507812C19.2984 1.00957 19.1477 1.53881 19.0589 2.09771C18.7074 4.25805 19.502 6.23168 20.1477 8.2203C22.9517 9.71934 24.8595 12.6721 24.8595 16.0702C24.8595 16.0702 24.7814 17.3035 25.6882 18.3339C26.6964 19.4791 29.0654 20.4883 31.0041 18.49C31.9488 17.5164 31.9266 16.0546 31.9266 16.0546Z" fill="#CCCCCC"/>
              <path d="M19.2156 31.6662C19.2156 31.6662 22.0925 31.2916 24.5628 29.4182C27.5813 27.1292 27.94 23.0486 24.7817 19.9575C19.2706 14.5636 12.6801 7.78034 12.6801 7.78034C12.6801 7.78034 10.7733 6.01435 10.4287 4.59556C9.67817 1.50444 12.8677 0.411621 12.8677 0.411621C12.8677 0.411621 9.99087 0.911195 7.42672 2.59726C4.88257 4.27021 3.22087 8.35797 7.64561 12.7761C12.0703 17.1942 19.2781 24.2663 19.2781 24.2663C19.2781 24.2663 21.3467 26.2696 21.6547 27.8258C22.1863 30.511 19.2156 31.6662 19.2156 31.6662Z" fill="#CCCCCC"/>
              <defs>
                <linearGradient id="gsB0" x1="12.385" y1="27.298" x2="24.899" y2="28.767" gradientUnits="userSpaceOnUse"><stop offset="0.19" stopColor="#CCCCCC"/><stop offset="0.7" stopColor="#999999"/></linearGradient>
                <linearGradient id="gsB1" x1="3.193" y1="14.018" x2="6.441" y2="6.994" gradientUnits="userSpaceOnUse"><stop stopColor="#CCCCCC"/><stop offset="1" stopColor="#999999"/></linearGradient>
                <linearGradient id="gsB2" x1="10.365" y1="4.812" x2="20.091" y2="4.284" gradientUnits="userSpaceOnUse"><stop stopColor="white"/><stop offset="0.71" stopColor="#CCCCCC"/></linearGradient>
              </defs>
            </svg>
            {/* Figma node 14:5448 — light mode purple logo (group + vector overlay merged) */}
            <svg className="gs-logo-purple" width="24" height="24" viewBox="0 0 31.927 31.8791" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12.4299 29.9588C12.1278 30.3925 11.974 30.8599 11.8377 31.3414C13.1538 31.6921 14.5369 31.8791 15.9635 31.8791C17.0917 31.8791 18.1927 31.7623 19.255 31.54C21.1487 31.1438 22.4179 30.2111 23.9999 29.2095L24.4377 28.2416L23.437 24.0888L19.6846 23.8078C19.6846 23.8078 19.7062 23.993 19.6221 24.0576C19.5849 24.0863 19.259 24.2194 19.259 24.2194C18.2352 24.6287 17.1179 24.8538 15.9478 24.8538C15.8606 24.8538 15.7736 24.8523 15.687 24.8498C15.4916 25.8542 14.9234 26.7669 14.3374 27.6795C13.7745 28.5538 13.0241 29.0846 12.4299 29.9588Z" fill="url(#gp0)"/>
              <path d="M0 15.9395C0 23.3179 5.02106 29.5255 11.8377 31.3414C11.974 30.8603 12.1278 30.3925 12.4299 29.9588C13.0241 29.0846 13.7745 28.5538 14.3374 27.6795C14.9234 26.7669 15.4916 25.8542 15.687 24.8498C11.2942 24.7236 7.69873 21.4236 7.11836 17.166C4.59235 16.9989 2.28773 15.9171 0.0490945 14.6825C0.0165735 15.0971 0 15.5165 0 15.9395Z" fill="#6530F7"/>
              <path d="M9.084 2.48226C9.28194 2.07479 9.48739 1.67357 9.69627 1.27548C4.36157 3.55135 0.520649 8.64451 0.0487815 14.6825C2.28742 15.9171 4.59235 16.999 7.11804 17.166C7.06395 16.7701 7.03549 16.3661 7.03549 15.9552C7.03549 13.3037 8.19718 10.9235 10.0396 9.29333C9.06274 7.11987 7.93764 4.8237 9.08369 2.48226H9.084Z" fill="url(#gp1)"/>
              <path d="M20.148 8.10528C19.502 6.11666 18.7074 4.14303 19.0592 1.98269C19.1477 1.42379 19.2987 0.894862 19.5004 0.39279C18.3628 0.135822 17.1789 0 15.9635 0C14.748 0 13.5875 0.133012 12.4599 0.384984C11.5034 0.598865 10.5793 0.898609 9.69627 1.27548C9.48708 1.67357 9.28163 2.07479 9.084 2.48226C7.93826 4.8237 9.06305 7.11987 10.0399 9.29333C11.6125 7.9017 13.681 7.05649 15.9478 7.05649C17.4666 7.05649 18.8966 7.43648 20.148 8.10528Z" fill="url(#gp2)"/>
              <path d="M31.9269 15.9395C31.9269 8.35007 26.6147 1.99986 19.5004 0.39279C19.2987 0.89455 19.148 1.42379 19.0592 1.98269C18.7077 4.14303 19.5023 6.11666 20.148 8.10528C22.952 9.60432 24.8598 12.5571 24.8598 15.9552C24.8598 15.9552 24.7817 17.1885 25.6885 18.2189C26.6966 19.3641 29.0657 20.3733 31.0044 18.375C31.9491 17.4014 31.9269 15.9395 31.9269 15.9395Z" fill="#6530F7"/>
              <path transform="translate(4.885,0.411)" d="M14.3201 31.2546C14.3201 31.2546 17.1969 30.8799 19.6673 29.0065C22.6858 26.7175 23.0445 22.637 19.8862 19.5458C14.3751 14.152 7.78461 7.36872 7.78461 7.36872C7.78461 7.36872 5.87775 5.60273 5.53315 4.18393C4.78266 1.09282 7.97223 0 7.97223 0C7.97223 0 5.09537 0.499574 2.53121 2.18564C-0.0129388 3.85859 -1.67464 7.94635 2.7501 12.3645C7.17484 16.7826 14.3826 23.8547 14.3826 23.8547C14.3826 23.8547 16.4512 25.858 16.7592 27.4141C17.2908 30.0994 14.3201 31.2546 14.3201 31.2546Z" fill="#6530F7"/>
              <defs>
                <linearGradient id="gp0" x1="12.385" y1="27.183" x2="24.899" y2="28.652" gradientUnits="userSpaceOnUse"><stop offset="0.3" stopColor="#6530F7"/><stop offset="0.81" stopColor="#3D169C"/></linearGradient>
                <linearGradient id="gp1" x1="3.193" y1="13.903" x2="6.441" y2="6.879" gradientUnits="userSpaceOnUse"><stop stopColor="#6530F7"/><stop offset="1" stopColor="#3D169C"/></linearGradient>
                <linearGradient id="gp2" x1="10.365" y1="4.697" x2="20.091" y2="4.169" gradientUnits="userSpaceOnUse"><stop stopColor="#9885FF"/><stop offset="0.71" stopColor="#6530F7"/></linearGradient>
              </defs>
            </svg>
          </DarkPillBtn>
          {logoMenuOpen && (
            <div onPointerDown={e => e.stopPropagation()} style={{
              position: 'absolute', top: '52px', left: 0, zIndex: 200,
              background: DS.surface, borderRadius: '12px', padding: '8px 0',
              boxShadow: '0 4px 6px rgba(16,24,40,0.08), 0 12px 16px rgba(16,24,40,0.14)',
              minWidth: '220px',
            }}>
              <div style={{ padding: '8px 16px 12px', borderBottom: '1px solid var(--color-overlay-divider)', marginBottom: '4px' }}>
                <div style={{ fontFamily: MENU_FONT, fontSize: '14px', fontWeight: 500, color: 'var(--color-text-default)', lineHeight: '20px' }}>Screen Experience V1</div>
                <div style={{ fontFamily: MENU_FONT, fontSize: '12px', color: 'var(--color-text-subtle)', lineHeight: '18px' }}>Room code: 66F–8UV</div>
              </div>
              <Item label="Undo" shortcut="Cmd + Z" />
              <Item label="Redo" shortcut="Cmd + Y" />
              <Item label="Views" chevron />
              <Item label="Windows" chevron />
              <ToggleItem label="Dock View Cube" active={cubeDocked} onClick={() => setCubeDocked(v => !v)} />
              <Divider />
              <Item label="Settings" chevron />
              <Divider />
              <Item label="Import" shortcut="Cmd + I" onClick={onImportFile} />
              <Item label="Export as..." shortcut="Cmd + E" />
              <Item label="Export selected" />
              <Divider />
              <Item label="Help" />
              <Divider />
              <Item label="Open in VR" externalLink />
              <Item label="Files" externalLink />
              <Item label="Exit Room" externalLink />
            </div>
          )}
        </div>
        <DarkPillBtn onClick={() => { setLayersOpen(v => !v); setSettingsOpen(false); setLogoMenuOpen(false); }} style={{ width: '40px', height: '40px', background: layersOpen ? DS.accent : FG.pill }} title="Layers">
          <LayersToggleGlyph size={20} />
        </DarkPillBtn>
        <DarkPillBtn onClick={() => { setSettingsOpen(v => !v); setLayersOpen(false); setLogoMenuOpen(false); }} style={{ width: '40px', height: '40px', background: settingsOpen ? DS.accent : FG.pill }} title="Environment">
          <EnvironmentToggleGlyph size={20} />
        </DarkPillBtn>
      </div>
    </div>
  );
};

/* ─── Layout C TopBar — wide title pill + separate hamburger button ──────────── */
const TopBarC = ({ logoMenuOpen, setLogoMenuOpen, onImportFile, layersOpen, setLayersOpen, settingsOpen, setSettingsOpen, cubeDocked, setCubeDocked }) => {
  useEffect(() => {
    if (!logoMenuOpen) return;
    const close = () => setLogoMenuOpen(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [logoMenuOpen, setLogoMenuOpen]);

  const MENU_FONT = "'Noto Sans', sans-serif";
  const Item = ({ label, shortcut, chevron, externalLink, onClick: handleClick }) => (
    <div onClick={() => { handleClick?.(); setLogoMenuOpen(false); }}
      style={{ height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px 0 16px', cursor: 'pointer' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-overlay-subtle)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      <span style={{ fontFamily: MENU_FONT, fontSize: '12px', color: 'var(--color-text-default)', whiteSpace: 'nowrap' }}>{label}</span>
      {shortcut && <span style={{ fontFamily: MENU_FONT, fontSize: '12px', color: 'var(--color-text-subtle)', paddingRight: '8px', whiteSpace: 'nowrap' }}>{shortcut}</span>}
      {chevron && <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M7 5l4 4-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      {externalLink && <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{ marginRight: '3px' }}><path d="M13.5 6.5V2.5M13.5 2.5H9.5M13.5 2.5L8 8M6.5 3.5H3.5C2.948 3.5 2.5 3.948 2.5 4.5V12.5C2.5 13.052 2.948 13.5 3.5 13.5H11.5C12.052 13.5 12.5 13.052 12.5 12.5V9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
    </div>
  );
  const ToggleItem = ({ label, active, onClick: handleClick }) => (
    <div onClick={() => { handleClick?.(); setLogoMenuOpen(false); }}
      style={{ height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px 0 16px', cursor: 'pointer' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-overlay-subtle)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      <span style={{ fontFamily: MENU_FONT, fontSize: '12px', color: 'var(--color-text-default)', whiteSpace: 'nowrap' }}>{label}</span>
      {active && <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ marginRight: '4px' }}><path d="M3 8l4 4 6-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
    </div>
  );
  const Divider = () => <div style={{ height: '16px', display: 'flex', alignItems: 'center', padding: '0 16px' }}><div style={{ height: '1px', background: 'var(--color-overlay-divider)', width: '100%' }} /></div>;
  const panelOpen = layersOpen || settingsOpen;

  return (
    <div style={{ position: 'fixed', top: '8px', left: '8px', zIndex: 50, display: 'flex', flexDirection: 'column', gap: '16px', userSelect: 'none', alignItems: 'flex-start' }}>
      {/* Wide title pill — clickable to open file dropdown */}
      <div style={{ position: 'relative' }}>
        <div
          onPointerDown={e => e.stopPropagation()}
          onClick={() => setLogoMenuOpen(v => !v)}
          style={{ background: FG.bar, borderRadius: '12px', padding: '4px', cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 10px 0 8px', background: FG.pill, borderRadius: '8px', height: '40px' }}>
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
              <path d="M12.4301 30.0739C12.1281 30.5076 11.9742 30.975 11.8379 31.4564C13.1541 31.8071 14.5371 31.9941 15.9637 31.9941C17.0919 31.9941 18.1929 31.8773 19.2552 31.655C21.1489 31.2588 22.4182 30.3261 24.0001 29.3245L24.4379 28.3566L23.4373 24.2039L19.6848 23.9229C19.6848 23.9229 19.7064 24.108 19.6223 24.1726C19.5851 24.2014 19.2593 24.3344 19.2593 24.3344C18.2355 24.7437 17.1182 24.9688 15.9481 24.9688C15.8608 24.9688 15.7739 24.9673 15.6873 24.9648C15.4918 25.9692 14.9236 26.8819 14.3376 27.7946C13.7748 28.6688 13.0243 29.1996 12.4301 30.0739Z" fill="url(#gsC0)"/>
              <path d="M0 16.0549C0 23.4333 5.02106 29.6408 11.8377 31.4568C11.974 30.9756 12.1278 30.5079 12.4299 30.0742C13.0241 29.2 13.7745 28.6692 14.3374 27.7949C14.9234 26.8822 15.4916 25.9696 15.687 24.9651C11.2942 24.839 7.69873 21.539 7.11836 17.2814C4.59235 17.1143 2.28773 16.0324 0.0490945 14.7979C0.0165735 15.2125 0 15.6318 0 16.0549Z" fill="#CCCCCC"/>
              <path d="M9.08405 2.59741C9.28199 2.18994 9.48744 1.78872 9.69632 1.39062C4.36162 3.6665 0.520696 8.75966 0.0488281 14.7976C2.28746 16.0322 4.59239 17.1141 7.11809 17.2811C7.06399 16.8852 7.03554 16.4812 7.03554 16.0703C7.03554 13.4188 8.19723 11.0387 10.0397 9.40848C9.06279 7.23502 7.93768 4.93885 9.08374 2.59741H9.08405Z" fill="url(#gsC1)"/>
              <path d="M20.148 8.22051C19.502 6.2319 18.7074 4.25827 19.0592 2.09792C19.1477 1.53902 19.2987 1.0101 19.5004 0.508025C18.3628 0.251056 17.1789 0.115234 15.9635 0.115234C14.748 0.115234 13.5875 0.248246 12.4599 0.500219C11.5034 0.714099 10.5794 1.01384 9.69628 1.39071C9.48708 1.78881 9.28164 2.19003 9.08401 2.59749C7.93827 4.93894 9.06306 7.23511 10.0399 9.40857C11.6125 8.01694 13.681 7.17172 15.9478 7.17172C17.4666 7.17172 18.8966 7.55171 20.148 8.22051Z" fill="url(#gsC2)"/>
              <path d="M31.9266 16.0546C31.9266 8.4651 26.6144 2.11488 19.5001 0.507812C19.2984 1.00957 19.1477 1.53881 19.0589 2.09771C18.7074 4.25805 19.502 6.23168 20.1477 8.2203C22.9517 9.71934 24.8595 12.6721 24.8595 16.0702C24.8595 16.0702 24.7814 17.3035 25.6882 18.3339C26.6964 19.4791 29.0654 20.4883 31.0041 18.49C31.9488 17.5164 31.9266 16.0546 31.9266 16.0546Z" fill="#CCCCCC"/>
              <path d="M19.2156 31.6662C19.2156 31.6662 22.0925 31.2916 24.5628 29.4182C27.5813 27.1292 27.94 23.0486 24.7817 19.9575C19.2706 14.5636 12.6801 7.78034 12.6801 7.78034C12.6801 7.78034 10.7733 6.01435 10.4287 4.59556C9.67817 1.50444 12.8677 0.411621 12.8677 0.411621C12.8677 0.411621 9.99087 0.911195 7.42672 2.59726C4.88257 4.27021 3.22087 8.35797 7.64561 12.7761C12.0703 17.1942 19.2781 24.2663 19.2781 24.2663C19.2781 24.2663 21.3467 26.2696 21.6547 27.8258C22.1863 30.511 19.2156 31.6662 19.2156 31.6662Z" fill="#CCCCCC"/>
              <defs>
                <linearGradient id="gsC0" x1="12.385" y1="27.298" x2="24.899" y2="28.767" gradientUnits="userSpaceOnUse"><stop offset="0.19" stopColor="#CCCCCC"/><stop offset="0.7" stopColor="#999999"/></linearGradient>
                <linearGradient id="gsC1" x1="3.193" y1="14.018" x2="6.441" y2="6.994" gradientUnits="userSpaceOnUse"><stop stopColor="#CCCCCC"/><stop offset="1" stopColor="#999999"/></linearGradient>
                <linearGradient id="gsC2" x1="10.365" y1="4.812" x2="20.091" y2="4.284" gradientUnits="userSpaceOnUse"><stop stopColor="white"/><stop offset="0.71" stopColor="#CCCCCC"/></linearGradient>
              </defs>
            </svg>
            <span style={{ fontSize: '14px', fontWeight: 500, color: FG.text, whiteSpace: 'nowrap', fontFamily: MENU_FONT, lineHeight: 1.25 }}>Screen Experience V1</span>
          </div>
        </div>
        {/* File dropdown — anchored to title pill */}
        {logoMenuOpen && (
          <div onPointerDown={e => e.stopPropagation()} style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 200,
            background: DS.surface, borderRadius: '12px', padding: '8px 0',
            boxShadow: '0 4px 6px rgba(16,24,40,0.08), 0 12px 16px rgba(16,24,40,0.14)',
            minWidth: '220px',
          }}>
            <Item label="Undo" shortcut="Cmd + Z" />
            <Item label="Redo" shortcut="Cmd + Y" />
            <Item label="Views" chevron />
            <Item label="Windows" chevron />
            <ToggleItem label="Dock View Cube" active={cubeDocked} onClick={() => setCubeDocked(v => !v)} />
            <Divider />
            <Item label="Settings" chevron />
            <Divider />
            <Item label="Import" shortcut="Cmd + I" onClick={onImportFile} />
            <Item label="Export as..." shortcut="Cmd + E" />
            <Item label="Export selected" />
            <Divider />
            <Item label="Help" />
            <Divider />
            <Item label="Open in VR" externalLink />
            <Item label="Files" externalLink />
            <Item label="Exit Room" externalLink />
          </div>
        )}
      </div>

      {/* Bottom row — blue button opens Layers; replaced by toggle row when panel open */}
      {!panelOpen ? (
        <div style={{ background: FG.bar, borderRadius: '40px', padding: '4px', width: 'fit-content' }}>
          <button
            onClick={() => { setLayersOpen(true); setSettingsOpen(false); setLogoMenuOpen(false); }}
            style={{
              width: '40px', height: '40px', borderRadius: '40px', border: 'none', cursor: 'pointer',
              background: '#1f4af1', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M3 6h14M3 10h14M3 14h14" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      ) : (
        /* Panel toggle row — replaces blue button when a panel is open */
        <div style={{ display: 'flex', gap: '4px', background: FG.bar, borderRadius: '12px', padding: '4px' }}>
          <DarkPillBtn
            onClick={() => { setLayersOpen(v => !v); setSettingsOpen(false); }}
            style={{ width: '40px', height: '40px', background: layersOpen ? DS.accent : FG.pill }}
            title="Layers">
            <LayersToggleGlyph size={20} />
          </DarkPillBtn>
          <DarkPillBtn
            onClick={() => { setSettingsOpen(v => !v); setLayersOpen(false); }}
            style={{ width: '40px', height: '40px', background: settingsOpen ? DS.accent : FG.pill }}
            title="Environment">
            <EnvironmentToggleGlyph size={20} />
          </DarkPillBtn>
          <button
            onClick={() => { setLayersOpen(false); setSettingsOpen(false); }}
            title="Close panels"
            style={{
              width: '40px', height: '40px', borderRadius: '40px', border: 'none', cursor: 'pointer',
              background: '#1f4af1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   NAV CUBE
   ═══════════════════════════════════════════════════════════════════════════════ */
/* ── NavCube helpers (defined outside component so they're stable references) ── */
const NAV_FACES = [
  { id: 'right',  label: 'Right',  s: 'R',  mi: 0 },
  { id: 'left',   label: 'Left',   s: 'L',  mi: 1 },
  { id: 'top',    label: 'Top',    s: 'T',  mi: 2 },
  { id: 'bottom', label: 'Bottom', s: 'Bo', mi: 3 },
  { id: 'front',  label: 'Front',  s: 'F',  mi: 4 },
  { id: 'back',   label: 'Back',   s: 'Bk', mi: 5 },
];

/* Build a 128×128 canvas texture for a NavCube face.
   showLabel: whether to draw the face letter (only on hover).
   hovered:   whether to apply the active highlight tint. */
const makeNavFaceTex = (shortLabel, hovered, showLabel = false) => {
  const sz = 128;
  const c = document.createElement('canvas');
  c.width = sz; c.height = sz;
  const ctx = c.getContext('2d');

  /* Base fill — white, slightly dimmed on non-hovered faces */
  ctx.fillStyle = hovered ? 'rgba(255,255,255,1.0)' : 'rgba(248,248,252,0.97)';
  ctx.fillRect(0, 0, sz, sz);

  /* Inner glow — radial gradient from centre, stronger on hover */
  const glow = ctx.createRadialGradient(sz/2, sz/2, 0, sz/2, sz/2, sz * 0.72);
  glow.addColorStop(0,   hovered ? 'rgba(108,92,231,0.18)' : 'rgba(108,92,231,0.07)');
  glow.addColorStop(0.6, hovered ? 'rgba(108,92,231,0.06)' : 'rgba(108,92,231,0.02)');
  glow.addColorStop(1,   'rgba(108,92,231,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, sz, sz);

  /* Subtle inset border */
  ctx.strokeStyle = hovered ? 'rgba(108,92,231,0.35)' : 'var(--color-overlay-medium)';
  ctx.lineWidth = 4;
  ctx.strokeRect(3, 3, sz - 6, sz - 6);

  /* Face label — only shown when hovered */
  if (showLabel) {
    const fontSize = shortLabel.length > 1 ? 38 : 50;
    ctx.fillStyle = hovered ? 'rgba(108,92,231,0.90)' : 'rgba(150,145,175,0.65)';
    ctx.font = `700 ${fontSize}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(shortLabel, sz / 2, sz / 2 + 1);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
};

/*
  NavCube — proper WebGL-rendered orientation gizmo.
  Uses a separate Three.js renderer (second WebGL context) so it gets real
  depth-testing, GPU face-culling, and raycaster-based hover/click — the same
  approach used by Blender's viewport gizmo.

  Rotation: cube.quaternion = mainCamera.quaternion.inverse()
  → the cube counter-rotates with the camera, so each face always
    points at the viewer from the corresponding world direction.
*/
const NAV_ARROWS = [
  { id: 'top',   dir: 'up',    style: { top: '-30px',    left: '50%', transform: 'translateX(-50%)' }, path: 'M6 10L10 6l4 4' },
  { id: 'front', dir: 'down',  style: { bottom: '-30px', left: '50%', transform: 'translateX(-50%)' }, path: 'M6 6l4 4 4-4' },
  { id: 'left',  dir: 'left',  style: { left: '-30px',   top: '50%',  transform: 'translateY(-50%)' }, path: 'M10 6L6 10l4 4' },
  { id: 'right', dir: 'right', style: { right: '-30px',  top: '50%',  transform: 'translateY(-50%)' }, path: 'M6 6l4 4-4 4' },
];

// ─── Bottom-left bar: mode switcher pill + active tool icon ─────────────────

const NavCube = ({ threeStateRef, onFaceClick }) => {
  const mountRef = useRef(null);
  const onFaceClickRef = useRef(onFaceClick);
  useEffect(() => { onFaceClickRef.current = onFaceClick; }, [onFaceClick]);
  const [hoveredLabel, setHoveredLabel] = useState(null);
  const [cubeHovered, setCubeHovered] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const SIZE = 96;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    /* Renderer — alpha:true gives the transparent background */
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(SIZE, SIZE);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x000000, 0);
    Object.assign(renderer.domElement.style, {
      width: SIZE + 'px', height: SIZE + 'px', display: 'block', cursor: 'default',
    });
    mount.appendChild(renderer.domElement);

    /* Orthographic camera — no perspective distortion on the gizmo */
    const scene = new THREE.Scene();
    const hs = 1.55;
    const cam = new THREE.OrthographicCamera(-hs, hs, hs, -hs, 0.1, 20);
    cam.position.set(0, 0, 10);
    cam.lookAt(0, 0, 0);

    /* Cube with per-face canvas textures — no labels initially */
    const geo = new THREE.BoxGeometry(1.85, 1.85, 1.85);
    const mats = NAV_FACES.map(f => new THREE.MeshBasicMaterial({ map: makeNavFaceTex(f.s, false, false) }));
    const cube = new THREE.Mesh(geo, mats);
    scene.add(cube);

    /* Subtle dark edges on the white cube */
    const edgeGeo = new THREE.EdgesGeometry(geo);
    cube.add(new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: 0xccccdd, transparent: true, opacity: 0.6 })));

    /* Coloured axis dots — larger spheres, pushed slightly past the cube face */
    [
      { pos: [1.28, 0, 0],  color: 0xe05a5a },  // +X  red
      { pos: [0, 1.28, 0],  color: 0x5cb87a },  // +Y  green
      { pos: [0, 0, 1.28],  color: 0x5b8fe0 },  // +Z  blue
    ].forEach(({ pos, color }) => {
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.17, 14, 14),
        new THREE.MeshBasicMaterial({ color }),
      );
      dot.position.set(...pos);
      cube.add(dot);
    });

    /* Raycaster — shared, reused every pointermove */
    const raycaster = new THREE.Raycaster();
    let hoveredMi = -1;

    const hitMaterialIndex = (clientX, clientY) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width)  * 2 - 1;
      const y = -((clientY - rect.top)  / rect.height) * 2 + 1;
      raycaster.setFromCamera({ x, y }, cam);
      const hits = raycaster.intersectObject(cube, false);
      return hits.length ? hits[0].face.materialIndex : -1;
    };

    const updateHover = (mi) => {
      if (mi === hoveredMi) return;
      if (hoveredMi >= 0) {
        mats[hoveredMi].map?.dispose();
        mats[hoveredMi].map = makeNavFaceTex(NAV_FACES[hoveredMi].s, false, false);
        mats[hoveredMi].needsUpdate = true;
      }
      if (mi >= 0) {
        mats[mi].map?.dispose();
        mats[mi].map = makeNavFaceTex(NAV_FACES[mi].s, true, true);  // show label on hover only
        mats[mi].needsUpdate = true;
        renderer.domElement.style.cursor = 'pointer';
        setHoveredLabel(NAV_FACES[mi].label);
      } else {
        renderer.domElement.style.cursor = 'default';
        setHoveredLabel(null);
      }
      hoveredMi = mi;
    };

    const onMove  = (e) => updateHover(hitMaterialIndex(e.clientX, e.clientY));
    const onLeave = ()  => updateHover(-1);
    const onClick = (e) => {
      const mi = hitMaterialIndex(e.clientX, e.clientY);
      if (mi >= 0 && onFaceClickRef.current) onFaceClickRef.current(NAV_FACES[mi].id);
    };

    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerleave', onLeave);
    renderer.domElement.addEventListener('click', onClick);

    /* Render loop — syncs cube orientation to main camera every frame */
    let rafId;
    const loop = () => {
      const mainCam = threeStateRef.current?.camera;
      if (mainCam) cube.quaternion.copy(mainCam.quaternion).invert();
      renderer.render(scene, cam);
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerleave', onLeave);
      renderer.domElement.removeEventListener('click', onClick);
      mats.forEach(m => { m.map?.dispose(); m.dispose(); });
      geo.dispose();
      edgeGeo.dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, [threeStateRef]); // stable ref — runs once

  return (
    /* Outer wrapper — large enough to contain the arrows without clipping */
    <div style={{ position: 'fixed', bottom: '16px', left: '16px', zIndex: 20, userSelect: 'none', padding: '32px', margin: '-32px' }}>
      <div
        onMouseEnter={() => setCubeHovered(true)}
        onMouseLeave={() => { setCubeHovered(false); }}
        style={{ position: 'relative', width: '96px', height: '96px' }}
      >
        {/* Directional arrows — fade in on cube hover */}
        {NAV_ARROWS.map(({ id, style, path }) => (
          <button
            key={id}
            onClick={() => onFaceClick(id)}
            style={{
              position: 'absolute', ...style,
              width: '26px', height: '26px',
              background: 'rgba(30,30,35,0.72)',
              border: '1px solid rgba(255,255,255,0.18)',
              borderRadius: '50%',
              backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', padding: 0,
              opacity: cubeHovered ? 1 : 0,
              transform: `${style.transform || ''} scale(${cubeHovered ? 1 : 0.7})`,
              transition: 'opacity 0.18s ease, transform 0.18s ease',
              pointerEvents: cubeHovered ? 'auto' : 'none',
              zIndex: 2,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <polyline points={path} stroke="rgba(255,255,255,0.9)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        ))}

        {/* WebGL canvas */}
        <div style={{ filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.14)) drop-shadow(0 1px 4px var(--color-overlay-medium))' }}>
          <div ref={mountRef} style={{
            width: '96px', height: '96px', borderRadius: '14px', overflow: 'hidden',
            background: 'transparent',
          }} />
        </div>

        {/* Hovered face label */}
        {hoveredLabel && (
          <div style={{
            position: 'absolute', bottom: '7px', left: 0, right: 0,
            textAlign: 'center', fontSize: '7px', fontFamily: UI.font,
            fontWeight: '700', color: 'rgba(80,60,200,0.9)',
            letterSpacing: '0.14em', textTransform: 'uppercase',
            pointerEvents: 'none',
          }}>
            {hoveredLabel}
          </div>
        )}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   MODE TOGGLE
   ═══════════════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════════════════
   THREE STATE CAPTURE
   ═══════════════════════════════════════════════════════════════════════════════ */
const ThreeStateCapture = ({ stateRef }) => {
  const state = useThree();
  useFrame(() => { stateRef.current = state; });
  return null;
};

/** Cursors on the WebGL surface in plain View mode. Right-drag orbits (rotate, or pan
 *  with Shift); left/idle is the crosshair box-select cursor. buttons: 1=left,2=right,4=middle. */
const ViewModeCursor = ({ active }) => {
  const { gl } = useThree();
  useEffect(() => {
    const canvas = gl.domElement;
    if (!active) { canvas.style.cursor = ''; return undefined; }
    const apply = (e) => {
      if (e.buttons & 2) { canvas.style.cursor = (e.shiftKey || PAN_MOD.active) ? CURSOR_ORBIT_PAN : CURSOR_ORBIT_ROTATE; return; } // right-drag = orbit
      if (e.shiftKey || PAN_MOD.active) { canvas.style.cursor = CURSOR_ORBIT_PAN; return; } // modifier held → pan-ready
      // Left-drag / idle = box-select. Middle is a menu click (no special cursor).
      canvas.style.cursor = 'crosshair';
    };
    window.addEventListener('pointermove', apply, { passive: true });
    canvas.addEventListener('pointerenter', apply, { passive: true });
    canvas.style.cursor = 'crosshair';
    return () => {
      window.removeEventListener('pointermove', apply);
      canvas.removeEventListener('pointerenter', apply);
      canvas.style.cursor = '';
    };
  }, [active, gl]);
  return null;
};

/** Contextual cursors on the WebGL surface while Comments mode is active. */
const CommentsModeCursor = ({ active }) => {
  const { gl, camera, scene } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);

  useEffect(() => {
    const canvas = gl.domElement;
    if (!active) {
      canvas.style.cursor = '';
      return undefined;
    }

    const collectMeshes = () => {
      const meshes = shoeModelMeshes.current.length > 0 ? [...shoeModelMeshes.current] : [];
      if (meshes.length === 0) {
        scene.traverse((obj) => {
          if (obj.isMesh && obj.geometry?.type !== 'PlaneGeometry') meshes.push(obj);
        });
      }
      return meshes;
    };

    const raycastHit = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return false;
      const x = ((clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera({ x, y }, camera);
      const hits = raycaster.intersectObjects(collectMeshes(), false);
      if (!hits.length) return false;
      const rayDir = raycaster.ray.direction;
      return hits.some(h => {
        if (!h.face) return true;
        const wn = h.face.normal.clone().transformDirection(h.object.matrixWorld);
        return wn.dot(rayDir) < 0;
      });
    };

    const pointerTopIsCanvas = (clientX, clientY) => {
      const top = document.elementFromPoint(clientX, clientY);
      return top === canvas;
    };

    const apply = (e) => {
      // Right-drag = orbit (rotate, or pan with Shift). buttons: 1=left,2=right,4=middle.
      if (e.buttons & 2) { canvas.style.cursor = (e.shiftKey || PAN_MOD.active) ? CURSOR_ORBIT_PAN : CURSOR_ORBIT_ROTATE; return; }
      if (!pointerTopIsCanvas(e.clientX, e.clientY)) {
        canvas.style.cursor = '';
        return;
      }
      // Left = place a comment anywhere (surface or empty space) — always the filled cursor.
      canvas.style.cursor = CURSOR_COMMENT_PLACE;
    };

    const onDown = (e) => {
      if (e.button === 0 && pointerTopIsCanvas(e.clientX, e.clientY)) {
        canvas.style.cursor = CURSOR_COMMENT_PLACE;
      }
    };
    const onUp = (e) => { apply(e); };

    const onLeave = (ev) => {
      if (!active) return;
      if (ev.buttons & (1 | 2)) return;
      canvas.style.cursor = '';
    };

    window.addEventListener('pointermove', apply, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('pointerenter', apply, { passive: true });
    return () => {
      window.removeEventListener('pointermove', apply);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerenter', apply);
      canvas.style.cursor = '';
    };
  }, [active, gl, camera, scene, raycaster]);

  return null;
};

const SceneBackground = ({ skyColor, bgColor, fogColor, fogNear, fogFar }) => {
  const { scene } = useThree();
  // Background = vertical gradient from Sky (top) → Horizon (bgColor, bottom).
  // When the two match it collapses to a flat colour (unchanged default look).
  useEffect(() => {
    const top = skyColor || bgColor;
    const bottom = bgColor;
    if (top.toLowerCase() === bottom.toLowerCase()) {
      scene.background = new THREE.Color(bottom);
      return;
    }
    const cvs = document.createElement('canvas');
    cvs.width = 2; cvs.height = 256;
    const ctx = cvs.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bottom);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 2, 256);
    const tex = new THREE.CanvasTexture(cvs);
    if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
    scene.background = tex;
    return () => tex.dispose();
  }, [skyColor, bgColor, scene]);
  useEffect(() => { scene.fog = new THREE.Fog(fogColor, fogNear, fogFar); }, [fogColor, fogNear, fogFar, scene]);
  return null;
};

/* ═══════════════════════════════════════════════════════════════════════════════
   2D CANVAS OVERLAY FOR REDLINES
   ═══════════════════════════════════════════════════════════════════════════════ */
/* Single committed stroke — isolated so useEffect can imperatively set depthTest on the
   LineMaterial (drei's <Line> passes extra props to the Line2 Object3D, not its material). */
const RedlineStrokeItem = ({ stroke, mp, isSelected, renderAbove }) => {
  const mainRef = useRef();
  const haloRef = useRef();
  const baseWidth = Math.max(1, (stroke.width || 2) * 2.2);
  const points = useMemo(
    () => stroke.points3D.map(p => new THREE.Vector3(p.x + mp[0], p.y + mp[1], p.z + mp[2])),
    [stroke.points3D, mp]
  );

  useEffect(() => {
    const dt = !renderAbove;
    if (mainRef.current?.material) { mainRef.current.material.depthTest = dt; mainRef.current.material.needsUpdate = true; }
    if (haloRef.current?.material) { haloRef.current.material.depthTest = dt; haloRef.current.material.needsUpdate = true; }
  }, [renderAbove]);

  return (
    <>
      {isSelected && (
        <Line ref={haloRef} points={points} color="#ffffff" lineWidth={baseWidth * 1.6 * 4} opacity={0.3} transparent />
      )}
      <Line
        ref={mainRef}
        points={points}
        color={stroke.color || UI.red}
        lineWidth={baseWidth * (isSelected ? 1.6 : 1)}
        opacity={isSelected ? 1 : (stroke.opacity ?? 0.92)}
        transparent
      />
    </>
  );
};

/* Committed redline strokes rendered as depth-tested 3D lines inside the Canvas */
const RedlineStrokes3D = ({ redlines, modelPosition, selectedId, hidden, renderAbove }) => {
  const mp = modelPosition || [0, 0, 0];
  if (hidden) return null;
  return (
    <>
      {redlines.map(stroke => {
        if (!stroke.visible || !stroke.points3D || stroke.points3D.length < 2) return null;
        return (
          <RedlineStrokeItem
            key={stroke.id}
            stroke={stroke}
            mp={mp}
            isSelected={stroke.id === selectedId}
            renderAbove={renderAbove}
          />
        );
      })}
    </>
  );
};

/* In-progress stroke — isolated component so useEffect can set depthTest on the material. */
const LiveRedlineStroke = ({ points, color, width, modelPosition, hidden, renderAbove }) => {
  const lineRef = useRef();
  useEffect(() => {
    if (lineRef.current?.material) {
      lineRef.current.material.depthTest = !renderAbove;
      lineRef.current.material.needsUpdate = true;
    }
  }, [renderAbove]);

  if (!points || points.length < 2 || hidden) return null;
  const mp = modelPosition || [0, 0, 0];
  const pts = points.map(p => new THREE.Vector3(p.x + mp[0], p.y + mp[1], p.z + mp[2]));
  return (
    <Line
      ref={lineRef}
      points={pts}
      color={color}
      lineWidth={Math.max(1, (width || 2) * 2.2)}
      opacity={0.92}
      transparent
    />
  );
};

const RedlineCanvasOverlay = ({ active, redlines, setRedlines, color, width, opacity = 0.92, threeStateRef, orbitRef, onStrokeCommitted, surfaceOffset, strokeCounter, modelPosition, onStrokeClick, setLivePoints, precisionMode, setPrecisionMode, parentCommentId, onContextMenu }) => {
  const canvasRef = useRef(null);
  const isDrawing = useRef(false);
  const currentPoints3D = useRef([]);
  const lastClientPt = useRef(null);
  const dpr = window.devicePixelRatio || 1;
  // 'rotate' | 'pan' | null — set when orbit controls are taking over the drag
  const orbitLockedRef = useRef(null);
  // When a stroke is begun in empty space, lock a camera-facing plane (its through-point)
  // here so every point of that stroke projects onto the same plane. null = draw on surface.
  const drawPlaneRef = useRef(null);
  // stable ref so restore callbacks don't capture a stale 'active' value
  const activeRef = useRef(active);
  useEffect(() => { activeRef.current = active; }, [active]);
  const onContextMenuRef = useRef(onContextMenu);
  useEffect(() => { onContextMenuRef.current = onContextMenu; }, [onContextMenu]);
  // Lasso auto-close: screen position and local 3D point where drawing started
  const firstScreenRef = useRef(null);
  const firstLocalRef = useRef(null);
  // DOM ref for the lasso start-point indicator (updated imperatively to avoid re-renders)
  const startIndicatorRef = useRef(null);

  // Ref-based access to avoid stale closures inside rAF/event callbacks
  const surfaceOffsetRef = useRef(surfaceOffset ?? 0.08);
  useEffect(() => { surfaceOffsetRef.current = surfaceOffset ?? 0.08; }, [surfaceOffset]);
  const strokeCounterRef = useRef(strokeCounter ?? 1);
  useEffect(() => { strokeCounterRef.current = strokeCounter ?? 1; }, [strokeCounter]);
  const modelPositionRef = useRef(modelPosition ?? [0, 0, 0]);
  useEffect(() => { modelPositionRef.current = modelPosition ?? [0, 0, 0]; }, [modelPosition]);

  const redlinesRef = useRef(redlines);
  useEffect(() => { redlinesRef.current = redlines; }, [redlines]);

  const parentCommentIdRef = useRef(parentCommentId);
  useEffect(() => { parentCommentIdRef.current = parentCommentId; }, [parentCommentId]);

  const onStrokeClickRef = useRef(onStrokeClick);
  useEffect(() => { onStrokeClickRef.current = onStrokeClick; }, [onStrokeClick]);

  // Precision mode kept available internally, but the Shift keyboard shortcut is
  // disabled in annotations mode (removed per request).
  const precisionRef = useRef(false);

  // Resize canvas to viewport (so pointer events cover the full window)
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
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
    const meshes = shoeModelMeshes.current;
    if (!meshes || meshes.length === 0) return null;
    const hits = raycaster.intersectObjects(meshes, false);
    if (hits.length > 0) {
      const rayDir = raycaster.ray.direction;
      const frontHit = hits.find(h => {
        if (!h.face) return true;
        const wn = h.face.normal.clone().transformDirection(h.object.matrixWorld);
        return wn.dot(rayDir) < 0;
      }) ?? hits[0];
      const p = frontHit.point.clone();
      const n = frontHit.face?.normal?.clone();
      if (n) { n.transformDirection(frontHit.object.matrixWorld); p.add(n.multiplyScalar(surfaceOffsetRef.current)); }
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

  // Pen cursor: pen-filled when hovering over surface, pen-outline when off (mirrors CommentsModeCursor pattern)
  useEffect(() => {
    if (!active) return;
    const cvs = canvasRef.current;
    if (!cvs) return;
    const updateCursor = (e) => {
      if (isDrawing.current) return;        // drawing in progress: leave cursor as-is
      if (orbitLockedRef.current) return;   // orbit in progress: canvas is passthrough
      // Right-drag orbits (handled via handoff → gl cursor); left = pencil.
      if (e.buttons & 2) { cvs.style.cursor = (e.shiftKey || PAN_MOD.active) ? CURSOR_ORBIT_PAN : CURSOR_ORBIT_ROTATE; return; }
      cvs.style.cursor = CURSOR_PENCIL_DRAW; // sketch cursor is always filled
    };
    cvs.style.cursor = CURSOR_PENCIL_DRAW; // initial
    const onLeave = (e) => { if (!(e.buttons & (1 | 2 | 4))) cvs.style.cursor = ''; };
    window.addEventListener('pointermove', updateCursor, { passive: true });
    cvs.addEventListener('pointerleave', onLeave);
    cvs.addEventListener('pointerenter', updateCursor, { passive: true });
    return () => {
      window.removeEventListener('pointermove', updateCursor);
      cvs.removeEventListener('pointerleave', onLeave);
      cvs.removeEventListener('pointerenter', updateCursor);
      cvs.style.cursor = '';
    };
  }, [active, getShoeHit]);

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs || !active) return;

    // Pass-through helper: disable our overlay temporarily so OrbitControls gets the drag.
    // Re-dispatches the initiating pointerdown to the Three.js canvas so orbit starts correctly.
    const handOffToOrbit = (e, mode) => {
      orbitLockedRef.current = mode;
      const orbitCursor = mode === 'pan' ? CURSOR_ORBIT_PAN : CURSOR_ORBIT_ROTATE;
      cvs.style.pointerEvents = 'none';
      try { cvs.releasePointerCapture(e.pointerId); } catch (_) { /* not captured yet — fine */ }
      const glCanvas = threeStateRef.current?.gl?.domElement;
      // Set cursor on the Three.js canvas — it becomes the hit-target once our overlay is passthrough
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
      // Restore overlay and clear cursor after the drag ends
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
      // Middle-click → context menu, opened globally on `auxclick`. Don't preventDefault
      // here (that would cancel the auxclick) and don't fall through to drawing.
      if (e.button === 1) return;
      e.preventDefault();
      // Right-click → orbit (rotate, or pan while Shift is held — OrbitControls decides)
      if (e.button === 2) { handOffToOrbit(e, e.shiftKey ? 'pan' : 'rotate'); return; }

      // Left-click → draw. On the surface when we hit it, otherwise on a locked
      // camera-facing plane so you can sketch in empty space too.
      let hit = getShoeHit(e.clientX, e.clientY);
      if (hit) {
        drawPlaneRef.current = null;
      } else {
        const st = threeStateRef.current;
        const through = orbitRef.current?.target?.clone?.() || new THREE.Vector3(0, 1, 0);
        drawPlaneRef.current = through;
        const p = st && planePointFromScreen(st.camera, st.gl, e.clientX, e.clientY, through);
        if (!p) return;
        hit = { x: p.x, y: p.y, z: p.z };
      }

      if (orbitRef.current) orbitRef.current.enabled = false;
      isDrawing.current = true; currentPoints3D.current = []; lastClientPt.current = null;
      cvs.style.cursor = CURSOR_PENCIL_DRAW;
      const mp = modelPositionRef.current;
      const local = { x: hit.x - mp[0], y: hit.y - mp[1], z: hit.z - mp[2] };
      currentPoints3D.current.push(local);
      setLivePoints?.([local]);
      lastClientPt.current = { x: e.clientX, y: e.clientY };
      // Lasso: record where drawing started
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
      if (orbitLockedRef.current) return; // state protection: never draw during an orbit drag
      e.preventDefault();
      const precision = precisionRef.current;
      // Smaller threshold in precision mode → more samples for tight curves
      const threshold = precision ? 1.4 : 2.5;
      if (lastClientPt.current) {
        const dx = e.clientX - lastClientPt.current.x, dy = e.clientY - lastClientPt.current.y;
        if (Math.sqrt(dx * dx + dy * dy) < threshold) return;
      }
      // Follow the surface, or the locked plane when sketching in space.
      let hit;
      if (drawPlaneRef.current) {
        const st = threeStateRef.current;
        const p = st && planePointFromScreen(st.camera, st.gl, e.clientX, e.clientY, drawPlaneRef.current);
        hit = p ? { x: p.x, y: p.y, z: p.z } : null;
      } else {
        hit = getShoeHit(e.clientX, e.clientY);
      }
      if (!hit) return;
      const mp = modelPositionRef.current;
      const raw = { x: hit.x - mp[0], y: hit.y - mp[1], z: hit.z - mp[2] };
      // Exponential moving average — dampens surface-normal jitter
      const alpha = precision ? 0.28 : 0.45;
      const arr = currentPoints3D.current;
      const last = arr[arr.length - 1];
      const smoothed = last ? {
        x: last.x + (raw.x - last.x) * alpha,
        y: last.y + (raw.y - last.y) * alpha,
        z: last.z + (raw.z - last.z) * alpha,
      } : raw;
      arr.push(smoothed);
      // Live display: pass through a quick Catmull-Rom so the in-progress stroke looks curved, not jagged
      if (arr.length >= 4) {
        const vecs = arr.map(p => new THREE.Vector3(p.x, p.y, p.z));
        const curve = new THREE.CatmullRomCurve3(vecs, false, 'catmullrom', 0.5);
        const samples = Math.min(Math.max(arr.length, 16), 90);
        setLivePoints?.(curve.getPoints(samples).map(v => ({ x: v.x, y: v.y, z: v.z })));
      } else {
        setLivePoints?.(arr.slice());
      }
      lastClientPt.current = { x: e.clientX, y: e.clientY };
      // Lasso proximity: pulse the start indicator when cursor is within close range
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
      // Hide lasso indicator
      const ind = startIndicatorRef.current;
      if (ind) ind.style.display = 'none';
      if (currentPoints3D.current.length >= 2) {
        const raw = currentPoints3D.current;
        // Auto-close (lasso): if pen lifts within 32px of start, close the path
        const fs = firstScreenRef.current;
        const fl = firstLocalRef.current;
        if (fs && fl && raw.length > 5) {
          const dist = Math.hypot(e.clientX - fs.x, e.clientY - fs.y);
          if (dist < 32) raw.push({ ...fl });
        }
        // Catmull-Rom for a buttery final curve
        let final = raw;
        if (raw.length >= 3) {
          const vecs = raw.map(p => new THREE.Vector3(p.x, p.y, p.z));
          const closed = raw.length > 5 && fs && Math.hypot(e.clientX - fs.x, e.clientY - fs.y) < 32;
          const curve = new THREE.CatmullRomCurve3(vecs, closed, 'catmullrom', 0.5);
          const samples = Math.min(Math.max(raw.length * 2, 32), 300);
          final = curve.getPoints(samples).map(v => ({ x: v.x, y: v.y, z: v.z }));
        }
        const newStroke = { id: Date.now() + Math.random(), points3D: final.map(p => ({ x: p.x, y: p.y, z: p.z })), color, width, visible: true, name: `Stroke ${strokeCounterRef.current}`, opacity, comments: [], parentCommentId: parentCommentIdRef.current || null };
        setRedlines(prev => [...prev, newStroke]);
        if (onStrokeCommitted) onStrokeCommitted(newStroke.id, { x: e.clientX, y: e.clientY });
      }
      // Note: a short tap on an existing stroke intentionally does nothing — strokes
      // are never "commented" by clicking the line. Comments come only from the
      // comment/callout tools.
      isDrawing.current = false; currentPoints3D.current = []; lastClientPt.current = null;
      firstScreenRef.current = null; firstLocalRef.current = null;
      setLivePoints?.([]);
    };

    const onCtxMenu = (e) => e.preventDefault(); // suppress browser context menu on right-click

    // Forward scroll/wheel to the Three.js canvas so OrbitControls can zoom
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
  }, [active, color, width, opacity, getShoeHit, setRedlines, orbitRef, onStrokeCommitted, findNearestStroke, onStrokeClickRef, setLivePoints]);

  // Hover cursor + click-to-select strokes in view mode (when canvas has no pointer events)
  // Clicking a stroke's line never opens a comment thread. Comments are placed only
  // via the comment/callout tools, whether the click lands on a line or the surface.
  // (Stroke notes remain reachable through their dedicated sketch pins.)

  return (
    <>
      <canvas ref={canvasRef} style={{ position: 'fixed', top: 0, left: 0, zIndex: active ? 6 : 3, pointerEvents: active ? 'auto' : 'none', touchAction: 'none' }} />
      {/* Lasso start-point indicator — shown imperatively during drawing, never triggers re-renders */}
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

/* ═══════════════════════════════════════════════════════════════════════════════
   STROKE DETAIL POPUP
   ═══════════════════════════════════════════════════════════════════════════════ */
const StrokeThreadPopup = ({ stroke, screenPos, onClose, onFlyTo, onUpdate, autoFocus, onReplyWithSketch }) => {
  const [text, setText] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(stroke.name || '');
  const [pos, setPos] = useState(() => ({
    x: Math.min((screenPos?.x ?? 300) + 18, window.innerWidth - 272),
    y: Math.max(10, Math.min((screenPos?.y ?? 200) - 40, window.innerHeight - 320)),
  }));
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const [dragging, setDragging] = useState(false);
  const textareaRef = useRef(null);
  const threadRef = useRef(null);

  // Migrate legacy comment string to comments array
  const comments = stroke.comments ?? (stroke.comment ? [{ id: 'legacy', author: 'You', text: stroke.comment, created: stroke.created || Date.now() }] : []);

  useEffect(() => {
    setNameVal(stroke.name || '');
  }, [stroke.id, stroke.name]);

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 80);
    }
  }, [autoFocus]);

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [comments.length]);

  const handleDragStart = (e) => {
    if (e.button !== 0) return;
    isDragging.current = true;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
    e.preventDefault();
    const onMove = (me) => {
      if (!isDragging.current) return;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 272, dragStart.current.px + me.clientX - dragStart.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 60, dragStart.current.py + me.clientY - dragStart.current.y)),
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

  const commitName = () => {
    setEditingName(false);
    const trimmed = nameVal.trim();
    if (trimmed && trimmed !== stroke.name) onUpdate(stroke.id, { name: trimmed });
  };

  const addComment = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const newComment = { id: Date.now() + Math.random(), author: 'You', text: trimmed, created: Date.now() };
    const updated = [...comments, newComment];
    onUpdate(stroke.id, { comments: updated });
    setText('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addComment(); }
  };

  const fmt = (ts) => {
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div style={{
      position: 'fixed', left: pos.x, top: pos.y, zIndex: 45,
      width: '264px', background: 'rgba(255,255,255,0.98)',
      border: '1px solid rgba(0,0,0,0.09)', borderRadius: '16px',
      boxShadow: '0 8px 40px rgba(0,0,0,0.14), 0 2px 10px var(--color-overlay-divider)',
      backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      fontFamily: UI.font, userSelect: 'none', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header — drag handle */}
      <div
        onPointerDown={handleDragStart}
        style={{
          padding: '11px 12px 10px', borderBottom: '1px solid var(--color-overlay-divider)',
          display: 'flex', alignItems: 'center', gap: '8px',
          cursor: dragging ? 'grabbing' : 'grab', flexShrink: 0,
        }}
      >
        <div style={{ width: '9px', height: '9px', borderRadius: '3px', background: stroke.color, flexShrink: 0 }} />
        {editingName ? (
          <input
            value={nameVal} onChange={e => setNameVal(e.target.value)}
            onBlur={commitName}
            onKeyDown={e => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') { setEditingName(false); setNameVal(stroke.name); } }}
            autoFocus
            style={{ flex: 1, background: 'rgba(108,92,231,0.06)', border: '1px solid rgba(108,92,231,0.3)', borderRadius: '5px', color: UI.text, fontFamily: UI.font, fontSize: '12px', fontWeight: '600', padding: '2px 6px', outline: 'none', minWidth: 0, userSelect: 'text' }}
          />
        ) : (
          <span
            onDoubleClick={() => setEditingName(true)}
            title="Double-click to rename"
            style={{ fontSize: '12px', fontWeight: '600', color: UI.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text' }}
          >{stroke.name}</span>
        )}
        {onReplyWithSketch && (
          <button onClick={onReplyWithSketch} title="Reply with sketch" style={{ background: 'none', border: 'none', color: UI.textDim, cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', flexShrink: 0 }}
            onMouseEnter={e => e.currentTarget.style.color = UI.purple} onMouseLeave={e => e.currentTarget.style.color = UI.textDim}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M11.5 1.5l3 3-9 9H2.5v-3l9-9z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        )}
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: UI.textDim, cursor: 'pointer', padding: '2px 3px', fontSize: '13px', lineHeight: 1, display: 'flex', alignItems: 'center', flexShrink: 0 }}
          onMouseEnter={e => e.currentTarget.style.color = UI.red} onMouseLeave={e => e.currentTarget.style.color = UI.textDim}>✕</button>
      </div>

      {/* Thread */}
      <div ref={threadRef} style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto', flexShrink: 0 }}>
        {comments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '12px 0 4px', fontSize: '11px', color: UI.textDim, lineHeight: '1.6' }}>
            No comments yet.<br/>Add the first note below.
          </div>
        ) : comments.map(c => (
          <div key={c.id} style={{ display: 'flex', gap: '7px', alignItems: 'flex-start' }}>
            <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: UI.purple, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '9px', fontWeight: '700', color: DS.white, letterSpacing: '0.02em' }}>
              {c.author?.charAt(0)?.toUpperCase() ?? 'Y'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '2px' }}>
                <span style={{ fontSize: '10px', fontWeight: '600', color: UI.text }}>{c.author}</span>
                <span style={{ fontSize: '9px', color: UI.textDim }}>{fmt(c.created)}</span>
              </div>
              <div style={{ fontSize: '11px', color: UI.text, lineHeight: '1.5', wordBreak: 'break-word', userSelect: 'text', whiteSpace: 'pre-wrap' }}>{c.text}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Composer */}
      <div style={{ padding: '8px 12px 11px', borderTop: '1px solid var(--color-overlay-divider)', flexShrink: 0 }}>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a comment… (Enter to send)"
          rows={2}
          style={{
            width: '100%', background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.09)',
            borderRadius: '8px', color: UI.text, fontFamily: UI.font, fontSize: '11px',
            lineHeight: '1.5', padding: '7px 9px', resize: 'none', outline: 'none',
            boxSizing: 'border-box', userSelect: 'text', marginBottom: '7px',
            transition: 'border-color 0.15s',
          }}
          onFocus={e => e.currentTarget.style.borderColor = 'rgba(108,92,231,0.4)'}
          onBlur={e => e.currentTarget.style.borderColor = 'rgba(0,0,0,0.09)'}
        />
        <button
          onClick={addComment}
          disabled={!text.trim()}
          style={{
            width: '100%', padding: '7px 0',
            background: text.trim() ? UI.purple : 'rgba(0,0,0,0.05)',
            border: 'none', borderRadius: '8px',
            color: text.trim() ? '#fff' : UI.textDim,
            fontFamily: UI.font, fontSize: '11px', fontWeight: '600',
            cursor: text.trim() ? 'pointer' : 'default',
            transition: 'background 0.15s, color 0.15s',
          }}
        >Add Comment</button>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   REDLINE TOOLBAR
   ═══════════════════════════════════════════════════════════════════════════════ */
const REDLINE_COLORS = ['#e05a5a', '#ff6b35', '#f5c842', '#5ae06a', '#5a8fe0', '#b05ae0', '#ffffff', '#222222'];
const REDLINE_WIDTHS = [
  { label: 'S', value: 0.5, display: 1 }, { label: 'M', value: 1.0, display: 2 },
  { label: 'L', value: 2.0, display: 3.5 }, { label: 'XL', value: 3.5, display: 5 },
];

const RedlineToolbar = ({ color, setColor, width, setWidth, onUndo, onRedo, onClear, strokeCount, redlines, setRedlines, undoStack, surfaceOffset, setSurfaceOffset, onEditStroke }) => {
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
      <div onPointerDown={handleDragStart} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: collapsed ? '10px 12px' : '10px 14px', borderBottom: collapsed ? 'none' : `1px solid var(--color-overlay-medium)`, cursor: 'grab', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M11.5 1.5l3 3-9 9H2.5v-3l9-9z" stroke="#e5484d" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/><path d="M9.5 3.5l3 3" stroke="#e5484d" strokeWidth="1.2"/></svg>
          {!collapsed && <span style={{ fontSize: '10px', letterSpacing: '0.18em', color: UI.red, textTransform: 'uppercase', fontWeight: '600' }}>Redline</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {!collapsed && strokeCount > 0 && <span style={{ fontSize: '9px', color: UI.textMid }}>{strokeCount}</span>}
          <button onClick={(e) => { e.stopPropagation(); setCollapsed(v => !v); }} style={{ background: 'none', border: 'none', color: UI.textDim, cursor: 'pointer', fontSize: '11px', lineHeight: 1, padding: '2px', display: 'flex', alignItems: 'center' }}>
            {collapsed ? <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              : <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M3 7.5l3-3 3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto', flex: 1 }}>
          <div>
            <div style={{ fontSize: '7px', letterSpacing: '0.22em', color: UI.textDim, textTransform: 'uppercase', marginBottom: '8px' }}>Pen Color</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {REDLINE_COLORS.map(c => (
                <div key={c} onClick={() => setColor(c)} style={{ width: '22px', height: '22px', borderRadius: '6px', background: c, cursor: 'pointer', border: color === c ? '2px solid rgba(0,0,0,0.4)' : `1px solid rgba(0,0,0,0.12)`, boxSizing: 'border-box', transition: 'transform 0.1s', transform: color === c ? 'scale(1.1)' : 'scale(1)' }} />
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '7px', letterSpacing: '0.22em', color: UI.textDim, textTransform: 'uppercase', marginBottom: '8px' }}>Stroke Width</div>
            <div style={{ display: 'flex', gap: '4px' }}>
              {REDLINE_WIDTHS.map(w => (
                <button key={w.label} onClick={() => setWidth(w.value)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '5px', padding: '8px 4px', background: width === w.value ? 'rgba(0,0,0,0.05)' : 'transparent', border: width === w.value ? '1px solid rgba(0,0,0,0.15)' : '1px solid rgba(0,0,0,0.06)', borderRadius: '6px', cursor: 'pointer' }}>
                  <div style={{ width: '20px', height: `${w.display}px`, borderRadius: '1px', background: width === w.value ? color : '#d1d1d6' }} />
                  <span style={{ fontSize: '8px', fontWeight: '600', letterSpacing: '0.12em', color: width === w.value ? UI.text : UI.textDim }}>{w.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ fontSize: '7px', letterSpacing: '0.22em', color: UI.textDim, textTransform: 'uppercase' }}>Surface Gap</div>
              <span style={{ fontSize: '9px', color: UI.textMid, fontVariantNumeric: 'tabular-nums' }}>{(surfaceOffset ?? 0.08).toFixed(2)}</span>
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
                <div style={{ fontSize: '7px', letterSpacing: '0.22em', color: UI.textDim, textTransform: 'uppercase' }}>Layers <span style={{ color: '#d1d1d6', marginLeft: '4px' }}>{redlines.length}</span></div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={toggleAllLayers} style={{ background: 'none', border: 'none', color: UI.textDim, cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 2L1 6l7 4 7-4-7-4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/><path d="M1 10l7 4 7-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                  <button onClick={() => setShowLayers(v => !v)} style={{ background: 'none', border: 'none', color: UI.textDim, cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}>
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
                      <div key={stroke.id} style={{ background: isExpanded ? 'rgba(108,92,231,0.04)' : 'rgba(0,0,0,0.03)', border: `1px solid ${isExpanded ? 'rgba(108,92,231,0.2)' : stroke.visible ? 'var(--color-overlay-medium)' : 'rgba(0,0,0,0.03)'}`, borderRadius: '6px', padding: '7px 10px', opacity: stroke.visible ? 1 : 0.5, transition: 'background 0.15s, border-color 0.15s' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                            <button onClick={() => toggleVisibility(stroke.id)} style={{ background: 'none', border: 'none', color: stroke.visible ? UI.textMid : '#d1d1d6', cursor: 'pointer', padding: '1px', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                              {stroke.visible ? <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.1"/><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.1"/></svg>
                                : <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.1"/><line x1="2" y1="2" x2="14" y2="14" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>}
                            </button>
                            <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: stroke.color, flexShrink: 0 }} />
                            {isRenaming ? (
                              <input value={renameVal} onChange={e => setRenameVal(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') commitRename(stroke.id); if (e.key === 'Escape') setRenamingId(null); }}
                                onBlur={() => commitRename(stroke.id)} autoFocus
                                style={{ flex: 1, background: UI.bgPanel, border: '1px solid rgba(0,0,0,0.12)', borderRadius: '4px', color: UI.text, fontFamily: UI.font, fontSize: '10px', padding: '3px 6px', outline: 'none', minWidth: 0 }} />
                            ) : (
                              <span onClick={() => startRename(stroke)} title="Click to rename" style={{ fontSize: '10px', color: UI.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text', flex: 1 }}>{stroke.name}</span>
                            )}
                          </div>
                          <button
                            onClick={() => setExpandedStrokeId(isExpanded ? null : stroke.id)}
                            title="Add comment"
                            style={{ background: 'none', border: 'none', color: isExpanded ? UI.gold : stroke.comment ? UI.gold : '#d1d1d6', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                            onMouseEnter={e => { if (!isExpanded && !stroke.comment) e.currentTarget.style.color = UI.gold; }}
                            onMouseLeave={e => { if (!isExpanded && !stroke.comment) e.currentTarget.style.color = '#d1d1d6'; }}>
                            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                              <path d="M2 3h12v8H8.5L6 14v-3H2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                            </svg>
                          </button>
                          <button onClick={() => setRedlines(prev => prev.filter(r => r.id !== stroke.id))} style={{ background: 'none', border: 'none', color: '#d1d1d6', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', fontSize: '10px', flexShrink: 0 }} onMouseEnter={e => e.currentTarget.style.color = UI.red} onMouseLeave={e => e.currentTarget.style.color = '#d1d1d6'}>✕</button>
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
                                width: '100%', background: UI.bgPanel, border: '1px solid rgba(108,92,231,0.25)',
                                borderRadius: '6px', color: UI.text, fontFamily: UI.font, fontSize: '10px',
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
            <div style={{ textAlign: 'center', padding: '8px 0 2px', fontSize: '10px', color: UI.textDim, lineHeight: '1.7' }}>Draw on the shoe surface to<br />annotate design changes</div>
          )}
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   MODEL TRANSFORM PANEL
   ═══════════════════════════════════════════════════════════════════════════════ */
const ModelTransformPanel = ({ position, setPosition, visible, onClose }) => {
  if (!visible) return null;
  return (
    <div style={{ position: 'fixed', bottom: '80px', right: '20px', zIndex: 30, width: '230px', background: UI.glass, border: `1px solid ${UI.glassBorder}`, borderRadius: UI.radius, backdropFilter: UI.glassBlur, WebkitBackdropFilter: UI.glassBlur, fontFamily: UI.font, userSelect: 'none', boxShadow: UI.panelShadow, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: `1px solid var(--color-overlay-medium)` }}>
        <span style={{ fontSize: '10px', letterSpacing: '0.18em', color: UI.gold, textTransform: 'uppercase', fontWeight: '600' }}>Transform</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: UI.textDim, cursor: 'pointer', fontSize: '11px', lineHeight: 1 }}>✕</button>
      </div>
      <div style={{ padding: '12px 14px 14px' }}>
        <div style={{ fontSize: '7px', letterSpacing: '0.22em', color: UI.textDim, textTransform: 'uppercase', marginBottom: '10px' }}>Position</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {['x', 'y', 'z'].map((axis, i) => (
            <ScrubInput key={axis} axis={axis} value={position[i]} onChange={(val) => { const next = [...position]; next[i] = val; setPosition(next); }} />
          ))}
        </div>
        <button onClick={() => setPosition([0, -0.35, 0])} style={{ marginTop: '14px', width: '100%', background: 'transparent', border: `1px solid rgba(0,0,0,0.1)`, borderRadius: '6px', color: UI.textDim, fontFamily: UI.font, fontSize: '8px', fontWeight: '600', letterSpacing: '0.18em', textTransform: 'uppercase', padding: '7px 0', cursor: 'pointer' }}>
          Reset Position
        </button>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   CONTEXT MENU
   ═══════════════════════════════════════════════════════════════════════════════ */
const ContextMenu = ({ x, y, onSurface, hitObjectName, onClose, onTransform, onResetCamera, onToggleAutoRotate, onPresentation, onFindMySketch, onSelectAll, onCenterInObject, onDuplicate, onFlipX, onFlipY, onFlipZ }) => {
  useEffect(() => {
    const dismiss = (e) => {
      // Don't dismiss if the click is inside this menu (stopPropagation on the menu div handles that)
      onClose();
    };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('pointerdown', dismiss);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const menuW = 210;
  const menuH = onSurface ? 280 : 200;
  const px = x + menuW > window.innerWidth - 8 ? x - menuW : x;
  const py = y + menuH > window.innerHeight - 8 ? y - menuH : y;
  const RowItem = ({ label, shortcut, onClick: act, danger }) => (
    <div
      onPointerDown={e => { e.stopPropagation(); act?.(); onClose(); }}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '7px 14px', cursor: 'pointer', borderRadius: '6px', margin: '1px 4px', transition: 'background 0.1s' }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.07)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <span style={{ fontSize: '12px', color: danger ? UI.red : 'rgba(255,255,255,0.87)', fontFamily: UI.font, fontWeight: 500 }}>{label}</span>
      {shortcut && <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', fontFamily: UI.mono }}>{shortcut}</span>}
    </div>
  );
  const Divider = () => <div style={{ height: '1px', background: 'rgba(255,255,255,0.07)', margin: '3px 0' }} />;

  return (
    <div onPointerDown={e => e.stopPropagation()} style={{
      position: 'fixed', left: px, top: py, zIndex: 300,
      background: DS.surface, border: `1px solid var(--color-border-default)`,
      borderRadius: '12px', padding: '6px 0',
      boxShadow: '0 8px 32px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.3)',
      minWidth: `${menuW}px`, userSelect: 'none',
    }}>
      {onSurface && hitObjectName && (
        <>
          <div style={{ padding: '4px 14px 6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.38)', fontFamily: UI.font, fontWeight: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '170px' }}>{hitObjectName}</span>
          </div>
          <Divider />
        </>
      )}
      {onSurface ? (
        <>
          <RowItem label="Edit" onClick={onTransform} />
          <RowItem label="Center in Object" onClick={onCenterInObject} />
          <Divider />
          <RowItem label="Reset Camera" shortcut="Home" onClick={onResetCamera} />
          <Divider />
          <RowItem label="Duplicate" onClick={onDuplicate} />
          <RowItem label="Flip X" onClick={onFlipX} />
          <RowItem label="Flip Y" onClick={onFlipY} />
          <RowItem label="Flip Z" onClick={onFlipZ} />
          <Divider />
          <RowItem label="Rotate Camera" onClick={onToggleAutoRotate} />
        </>
      ) : (
        <>
          <RowItem label="Reset Camera" shortcut="Home" onClick={onResetCamera} />
          <RowItem label="Rotate Camera" onClick={onToggleAutoRotate} />
          <Divider />
          <RowItem label="Presentation" shortcut="Tab" onClick={onPresentation} />
          <RowItem label="Find My Sketch" shortcut="⌃⇧E" onClick={onFindMySketch} />
          <RowItem label="Select All Objects" shortcut="⌘A" onClick={onSelectAll} />
        </>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   STROKE ROW — shared between drawer and floating panel
   ═══════════════════════════════════════════════════════════════════════════════ */
const StrokeRow = ({ stroke, onToggleVisibility, onDelete, onRename, onOpenThread }) => {
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal] = useState('');
  const hasComments = (stroke.comments?.length ?? 0) > 0 || !!stroke.comment;

  const startRename = () => { setRenamingId(stroke.id); setRenameVal(stroke.name || ''); };
  const commitRename = () => {
    const trimmed = renameVal.trim();
    if (trimmed && trimmed !== stroke.name) onRename(stroke.id, trimmed);
    setRenamingId(null);
  };

  return (
    <div style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid var(--color-overlay-medium)', borderRadius: '6px', padding: '7px 9px', opacity: stroke.visible ? 1 : 0.48, transition: 'opacity 0.15s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <button onClick={() => onToggleVisibility(stroke.id)} style={{ background: 'none', border: 'none', color: stroke.visible ? UI.textMid : UI.textDim, cursor: 'pointer', padding: '1px', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          {stroke.visible
            ? <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.1"/><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.1"/></svg>
            : <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.1" opacity="0.4"/><line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>}
        </button>
        <div style={{ width: '9px', height: '9px', borderRadius: '2px', background: stroke.color, flexShrink: 0 }} />
        {renamingId === stroke.id ? (
          <input value={renameVal} onChange={e => setRenameVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null); }}
            onBlur={commitRename} autoFocus
            style={{ flex: 1, background: UI.bgPanel, border: '1px solid rgba(108,92,231,0.3)', borderRadius: '4px', color: UI.text, fontFamily: UI.font, fontSize: '10px', padding: '2px 5px', outline: 'none', minWidth: 0, userSelect: 'text' }} />
        ) : (
          <span onDoubleClick={startRename} title="Double-click to rename" style={{ fontSize: '10px', color: UI.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text' }}>{stroke.name}</span>
        )}
        <button
          onClick={() => onOpenThread(stroke)}
          title={hasComments ? 'View comments' : 'Add comment'}
          style={{ background: 'none', border: 'none', color: hasComments ? UI.purple : UI.textDim, cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', flexShrink: 0, position: 'relative' }}
          onMouseEnter={e => e.currentTarget.style.color = UI.purple} onMouseLeave={e => e.currentTarget.style.color = hasComments ? UI.purple : UI.textDim}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 2h12v8.5H9L6.5 13V10.5H2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" fill={hasComments ? 'rgba(108,92,231,0.12)' : 'none'}/></svg>
          {hasComments && (
            <span style={{ position: 'absolute', top: '-2px', right: '-2px', width: '6px', height: '6px', borderRadius: '50%', background: UI.purple, border: '1.5px solid white' }} />
          )}
        </button>
        <button onClick={() => onDelete(stroke.id)} style={{ background: 'none', border: 'none', color: UI.textDim, cursor: 'pointer', padding: '2px', fontSize: '10px', flexShrink: 0 }}
          onMouseEnter={e => e.currentTarget.style.color = UI.red} onMouseLeave={e => e.currentTarget.style.color = UI.textDim}>✕</button>
      </div>
    </div>
  );
};

const DraggableCommentsPanel = ({ tooltips, onFlyTo, onRemove, isPinSeen, onPinViewed, editMode, onUpdateTooltip, onClose }) => {
  const [pos, setPos] = useState({ x: window.innerWidth - 340, y: 80 });
  const dragRef = useRef(null);

  const onMouseDown = (e) => {
    if (e.target.closest('button,input,textarea,select')) return;
    e.preventDefault();
    const startX = e.clientX - pos.x;
    const startY = e.clientY - pos.y;
    const onMove = (ev) => {
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 300, ev.clientX - startX)),
        y: Math.max(0, Math.min(window.innerHeight - 100, ev.clientY - startY)),
      });
    };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div
      ref={dragRef}
      style={{
        position: 'fixed', left: pos.x, top: pos.y, width: '300px', maxHeight: '480px',
        background: UI.glass, border: `1px solid ${UI.glassBorder}`,
        backdropFilter: UI.glassBlur, WebkitBackdropFilter: UI.glassBlur,
        boxShadow: UI.panelShadow, borderRadius: UI.radius,
        display: 'flex', flexDirection: 'column', zIndex: 30,
        fontFamily: UI.font, overflow: 'hidden',
      }}
    >
      {/* Header / drag handle */}
      <div
        onMouseDown={onMouseDown}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 14px 10px', cursor: 'grab', userSelect: 'none',
          borderBottom: `1px solid ${UI.border}`, flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path d="M2 2h12v9H9l-3 3v-3H2V2z" stroke={UI.purple} strokeWidth="1.4" strokeLinejoin="round"/>
          </svg>
          <span style={{ fontSize: '12px', fontWeight: '600', color: UI.text }}>Comments</span>
          {tooltips.length > 0 && (
            <span style={{ fontSize: '10px', fontWeight: '600', color: UI.purple, background: 'rgba(108,92,231,0.10)', borderRadius: '999px', padding: '1px 7px' }}>
              {tooltips.length}
            </span>
          )}
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: UI.textDim, display: 'flex', alignItems: 'center', borderRadius: '6px' }}
          onMouseEnter={e => e.currentTarget.style.color = UI.text}
          onMouseLeave={e => e.currentTarget.style.color = UI.textDim}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Comment list */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '6px 0' }}>
        {tooltips.length === 0 ? (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: UI.textDim, fontSize: '12px' }}>
            No comments yet.<br/>Switch to Comments mode to add pins.
          </div>
        ) : tooltips.map((t) => {
          const seen = isPinSeen(t.id);
          return (
            <div key={t.id} style={{
              padding: '10px 14px', cursor: 'pointer',
              background: seen ? 'transparent' : UI.unreadRowBg,
              borderLeft: seen ? '3px solid transparent' : `3px solid ${UI.unreadAccent}`,
              transition: 'background 0.12s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = seen ? 'rgba(0,0,0,0.03)' : 'rgba(214,156,45,0.12)'}
              onMouseLeave={e => e.currentTarget.style.background = seen ? 'transparent' : UI.unreadRowBg}
              onClick={() => { onFlyTo(t); onPinViewed(t.id); }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                    <span style={{ fontSize: '10px', fontWeight: '700', color: UI.purple, fontFamily: UI.mono }}>
                      #{t.sequenceNumber ?? t.id}
                    </span>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: UI.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.label}
                    </span>
                  </div>
                  {t.description && (
                    <div style={{ fontSize: '11px', color: UI.textMid, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {t.description}
                    </div>
                  )}
                  {t.author && (
                    <div style={{ fontSize: '10px', color: UI.textDim, marginTop: '3px' }}>{t.author}</div>
                  )}
                </div>
                {!seen && (
                  <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: UI.unreadAccent, flexShrink: 0, marginTop: '4px' }} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   BEZIER PEN HELPER — convert anchor array to points3D
   ═══════════════════════════════════════════════════════════════════════════════ */
const bezierAnchorsToPoints3D = (anchors, modelPosition) => {
  if (!anchors || anchors.length < 2) return [];
  const mp = modelPosition || [0, 0, 0];
  const result = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    const p0 = new THREE.Vector3(a.pos3D.x, a.pos3D.y, a.pos3D.z);
    const p3 = new THREE.Vector3(b.pos3D.x, b.pos3D.y, b.pos3D.z);
    const def1 = p0.clone().lerp(p3, 0.33);
    const def2 = p0.clone().lerp(p3, 0.67);
    const p1 = a.h2 ? new THREE.Vector3(a.h2.x, a.h2.y, a.h2.z) : def1;
    const p2 = b.h1 ? new THREE.Vector3(b.h1.x, b.h1.y, b.h1.z) : def2;
    const samples = 24;
    for (let j = i === 0 ? 0 : 1; j <= samples; j++) {
      const t = j / samples;
      const mt = 1 - t;
      const pt = p0.clone().multiplyScalar(mt * mt * mt)
        .add(p1.clone().multiplyScalar(3 * mt * mt * t))
        .add(p2.clone().multiplyScalar(3 * mt * t * t))
        .add(p3.clone().multiplyScalar(t * t * t));
      result.push({ x: pt.x - mp[0], y: pt.y - mp[1], z: pt.z - mp[2] });
    }
  }
  return result;
};

/* ═══════════════════════════════════════════════════════════════════════════════
   POST-SKETCH PANEL — appears after pencil / pen stroke to save or discard
   ═══════════════════════════════════════════════════════════════════════════════ */
const PostSketchPanel = ({ onSave, onDiscard }) => {
  const [note, setNote] = useState('');
  const [pos, setPos] = useState({ x: window.innerWidth / 2 - 150, y: window.innerHeight / 2 - 100 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const [dragging, setDragging] = useState(false);
  const taRef = useRef(null);
  useEffect(() => { setTimeout(() => taRef.current?.focus(), 80); }, []);

  const handleDragStart = (e) => {
    if (e.button !== 0) return;
    isDragging.current = true; setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
    e.preventDefault();
    const onMove = (me) => {
      if (!isDragging.current) return;
      setPos({
        x: Math.max(8, Math.min(window.innerWidth - 308, dragStart.current.px + me.clientX - dragStart.current.x)),
        y: Math.max(54, Math.min(window.innerHeight - 100, dragStart.current.py + me.clientY - dragStart.current.y)),
      });
    };
    const onUp = () => { isDragging.current = false; setDragging(false); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
  };

  return (
    <div style={{
      position: 'fixed', left: pos.x, top: pos.y, zIndex: 50,
      width: '300px', background: UI.glass, border: `1px solid ${UI.glassBorder}`,
      borderRadius: UI.radius, boxShadow: UI.panelShadow,
      backdropFilter: UI.glassBlur, WebkitBackdropFilter: UI.glassBlur,
      fontFamily: UI.font, overflow: 'hidden',
    }}>
      <div onPointerDown={handleDragStart} style={{
        padding: '10px 12px', borderBottom: `1px solid ${UI.border}`,
        display: 'flex', alignItems: 'center', gap: '8px',
        cursor: dragging ? 'grabbing' : 'grab', userSelect: 'none',
      }}>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M11 2L14 5L5 14L2 14L2 11Z" stroke={UI.purple} strokeWidth="1.4" strokeLinejoin="round"/></svg>
        <span style={{ flex: 1, fontSize: '12px', fontWeight: '600', color: UI.text }}>Add sketch note</span>
        <button onClick={onDiscard} style={{ background: 'none', border: 'none', color: UI.textDim, cursor: 'pointer', fontSize: '14px', padding: '2px 4px', borderRadius: '5px', lineHeight: 1 }}
          onMouseEnter={e => { e.currentTarget.style.color = UI.text; e.currentTarget.style.background = UI.bgRow; }}
          onMouseLeave={e => { e.currentTarget.style.color = UI.textDim; e.currentTarget.style.background = 'none'; }}>✕</button>
      </div>
      <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <textarea ref={taRef} value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note…" rows={3}
          style={{ width: '100%', resize: 'none', border: `1px solid ${UI.border}`, borderRadius: '8px', fontFamily: UI.font, fontSize: '12px', color: UI.text, padding: '8px 10px', background: 'rgba(0,0,0,0.02)', outline: 'none', boxSizing: 'border-box', lineHeight: '1.55' }}
          onFocus={e => e.target.style.borderColor = UI.purple}
          onBlur={e => e.target.style.borderColor = UI.border} />
        <button onClick={() => onSave({ note: note.trim() })} style={{
          width: '100%', background: UI.purple, border: 'none', borderRadius: '8px',
          color: DS.white, fontFamily: UI.font, fontSize: '10px', fontWeight: '700',
          letterSpacing: '0.14em', textTransform: 'uppercase', padding: '10px 0', cursor: 'pointer',
        }}>Save</button>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   BOTTOM ANNOTATION TOOLBAR — visible only in Annotation Mode
   ═══════════════════════════════════════════════════════════════════════════════ */
/* Annotation color palette — exact spec values */
const ANN_PALETTE = [
  { id: 'black',  value: UI.text },
  { id: 'red',    value: '#E8453C' },
  { id: 'yellow', value: '#F5A623' },
  { id: 'green',  value: '#4CD964' },
  { id: 'purple', value: '#7B5CF5' },
];
const ANN_ACTIVE_BG = '#7B5CF5';
const ANN_BAR_BG = '#19181A';
const ANN_EMOJIS = ['👍', '👎', '❤️', '🔥', '✓', '?', '😊', '💯'];
/* Maps the selected annotation color → the matching pen/pencil PNG colour variant
   (filenames: pen-black/red/yellow/mint/purple.png, same for pencil). */
const ANN_COLOR_PNG = {
  '#1C1C1E': 'black',
  '#E8453C': 'red',
  '#F5A623': 'yellow',
  '#4CD964': 'mint',
  '#7B5CF5': 'purple',
};



/* ═══════════════════════════════════════════════════════════════════════════════
   PEN TOOL OVERLAY — DOM overlay for Bézier pen anchor placement
   ═══════════════════════════════════════════════════════════════════════════════ */
const PenToolOverlay = ({ active, threeStateRef, orbitRef, modelPosition, penAnchors, setPenAnchors, onPathCommitted, strokeColor, strokeWidth, strokeOpacity = 0.92, strokeCounter, onContextMenu }) => {
  const overlayRef = useRef(null);
  const isDraggingHandleRef = useRef(false);
  const handlePlaneRef = useRef(null);  // THREE.Plane for current anchor's handle drag
  const handleWorldAnchorRef = useRef(null); // world pos of current anchor
  const modelPositionRef = useRef(modelPosition);
  useEffect(() => { modelPositionRef.current = modelPosition; }, [modelPosition]);
  const onContextMenuRef = useRef(onContextMenu);
  useEffect(() => { onContextMenuRef.current = onContextMenu; }, [onContextMenu]);

  const getRaycastHit = useCallback((clientX, clientY) => {
    const st = threeStateRef.current;
    if (!st) return null;
    const { camera, gl } = st;
    const rect = gl.domElement.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((clientY - rect.top) / rect.height) * 2 + 1;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
    const meshes = shoeModelMeshes.current;
    if (!meshes || !meshes.length) return null;
    const hits = raycaster.intersectObjects(meshes, false);
    if (!hits.length) return null;
    const rayDir = raycaster.ray.direction;
    const frontHit = hits.find(h => {
      if (!h.face) return true;
      const wn = h.face.normal.clone().transformDirection(h.object.matrixWorld);
      return wn.dot(rayDir) < 0;
    }) ?? hits[0];
    return { point: frontHit.point.clone(), normal: frontHit.face ? frontHit.face.normal.clone().transformDirection(frontHit.object.matrixWorld) : new THREE.Vector3(0, 1, 0) };
  }, [threeStateRef]);

  const getHandlePlaneHit = useCallback((clientX, clientY) => {
    const st = threeStateRef.current;
    if (!st || !handlePlaneRef.current) return null;
    const { camera, gl } = st;
    const rect = gl.domElement.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((clientY - rect.top) / rect.height) * 2 + 1;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
    const hitPos = new THREE.Vector3();
    const hit = raycaster.ray.intersectPlane(handlePlaneRef.current, hitPos);
    return hit ? hitPos : null;
  }, [threeStateRef]);

  const finalizePath = useCallback((overrideAnchors) => {
    const anchors = overrideAnchors ?? penAnchors;
    if (anchors.length < 2) { setPenAnchors([]); return; }
    const mp = modelPositionRef.current;
    const worldAnchors = anchors.map(a => ({
      ...a,
      pos3D: { x: a.pos3D.x + mp[0], y: a.pos3D.y + mp[1], z: a.pos3D.z + mp[2] },
      h1: a.h1 ? { x: a.h1.x + mp[0], y: a.h1.y + mp[1], z: a.h1.z + mp[2] } : null,
      h2: a.h2 ? { x: a.h2.x + mp[0], y: a.h2.y + mp[1], z: a.h2.z + mp[2] } : null,
    }));
    const points3D = bezierAnchorsToPoints3D(worldAnchors, mp);
    if (points3D.length < 2) { setPenAnchors([]); return; }
    const stroke = {
      id: Date.now() + Math.random(), points3D, color: strokeColor, width: strokeWidth,
      visible: true, name: `Pen ${strokeCounter}`, opacity: strokeOpacity, comments: [],
      type: 'sketch-pen', created: Date.now(),
    };
    onPathCommitted(stroke);
    setPenAnchors([]);
  }, [penAnchors, strokeColor, strokeWidth, strokeOpacity, strokeCounter, modelPositionRef, onPathCommitted, setPenAnchors]);

  // Keyboard: Enter = finalize, Escape = cancel
  useEffect(() => {
    if (!active) return;
    const onKey = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (e.key === 'Enter') { e.preventDefault(); finalizePath(); }
      if (e.key === 'Escape') { setPenAnchors([]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, finalizePath, setPenAnchors]);

  // Pointer events on overlay div
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay || !active) return;

    let lastDownTime = 0;

    const onDown = (e) => {
      // Middle-click → context menu, opened globally on `auxclick`.
      if (e.button === 1) return;
      // Right-click → orbit (rotate, or pan while Shift held — OrbitControls decides)
      if (e.button === 2) {
        overlay.style.pointerEvents = 'none';
        const glCanvas = threeStateRef.current?.gl?.domElement;
        if (glCanvas && orbitRef.current) {
          orbitRef.current.enabled = true;
          glCanvas.style.cursor = (e.shiftKey || PAN_MOD.active) ? CURSOR_ORBIT_PAN : CURSOR_ORBIT_ROTATE;
          glCanvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY, button: e.button, buttons: e.buttons, pointerId: e.pointerId || 1, pointerType: e.pointerType || 'mouse', isPrimary: true }));
        }
        const restore = () => {
          overlay.style.pointerEvents = 'auto';
          if (glCanvas) glCanvas.style.cursor = '';
          window.removeEventListener('pointerup', restore);
        };
        window.addEventListener('pointerup', restore);
        return;
      }
      // Close the loop: clicking near the FIRST anchor finishes the path closed.
      if (penAnchors.length >= 2) {
        const st0 = threeStateRef.current;
        if (st0) {
          const mp0 = modelPositionRef.current;
          const first = penAnchors[0];
          const fw = new THREE.Vector3(first.pos3D.x + mp0[0], first.pos3D.y + mp0[1], first.pos3D.z + mp0[2]);
          const proj = fw.clone().project(st0.camera);
          const rect0 = st0.gl.domElement.getBoundingClientRect();
          const sx = rect0.left + (proj.x * 0.5 + 0.5) * rect0.width;
          const sy = rect0.top + (-proj.y * 0.5 + 0.5) * rect0.height;
          if (Math.hypot(e.clientX - sx, e.clientY - sy) < 16) {
            isDraggingHandleRef.current = false;
            // Append a copy of the first anchor so the bézier returns to the start.
            const closing = { ...first, id: Date.now() + Math.random() };
            finalizePath([...penAnchors, closing]);
            return;
          }
        }
      }
      // Place the anchor on the surface, or in empty space on a camera-facing plane.
      let hit = getRaycastHit(e.clientX, e.clientY);
      if (!hit) {
        const st = threeStateRef.current;
        const through = orbitRef.current?.target?.clone?.() || new THREE.Vector3(0, 1, 0);
        const p = st && planePointFromScreen(st.camera, st.gl, e.clientX, e.clientY, through);
        if (!p) return;
        const n = st.camera.getWorldDirection(new THREE.Vector3()).negate();
        hit = { point: p, normal: n };
      }
      const mp = modelPositionRef.current;
      // Lift the anchor slightly off the surface (small gap, similar to the pencil)
      // so the pen path floats just above the geometry instead of z-fighting it.
      const PEN_OFFSET = 0.045;
      const liftedPoint = hit.point.clone().add(hit.normal.clone().multiplyScalar(PEN_OFFSET));
      const localPos = { x: liftedPoint.x - mp[0], y: liftedPoint.y - mp[1], z: liftedPoint.z - mp[2] };
      const newAnchor = { id: Date.now() + Math.random(), pos3D: localPos, h1: null, h2: null };
      setPenAnchors(prev => [...prev, newAnchor]);
      // Set up handle plane (tangent to surface, or camera-facing in space)
      handlePlaneRef.current = new THREE.Plane().setFromNormalAndCoplanarPoint(hit.normal, liftedPoint);
      handleWorldAnchorRef.current = liftedPoint.clone();
      isDraggingHandleRef.current = true;

      // Double-click detection: finalize if second click within 300ms
      const now = Date.now();
      if (now - lastDownTime < 300) { isDraggingHandleRef.current = false; finalizePath([...penAnchors, newAnchor]); }
      lastDownTime = now;
    };

    const onMove = (e) => {
      if (!isDraggingHandleRef.current) return;
      const hitPos = getHandlePlaneHit(e.clientX, e.clientY);
      if (!hitPos) return;
      const mp = modelPositionRef.current;
      const anchor = handleWorldAnchorRef.current;
      if (!anchor) return;
      // Only set handles if drag distance is significant (> 8px in screen)
      const dx = e.clientX - (e.clientX - (hitPos.x - anchor.x)), dy = e.clientY - (e.clientY - (hitPos.y - anchor.y));
      const localHandle = { x: hitPos.x - mp[0], y: hitPos.y - mp[1], z: hitPos.z - mp[2] };
      setPenAnchors(prev => {
        if (!prev.length) return prev;
        const next = [...prev];
        const last = { ...next[next.length - 1] };
        const ddx = localHandle.x - last.pos3D.x;
        const ddy = localHandle.y - last.pos3D.y;
        const ddz = localHandle.z - last.pos3D.z;
        // Only update handles if drag is meaningful (> 0.01 world units)
        if (Math.hypot(ddx, ddy, ddz) > 0.01) {
          last.h2 = localHandle;
          last.h1 = { x: last.pos3D.x - ddx, y: last.pos3D.y - ddy, z: last.pos3D.z - ddz };
        }
        next[next.length - 1] = last;
        return next;
      });
    };

    const onUp = () => { isDraggingHandleRef.current = false; handlePlaneRef.current = null; handleWorldAnchorRef.current = null; };

    const onWheel = (e) => {
      e.preventDefault();
      const glCanvas = threeStateRef.current?.gl?.domElement;
      if (glCanvas) glCanvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: e.deltaX, deltaY: e.deltaY, deltaZ: e.deltaZ, deltaMode: e.deltaMode, clientX: e.clientX, clientY: e.clientY, ctrlKey: e.ctrlKey }));
    };

    overlay.addEventListener('pointerdown', onDown, { passive: false });
    overlay.addEventListener('pointermove', onMove, { passive: false });
    overlay.addEventListener('pointerup', onUp);
    overlay.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      overlay.removeEventListener('pointerdown', onDown);
      overlay.removeEventListener('pointermove', onMove);
      overlay.removeEventListener('pointerup', onUp);
      overlay.removeEventListener('wheel', onWheel);
    };
  }, [active, getRaycastHit, getHandlePlaneHit, finalizePath, setPenAnchors, threeStateRef, orbitRef]);

  // Cursor — the sketch cursor is always the filled pen.
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    if (!active) { overlay.style.cursor = ''; return; }
    const updateCursor = () => { overlay.style.cursor = CURSOR_PEN_DRAW; };
    const onDown = () => updateCursor();
    const onUp = () => updateCursor();
    overlay.style.cursor = CURSOR_PEN_DRAW;
    window.addEventListener('pointermove', updateCursor, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    return () => {
      window.removeEventListener('pointermove', updateCursor);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
    };
  }, [active]);

  return (
    <>
      <div ref={overlayRef} onContextMenu={(e) => e.preventDefault()} style={{ position: 'fixed', inset: 0, zIndex: active ? 6 : -1, pointerEvents: active ? 'auto' : 'none', touchAction: 'none' }} />
      {/* Pen anchor count pill */}
      {active && penAnchors.length > 0 && (
        <div style={{
          position: 'fixed', bottom: '92px', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(108,92,231,0.92)', color: DS.white,
          padding: '5px 14px', borderRadius: '999px',
          fontFamily: UI.font, fontSize: '10px', fontWeight: '600', letterSpacing: '0.12em',
          textTransform: 'uppercase', zIndex: 50, pointerEvents: 'none',
          boxShadow: '0 4px 16px rgba(108,92,231,0.35)',
        }}>
          {penAnchors.length} {penAnchors.length === 1 ? 'anchor' : 'anchors'} · Enter to finish · Esc to cancel
        </div>
      )}
    </>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   PEN PREVIEW 3D — renders anchors, handles and preview curve inside Canvas
   ═══════════════════════════════════════════════════════════════════════════════ */
const PenPreview3D = ({ anchors, modelPosition, color, width }) => {
  const mp = modelPosition || [0, 0, 0];
  const toWorld = (p) => [p.x + mp[0], p.y + mp[1], p.z + mp[2]];

  const previewPoints = useMemo(() => {
    if (!anchors || anchors.length < 2) return [];
    const worldAnchors = anchors.map(a => ({
      ...a,
      pos3D: { x: a.pos3D.x + mp[0], y: a.pos3D.y + mp[1], z: a.pos3D.z + mp[2] },
      h1: a.h1 ? { x: a.h1.x + mp[0], y: a.h1.y + mp[1], z: a.h1.z + mp[2] } : null,
      h2: a.h2 ? { x: a.h2.x + mp[0], y: a.h2.y + mp[1], z: a.h2.z + mp[2] } : null,
    }));
    return bezierAnchorsToPoints3D(worldAnchors, mp).map(p => [p.x + mp[0], p.y + mp[1], p.z + mp[2]]);
  }, [anchors, mp]);

  if (!anchors || anchors.length === 0) return null;
  // Thinner, more elegant preview line. Round caps/joins on the dash segments
  // (lineCap/lineJoin 'round') give the dashed line its rounded corners.
  const lineW = Math.max(1.1, (width || 1) * 1.3);

  return (
    <>
      {/* Preview bezier curve — fine dashes, rounded caps */}
      {previewPoints.length >= 2 && (
        <Line points={previewPoints} color={color} lineWidth={lineW} opacity={0.7} transparent dashed dashScale={64} dashSize={0.32} gapSize={0.2} lineCap="round" lineJoin="round" />
      )}
      {/* Anchor + handle nodes */}
      {anchors.map((anchor, i) => {
        const wPos = toWorld(anchor.pos3D);
        return (
          <group key={anchor.id}>
            {/* Anchor node — small round dot */}
            <mesh position={wPos}>
              <sphereGeometry args={[0.02, 16, 16]} />
              <meshBasicMaterial color={color} />
            </mesh>
            {/* Handle 1 */}
            {anchor.h1 && (() => {
              const hw = toWorld(anchor.h1);
              return (
                <>
                  <Line points={[hw, wPos]} color={color} lineWidth={0.9} opacity={0.3} transparent />
                  <mesh position={hw}><sphereGeometry args={[0.014, 12, 12]} /><meshBasicMaterial color={color} transparent opacity={0.55} /></mesh>
                </>
              );
            })()}
            {/* Handle 2 */}
            {anchor.h2 && (() => {
              const hw = toWorld(anchor.h2);
              return (
                <>
                  <Line points={[wPos, hw]} color={color} lineWidth={0.9} opacity={0.3} transparent />
                  <mesh position={hw}><sphereGeometry args={[0.014, 12, 12]} /><meshBasicMaterial color={color} transparent opacity={0.55} /></mesh>
                </>
              );
            })()}
          </group>
        );
      })}
    </>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   SKETCH PINS — 3D pins for redline strokes that have an attachedNote
   ═══════════════════════════════════════════════════════════════════════════════ */
/* Individual sketch-pin with grab-able badge + grab-able surface anchor.
   Extracted into its own component so it can call useThree() per-pin.          */
const SketchPinLeader = ({ r, allRedlines, tooltipCount, modelPosition, onOpenNote, selectedId, onUpdateStroke, onTranslateStroke }) => {
  const { camera, gl } = useThree();
  const dragActiveRef = useRef(false);

  const pts = r.points3D;
  const lcx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const lcy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const lcz = pts.reduce((s, p) => s + p.z, 0) / pts.length;
  const cx = lcx + modelPosition[0];
  const cy = lcy + modelPosition[1];
  const cz = lcz + modelPosition[2];

  // Badge may have been repositioned by the user; fall back to centroid + lift
  const badgeOffX = r.badgeOffsetX ?? 0;
  const badgeOffY = r.badgeOffsetY ?? 0.28;
  const badgeOffZ = r.badgeOffsetZ ?? 0;
  const elevated = [cx + badgeOffX, cy + badgeOffY, cz + badgeOffZ];
  const surface  = [cx, cy, cz];

  const allIdx = (allRedlines ?? [r]).findIndex(x => x.id === r.id);
  const seqNum  = (tooltipCount ?? 0) + allIdx + 1;
  const isSelected = selectedId === r.id;

  // ── Badge drag: free movement on camera-facing plane ──────────────────────
  const handleBadgePointerDown = (e) => {
    e.stopPropagation();
    e.nativeEvent?.stopImmediatePropagation();
    const startX = e.clientX, startY = e.clientY;
    let moved = false;
    dragActiveRef.current = true;
    const refPos = new THREE.Vector3(...elevated);

    const onMove = (me) => {
      if (!moved && (Math.abs(me.clientX - startX) > 4 || Math.abs(me.clientY - startY) > 4)) moved = true;
      if (!moved) return;
      const np = projectToPlane(me.clientX, me.clientY, refPos, camera, gl);
      if (np && onUpdateStroke) {
        onUpdateStroke(r.id, { badgeOffsetX: np.x - cx, badgeOffsetY: np.y - cy, badgeOffsetZ: np.z - cz });
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      dragActiveRef.current = false;
      if (!moved) onOpenNote(r);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // ── Surface anchor drag: translates the entire stroke on the shoe mesh ────
  const handleSurfacePointerDown = (e) => {
    e.stopPropagation();
    e.nativeEvent?.stopImmediatePropagation();
    const startX = e.clientX, startY = e.clientY;
    let moved = false;
    // Track the last raycasted surface position to compute incremental deltas
    // (avoids stale cx/cy/cz closure values during rapid drag)
    const prev = new THREE.Vector3(cx, cy, cz);

    const onMove = (me) => {
      if (!moved && (Math.abs(me.clientX - startX) > 4 || Math.abs(me.clientY - startY) > 4)) moved = true;
      if (!moved) return;
      const hit = projectToSurface(me.clientX, me.clientY, camera, gl);
      if (hit && onTranslateStroke) {
        onTranslateStroke(r.id, hit.x - prev.x, hit.y - prev.y, hit.z - prev.z);
        prev.copy(hit);
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <React.Fragment>
      <LeaderLine surface={surface} elevated={elevated} renderAbove={false} />

      {/* Surface anchor grab handle */}
      <Html position={surface} zIndexRange={[36, 0]} style={{ overflow: 'visible' }}>
        <div
          onPointerDown={handleSurfacePointerDown}
          title="Drag to move stroke"
          style={{
            position: 'absolute', top: '-10px', left: '-10px',
            width: '20px', height: '20px', borderRadius: '50%',
            cursor: 'grab', pointerEvents: 'auto',
          }}
        />
      </Html>

      {/* Badge */}
      <Html position={elevated} zIndexRange={[38, 0]} style={{ overflow: 'visible' }}>
        <div
          onPointerDown={handleBadgePointerDown}
          style={{
            position: 'absolute', top: '-20px', left: '-20px',
            width: '40px', height: '40px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'auto', cursor: 'grab',
          }}
        >
          <div style={{
            width: '22px', height: '22px', borderRadius: '50%',
            background: r.color || '#e05a5a',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: isSelected
              ? `0 4px 20px rgba(0,0,0,0.3), 0 0 0 2.5px #fff, 0 0 0 5px ${r.color || '#e05a5a'}`
              : '0 2px 10px rgba(0,0,0,0.3), 0 0 0 2px #fff',
            transform: isSelected ? 'scale(1.22)' : 'scale(1)',
            transition: 'transform 0.18s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.15s ease',
            pointerEvents: 'none', flexShrink: 0,
          }}>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden>
              <text x="6" y="8.5" textAnchor="middle"
                fontSize={seqNum > 9 ? '6' : '7'} fontWeight="700"
                fontFamily="system-ui, sans-serif" fill="#ffffff"
                style={{ userSelect: 'none' }}
              >{seqNum}</text>
            </svg>
          </div>
        </div>
      </Html>
    </React.Fragment>
  );
};

const SketchPins = ({ redlines, allRedlines, tooltipCount, modelPosition, onOpenNote, selectedId, onUpdateStroke, onTranslateStroke }) => {
  return redlines
    .filter(r => r.visible !== false && r.points3D?.length > 0)
    .map(r => (
      <SketchPinLeader
        key={r.id}
        r={r}
        allRedlines={allRedlines}
        tooltipCount={tooltipCount}
        modelPosition={modelPosition}
        onOpenNote={onOpenNote}
        selectedId={selectedId}
        onUpdateStroke={onUpdateStroke}
        onTranslateStroke={onTranslateStroke}
      />
    ));
};

/* ═══════════════════════════════════════════════════════════════════════════════
   PEN MODE CURSOR — manages pen cursor on Three.js canvas surface
   ═══════════════════════════════════════════════════════════════════════════════ */
const PenModeCursor = ({ active }) => {
  const { gl } = useThree();
  useEffect(() => {
    const canvas = gl.domElement;
    if (!active) { canvas.style.cursor = ''; return; }
    // PenToolOverlay overlay div shows the pen cursor; leave GL canvas at default
    // so orbit cursor can show correctly when right-click pans are handed off
    canvas.style.cursor = '';
    return () => { canvas.style.cursor = ''; };
  }, [active, gl]);
  return null;
};

/* ═══════════════════════════════════════════════════════════════════════════════
   EMOJI TOOL OVERLAY — full-screen intercept for stamp placement
   ═══════════════════════════════════════════════════════════════════════════════ */
const EmojiToolOverlay = ({ active, threeStateRef, orbitRef, selectedEmoji, onPlace, onContextMenu }) => {
  const overlayRef = useRef(null);
  const onPlaceRef = useRef(onPlace);
  useEffect(() => { onPlaceRef.current = onPlace; }, [onPlace]);
  const onContextMenuRef = useRef(onContextMenu);
  useEffect(() => { onContextMenuRef.current = onContextMenu; }, [onContextMenu]);

  const cursorUrl = useMemo(() => makeEmojiCursor(selectedEmoji), [selectedEmoji]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    overlay.style.cursor = active ? cursorUrl : '';
  }, [active, cursorUrl]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay || !active) return;

    const getRaycastHit = (clientX, clientY) => {
      const st = threeStateRef.current;
      if (!st) return null;
      const { camera, gl } = st;
      const rect = gl.domElement.getBoundingClientRect();
      const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -((clientY - rect.top) / rect.height) * 2 + 1;
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
      const meshes = shoeModelMeshes.current;
      if (!meshes || !meshes.length) return null;
      const hits = raycaster.intersectObjects(meshes, false);
      return hits.length ? hits[0].point : null;
    };

    const onDown = (e) => {
      // Middle-click → context menu, opened globally on `auxclick`.
      if (e.button === 1) return;
      // Right-click → orbit (rotate, or pan while Shift held — OrbitControls decides)
      if (e.button === 2) {
        overlay.style.pointerEvents = 'none';
        const glCanvas = threeStateRef.current?.gl?.domElement;
        if (glCanvas) {
          glCanvas.style.cursor = (e.shiftKey || PAN_MOD.active) ? CURSOR_ORBIT_PAN : CURSOR_ORBIT_ROTATE;
          glCanvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY, button: e.button, buttons: e.buttons, pointerId: e.pointerId || 1, pointerType: e.pointerType || 'mouse', isPrimary: true }));
        }
        const restore = () => { overlay.style.pointerEvents = 'auto'; if (glCanvas) glCanvas.style.cursor = ''; window.removeEventListener('pointerup', restore); };
        window.addEventListener('pointerup', restore);
        return;
      }
      // Place on the surface, or in empty space on the orbit-target plane.
      let hit = getRaycastHit(e.clientX, e.clientY);
      if (!hit) {
        const st = threeStateRef.current;
        const p = st && planePointFromScreen(st.camera, st.gl, e.clientX, e.clientY, orbitRef.current?.target?.clone?.());
        if (!p) return;
        hit = { x: p.x, y: p.y, z: p.z };
      }
      onPlaceRef.current({ x: hit.x, y: hit.y, z: hit.z });
    };

    const onWheel = (e) => {
      e.preventDefault();
      const glCanvas = threeStateRef.current?.gl?.domElement;
      if (glCanvas) glCanvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: e.deltaX, deltaY: e.deltaY, deltaZ: e.deltaZ, deltaMode: e.deltaMode, clientX: e.clientX, clientY: e.clientY, ctrlKey: e.ctrlKey }));
    };

    overlay.addEventListener('pointerdown', onDown, { passive: false });
    overlay.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      overlay.removeEventListener('pointerdown', onDown);
      overlay.removeEventListener('wheel', onWheel);
    };
  }, [active, threeStateRef, orbitRef]);

  return <div ref={overlayRef} onContextMenu={(e) => e.preventDefault()} style={{ position: 'fixed', inset: 0, zIndex: active ? 6 : -1, pointerEvents: active ? 'auto' : 'none', touchAction: 'none' }} />;
};

/* ═══════════════════════════════════════════════════════════════════════════════
   TEXT TOOL OVERLAY — full-screen intercept for inline text placement
   ═══════════════════════════════════════════════════════════════════════════════ */
const TextToolOverlay = ({ active, threeStateRef, orbitRef, onPlace, textFont, textSize, textColor, onContextMenu }) => {
  const overlayRef = useRef(null);
  const inputRef = useRef(null);
  const [pendingPos, setPendingPosState] = useState(null);
  const [inputValue, setInputValueState] = useState('');
  const pendingPosRef = useRef(null);
  const inputValueRef = useRef('');
  const onPlaceRef = useRef(onPlace);
  const textFontRef = useRef(textFont);
  const textSizeRef = useRef(textSize);
  const textColorRef = useRef(textColor);
  const onContextMenuRef = useRef(onContextMenu);
  useEffect(() => { onContextMenuRef.current = onContextMenu; }, [onContextMenu]);
  useEffect(() => { onPlaceRef.current = onPlace; }, [onPlace]);
  useEffect(() => { textFontRef.current = textFont; }, [textFont]);
  useEffect(() => { textSizeRef.current = textSize; }, [textSize]);
  useEffect(() => { textColorRef.current = textColor; }, [textColor]);

  const setPendingPos = useCallback((val) => { pendingPosRef.current = val; setPendingPosState(val); }, []);
  const setInputValue = useCallback((val) => { inputValueRef.current = val; setInputValueState(val); }, []);

  const commitCurrent = useCallback(() => {
    const pp = pendingPosRef.current;
    const iv = inputValueRef.current;
    if (pp && iv.trim()) {
      onPlaceRef.current({
        value: iv.trim(),
        x: pp.worldX, y: pp.worldY, z: pp.worldZ,
        font: textFontRef.current, size: textSizeRef.current, color: textColorRef.current,
      });
    }
    pendingPosRef.current = null;
    inputValueRef.current = '';
    setPendingPosState(null);
    setInputValueState('');
  }, []);

  const cancelCurrent = useCallback(() => {
    pendingPosRef.current = null;
    inputValueRef.current = '';
    setPendingPosState(null);
    setInputValueState('');
  }, []);

  // Cursor
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    overlay.style.cursor = active ? CURSOR_TEXT : '';
  }, [active]);

  // Clear pending when tool becomes inactive
  useEffect(() => { if (!active) cancelCurrent(); }, [active, cancelCurrent]);


  // Auto-focus the input when a new pending position is set
  useEffect(() => {
    if (pendingPos) setTimeout(() => inputRef.current?.focus(), 0);
  }, [pendingPos]);

  // Pointer events
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay || !active) return;

    // Text notes can be dropped anywhere — on a surface OR in empty space.
    const getPlacement = (clientX, clientY) => {
      const st = threeStateRef.current;
      if (!st) return null;
      const { camera, gl } = st;
      const rect = gl.domElement.getBoundingClientRect();
      const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -((clientY - rect.top) / rect.height) * 2 + 1;
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
      // 1) Surface hit → float the note just in front of the surface (toward the
      //    camera) so it reads as a short note sitting above the 3D element.
      const meshes = shoeModelMeshes.current;
      if (meshes && meshes.length) {
        const hits = raycaster.intersectObjects(meshes, false);
        if (hits.length) {
          const p = hits[0].point.clone();
          const toCam = camera.position.clone().sub(p).normalize();
          p.addScaledVector(toCam, 0.04);
          return { x: p.x, y: p.y, z: p.z };
        }
      }
      // 2) No surface → place in space on a camera-facing plane through the orbit target.
      const target = orbitRef.current?.target?.clone?.() || new THREE.Vector3(0, 1, 0);
      const camDir = camera.getWorldDirection(new THREE.Vector3());
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, target);
      const hit = new THREE.Vector3();
      return raycaster.ray.intersectPlane(plane, hit) ? { x: hit.x, y: hit.y, z: hit.z } : null;
    };

    const onDown = (e) => {
      // Middle-click → context menu, opened globally on `auxclick`.
      if (e.button === 1) { commitCurrent(); return; }
      // Right-click → orbit (rotate, or pan while Shift held — OrbitControls decides)
      if (e.button === 2) {
        overlay.style.pointerEvents = 'none';
        const glCanvas = threeStateRef.current?.gl?.domElement;
        if (glCanvas) {
          glCanvas.style.cursor = (e.shiftKey || PAN_MOD.active) ? CURSOR_ORBIT_PAN : CURSOR_ORBIT_ROTATE;
          glCanvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY, button: e.button, buttons: e.buttons, pointerId: e.pointerId || 1, pointerType: e.pointerType || 'mouse', isPrimary: true }));
        }
        const restore = () => { overlay.style.pointerEvents = 'auto'; if (glCanvas) glCanvas.style.cursor = ''; window.removeEventListener('pointerup', restore); };
        window.addEventListener('pointerup', restore);
        return;
      }
      // Commit any pending input first
      commitCurrent();
      // Start new note at the clicked position (surface or empty space)
      const place = getPlacement(e.clientX, e.clientY);
      if (!place) return;
      const elevated = { screenX: e.clientX, screenY: e.clientY, worldX: place.x, worldY: place.y, worldZ: place.z };
      pendingPosRef.current = elevated;
      inputValueRef.current = '';
      setPendingPosState(elevated);
      setInputValueState('');
    };

    const onWheel = (e) => {
      e.preventDefault();
      const glCanvas = threeStateRef.current?.gl?.domElement;
      if (glCanvas) glCanvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: e.deltaX, deltaY: e.deltaY, deltaZ: e.deltaZ, deltaMode: e.deltaMode, clientX: e.clientX, clientY: e.clientY, ctrlKey: e.ctrlKey }));
    };

    overlay.addEventListener('pointerdown', onDown, { passive: false });
    overlay.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      overlay.removeEventListener('pointerdown', onDown);
      overlay.removeEventListener('wheel', onWheel);
    };
  }, [active, threeStateRef, orbitRef, commitCurrent]);

  return (
    <>
      <div ref={overlayRef} onContextMenu={(e) => e.preventDefault()} style={{ position: 'fixed', inset: 0, zIndex: active ? 6 : -1, pointerEvents: active ? 'auto' : 'none', touchAction: 'none' }} />
      {active && pendingPos && (
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation(); // first ESC cancels input; global handler gets second ESC
              cancelCurrent();
            } else if (e.key === 'Enter') {
              e.stopPropagation();
              commitCurrent();
            }
          }}
          onBlur={() => {
            // Defer so any pointerdown on overlay fires first and handles its own commit
            setTimeout(() => { if (pendingPosRef.current) commitCurrent(); }, 0);
          }}
          placeholder="Type…"
          style={{
            position: 'fixed',
            left: `${pendingPos.screenX}px`,
            top: `${pendingPos.screenY}px`,
            zIndex: 8,
            fontFamily: textFont || 'Inter',
            fontSize: `${textSize || 14}px`,
            color: textColor || UI.text,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            borderBottom: '1.5px solid rgba(108,92,231,0.55)',
            padding: '1px 2px',
            margin: 0,
            minWidth: '40px',
            width: `${Math.max(4, inputValue.length + 2)}ch`,
            lineHeight: 1.2,
            transform: 'translate(-50%, -50%)',
            caretColor: UI.gold,
            pointerEvents: 'auto',
          }}
        />
      )}
    </>
  );
};

/* Hides an HTML annotation when the shoe model sits between the camera and the
   annotation's anchor point — same camera→point raycast PinLeader uses. This keeps
   every annotation type (text, emoji, pins) from drawing through 3D surfaces; they
   only show when the anchor is actually within the camera's line of sight. */
const useAnnotationOcclusion = (pos, divRef) => {
  const { camera } = useThree();
  const rc = useRef(new THREE.Raycaster());
  useFrame(() => {
    const div = divRef.current;
    if (!div) return;
    const meshes = shoeModelMeshes.current;
    if (!meshes || !meshes.length) { div.style.visibility = 'visible'; return; }
    const p = new THREE.Vector3(pos[0], pos[1], pos[2]);
    const dist = camera.position.distanceTo(p);
    rc.current.set(camera.position, p.clone().sub(camera.position).normalize());
    const hits = rc.current.intersectObjects(meshes, false);
    const occluded = hits.length > 0 && hits[0].distance < dist - 0.05;
    div.style.visibility = occluded ? 'hidden' : 'visible';
  });
};

/* ═══════════════════════════════════════════════════════════════════════════════
   EMOJI ANNOTATIONS 3D — renders placed emoji stamps inside Canvas
   ═══════════════════════════════════════════════════════════════════════════════ */
const EmojiAnnotation3D = ({ annotation: a }) => {
  const divRef = useRef();
  useAnnotationOcclusion([a.x, a.y, a.z], divRef);
  return (
    <Html position={[a.x, a.y, a.z]} style={{ pointerEvents: 'none' }}>
      <div ref={divRef} style={{ fontSize: '30px', lineHeight: 1, transform: 'translate(-50%, -50%)', pointerEvents: 'none', userSelect: 'none' }}>
        {a.emoji}
      </div>
    </Html>
  );
};

const EmojiAnnotations3D = ({ annotations, hidden }) => {
  if (hidden || !annotations.length) return null;
  return (
    <>
      {annotations.map(a => (
        <EmojiAnnotation3D key={a.id} annotation={a} />
      ))}
    </>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   TEXT ANNOTATIONS 3D — renders text annotations inside Canvas with gumball drag
   ═══════════════════════════════════════════════════════════════════════════════ */
const TextAnnotation3D = ({ annotation: a, activeTool, orbitRef, onMove }) => {
  const { camera, gl } = useThree();
  const inCursor = activeTool === 'cursor';
  const [isHovered, setIsHovered] = useState(false);

  const startDrag = useCallback((e) => {
    if (!inCursor) return;
    e.stopPropagation();
    const annPos = new THREE.Vector3(a.x, a.y, a.z);
    const camDir = annPos.clone().sub(camera.position).normalize();
    const dragPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, annPos);

    const getHit = (cx, cy) => {
      const rect = gl.domElement.getBoundingClientRect();
      const nx = ((cx - rect.left) / rect.width) * 2 - 1;
      const ny = -((cy - rect.top) / rect.height) * 2 + 1;
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(nx, ny), camera);
      const hit = new THREE.Vector3();
      return ray.ray.intersectPlane(dragPlane, hit) ? hit : null;
    };

    const startHit = getHit(e.clientX, e.clientY);
    if (!startHit) return;
    const startPos = annPos.clone();
    if (orbitRef.current) orbitRef.current.enabled = false;

    const handleMove = (me) => {
      const hit = getHit(me.clientX, me.clientY);
      if (!hit) return;
      const d = hit.clone().sub(startHit);
      onMove(a.id, { x: startPos.x + d.x, y: startPos.y + d.y, z: startPos.z + d.z });
    };
    const handleUp = () => {
      if (orbitRef.current) orbitRef.current.enabled = true;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  }, [inCursor, a, camera, gl, orbitRef, onMove]);

  const divRef = useRef();
  useAnnotationOcclusion([a.x, a.y, a.z], divRef);
  return (
    <>
      <Html position={[a.x, a.y, a.z]} style={{ pointerEvents: inCursor ? 'auto' : 'none', userSelect: 'none' }}>
        <div
          ref={divRef}
          onPointerEnter={() => inCursor && setIsHovered(true)}
          onPointerLeave={() => setIsHovered(false)}
          onPointerDown={startDrag}
          style={{
            transform: 'translate(-50%, -50%)',
            fontFamily: a.font || 'Inter',
            fontSize: `${a.size || 14}px`,
            color: a.color || UI.text,
            whiteSpace: 'nowrap',
            cursor: inCursor ? 'move' : 'default',
            userSelect: 'none',
            padding: '2px 5px',
            borderRadius: '4px',
            background: inCursor && isHovered ? 'rgba(108,92,231,0.10)' : 'transparent',
            border: inCursor && isHovered ? '1px dashed rgba(108,92,231,0.45)' : '1px solid transparent',
            transition: 'background 0.1s, border 0.1s',
            textShadow: '0 1px 3px rgba(255,255,255,0.85), 0 0 1px rgba(255,255,255,0.5)',
          }}
        >
          {a.value}
        </div>
      </Html>
    </>
  );
};

const TextAnnotations3D = ({ annotations, hidden, activeTool, orbitRef, onMove }) => {
  if (hidden || !annotations.length) return null;
  return (
    <>
      {annotations.map(a => (
        <TextAnnotation3D key={a.id} annotation={a} activeTool={activeTool} orbitRef={orbitRef} onMove={onMove} />
      ))}
    </>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   UNIFIED ANNOTATIONS DRAWER — side panel combining comments + sketches
   ═══════════════════════════════════════════════════════════════════════════════ */
const UnifiedAnnotationsDrawer = ({
  tooltips, redlines, setRedlines,
  onRemoveTooltip, onFlyToPin, onOpenComment, isPinSeen, onPinViewed, currentUser, setCurrentUser,
  onOpenStrokeThread, onUndoRedline, onRedoRedline, onClearRedlines, undoStack,
  annotationMode, tooltipsHidden, onToggleTooltips, onClearComments,
  notesOpen, onSetNotesOpen, notesView = 'comments', onSetNotesView,
  activeTool,
}) => {
  const penActive     = activeTool === 'pen' || activeTool === 'pencil';
  const commentActive = activeTool === 'comment' || activeTool === 'callout';
  const setView = onSetNotesView || (() => {});
  const [internalOpen, setInternalOpen] = useState(true);
  const open = notesOpen !== undefined ? notesOpen : internalOpen;
  const setOpen = onSetNotesOpen !== undefined ? onSetNotesOpen : setInternalOpen;
  const [confirmClear, setConfirmClear] = useState(false);

  // Auto-open when annotation mode activates
  useEffect(() => { if (annotationMode) setOpen(true); }, [annotationMode]);

  // Auto-open/switch/close panel based on active tool
  useEffect(() => {
    if (penActive) { setView('sketches'); setOpen(true); }
    else if (commentActive) { setView('comments'); setOpen(true); }
    else { setOpen(false); }
  }, [penActive, commentActive]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleStrokeVisibility = (id) => setRedlines(prev => prev.map(r => r.id === id ? { ...r, visible: !r.visible } : r));
  const deleteStroke = (id) => setRedlines(prev => prev.filter(r => r.id !== id));
  const renameStroke = (id, name) => setRedlines(prev => prev.map(r => r.id === id ? { ...r, name } : r));
  // Show/hide all — comments use the global tooltipsHidden flag; sketches toggle every stroke.
  const sketchesAllHidden = redlines.length > 0 && redlines.every(r => !r.visible);
  const allHidden = notesView === 'sketches' ? sketchesAllHidden : !!tooltipsHidden;
  const toggleShowHideAll = () => {
    if (notesView === 'sketches') {
      const next = !sketchesAllHidden;
      setRedlines(prev => prev.map(r => ({ ...r, visible: !next })));
    } else {
      onToggleTooltips?.();
    }
  };
  const clearCurrent = () => {
    if (notesView === 'sketches') onClearRedlines?.(); else onClearComments?.();
    setConfirmClear(false);
  };

  // Merge tooltips + redlines into one list sorted by sequenceNumber / creation time
  const allItems = useMemo(() => {
    const comments = tooltips.map((t, i) => ({
      kind: 'comment', id: t.id, num: t.sequenceNumber || i + 1,
      label: t.label || `Comment ${i + 1}`, author: t.author, created: t.created || t.id, data: t,
    }));
    const sketches = redlines.map((r, i) => ({
      kind: 'sketch', id: r.id, num: tooltips.length + i + 1,
      label: r.name || `Sketch ${i + 1}`, author: r.author || currentUser, created: r.created || r.id, data: r,
    }));
    return [...comments, ...sketches].sort((a, b) => a.num - b.num);
  }, [tooltips, redlines, currentUser]);

  const totalCount = tooltips.length + redlines.length;

  if (totalCount === 0) return null;

    const isOpen = open;
  const unseenComments = tooltips.reduce((n, t) => n + (isPinSeen(t.id) ? 0 : 1), 0);
  const sketchCount = redlines.length;
  // Each floating button focuses the drawer on one type.
  const viewItems = notesView === 'sketches'
    ? allItems.filter(x => x.kind === 'sketch')
    : allItems.filter(x => x.kind === 'comment');
  const drawerTitle = notesView === 'sketches' ? 'Sketches' : 'Comments';
  const headerCount = viewItems.length;
  const headerLabel = notesView === 'sketches'
    ? (headerCount === 1 ? 'sketch' : 'sketches')
    : (headerCount === 1 ? 'comment' : 'comments');
  const pickView = (view) => {
    if (isOpen && notesView === view) { setOpen(false); return; }
    setView(view); setOpen(true);
  };
  const NotifBadge = ({ count }) => count > 0 ? (
    <span style={{ position: 'absolute', top: '-4px', right: '-4px', minWidth: '16px', height: '16px', padding: '0 4px', boxSizing: 'border-box', borderRadius: '999px', background: '#fff', color: DS.accent, fontSize: '10px', fontWeight: 700, fontFamily: DS.font, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>{count}</span>
  ) : null;
  return (
    <>

      {/* Drawer panel — aligned to the Layers / Environment panels (top 120, 8px from edge) */}
      <div style={{
        position: 'fixed', top: '120px', right: '8px',
        transformOrigin: 'top right',
        transform: isOpen ? 'translateX(0) scale(1)' : 'translateX(12px) scale(0.985)',
        opacity: isOpen ? 1 : 0,
        pointerEvents: isOpen ? 'auto' : 'none',
        transition: 'transform 0.26s cubic-bezier(0.22,1,0.36,1), opacity 0.2s ease',
        zIndex: isOpen ? 32 : 29, userSelect: 'none',
        filter: 'drop-shadow(0 12px 16px rgba(16,24,40,0.18))',
      }}>
      {/* Panel body */}
      <div style={{
        width: '328px', maxHeight: 'calc(100vh - 140px)', overflow: 'hidden',
        background: DS.surface, border: `1px solid var(--color-border-default)`,
        borderRadius: '12px', position: 'relative',
        display: 'flex', flexDirection: 'column', fontFamily: DS.font,
      }}>
        {/* Header — title, count pill, then » collapse on the right */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px 10px 16px', borderBottom: `1px solid ${DS.headerDivider}`, flexShrink: 0 }}>
          <span style={{ flex: 1, fontSize: '14px', fontWeight: 600, color: DS.white, fontFamily: DS.font }}>{drawerTitle}</span>
          {headerCount > 0 && (
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#A99CFF', background: 'rgba(123,89,255,0.20)', borderRadius: '999px', padding: '3px 10px', fontFamily: DS.font, lineHeight: 1.2, whiteSpace: 'nowrap' }}>
              {headerCount} {headerLabel}
            </span>
          )}
          <button title="Collapse" onClick={() => setOpen(false)} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '26px', height: '26px', borderRadius: '7px', border: 'none', background: 'transparent',
            cursor: 'pointer', color: 'var(--color-icon-subtle)', padding: 0, transition: 'background 0.12s, color 0.12s',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-overlay-subtle)'; e.currentTarget.style.color = 'var(--color-icon-default)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-icon-subtle)'; }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M7 7 L12 12 L7 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><path d="M13 7 L18 12 L13 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0 10px', background: DS.surface }}>
          {viewItems.length === 0 ? (
            <div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--color-text-subtle)', fontSize: '12px', lineHeight: '1.7', fontFamily: DS.font }}>
              {notesView === 'sketches' ? 'Use the pen or pencil to add sketches.' : 'Use the comment tool to add comments.'}
            </div>
          ) : viewItems.map((item, i) => {
            const isComment = item.kind === 'comment';
            const t = item.data;
            const seen = isComment ? isPinSeen(t.id) : true;
            const badgeBg = 'rgba(123,89,255,0.20)';
            const badgeText = DS.accent;
            return (
              <div key={item.id}>
                {i > 0 && <div style={{ height: '1px', margin: '0 0 0 54px', background: 'var(--color-overlay-divider)' }} />}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '9px 12px 9px 13px',
                  background: !seen ? 'rgba(123,89,255,0.12)' : 'transparent',
                  borderLeft: `3px solid ${!seen ? DS.accent : 'transparent'}`,
                  cursor: 'pointer', transition: 'background 0.12s',
                }}
                  onClick={() => { if (isComment) { (onOpenComment || onFlyToPin)(t); onPinViewed(t.id); } else onOpenStrokeThread(t); }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--color-overlay-subtle)'}
                  onMouseLeave={e => e.currentTarget.style.background = !seen ? 'rgba(123,89,255,0.12)' : 'transparent'}
                >
                  {/* Number badge — identical for both types */}
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: badgeBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: '10px', fontWeight: '700', color: badgeText, lineHeight: 1, fontFamily: DS.font }}>{item.num}</span>
                  </div>

                  {/* Label + author */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: '500', color: 'var(--color-text-default)', fontFamily: DS.font, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</div>
                    {item.author && <div style={{ fontSize: '11px', color: 'var(--color-text-subtle)', marginTop: '1px', fontFamily: DS.font }}>{item.author}</div>}
                  </div>

                  {/* Action buttons — identical layout for both */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
                    {!isComment && (
                      <button onClick={e => { e.stopPropagation(); toggleStrokeVisibility(t.id); }} title="Toggle visibility"
                        style={{ background: 'none', border: 'none', color: t.visible ? 'var(--color-icon-subtle)' : 'var(--color-icon-disabled)', cursor: 'pointer', padding: '5px', display: 'flex', alignItems: 'center', borderRadius: '6px' }}
                        onMouseEnter={ev => ev.currentTarget.style.background = 'var(--color-overlay-medium)'}
                        onMouseLeave={ev => ev.currentTarget.style.background = 'none'}>
                        {t.visible
                          ? <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.2"/><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2"/></svg>
                          : <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.2" opacity="0.35"/><line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>}
                      </button>
                    )}
                    <button onClick={e => { e.stopPropagation(); isComment ? onRemoveTooltip(t.id) : deleteStroke(t.id); }} title="Mark resolved"
                      style={{ background: 'none', border: 'none', color: 'var(--color-icon-subtle)', cursor: 'pointer', padding: '5px', display: 'flex', alignItems: 'center', borderRadius: '6px' }}
                      onMouseEnter={ev => { ev.currentTarget.style.color = '#92F5B5'; ev.currentTarget.style.background = 'rgba(101,232,156,0.16)'; }}
                      onMouseLeave={ev => { ev.currentTarget.style.color = '#504C55'; ev.currentTarget.style.background = 'none'; }}>
                      <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3 8.5l3.2 3.2L13 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer — Show/Hide all + Clear all (identical for both views) */}
        {viewItems.length > 0 && (
          <div style={{ padding: '10px 12px', borderTop: `1px solid ${DS.headerDivider}`, background: DS.surface, display: 'flex', gap: '6px' }}>
            <button onClick={toggleShowHideAll} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: 'transparent', border: '1px solid var(--color-border-default)', borderRadius: '8px', color: 'var(--color-text-default)', fontFamily: DS.font, fontSize: '12px', fontWeight: 500, padding: '8px 0', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--color-overlay-subtle)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              {allHidden
                ? <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.2" opacity="0.5"/><line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                : <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.2"/><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2"/></svg>}
              {allHidden ? 'Show all' : 'Hide all'}
            </button>
            <button onClick={() => setConfirmClear(true)} style={{ flex: 1, background: 'transparent', border: '1px solid rgba(255,92,92,0.35)', borderRadius: '8px', color: '#FF5C5C', fontFamily: DS.font, fontSize: '12px', fontWeight: 500, padding: '8px 0', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,92,92,0.14)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>Clear all</button>
          </div>
        )}

        {/* Clear-all confirmation */}
        {confirmClear && (
          <div onClick={() => setConfirmClear(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '12px', zIndex: 5 }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '232px', background: DS.surface, border: `1px solid var(--color-border-default)`, borderRadius: '12px', padding: '16px', boxShadow: DS.shadowLg, fontFamily: DS.font }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-default)', marginBottom: '4px' }}>Clear all {notesView === 'sketches' ? 'sketches' : 'comments'}?</div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-subtle)', lineHeight: 1.5, marginBottom: '14px' }}>This removes all {notesView === 'sketches' ? 'sketches' : 'comments'} and can't be undone.</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setConfirmClear(false)} style={{ flex: 1, background: 'transparent', border: '1px solid var(--color-border-default)', borderRadius: '8px', color: 'var(--color-text-default)', fontFamily: DS.font, fontSize: '12px', fontWeight: 500, padding: '8px 0', cursor: 'pointer' }}>Cancel</button>
                <button onClick={clearCurrent} style={{ flex: 1, background: '#FF5C5C', border: 'none', borderRadius: '8px', color: '#fff', fontFamily: DS.font, fontSize: '12px', fontWeight: 600, padding: '8px 0', cursor: 'pointer' }}>Clear all</button>
              </div>
            </div>
          </div>
        )}
      </div>
      </div>
    </>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   SHOWCASE UI
   ═══════════════════════════════════════════════════════════════════════════════ */
const ShowcaseUI = (props) => {
  const {
    clickPoint, onClearClick, onAddTooltip, tooltips, onRemoveTooltip, onClearComments,
    selectedId, onSelect, onMove, onRename, onSetCamera, onClearCamera, onUpdateTooltip,
    onResetCamera, onToggleAutoRotate, autoRotate, panelOpen, setPanelOpen,
    tooltipsHidden, onToggleTooltips, scene, onUpdateScene, settingsOpen,
    setSettingsOpen, onFlyTo, currentUser, setCurrentUser, isPinSeen,
    threeStateRef, orbitRef, logoMenuOpen, setLogoMenuOpen,
    onNewFile, onImportFile, onNavCubeClick, fbxFileName,
    annotationMode, onToggleAnnotation,
    activeTool, setActiveTool,
    onPinViewed, renderAbove, onToggleRenderAbove,
    redlineColor, setRedlineColor, redlineWidth, setRedlineWidth,
    penColor, setPenColor, pencilColor, setPencilColor,
    redlines, setRedlines, undoStack,
    onUndoRedline, onRedoRedline, onClearRedlines,
    pendingStrokeId, onPostSketchSave, onPostSketchDiscard,
    expandedCommentId, setExpandedCommentId,
    presentationMode,
    onOpenStrokeThread,
    strokeOpacity, setStrokeOpacity,
    commentMode, setCommentMode,
    textFont, setTextFont, textSize, setTextSize,
    selectedEmoji, setSelectedEmoji,
    cubeDocked, setCubeDocked,
  } = props;

  // Derived modes
  const editMode = annotationMode && activeTool === 'comment';

  // Notes drawer (right) and Scene settings (left) live on opposite sides, so they
  // open independently — neither closes the other.
  const [notesDrawerOpen, setNotesDrawerOpen] = useState(false);
  const [notesView, setNotesView] = useState('comments'); // 'comments' | 'sketches'
  const handleSetNotesOpen = useCallback((v) => {
    setNotesDrawerOpen(prev => (typeof v === 'function' ? v(prev) : v));
  }, []);
  const handleSetSettingsOpen = useCallback((v) => {
    setSettingsOpen(prev => (typeof v === 'function' ? v(prev) : v));
  }, [setSettingsOpen]);

  return (
    <>
      {!props.presentationMode && (
        <>
          {LAYOUT === 'b' ? (
            <TopBarB
              logoMenuOpen={logoMenuOpen} setLogoMenuOpen={setLogoMenuOpen}
              onImportFile={onImportFile}
              layersOpen={props.layersOpen} setLayersOpen={props.setLayersOpen}
              settingsOpen={settingsOpen} setSettingsOpen={handleSetSettingsOpen}
              cubeDocked={cubeDocked} setCubeDocked={setCubeDocked}
            />
          ) : LAYOUT === 'c' ? (
            <TopBarC
              logoMenuOpen={logoMenuOpen} setLogoMenuOpen={setLogoMenuOpen}
              onImportFile={onImportFile}
              layersOpen={props.layersOpen} setLayersOpen={props.setLayersOpen}
              settingsOpen={settingsOpen} setSettingsOpen={handleSetSettingsOpen}
              cubeDocked={cubeDocked} setCubeDocked={setCubeDocked}
            />
          ) : (
            <TopBar
              logoMenuOpen={logoMenuOpen} setLogoMenuOpen={setLogoMenuOpen}
              onNewFile={onNewFile} onImportFile={onImportFile} fileName={fbxFileName}
              layersOpen={props.layersOpen} setLayersOpen={props.setLayersOpen}
              settingsOpen={settingsOpen} setSettingsOpen={handleSetSettingsOpen}
              cubeDocked={cubeDocked} setCubeDocked={setCubeDocked}
            />
          )}

          {/* Layers drawer */}
          <LayersDrawer meshesRef={shoeModelMeshes} open={props.layersOpen} onOpenChange={props.setLayersOpen} panelTop={LAYOUT === 'b' ? '60px' : LAYOUT === 'c' ? '124px' : '120px'} />

          {/* Scene settings drawer — toggled with E */}
          <SceneSettingsPanel
            scene={scene} onUpdate={onUpdateScene}
            settingsOpen={settingsOpen} setSettingsOpen={handleSetSettingsOpen}
            autoRotate={autoRotate} onToggleAutoRotate={onToggleAutoRotate}
            panelTop={LAYOUT === 'b' ? '60px' : LAYOUT === 'c' ? '124px' : '120px'}
          />

          {/* Right nav — members + share. Only needed for B/C since TopBar (A) already renders it */}
          {LAYOUT !== 'a' && <RightNav />}

          {/* Theme toggle — dev tool */}
          <ThemeToggle />

{/* Tool selection moved to the always-open BottomToolbar (rendered at App level) */}
        </>
      )}



      {/* Comment floating panel — only active when comment tool is selected */}
      {editMode && (
        <CommentFloatingPanel
          point={clickPoint}
          onAdd={onAddTooltip}
          onClear={onClearClick}
          nextNumber={(tooltips?.length ?? 0) + 1}
          currentUser={currentUser}
        />
      )}

      {/* Post-sketch save/discard panel */}
      {pendingStrokeId && (() => {
        const stroke = redlines.find(r => r.id === pendingStrokeId);
        if (!stroke) return null;
        return (
          <PostSketchPanel
            onSave={onPostSketchSave}
            onDiscard={onPostSketchDiscard}
          />
        );
      })()}

      {/* Comment detail popup — shown when a pin is clicked */}
      {expandedCommentId && (() => {
        const t = tooltips.find(x => x.id === expandedCommentId);
        if (!t) return null;
        return (
          <CommentDetailPopup
            tooltip={t}
            onClose={() => setExpandedCommentId(null)}
            onUpdate={onUpdateTooltip}
            currentUser={currentUser}
          />
        );
      })()}

      {/* Old in-annotation toolbar removed — replaced by the always-open
          BottomToolbar + contextual popover (rendered at App level). */}

      {/* Unified right-side drawer — merges comments + sketches */}
      <UnifiedAnnotationsDrawer
        tooltips={tooltips} redlines={redlines} setRedlines={setRedlines}
        onRemoveTooltip={onRemoveTooltip} onFlyToPin={onFlyTo}
        onOpenComment={(t) => { onFlyTo(t); setExpandedCommentId(t.id); }} isPinSeen={isPinSeen}
        onPinViewed={onPinViewed} currentUser={currentUser} setCurrentUser={setCurrentUser}
        onOpenStrokeThread={onOpenStrokeThread}
        onUndoRedline={onUndoRedline} onRedoRedline={onRedoRedline}
        onClearRedlines={onClearRedlines} undoStack={undoStack}
        annotationMode={annotationMode}
        tooltipsHidden={tooltipsHidden} onToggleTooltips={onToggleTooltips} onClearComments={onClearComments}
        notesOpen={notesDrawerOpen} onSetNotesOpen={handleSetNotesOpen}
        notesView={notesView} onSetNotesView={setNotesView}
        activeTool={activeTool}
      />
    </>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   CAMERA FLY HOOK
   ═══════════════════════════════════════════════════════════════════════════════ */
const useCameraFlyTo = (orbitRef) => {
  const animRef = useRef(null);
  const flyTo = (position, target, duration = 1000, onComplete) => {
    if (!orbitRef.current) return;
    const controls = orbitRef.current;
    const cam = controls.object;
    const startPos = cam.position.clone();
    const startTarget = controls.target.clone();
    const endPos = new THREE.Vector3(...position);
    const endTarget = new THREE.Vector3(...target);
    const startTime = performance.now();
    if (animRef.current) cancelAnimationFrame(animRef.current);
    const tick = (now) => {
      const t = Math.min((now - startTime) / duration, 1);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      cam.position.lerpVectors(startPos, endPos, e);
      controls.target.lerpVectors(startTarget, endTarget, e);
      controls.update();
      if (t < 1) animRef.current = requestAnimationFrame(tick);
      else onComplete?.();
    };
    animRef.current = requestAnimationFrame(tick);
  };
  const flyToTarget = (targetArr, zoomDistance = 2.0, duration = 1000) => {
    if (!orbitRef.current) return;
    const controls = orbitRef.current;
    const cam = controls.object;
    const endTarget = new THREE.Vector3(...targetArr);
    const currentDir = cam.position.clone().sub(controls.target).normalize();
    const endPos = endTarget.clone().add(currentDir.multiplyScalar(zoomDistance));
    flyTo(endPos.toArray(), targetArr, duration);
  };
  return { flyTo, flyToTarget };
};

/* ═══════════════════════════════════════════════════════════════════════════════
   LOADER
   ═══════════════════════════════════════════════════════════════════════════════ */
const LoaderOverlay = () => createPortal(
  <>
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: UI.font, background: '#f0f0f2', zIndex: 9999 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
        {/* FIX: use brand purple, not brown/gold */}
        <div style={{ width: '36px', height: '36px', border: '2px solid rgba(0,0,0,0.1)', borderTop: `2px solid ${UI.purple}`, borderRadius: '50%', animation: 'spin 0.9s linear infinite' }} />
        <div style={{ fontSize: '9px', fontWeight: '600', letterSpacing: '0.22em', textTransform: 'uppercase', color: '#3a3a3a' }}>Loading Model</div>
      </div>
    </div>
  </>,
  document.body
);

/* ═══════════════════════════════════════════════════════════════════════════════
   VIEWPOINTS BAR
   ═══════════════════════════════════════════════════════════════════════════════ */
const ViewpointsBar = ({
  viewpoints, setViewpoints,
  activeIndex, setActiveIndex, atViewpoint, setAtViewpoint, viewpointFlyRef,
  flyTo, orbitRef,
  presentationMode, presAutoPlay, PRES_INTERVAL,
}) => {
  const FONT = "'Inter', sans-serif";
  const [barHovered,  setBarHovered]  = React.useState(false);
  const [hoveredId,   setHoveredId]   = React.useState(null);
  const [contextMenu, setContextMenu] = React.useState(null);
  const [renamingId,  setRenamingId]  = React.useState(null);
  const [renameVal,   setRenameVal]   = React.useState('');
  const [dragFrom,    setDragFrom]    = React.useState(null);
  const [dragOver,    setDragOver]    = React.useState(null);
  const leaveTimer  = React.useRef(null);
  const segmentRefs = React.useRef([]);
  const pillRef     = React.useRef(null);

  // Delayed hide so mouse can travel from pill to + button without flicker
  const onEnter = () => { clearTimeout(leaveTimer.current); setBarHovered(true); };
  const onLeave = () => { leaveTimer.current = setTimeout(() => { setBarHovered(false); setHoveredId(null); }, 150); };

  // Close context menu on outside click
  React.useEffect(() => {
    if (!contextMenu) return;
    const close = (e) => setContextMenu(null);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [contextMenu]);

  // Close rename on outside click
  React.useEffect(() => {
    if (!renamingId) return;
    const close = (e) => {
      // don't close if clicking inside the rename input itself
      if (e.target.dataset.renameInput) return;
      commitRename();
    };
    // small delay so the pointerdown that opened rename doesn't immediately close it
    const t = setTimeout(() => window.addEventListener('pointerdown', close), 200);
    return () => { clearTimeout(t); window.removeEventListener('pointerdown', close); };
  }, [renamingId, renameVal]); // eslint-disable-line react-hooks/exhaustive-deps

  const commitRename = () => {
    const v = renameVal.trim();
    if (v) setViewpoints(vps => vps.map(vp => vp.id === renamingId ? { ...vp, name: v } : vp));
    setRenamingId(null);
  };

  const flyToVp = (vp, i) => {
    setActiveIndex(i);
    viewpointFlyRef.current = true;
    setAtViewpoint(true); // turn white immediately, onChange suppressed during flight
    if (vp.up && orbitRef.current) { orbitRef.current.object.up.set(...vp.up); orbitRef.current.update(); }
    flyTo(vp.pos, vp.tgt, 900, () => { viewpointFlyRef.current = false; });
  };

  const addViewpoint = () => {
    if (!orbitRef.current) return;
    const cam = orbitRef.current.object;
    const tgt = orbitRef.current.target;
    const n   = viewpoints.length + 1;
    const newVp = { pos: cam.position.toArray(), tgt: tgt.toArray(), up: cam.up.toArray(), id: `user-${Date.now()}`, name: `Viewpoint ${n}` };
    const newIndex = viewpoints.length;
    setViewpoints(vps => [...vps, newVp]);
    setActiveIndex(newIndex);
    setTimeout(() => { setRenamingId(newVp.id); setRenameVal(newVp.name); }, 50);
  };

  // ── Drag to reorder — global listeners, math-based hit test from pill container ──
  React.useEffect(() => {
    if (dragFrom === null) return;
    const SLOT = 28; // 24px bar + 4px gap
    const PAD  = 8;  // pill padding
    const onMove = (e) => {
      if (!pillRef.current) return;
      const rect = pillRef.current.getBoundingClientRect();
      const relX = e.clientX - rect.left - PAD;
      const raw  = Math.round(relX / SLOT);
      const n    = segmentRefs.current.filter(Boolean).length;
      const over = Math.max(0, Math.min(n - 1, raw));
      setDragOver(over);
    };
    const onUp = () => {
      setDragFrom(f => {
        setDragOver(d => {
          if (f !== null && d !== null && f !== d) {
            setViewpoints(vps => {
              const arr = [...vps];
              const [moved] = arr.splice(f, 1);
              arr.splice(d, 0, moved);
              return arr;
            });
            setActiveIndex(prev => {
              if (prev === f) return d;
              if (prev > f && prev <= d) return prev - 1;
              if (prev < f && prev >= d) return prev + 1;
              return prev;
            });
          }
          return null;
        });
        return null;
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, [dragFrom]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      style={{ position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 100, pointerEvents: 'auto', userSelect: 'none' }}
      onMouseEnter={onEnter} onMouseLeave={onLeave}
    >
      {/* Main pill */}
      <div ref={pillRef} style={{ position: 'relative', display: 'inline-flex', gap: '4px', alignItems: 'center', background: 'rgba(102,97,107,0.25)', borderRadius: '40px', padding: '8px' }}>
        {(() => {
          // Build visual order: remove dragged item, inject placeholder at dragOver position
          let visualItems;
          if (dragFrom !== null && dragOver !== null) {
            const items = viewpoints.map((vp, i) => ({ vp, origIndex: i, isPlaceholder: false }));
            const [dragged] = items.splice(dragFrom, 1);
            // After removing dragFrom, insert placeholder at dragOver position
            items.splice(dragOver, 0, { isPlaceholder: true, id: '__placeholder__' });
            // Append ghost (dragged item hidden, keeps ref in DOM)
            visualItems = [...items, { ...dragged, isGhost: true }];
          } else {
            visualItems = viewpoints.map((vp, i) => ({ vp, origIndex: i, isPlaceholder: false }));
          }

          return visualItems.map((item) => {
            if (item.isPlaceholder) {
              return (
                <div key="__placeholder__" style={{ width: '24px', height: '6px', borderRadius: '40px', background: 'rgba(255,255,255,0.08)', flexShrink: 0, outline: '1.5px dashed rgba(255,255,255,0.3)', outlineOffset: '2px' }} />
              );
            }
            const { vp, origIndex: i, isGhost } = item;
            const isCurrent  = atViewpoint && i === activeIndex;
            const isRenaming = renamingId === vp.id;
            return (
              <div
                key={vp.id}
                ref={el => segmentRefs.current[i] = el}
                style={{ position: 'relative', cursor: dragFrom !== null ? 'grabbing' : 'pointer', ...(isGhost ? { display: 'none' } : {}) }}
                onMouseEnter={() => { if (!isGhost) setHoveredId(vp.id); }}
                onMouseLeave={() => setHoveredId(null)}
                onContextMenu={e => { e.preventDefault(); setContextMenu({ id: vp.id, x: e.clientX, y: e.clientY }); }}
                onPointerDown={e => {
                  if (e.button !== 0) return;
                  flyToVp(vp, i);
                  setDragFrom(i);
                  setDragOver(i);
                }}
              >
                <div style={{
                  width: '24px', height: '4px', borderRadius: '40px',
                  background: (presAutoPlay && i === activeIndex) ? 'rgba(255,255,255,0.25)' : isCurrent ? '#ffffff' : 'rgba(255,255,255,0.3)',
                  transition: 'background 0.15s',
                  overflow: 'hidden', position: 'relative',
                }}>
                  {presAutoPlay && i === activeIndex && (
                    <div key={`fill-${activeIndex}`} style={{ position: 'absolute', inset: 0, background: '#fff', transformOrigin: 'left center', animation: `presBarFill ${PRES_INTERVAL}ms linear forwards` }} />
                  )}
                </div>

                {/* Name tooltip on hover */}
                {hoveredId === vp.id && !isRenaming && !contextMenu && dragFrom === null && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 18px)', left: '50%', transform: 'translateX(-50%)', background: DS.surface, borderRadius: '16px', padding: '8px 12px', fontFamily: FONT, fontSize: '12px', fontWeight: 600, color: DS.white, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 10, boxShadow: '0 4px 8px rgba(16,24,40,0.1)' }}>
                    {vp.name}
                  </div>
                )}

                {/* Rename input */}
                {isRenaming && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 18px)', left: '50%', transform: 'translateX(-50%)', background: DS.surface, borderRadius: '16px', padding: '6px 12px', zIndex: 10, boxShadow: '0 4px 8px rgba(16,24,40,0.1)' }}>
                    <input
                      autoFocus
                      data-rename-input="1"
                      value={renameVal}
                      onChange={e => setRenameVal(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitRename(); } if (e.key === 'Escape') { e.preventDefault(); setRenamingId(null); } }}
                      onPointerDown={e => e.stopPropagation()}
                      style={{ background: 'none', border: 'none', outline: 'none', padding: 0, fontFamily: FONT, fontSize: '12px', fontWeight: 600, color: DS.white, width: Math.max(80, renameVal.length * 8) + 'px', display: 'block' }}
                    />
                  </div>
                )}
              </div>
            );
          });
        })()}

        {/* Context menu */}
        {contextMenu && (() => {
          const vp = viewpoints.find(v => v.id === contextMenu.id);
          if (!vp) return null;
          return createPortal(
            <div onPointerDown={e => e.stopPropagation()} style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 200, background: DS.surface, borderRadius: '12px', padding: '8px 0', boxShadow: '0 12px 16px rgba(16,24,40,0.08)', minWidth: '102px' }}>
              {[
                { label: 'Rename', action: () => { setRenamingId(vp.id); setRenameVal(vp.name); setContextMenu(null); } },
                { label: 'Delete', action: () => { setViewpoints(vps => vps.filter(v => v.id !== vp.id)); setContextMenu(null); } },
              ].map(({ label, action }) => (
                <div key={label} onPointerDown={e => { e.stopPropagation(); action(); }}
                  style={{ height: '32px', display: 'flex', alignItems: 'center', padding: '8px 16px', cursor: 'pointer', borderRadius: '8px', fontFamily: "'Noto Sans', sans-serif", fontSize: '12px', fontWeight: 400, color: DS.white, lineHeight: '18px' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >{label}</div>
              ))}
            </div>,
            document.body
          );
        })()}

        {/* + pill — absolutely to the right, hover bridge via delayed hide */}
        {barHovered && (
          <div
            onMouseEnter={onEnter} onMouseLeave={onLeave}
            style={{ position: 'absolute', left: 'calc(100% + 4px)', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(102,97,107,0.25)', borderRadius: '40px', padding: '2px', cursor: 'pointer', width: '20px', height: '20px' }}
            onClick={addViewpoint}
            onMouseOver={() => setHoveredId('__add__')}
            onMouseOut={() => setHoveredId(h => h === '__add__' ? null : h)}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 3.33v9.34M3.33 8h9.34" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            {hoveredId === '__add__' && (
              <div style={{ position: 'absolute', top: 'calc(100% + 10px)', left: '50%', transform: 'translateX(-50%)', background: DS.surface, borderRadius: '16px', padding: '8px 12px', fontFamily: FONT, fontSize: '12px', fontWeight: 600, color: DS.white, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 10, boxShadow: '0 4px 8px rgba(16,24,40,0.1)' }}>
                New viewpoint
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════════════════════════════════════════ */
export default function App() {
  const [fbxModel, setFbxModel] = useState(() => ({ name: 'boot.fbx', dataUrl: new URL('./boot.fbx', window.location.href).href }));
  const [fbxKey, setFbxKey] = useState(0); // bumped on each new model load to remount PinSnapper
  const [modelLoaded, setModelLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [clickPoint, setClickPoint] = useState(null);
  const [tooltips, setTooltips] = useState([
    { id: 2, label: "Toe Box", surfaceX: 0.8, surfaceY: 0.85, surfaceZ: 0.85, x: 0.8, y: 0.85 + LEADER_LIFT, z: 0.85, hasCamera: true, author: 'S. Patel', sequenceNumber: 1, description: "Widen toe splay zone by 4mm at forefoot. Perforations approved — move to laser-cut pattern per v3 spec.", details: [{ key: "Status", value: "Approved w/ Changes" }, { key: "Priority", value: "Medium" }, { key: "Owner", value: "S. Patel" }], annotations: [] },
    { id: 3, label: "Medial Arch", surfaceX: 0.1, surfaceY: 0.60, surfaceZ: -0.7, x: 0.1, y: 0.60 + LEADER_LIFT, z: -0.7, hasCamera: true, author: 'J. Kim', sequenceNumber: 2, description: "Arch bridge too rigid — switch from nylon shank to TPU torsion plate.", details: [{ key: "Status", value: "Under Review" }, { key: "Priority", value: "High" }, { key: "Owner", value: "M. Chen" }], annotations: [] },
    { id: 4, label: "Lateral Panel", surfaceX: 0.2, surfaceY: 1.15, surfaceZ: 0.9, x: 0.2, y: 1.15 + LEADER_LIFT, z: 0.9, hasCamera: true, author: 'R. Tanaka', sequenceNumber: 3, description: "Hot-melt overlay placement shifted 2mm forward from proto. Align with eyelet row B.", details: [{ key: "Status", value: "Tooling Ready" }, { key: "Priority", value: "Low" }, { key: "Owner", value: "R. Tanaka" }], annotations: [] },
  ]);
  const [draggingId, setDraggingId] = useState(null);
  const [autoRotate, setAutoRotate] = useState(false);
  // v3: unified annotation mode state
  const [annotationMode, setAnnotationMode] = useState(false);
  const annotationModeRef = useRef(false);
  useEffect(() => { annotationModeRef.current = annotationMode; }, [annotationMode]);
  const [activeTool, setActiveTool] = useState('cursor'); // 'cursor' | 'pen' | 'pencil' | 'comment' | 'text' | 'emoji'
  const [pendingStrokeId, setPendingStrokeId] = useState(null); // stroke waiting for title/note
  const [penAnchors, setPenAnchors] = useState([]);
  // Derived modes — single source of truth
  const editMode = annotationMode && activeTool === 'comment';
  const redlineMode = annotationMode && activeTool === 'pencil';
  const penMode = annotationMode && activeTool === 'pen';
  const reviewMode = annotationMode; // reviewMode = annotationMode for legacy Canvas code
  const [redlineColor, setRedlineColor] = useState(UI.text);
  const [penColor, setPenColor] = useState(UI.text);     // pen colour — independent of pencil
  const [pencilColor, setPencilColor] = useState(UI.text); // pencil colour — independent of pen
  const [redlineWidth, setRedlineWidth] = useState(1.0);
  const [strokeOpacity, setStrokeOpacity] = useState(1); // 0..1, pen/pencil contextual opacity slider
  const [commentMode, setCommentMode] = useState('default'); // 'default' (bubble) | 'callout' (leader line) — Comment is the default tool
  const [textFont, setTextFont] = useState('Inter');
  const [textSize, setTextSize] = useState(12);
  const [selectedEmoji, setSelectedEmoji] = useState('😊');
  const [redlines, setRedlines] = useState([]);
  const [livePoints, setLivePoints] = useState([]);
  const [precisionMode, setPrecisionMode] = useState(false);
  const [undoStack, setUndoStack] = useState([]); // redo buffer: [{type, item}]
  const [actionHistory, setActionHistory] = useState([]); // [{type, id}] — add order across all annotation types
  const [modelPosition, setModelPosition] = useState([0, 0, 0]);
  const [showTransformPanel, setShowTransformPanel] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const orbitRef = useRef();
  const threeStateRef = useRef(null);
  // Shift modifier override: while held, right-drag pans (instead of rotating) and
  // wheel-zoom slows. shiftHeldRef mirrors it for live reads inside pointer handlers.
  const [shiftHeld, setShiftHeld] = useState(false);
  const shiftHeldRef = useRef(false);
  // Box-select: uuids of currently selected meshes (view mode) + live marquee rect.
  const [selectedUuids, setSelectedUuids] = useState([]);
  const [marquee, setMarquee] = useState(null);
  const { flyTo, flyToTarget } = useCameraFlyTo(orbitRef);

  // Camera tool — UI-only flag for the bottom-bar Camera/Section popover.
  // (No capture engine; selecting it just exits annotation mode.)
  const [cameraTool, setCameraTool] = useState(false);
  const [cameraVariant, setCameraVariant] = useState('camera'); // 'camera' | 'section'
  const [cameraSquare, setCameraSquare] = useState(false); // crop toggle → square capture region
  const [navTool, setNavTool] = useState('navigation'); // 'navigation' | 'direct' (Select group variant)
  // Remembers the last drawing variant so the Pen group's main button reselects it.
  const lastDrawToolRef = useRef('pen');

  // v4 navigation: bottom bar, viewpoint cube, mode bar
  const [activeMode, setActiveMode] = useState(DEFAULT_MODE);
  useEffect(() => { activeModeRef.current = activeMode; }, [activeMode]);
  const [presentationMode, setPresentationMode] = useState(false);
  const [presViewIndex, setPresViewIndex] = useState(0);
  const [presAutoPlay, setPresAutoPlay] = useState(false);
  const [atViewpoint, setAtViewpoint] = useState(false);
  const viewpointFlyRef = useRef(false); // true while flying to a viewpoint — suppresses onChange clearing
  const [viewpoints, setViewpoints] = useState(() =>
    PRESENTATION_VIEWS.map((vp, i) => ({
      ...vp, id: `preset-${i}`,
      name: ['Front 3/4', 'Side', 'Back', 'Top'][i] ?? `View ${i + 1}`,
    }))
  );
  const [pings, setPings] = useState([]);
  const [layersOpen, setLayersOpen] = useState(false);
  const [cubeProjection, setCubeProjection] = useState('persp'); // 'persp' | 'iso'
  const [verticalLocked, setVerticalLocked] = useState(false);
  const [cubePopup,   setCubePopup]   = useState({ open: false, centered: true, x: 0, y: 0 });
  const [cubeHover,   setCubeHover]   = useState(null);
  const [cubeV2Popup, setCubeV2Popup] = useState({ open: false, centered: true, x: 0, y: 0 });
  const [cubeV2Hover, setCubeV2Hover] = useState(null);
  const [cubeDocked,  setCubeDocked]  = useState(false);
  const cHeldRef    = useRef(false);
  const cClickedRef = useRef(false);
  const cursorRef = useRef({ x: 0, y: 0 });
  const gHeldRef = useRef(false);
  const gClickedRef = useRef(false);
  const activeModeRef = useRef(activeMode);
  const [panelOpen, setPanelOpen] = useState(false);
  const [scene, setScene] = useState(DEFAULT_SCENE);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeFlyId, setActiveFlyId] = useState(null);
  const [expandedPinId, setExpandedPinId] = useState(null);
  const [expandedCommentId, setExpandedCommentId] = useState(null);
  const [tooltipsHidden, setTooltipsHidden] = useState(false);
  const [currentUser, setCurrentUser] = useState('Designer');
  const [commentSort, setCommentSort] = useState('sequence'); // 'sequence' | 'alpha'
  const [seenPinIds, setSeenPinIds] = useState(() => {
    try {
      const raw = localStorage.getItem(SEEN_PINS_STORAGE_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.map((x) => String(x)) : [];
    } catch {
      return [];
    }
  });
  const [strokeCounter, setStrokeCounter] = useState(1);
  const [surfaceOffset, setSurfaceOffset] = useState(0.05);
  const [selectedRedlineId, setSelectedRedlineId] = useState(null);
  const [activeCommentId, setActiveCommentId] = useState(null);
  const [redlinePopupPos, setRedlinePopupPos] = useState({ x: 300, y: 200 });
  const [renderAbove, setRenderAbove] = useState(false);
  const [emojiAnnotations, setEmojiAnnotations] = useState([]);
  const [textAnnotations, setTextAnnotations] = useState([]);

  /* ── Centralized tool selection (single state path) ──
     Both the bottom toolbar and the keyboard shortcuts call these, so a click
     and its hotkey stay perfectly in sync. */
  const selectNavigation = useCallback(() => {
    setNavTool('navigation');
    setCameraTool(false);
    setActiveMode(DEFAULT_MODE);
    setAnnotationMode(false);
    setActiveTool('cursor');
    setClickPoint(null);
  }, []);
  const selectDirectSelect = useCallback(() => {
    setNavTool('direct');
    setCameraTool(false);
    setActiveMode(DEFAULT_MODE);
    setAnnotationMode(false);
    setActiveTool('cursor');
    setClickPoint(null);
  }, []);
  const selectLaser = useCallback(() => {
    setCameraTool(false);
    setAnnotationMode(false);
    setActiveTool('cursor');
    setClickPoint(null);
    setActiveMode('laser');
  }, []);
  const enterDrawing = useCallback((tool) => {
    lastDrawToolRef.current = tool;
    setCameraTool(false);
    setActiveMode(DEFAULT_MODE);
    setAnnotationMode(true);
    setActiveTool(tool);
    setAutoRotate(false);
    setActiveFlyId(null);
    setExpandedPinId(null);
  }, []);
  const selectPen = useCallback(() => enterDrawing('pen'), [enterDrawing]);
  const selectPencil = useCallback(() => enterDrawing('pencil'), [enterDrawing]);
  const selectDrawing = useCallback(() => enterDrawing(lastDrawToolRef.current || 'pencil'), [enterDrawing]);
  const selectComment = useCallback((mode) => {
    setCameraTool(false);
    if (mode) setCommentMode(mode);
    setActiveMode('comments');
    setAnnotationMode(true);
    setActiveTool('comment');
    setAutoRotate(false);
    setActiveFlyId(null);
    setExpandedPinId(null);
    setPanelOpen(true);
  }, []);
  const selectCamera = useCallback(() => {
    setCameraVariant('camera');
    setCameraTool(true);
    setAnnotationMode(false);
    setActiveTool('cursor');
    setActiveMode(DEFAULT_MODE);
    setAutoRotate(false);
    setClickPoint(null);
  }, []);
  const selectSection = useCallback(() => {
    // TODO: section tool (cross-section / clipping). UI flag only — no 3D logic.
    setCameraVariant('section');
    setCameraTool(true);
    setAnnotationMode(false);
    setActiveTool('cursor');
    setActiveMode(DEFAULT_MODE);
    setAutoRotate(false);
    setClickPoint(null);
  }, []);

  const selectedEmojiRef = useRef(selectedEmoji);
  useEffect(() => { selectedEmojiRef.current = selectedEmoji; }, [selectedEmoji]);

  const handlePlaceEmoji = useCallback((pos) => {
    const id = Date.now() + Math.random();
    setEmojiAnnotations(prev => [...prev, { id, emoji: selectedEmojiRef.current, ...pos }]);
    setActionHistory(h => [...h, { type: 'emoji', id }]);
    setUndoStack([]);
  }, []);

  const handlePlaceText = useCallback(({ value, x, y, z, font, size, color }) => {
    const id = Date.now() + Math.random();
    setTextAnnotations(prev => [...prev, { id, value, x, y, z, font, size, color }]);
    setActionHistory(h => [...h, { type: 'text', id }]);
    setUndoStack([]);
  }, []);

  const handleMoveTextAnnotation = useCallback((id, pos) => {
    setTextAnnotations(prev => prev.map(a => a.id === id ? { ...a, ...pos } : a));
  }, []);

  const markPinSeen = useCallback((id) => {
    if (id == null) return;
    const key = String(id);
    setSeenPinIds((prev) => (prev.includes(key) ? prev : [...prev, key]));
  }, []);
  const isPinSeenFn = useCallback((id) => seenPinIds.includes(String(id)), [seenPinIds]);

  useEffect(() => {
    try {
      localStorage.setItem(SEEN_PINS_STORAGE_KEY, JSON.stringify(seenPinIds));
    } catch { /* ignore */ }
  }, [seenPinIds]);

  // ESC — exit annotation mode / close panels
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (pendingStrokeId) { /* let PostSketchPanel handle its own discard */ return; }
        if (penAnchors.length > 0) { setPenAnchors([]); return; }
        if (annotationMode) {
          if (activeTool !== 'cursor') {
            // ESC from any drawing tool → return to Navigation (cursor) within annotation mode
            setActiveTool('cursor');
            return;
          }
          // Already on cursor tool → exit annotation mode entirely
          setAnnotationMode(false);
          setActiveTool('cursor');
          setAutoRotate(true);
          setClickPoint(null);
          setDraggingId(null);
          setPanelOpen(false);
          setExpandedPinId(null);
          setSettingsOpen(false);
          setContextMenu(null);
          setActiveFlyId(null);
          return;
        }
        if (expandedPinId) { setExpandedPinId(null); return; }
        if (draggingId) { setDraggingId(null); return; }
        if (clickPoint) { setClickPoint(null); return; }
        if (showTransformPanel) { setShowTransformPanel(false); return; }
        if (settingsOpen) { setSettingsOpen(false); return; }
        if (panelOpen) { setPanelOpen(false); return; }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [expandedPinId, draggingId, clickPoint, showTransformPanel, annotationMode, activeTool, pendingStrokeId, penAnchors, settingsOpen, panelOpen]);

  // Tool shortcuts + annotation visibility (unified; no per-tool listeners)
  // Managed below in the combined keyboard handler useEffect

  // v4 — captured polar angle when vertical-lock is activated.
  const [lockedPolar, setLockedPolar] = useState(Math.PI / 3);

  // Apply polar lock to OrbitControls imperatively.
  useEffect(() => {
    const controls = orbitRef.current;
    if (!controls) return;
    if (verticalLocked) {
      controls.minPolarAngle = Math.max(0.001, lockedPolar - 0.001);
      controls.maxPolarAngle = Math.min(Math.PI - 0.001, lockedPolar + 0.001);
    } else {
      controls.minPolarAngle = 0;
      controls.maxPolarAngle = Math.PI;
    }
    controls.update?.();
  }, [verticalLocked, lockedPolar]);

  const toggleVerticalLock = useCallback(() => {
    setVerticalLocked(v => {
      if (!v) {
        const controls = orbitRef.current;
        if (controls) {
          const offset = controls.object.position.clone().sub(controls.target);
          const polar = Math.acos(Math.max(-1, Math.min(1, offset.y / offset.length())));
          setLockedPolar(polar);
        }
      }
      return !v;
    });
  }, []);

  // v4 — Find My Sketch: fly camera to fit the loaded shoe model in view.
  const findMySketch = useCallback(() => {
    const meshes = shoeModelMeshes.current || [];
    const controls = orbitRef.current;
    if (!controls) return;
    const cam = controls.object;
    const box = new THREE.Box3();
    if (meshes.length === 0) {
      flyTo(DEFAULT_CAMERA.position, DEFAULT_CAMERA.target, 700);
      return;
    }
    meshes.forEach(m => box.expandByObject(m));
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = (cam.fov || 47) * Math.PI / 180;
    const distance = (maxDim / (2 * Math.tan(fov / 2))) * 1.45;
    const currentDir = cam.position.clone().sub(controls.target).normalize();
    if (currentDir.lengthSq() < 0.0001) currentDir.set(0.7, 0.5, 0.7).normalize();
    const endPos = center.clone().add(currentDir.multiplyScalar(distance));
    flyTo(endPos.toArray(), center.toArray(), 800);
  }, [flyTo]);

  // v4 — fly camera to a viewpoint by id from VIEWPOINTS table.
  // Top/bottom views need an explicit up-vector swap to avoid gimbal lock when
  // the look direction becomes parallel to the default (0,1,0) up.
  const flyToViewpoint = useCallback((vpId) => {
    const vp = VIEWPOINTS.find(v => v.id === vpId);
    if (!vp) return;
    setAutoRotate(false);
    const controls = orbitRef.current;
    if (controls && vp.up) {
      const cam = controls.object;
      cam.up.set(vp.up[0], vp.up[1], vp.up[2]);
      controls.update();
    }
    flyTo(vp.pos, vp.tgt, 700);
  }, [flyTo]);

  // Presentation mode: fly camera when view index changes
  useEffect(() => {
    if (!presentationMode) return;
    const vp = viewpoints[presViewIndex];
    if (!vp || !orbitRef.current) return;
    const controls = orbitRef.current;
    if (vp.up) { controls.object.up.set(...vp.up); controls.update(); }
    viewpointFlyRef.current = true;
    setAtViewpoint(true);
    flyTo(vp.pos, vp.tgt, 900, () => { viewpointFlyRef.current = false; });
  }, [presentationMode, presViewIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Presentation mode: auto-advance timer — only when presAutoPlay is on
  useEffect(() => {
    if (!presentationMode || !presAutoPlay) return;
    const timer = setTimeout(() => {
      setPresViewIndex(i => (i + 1) % viewpoints.length);
    }, PRES_INTERVAL);
    return () => clearTimeout(timer);
  }, [presentationMode, presAutoPlay, presViewIndex]);

  // v4 — track cursor for spawn-at-cursor menus
  useEffect(() => {
    const onMove = (e) => { cursorRef.current.x = e.clientX; cursorRef.current.y = e.clientY; };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  // ModeBar hover is driven purely by onPointerEnter on each ToolIcon (no delta-stepping).

  // v4 — G hold-spawn, number keys 1-6, Tab presentation mode
  useEffect(() => {
    const isTypingTarget = () => {
      const el = document.activeElement;
      const tag = el?.tagName?.toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' || el?.isContentEditable;
    };

    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget()) return;

      // Tab → presentation mode toggle
      if (e.code === 'Tab' && !e.repeat) {
        e.preventDefault();
        const entering = !presentationMode;
        setPresentationMode(v => {
          if (!v) {
            // entering presentation mode — close any open popups
            setCubePopup(p => ({ ...p, open: false }));
            setCubeV2Popup(p => ({ ...p, open: false }));
            setCubeHover(null);
            setCubeV2Hover(null);
            gHeldRef.current = false;
            cHeldRef.current = false;
            gClickedRef.current = false;
            cClickedRef.current = false;
          }
          return !v;
        });
        if (entering) { setPresViewIndex(0); setPresAutoPlay(false); }
        else { setPresAutoPlay(false); }
        return;
      }

      // Arrow keys / Enter in presentation mode
      if (presentationMode) {
        if (e.code === 'ArrowRight') {
          e.preventDefault();
          setPresAutoPlay(false);
          setPresViewIndex(i => (i + 1) % viewpoints.length);
          return;
        }
        if (e.code === 'ArrowLeft') {
          e.preventDefault();
          setPresAutoPlay(false);
          setPresViewIndex(i => (i - 1 + viewpoints.length) % viewpoints.length);
          return;
        }
        if (e.code === 'Enter') {
          e.preventDefault();
          e.stopImmediatePropagation();
          setPresAutoPlay(v => {
            if (!v) {
              // Starting playback — fly to next view immediately so it feels instant
              setPresViewIndex(i => (i + 1) % viewpoints.length);
            }
            return !v;
          });
          return;
        }
        return;
      }

      // G hold-spawn ViewpointCubeV2 (purple cube) — only when not docked
      if (e.code === 'KeyG' && !e.repeat && !cubeDocked) {
        e.preventDefault();
        gHeldRef.current    = true;
        gClickedRef.current = false;
        setCubePopup(p => ({ ...p, open: false }));
        setCubeHover(null);
        setCubeV2Hover(null);
        setCubeV2Popup({ open: true, centered: false, x: cursorRef.current.x, y: cursorRef.current.y });
        return;
      }


      // Shift + Arrow keys → step through viewpoints in normal mode
      if (e.shiftKey && !e.repeat && (e.code === 'ArrowRight' || e.code === 'ArrowLeft')) {
        e.preventDefault();
        setPresViewIndex(i => {
          const next = e.code === 'ArrowRight'
            ? (i + 1) % viewpoints.length
            : (i - 1 + viewpoints.length) % viewpoints.length;
          const vp = viewpoints[next];
          if (vp) {
            viewpointFlyRef.current = true;
            setAtViewpoint(true);
            if (vp.up && orbitRef.current) { orbitRef.current.object.up.set(...vp.up); orbitRef.current.update(); }
            flyTo(vp.pos, vp.tgt, 900, () => { viewpointFlyRef.current = false; });
          }
          return next;
        });
        return;
      }

      // Number keys 1-6 → fly to viewpoint
      if (!e.shiftKey && !e.repeat) {
        const vp = VIEWPOINTS.find(v => v.key === e.key);
        if (vp) { e.preventDefault(); flyToViewpoint(vp.id); return; }
      }
    };

    const onKeyUp = (e) => {
      if (e.code === 'KeyG' && gHeldRef.current) {
        gHeldRef.current    = false;
        gClickedRef.current = false;
        setCubeV2Hover(null);
        setCubeV2Popup(p => ({ ...p, open: false }));
      }
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [flyToViewpoint, presentationMode, viewpoints, flyTo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Unified shortcut map (spec-compliant)
  useEffect(() => {
    const activateTool = (tool) => {
      // Only switch annotation tools when already in annotation/comments mode.
      // Keyboard shortcuts must not bypass the Comments button in the mode bar.
      if (!annotationModeRef.current) return;
      setActiveTool(tool);
      setAutoRotate(false);
      setActiveFlyId(null);
      setExpandedPinId(null);
    };
    const onKey = (e) => {
      if (e.repeat) return;
      const el = document.activeElement;
      const tag = el?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (el?.isContentEditable) return;

      // Cmd/Ctrl shortcuts
      if (e.metaKey || e.ctrlKey) {
        // Ctrl+Shift+E → Find My Sketch
        if (e.code === 'KeyE' && e.shiftKey) { e.preventDefault(); findMySketch(); return; }
        // Cmd+A → Select all objects
        if (e.code === 'KeyA' && !e.shiftKey) { e.preventDefault(); /* placeholder */ return; }
        return; // don't process other cmd/ctrl keys here
      }

      if (e.altKey) return;

      // Enter — toggle turntable (not in presentation mode)
      if (e.code === 'Enter' && !e.shiftKey && !presentationMode) { e.preventDefault(); setAutoRotate(v => !v); return; }
      // F → frame model; Home → reset camera
      if (e.code === 'KeyF' && !e.shiftKey) { e.preventDefault(); findMySketch(); return; }
      if (e.code === 'Home' && !e.shiftKey) { e.preventDefault(); flyTo(DEFAULT_CAMERA.position, DEFAULT_CAMERA.target, 800); return; }

      // ── Shift tool-selection shortcuts (redesign bindings) ──
      if (e.shiftKey) {
        if (e.code === 'KeyV') { e.preventDefault(); selectDirectSelect(); return; } // ⇧V → Direct select
        if (e.code === 'KeyP') { e.preventDefault(); selectPen(); return; }       // ⇧P → Pen
        if (e.code === 'KeyC') { e.preventDefault(); selectComment('callout'); return; } // ⇧C → Callout
        if (e.code === 'KeyS') { e.preventDefault(); selectSection(); return; }   // ⇧S → Section tool
        if (e.code === 'KeyT') { e.preventDefault(); setRenderAbove(v => !v); return; }
        if (e.code === 'Digit1') { e.preventDefault(); flyTo(DEFAULT_CAMERA.position, DEFAULT_CAMERA.target, 800); return; }
        return;
      }

      // ── Non-shift tool-selection shortcuts (redesign bindings) ──
      if (e.code === 'KeyV') { e.preventDefault(); selectNavigation(); return; }  // V → Navigation
      if (e.code === 'KeyL') { e.preventDefault(); selectLaser(); return; }       // L → Laser pointer
      if (e.code === 'KeyP') { e.preventDefault(); selectPencil(); return; }      // P → Pencil
      if (e.code === 'KeyC') { e.preventDefault(); selectComment('default'); return; } // C → Comment
      if (e.code === 'KeyS') { e.preventDefault(); selectCamera(); return; }      // S → Camera
      // T (text), E (emoji) kept as-is — these tools aren't in the new bottom nav.
      if (e.code === 'KeyT') { e.preventDefault(); activateTool('text'); return; }
      if (e.code === 'KeyE') { e.preventDefault(); activateTool('emoji'); return; }
      // Delete / Backspace → delete selected annotation
      if (e.code === 'Delete' || e.code === 'Backspace') {
        if (selectedRedlineId) {
          setRedlines(prev => prev.filter(r => r.id !== selectedRedlineId));
          setSelectedRedlineId(null);
          return;
        }
        if (draggingId) {
          setTooltips(prev => prev.filter(t => t.id !== draggingId));
          setDraggingId(null);
          return;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flyTo, presentationMode, findMySketch, selectNavigation, selectDirectSelect, selectLaser, selectPen, selectPencil, selectComment, selectCamera, selectSection, selectedRedlineId, draggingId]);

  // Shift modifier — the single navigation override. While held, right-drag PANS
  // (instead of rotating) and the scroll-wheel zoom slows down. Tracked in a ref so
  // pointer handlers and cursor logic can read it live. Applies in every mode.
  useEffect(() => {
    // Pan modifier is active while EITHER Shift OR Space is held.
    let shiftDown = false, spaceDown = false;
    const applyPanMode = () => {
      const held = shiftDown || spaceDown;
      shiftHeldRef.current = held;
      PAN_MOD.active = held;       // read by the in-scene cursor handlers
      setShiftHeld(held);          // drives OrbitControls mouseButtons/zoomSpeed props
      const c = orbitRef.current;
      if (c) {
        c.mouseButtons.RIGHT = held ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
        c.zoomSpeed = held ? 0.45 : 1.0;  // modifier = zoom more slowly
      }
      // Immediate cursor feedback on key press (don't wait for a pointermove).
      const cvs = threeStateRef.current?.gl?.domElement;
      if (cvs) cvs.style.cursor = held ? CURSOR_ORBIT_PAN : '';
    };
    const isTyping = () => {
      const el = document.activeElement; const tag = el?.tagName?.toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' || el?.isContentEditable;
    };
    const onKey = (e) => {
      if (e.key === 'Shift') { shiftDown = (e.type === 'keydown'); applyPanMode(); return; }
      if (e.code === 'Space' && !isTyping()) {
        if (e.type === 'keydown') e.preventDefault(); // stop the page from scrolling
        spaceDown = (e.type === 'keydown');
        applyPanMode();
      }
    };
    const onBlur = () => { shiftDown = false; spaceDown = false; applyPanMode(); }; // safety: lost focus mid-hold
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  // Middle-click → context menu. This is the single, robust trigger: `auxclick` is the
  // canonical non-primary-click event (fires after a clean press+release, immune to the
  // pointerdown capture/ordering quirks that made per-overlay handlers unreliable). We
  // also preventDefault the middle `mousedown`/`pointerdown` to kill the browser's
  // native middle-click autoscroll, which otherwise hijacks the gesture.
  useEffect(() => {
    // Kill autoscroll on the middle `mousedown` ONLY — NOT on pointerdown, because
    // preventDefault on pointerdown also cancels the compatibility mouse/auxclick events
    // we rely on to open the menu.
    const killAutoscroll = (e) => { if (e.button === 1) e.preventDefault(); };
    // The 3D viewport is the gl canvas or a full-screen (fixed, viewport-sized) overlay.
    const overThreeArea = (t) => {
      if (!t) return false;
      if (t.tagName === 'CANVAS') return true;
      const cs = getComputedStyle(t);
      if (cs.position !== 'fixed') return false;
      const r = t.getBoundingClientRect();
      return r.width >= window.innerWidth * 0.9 && r.height >= window.innerHeight * 0.9;
    };
    const onAux = (e) => {
      if (e.button !== 1) return;
      e.preventDefault();
      if (!overThreeArea(e.target)) return; // ignore middle-clicks on UI panels
      openContextMenuFromOverlay(threeStateRef.current, e.clientX, e.clientY, handleContextMenuOpen);
    };
    window.addEventListener('mousedown', killAutoscroll, { capture: true });
    window.addEventListener('auxclick', onAux, { capture: true });
    return () => {
      window.removeEventListener('mousedown', killAutoscroll, { capture: true });
      window.removeEventListener('auxclick', onAux, { capture: true });
    };
    // handleContextMenuOpen is a stable useCallback; referencing it in the callback
    // (which runs post-mount) is safe. Keep deps empty to avoid a render-time TDZ.
  }, []);

  // Shift + scroll → zoom (slower). OrbitControls only dollies on deltaY, but macOS
  // turns Shift+wheel into horizontal deltaX — so we handle it manually here, reading
  // whichever axis dominates and dollying gently. Capture phase so OrbitControls (and
  // the overlays' wheel-forwarders) don't also act on it.
  useEffect(() => {
    const onWheel = (e) => {
      if (!e.shiftKey) return; // normal zoom is left to OrbitControls (keeps its damping)
      const c = orbitRef.current;
      if (!c) return;
      e.preventDefault();
      e.stopPropagation();
      const amount = Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      const cam = c.object;
      const offset = new THREE.Vector3().subVectors(cam.position, c.target);
      let dist = offset.length();
      const scale = Math.pow(0.95, -amount / 100 * 0.5); // gentle, slower than default
      dist = Math.min(c.maxDistance, Math.max(c.minDistance, dist * scale));
      offset.setLength(dist);
      cam.position.copy(c.target).add(offset);
      c.update();
    };
    window.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => window.removeEventListener('wheel', onWheel, { capture: true });
  }, []);

  const handleAddTooltip = (t) => {
    const cam = threeStateRef.current?.camera;
    const orb = orbitRef.current;
    const cameraView = (cam && orb) ? {
      position: cam.position.toArray(),
      target: orb.target.toArray(),
    } : null;
    const enriched = {
      ...t,
      author: currentUser,
      sequenceNumber: tooltips.length + 1,
      cameraView,
      hasCamera: !!(cameraView || t.hasCamera),
      commentMode,           // 'default' (bubble) | 'callout' (leader) — stamped at placement
      color: redlineColor,   // selected swatch color applies to bubble / line / dot
    };
    setTooltips((prev) => [...prev, enriched]);
    setClickPoint(null);
    setDraggingId(t.id);
    setPanelOpen(true);
    markPinSeen(enriched.id);
    setActiveCommentId(enriched.id);
  };
  const handleRemoveTooltip = (id) => {
    setTooltips((prev) => prev.filter((t) => t.id !== id));
    setDraggingId((prev) => (prev === id ? null : prev));
    setRedlines(prev => prev.map(r => r.parentCommentId === id ? { ...r, parentCommentId: null } : r));
  };
  const handleSelectTooltip = (id) => {
    const next = draggingId === id ? null : id;
    setDraggingId(next);
    setClickPoint(null);
    if (next !== null) {
      setPanelOpen(true);
      markPinSeen(next);
    }
  };
  const handleMoveTooltip = (id, pos) => { setTooltips((prev) => prev.map((t) => t.id === id ? { ...t, ...pos } : t)); };
  const handleRenameTooltip = (id, label) => { setTooltips((prev) => prev.map((t) => t.id === id ? { ...t, label } : t)); };
  const handleResetCamera = () => { flyTo(DEFAULT_CAMERA.position, DEFAULT_CAMERA.target, 800); };
  const handleSetCamera = (id) => { setTooltips((prev) => prev.map((t) => t.id === id ? { ...t, hasCamera: true } : t)); };
  const handleClearCamera = (id) => { setTooltips((prev) => prev.map((t) => t.id === id ? { ...t, hasCamera: false } : t)); };
  const handleUpdateTooltip = (id, patch) => { setTooltips(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t)); };

  const handleFlyTo = useCallback((tooltip) => {
    if (!tooltip.hasCamera && !tooltip.cameraView) return;
    if (activeFlyId === tooltip.id) {
      setActiveFlyId(null);
      flyTo(DEFAULT_CAMERA.position, DEFAULT_CAMERA.target, 1000);
    } else {
      setActiveFlyId(tooltip.id);
      setAutoRotate(false);
      if (tooltip.cameraView) {
        flyTo(tooltip.cameraView.position, tooltip.cameraView.target, 1000);
      } else {
        flyToTarget([tooltip.x, tooltip.y, tooltip.z], 2.0, 1000);
      }
    }
  }, [activeFlyId, flyTo, flyToTarget]);

  const handleStrokeCommitted = useCallback((strokeId) => {
    setUndoStack([]);
    setActionHistory(h => strokeId ? [...h, { type: 'redline', id: strokeId }] : h);
    setStrokeCounter(n => n + 1);
  }, []);

  const handlePenPathCommitted = useCallback((stroke) => {
    setRedlines(prev => [...prev, stroke]);
    setUndoStack([]);
    setActionHistory(h => [...h, { type: 'redline', id: stroke.id }]);
    setStrokeCounter(n => n + 1);
    setPenAnchors([]);
  }, []);

  const handlePostSketchSave = useCallback(({ title, note } = {}) => {
    if (!pendingStrokeId) return;
    const trimmedNote = note?.trim() ?? '';
    const firstComment = trimmedNote
      ? [{ id: Date.now() + Math.random(), author: currentUser || 'You', text: trimmedNote, created: Date.now() }]
      : [];
    setRedlines(prev => prev.map(r => r.id === pendingStrokeId
      ? { ...r, name: title || r.name, attachedNote: { title, body: trimmedNote }, comments: firstComment, author: currentUser }
      : r
    ));
    // Auto-open the thread popup so the user sees the saved note immediately
    if (trimmedNote) {
      setRedlinePopupPos({ x: window.innerWidth / 2 - 150, y: 120 });
      setSelectedRedlineId(pendingStrokeId);
    }
    setPendingStrokeId(null);
  }, [pendingStrokeId, currentUser]);

  const handlePostSketchDiscard = useCallback(() => {
    if (!pendingStrokeId) return;
    setRedlines(prev => prev.filter(r => r.id !== pendingStrokeId));
    setPendingStrokeId(null);
  }, [pendingStrokeId]);

  const handleUndoRedline = useCallback(() => {
    setActionHistory(hist => {
      if (hist.length === 0) return hist;
      const last = hist[hist.length - 1];
      if (last.type === 'redline') {
        setRedlines(prev => {
          const item = prev.find(r => r.id === last.id);
          if (!item) return prev;
          setUndoStack(s => [...s, { type: 'redline', item }]);
          return prev.filter(r => r.id !== last.id);
        });
      } else if (last.type === 'emoji') {
        setEmojiAnnotations(prev => {
          const item = prev.find(e => e.id === last.id);
          if (!item) return prev;
          setUndoStack(s => [...s, { type: 'emoji', item }]);
          return prev.filter(e => e.id !== last.id);
        });
      } else if (last.type === 'text') {
        setTextAnnotations(prev => {
          const item = prev.find(t => t.id === last.id);
          if (!item) return prev;
          setUndoStack(s => [...s, { type: 'text', item }]);
          return prev.filter(t => t.id !== last.id);
        });
      }
      return hist.slice(0, -1);
    });
  }, []);

  const handleRedoRedline = useCallback(() => {
    setUndoStack(stack => {
      if (stack.length === 0) return stack;
      const { type, item } = stack[stack.length - 1];
      if (type === 'redline') {
        setRedlines(prev => [...prev, item]);
        setActionHistory(h => [...h, { type: 'redline', id: item.id }]);
      } else if (type === 'emoji') {
        setEmojiAnnotations(prev => [...prev, item]);
        setActionHistory(h => [...h, { type: 'emoji', id: item.id }]);
      } else if (type === 'text') {
        setTextAnnotations(prev => [...prev, item]);
        setActionHistory(h => [...h, { type: 'text', id: item.id }]);
      }
      return stack.slice(0, -1);
    });
  }, []);

  const handleClearRedlines = () => { setUndoStack([]); setActionHistory([]); setRedlines([]); };

  // Cmd+Z / Ctrl+Z → undo; Cmd+Shift+Z / Ctrl+Shift+Z → redo (must be after handleUndoRedline/handleRedoRedline)
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const el = document.activeElement;
      const tag = el?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.code === 'KeyZ' && !e.shiftKey) { e.preventDefault(); handleUndoRedline(); }
      if (e.code === 'KeyZ' && e.shiftKey) { e.preventDefault(); handleRedoRedline(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleUndoRedline, handleRedoRedline]);

  const handleRedlineStrokeClick = useCallback(({ stroke, centroid3D, screenPos }) => {
    setSelectedRedlineId(stroke.id);
    setRedlinePopupPos(screenPos);
    setAutoRotate(false);
    if (orbitRef.current) {
      const cam = orbitRef.current.object;
      const centroid = new THREE.Vector3(centroid3D.x, centroid3D.y, centroid3D.z);
      const dir = centroid.clone().sub(cam.position).normalize();
      const dist = cam.position.distanceTo(centroid);
      const targetDist = Math.max(0.8, dist * 0.35);
      const np = centroid.clone().sub(dir.clone().multiplyScalar(targetDist));
      flyTo([np.x, np.y, np.z], [centroid3D.x, centroid3D.y, centroid3D.z], 600);
    }
  }, [flyTo]);

  const handleRedlineStrokeUpdate = useCallback((id, updates) => {
    setRedlines(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  }, []);

  // Translate all points3D of a stroke by a world-space delta (local == world delta since modelPosition is a fixed offset)
  const handleTranslateStroke = useCallback((id, dx, dy, dz) => {
    setRedlines(prev => prev.map(r => r.id === id
      ? { ...r, points3D: r.points3D.map(pt => ({ x: pt.x + dx, y: pt.y + dy, z: pt.z + dz })) }
      : r
    ));
  }, []);

  const handleOpenStrokeEditor = useCallback((stroke) => {
    setSelectedRedlineId(stroke.id);
    setRedlinePopupPos({ x: 300, y: 200 }); // default; toolbar is on left side
  }, []);

  const handleContextMenuOpen = useCallback((cx, cy, onSurface = false, hitPoint = null, hitObjectName = null) => { setContextMenu({ x: cx, y: cy, onSurface, hitPoint, hitObjectName }); }, []);
  const handleContextMenuTransform = () => { setContextMenu(null); setShowTransformPanel(true); };

  const [logoMenuOpen, setLogoMenuOpen] = useState(false);

  const handleNewFile = useCallback(() => {
    setFbxModel(null);
    setTooltips([]);
    setRedlines([]);
    setUndoStack([]);
    setActionHistory([]);
    setClickPoint(null);
    setDraggingId(null);
    setAnnotationMode(false);
    setActiveTool('comment');
    setPendingStrokeId(null);
    setPenAnchors([]);
    setModelLoaded(false);
    setLogoMenuOpen(false);
    setSeenPinIds([]);
    try { localStorage.removeItem(SEEN_PINS_STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  const handleImportFile = useCallback(() => {
    setLogoMenuOpen(false);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.fbx';
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setModelLoaded(false);
      const reader = new FileReader();
      reader.onload = (ev) => setFbxModel({ name: file.name, dataUrl: ev.target.result });
      reader.readAsDataURL(file);
    };
    input.click();
  }, []);

  const handleNavCubeClick = useCallback((face) => {
    setAutoRotate(false);
    const t = DEFAULT_CAMERA.target; // [0, 1.0, 0]
    const d = 4.5;
    const views = {
      front:  { pos: [0, t[1], d],    tgt: t },
      back:   { pos: [0, t[1], -d],   tgt: t },
      right:  { pos: [d, t[1], 0],    tgt: t },
      left:   { pos: [-d, t[1], 0],   tgt: t },
      top:    { pos: [0.01, t[1] + d, 0.01], tgt: [0, 0.5, 0] },
      bottom: { pos: [0.01, t[1] - d, 0.01], tgt: [0, 0.5, 0] },
    };
    const v = views[face];
    if (v) flyTo(v.pos, v.tgt, 700);
  }, [flyTo]);

  const handleLaserDblClick = useCallback((e) => {
    if (activeMode !== 'laser') return;
    const id = Date.now() + Math.random();
    setPings(p => [...p, { id, x: e.clientX, y: e.clientY }]);
  }, [activeMode]);

  return (
    <div
      style={{ width: '100vw', height: '100vh', background: UI.bg, cursor: 'default' }}
      onDoubleClick={handleLaserDblClick}
    >
      <style>{`
        @keyframes pingRing1 {
          0%   { transform: translate(-50%,-50%) scale(0.3); opacity: 0.85; }
          100% { transform: translate(-50%,-50%) scale(4.5); opacity: 0; }
        }
        @keyframes pingRing2 {
          0%   { transform: translate(-50%,-50%) scale(0.3); opacity: 0.50; }
          100% { transform: translate(-50%,-50%) scale(6);   opacity: 0; }
        }
        @keyframes pingDot {
          0%   { transform: translate(-50%,-50%) scale(0); opacity: 1; }
          18%  { transform: translate(-50%,-50%) scale(1); opacity: 1; }
          100% { transform: translate(-50%,-50%) scale(1); opacity: 0; }
        }
      `}</style>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&family=Space+Grotesk:wght@400;500;600&display=swap" rel="stylesheet" />

      <ShowcaseUI
        presentationMode={presentationMode}
        layersOpen={layersOpen}
        setLayersOpen={setLayersOpen}
        clickPoint={clickPoint} onClearClick={() => setClickPoint(null)} onAddTooltip={handleAddTooltip}
        tooltips={tooltips} onRemoveTooltip={handleRemoveTooltip} onClearComments={() => setTooltips([])}
        selectedId={draggingId} onSelect={handleSelectTooltip} onMove={handleMoveTooltip}
        onRename={handleRenameTooltip} onSetCamera={handleSetCamera} onClearCamera={handleClearCamera}
        onUpdateTooltip={handleUpdateTooltip} onResetCamera={handleResetCamera}
        onToggleAutoRotate={() => setAutoRotate((v) => !v)} autoRotate={autoRotate}
        panelOpen={panelOpen} setPanelOpen={setPanelOpen}
        tooltipsHidden={tooltipsHidden} onToggleTooltips={() => setTooltipsHidden(v => !v)}
        scene={scene} onUpdateScene={setScene} settingsOpen={settingsOpen} setSettingsOpen={setSettingsOpen}
        onFlyTo={handleFlyTo}
        currentUser={currentUser} setCurrentUser={setCurrentUser}
        isPinSeen={isPinSeenFn} onPinViewed={markPinSeen}
        annotationMode={annotationMode}
        onToggleAnnotation={() => {
          setAnnotationMode(v => {
            if (!v) { setActiveTool('cursor'); setAutoRotate(false); setActiveFlyId(null); setExpandedPinId(null); }
            else { setAutoRotate(true); setClickPoint(null); }
            return !v;
          });
        }}
        activeTool={activeTool} setActiveTool={setActiveTool}
        logoMenuOpen={logoMenuOpen} setLogoMenuOpen={setLogoMenuOpen}
        onNewFile={handleNewFile} onImportFile={handleImportFile}
        onNavCubeClick={handleNavCubeClick}
        fbxFileName={fbxModel?.name || ''}
        threeStateRef={threeStateRef} orbitRef={orbitRef}
        redlineColor={redlineColor} setRedlineColor={setRedlineColor}
        penColor={penColor} setPenColor={setPenColor}
        pencilColor={pencilColor} setPencilColor={setPencilColor}
        redlineWidth={redlineWidth} setRedlineWidth={setRedlineWidth}
        redlines={redlines} setRedlines={setRedlines}
        undoStack={undoStack}
        onUndoRedline={handleUndoRedline} onRedoRedline={handleRedoRedline} onClearRedlines={handleClearRedlines}
        renderAbove={renderAbove} onToggleRenderAbove={() => setRenderAbove(v => !v)}
        pendingStrokeId={pendingStrokeId}
        onPostSketchSave={handlePostSketchSave}
        onPostSketchDiscard={handlePostSketchDiscard}
        expandedCommentId={expandedCommentId}
        setExpandedCommentId={setExpandedCommentId}
        onOpenStrokeThread={handleOpenStrokeEditor}
        strokeOpacity={strokeOpacity} setStrokeOpacity={setStrokeOpacity}
        commentMode={commentMode} setCommentMode={setCommentMode}
        textFont={textFont} setTextFont={setTextFont}
        textSize={textSize} setTextSize={setTextSize}
        selectedEmoji={selectedEmoji} setSelectedEmoji={setSelectedEmoji}
        cubeDocked={cubeDocked} setCubeDocked={setCubeDocked}
      />


      {/* bottom nav bar removed — G/S still work via keyboard shortcuts */}

      <ViewpointCube
        open={cubePopup.open && !presentationMode}
        centered={cubePopup.centered}
        x={cubePopup.x}
        y={cubePopup.y}
        hovered={cubeHover}
        onHover={setCubeHover}
        onCommit={(faceId) => {
          const vp = VIEWPOINTS.find(v => v.cubeFace === faceId);
          if (vp) flyToViewpoint(vp.id);
          setCubePopup(p => ({ ...p, open: false }));
          setCubeHover(null);
          gClickedRef.current = false;
        }}
        onCancel={() => { setCubePopup(p => ({ ...p, open: false })); setCubeHover(null); }}
        projection={cubeProjection}
        onToggleProjection={() => setCubeProjection(p => p === 'iso' ? 'persp' : 'iso')}
        onFindSketch={findMySketch}
        verticalLocked={verticalLocked}
        onToggleVerticalLock={toggleVerticalLock}
      />

      {/* ViewpointCubeV2 — docked (always visible, bottom-left) */}
      {cubeDocked && !presentationMode && (
        <ViewpointCubeV2
          open
          docked
          hovered={cubeV2Hover}
          onHover={setCubeV2Hover}
          onCommit={(faceId) => {
            const vp = VIEWPOINTS.find(v => v.cubeFace === faceId);
            if (vp) flyToViewpoint(vp.id);
            setCubeV2Hover(null);
          }}
          onCancel={() => setCubeV2Hover(null)}
          projection={cubeProjection}
          onToggleProjection={() => setCubeProjection(p => p === 'iso' ? 'persp' : 'iso')}
          onFindSketch={findMySketch}
          verticalLocked={verticalLocked}
          onToggleVerticalLock={toggleVerticalLock}
          threeStateRef={threeStateRef}
          orbitRef={orbitRef}
        />
      )}

      {/* ViewpointCubeV2 — popup, triggered by G key (only when not docked) */}
      {!cubeDocked && (
        <ViewpointCubeV2
          open={cubeV2Popup.open && !presentationMode}
          centered={cubeV2Popup.centered}
          x={cubeV2Popup.x}
          y={cubeV2Popup.y}
          hovered={cubeV2Hover}
          onHover={setCubeV2Hover}
          onCommit={(faceId) => {
            const vp = VIEWPOINTS.find(v => v.cubeFace === faceId);
            if (vp) flyToViewpoint(vp.id);
            setCubeV2Hover(null);
            cClickedRef.current = true;
          }}
          onCancel={() => { setCubeV2Popup(p => ({ ...p, open: false })); setCubeV2Hover(null); }}
          projection={cubeProjection}
          onToggleProjection={() => setCubeProjection(p => p === 'iso' ? 'persp' : 'iso')}
          onFindSketch={findMySketch}
          verticalLocked={verticalLocked}
          onToggleVerticalLock={toggleVerticalLock}
          threeStateRef={threeStateRef}
          orbitRef={orbitRef}
        />
      )}

      {/* Always-open bottom-center tool bar (redesign) */}
      {/* Camera capture-region frame — purple border while the camera tool is active.
          Square mode: centered square frame + black-tinted left/right bleed. */}
      {cameraTool && cameraVariant === 'camera' && !presentationMode && (
        cameraSquare ? (
          <>
            {/* dim the bleed on each side of the centered square (side = viewport height) */}
            <div style={{ position: 'fixed', top: 0, bottom: 0, left: 0, width: 'max(0px, calc((100vw - 100vh) / 2))', background: 'rgba(0,0,0,0.5)', pointerEvents: 'none', zIndex: 57 }} />
            <div style={{ position: 'fixed', top: 0, bottom: 0, right: 0, width: 'max(0px, calc((100vw - 100vh) / 2))', background: 'rgba(0,0,0,0.5)', pointerEvents: 'none', zIndex: 57 }} />
            <div style={{ position: 'fixed', top: 0, bottom: 0, left: '50%', transform: 'translateX(-50%)', height: '100vh', aspectRatio: '1 / 1', maxWidth: '100vw', border: '8px solid #6530F7', boxSizing: 'border-box', pointerEvents: 'none', zIndex: 58 }} />
          </>
        ) : (
          <div style={{ position: 'fixed', inset: 0, border: '8px solid #6530F7', pointerEvents: 'none', zIndex: 58, boxSizing: 'border-box' }} />
        )
      )}

      {!presentationMode && (
        <BottomToolbar
          selectActive={!annotationMode && !cameraTool}
          penActive={annotationMode && (activeTool === 'pen' || activeTool === 'pencil')}
          commentActive={annotationMode && activeTool === 'comment'}
          cameraActive={cameraTool}
          navVariant={activeMode === 'laser' ? 'laser' : navTool}
          penVariant={(activeTool === 'pen' || activeTool === 'pencil') ? activeTool : (lastDrawToolRef.current || 'pen')}
          commentVariant={commentMode}
          cameraVariant={cameraVariant}
          onSelectNavigation={null}
          onSelectDirectSelect={null}
          onSelectLaser={null}
          onSelectDrawing={null}
          onSelectPen={null}
          onSelectPencil={null}
          onSelectComment={null}
          onSelectCamera={null}
          onSelectSection={null}
          penColor={penColor} setPenColor={setPenColor}
          pencilColor={pencilColor} setPencilColor={setPencilColor}
          commentColor={redlineColor} setCommentColor={setRedlineColor}
          opacity={strokeOpacity} setOpacity={setStrokeOpacity}
          onCapture={() => { /* TODO: capture — no screenshot engine in repo yet */ }}
          cropOn={cameraSquare} onToggleCrop={() => setCameraSquare(v => !v)}
          onUndo={handleUndoRedline} onRedo={handleRedoRedline}
          canUndo={actionHistory.length > 0} canRedo={undoStack.length > 0}
        />
      )}

      {/* Click-outside dismissal for centered popups */}
      {(cubePopup.open && cubePopup.centered) ? (
        <div
          onClick={() => {
            setCubePopup(p => ({ ...p, open: false }));
            setCubeHover(null);
            gClickedRef.current = false;
          }}
          style={{ position: 'fixed', inset: 0, zIndex: 55, background: 'transparent' }}
        />
      ) : null}

      {/* v4 — presentation mode overlay */}
      <style>{`
        @keyframes presToastFade {
          0%   { opacity: 0.78; }
          55%  { opacity: 0.78; }
          100% { opacity: 0; }
        }
        @keyframes presBarFill {
          from { transform: scaleX(0); }
          to   { transform: scaleX(1); }
        }
        @keyframes scenePanelIn {
          from { opacity: 0; transform: translateX(12px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      {/* Viewpoints bar */}
      <ViewpointsBar
        viewpoints={viewpoints} setViewpoints={setViewpoints}
        activeIndex={presViewIndex} setActiveIndex={setPresViewIndex}
        atViewpoint={atViewpoint} setAtViewpoint={setAtViewpoint}
        viewpointFlyRef={viewpointFlyRef}
        flyTo={flyTo} orbitRef={orbitRef}
        presentationMode={presentationMode}
        presAutoPlay={presAutoPlay}
        PRES_INTERVAL={PRES_INTERVAL}
      />

      {/* Fading hint toast — shown at bottom when entering presentation mode */}
      {presentationMode && (
        <div style={{
          position: 'fixed', bottom: '32px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 100, pointerEvents: 'none',
          padding: '7px 16px', borderRadius: '9px',
          background: 'rgba(0,0,0,0.50)', color: 'rgba(255,255,255,0.90)',
          backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
          fontFamily: "'DM Sans', sans-serif", fontSize: '11px', letterSpacing: '0.05em',
          border: '1px solid rgba(255,255,255,0.12)',
          animation: 'presToastFade 4s ease-out forwards',
          whiteSpace: 'nowrap',
        }}>
          ← → navigate &nbsp;·&nbsp; Enter {presAutoPlay ? 'pause' : 'play'} &nbsp;·&nbsp; Tab exit
        </div>
      )}

      {/* Annotation options now live in the BottomToolbar contextual popover */}


      {selectedRedlineId && (() => {
        const stroke = redlines.find(r => r.id === selectedRedlineId);
        if (!stroke) return null;
        const mid = Math.floor(stroke.points3D.length / 2);
        const p = stroke.points3D[mid];
        const flyToCentroid = () => handleRedlineStrokeClick({
          stroke,
          centroid3D: { x: p.x + modelPosition[0], y: p.y + modelPosition[1], z: p.z + modelPosition[2] },
          screenPos: redlinePopupPos,
        });
        return (
          <StrokeThreadPopup
            key={selectedRedlineId}
            stroke={stroke}
            screenPos={redlinePopupPos}
            onClose={() => setSelectedRedlineId(null)}
            onFlyTo={flyToCentroid}
            onUpdate={handleRedlineStrokeUpdate}
            onReplyWithSketch={() => {
              setSelectedRedlineId(null);
              setAnnotationMode(true);
              setActiveTool('pencil');
              setAutoRotate(false);
            }}
          />
        );
      })()}

      <RedlineCanvasOverlay
        active={redlineMode} redlines={redlines} setRedlines={setRedlines}
        color={pencilColor} width={redlineWidth} opacity={strokeOpacity} threeStateRef={threeStateRef} orbitRef={orbitRef}
        onStrokeCommitted={handleStrokeCommitted}
        surfaceOffset={surfaceOffset} strokeCounter={strokeCounter} modelPosition={modelPosition}
        onStrokeClick={handleRedlineStrokeClick}
        setLivePoints={setLivePoints}
        precisionMode={precisionMode}
        setPrecisionMode={setPrecisionMode}
        parentCommentId={activeCommentId}        onContextMenu={handleContextMenuOpen}
      />

      <ModelTransformPanel position={modelPosition} setPosition={setModelPosition} visible={showTransformPanel && editMode} onClose={() => setShowTransformPanel(false)} />

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x} y={contextMenu.y} onSurface={contextMenu.onSurface} hitObjectName={contextMenu.hitObjectName}
          onClose={() => setContextMenu(null)}
          onTransform={handleContextMenuTransform}
          onResetCamera={() => flyTo(DEFAULT_CAMERA.position, DEFAULT_CAMERA.target, 800)}
          onToggleAutoRotate={() => setAutoRotate(v => !v)}
          onPresentation={() => setPresentationMode(v => !v)}
          onFindMySketch={findMySketch}
          onSelectAll={() => {}}
          onCenterInObject={() => {
            const hp = contextMenu.hitPoint;
            if (hp && orbitRef.current) {
              const cam = orbitRef.current.object;
              const dist = cam.position.distanceTo(orbitRef.current.target);
              const newTarget = new THREE.Vector3(hp.x, hp.y, hp.z);
              const dir = cam.position.clone().sub(orbitRef.current.target).normalize();
              flyTo([hp.x + dir.x * dist, hp.y + dir.y * dist, hp.z + dir.z * dist], [hp.x, hp.y, hp.z], 700);
            }
          }}
          onDuplicate={() => {
            if (selectedRedlineId) {
              const stroke = redlines.find(r => r.id === selectedRedlineId);
              if (stroke) {
                const id = Date.now();
                setRedlines(prev => [...prev, { ...stroke, id, name: stroke.name + ' copy', points3D: stroke.points3D.map(p => ({ ...p, x: p.x + 0.1 })) }]);
              }
            }
          }}
          onFlipX={() => setModelPosition(([x, y, z]) => [-x, y, z])}
          onFlipY={() => setModelPosition(([x, y, z]) => [x, -y, z])}
          onFlipZ={() => setModelPosition(([x, y, z]) => [x, y, -z])}
        />
      )}

      {!modelLoaded && <LoaderOverlay />}

      {/* Laser double-click pings */}
      {pings.map(({ id, x, y }) => (
        <div key={id} style={{ position: 'fixed', left: x, top: y, zIndex: 500, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', width: '22px', height: '22px', borderRadius: '50%', border: '2px solid #92F5B5', left: 0, top: 0, animation: 'pingRing1 1.1s cubic-bezier(0,0,0.2,1) forwards' }} />
          <div style={{ position: 'absolute', width: '22px', height: '22px', borderRadius: '50%', border: '1.5px solid rgba(146,245,181,0.55)', left: 0, top: 0, animation: 'pingRing2 1.4s cubic-bezier(0,0,0.2,1) 0.1s forwards' }} />
          <div
            style={{ position: 'absolute', width: '9px', height: '9px', borderRadius: '50%', background: '#92F5B5', left: 0, top: 0, animation: 'pingDot 1s ease-out forwards' }}
            onAnimationEnd={() => setPings(p => p.filter(pg => pg.id !== id))}
          />
        </div>
      ))}

      <PenToolOverlay
        active={penMode}
        threeStateRef={threeStateRef}
        orbitRef={orbitRef}
        modelPosition={modelPosition}
        penAnchors={penAnchors}
        setPenAnchors={setPenAnchors}
        onPathCommitted={handlePenPathCommitted}
        strokeColor={penColor}
        strokeWidth={redlineWidth}
        strokeOpacity={strokeOpacity}
        strokeCounter={strokeCounter}        onContextMenu={handleContextMenuOpen}
      />

      <EmojiToolOverlay
        active={annotationMode && activeTool === 'emoji'}
        threeStateRef={threeStateRef}
        orbitRef={orbitRef}
        selectedEmoji={selectedEmoji}
        onPlace={handlePlaceEmoji}        onContextMenu={handleContextMenuOpen}
      />

      <TextToolOverlay
        active={annotationMode && activeTool === 'text'}
        threeStateRef={threeStateRef}
        orbitRef={orbitRef}
        onPlace={handlePlaceText}
        textFont={textFont}
        textSize={textSize}
        textColor={redlineColor}        onContextMenu={handleContextMenuOpen}
      />

      {!fbxModel && (
        <FbxDropZone onModelLoaded={(m) => { setModelLoaded(false); setLoadError(null); setFbxModel(m); }} />
      )}

      {loadError && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.72)', fontFamily: UI.font }}>
          <div style={{ background: UI.bgPanel, borderRadius: UI.radius, padding: '32px 40px', maxWidth: '400px', textAlign: 'center', boxShadow: UI.panelShadow }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚠️</div>
            <div style={{ fontWeight: 600, color: UI.text, marginBottom: '8px' }}>Model failed to load</div>
            <div style={{ fontSize: '13px', color: UI.textMid, marginBottom: '24px' }}>{loadError}</div>
            <button
              onClick={() => { setLoadError(null); setFbxModel(null); }}
              style={{ background: UI.gold, color: DS.white, border: 'none', borderRadius: '10px', padding: '10px 22px', fontFamily: UI.font, fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      <Canvas
        shadows={!isMobile}
        camera={{ position: DEFAULT_CAMERA.position, fov: 47, near: 0.3, far: 60 }}
        dpr={isMobile ? [1, 1.5] : [1, 2]}
        gl={{ antialias: !isMobile, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: scene.tonemapping, powerPreference: 'high-performance', logarithmicDepthBuffer: true }}
        performance={{ min: 0.5 }}
      >
        <ThreeStateCapture stateRef={threeStateRef} />
        <ViewModeCursor active={!annotationMode} />
        <CommentsModeCursor active={editMode} />
        <BoxSelect active={!annotationMode && !presentationMode} selectedUuids={selectedUuids} setSelectedUuids={setSelectedUuids} setMarquee={setMarquee} />
        <SelectionHighlight selected={selectedUuids} />
        <SelectionOutlines selected={selectedUuids} />
        {!annotationMode && !presentationMode && <SelectionGizmo selected={selectedUuids} orbitRef={orbitRef} />}
        <PenModeCursor active={penMode} />
        {/* FIX: reactively update tone mapping exposure when scene changes */}
        <GlUpdater tonemapping={scene.tonemapping} cameraFov={scene.cameraFov} />
        <SceneBackground skyColor={scene.skyColor} bgColor={scene.bgColor} fogColor={scene.fogColor} fogNear={scene.fogNear} fogFar={scene.fogFar} />

        <ambientLight intensity={scene.ambientIntensity} color="#fff8f0" />
        <directionalLight
          position={[8, 14, 6]} intensity={scene.sunIntensity} color={scene.sunColor}
          castShadow={!isMobile} shadow-mapSize={isMobile ? [512, 512] : [1024, 1024]}
          shadow-camera-near={0.5} shadow-camera-far={40}
          shadow-camera-left={-10} shadow-camera-right={10} shadow-camera-top={10} shadow-camera-bottom={-10}
          shadow-bias={-0.001} shadow-normalBias={0.02} shadow-radius={isMobile ? 4 : 8}
        />
        <hemisphereLight args={['#ffffff', '#c8a87a', 1.2]} />
        {!isMobile && <pointLight position={[0, 0.5, 0]} intensity={scene.bounceIntensity} color="#ffe8c0" />}

        {fbxModel && (
          <ShoeModel
            onLoaded={() => { setModelLoaded(true); setFbxKey(k => k + 1); setLoadError(null); }}
            onError={(msg) => { setModelLoaded(true); setLoadError(msg); }}
            modelPosition={modelPosition}
            onBoundsReady={() => {}}
            fbxDataUrl={fbxModel.dataUrl}
          />
        )}

        {/* Snaps hardcoded demo-pin surface anchors to the actual shoe mesh once
            per model load. key=fbxKey forces remount (resets hasSnapped) when a
            new FBX is dropped. User-placed pins are already raycasted precisely
            at click time so re-snapping them is harmless. */}
        <PinSnapper key={fbxKey} tooltips={tooltips} onSnapped={setTooltips} />

        {!redlineMode && !penMode && (
          <RaycastPlane
            onPick={editMode ? (raw) => setClickPoint({ ...raw, surfaceX: raw.x, surfaceY: raw.y, surfaceZ: raw.z, y: commentMode === 'callout' ? raw.y + LEADER_LIFT : raw.y }) : () => {}}
            draggingId={draggingId}
            onModelClick={() => {}}
            onContextMenu={handleContextMenuOpen}
            orbitRef={orbitRef}
          />
        )}

        {clickPoint && !redlineMode && !presentationMode && <ClickMarker point={clickPoint} nextNumber={tooltips.length + 1} commentMode={commentMode} color={redlineColor} />}
        <RedlineStrokes3D redlines={redlines} modelPosition={modelPosition} selectedId={selectedRedlineId} hidden={tooltipsHidden || presentationMode} renderAbove={renderAbove} />
        <LiveRedlineStroke points={livePoints} color={pencilColor} width={redlineWidth} modelPosition={modelPosition} hidden={tooltipsHidden || presentationMode} renderAbove={renderAbove} />
        <EmojiAnnotations3D annotations={emojiAnnotations} hidden={tooltipsHidden || presentationMode} />
        <TextAnnotations3D annotations={textAnnotations} hidden={tooltipsHidden || presentationMode} activeTool={annotationMode ? activeTool : 'view'} orbitRef={orbitRef} onMove={handleMoveTextAnnotation} />
        {!presentationMode && <PenPreview3D anchors={penAnchors} modelPosition={modelPosition} color={penColor} width={redlineWidth} />}
        {!presentationMode && (<SketchPins
          redlines={redlines.filter(r => r.attachedNote)}
          allRedlines={redlines}
          tooltipCount={tooltips.length}
          selectedId={selectedRedlineId}
          modelPosition={modelPosition}
          onOpenNote={(r) => {
            setRedlinePopupPos({ x: window.innerWidth / 2 - 150, y: 120 });
            setSelectedRedlineId(r.id);
          }}
          onUpdateStroke={handleRedlineStrokeUpdate}
          onTranslateStroke={handleTranslateStroke}
        />)}

        {!tooltipsHidden && !redlineMode && !penMode && !presentationMode && (
          <TooltipPins
            tooltips={tooltips} onRemove={handleRemoveTooltip}
            selectedId={draggingId} onSelect={handleSelectTooltip}
            editMode={editMode} onFlyTo={handleFlyTo}
            expandedId={expandedCommentId} onSetExpanded={(id) => setExpandedCommentId(prev => prev === id ? null : id)}
            onPinViewed={markPinSeen}
            renderAbove={renderAbove}
            onUpdatePin={handleUpdateTooltip}
            isPinSeen={isPinSeenFn}
          />
        )}

        <Ground color={scene.floorColor} roughness={scene.floorRoughness} metalness={scene.floorMetalness} />

        {!isMobile && (
          <ContactShadows position={[0, 0.001, 0]} opacity={0.55} scale={12} blur={3.0} far={6} resolution={isMobile ? 128 : 256} />
        )}

        <Environment preset={scene.envPreset} />

        <OrbitControls
          ref={orbitRef}
          target={DEFAULT_CAMERA.target}
          enablePan={true}
          enableZoom={true}
          enableDamping={true}
          dampingFactor={0.06}
          zoomSpeed={shiftHeld ? 0.45 : 1.0}
          minDistance={1.2}
          maxDistance={12}
          maxPolarAngle={Math.PI}
          autoRotate={autoRotate}
          autoRotateSpeed={scene.autoRotateSpeed}
          // Right-drag orbits the camera. Left/middle are handled by the app:
          // left = box-select / annotation input, middle = context menu.
          // Holding Shift OR Space swaps RIGHT to PAN (driven by `shiftHeld` so a
          // re-render can't reset it back to ROTATE mid-hold).
          mouseButtons={{ LEFT: null, MIDDLE: null, RIGHT: shiftHeld ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE }}
          onChange={() => { if (!viewpointFlyRef.current) setAtViewpoint(false); }}
        />

      </Canvas>

      {/* Box-select marquee rectangle (View mode left-drag) */}
      {marquee && (
        <div style={{
          position: 'fixed', pointerEvents: 'none', zIndex: 8,
          left: Math.min(marquee.x0, marquee.x1), top: Math.min(marquee.y0, marquee.y1),
          width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0),
          border: `1px solid ${UI.purple}`, background: 'rgba(108,92,231,0.12)', borderRadius: '2px',
        }} />
      )}

      <LaserTrail
        active={activeMode === 'laser'}
        meshesRef={shoeModelMeshes}
        threeStateRef={threeStateRef}
      />
    </div>
  );
}