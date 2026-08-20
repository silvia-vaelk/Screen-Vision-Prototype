# Follow-up prompt for Claude Code — fix the redesign to match Figma

> Paste everything below the `---` into the **same** Claude Code session (or a new one launched from the project root). This is a correction pass over the bottom-nav redesign you already implemented. The reference spec (`Figma_Redesign/DESIGN_SPEC.md`) and icons (`Figma_Redesign/icons/`) have been updated with **verified** values pulled from Figma.

---

The bottom-nav redesign is mostly in place but several details don't match the Figma design. Fix the following. The authoritative values are in `Figma_Redesign/DESIGN_SPEC.md` (§5 has verified tokens, §3b the chevron menus) — re-read it first.

## 0. First, fix the design tokens (this is the root of several issues)
The accent color is wrong throughout. The correct values, pulled straight from the Figma variables:

- **Accent / active purple = `#7B59FF`** (not `#6c5ce7`/`UI.gold`). Replace every place the redesign used the old accent for active tools, toggles, sliders, checkmarks, selection rings.
- Toolbar / menu / panel surface = **`#1A1A1B`**; dark base `#19181A`.
- White icon/text on dark = `#FFFFFF`.
- Destructive (lock / hidden) red = **`#FA5050`**.
- Green swatch = `#92F5B5`.
- Light border = `#E3E2E5`.
- Shadow = `0 4px 6px -2px rgba(16,24,40,.03), 0 12px 16px -4px rgba(16,24,40,.08)` (subtle — not the heavy `0 8px 40px` shadow).
- Font: Inter Medium 14px / 20px line-height.

Define these as named constants/tokens and reference them, so the accent is correct in one place.

## 1. Wrong icons
Several nav/menu icons don't match. The reconstructed SVGs in `Figma_Redesign/icons/` are approximations — prefer **`lucide-react`** (already a dependency, v0.383) for crisp, consistent icons, mapped as:

| Element | lucide-react |
|---------|--------------|
| Select / Navigation | `MousePointer2` |
| Laser pointer | `Sparkles` (or the project's existing laser asset) |
| Pen | `PenTool` |
| Pencil | `Pencil` |
| Comment | `MessageSquare` |
| Callout | `MapPin` |
| Camera | `Camera` |
| Section tool | `Box` |
| Undo / Redo | `Undo2` / `Redo2` |
| Chevron (per tool) | `ChevronDown` |
| Layers toggle | `Layers` |
| Environment / Scene toggle | `Image` |
| Layers row: lock / unlocked | `Lock` / `LockOpen` |
| Layers row: visible / hidden | `Eye` / `EyeOff` |
| Layers row: locate | `Search` |
| Panel header: add / expand / collapse | `Plus` / `Maximize2` / `ChevronsLeft` |

Render icons at ~20–24px, `currentColor`, so active = white on purple and inactive = white/70%.

**Two icons are custom and now exported exactly from Figma — use these files directly, do NOT substitute lucide:**
- `Figma_Redesign/icons/section-tool.svg` — Section tool (3D box/section glyph)
- `Figma_Redesign/icons/laser-pointer.svg` — Laser pointer (magic-wand glyph; the design's "Editor/magic-wand-02")

The other icons above are standard, so lucide is fine. If you want the rest pixel-exact too, pull them from the accessible Figma file with `download_assets` (fileKey `30Oysac7WqQ5MjvFlXdHoZ`) — e.g. each tool icon lives in a `Nav_Button` instance.

## 2. Spacing & padding (verified from Figma)
- Each **tool unit (icon + chevron) = 58×40px**, with a **12px gap** between units; the four tools sit in a **268px-wide** group; bar inner padding **4px**.
- Vertical divider between the tools group and Undo/Redo; Undo/Redo icons are **20×20**.
- Active tool = `#7B59FF` rounded square (~10px radius), white icon.
- Match the bar's overall height to a 40px tool row + 4px padding ≈ 48px, fully rounded ends.

## 3. Layers + Environment buttons are mis-positioned
They belong **top-left, directly below the Logo header**, not wherever they currently sit. Layout:
- Top header row = **194×40px** containing the **Logo (32×32)** + title.
- **Below** that header: the two **40×40** toggle buttons — **Layers** then **Environment/Scene** — left-aligned, small gap. Active toggle uses the `#7B59FF` purple fill (white icon); inactive is the dark surface.
- Wire Layers → existing `layersOpen`; Environment → existing scene-settings panel.

## 4. Layers panel wasn't reskinned
Apply the `DESIGN_SPEC.md §4` styling to `LayersDrawer.jsx`:
- Floating dark panel (`#1A1A1B`, 12px radius, `Shadow/lg`), opening below the top-left toggles.
- Header: `«` collapse · "Layers" · `Maximize2` expand · `Plus` add.
- Rows: caret · name · right-aligned action cluster **lock / eye / locate**. Active **lock** and **hidden (eye-off)** render in red `#FA5050` on a subtle tinted square; selected rows get `rgba(255,255,255,0.06)`; indent 14px per depth.
- Keep the existing data source (`meshesRef` / `buildTree`) and `open`/`onOpenChange` contract.

## 5. Chevron hover state missing
- Hovering a tool's **chevron** (and the chevron's hit area) should show a hover background, and clicking it opens that tool's variant dropdown (see §3b). The dropdown menu itself: hovered row gets a lighter highlight `rgba(255,255,255,0.12)` (the Figma frame literally annotates this "Hover").
- Add the standard hover affordance to the tool buttons too (subtle bg on hover when not active).

## 6. Active variant checkmark when the chevron menu is open
In each open dropdown, the **currently-active variant** shows a leading **✓ checkmark** (left column), the variant icon, the label, and a right-aligned shortcut hint. Right now the menu opens without marking the active row — add the checkmark. Shortcut hints: Navigation `V`, Laser `L`, Pen `⇧P`, Pencil `P`, Comment `C`, Callout `⇧C`, Camera `S`, Section `⇧S`.

## 7. No purple state when Camera is active
When the **Camera** tool is active it must get the same active treatment as the other tools — the `#7B59FF` purple. (Note: I couldn't re-screenshot the exact Camera frame this pass due to a Figma rate limit. Apply the purple active-button treatment for consistency; if the design also shows a purple **capture-region outline** on the canvas while Camera is active, use `#7B59FF` for it. Flag this one for Paul to confirm.)

## Verify
- [ ] Accent is `#7B59FF` everywhere; surfaces `#1A1A1B`; red `#FA5050`; subtle `Shadow/lg`.
- [ ] Icons match (lucide set or Figma exports).
- [ ] Tool units 58×40, 12px gaps; Undo/Redo 20×20 after a divider.
- [ ] Logo header on top; Layers + Environment toggles directly below it, top-left.
- [ ] Layers panel reskinned per §4.
- [ ] Chevron + tool hover states present; dropdown hover highlight present.
- [ ] Active variant shows ✓ in the open menu.
- [ ] Camera active shows the purple treatment.
- [ ] All hotkeys per the agreed mapping still work; `npx vite build` passes.
