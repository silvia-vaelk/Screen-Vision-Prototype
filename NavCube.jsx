import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';

const NAV_FACES = [
  { id: 'right',  label: 'Right',  s: 'R',  mi: 0 },
  { id: 'left',   label: 'Left',   s: 'L',  mi: 1 },
  { id: 'top',    label: 'Top',    s: 'T',  mi: 2 },
  { id: 'bottom', label: 'Bottom', s: 'Bo', mi: 3 },
  { id: 'front',  label: 'Front',  s: 'F',  mi: 4 },
  { id: 'back',   label: 'Back',   s: 'Bk', mi: 5 },
];

/* Build a 128×128 canvas texture for a NavCube face. */
const makeNavFaceTex = (shortLabel, hovered, showLabel = false) => {
  const sz = 128;
  const c = document.createElement('canvas');
  c.width = sz; c.height = sz;
  const ctx = c.getContext('2d');

  ctx.fillStyle = hovered ? 'rgba(255,255,255,1.0)' : 'rgba(248,248,252,0.97)';
  ctx.fillRect(0, 0, sz, sz);

  const glow = ctx.createRadialGradient(sz/2, sz/2, 0, sz/2, sz/2, sz * 0.72);
  glow.addColorStop(0,   hovered ? 'rgba(108,92,231,0.18)' : 'rgba(108,92,231,0.07)');
  glow.addColorStop(0.6, hovered ? 'rgba(108,92,231,0.06)' : 'rgba(108,92,231,0.02)');
  glow.addColorStop(1,   'rgba(108,92,231,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, sz, sz);

  ctx.strokeStyle = hovered ? 'rgba(108,92,231,0.35)' : 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 4;
  ctx.strokeRect(3, 3, sz - 6, sz - 6);

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

const NAV_ARROWS = [
  { id: 'top',   style: { top: '-30px',    left: '50%', transform: 'translateX(-50%)' }, path: 'M6 10L10 6l4 4' },
  { id: 'front', style: { bottom: '-30px', left: '50%', transform: 'translateX(-50%)' }, path: 'M6 6l4 4 4-4' },
  { id: 'left',  style: { left: '-30px',   top: '50%',  transform: 'translateY(-50%)' }, path: 'M10 6L6 10l4 4' },
  { id: 'right', style: { right: '-30px',  top: '50%',  transform: 'translateY(-50%)' }, path: 'M6 6l4 4-4 4' },
];

/*
  NavCube — WebGL orientation gizmo using a separate Three.js renderer (second WebGL context)
  so it gets real depth-testing, GPU face-culling, and raycaster-based hover/click.
  Rotation: cube.quaternion = mainCamera.quaternion.inverse() — the cube counter-rotates with
  the camera so each face always points at the viewer from the corresponding world direction.
*/
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

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(SIZE, SIZE);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x000000, 0);
    Object.assign(renderer.domElement.style, {
      width: SIZE + 'px', height: SIZE + 'px', display: 'block', cursor: 'default',
    });
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const hs = 1.55;
    const cam = new THREE.OrthographicCamera(-hs, hs, hs, -hs, 0.1, 20);
    cam.position.set(0, 0, 10);
    cam.lookAt(0, 0, 0);

    const geo = new THREE.BoxGeometry(1.85, 1.85, 1.85);
    const mats = NAV_FACES.map(f => new THREE.MeshBasicMaterial({ map: makeNavFaceTex(f.s, false, false) }));
    const cube = new THREE.Mesh(geo, mats);
    scene.add(cube);

    const edgeGeo = new THREE.EdgesGeometry(geo);
    cube.add(new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: 0xccccdd, transparent: true, opacity: 0.6 })));

    [
      { pos: [1.28, 0, 0],  color: 0xe05a5a },
      { pos: [0, 1.28, 0],  color: 0x5cb87a },
      { pos: [0, 0, 1.28],  color: 0x5b8fe0 },
    ].forEach(({ pos, color }) => {
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.17, 14, 14),
        new THREE.MeshBasicMaterial({ color }),
      );
      dot.position.set(...pos);
      cube.add(dot);
    });

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
        mats[mi].map = makeNavFaceTex(NAV_FACES[mi].s, true, true);
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
  }, [threeStateRef]);

  return (
    <div style={{ position: 'fixed', bottom: '16px', left: '16px', zIndex: 20, userSelect: 'none', padding: '32px', margin: '-32px' }}>
      <div
        onMouseEnter={() => setCubeHovered(true)}
        onMouseLeave={() => { setCubeHovered(false); }}
        style={{ position: 'relative', width: '96px', height: '96px' }}
      >
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
              transition: 'opacity 0.18s ease',
              pointerEvents: cubeHovered ? 'auto' : 'none',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path d={path} stroke="rgba(255,255,255,0.85)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        ))}
        <div ref={mountRef} style={{ width: '96px', height: '96px' }} />
        {hoveredLabel && (
          <div style={{
            position: 'absolute', bottom: '-22px', left: '50%', transform: 'translateX(-50%)',
            fontSize: '9px', color: 'rgba(0,0,0,0.5)', fontFamily: 'system-ui, sans-serif',
            letterSpacing: '0.12em', textTransform: 'uppercase', whiteSpace: 'nowrap', pointerEvents: 'none',
          }}>{hoveredLabel}</div>
        )}
      </div>
    </div>
  );
};

export default NavCube;
