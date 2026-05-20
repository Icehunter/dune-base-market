# Dune Base Designer — Catalog, Preview, Weight System Design

**Date:** 2026-05-19  
**Status:** Approved for implementation

---

## Context

The designer currently shows only pieces already placed in the loaded base, has no 3D preview of individual pieces, no visual feedback while placing, and no structural validation. A new Watershippers DLC set (B1C4, 52 pieces, 60 GLBs) has been added to `src/DLC/B1C4/`. This spec adds four interconnected features to address all of this.

---

## Feature 1 — Piece Registry ETL

### Problem
`modelRegistry.ts` and `pieces.ts` are hand-maintained and cover only ~24 pieces. The actual game catalog (`CDT_BuildingData.json`) has 659 pieces across all factions and DLCs, and all their GLBs are already extracted under `src/`.

### Solution
A Node/TS build script (`scripts/build-piece-registry.ts`) that:
1. Reads `systems/Building/Data/CDT_BuildingData.json` (utf-8-sig, 659 rows)
2. Reads `systems/Building/Data/DT_DuneSocketCostsData.json` for connection costs
3. Reads `systems/Building/Data/CDT_BuildableGroupData.json` for group→socket mapping
4. Scans `src/` recursively for all `.glb` files, indexes by filename stem
5. For each CDT row, extracts the mesh filename from `m_StaticMesh.AssetPathName` and looks it up in the GLB index
6. Emits `src/data/pieceRegistry.generated.ts` containing:
   - `MODEL_PATHS: Record<string, string>` — templateId → local GLB path
   - `PIECE_CATALOG: PieceDefinition[]` — all pieces with full metadata
   - `PIECE_CONNECTION_COST: Record<string, number>` — groupType → socket cost

**Run:** `npm run build:registry`  
**Replaces:** `src/data/modelRegistry.ts` (kept as override file for EXTRA_ROTATION etc.), `src/data/pieces.ts` manual catalog entries

### PieceDefinition shape (extended)
```typescript
interface PieceDefinition {
  templateId: string;
  name: string;                // m_DisplayName.LocalizedString
  faction: string;             // m_BuildableFaction.Name
  category: string;            // derived from m_BuildableGroupType.Name
  tier: 'Tier0' | 'Tier1' | 'Tier2' | 'Tier3';
  isFoundation: boolean;       // m_bIsFoundation
  isPillar: boolean;           // m_bIsPillar
  buildableGroupType: string;  // m_BuildableGroupType.Name
  connectionCost: number;      // from socket cost lookup
  foundationCapacity?: number; // only for foundations: tier health value
  hasGlb: boolean;             // whether a GLB was found
  size: { x: number; y: number; z: number };
  color: string;               // faction color for placeholder
}
```

### Connection cost derivation
- `m_bIsFoundation === true` → cost 0 (anchor)
- `m_BuildableGroupType.Name` in `{Wall, Wall_Half, Wall_Round_Corner, Door_Frame, Gate_Big, Pillar, Pillar_Corner}` → cost 100 (connect via Foundation_Edge)
- `m_BuildableGroupType.Name` in `{Floor, Rooftop, Floor_Round_Corner, Floor_Wedge}` → cost 0 (connect via No_Cost top socket)
- Everything else → cost 10

### Foundation capacity
- Tier0 foundation: 5000
- Tier1 foundation: 7000
- Tier2 foundation: 10000
- Values from `CDT_BuildableGroupData.json` → Foundation → `m_BuildableTierData[tier].Value.m_MaxHealth`

---

## Feature 2 — Catalog Redesign: Grid Thumbnails

### Layout
Replace the current accordion list in `PieceCatalog.tsx` with a 4-column grid. Each cell:
- 3D thumbnail image (rendered async, cached)
- Piece name (truncated)
- Tier + Faction label
- Greyed-out + "—" placeholder when `hasGlb === false`

Filters: faction pills + category dropdown + search input. Show all pieces, not just MODEL_PATHS-filtered.

### Thumbnail rendering (`src/engine/ThumbnailRenderer.ts`)
Single exported singleton. One off-screen `HTMLCanvasElement` (128×128) with its own Babylon `Engine` + `Scene`. Camera at fixed isometric angle showing the piece from above-front.

```typescript
class ThumbnailRenderer {
  async render(templateId: string, substrateMode: boolean): Promise<string>
  // Returns data URL, cached in Map<string, string>
  invalidateAll(): void  // called on substrate mode toggle
}
```

**Lazy loading:** `PieceCatalog` uses `IntersectionObserver` — thumbnails only render when their grid cell scrolls into view. Unrendered cells show the faction-color placeholder box.

**Material:** same substrate shader path as main scene when `substrateMode === true`, StandardMaterial fallback otherwise.

**Performance:** only one WebGL context; pieces render sequentially to the shared canvas, then `canvas.toDataURL('image/webp', 0.85)` is stored. No live canvases in the DOM.

---

## Feature 3 — Placement Ghost: Real Materials + Scroll Rotation

### Ghost materials
`PieceManager.showGhost()` currently applies a flat green `StandardMaterial`. Updated:
- Load the piece's real model (from `containerCache` — already preloaded)
- Clone meshes into the ghost `TransformNode`
- Apply substrate materials (same path as `placePiece()`)
- Apply a semi-transparent additive override on top:
  - Valid placement: `new Color3(0, 0.3, 0)` tint, alpha 0.5
  - Invalid placement: `new Color3(0.4, 0, 0)` tint, alpha 0.5
- Ghost updates immediately on `POINTERMOVE` and on rotation change

### Scroll wheel rotation (`SceneCanvas.tsx`)
```typescript
canvas.addEventListener('wheel', (e) => {
  if (activeTool !== 'place') return;
  e.preventDefault();
  const delta = e.deltaY > 0 ? 1 : -1;
  cycleRotation(delta);  // steps through [0, 90, -90, 180]
}, { passive: false });
```
`cycleRotation` wraps around the four valid rotations. R key continues to step forward through the same sequence. Ghost re-renders (via `showGhost`) on each rotation change.

---

## Feature 4 — Foundation Support System

### New file: `src/engine/SupportSystem.ts`

```typescript
export interface SupportResult {
  canPlace: boolean;
  reason?: 'no_foundation' | 'not_connected' | 'over_capacity';
  foundationId?: string;
  budgetUsed?: number;
  budgetTotal?: number;
}

export function validatePlacement(
  templateId: string,
  position: Vector3,
  placedPieces: PlacedPiece[],
): SupportResult

export function getFoundationLoads(
  placedPieces: PlacedPiece[],
): Map<string /* foundationPieceId */, { used: number; capacity: number }>
```

### Rules
1. **At least one foundation required:** if no foundation in `placedPieces`, any non-foundation placement returns `{ canPlace: false, reason: 'no_foundation' }`.
2. **Connectivity:** every non-foundation piece must be reachable from a foundation via the snap grid adjacency graph (BFS over foundation → edge neighbors → stacked neighbors). If not reachable: `'not_connected'`.
3. **Budget:** each foundation's budget = `piece.foundationCapacity` (tier health). The sum of `connectionCost` for all pieces connected to that foundation must not exceed budget. If placing this piece would push it over: `'over_capacity'`.

### Adjacency graph (simplified)
- Two pieces are adjacent if their snap positions differ by exactly one grid step in any of the six directions (±FOUNDATION_SIZE X/Y, ±FLOOR_HEIGHT Z, ±WALL_OFFSET for edge pieces).
- Foundation → edge: walls/pillars at ±WALL_OFFSET from foundation center at same Z
- Foundation → top: floors/rooftops at same XY, Z + FLOOR_HEIGHT/2
- Stacking: pieces at same XY, one FLOOR_HEIGHT above another

### UI feedback
- Ghost turns red when `canPlace === false`
- Tooltip on red ghost: "No foundation" / "No support" / "Foundation at capacity"
- Inspector panel: when a Foundation is selected, shows a budget progress bar (used/capacity)
- `PieceCatalog` toolbar shows global weight indicator (total used / total capacity across all foundations)

---

## Files Changed

| File | Change |
|------|--------|
| `scripts/build-piece-registry.ts` | **NEW** — ETL script |
| `src/data/pieceRegistry.generated.ts` | **NEW** — generated output (gitignored or committed) |
| `src/data/pieces.ts` | Keep for manual overrides; auto-generated entries replaced |
| `src/data/modelRegistry.ts` | Keep for EXTRA_ROTATION/ROTATION_BY_STORED; MODEL_PATHS replaced |
| `src/engine/ThumbnailRenderer.ts` | **NEW** — off-screen render singleton |
| `src/engine/SupportSystem.ts` | **NEW** — placement validation + load tracking |
| `src/components/Toolbar/PieceCatalog.tsx` | Redesign to grid + thumbnail |
| `src/engine/PieceManager.ts` | Ghost material update, `setGhostValid` color update |
| `src/components/Scene/SceneCanvas.tsx` | Wheel rotation, SupportSystem integration |
| `src/components/Inspector/Inspector.tsx` | Foundation budget bar |
| `package.json` | Add `build:registry` script |

---

## Verification

1. Run `npm run build:registry` — confirm output file has Watershippers entries and correct GLB paths
2. Start dev server, open catalog — confirm all DLC sets appear in grid with thumbnails
3. Toggle substrate mode — confirm thumbnails re-render
4. Select a non-foundation piece with empty scene — confirm ghost is red, tooltip says "No foundation"
5. Place a foundation, then select a wall — confirm ghost shows real materials, scroll wheel rotates it
6. Build a structure exceeding a Tier1 foundation's 7000 budget — confirm placement blocked
7. Select foundation in Inspector — confirm budget bar shows correct used/total
