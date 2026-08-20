# 3D Viewer – Reference Documentation

## Project Overview

A React-based 3D shoe viewer with real-time collaborative annotation capabilities. Supports FBX model loading, multi-mode interaction (View, Comments/Pins, Annotations/Redlines), camera control, and persistent design notes.

**Tech Stack:**
- React 18 with hooks (`useState`, `useEffect`, `useCallback`, `useMemo`, `useRef`)
- Three.js + `@react-three/fiber` + `@react-three/drei`
- Vite (build) + npm

---

## Architecture

### High-Level Flow

```
App (state & modes)
  ├─ Canvas (3D scene)
  │  ├─ ShoeModel (FBX + mesh collection)
  │  ├─ ViewModeCursor (rotate/pan cursors in view mode)
  │  ├─ CommentsModeCursor (pen raycasting in comments mode)
  │  ├─ RedlineStrokes3D (committed 3D annotation strokes)
  │  ├─ LiveRedlineStroke (in-progress stroke)
  │  └─ TooltipPins (comment pins + halos)
  │
  ├─ RedlineCanvasOverlay (2D pointer layer for annotations)
  │  ├─ Cursor hover (pen-filled / pen-outline)
  │  ├─ Drawing logic (EMA + Catmull-Rom smoothing)
  │  ├─ Lasso auto-close (visual indicator)
  │  └─ Wheel forwarding (zoom support)
  │
  ├─ UI Panels
  │  ├─ SavedTooltipsPanel (pins/comments)
  │  ├─ SceneSettingsPanel (lighting, fog, tone mapping)
  │  ├─ AddTooltipPanel (new pin creation in edit mode)
  │  ├─ BottomToolbar (always-open: Select/Pen/Comment/Camera + Undo/Redo)
  │  ├─ NavCube (camera preset faces)
  │  └─ Redline-specific UI
  │
  └─ Top bar (logo, file ops, settings)
```

### Three.js Layers

- **Shoe geometry**: FBX-loaded meshes, used for raycasting and depth testing
- **RedlineStrokes3D**: Committed 3D `<Line>` objects (depth-tested, occluded by geometry)
- **LiveRedlineStroke**: In-progress `<Line>` (same 3D pipeline)
- **TooltipPins**: `<Html occlude>` for comment pins (dynamically hidden behind model)
- **Environment**: Studio HDRI, lights, shadows, fog, tone mapping

---

## Key Concepts

### Tools (always-open bottom toolbar — no roles, no toolbelt)

The old Viewing/Reviewing/Creating **role** system and the radial **toolbelt**
(`ModeBar`) are gone. A single always-open `BottomToolbar.jsx` (dark pill,
bottom-center) selects the active tool; every button routes through the same
centralized `select*` handlers in `App.jsx` that the hotkeys call — one state
path, no duplication. All tools are always available.

| Tool (group) | Active when | Drives | Variants (chevron) |
|--------------|-------------|--------|--------------------|
| **Select** | `!annotationMode && !cameraTool` | navigate/select | Navigation · Laser (`activeMode='laser'`) |
| **Pen** | `annotationMode && (activeTool==='pen'\|\|'pencil')` | `RedlineCanvasOverlay` / `PenToolOverlay` | Pen · Pencil |
| **Comment** | `annotationMode && activeTool==='comment'` | `CommentsModeCursor`, pins | Comment (`commentMode='default'`) · Callout (`'callout'`) |
| **Camera** | `cameraTool` (UI-only flag) | screenshot popover (no capture engine yet) | Camera · Section tool (TODO) |
| **Undo / Redo** | always (dim when empty) | `actionHistory` / `undoStack` | — |

Derived booleans still used by the Canvas: `editMode = annotationMode &&
activeTool==='comment'`, `redlineMode = annotationMode && activeTool==='pencil'`,
`penMode = annotationMode && activeTool==='pen'`.

Pen/Comment show a **contextual popover** above the bar (color row; Pen also has
a size/opacity slider); each tool's **chevron** opens its variant dropdown.
Top-left `Layers` / `Scene` buttons toggle their panels; `LayersDrawer.jsx` is
the reskinned dark panel with lock/eye/locate row actions (eye toggles real mesh
visibility; lock/locate are visual TODOs).

### Tool hotkeys (rebound for the redesign)

`V` Navigation · `L` Laser · `⇧P` Pen · `P` Pencil · `C` Comment · `⇧C` Callout ·
`S` Camera · `⇧S` Section. Camera/scene-navigation keys are unchanged (number
keys = viewpoints, `F` frame, `Home`/`⇧1` reset, `Enter` turntable, `Shift` pan
modifier, `Esc` cancel, `Del`/`Backspace` delete, `⌘/Ctrl+⇧E` find sketch,
`⌘Z`/`⌘⇧Z` undo/redo, `T` text, `E` emoji, `⇧T` render-above). The old
`⇧V/⇧R/⇧C` role bindings and the `L`/`S` panel-toggle keys were removed.

### UI Design Tokens (`UI` constant)

```js
const UI = {
  bg: '#ececee',           // light gray background
  bgPanel: '#ffffff',      // white panel interiors
  gold: '#6c5ce7',         // primary purple accent
  text: '#1c1c1e',         // dark text
  textMid: '#636366',      // secondary text
  textDim: '#aeaeb2',      // tertiary text
  red: '#e5484d',          // error/delete color
  font: "'DM Sans', sans-serif",
  mono: "'DM Mono', monospace",
  glass: 'rgba(255,255,255,0.96)',
  panelShadow: '0 8px 40px rgba(0,0,0,0.12), 0 2px 12px rgba(0,0,0,0.07)',
  radius: '18px',
};
```

### Raycasting & Hit Detection

**Comments mode:** `CommentsModeCursor` raycasts on every `pointermove` to show pen-filled cursor when hovering over geometry.

**Annotations mode:** `RedlineCanvasOverlay.getShoeHit()` raycasts to:
- Detect surface hits for drawing start
- Apply surface normal offset (prevent Z-fighting)
- Return 3D world position (raycasted point)

**Stroke selection:** `RedlineCanvasOverlay.findNearestStroke()` uses 2D screen-space distance to find clickable strokes (~16px radius).

---

## File Structure

### Single File: `/App.jsx`

**Sections (grep-able):**
```
Lines 1–100        : Imports, UI constants, cursor SVGs
Lines 100–200      : FBX drop zone
Lines 200–500      : FBX loading, shoe model, nav cube
Lines 500–1000     : Pins, comments, scene settings panels
Lines 1000–1400    : Redline UI components (strokes, popups, toolbar)
Lines 1400–1800    : RedlineCanvasOverlay (drawing logic, smoothing, lasso)
Lines 1800–2200    : View/Comments/Annotations interaction (cursors, modes)
Lines 2200–2700    : Main App component (state, Canvas setup)
```

---

## Cursors

All cursor SVGs use data URI with hot-spot coordinates:

```js
const svgDataCursor = (body, hotX, hotY) =>
  `url("data:image/svg+xml,${encodeURIComponent(...)}") ${hotX} ${hotY}, crosshair`;
```

**Available:**
- `CURSOR_COMMENT_ON_MODEL` : Purple filled disc (on geometry in comments mode)
- `CURSOR_COMMENT_IDLE` : Purple outline disc (miss in comments mode)
- `CURSOR_ANNOTATE_ON_MODEL` : Purple filled pencil (on geometry in annotations)
- `CURSOR_ANNOTATE_IDLE` : Purple outline pencil (miss in annotations)
- `CURSOR_ORBIT_ROTATE` : Arc + arrow (left-button drag)
- `CURSOR_ORBIT_PAN` : Four-way arrows (right-button drag)

---

## Drawing & Smoothing (Annotations)

### EMA (Exponential Moving Average)
Applied to raw hit points to dampen surface-normal jitter:
```js
const alpha = precision ? 0.28 : 0.45;  // precision mode: stronger smoothing
const smoothed = {
  x: last.x + (raw.x - last.x) * alpha,
  y: last.y + (raw.y - last.y) * alpha,
  z: last.z + (raw.z - last.z) * alpha,
};
```

### Live Display (Catmull-Rom)
In-progress stroke is passed through a Catmull-Rom spline (up to 90 samples) for smooth curve visualization while drawing.

### Final Commit (Catmull-Rom)
At `onUp`, apply Catmull-Rom with 2× density (up to 300 samples) for a buttery final curve.

### Lasso Auto-Close
- Track first 3D local point and first screen position (`firstScreenRef`, `firstLocalRef`)
- On `onMove`, show pulsing start indicator when within 32px
- On `onUp`, if within 32px, append first point to close path
- Catmull-Rom uses `closed: true` parameter for seamless closure

### Precision Mode
Activated via **Shift** key:
- EMA alpha: 0.28 (even stronger smoothing)
- Sample threshold: 1.4px (tighter point collection)
- Displays "PRECISION MODE" pill at bottom of screen

---

## Interaction Model

Tools are selected from the always-open `BottomToolbar` (or the rebound hotkeys
above). "Select" = the View/orbit state; "Comment" and "Pen/Pencil" enter
annotation mode. There is no role gating — every tool is always available.

### Select / View (Plain Orbit)
- Left-drag: rotate (arc cursor)
- Right-drag: pan (four-way cursor)
- Scroll: zoom
- Hover over stroke in comments: show pointer

### Comments Mode (Pin Creation/Editing)
- Click on geometry: create pin (marker placed on surface)
- Hover over geometry: pen-filled cursor
- Hover over empty space: pen-outline cursor
- Scroll: zoom
- Can drag/rename/delete pins via SavedTooltipsPanel

### Annotations Mode (Redline Drawing)
- Left-drag on geometry: draw stroke with EMA + live Catmull-Rom
- Left-click on empty space: rotate (orbit locked, no drawing)
- Right-click anywhere: pan (orbit locked, no drawing)
- Hover: pen cursor (filled if on geometry, outline if off)
- Scroll: zoom
- Lasso: draw closed path when endpoint approaches start point (< 32px)
- Shift: activate precision mode (stronger smoothing)
- Click on existing stroke: select + show detail popup (draggable)

**State Protection:** When rotate/pan drag starts, canvas has `pointerEvents: none` so all subsequent `pointermove`/`pointerup` go to Three.js canvas (orbit controls). Drawing is impossible during orbit drag.

---

## Comments (Pins) System

### Data Structure
```js
{
  id: unique,
  label: "Title",           // editable
  description: "Text...",   // editable
  x, y, z: position,        // 3D world coordinates
  hasCamera: bool,
  cameraView: { pos, target },
  author: "User name",
  created: timestamp,
  comment: "Pin comment",   // editable
}
```

### UI
- **SavedTooltipsPanel**: List of all pins with expand/collapse, edit fields
- **TooltipPins**: Floating halos near model surface (with expand arrows, delete buttons)
- **ExpandedEditor**: Inline editor for label/description/position/camera
- Pins are stored in state, persisted via `localStorage`

---

## Redlines (Annotations) System

### Data Structure
```js
{
  id: unique,
  name: "Stroke 1",
  points3D: [ { x, y, z }, ... ],  // local coordinates (relative to model)
  color: "#e5484d",                 // RGB hex
  width: 2,                         // relative pen width
  opacity: 0.92,
  visible: true,
  comment: "Annotation note",
  created: timestamp,
}
```

### 3D Rendering
- **Committed**: `RedlineStrokes3D` component renders via `<Line>` (depth-tested)
- **Live**: `LiveRedlineStroke` component renders in-progress stroke
- Both positioned in local space, offset by `modelPosition`
- Selected stroke shows glow halo (white, semi-transparent)

### Selection & Editing
- Click stroke in view mode → shows `StrokeDetailPopup` (draggable, shows name + comment)
- Edit icon → opens detail popup
- Comment input expands inline below stroke name

---

## Scene Settings

Editable in `editMode` via `SceneSettingsPanel`:

```js
{
  ambientIntensity: 0.4,
  sunIntensity: 2.0,
  sunColor: '#fff5e0',
  bounceIntensity: 0.8,
  envPreset: 'studio',
  bgColor: '#c7c7c7',       // canvas background
  fogColor: '#c7c7c7',
  fogNear: 7.5,
  fogFar: 18,
  floorColor: '#808080',
  floorRoughness: 0.7,
  floorMetalness: 0.0,
  tonemapping: 0.8,         // ACESFilmic exposure
  autoRotateSpeed: 0.6,
}
```

---

## Build & Deployment

```bash
npm install
npm run dev              # Vite dev server (localhost:5173 by default)
npm run build           # Builds to /dist
```

**Build command from shell:**
```bash
npx vite build
```

---

## Common Tasks

### Adding a Feature
1. Determine which mode it belongs to (View / Comments / Annotations)
2. Add state at App level if needed (e.g., `[showX, setShowX]`)
3. Add UI component if needed (in JSX)
4. Add event handler/logic in relevant effect hook
5. Build & test: `npm run build`

### Modifying Drawing Behavior
- EMA smoothing: adjust `alpha` value in `onMove`
- Live display curve: adjust `samples` in Catmull-Rom call
- Lasso threshold: change `32` in distance checks
- Precision mode: tweak `precisionRef`, `threshold`, `alpha`

### Adjusting UI Colors
- Edit `UI` constant at top of file
- Colors are CSS hex or rgba strings
- Update both light mode and dark mode if applicable

### Adding Cursor Icons
1. Create SVG polygon/path in `svgDataCursor` helper
2. Set hot-spot coordinates (tip of pen/arc, etc.)
3. Add constant at top (e.g., `CURSOR_MY_ICON`)
4. Use in cursor effect: `canvas.style.cursor = CURSOR_MY_ICON`

---

## Recent Improvements (Session Summary)

**UI/UX Polish:**
- Tab + panel drawer merge with fixed positioning
- NavCube: hover-only labels, white faces, inner glow
- TopBar: transparent until hover
- ModeToggle: layout reorder, visible styling

**Redline Refactor:**
- Live Catmull-Rom smoothing (buttery curves while drawing)
- EMA + Catmull-Rom at commit (2-pass smoothing)
- Precision mode (Shift key, stronger smoothing)
- 3D `<Line>` for live stroke (depth-tested, occluded correctly)
- Removed 2D canvas repaint loop

**Annotations Navigation (Latest):**
- Pen cursor (filled on model, outline off)
- Left-click + hit → draw
- Left-click + miss → rotate (passthrough)
- Right-click → pan (passthrough)
- State protection: orbit-locked prevents drawing

**Drawing Enhancements (Latest):**
- Smoother live drawing via live Catmull-Rom
- Lasso auto-close (draw closed paths, snap at ~32px)
- Visual start indicator (pulsing dot, highlights when close)

**View & Annotation Zoom:**
- ViewModeCursor: rotate/pan icons in view mode
- Wheel forwarding: scroll to zoom in annotations mode

---

## Tips for Claude Code Sessions

1. **Find code by grep**: Cursor constants around line 75, `CommentsModeCursor` at 1310, `RedlineCanvasOverlay` at 1430
2. **Search by keyword**: `onDown`, `onMove`, `onUp` (drawing handlers); `findNearestStroke` (selection); `Catmull` (smoothing)
3. **Common edits**: EMA alpha, curve samples, threshold distances, UI colors
4. **Testing**: Load FBX (e.g., shoe model), toggle modes, test drawing/selection/zoom
5. **Performance**: Main bottleneck is Catmull-Rom on high-point-count strokes; samples are capped at 300

---

## Known Limitations / Future Work

- Single FBX file only (no multi-model support)
- No undo/redo
- No persistent storage (localStorage for pins only, no redlines saved)
- No collaboration/sync
- No multi-user awareness
- Bundle size: ~1.2MB (mostly Three.js)

