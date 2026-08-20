# Bottom-Center Navigation Redesign — Design Spec

Source: Figma · *Screen Experience* · page **[Discovery] Mode Switching (Design)** · frame `Prototype` (node `11072:45121`).
Captured visually via browser (the Figma MCP requires a Dev/Full seat; the account has View-only on this org, so native SVG export / token values were not available). All hex values below are **eyedropper estimates** — confirm against Figma before shipping.

The frame holds five reference states, one per selection: **Navigation** (Select active), **Pen/Pencil**, **Comment/callout**, **Camera**, and **Layers**.

---

## 1. The core idea

A single dark pill toolbar is **always docked at bottom-center**. It never collapses, and there is **no viewer / reviewer / creator mode and no radial "toolbelt" menu**. Selecting a tool simply changes which contextual options float just above the bar.

```
                    ┌─────────────────────────────┐
                    │  · contextual options ·     │   ← floats ABOVE, anchored
                    └─────────────────────────────┘      over the active tool
   ┌───────────────────────────────────────────────────────┐
   │  ◹▾   ✎▾   💬▾   📷▾  │  ↶   ↷                          │   ← always open
   └───────────────────────────────────────────────────────┘
     Select Pen  Comment Camera   Undo Redo
```

## 2. Bottom nav bar

- **Position:** `fixed`, horizontally centered, ~24px from bottom (matches current `BottomNavBar`/`InSceneModeSwitcher` offset).
- **Container:** dark pill. bg ≈ `#1B1B1E` (near-black, same family as existing `DK.bg #19181A`). Fully rounded corners (`border-radius` ≈ 16px / pill). Soft drop shadow `0 8px 40px rgba(0,0,0,0.5)`. Inner padding ≈ 6px.
- **Items, left → right:**
  1. **Select** (cursor) — active in the Navigation/default state
  2. **Pen** (drawing)
  3. **Comment** (callout)
  4. **Camera** (screenshot)
  5. vertical **divider** (1px, `rgba(255,255,255,0.12)`, with ~8px margin)
  6. **Undo**
  7. **Redo**
- **Each of the four tools** (1–4) is followed by a small **chevron-down** (`chevron-down.svg`) — a secondary affordance to open that tool's option menu. The options also auto-show above the bar when the tool is active.
- **Tool button:** ~40×40px hit area, icon ~24px.
  - *Active* tool: filled **purple** rounded-square (radius ≈ 10px), white icon. Purple ≈ `#6C5CE7` (existing `UI.gold` token is this exact purple — reuse it; the design reads as `#6E5BF7`, confirm).
  - *Inactive* tool: transparent bg, icon `#FFFFFF` (chevrons `rgba(255,255,255,0.55)`).
- **Undo / Redo:** icon-only, `rgba(255,255,255,0.55)`; full white on hover; dim (`0.25`) when nothing to undo/redo.

## 3. Contextual options popover (floats above the active tool)

Same dark pill styling as the nav bar, sitting ~10–12px above it, horizontally centered over the **active** tool (not the whole bar). Appears/disappears with the selection.

| Tool | Contents (left → right) |
|------|--------------------------|
| **Select** | *(none — no popover; this is the default navigate state)* |
| **Pen** | Color row, then a 1px divider, then a **size/opacity slider** with a numeric readout (`100`). |
| **Comment** | Color row only (no slider). |
| **Camera** | **Grid toggle** (`cam-grid.svg`), large white **shutter/capture** button (`cam-shutter.svg`, ~28–32px circle), **crop/focus-frame toggle** (`cam-crop.svg`). |

**Color row** = five ~28px circular swatches with ~4px gaps. The currently-selected swatch shows a white **check** and a light ring. Order and estimated hexes:

| Swatch | Est. hex | Notes |
|--------|----------|-------|
| Dark (selected by default) | `#2A2A2E` / near-black | default ink; maps to current `#1C1C1E` default for pen/pencil/redline |
| Red | `#EE6B5E` | |
| Amber | `#F6A831` | |
| Green | `#67C98A` | |
| Purple | `#8470F0` | |

Slider: track `rgba(255,255,255,0.18)`, filled portion + thumb white, value label `#FFFFFF` mono.

## 3b. Chevron dropdown menus — tool variants (node `11077:3801`, frame "open")

Each of the four tools is really a **tool group**. Clicking the tool's **chevron** opens a small dark dropdown that floats just above the bar, anchored over that tool, listing the variants. The main tool button shows the icon of the currently-selected variant; picking a variant switches it and closes the menu.

| Group (chevron) | Variants (top → bottom) | Shortcut | Maps to existing state |
|-----------------|--------------------------|----------|------------------------|
| **Navigation** | Navigation · Laser pointer | `V` · `L` | Navigation = cursor/navigate (`activeTool='cursor'`, `annotationMode=false`); Laser = `setActiveMode('laser')` |
| **Pen** | Pen · Pencil | `⇧P` · `P` | `activeTool='pen'` · `activeTool='pencil'` (both already exist, with separate `penColor`/`pencilColor`) |
| **Comment** | Comment · Callout | `C` · `⇧C` | `commentMode='default'` (bubble) · `commentMode='callout'` (leader pin) |
| **Camera** | Camera · Section tool | `S` · `⇧S` | Camera = screenshot tool (UI only); Section tool = cross-section/clipping (likely **new** — grep `section`/`clip` first) |

These shortcuts are the **agreed final bindings** (the tool keys are being rebound to match this design — see `CLAUDE_CODE_PROMPT.md` constraint #1). Note: the Figma file labelled both Camera and Comment as `C`; that conflict was resolved to **Camera = `S`, Section tool = `⇧S`**. Camera/scene-navigation keys (viewpoint numbers, `F`, `Home`, `Enter`, `Shift`, etc.) are unchanged.

**This supersedes the earlier "single drawing tool" simplification:** the design keeps **both Pen and Pencil** as chevron variants of the drawing group, so keep both code tools alive and switch via the menu.

**Dropdown styling:** dark menu (`#1B1B1E`), radius ~10–12px, ~4px padding, drop shadow. Each row ~36px: a leading **checkmark column** (✓ only on the active variant) · variant **icon** (~16px) · **label** (white, 13px Inter) · right-aligned **shortcut hint** (dim `#8A8A90`). Hovered/secondary row gets a `rgba(255,255,255,0.12)` highlight. Menu width hugs content (~150–160px).

## 4. Layers panel + Scene toggle (top-left)

Two stacked ~40×40px rounded-square buttons at top-left:
- **Layers toggle** (`toggle-layers.svg`) — active = purple bg, white icon (same purple as nav active).
- **Scene/Environment toggle** (`toggle-scene.svg`) — opens the existing scene-settings panel.

When Layers is on, a floating **dark rounded panel** opens just below the toggles:
- Header: `«` collapse (`collapse-left.svg`), title **"Layers"**, right side **expand/fit** (`expand.svg`) + **add `+`** (`plus.svg`).
- 1px divider under the header (`rgba(255,255,255,0.08)`).
- **Rows** (groups + nested layers): caret (`chevron-right.svg`, rotates when open) · name · right-aligned action cluster: **lock** (`lock.svg` / `lock-open.svg`), **visibility** (`eye.svg` / `eye-off.svg`), **locate/zoom** (`search.svg`).
  - Active **lock** and active **eye-off** render in red ≈ `#E5484D` on a subtle tinted square.
  - Indentation ≈ 14px per depth (matches current `LayersDrawer`).
  - A row may show an inline **"Opacity"** control pill.
  - Selected rows get a lighter bg `rgba(255,255,255,0.06)`.
- Panel bg `#19181A`, radius 12px, text `#FFFFFF`, secondary `#BCBEC4`, dim `#504C55` (reuse `LayersDrawer` `DK` tokens).

## 5. Color tokens — VERIFIED from Figma variables (node 1:3891)

These are the **real token values** pulled from the accessible Figma file (`30Oysac7WqQ5MjvFlXdHoZ`) via the Figma MCP. Use these exactly — they supersede the earlier estimates (notably the accent was NOT `#6c5ce7`).

| Role | **Exact value** | Figma token |
|------|-----------------|-------------|
| **Accent / active** | **`#7B59FF`** | `Primary/500` = `Tokens/Brand/Blueberry` |
| Toolbar / menu / float surface | **`#1A1A1B`** | `Tokens/Surface/Float/Bold` |
| Dark screen base | `#19181A` | `Tokens/Screen/Dark/Default`, `Base/Greys/900` |
| White icon / text (on dark) | `#FFFFFF` | `Tokens/Icon/Inverse`, `Tokens/Text/Inverse` |
| Default text (on light) | `#19181A` | `Tokens/Text/Default` |
| Destructive / red (lock, hidden) | **`#FA5050`** | `Tokens/Brand/Raspberry` |
| Green swatch | `#92F5B5` | `Tokens/Brand/Mint` |
| Border (light) | `#E3E2E5` | `Tokens/Border/Default` |
| Subtle screen overlay | `#66616B40` | `Tokens/Screen/Subtle` |
| **Shadow (`lg`)** | `0 4px 6px -2px rgba(16,24,40,.03), 0 12px 16px -4px rgba(16,24,40,.08)` | `Shadow/lg` |

Font: **Inter Medium, 14px / 20px line-height, weight 500** (`Website/Text sm/Medium`). Some labels use Noto Sans SemiBold 14.

### Verified geometry (from node metadata)
- **Tool unit** (icon + chevron) = **58×40px**, **12px gap** between units, four units in a **268px** group; bar inner padding **4px**.
- **Undo/redo**: 20×20 icons (`Arrows/flip-forward` component + its mirror) in a small group, after a divider.
- **Logo** = **32×32px**, sitting in a top header row **194×40px** (logo + title). The **Layers** and **Environment** toggle buttons (40×40) sit **below this header**, top-left — see §4.
- Active tool = purple `#7B59FF` rounded square, white icon (radius ~10px).

## 6. Icon inventory (`./icons/`)

Reconstructed 24px stroke icons (`stroke-width` ~1.8, round caps, `currentColor` so they tint). These are **redrawn to match** the design, not exported from Figma — swap for official exports if/when a Dev seat is available. Closest `lucide-react` equivalents noted in each file (lucide-react 0.383 is already available to the project).

Bottom nav: `select` · `pen` · `comment` · `camera` · `undo` · `redo` · `chevron-down`
Chevron-menu variants: `laser-pointer` · `callout` · `section-tool`
Camera options: `cam-grid` · `cam-shutter` · `cam-crop`
Top-left: `toggle-layers` · `toggle-scene`
Layers panel: `lock` · `lock-open` · `eye` · `eye-off` · `search` · `plus` · `expand` · `collapse-left` · `chevron-right`

Open `icons-preview.html` to see them all rendered.
