import { useRef } from 'react';
import * as THREE from 'three';

export const useCameraFlyTo = (orbitRef) => {
  const animRef = useRef(null);

  const flyTo = (position, target, duration = 1000) => {
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
