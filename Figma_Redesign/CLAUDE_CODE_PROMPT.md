# Prompt for Claude Code — Bottom-center navigation redesign

> Paste everything below the line into Claude Code, run from the project root
> (`ScreenApp_Transition_v1/`). Assets and the full spec are in `./Figma_Redesign/`.

---

## Task

Redesign the **interface only** of this 3D shoe viewer to match the new Figma design. **Do not change any application logic, drawing/annotation behavior, camera controls, or keyboard hotkeys** (one explicit exception below). This is a UI/chrome swap: replace the mode-switching UI with a single always-open bottom-center tool bar, and reskin the Layers panel.

Read `Figma_Redesign/DESIGN_SPEC.md` and the icons in `Figma_Redesign/icons/` first. Open `Figma_Redesign/icons-preview.html` to see the target look.

## Hard constraints

1. **Hotkeys — keep all camera/navigation keys; rebind the tool-selection keys to match the Figma design.** The new bottom-nav buttons and chevron menu items must route through the **same state setters** these keys use — one state path, no duplication.
   - **KEEP unchanged (camera & scene navigation):** number keys = viewpoints, `F` = frame model, `Home`/`Shift+1` = reset camera, `Enter` = turntable, `Shift` (hold) = pan modifier + slow zoom, middle-click = context menu, `Esc` = cancel/close, `Delete`/`Backspace` = delete selection, `Cmd/Ctrl+Shift+E` = find my sketch, `Cmd+A`. Also leave `T` (text), `E` (emoji), `Shift+T` (render-above) as-is — those tools aren't in the new bottom nav but their handlers don't conflict.
   - **REBIND tool-selection keys** (the unified shortcut effect, ~`App.jsx:6042–6117`) to:

     | Key | Selects | Was |
     |-----|---------|-----|
     | `V` | Navigation tool (cursor; exit annotation) | `V` = toggle visibility → **dropped** |
     | `L` | Laser pointer | `Shift+L` |
     | `Shift+P` | Pen | `P` |
     | `P` | Pencil | `B` |
     | `C` | Comment (bubble; `commentMode='default'`) | `C` (same key) |
     | `Shift+C` | Callout (leader pin; `commentMode='callout'`) | role 'create' → removed |
     | `S` | Camera tool | `S` = toolbelt open → removed |
     | `Shift+S` | Section tool | — |

   - **REMOVE these bindings** (role system is gone): `Shift+V` (role view), `Shift+R` (role review), old `Shift+C` (role create). `B` (old pencil) is freed — leave it unbound.
2. **No behavior changes.** Don't touch raycasting, EMA/Catmull-Rom smoothing, lasso, stroke commit, pin creation, undo/redo logic, OrbitControls, fly-to, etc. Only how the UI looks and which existing setter a click calls.
3. **No new dependencies.** Use inline SVG (the repo already does this) or the `Figma_Redesign/icons/`. `lucide-react@0.383` is already available if preferred — the spec lists the equivalent name per icon.
4. Keep it in the existing single-file-ish structure; new UI can be small sibling components like the current `BottomNavBar.jsx` / `LayersDrawer.jsx`.

## What to REMOVE (the old mode system)

- `InSceneModeSwitcher.jsx` (Viewing/Reviewing/Creating pill) — remove from render.
- `ModeBar.jsx` (full-screen radial toolbelt) — remove from render and its open/hover state (`modePopup`, `modeHover`, `sHeldRef`, `sClickedRef`, the `S`-key toolbelt trigger).
- `BottomLeftBar` component inside `App.jsx` (~`App.jsx:2201`) — the role dropdown + toolbelt toggle.
- `ModeToggle` component (~`App.jsx:2483`) if still rendered.
- The **role system**: `userRole` / `setUserRole` / `userRoleRef` (`App.jsx:5603`), `MODES_BY_ROLE`/`MODES` usage for the toolbelt, and the `Shift+V/R/C` bindings. Remove role-gating such as `userRole !== 'view'` guards (e.g. `App.jsx:6088`, `App.jsx:6928`) — after removal, all tools are always available.
- Old `BottomNavBar.jsx` (Gravity/Sketch wordmarks) — replace with the new tool bar (or keep wordmarks elsewhere if you prefer; they are not in the new bottom-nav design).

Grep to confirm you caught all references before deleting state. The build must stay green: `npx vite build`.

## What to BUILD

### A. Always-open bottom-center tool bar  (new component, e.g. `BottomToolbar.jsx`)
Dark pill, fixed bottom-center (~24px up), always visible. Items: **Select · Pen · Comment · Camera · | · Undo · Redo**, each tool with a small dropdown chevron. Exact dimensions/colors in `DESIGN_SPEC.md §2`. Reuse the `#6c5ce7` accent already in `UI.gold`.

Wire each tool to the EXISTING state (`App.jsx:5566` `activeTool`, `5563` `annotationMode`, `5579` `commentMode`):

| Button | Active when | onClick (use existing setters) |
|--------|-------------|-------------------------------|
| **Select** | `!annotationMode` (or `activeTool==='cursor'`) | `setAnnotationMode(false); setActiveTool('cursor'); setClickPoint(null)` — same as exiting annotation mode today |
| **Pen** (drawing group) | `annotationMode && (activeTool==='pen' \|\| activeTool==='pencil')` | `setAnnotationMode(true); setActiveTool(<last drawing variant>); setAutoRotate(false)`. The chevron switches Pen↔Pencil (see "Tool-group chevron menus" below) — **keep both code tools.** |
| **Comment** | `annotationMode && activeTool==='comment'` | mirror the `C` hotkey block (`App.jsx:6086`): `setActiveMode('comments'); setAnnotationMode(true); setActiveTool('comment'); setAutoRotate(false); setActiveFlyId(null); setExpandedPinId(null); setPanelOpen(true)` — **minus** the `userRole==='view'` guard. Chevron switches Comment(bubble)↔Callout(leader) via `setCommentMode('default'\|'callout')`. |
| **Camera** | camera tool active | set a small new `cameraTool` UI flag for the popover only (see C). **UI only — no capture engine.** Chevron switches Camera↔Section tool. |
| **Undo / Redo** | always | call the existing undo/redo path (`undoStack` / `actionHistory`, `App.jsx:5586–5587`); if no single handler exists, wire to whatever the current undo entrypoint is. Dim when the stack is empty. |

### B. Contextual options popover (floats above the active tool)
Same dark pill, ~10–12px above the bar, centered over the active tool. Render per `DESIGN_SPEC.md §3`:
- **Pen:** color row (5 swatches) + size/opacity slider with numeric readout. Bind to existing `pencilColor`/`setPencilColor` (or `redlineColor`) and `strokeOpacity`/`redlineWidth` (`App.jsx:5574–5578`). The swatch hexes are in the spec — the dark/selected swatch = the current `#1C1C1E` default.
- **Comment:** color row only → bind to the comment/pin color (`redlineColor`).
- **Camera:** grid toggle, white shutter button, crop/focus toggle (`cam-grid/-shutter/-crop.svg`). Buttons are visual; wire the shutter to existing screenshot logic **if one already exists in the repo** (grep for screenshot/capture/toDataURL), otherwise leave a clearly-marked `// TODO: capture` and a no-op. Grid/crop toggles flip local UI state only.
- **Select:** no popover.

### B2. Tool-group chevron menus  (see `DESIGN_SPEC.md §3b`)
Each of the four tools is a **group**: the chevron next to it opens a small dark dropdown of variants, anchored above that tool. The main button shows the active variant's icon. Picking a variant switches it and closes the menu.

| Chevron menu | Variants → existing setter |
|--------------|----------------------------|
| **Navigation** | Navigation → `setAnnotationMode(false); setActiveTool('cursor')` · Laser pointer → `setActiveMode('laser')` (already exists) |
| **Pen** | Pen → `setActiveTool('pen')` · Pencil → `setActiveTool('pencil')` (both already exist) |
| **Comment** | Comment → `setCommentMode('default')` · Callout → `setCommentMode('callout')` (both already exist) |
| **Camera** | Camera → camera UI flag · Section tool → grep for existing section/clip logic; if none, leave a `// TODO: section tool` no-op (do not build new 3D clipping) |

Menu styling in `DESIGN_SPEC.md §3b`: row = checkmark column (active only) · icon · label · dim shortcut hint. Icons available: `laser-pointer.svg`, `section-tool.svg`, `callout.svg` (plus the tool icons already listed).

**Shortcut hints (wired up):** show these in the menu rows, matching the rebind in constraint #1 — Navigation `V`, Laser pointer `L`, Pen `⇧P`, Pencil `P`, Comment `C`, Callout `⇧C`, Camera `S`, Section tool `⇧S`.

### C. Top-left toggles + Layers panel reskin
- Two stacked rounded-square buttons top-left: **Layers** (`toggle-layers.svg`, active=purple) and **Scene** (`toggle-scene.svg`). Layers toggles `layersOpen` (`App.jsx:5623`); Scene toggles the existing scene-settings panel.
- Reskin `LayersDrawer.jsx` to the new floating dark panel in `DESIGN_SPEC.md §4`: header (`«` collapse, "Layers", `expand`, `+`), rows with caret · name · **lock / eye / locate** action cluster, active lock + hidden states in red `#E5484D`, selected-row highlight, indentation per depth. Keep its existing data source (`meshesRef`/`buildTree`) and the `open`/`onOpenChange` contract. The lock/visibility/locate controls can be wired to real mesh visibility if trivial; otherwise keep them visual and leave TODOs — **do not invent new 3D logic**.

## Acceptance checklist
- [ ] Bottom bar always visible; no mode pill, no radial toolbelt, no role dropdown anywhere.
- [ ] Select / Pen / Comment / Camera switch correctly and reflect active state (purple).
- [ ] Pen & Comment popovers change color/size via the existing state; drawing still works identically.
- [ ] Tool hotkeys match the design (`V` Nav, `L` laser, `⇧P` pen, `P` pencil, `C` comment, `⇧C` callout, `S` camera, `⇧S` section) and stay in sync with the bar's active state; camera/navigation keys unchanged; `Shift+V/R/C` role bindings removed.
- [ ] Layers + Scene toggles open their panels; reskinned Layers panel matches the spec.
- [ ] No dead references to removed role/mode state. `npx vite build` succeeds.
- [ ] Update `CLAUDE.md` (Modes table + interaction model) to reflect the new always-open, role-free model.

Work incrementally and re-run `npx vite build` after each chunk.
