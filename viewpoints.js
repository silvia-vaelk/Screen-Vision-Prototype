const t = [0, 1.0, 0];
const d = 4.5;
const tTop = [0, 0.5, 0];

// Each viewpoint also maps to a face of the navigation cube.
// `up` is the camera up-vector used by lookAt; top/bottom views switch to Z-axis up
// to avoid gimbal lock when the look direction is parallel to the default (0,1,0).
export const VIEWPOINTS = [
  { key: '1', id: 'right',  label: 'Right',  pos: [d, t[1], 0],     tgt: t,    cubeFace: 'right',  up: [0, 1, 0]  },
  { key: '2', id: 'front',  label: 'Front',  pos: [0, t[1], d],     tgt: t,    cubeFace: 'front',  up: [0, 1, 0]  },
  { key: '3', id: 'bottom', label: 'Bottom', pos: [0, t[1] - d, 0], tgt: tTop, cubeFace: 'bottom', up: [0, 0, 1]  },
  { key: '4', id: 'back',   label: 'Back',   pos: [0, t[1], -d],    tgt: t,    cubeFace: 'back',   up: [0, 1, 0]  },
  { key: '5', id: 'left',   label: 'Left',   pos: [-d, t[1], 0],    tgt: t,    cubeFace: 'left',   up: [0, 1, 0]  },
  { key: '6', id: 'top',    label: 'Top',    pos: [0, t[1] + d, 0], tgt: tTop, cubeFace: 'top',    up: [0, 0, -1] },
];

// Selection is the default active mode.
export const MODES = [
  { id: 'position',      label: 'Position',      icon: '/icons/Icon1.svg' },
  { id: 'measurement',   label: 'Measurement',   icon: '/icons/Icon2.svg' },
  { id: 'selection',     label: 'Selection',     icon: '/icons/Icon3.svg' },
  { id: 'sections',      label: 'Sections',      icon: '/icons/Icon4.svg' },
  { id: 'camera',        label: 'Camera',        icon: '/icons/Icon5.svg' },
  { id: 'comments',      label: 'Comments',      icon: '/icons/Icon6.png', iconScale: 0.56 },
  { id: 'notifications', label: 'Notifications', icon: '/icons/Icon7.png', iconScale: 0.60 },
];
export const DEFAULT_MODE = 'selection';

// Per-role toolbelt tools shown when pressing S
export const MODES_BY_ROLE = {
  view: [
    { id: 'selection', label: 'Selection',     icon: '/icons/tool-selection.png', iconSelected: '/icons/tool-selection-selected.png', iconHover: '/icons/tool-selection-hover.png' },
    { id: 'laser',     label: 'Laser pointer', icon: '/icons/tool-laser.png',     iconSelected: '/icons/tool-laser-selected.png',     iconHover: '/icons/tool-laser-hover.png' },
  ],
  review: [
    { id: 'position',      label: 'Position',      icon: '/icons/Icon1.svg' },
    { id: 'measurement',   label: 'Measurement',   icon: '/icons/Icon2.svg' },
    { id: 'selection',     label: 'Selection',     icon: '/icons/tool-selection.png', iconSelected: '/icons/tool-selection-selected.png', iconHover: '/icons/tool-selection-hover.png' },
    { id: 'laser',         label: 'Laser pointer', icon: '/icons/tool-laser.png',     iconSelected: '/icons/tool-laser-selected.png',     iconHover: '/icons/tool-laser-hover.png' },
    { id: 'sections',      label: 'Sections',      icon: '/icons/Icon4.svg' },
    { id: 'camera',        label: 'Camera',        icon: '/icons/Icon5.svg' },
    { id: 'comments',      label: 'Comments',      icon: '/icons/Icon6.png', iconScale: 0.56 },
    { id: 'notifications', label: 'Notifications', icon: '/icons/Icon7.png', iconScale: 0.60 },
  ],
  create: [
    { id: 'position',      label: 'Position',      icon: '/icons/Icon1.svg' },
    { id: 'measurement',   label: 'Measurement',   icon: '/icons/Icon2.svg' },
    { id: 'selection',     label: 'Selection',     icon: '/icons/tool-selection.png', iconSelected: '/icons/tool-selection-selected.png', iconHover: '/icons/tool-selection-hover.png' },
    { id: 'laser',         label: 'Laser pointer', icon: '/icons/tool-laser.png',     iconSelected: '/icons/tool-laser-selected.png',     iconHover: '/icons/tool-laser-hover.png' },
    { id: 'sections',      label: 'Sections',      icon: '/icons/Icon4.svg' },
    { id: 'camera',        label: 'Camera',        icon: '/icons/Icon5.svg' },
    { id: 'comments',      label: 'Comments',      icon: '/icons/Icon6.png', iconScale: 0.56 },
    { id: 'notifications', label: 'Notifications', icon: '/icons/Icon7.png', iconScale: 0.60 },
  ],
};
export const DEFAULT_MODE_BY_ROLE = { view: 'selection', review: 'selection', create: 'selection' };

// Cinematic camera angles for Tab presentation mode (cycles automatically).
export const PRESENTATION_VIEWS = [
  { pos: [3.2, 2.6, 3.2],   tgt: [0, 1.0, 0], up: [0,  1,  0] }, // front 3/4 hero
  { pos: [4.8, 1.0, -0.5],  tgt: [0, 0.8, 0], up: [0,  1,  0] }, // low side profile
  { pos: [-2.2, 2.2, -3.8], tgt: [0, 1.0, 0], up: [0,  1,  0] }, // back 3/4
  { pos: [0.5, 5.5, 2.5],   tgt: [0, 0.5, 0], up: [0,  0, -1] }, // overhead
];
export const PRES_INTERVAL = 3500; // ms per view before auto-advancing
