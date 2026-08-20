export const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth < 768;

export const UI = {
  bg: '#ececee',
  bgPanel: '#ffffff',
  bgRow: 'rgba(0,0,0,0.03)',
  bgHover: 'rgba(0,0,0,0.05)',
  border: 'rgba(0,0,0,0.08)',
  borderAccent: 'rgba(108,92,231,0.25)',
  gold: '#6c5ce7',
  goldDim: 'rgba(108,92,231,0.5)',
  goldFaint: 'rgba(108,92,231,0.06)',
  text: '#1c1c1e',
  textMid: '#636366',
  textDim: '#aeaeb2',
  red: '#e5484d',
  font: "'DM Sans', sans-serif",
  mono: "'DM Mono', monospace",
  barBg: '#ffffff',
  barBorder: 'rgba(0,0,0,0.08)',
  barText: '#1c1c1e',
  barTextDim: '#aeaeb2',
  purple: '#6c5ce7',
  purpleLight: '#a29bfe',
  purpleDim: 'rgba(108,92,231,0.3)',
  glass: 'rgba(255,255,255,0.96)',
  glassBorder: 'rgba(0,0,0,0.08)',
  glassBlur: 'blur(20px)',
  panelShadow: '0 8px 40px rgba(0,0,0,0.12), 0 2px 12px rgba(0,0,0,0.07)',
  radius: '18px',
  unreadRowBg: 'rgba(214, 156, 45, 0.07)',
  unreadAccent: 'rgba(200, 130, 32, 0.85)',
  unreadBadgeBg: 'rgba(214, 156, 45, 0.18)',
};

export const DEFAULT_SCENE = {
  ambientIntensity: 0.4, sunIntensity: 2.0, sunColor: '#fff5e0', bounceIntensity: 0.8,
  envPreset: 'studio', bgColor: '#c7c7c7', fogColor: '#c7c7c7', fogNear: 7.5, fogFar: 18,
  floorColor: '#808080', floorRoughness: 0.7, floorMetalness: 0.0, tonemapping: 0.8, autoRotateSpeed: 0.6,
};

export const DEFAULT_CAMERA = { position: [3, 2.5, 4], target: [0, 1.0, 0] };
export const AXIS_COLORS = { x: '#e05a5a', y: '#6abf7b', z: '#5b8fe0' };

export const SEEN_PINS_STORAGE_KEY = '3d-viewer-seen-pin-ids';
export const TOOLTIPS_STORAGE_KEY = '3d-viewer-tooltips';
export const REDLINES_STORAGE_KEY = '3d-viewer-redlines';
