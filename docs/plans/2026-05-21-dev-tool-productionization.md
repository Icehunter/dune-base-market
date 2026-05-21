# Dev Tool Productionization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the local R-key rotation override dev tool and make it a real per-blueprint, per-user feature: owner-gated, persisted to D1, applied in the render pipeline, and excluded from downloads by design.

**Architecture:** A new `rotation_overrides TEXT` column on the `blueprints` table stores a JSON blob of `Partial<Record<string, RotMap>>`. The existing PATCH endpoint is extended to accept this field (owner-only, already enforced). The viewer loads overrides on mount and passes them as a 4th merge layer in `PieceManager.placePiece()`, after `ROTATION_BY_STORED`. Downloads hit R2 directly and are unaffected. The R key is gated behind `isOwner`. Shift+R cycles counter-clockwise.

**Tech Stack:** Cloudflare D1 (SQLite), Cloudflare Pages Functions (TypeScript), React 19, Babylon.js 9, Zustand

---

## Files

| File | Change |
|------|--------|
| `migrations/0002_rotation_overrides.sql` | Create — add column |
| `functions/api/blueprints/[id].ts` | Modify — accept `rotation_overrides` in PATCH, return it in GET |
| `src/lib/api.ts` | Modify — add `rotation_overrides` to `BlueprintDetail`, add `saveRotationOverrides()` |
| `src/engine/PieceManager.ts` | Modify — 4th `userOverrides` layer in `placePiece()` and `applyDevOverrides()` |
| `src/components/Scene/SceneCanvas.tsx` | Modify — accept `userOverrides` prop, pass to PieceManager |
| `src/pages/BlueprintDetailPage.tsx` | Modify — gate R key, add Shift+R, load/auto-save overrides |

---

### Task 1: DB Migration

**Files:**
- Create: `migrations/0002_rotation_overrides.sql`

- [ ] **Create the migration file**

```sql
ALTER TABLE blueprints ADD COLUMN rotation_overrides TEXT;
```

- [ ] **Apply locally**

```bash
npx wrangler d1 execute dune-blueprints --local --file=migrations/0002_rotation_overrides.sql
```

Expected output: `🚣 1 commands executed successfully.`

- [ ] **Commit**

```bash
git add migrations/0002_rotation_overrides.sql
git commit -m "feat: add rotation_overrides column to blueprints"
```

---

### Task 2: Extend GET and PATCH endpoints

**Files:**
- Modify: `functions/api/blueprints/[id].ts`

The GET handler at line 12 already selects columns explicitly — add `rotation_overrides`. The PATCH handler at line 43 already has a field-allow-list pattern — add `rotation_overrides` to it.

- [ ] **Extend GET SELECT to include rotation_overrides**

In `onRequestGet`, change the SELECT query from:
```ts
`SELECT id, title, username, user_id, is_public, piece_count, file_size,
        tags, download_count, created_at, blueprint_data
 FROM blueprints WHERE id = ?`
```
to:
```ts
`SELECT id, title, username, user_id, is_public, piece_count, file_size,
        tags, download_count, created_at, blueprint_data, rotation_overrides
 FROM blueprints WHERE id = ?`
```

And in the return JSON, parse `rotation_overrides` the same way as `tags`:
```ts
return json({
  ...row,
  tags: safeParseJson(row.tags as string | null, []),
  blueprint_data: safeParseJson(row.blueprint_data as string | null, null),
  rotation_overrides: safeParseJson(row.rotation_overrides as string | null, null),
});
```

- [ ] **Extend PATCH to accept rotation_overrides**

In `onRequestPatch`, change the body type:
```ts
const body = await request.json<{
  title?: string;
  is_public?: boolean;
  tags?: string[];
  rotation_overrides?: Record<string, Record<number, number>> | null;
}>();
```

After the existing `tags` block, add:
```ts
if ('rotation_overrides' in body) {
  updates.push('rotation_overrides = ?');
  vals.push(body.rotation_overrides != null ? JSON.stringify(body.rotation_overrides) : null);
}
```

- [ ] **Commit**

```bash
git add "functions/api/blueprints/[id].ts"
git commit -m "feat: expose rotation_overrides in blueprint GET/PATCH"
```

---

### Task 3: API client

**Files:**
- Modify: `src/lib/api.ts`

- [ ] **Add rotation_overrides to BlueprintDetail type**

```ts
export interface BlueprintDetail extends BlueprintMeta {
  user_id: string;
  blueprint_data: { ... } | null;
  rotation_overrides: Record<string, Record<number, number>> | null;
}
```

- [ ] **Add saveRotationOverrides function**

```ts
export async function saveRotationOverrides(
  id: string,
  overrides: Record<string, Record<number, number>> | null,
  getToken: () => Promise<string | null>
): Promise<void> {
  const headers = await authHeaders(getToken);
  const res = await fetch(`/api/blueprints/${id}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ rotation_overrides: overrides }),
  });
  if (!res.ok) throw new Error(`Failed to save rotation overrides: ${res.status}`);
}
```

- [ ] **Commit**

```bash
git add src/lib/api.ts
git commit -m "feat: add saveRotationOverrides to API client"
```

---

### Task 4: PieceManager user overrides layer

**Files:**
- Modify: `src/engine/PieceManager.ts`

The current rotation merge in `placePiece()` is `{ ...staticMap, ...devMap }`. Add `userOverrides` as a 3rd persistent layer between static and dev:

`ROTATION_BY_STORED` ← `userOverrides` (persisted, per-blueprint) ← `devOverrides` (live session)

- [ ] **Add userOverrides param to placePiece**

Change signature:
```ts
placePiece(
  id: string,
  templateId: string,
  position: Vector3,
  rotation: number,
  scale?: { x: number; y: number; z: number },
  devOverrides: Partial<Record<string, RotMap>> = {},
  userOverrides: Partial<Record<string, RotMap>> = {},
): PlacedMesh | null {
```

Change the merge block:
```ts
const staticMap  = ROTATION_BY_STORED[templateId];
const userMap    = userOverrides[templateId];
const devMap     = devOverrides[templateId];
const byStored = (staticMap || userMap || devMap)
  ? { ...staticMap, ...userMap, ...devMap }
  : undefined;
```

- [ ] **Add userOverrides param to applyDevOverrides**

```ts
applyDevOverrides(
  devOverrides: Partial<Record<string, RotMap>>,
  userOverrides: Partial<Record<string, RotMap>> = {},
): void {
  this.placedMeshes.forEach((placed) => {
    const devMap  = devOverrides[placed.templateId];
    const userMap = userOverrides[placed.templateId];
    if (!devMap && !userMap) return;
    const staticMap = ROTATION_BY_STORED[placed.templateId];
    const byStored = { ...staticMap, ...userMap, ...devMap };
    const extra = byStored[key] ?? (EXTRA_ROTATION[placed.templateId] ?? 0);
    placed.root.rotationQuaternion = placed.baseQuaternion.clone();
    placed.root.addRotation(0, degreesToRadians(placed.rotation + 90 + extra), 0);
  });
}
```

Note: the `key` variable comes from the existing canonicalization logic above — copy it inside the forEach:
```ts
const n = ((placed.rotation % 360) + 360) % 360;
const key = n > 180 ? n - 360 : n;
```

- [ ] **Commit**

```bash
git add src/engine/PieceManager.ts
git commit -m "feat: add userOverrides as 3rd rotation layer in PieceManager"
```

---

### Task 5: SceneCanvas passes user overrides

**Files:**
- Modify: `src/components/Scene/SceneCanvas.tsx`

- [ ] **Add userOverrides to SceneCanvasHandle**

```ts
export interface SceneCanvasHandle {
  applyDevOverrides: (
    devMap: Partial<Record<string, RotMap>>,
    userMap: Partial<Record<string, RotMap>>,
  ) => void;
}
```

- [ ] **Add userOverrides prop**

```ts
interface Props {
  ref?: React.Ref<SceneCanvasHandle>;
  onSelectPiece?: (piece: PlacedPiece | null) => void;
  initialDistanceScale?: number;
  initialBlueprint?: RawBlueprint;
  userRotationOverrides?: Partial<Record<string, RotMap>>;
}
```

- [ ] **Pass userOverrides into placePiece calls**

In the scene rebuild effect, change:
```ts
pm.placePiece(piece.id, piece.templateId, pos, piece.transform.rotation, piece.scale);
```
to:
```ts
pm.placePiece(piece.id, piece.templateId, pos, piece.transform.rotation, piece.scale, {}, userRotationOverrides ?? {});
```

- [ ] **Update useImperativeHandle**

```ts
useImperativeHandle(ref, () => ({
  applyDevOverrides: (devMap, userMap) =>
    pmRef.current?.applyDevOverrides(devMap, userMap),
}));
```

- [ ] **Add userRotationOverrides to scene rebuild deps**

```ts
}, [pieces, initialDistanceScale, userRotationOverrides]);
```

- [ ] **Commit**

```bash
git add src/components/Scene/SceneCanvas.tsx
git commit -m "feat: pass userRotationOverrides into PieceManager"
```

---

### Task 6: BlueprintDetailPage — wire everything together

**Files:**
- Modify: `src/pages/BlueprintDetailPage.tsx`

This task gates the R key behind `isOwner`, adds Shift+R counter-clockwise, loads saved overrides on mount, and auto-saves when the dev map changes (debounced 1s).

- [ ] **Add imports**

```ts
import { saveRotationOverrides } from '../lib/api';
```

- [ ] **Load saved overrides on mount**

After the blueprint is fetched (in the existing `getBlueprint` `.then()` block), initialize the dev map from saved overrides:
```ts
.then((bp) => {
  setBlueprint(bp);
  setEditTitle(bp.title);
  setEditPublic(!!bp.is_public);
  setEditTags(bp.tags ?? []);
  // Seed dev map from persisted overrides
  if (bp.rotation_overrides) {
    devMapRef.current = bp.rotation_overrides as Partial<Record<string, RotMap>>;
    setDevDisplayMap({ ...bp.rotation_overrides });
  }
})
```

- [ ] **Gate R key behind isOwner**

In the keydown handler useEffect, add at the top:
```ts
if (!selectedPiece || !isOwner) return;
```

- [ ] **Add Shift+R for counter-clockwise**

In `onKeyDown`, replace the current direction logic:
```ts
const onKeyDown = (e: KeyboardEvent) => {
  if (e.key !== 'r' && e.key !== 'R') return;
  e.preventDefault();
  const { templateId, transform: { rotation } } = selectedPiece;
  const n = ((rotation % 360) + 360) % 360;
  const key = n > 180 ? n - 360 : n;
  const current = devMapRef.current[templateId]?.[key] ?? 0;
  const idx = DEV_CYCLE.indexOf(current as typeof DEV_CYCLE[number]);
  // Shift+R goes counter-clockwise (backward through cycle)
  const step = e.shiftKey ? -1 : 1;
  const next = DEV_CYCLE[((idx + step) % DEV_CYCLE.length + DEV_CYCLE.length) % DEV_CYCLE.length];
  devMapRef.current = {
    ...devMapRef.current,
    [templateId]: { ...devMapRef.current[templateId], [key]: next },
  };
  sceneRef.current?.applyDevOverrides(devMapRef.current, devMapRef.current);
  setDevDisplayMap({ ...devMapRef.current });
  console.log('[DEV] ROTATION_BY_STORED override:', devMapRef.current);
};
```

Note: `applyDevOverrides` here passes `devMapRef.current` for both dev and user maps — in "owner editing" mode, the dev map IS the user map being built.

- [ ] **Auto-save overrides when devDisplayMap changes (debounced)**

```ts
useEffect(() => {
  if (!isOwner || !id) return;
  const timer = setTimeout(() => {
    const map = Object.keys(devMapRef.current).length > 0 ? devMapRef.current : null;
    saveRotationOverrides(id, map as Record<string, Record<number, number>> | null, getToken)
      .catch(console.error);
  }, 1000);
  return () => clearTimeout(timer);
}, [devDisplayMap, isOwner, id, getToken]);
```

- [ ] **Pass userRotationOverrides to SceneCanvas**

```tsx
<SceneCanvas
  ref={sceneRef}
  onSelectPiece={setSelectedPiece}
  initialDistanceScale={1}
  initialBlueprint={blueprint.blueprint_data as unknown as RawBlueprint}
  userRotationOverrides={devDisplayMap}
/>
```

- [ ] **Update HUD hint**

Change the "press R to add rotation override" line to show only when `isOwner`:
```tsx
{isOwner && (devVal !== undefined ? (
  <div style={{ color: '#7ec8e3', fontSize: 10 }}>
    [override] {devVal > 0 ? '+' : ''}{devVal}° · R / Shift+R to cycle
  </div>
) : (
  <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10 }}>
    R to add rotation override
  </div>
))}
```

- [ ] **Commit**

```bash
git add src/pages/BlueprintDetailPage.tsx
git commit -m "feat: owner-gated rotation overrides with persist and Shift+R"
```

---

### Task 7: Apply remote migration

- [ ] **Apply to remote Cloudflare D1 when ready to deploy**

```bash
npx wrangler d1 execute dune-blueprints --remote --file=migrations/0002_rotation_overrides.sql
```

Expected: `🚣 1 commands executed successfully.`

- [ ] **Build and verify**

```bash
npm run build
```

Expected: `✓ built in ~1s`
