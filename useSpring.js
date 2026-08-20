import { useEffect, useRef, useState } from 'react';

// Critically-damped exponential follow — smooth pull, no bounce, no overshoot.
// `speed` is in roughly "units per frame" toward target; 0.18 is a calm magnetic pull,
// 0.30 is a snappier pull. There is no oscillation regardless of speed.
export const useSpring = (initial, { speed = 0.2 } = {}) => {
  const initArr = Array.isArray(initial) ? [...initial] : [initial];
  const wasArr = Array.isArray(initial);

  const targetRef = useRef([...initArr]);
  const valRef = useRef([...initArr]);
  const [val, setVal] = useState(wasArr ? [...initArr] : initArr[0]);
  const rafRef = useRef(null);
  const runningRef = useRef(false);

  const tick = () => {
    let active = false;
    for (let i = 0; i < valRef.current.length; i++) {
      const d = targetRef.current[i] - valRef.current[i];
      // Exponential approach — critically damped, never overshoots.
      valRef.current[i] += d * speed;
      if (Math.abs(d) > 0.0008) active = true;
      else valRef.current[i] = targetRef.current[i];
    }
    setVal(wasArr ? [...valRef.current] : valRef.current[0]);
    if (active) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      runningRef.current = false;
    }
  };

  const setTarget = (next) => {
    targetRef.current = Array.isArray(next) ? [...next] : [next];
    if (!runningRef.current) {
      runningRef.current = true;
      rafRef.current = requestAnimationFrame(tick);
    }
  };

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  return [val, setTarget];
};
