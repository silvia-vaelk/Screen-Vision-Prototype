/**
 * ViewpointCubeV2 — wireframe mesh cube (V key) with live param controls.
 * Uses imperative Three.js (same pattern as NavCube) so colours are exact.
 */
import React, { useRef, useState, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { SubsurfaceScatteringShader } from 'three/examples/jsm/shaders/SubsurfaceScatteringShader.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const FONT    = "'Inter', sans-serif";
const CUBE_PX = 220;
const CUBE_S  = 1.6;   // world-space side length

const FACE_DEFS = [
  { id: 'front',  normal: new THREE.Vector3( 0,  0,  1), label: 'FRONT',  num: 2 },
  { id: 'back',   normal: new THREE.Vector3( 0,  0, -1), label: 'BACK',   num: 4 },
  { id: 'right',  normal: new THREE.Vector3( 1,  0,  0), label: 'RIGHT',  num: 1 },
  { id: 'left',   normal: new THREE.Vector3(-1,  0,  0), label: 'LEFT',   num: 5 },
  { id: 'top',    normal: new THREE.Vector3( 0,  1,  0), label: 'TOP',    num: 6 },
  { id: 'bottom', normal: new THREE.Vector3( 0, -1,  0), label: 'BOTTOM', num: 3 },
];

// Shared params (same across all presets)
const SHARED_DEFAULTS = {
  bgColor:    '#000000',
  bgOpacity:  0.00,
  hoverColor: '#ffffff',
  hoverFillOp: 0.43,
};

// Per-preset isolated defaults
const PRESET_DEFAULTS = {
  mesh: {
    lineColor:    '#ffffff',
    opacityFront: 1.00,
    opacityBack:  0.12,
    fillOpacity:  0.14,
    subdivisions: 8,
    dashed:       false,
    dashSize:     0.06,
    gapSize:      0.04,
  },
  glass: {
    sssDiffuse:          '#6530F7',
    sssThicknessColor:   '#d4d1ff',
    sssShininess:        457,
    sssDistortion:       0.69,
    sssAmbient:          0.00,
    sssAttenuation:      1.00,
    sssPower:            2.93,
    sssScale:            24.40,
    sssLightIntensity:   0.73,
    sssOpacity:          0.75,
    subdivisions:        4,
  },
};

const DEFAULT_STATE = {
  preset: 'glass',
  shared: { ...SHARED_DEFAULTS },
  mesh:   { ...PRESET_DEFAULTS.mesh },
  glass:  { ...PRESET_DEFAULTS.glass },
};

// Flatten state into a single params object for CubeCanvas
const flatParams = (state) => ({
  preset: state.preset,
  ...state.shared,
  ...state[state.preset],
});

/* Build a grid LineSegments geometry for one face (no diagonal edges) */
function makeGridGeo(size, segs) {
  const pos  = [];
  const half = size / 2;
  const step = size / segs;
  for (let i = 0; i <= segs; i++) {
    const t = -half + i * step;
    pos.push(-half, t, 0,   half, t, 0);  // horizontal
    pos.push(t, -half, 0,   t,  half, 0); // vertical
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return geo;
}

/* Quaternion: rotate +Z plane → faceNormal */
function faceQuat(normal) {
  const q = new THREE.Quaternion();
  q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize());
  return q;
}

/* ── CubeCanvas — imperative Three.js in a plain <div> ── */
const CubeCanvas = ({ params, hovered, onHover, onCommit, onFaceSelect, initialFace, threeStateRef, orbitRef, verticalLocked, faceTooltipRef }) => {
  const mountRef   = useRef(null);
  const stateRef   = useRef(null);  // holds all Three objects
  const paramsRef       = useRef(params);
  const hoveredRef      = useRef(hovered);
  const vertLockedRef   = useRef(verticalLocked);
  const selectedFaceRef = useRef(initialFace ?? null); // seed from last selected face on reopen

  // Keep refs up to date without rebuilding the scene
  useEffect(() => { paramsRef.current    = params;         }, [params]);
  useEffect(() => { hoveredRef.current   = hovered;        }, [hovered]);
  useEffect(() => { vertLockedRef.current = verticalLocked; }, [verticalLocked]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const SIZE = CUBE_PX;
    const dpr  = Math.min(window.devicePixelRatio || 1, 2);

    // Renderer — alpha:true + explicit clear to transparent
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(SIZE, SIZE);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x000000, 0);
    Object.assign(renderer.domElement.style, {
      width: SIZE + 'px', height: SIZE + 'px', display: 'block', cursor: 'grab',
    });
    mount.appendChild(renderer.domElement);

    // Camera
    const hs  = 1.65;
    const cam = new THREE.OrthographicCamera(-hs, hs, hs, -hs, 0.1, 50);
    cam.position.set(2.2, 1.8, 2.6);
    cam.lookAt(0, 0, 0);

    const scene = new THREE.Scene();
    const group = new THREE.Group();
    scene.add(group);

    const p0       = paramsRef.current;
    const isGlass  = p0.preset === 'glass';  // SSS shader preset (renamed to Glass)

    // White 1×1 texture needed by SubsurfaceScatteringShader
    const whiteData = new Uint8Array([255, 255, 255, 255]);
    const whiteTex  = new THREE.DataTexture(whiteData, 1, 1, THREE.RGBAFormat);
    whiteTex.needsUpdate = true;

    // Lights
    const ambLight = new THREE.AmbientLight(0xffffff, isGlass ? 0.8 : 0.6);
    const dirFront = new THREE.DirectionalLight(0xffffff, isGlass ? 0.4 : 1.2);
    dirFront.position.set(2.2, 1.8, 2.6);
    const backLight1 = new THREE.PointLight(0xffffff, isGlass ? p0.sssLightIntensity : 0, 20);
    backLight1.position.set(-2.5, -1.5, -2.5);
    const backLight2 = new THREE.PointLight(0xffcc66, isGlass ? p0.sssLightIntensity * 0.7 : 0, 20);
    backLight2.position.set(0, -3, 0);
    const backLight3 = new THREE.PointLight(0xffffff, isGlass ? p0.sssLightIntensity * 0.5 : 0, 20);
    backLight3.position.set(-3, 2, -3);
    scene.add(ambLight, dirFront, backLight1, backLight2, backLight3);

    const faceMats  = [];
    const fillMats  = [];
    const clickMesh = [];

    // ── Glass (SSS shader): rounded box visual + 6 invisible click planes ──
    if (isGlass) {
      const toVec3 = (hex) => { const c = new THREE.Color(hex); return new THREE.Vector3(c.r, c.g, c.b); };
      const sssUniforms = THREE.UniformsUtils.clone(SubsurfaceScatteringShader.uniforms);
      sssUniforms['map'].value                  = whiteTex;
      sssUniforms['thicknessMap'].value         = whiteTex;
      sssUniforms['diffuse'].value              = toVec3(p0.sssDiffuse);
      sssUniforms['shininess'].value            = p0.sssShininess;
      sssUniforms['thicknessColor'].value       = toVec3(p0.sssThicknessColor);
      sssUniforms['thicknessDistortion'].value  = p0.sssDistortion;
      sssUniforms['thicknessAmbient'].value     = p0.sssAmbient;
      sssUniforms['thicknessAttenuation'].value = p0.sssAttenuation;
      sssUniforms['thicknessPower'].value       = p0.sssPower;
      sssUniforms['thicknessScale'].value       = p0.sssScale;
      const visualMat = new THREE.ShaderMaterial({
        uniforms: sssUniforms,
        vertexShader: SubsurfaceScatteringShader.vertexShader,
        fragmentShader: SubsurfaceScatteringShader.fragmentShader,
        lights: true, transparent: true,
      });
      fillMats.push(visualMat);

      // Rounded box — 4 subdivision segments, 0.12 corner radius
      const roundedGeo = new RoundedBoxGeometry(CUBE_S, CUBE_S, CUBE_S, 4, 0.03);
      const visualMesh = new THREE.Mesh(roundedGeo, visualMat);
      group.add(visualMesh);

      // 6 invisible click planes
      FACE_DEFS.forEach((face) => {
        const offset   = face.normal.clone().multiplyScalar(CUBE_S / 2);
        const q        = faceQuat(face.normal);
        const clickGeo = new THREE.PlaneGeometry(CUBE_S * 0.9, CUBE_S * 0.9);
        const clickMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, opacity: 0, depthWrite: false });
        const mesh = new THREE.Mesh(clickGeo, clickMat);
        mesh.position.copy(offset);
        mesh.quaternion.copy(q);
        mesh.userData.faceId = face.id;
        group.add(mesh);
        clickMesh.push(mesh);
        faceMats.push(new THREE.LineBasicMaterial()); // placeholder
      });

    // ── Mesh mode: 6 separate subdivided planes ──
    } else {
      FACE_DEFS.forEach((face) => {
        const offset = face.normal.clone().multiplyScalar(CUBE_S / 2);
        const q      = faceQuat(face.normal);
        const segs   = p0.subdivisions;

        const fillGeo = new THREE.PlaneGeometry(CUBE_S, CUBE_S, segs, segs);
        const fillMat = new THREE.MeshBasicMaterial({
          color: p0.lineColor, transparent: true,
          opacity: p0.fillOpacity, side: THREE.DoubleSide, depthWrite: false,
        });
        fillMats.push(fillMat);
        const fill = new THREE.Mesh(fillGeo, fillMat);
        fill.position.copy(offset);
        fill.quaternion.copy(q);
        group.add(fill);

        const geo = makeGridGeo(CUBE_S, segs);
        const mat = new THREE.LineBasicMaterial({ color: p0.lineColor || '#ffffff', depthWrite: false });
        faceMats.push(mat);
        const lines = new THREE.LineSegments(geo, mat);
        lines.position.copy(offset.clone().addScaledVector(face.normal, 0.001));
        lines.quaternion.copy(q);
        group.add(lines);

        const clickGeo = new THREE.PlaneGeometry(CUBE_S, CUBE_S);
        const clickMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, opacity: 0, depthWrite: false });
        const mesh = new THREE.Mesh(clickGeo, clickMat);
        mesh.position.copy(offset);
        mesh.quaternion.copy(q);
        mesh.userData.faceId = face.id;
        group.add(mesh);
        clickMesh.push(mesh);
      });
    }

    // Hover highlight — grayscale alphaMap (Three.js reads red channel: white=opaque, black=transparent)
    const gradSize = 256;
    const gradCanvas = document.createElement('canvas');
    gradCanvas.width = gradCanvas.height = gradSize;
    const gctx = gradCanvas.getContext('2d');
    const radGrad = gctx.createRadialGradient(gradSize/2, gradSize/2, 0, gradSize/2, gradSize/2, gradSize/2 * 0.92);
    radGrad.addColorStop(0,    '#ffffff');
    radGrad.addColorStop(0.4,  '#dddddd');
    radGrad.addColorStop(0.75, '#555555');
    radGrad.addColorStop(1,    '#000000');
    gctx.fillStyle = '#000000';
    gctx.fillRect(0, 0, gradSize, gradSize);
    gctx.fillStyle = radGrad;
    gctx.fillRect(0, 0, gradSize, gradSize);
    const gradTex = new THREE.CanvasTexture(gradCanvas);

    const hoverGeo   = new THREE.PlaneGeometry(CUBE_S, CUBE_S);
    const hoverMat   = new THREE.MeshBasicMaterial({ color: '#a29bfe', alphaMap: gradTex, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
    const hoverPlane = new THREE.Mesh(hoverGeo, hoverMat);
    group.add(hoverPlane);

    mount.style.position = 'relative';
    const tmpV = new THREE.Vector3();

    // Drag / click state
    const CLICK_THRESHOLD = 6; // px — moves under this = click, not drag
    const drag    = { active: false, lastX: 0, lastY: 0, startX: 0, startY: 0, moved: false };
    let lockTime = 0; // timestamp of last face selection, for grace-period detection
    const inertia = { x: 0, y: 0 };
    const el      = renderer.domElement;

    // Raycaster (shared)
    const rc   = new THREE.Raycaster();
    const mNDC = { x: 0, y: 0 };
    let lastHitId = null;

    const getHit = (clientX, clientY) => {
      const rect = el.getBoundingClientRect();
      mNDC.x =  ((clientX - rect.left)  / rect.width)  * 2 - 1;
      mNDC.y = -((clientY - rect.top)   / rect.height) * 2 + 1;
      rc.setFromCamera(mNDC, cam);
      const hits = rc.intersectObjects(clickMesh, false);
      return hits.length ? hits[0].object.userData.faceId : null;
    };

    const onDown = (e) => {
      drag.active = true; drag.moved = false;
      drag.lastX = drag.startX = e.clientX;
      drag.lastY = drag.startY = e.clientY;
      el.style.cursor = 'grabbing';
      el.setPointerCapture?.(e.pointerId);
    };

    const onMove = (e) => {
      // Update hover even while dragging (for label highlight)
      if (!drag.active) {
        const id = getHit(e.clientX, e.clientY);
        if (id !== lastHitId) { lastHitId = id; onHover(id); }
        el.style.cursor = id ? 'pointer' : 'grab';
        return;
      }
      const dx = e.clientX - drag.lastX, dy = e.clientY - drag.lastY;
      drag.lastX = e.clientX; drag.lastY = e.clientY;
      const totalDist = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
      if (totalDist > CLICK_THRESHOLD) drag.moved = true;

      if (drag.moved) {
        const orbit   = orbitRef?.current;
        const mainCam = threeStateRef?.current?.camera;
        if (orbit && mainCam) {
          const locked = vertLockedRef.current;
          const target = orbit.target;
          const offset = mainCam.position.clone().sub(target);
          const sph    = new THREE.Spherical().setFromVector3(offset);
          sph.theta -= dx * 0.012;
          sph.phi   -= dy * 0.012;
          sph.phi    = locked
            ? Math.max(Math.PI * 0.1, Math.min(Math.PI * 0.9, sph.phi))
            : Math.max(0.01, Math.min(Math.PI - 0.01, sph.phi));
          // Temporarily lift OrbitControls polar cap so our position isn't clamped back
          const prevMin = orbit.minPolarAngle;
          const prevMax = orbit.maxPolarAngle;
          orbit.minPolarAngle = 0;
          orbit.maxPolarAngle = Math.PI;
          mainCam.position.copy(new THREE.Vector3().setFromSpherical(sph).add(target));
          mainCam.lookAt(target);
          orbit.update();
          // Restore original limits
          orbit.minPolarAngle = prevMin;
          orbit.maxPolarAngle = prevMax;
        } else {
          group.rotation.y += dx * 0.012;
          group.rotation.x += dy * 0.012;
          inertia.x = dy * 0.012; inertia.y = dx * 0.012;
        }
        if (selectedFaceRef.current) { selectedFaceRef.current = null; onFaceSelect?.(null); }
      }
    };

    const onUp = (e) => {
      const wasDrag = drag.moved;
      drag.active = false; drag.moved = false;
      el.style.cursor = 'grab';
      try { el.releasePointerCapture?.(e.pointerId); } catch {}
      if (!wasDrag) {
        // Pure click — commit and lock V-cam to face
        const id = getHit(e.clientX, e.clientY);
        if (id) {
          const face = FACE_DEFS.find(f => f.id === id);
          const normal = face ? face.normal.clone() : null;
          selectedFaceRef.current = normal;
          lockTime = Date.now();
          onFaceSelect?.(normal);
          onCommit(id);
        }
      }
    };

    const onLeave = () => { lastHitId = null; onHover(null); };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup',   onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('pointerleave', onLeave);

    // Render loop
    const camPos = new THREE.Vector3();
    let rafId;
    let prevMainCamPos = null;

    const loop = () => {
      rafId = requestAnimationFrame(loop);
      const p   = paramsRef.current;
      const hov = hoveredRef.current;

      const mainCam = threeStateRef?.current?.camera;

      // Release face-lock if main camera moves — but only after a grace period
      // so the fly-to animation triggered by onCommit doesn't immediately undo the lock
      if (selectedFaceRef.current && mainCam && Date.now() - lockTime > 1200) {
        if (prevMainCamPos && mainCam.position.distanceToSquared(prevMainCamPos) > 0.0001) {
          selectedFaceRef.current = null;
          onFaceSelect?.(null);
        }
      }
      if (mainCam) prevMainCamPos = mainCam.position.clone();

      const selNormal = selectedFaceRef.current;

      if (selNormal) {
        // Face selected — straight face-on view, group to identity
        const targetPos = selNormal.clone().multiplyScalar(5);
        cam.position.lerp(targetPos, 0.12);
        cam.up.set(0, Math.abs(selNormal.y) > 0.5 ? 0 : 1, Math.abs(selNormal.y) > 0.5 ? 1 : 0);
        cam.lookAt(0, 0, 0);
        group.quaternion.slerp(new THREE.Quaternion(), 0.12);
      } else if (mainCam) {
        // Normal: mirror main camera instantly (hard copy avoids spinning)
        cam.position.lerp(new THREE.Vector3(2.2, 1.8, 2.6), 0.12);
        cam.up.set(0, 1, 0);
        cam.lookAt(0, 0, 0);
        group.quaternion.copy(mainCam.quaternion).invert();
      } else if (!drag.active) {
        cam.position.lerp(new THREE.Vector3(2.2, 1.8, 2.6), 0.12);
        cam.lookAt(0, 0, 0);
        group.rotation.y += inertia.y;
        group.rotation.x += inertia.x;
        inertia.x *= 0.91;
        inertia.y *= 0.91;
      }

      cam.getWorldPosition(camPos);
      // Rotate all lights to maintain relative positions to camera direction,
      // so SSS appearance is consistent regardless of which face is viewed
      const defaultCamDir = new THREE.Vector3(2.2, 1.8, 2.6).normalize();
      const currentCamDir = camPos.clone().normalize();
      const lightRot = new THREE.Quaternion().setFromUnitVectors(defaultCamDir, currentCamDir);
      dirFront.position.copy(new THREE.Vector3(2.2,  1.8,  2.6).applyQuaternion(lightRot));
      backLight1.position.copy(new THREE.Vector3(-2.5, -1.5, -2.5).applyQuaternion(lightRot));
      backLight2.position.copy(new THREE.Vector3( 0,   -3,   0  ).applyQuaternion(lightRot));
      backLight3.position.copy(new THREE.Vector3(-3,    2,  -3  ).applyQuaternion(lightRot));
      const camLocal = group.worldToLocal(camPos.clone()).normalize();

      // Update materials
      const baseColor = new THREE.Color(p.lineColor || '#ffffff');

      if (isGlass) {
        const u = fillMats[0]?.uniforms;
        if (u) {
          const toV3 = (hex) => { const c = new THREE.Color(hex); return new THREE.Vector3(c.r, c.g, c.b); };
          u['diffuse'].value.copy(toV3(p.sssDiffuse));
          u['shininess'].value            = p.sssShininess;
          u['thicknessColor'].value.copy(toV3(p.sssThicknessColor));
          u['thicknessDistortion'].value  = p.sssDistortion;
          u['thicknessAmbient'].value     = p.sssAmbient;
          u['thicknessAttenuation'].value = p.sssAttenuation;
          u['thicknessPower'].value       = p.sssPower;
          u['thicknessScale'].value       = p.sssScale;
          if (fillMats[0]) fillMats[0].opacity = p.sssOpacity ?? 1.0;
        }
        backLight1.intensity = p.sssLightIntensity;
        backLight2.intensity = p.sssLightIntensity * 0.7;
        backLight3.intensity = p.sssLightIntensity * 0.5;
      } else {
        FACE_DEFS.forEach((face, i) => {
          const dot   = face.normal.dot(camLocal);
          const bri   = dot >= 0 ? p.opacityFront : THREE.MathUtils.lerp(p.opacityBack, p.opacityFront, (dot + 1) * 2);
          const fillT = (dot + 1) / 2;
          if (faceMats[i]) faceMats[i].color.copy(baseColor).multiplyScalar(bri);
          if (fillMats[i]) { fillMats[i].color.copy(baseColor); fillMats[i].opacity = THREE.MathUtils.lerp(0, p.fillOpacity, fillT); }
        });
      }

      // Hover highlight plane
      const hovFace = FACE_DEFS.find(f => f.id === hov);
      if (hovFace) {
        hoverPlane.position.copy(hovFace.normal.clone().multiplyScalar(CUBE_S / 2 + 0.001));
        hoverPlane.quaternion.copy(faceQuat(hovFace.normal));
        hoverMat.color.set(p.hoverColor);
        hoverMat.opacity = p.hoverFillOp;
        hoverPlane.visible = true;
      } else {
        hoverPlane.visible = false;
      }

      // Background
      renderer.setClearColor(p.bgOpacity > 0 ? new THREE.Color(p.bgColor) : 0x000000, p.bgOpacity > 0 ? p.bgOpacity : 0);
      renderer.render(scene, cam);

      // Face label tooltip — hide while dragging, otherwise position at projected face centre
      const ftEl = faceTooltipRef?.current;
      if (ftEl) {
        if (hov && !drag.moved) {
          const face = FACE_DEFS.find(f => f.id === hov);
          if (face) {
            tmpV.copy(face.normal).multiplyScalar(CUBE_S / 2).applyQuaternion(group.quaternion).project(cam);
            const rect = renderer.domElement.getBoundingClientRect();
            const sx = rect.left + (tmpV.x  + 1) / 2 * SIZE;
            const sy = rect.top  + (-tmpV.y + 1) / 2 * SIZE;
            ftEl.innerHTML     = `<div>${face.label}</div><div style="text-align:center">${face.num}</div>`;
            ftEl.style.display = 'block';
            ftEl.style.left    = sx + 'px';
            ftEl.style.top     = sy + 'px';
          }
        } else {
          ftEl.style.display = 'none';
        }
      }
    };
    rafId = requestAnimationFrame(loop);

    stateRef.current = { renderer, scene, group, faceMats };

    return () => {
      cancelAnimationFrame(rafId);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup',   onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('pointerleave', onLeave);
      faceMats.forEach(m => m.dispose());
      renderer.dispose();
      if (mount.contains(el)) mount.removeChild(el);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once — params/hovered kept fresh via refs

  return <div ref={mountRef} style={{ width: CUBE_PX + 'px', height: CUBE_PX + 'px' }} />;
};

/* ── UI helpers ── */
const Row = ({ label, children }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: '22px' }}>
    <span style={{ fontFamily: FONT, fontSize: '10px', color: 'rgba(255,255,255,0.45)', width: '88px', flexShrink: 0 }}>{label}</span>
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>{children}</div>
  </div>
);
const Slider = ({ value, min, max, step = 0.01, onChange }) => (
  <input type="range" min={min} max={max} step={step} value={value}
    onChange={e => onChange(parseFloat(e.target.value))}
    style={{ flex: 1, accentColor: '#7b59ff', height: '3px', cursor: 'pointer' }} />
);
const Val = ({ v, decimals = 2 }) => (
  <span style={{ fontFamily: FONT, fontSize: '10px', color: 'rgba(255,255,255,0.5)', width: '28px', textAlign: 'right', flexShrink: 0 }}>
    {typeof v === 'number' ? v.toFixed(decimals) : v}
  </span>
);
const ColorInput = ({ value, onChange }) => {
  const [text, setText] = useState(value);
  useEffect(() => { setText(value); }, [value]);
  const commit = (raw) => {
    const v = raw.startsWith('#') ? raw : '#' + raw;
    if (/^#[0-9A-Fa-f]{6}$/.test(v)) onChange(v);
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
      <label style={{ position: 'relative', width: '22px', height: '22px', borderRadius: '6px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.18)', cursor: 'pointer', flexShrink: 0, display: 'block', background: value }}>
        <input type="color" value={value} onChange={e => { onChange(e.target.value); setText(e.target.value); }}
          style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }} />
      </label>
      <input
        type="text" value={text} spellCheck={false}
        onChange={e => setText(e.target.value)}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') commit(e.target.value); }}
        style={{
          flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: '5px', color: 'rgba(255,255,255,0.7)', fontFamily: FONT, fontSize: '10px',
          padding: '3px 7px', outline: 'none', minWidth: 0,
        }}
        onFocus={e => e.target.style.borderColor = 'rgba(123,89,255,0.6)'}
        onBlurCapture={e => e.target.style.borderColor = 'rgba(255,255,255,0.10)'}
      />
    </div>
  );
};
const Toggle = ({ value, onChange }) => (
  <button onClick={() => onChange(!value)} style={{
    padding: '2px 10px', borderRadius: '999px', border: 'none', cursor: 'pointer',
    background: value ? '#7b59ff' : 'rgba(255,255,255,0.10)',
    color: value ? '#fff' : 'rgba(255,255,255,0.5)',
    fontFamily: FONT, fontSize: '10px', fontWeight: '600', transition: 'all 0.15s',
  }}>{value ? 'On' : 'Off'}</button>
);

// Inline SVG icons — viewBox adds ~1.5u padding each side so icons have breathing room
// strokeWidth ~1.0 matches the visual weight of other nav icons (VR, layers)
const IcFind = () => (
  <svg width="20" height="20" viewBox="-1 -1 18.67 18.67" fill="none">
    <path d="M15.8333 15.8333L12.2083 12.2083M7.5 5V10M5 7.5H10M14.1667 7.5C14.1667 11.1819 11.1819 14.1667 7.5 14.1667C3.8181 14.1667 0.833333 11.1819 0.833333 7.5C0.833333 3.8181 3.8181 0.833333 7.5 0.833333C11.1819 0.833333 14.1667 3.8181 14.1667 7.5Z" stroke="white" strokeWidth="1.0" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IcUnlocked = () => (
  <svg width="12" height="12" viewBox="-1 -1 17 18.67" fill="none">
    <path d="M3.33333 7.5V5C3.33333 2.69881 5.19881 0.833333 7.5 0.833333C9.5158 0.833333 11.1973 2.2648 11.5833 4.16667M4.83333 15.8333H10.1667C11.5668 15.8333 12.2669 15.8333 12.8016 15.5608C13.272 15.3212 13.6545 14.9387 13.8942 14.4683C14.1667 13.9335 14.1667 13.2335 14.1667 11.8333V11.5C14.1667 10.0999 14.1667 9.3998 13.8942 8.86502C13.6545 8.39462 13.272 8.01217 12.8016 7.77248C12.2669 7.5 11.5668 7.5 10.1667 7.5H4.83333C3.4332 7.5 2.73314 7.5 2.19836 7.77248C1.72795 8.01217 1.3455 8.39462 1.10582 8.86502C0.833334 9.3998 0.833334 10.0999 0.833334 11.5V11.8333C0.833334 13.2335 0.833334 13.9335 1.10582 14.4683C1.3455 14.9387 1.72795 15.3212 2.19836 15.5608C2.73314 15.8333 3.4332 15.8333 4.83333 15.8333Z" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IcLocked = () => (
  <svg width="12" height="12" viewBox="-1 -1 17 18.67" fill="none">
    <path d="M11.6667 7.5V5C11.6667 2.69881 9.80119 0.833333 7.5 0.833333C5.19881 0.833333 3.33333 2.69881 3.33333 5V7.5M4.83333 15.8333H10.1667C11.5668 15.8333 12.2669 15.8333 12.8016 15.5608C13.272 15.3212 13.6545 14.9387 13.8942 14.4683C14.1667 13.9335 14.1667 13.2335 14.1667 11.8333V11.5C14.1667 10.0999 14.1667 9.3998 13.8942 8.86502C13.6545 8.39462 13.272 8.01217 12.8016 7.77248C12.2669 7.5 11.5668 7.5 10.1667 7.5H4.83333C3.4332 7.5 2.73314 7.5 2.19836 7.77248C1.72795 8.01217 1.3455 8.39462 1.10582 8.86502C0.833334 9.3998 0.833334 10.0999 0.833334 11.5V11.8333C0.833334 13.2335 0.833334 13.9335 1.10582 14.4683C1.3455 14.9387 1.72795 15.3212 2.19836 15.5608C2.73314 15.8333 3.4332 15.8333 4.83333 15.8333Z" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IcPersp = () => (
  <svg width="12" height="12" viewBox="-1 -1 18.67 19.47" fill="none">
    <path d="M11.6667 2.89966L11.6667 14.5663M6.66667 2.06633L6.66667 15.3997M0.833335 8.73299H15.8333M0.833335 3.72397L0.833335 13.742C0.833335 14.8787 0.833335 15.4471 1.06779 15.841C1.27336 16.1864 1.59683 16.4459 1.97862 16.5716C2.41404 16.7151 2.96885 16.5918 4.07848 16.3452L13.7451 14.197C14.4902 14.0315 14.8628 13.9487 15.1409 13.7483C15.3862 13.5716 15.5788 13.3315 15.6981 13.0537C15.8333 12.7388 15.8333 12.3571 15.8333 11.5939V5.87212C15.8333 5.10884 15.8333 4.7272 15.6981 4.41227C15.5788 4.13449 15.3862 3.89438 15.1409 3.71767C14.8628 3.51732 14.4903 3.43453 13.7451 3.26895L4.07848 1.1208C2.96885 0.874219 2.41404 0.750927 1.97862 0.894337C1.59683 1.02008 1.27336 1.27957 1.06779 1.62498C0.833335 2.01892 0.833335 2.58727 0.833335 3.72397Z" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IcIso = () => (
  <svg width="12" height="12" viewBox="1.5 3.5 17 13" fill="none">
    <path d="M7.66667 5L7.66667 15M12.3333 5L12.3333 15M17 10H3M4.16667 15H15.8333C16.4777 15 17 14.4404 17 13.75V6.25C17 5.55964 16.4777 5 15.8333 5H4.16667C3.52233 5 3 5.55964 3 6.25V13.75C3 14.4404 3.52233 15 4.16667 15Z" stroke="white" strokeWidth="1.3"/>
  </svg>
);

const NavBtn = ({ active, onClick, title, children }) => (
  <button onClick={onClick} title={title} style={{
    background: active ? 'rgba(102,97,107,0.55)' : 'rgba(102,97,107,0.25)',
    border: 'none', borderRadius: '40px',
    padding: '4px', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background 0.15s', flexShrink: 0,
    width: '20px', height: '20px', boxSizing: 'border-box',
  }}
    onMouseEnter={e => { e.currentTarget.style.background = active ? 'rgba(102,97,107,0.7)' : 'rgba(102,97,107,0.45)'; }}
    onMouseLeave={e => { e.currentTarget.style.background = active ? 'rgba(102,97,107,0.55)' : 'rgba(102,97,107,0.25)'; }}
  >{children}</button>
);

/* ── Main export ── */
const ViewpointCubeV2 = ({
  open, x, y, centered, docked, hovered, onHover, onCommit,
  projection, onToggleProjection, onFindSketch,
  verticalLocked, onToggleVerticalLock,
  threeStateRef, orbitRef,
}) => {
  const [btnTooltip, setBtnTooltip] = useState(null);  // button tooltip label
  const tooltipTimer  = useRef(null);
  const faceTooltipRef = useRef(null); // DOM ref for face tooltip — updated imperatively
  const [state, setState] = useState(DEFAULT_STATE);
  const lastFaceRef = useRef(null); // persists selected face across close/reopen

  // Flatten for CubeCanvas
  const params = flatParams(state);

  // Setters — routes to shared or current preset bucket
  const setPreset = (id) => setState(s => ({ ...s, preset: id }));
  const set = (key) => (val) => setState(s => {
    const isShared = key in SHARED_DEFAULTS;
    if (isShared) return { ...s, shared: { ...s.shared, [key]: val } };
    return { ...s, [s.preset]: { ...s[s.preset], [key]: val } };
  });
  const resetCurrent = () => setState(s => ({
    ...s,
    shared: { ...SHARED_DEFAULTS },
    [s.preset]: { ...PRESET_DEFAULTS[s.preset] },
  }));

  // Button hover helpers — delayed, hide face tooltip while button tooltip shows
  const btnEnter = (label) => {
    clearTimeout(tooltipTimer.current);
    tooltipTimer.current = setTimeout(() => {
      if (faceTooltipRef.current) faceTooltipRef.current.style.display = 'none';
      setBtnTooltip(label);
    }, 400);
  };
  const btnLeave = () => {
    clearTimeout(tooltipTimer.current);
    setBtnTooltip(null);
  };

  if (!open) return null;

  const wrapperStyle = docked
    ? { left: '16px', bottom: '90px' }
    : centered
      ? { left: '50%', bottom: '90px', transform: 'translateX(-50%)' }
      : { left: `${x - CUBE_PX / 2}px`, top: `${y - CUBE_PX / 2}px` };

  const btns = [
    { key: 'find',   node: <NavBtn onClick={() => onFindSketch?.()}   title="Find sketch"><IcFind /></NavBtn>,                                                                                      label: 'Find sketch'                       },
    { key: 'lock',   node: <NavBtn active={!!verticalLocked}          onClick={() => onToggleVerticalLock?.()} title="Vert. lock">{verticalLocked ? <IcLocked /> : <IcUnlocked />}</NavBtn>,        label: verticalLocked ? 'Vert. lock on' : 'Vert. lock off' },
    { key: 'proj',   node: <NavBtn active={projection === 'iso'}      onClick={() => onToggleProjection?.()}  title="Projection">{projection === 'iso' ? <IcIso /> : <IcPersp />}</NavBtn>,         label: projection === 'iso' ? 'Isometric' : 'Perspective'  },
  ];

  return (
    <div onPointerDown={e => e.stopPropagation()} style={{
      position: 'fixed', zIndex: 60, userSelect: 'none',
      ...wrapperStyle,
      display: 'flex', gap: '10px', alignItems: 'flex-start',
      pointerEvents: 'auto',
    }}>

      {/* Face tooltip — fixed position, updated imperatively by CubeCanvas RAF loop */}
      <div ref={faceTooltipRef} style={{
        display: 'none', position: 'fixed', zIndex: 70, pointerEvents: 'none',
        transform: 'translate(-50%, -50%)',
        fontFamily: FONT, fontSize: '9px', fontWeight: '400', color: 'rgba(0,0,0,0.6)',
        letterSpacing: '0.08em', textAlign: 'center',
        whiteSpace: 'nowrap', lineHeight: '1.4',
      }} />

      {/* Cube + buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <CubeCanvas key={`${params.subdivisions}-${params.preset}`} params={params} hovered={hovered} onHover={onHover} onCommit={onCommit} onFaceSelect={n => { lastFaceRef.current = n; }} initialFace={lastFaceRef.current} threeStateRef={threeStateRef} orbitRef={orbitRef} verticalLocked={verticalLocked} faceTooltipRef={faceTooltipRef} />

        {/* Buttons — flush against cube bottom, button tooltip floats above */}
        <div style={{ position: 'relative', marginTop: '-16px' }}>
          {btnTooltip && (
            <div style={{
              position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%',
              transform: 'translateX(-50%)',
              background: '#1a1a1b', borderRadius: '999px', padding: '4px 10px',
              fontFamily: FONT, fontSize: '12px', fontWeight: '600', color: '#ffffff',
              whiteSpace: 'nowrap', pointerEvents: 'none', letterSpacing: '0',
            }}>{btnTooltip}</div>
          )}
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            {btns.map(({ key, node, label }) => (
              <div key={key} onPointerEnter={() => btnEnter(label)} onPointerLeave={btnLeave}>
                {node}
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
};

const Section = ({ label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
    <span style={{ fontFamily: FONT, fontSize: '9px', fontWeight: '600', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</span>
    {children}
  </div>
);
const Divider = () => <div style={{ height: '1px', background: 'rgba(255,255,255,0.07)' }} />;

export default ViewpointCubeV2;
