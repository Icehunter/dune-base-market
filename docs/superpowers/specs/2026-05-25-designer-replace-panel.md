# Designer Replace Panel

**Date:** 2026-05-25  
**Status:** Approved  
**Scope:** `src/pages/DesignerPage.tsx`, `src/components/Designer/PaletteDrawer.tsx`

---

## Goal

Add **Replace** and **Replace All** to the Designer so the user can swap piece types in-place without clearing and rebuilding. The controls live in the existing selected-piece info panel and the existing bottom palette drawer — no new UI surface.

---

## Flow

1. User selects a placed piece in the 3D scene → the piece info overlay (bottom-left) gains two buttons: **Replace** and **Replace All (N)** where N is the count of that `building_type` in the scene.
2. Clicking either button opens the palette drawer (if closed) and puts it into **replace mode**.
3. In replace mode the drawer shows a gold banner: `[icon] Replacing <PieceName> ×N  [× cancel]` above the faction tabs.
4. Faction tabs, category sub-tabs, and the icon row all behave normally — the user browses to find the target piece.
5. Hovering an icon tile reveals two stacked mini-buttons inside the tile: **Replace ×1** (swap only the selected instance) and **All ×N** (swap every instance of that `building_type`).
6. Clicking an action executes the swap in React state and **stays in replace mode** — the user can keep swapping.
7. Replace mode exits when any of the following happen:
   - **× cancel** is clicked in the banner
   - A **different piece is selected** in the scene (or the scene is clicked with nothing selected)
   - **Placing mode** is entered (user clicks a piece in the palette to place)
8. Foundation lock is **lifted** in replace mode (a foundation is already present; any piece may be chosen as a replacement target).

---

## State — `DesignerPage`

Add one field:

```ts
const [replaceSourceId, setReplaceSourceId] = useState<string | null>(null);
```

Derive `replaceMode` inline (no extra state):

```ts
const replaceMode = useMemo(() => {
  if (!replaceSourceId) return null;
  const src = pieces.find(p => p.id === replaceSourceId);
  if (!src) return null;
  const count = pieces.filter(p => p.building_type === src.building_type).length;
  return { instanceId: replaceSourceId, building_type: src.building_type, count };
}, [replaceSourceId, pieces]);
```

### Handlers

```ts
const handleStartReplace = (instanceId: string) => {
  setReplaceSourceId(instanceId);
  setPaletteOpen(true);
};

const handleReplaceOne = (newType: string) => {
  if (!replaceMode) return;
  setPieces(prev =>
    prev.map(p => p.id === replaceMode.instanceId ? { ...p, building_type: newType } : p),
  );
  // replaceSourceId stays — mode persists
};

const handleReplaceAll = (newType: string) => {
  if (!replaceMode) return;
  const oldType = replaceMode.building_type;
  setPieces(prev =>
    prev.map(p => p.building_type === oldType ? { ...p, building_type: newType } : p),
  );
  // replaceSourceId stays — mode persists
};

const handleExitReplaceMode = () => setReplaceSourceId(null);
```

### Exit triggers

`handleSelectPiece` exits replace mode whenever the incoming id is not the piece already in replace mode (covers both deselect and selecting a different piece):

```ts
const handleSelectPiece = (id: string | null) => {
  if (id !== replaceSourceId) setReplaceSourceId(null);
  setSelectedPieceId(id);
  if (id) setPlacingTemplate(null);
};
```

`selectTemplate` clears replace mode before entering placing mode:
```ts
const selectTemplate = (templateId: string) => {
  setReplaceSourceId(null);
  // … existing logic
};
```

---

## Piece Info Panel — `DesignerPage`

In the `{selectedPiece && !placingTemplate}` block, add below the rotation/position row:

```tsx
{(() => {
  const sameTypeCount = pieces.filter(p => p.building_type === selectedPiece.building_type).length;
  return (
    <div className="flex gap-1.5 pt-0.5">
      <button
        className="cursor-pointer rounded-[2px] border border-[#c8a84b55] bg-[#c8a84b12] px-2 py-0.5 text-[10px] text-[#c8a84b] transition-colors hover:bg-[#c8a84b22]"
        onClick={() => handleStartReplace(selectedPiece.id)}
      >
        Replace
      </button>
      <button
        className="cursor-pointer rounded-[2px] border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] text-white/60 transition-colors hover:bg-white/10 hover:text-white/90"
        onClick={() => handleStartReplace(selectedPiece.id)}
      >
        Replace All ({sameTypeCount})
      </button>
    </div>
  );
})()}
```

Both buttons call `handleStartReplace` — the distinction between "one" and "all" is made when the user picks a target tile inside the drawer.

---

## `PaletteDrawer` — New Props

```ts
interface ReplaceMode {
  instanceId: string;
  building_type: string;
  count: number;
}

interface Props {
  // existing props unchanged …
  replaceMode: ReplaceMode | null;
  onExitReplaceMode: () => void;
  onReplaceOne: (newType: string) => void;
  onReplaceAll: (newType: string) => void;
}
```

### Replace banner

Rendered between `<div className="shrink-0 overflow-hidden …">` and the faction tab row, only when `replaceMode !== null`:

```tsx
{replaceMode && (
  <div className="flex items-center gap-2 border-b border-[#c8a84b30] bg-[#c8a84b0a] px-3 py-2">
    {/* icon */}
    {catalogEntry?.iconPath
      ? <img src={catalogEntry.iconPath} width={18} height={18} className="shrink-0 rounded object-contain" />
      : <Icon icon="lucide:box" width={16} height={16} className="shrink-0 text-white/30" />
    }
    <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-[#c8a84b]">
      Replacing {catalogEntry?.name ?? replaceMode.building_type}
      <span className="ml-1 font-normal text-[#c8a84b70]">×{replaceMode.count}</span>
    </span>
    <button
      onClick={onExitReplaceMode}
      className="shrink-0 cursor-pointer text-white/30 transition-colors hover:text-white/70"
    >
      <Icon icon="lucide:x" width={13} height={13} />
    </button>
  </div>
)}
```

`catalogEntry` is derived inside `PaletteDrawer` using the passed `pieces` prop:
```ts
const catalogEntry = replaceMode
  ? (pieces.find(p => p.templateId === replaceMode.building_type) ?? null)
  : null;
```

### Tile behaviour in replace mode

Each tile's `onClick` and rendered content changes when `replaceMode !== null`. Use a local `useState<string | null>` (`hoveredTile`) to track which tile is hovered so the mini-buttons appear:

```tsx
const [hoveredTile, setHoveredTile] = useState<string | null>(null);

// inside the tile render:
<button
  key={p.templateId}
  onMouseEnter={() => replaceMode && setHoveredTile(p.templateId)}
  onMouseLeave={() => setHoveredTile(null)}
  onClick={() => {
    if (!replaceMode) {
      if (!locked) onSelectTemplate(p.templateId);
    }
    // in replace mode clicking is a no-op; user clicks the mini-buttons
  }}
  disabled={locked && !replaceMode}  // lock lifted in replace mode
  title={p.templateId}
  className={/* existing classes */}
>
  {/* existing icon + name */}

  {/* mini-buttons — replace mode only, this tile hovered */}
  {replaceMode && hoveredTile === p.templateId && (
    <div className="absolute inset-x-0 bottom-0 flex flex-col gap-px px-1 pb-1">
      <button
        onClick={e => { e.stopPropagation(); onReplaceOne(p.templateId); setHoveredTile(null); }}
        className="w-full cursor-pointer rounded-[2px] bg-[#c8a84b] py-0.5 text-center text-[8px] font-bold text-black"
      >
        Replace ×1
      </button>
      <button
        onClick={e => { e.stopPropagation(); onReplaceAll(p.templateId); setHoveredTile(null); }}
        className="w-full cursor-pointer rounded-[2px] bg-white/15 py-0.5 text-center text-[8px] text-white/80"
      >
        All ×{replaceMode.count}
      </button>
    </div>
  )}
</button>
```

The tile button always has `relative` positioning (cheap and needed for the mini-buttons to sit correctly). The mini-buttons only render in replace mode so the class is never wasted.

---

## Visual Consistency

All new UI elements follow existing site conventions:

- **Buttons:** same `rounded-[2px]` border-radius, same gold (`#c8a84b`) / dark (`border-white/15 bg-white/5`) / ghost patterns as the rest of the designer
- **Gold banner:** same amber/gold accent (`#c8a84b`, `bg-[#c8a84b0a]`, `border-[#c8a84b30]`) used throughout
- **Mini-buttons:** gold fill for primary action (Replace ×1), muted `bg-white/15` for secondary (All ×N) — mirrors the existing btnGold/btnDark split
- **Typography:** same `text-[10px]`–`text-[11px]` sizing as surrounding elements in the drawer and info panel

---

## What Does NOT Change

- `DesignerCanvas.tsx` — piece swaps are pure state mutations; canvas diffs from props
- `ViewerHUD.tsx`
- `ActionsMenu.tsx`
- `PieceVariantsDrawer.tsx` (blueprint viewer component — untouched)
- The foundation lock for new placement is unaffected; only replace mode lifts it

---

## File Checklist

| File | Action |
|------|--------|
| `src/pages/DesignerPage.tsx` | Add `replaceSourceId` state, `replaceMode` derived value, four handlers, exit wiring in `handleSelectPiece` + `selectTemplate`, Replace/Replace All buttons in piece info panel, new props passed to `PaletteDrawer` |
| `src/components/Designer/PaletteDrawer.tsx` | Add four new props, replace banner, `hoveredTile` state, conditional mini-buttons on tiles, lift foundation lock in replace mode |
