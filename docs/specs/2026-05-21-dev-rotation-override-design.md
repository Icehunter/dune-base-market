# Dev Rotation Override Tool — Design Spec

**Date:** 2026-05-21  
**Status:** Approved

## Overview

A dev-only tool that lets you click a piece, press **R** to cycle its rotation correction through a predefined set, and immediately see the result re-rendered. The full override map is console-logged on every press so you can diagnose and copy corrections into the static pipeline faster.

---

## Types

No new types needed. Uses existing `RotMap` from `modelRegistry.ts`:

```ts
type RotMap = Partial<Record<number, number>>;
// Partial<Record<string, RotMap>> — same shape as ROTATION_BY_STORED
```

Correction cycle (predefined set covering 60° and 90° geometries):

```ts
const DEV_ROTATION_CYCLE = [0, 60, 90, 120, 180, -120, -90, -60] as const;
```

---

## State

Added to `BlueprintDetailPage.tsx` alongside `selectedPiece`:

```ts
const [devRotationMap, setDevRotationMap] =
  useState<Partial<Record<string, RotMap>>>({});
```

---

## Keydown Handler

`useEffect` in `BlueprintDetailPage` registers a `keydown` listener. On `"r"` / `"R"`:

1. Guard: return early if no piece is selected
2. Derive canonical stored-rotation key from `selectedPiece.transform.rotation`:
   ```ts
   const n = ((rotation % 360) + 360) % 360;
   const key = n > 180 ? n - 360 : n;
   ```
3. Read current correction: `devRotationMap[templateId]?.[key] ?? 0`
4. Find current index in `DEV_ROTATION_CYCLE`, advance by 1 (wraps)
5. Write back with shallow clone to trigger React
6. `console.log('[DEV] ROTATION_BY_STORED override:', newMap)` — structured object, expandable in DevTools

Listener is cleaned up on effect teardown.

---

## Prop Drilling

`devRotationMap` is passed as a prop to `SceneCanvas`. It is added to the existing scene-rebuild `useEffect` dependency array so any change triggers a full re-place of all pieces.

`SceneCanvas` forwards it to `PieceManager.placePiece()` as `devOverrides`.

---

## Render Pipeline Integration

In `PieceManager.placePiece()`, the rotation lookup becomes a merge:

```ts
const staticMap = ROTATION_BY_STORED[templateId];
const devMap = devOverrides[templateId];
const byStored = (staticMap || devMap)
  ? { ...staticMap, ...devMap }   // dev keys win on conflict, static fills the rest
  : undefined;
const extra = byStored != null
  ? (byStored[key] ?? 0)
  : (EXTRA_ROTATION[templateId] ?? 0);
```

When `devOverrides` is `{}` (production / map is empty), behavior is identical to today.

---

## Console Output Format

```
[DEV] ROTATION_BY_STORED override: {
  "Atreides_Foundation_Triangle": { 90: 60 },
  "Atreides_Wall_Half": { 0: 180, -90: 180 }
}
```

---

## Edge Cases

| Scenario | Behavior |
|---|---|
| Nothing selected | R is a no-op, no log |
| First R on a piece | Starts at cycle index 0 (value `0`), next R advances to `60` |
| Same templateId, different stored rotations | Each `[templateId][key]` entry is independent; R only cycles the selected piece's key |
| templateId already in static `ROTATION_BY_STORED` | Dev map merges on top — only the keys you override change, others from static remain |
| `devOverrides` empty / not passed | Falls through to existing static lookup, zero behavior change |

---

## Files Changed

| File | Change |
|---|---|
| `src/pages/BlueprintDetailPage.tsx` | Add `devRotationMap` state, keydown handler |
| `src/components/Scene/SceneCanvas.tsx` | Accept `devRotationMap` prop, add to rebuild deps, pass to PieceManager |
| `src/engine/PieceManager.ts` | Accept `devOverrides` param in `placePiece()`, merge into rotation lookup |

---

## Deletion Path

When no longer needed: remove state + handler from `BlueprintDetailPage`, remove prop from `SceneCanvas`, remove `devOverrides` param and merge logic from `PieceManager.placePiece()`. No build flags, no config, no database entries.
