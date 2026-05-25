# Designer Palette Redesign

**Date:** 2026-05-25  
**Status:** Approved  
**Scope:** `src/pages/DesignerPage.tsx`, `src/components/Designer/` (new components)

---

## Goal

Replace the fixed 256px left sidebar in the Designer with a full-width bottom drawer that can be toggled with `Space`. Add a top-right Actions menu for Save / Export / Import / Clear. The 3D canvas expands to fill all freed space.

---

## Layout Overview

```
┌──────────────────────────────────────────────────────────┐
│ NavBar                                    [Actions ▾]    │
├──────────────────────────────────────────────────────────┤
│ Beta banner (full width)                                 │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  3D Canvas — fills all remaining space                   │
│                                                          │
│  [Piece info panel]          [ViewerHUD]                 │
│  bottom-left overlay         bottom-right overlay        │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ Bottom Palette Drawer (collapsible, Space to toggle)     │
│  Atreides │ Harkonnen │ CHOAM │ Smuggler │ …   [▼ Space] │
│  All │ Foundation │ Wall │ Floor │ Door │ Pillar │ …     │
│  [80px] [80px] [80px] [80px] [80px] [80px] → scroll     │
└──────────────────────────────────────────────────────────┘
```

---

## Components

### 1. `PaletteDrawer` — `src/components/Designer/PaletteDrawer.tsx`

A new self-contained component. Receives the filtered piece list and selection state; calls back on piece selection.

**Props:**
```ts
interface PaletteDrawerProps {
  isOpen: boolean;
  onToggle: () => void;
  pieces: CatalogEntry[];           // full STRUCTURE_CATALOG (non-placeable only)
  placingTemplate: string | null;
  foundationPlaced: boolean;
  onSelectTemplate: (templateId: string) => void;
}
```

**Internal state:** `activeFaction: string | null`, `activeCategory: string | null`

**Structure (top → bottom within the drawer):**

1. **Faction tab row** — one tab per faction that has at least one piece. Order matches `ORDERED_FACTIONS`. Active tab highlighted gold (`border-bottom: 2px solid #c8a84b`). "All" tab at the front resets faction filter. Right-aligned `▼ Space` collapse handle.

2. **Category sub-tab row** — derived from pieces in the active faction. Categories: Foundation, Wall, Floor, Door, Pillar, Ramp, Rooftop, Decoration. "All" resets category filter. Only categories with at least one piece in the current faction are shown.

3. **Icon grid row** — horizontally scrollable single row of 80×80px tiles. Each tile:
   - `<img>` using `iconPath` from the catalog entry (the existing thumbnail system)
   - Short piece `name` label below the image, 7px, truncated
   - Gold border + subtle gold tint when `placingTemplate === templateId`
   - Locked (opacity-30, not clickable) if `!foundationPlaced && !isFoundationPiece`
   - Tooltip (`title` attribute) with full `templateId`

**Animation:** drawer slides up/down via `translateY`. Use `transition: transform 200ms ease-out`. A thin `▲ Space` pull tab is visible at the bottom edge of the canvas when the drawer is closed, so users know it exists.

**Keyboard:** `Space` toggles open/closed. Handled in `DesignerPage` (not inside the component), same pattern as existing key handlers. Does not fire when focus is inside an `<input>`.

---

### 2. `ActionsMenu` — `src/components/Designer/ActionsMenu.tsx`

A small dropdown button anchored to the top-right of the canvas area (absolute positioned, `top: 10px; right: 10px; z-index: 20`).

**Props:**
```ts
interface ActionsMenuProps {
  isSignedIn: boolean;
  pieceCount: number;
  onSave: () => void;       // only callable when isSignedIn && pieceCount > 0
  onExport: () => void;
  onImport: () => void;
  onClear: () => void;
}
```

**Trigger button:** `⬡ Actions ▾` using existing `btnDark` styling.

**Dropdown items (in order):**
| Item | Condition | Style |
|------|-----------|-------|
| Save to account | `isSignedIn && pieceCount > 0` | Gold accent |
| Export JSON | always | Normal |
| Import JSON | always | Normal |
| Clear canvas | `pieceCount > 0` | Red/danger tint |

Dropdown closes on item click or outside click (`useEffect` + `mousedown` listener on document). No HeroUI dependency — plain `<div>` with absolute positioning.

**Save behaviour:** Calls `POST /api/blueprints` with the current pieces serialised as a Solido JSON body. Blueprint is created **private** (`is_public: 0`). On success: toast "Blueprint saved — view it in your account" with a link. On failure: `toast.danger(...)`. No optimistic UI.

---

## DesignerPage Changes

- Remove the `<aside>` sidebar entirely (search input, faction pills, piece list, stats footer).
- Remove state: `search`, `activeFaction`. These move into `PaletteDrawer` as internal state.
- Add state: `paletteOpen: boolean` (default `true`).
- Add `Space` key handler: toggles `paletteOpen`. Guard: skip if `document.activeElement` is an input.
- Add `isSignedIn` from `useAuth()` (already available via Clerk).
- Wire `ActionsMenu` at top-right of canvas wrapper with `onSave`, `onExport` (existing logic), `onImport` (existing logic), `onClear`.
- Wire `PaletteDrawer` at the bottom with `isOpen={paletteOpen}` and `onToggle`.
- The outer layout changes from `flex-row` to `flex-col` (already is `flex-col` after the beta banner change) — canvas + drawer stack vertically.
- Canvas area: `flex-1 relative overflow-hidden` — fills all space above the drawer.

---

## Save to Account — API

`POST /api/blueprints` already exists. It expects `multipart/form-data` with three fields: `title` (string), `is_public` (string `"0"`), and `file` (a `Blob` of the Solido JSON). The Designer constructs the same payload the upload flow uses:

```ts
const solido = { instances: pieces.map(...), placeables: [], pentashields: [] };
const blob = new Blob([JSON.stringify(solido)], { type: 'application/json' });
const form = new FormData();
form.append('title', 'Untitled Design');
form.append('is_public', '0');
form.append('file', blob, 'blueprint.json');
fetch('/api/blueprints', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
```

After a successful save the user gets a toast "Blueprint saved — view it in your account" with a link to `/blueprint/:id`. No redirect — they stay in the designer.

---

## ViewerHUD Update

Add `"Space — open palette"` to the orbit-mode tips list in `ViewerHUD.tsx` when the palette is closed. Pass a new `paletteClosed?: boolean` prop; when `true`, append the tip.

---

## What Does NOT Change

- `DesignerCanvas.tsx` — no changes needed
- The beta banner
- The piece info panel (bottom-left)
- The crosshair in fly mode
- The placement HUD (bottom-centre, "Click to place · R rotate…")
- The `STRUCTURE_CATALOG` filter (still excludes `_placeable` pieces)
- The foundation-first lock logic

---

## File Checklist

| File | Action |
|------|--------|
| `src/components/Designer/PaletteDrawer.tsx` | Create |
| `src/components/Designer/ActionsMenu.tsx` | Create |
| `src/pages/DesignerPage.tsx` | Modify (remove sidebar, add Space key, wire new components) |
| `src/components/Scene/ViewerHUD.tsx` | Modify (add `paletteClosed` prop + tip) |
| `functions/api/blueprints/index.ts` | No change (existing POST endpoint used as-is) |
