import { useEffect, useRef } from 'react';
import * as THREE from 'three';

const MINT           = '146, 245, 181'; // #92F5B5
const TRAIL_DURATION = 0.75;   // seconds a point lives
const MIN_DIST_3D    = 0.008;  // larger gap → fewer, cleaner points
const SMOOTH_FACTOR  = 0.4;    // lerp toward real hit (0=frozen, 1=raw) — smooths jitter

// Draw a Catmull-Rom spline through pts (2D {x,y} array)
function catmullRomPath(ctx, pts) {
  if (pts.length < 2) return;
  ctx.moveTo(pts[0].x, pts[0].y);
  if (pts.length === 2) { ctx.lineTo(pts[1].x, pts[1].y); return; }
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
}

// Build the along-trail gradient (transparent tail → opaque head)
function makeGradient(ctx, tail, head, peakAlpha, len) {
  if (len < 4) {
    const g = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 20);
    g.addColorStop(0, `rgba(${MINT}, ${peakAlpha})`);
    g.addColorStop(1, `rgba(${MINT}, 0)`);
    return g;
  }
  const g = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
  // Ease-in cubic so the first ~30% of the trail is almost invisible
  g.addColorStop(0,    `rgba(${MINT}, 0)`);
  g.addColorStop(0.15, `rgba(${MINT}, 0)`);
  g.addColorStop(0.45, `rgba(${MINT}, ${(peakAlpha * 0.35).toFixed(3)})`);
  g.addColorStop(0.75, `rgba(${MINT}, ${(peakAlpha * 0.75).toFixed(3)})`);
  g.addColorStop(1,    `rgba(${MINT}, ${peakAlpha})`);
  return g;
}

export default function LaserTrail({ active, meshesRef, threeStateRef }) {
  const canvasRef   = useRef();
  const trailRef    = useRef([]);
  const mouseNDC    = useRef({ x: 0, y: 0 });
  const smoothedPos = useRef(null); // exponentially smoothed 3D hit position
  const rafRef      = useRef();
  const rcRef       = useRef(new THREE.Raycaster());

  useEffect(() => {
    if (!active) {
      trailRef.current = [];
      smoothedPos.current = null;
      const c = canvasRef.current;
      if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
      return;
    }

    const onMove = (e) => {
      const renderer = threeStateRef.current?.gl;
      if (!renderer) return;
      const rect = renderer.domElement.getBoundingClientRect();
      mouseNDC.current.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
      mouseNDC.current.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    };
    window.addEventListener('pointermove', onMove);

    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      const now = performance.now() / 1000;

      // Raycast
      const camera = threeStateRef.current?.camera;
      const meshes = meshesRef?.current || [];
      if (camera && meshes.length) {
        rcRef.current.setFromCamera(mouseNDC.current, camera);
        const hits = rcRef.current.intersectObjects(meshes, false);
        if (hits.length > 0) {
          const raw = hits[0].point;
          // Smooth position: lerp toward raw hit to remove micro-jitter
          if (!smoothedPos.current) {
            smoothedPos.current = raw.clone();
          } else {
            smoothedPos.current.lerp(raw, SMOOTH_FACTOR);
          }
          const sp = smoothedPos.current;
          const trail = trailRef.current;
          const last  = trail[trail.length - 1];
          const dist  = last ? sp.distanceTo(new THREE.Vector3(last.wx, last.wy, last.wz)) : Infinity;
          if (dist > MIN_DIST_3D) {
            trail.push({ wx: sp.x, wy: sp.y, wz: sp.z, t: now });
          }
        } else {
          // Cursor left the model — let the smoothed pos reset next time
          smoothedPos.current = null;
        }
      }

      // Age out
      trailRef.current = trailRef.current.filter(pt => now - pt.t < TRAIL_DURATION);

      // Resize canvas if needed
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
      }
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const renderer = threeStateRef.current?.gl;
      const cam = threeStateRef.current?.camera;
      if (!renderer || !cam || trailRef.current.length < 2) return;

      // Project world → 2D screen coords
      const rect = renderer.domElement.getBoundingClientRect();
      const v = new THREE.Vector3();
      const screen = trailRef.current.map(pt => {
        v.set(pt.wx, pt.wy, pt.wz).project(cam);
        return {
          x: (v.x  + 1) / 2 * rect.width,
          y: (-v.y + 1) / 2 * rect.height,
        };
      });

      const tail = screen[0];
      const head = screen[screen.length - 1];
      const dx = head.x - tail.x, dy = head.y - tail.y;
      const len = Math.sqrt(dx * dx + dy * dy);

      // ── Draw: shadow-blur on a thin core gives naturally smooth cross-section ──
      // Pass 1 — wide soft halo (canvas shadowBlur handles the Gaussian falloff)
      ctx.save();
      ctx.strokeStyle   = makeGradient(ctx, tail, head, 0.55, len);
      ctx.lineWidth     = 9;
      ctx.lineCap       = 'round';
      ctx.lineJoin      = 'round';
      ctx.shadowColor   = `rgba(${MINT}, 1)`;
      ctx.shadowBlur    = 26;
      ctx.beginPath();
      catmullRomPath(ctx, screen);
      ctx.stroke();
      ctx.restore();

      // Pass 2 — second shadow pass for extra width smoothness
      ctx.save();
      ctx.strokeStyle   = makeGradient(ctx, tail, head, 0.35, len);
      ctx.lineWidth     = 5;
      ctx.lineCap       = 'round';
      ctx.lineJoin      = 'round';
      ctx.shadowColor   = `rgba(${MINT}, 0.8)`;
      ctx.shadowBlur    = 12;
      ctx.beginPath();
      catmullRomPath(ctx, screen);
      ctx.stroke();
      ctx.restore();

      // Pass 3 — bright thin core, no shadow
      ctx.save();
      ctx.strokeStyle   = makeGradient(ctx, tail, head, 0.85, len);
      ctx.lineWidth     = 2.5;
      ctx.lineCap       = 'round';
      ctx.lineJoin      = 'round';
      ctx.beginPath();
      catmullRomPath(ctx, screen);
      ctx.stroke();
      ctx.restore();
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, [active, meshesRef, threeStateRef]);

  return (
    <canvas
      ref={canvasRef}
      width={window.innerWidth}
      height={window.innerHeight}
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 59 }}
    />
  );
}
