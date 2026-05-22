# Gallery Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two gallery features: (1) blueprint snapshot images that appear as cover art on gallery cards; (2) an upvote/like system with sort and filter in the gallery.

**Architecture:** Snapshots are images uploaded to R2 under `snapshots/:id` by the owner, with the public URL stored in a new `snapshot_url` column. Ratings are a separate `ratings` table (blueprint_id + user_id, unique pair = one vote per user). A `rating_count` denormalized column on `blueprints` is incremented/decremented on vote toggle for cheap sorting. Gallery gains a `top` sort option and the existing `BlueprintCard` gets a cover image slot.

**Tech Stack:** Cloudflare D1, Cloudflare R2, Cloudflare Pages Functions, React 19

---

## Files

| File | Change |
|------|--------|
| `migrations/0003_snapshots_ratings.sql` | Create — snapshot_url column + ratings table |
| `functions/api/blueprints/[id]/snapshot.ts` | Create — PUT endpoint for snapshot upload |
| `functions/api/blueprints/[id]/rate.ts` | Create — POST endpoint to toggle vote |
| `functions/api/blueprints/[id].ts` | Modify — include snapshot_url + rating_count in GET |
| `functions/api/blueprints.ts` | Modify — include snapshot_url + rating_count in list, add `top` sort |
| `functions/env.d.ts` | Verify — BUCKET binding already present |
| `src/lib/api.ts` | Modify — add snapshot_url + rating_count to types, add client functions |
| `src/components/BlueprintCard.tsx` | Modify — render cover image |
| `src/pages/BlueprintDetailPage.tsx` | Modify — snapshot upload UI (owner only) |
| `src/pages/GalleryPage.tsx` | Modify — add `top` sort option, rating display |

---

### Task 1: DB Migration

**Files:**
- Create: `migrations/0003_snapshots_ratings.sql`

- [ ] **Create migration**

```sql
ALTER TABLE blueprints ADD COLUMN snapshot_url TEXT;
ALTER TABLE blueprints ADD COLUMN rating_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS ratings (
  blueprint_id TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  PRIMARY KEY (blueprint_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ratings_blueprint_id ON ratings(blueprint_id);
CREATE INDEX IF NOT EXISTS idx_blueprints_rating_count ON blueprints(rating_count);
```

- [ ] **Apply locally**

```bash
npx wrangler d1 execute dune-blueprints --local --file=migrations/0003_snapshots_ratings.sql
```

Expected: `🚣 5 commands executed successfully.`

- [ ] **Commit**

```bash
git add migrations/0003_snapshots_ratings.sql
git commit -m "feat: snapshot_url + ratings schema"
```

---

### Task 2: Snapshot upload endpoint

**Files:**
- Create: `functions/api/blueprints/[id]/snapshot.ts`

Accepts a multipart form with a single `file` field (image). Validates file type and size. Uploads to R2 as `snapshots/:id`. Updates `snapshot_url` on the blueprint row. Returns the public URL.

The R2 bucket must be configured for public access — this is a Cloudflare dashboard setting. The URL format is `https://pub-<hash>.r2.dev/snapshots/:id` or your custom domain. For simplicity, construct the URL from an environment variable `VITE_CDN_BASE_URL` — pass it in as a worker binding or env var. Store whatever URL the upload produces.

- [ ] **Create snapshot endpoint**

```ts
// functions/api/blueprints/[id]/snapshot.ts
import type { EventContext } from '@cloudflare/workers-types';
import type { Env } from '../../../env';
import { verifyAuth } from '../../../_lib/auth';

type Ctx = EventContext<Env, 'id', Record<string, unknown>>;

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED  = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function onRequestPut(ctx: Ctx): Promise<Response> {
  const { request, env, params } = ctx;
  const { id } = params;

  const userId = await verifyAuth(request, env);
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  const row = await env.DB.prepare('SELECT user_id FROM blueprints WHERE id = ?')
    .bind(id).first<{ user_id: string }>();
  if (!row) return json({ error: 'Not found' }, 404);
  if (row.user_id !== userId) return json({ error: 'Forbidden' }, 403);

  const form = await request.formData();
  const file = form.get('file') as File | null;
  if (!file) return json({ error: 'No file provided' }, 400);
  if (!ALLOWED.has(file.type)) return json({ error: 'Must be jpeg/png/webp' }, 400);
  if (file.size > MAX_SIZE) return json({ error: 'Max 5MB' }, 400);

  const r2Key = `snapshots/${id}`;
  await env.BUCKET.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  // Construct URL — assumes R2 bucket is public with custom domain via CDN_BASE env var,
  // or falls back to a placeholder that can be updated later.
  const cdnBase = (env as Record<string, string>).CDN_BASE ?? '';
  const snapshotUrl = cdnBase ? `${cdnBase}/snapshots/${id}` : r2Key;

  await env.DB.prepare('UPDATE blueprints SET snapshot_url = ? WHERE id = ?')
    .bind(snapshotUrl, id).run();

  return json({ snapshot_url: snapshotUrl });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

- [ ] **Add CDN_BASE to env.d.ts if missing**

```ts
// functions/env.d.ts — add to Env interface:
CDN_BASE?: string;
```

- [ ] **Commit**

```bash
git add "functions/api/blueprints/[id]/snapshot.ts" functions/env.d.ts
git commit -m "feat: snapshot upload endpoint (PUT /api/blueprints/:id/snapshot)"
```

---

### Task 3: Rating (upvote toggle) endpoint

**Files:**
- Create: `functions/api/blueprints/[id]/rate.ts`

POST toggles: if the user hasn't voted, inserts a row and increments `rating_count`. If they have, deletes the row and decrements. Returns `{ rated: boolean, rating_count: number }`.

- [ ] **Create rate endpoint**

```ts
// functions/api/blueprints/[id]/rate.ts
import type { EventContext } from '@cloudflare/workers-types';
import type { Env } from '../../../env';
import { verifyAuth } from '../../../_lib/auth';

type Ctx = EventContext<Env, 'id', Record<string, unknown>>;

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const { request, env, params } = ctx;
  const { id } = params;

  const userId = await verifyAuth(request, env);
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  // Check blueprint exists and is public (or owner)
  const bp = await env.DB.prepare('SELECT user_id, is_public FROM blueprints WHERE id = ?')
    .bind(id).first<{ user_id: string; is_public: number }>();
  if (!bp) return json({ error: 'Not found' }, 404);
  if (!bp.is_public && bp.user_id !== userId) return json({ error: 'Not found' }, 404);

  // Check existing vote
  const existing = await env.DB.prepare(
    'SELECT 1 FROM ratings WHERE blueprint_id = ? AND user_id = ?'
  ).bind(id, userId).first();

  let rated: boolean;
  if (existing) {
    // Remove vote
    await env.DB.batch([
      env.DB.prepare('DELETE FROM ratings WHERE blueprint_id = ? AND user_id = ?').bind(id, userId),
      env.DB.prepare('UPDATE blueprints SET rating_count = MAX(0, rating_count - 1) WHERE id = ?').bind(id),
    ]);
    rated = false;
  } else {
    // Add vote
    await env.DB.batch([
      env.DB.prepare('INSERT INTO ratings (blueprint_id, user_id, created_at) VALUES (?, ?, ?)')
        .bind(id, userId, new Date().toISOString()),
      env.DB.prepare('UPDATE blueprints SET rating_count = rating_count + 1 WHERE id = ?').bind(id),
    ]);
    rated = true;
  }

  const updated = await env.DB.prepare('SELECT rating_count FROM blueprints WHERE id = ?')
    .bind(id).first<{ rating_count: number }>();

  return json({ rated, rating_count: updated?.rating_count ?? 0 });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

- [ ] **Commit**

```bash
git add "functions/api/blueprints/[id]/rate.ts"
git commit -m "feat: upvote toggle endpoint (POST /api/blueprints/:id/rate)"
```

---

### Task 4: Expose snapshot_url + rating_count in API responses

**Files:**
- Modify: `functions/api/blueprints.ts` (list endpoint)
- Modify: `functions/api/blueprints/[id].ts` (detail endpoint)

- [ ] **Add snapshot_url and rating_count to list SELECT**

In `functions/api/blueprints.ts`, the two SELECT queries (public and mine) both select explicit columns. Add `snapshot_url, rating_count` to each:

```ts
let query = `SELECT id, title, username, is_public, piece_count, file_size, tags,
             download_count, rating_count, snapshot_url, created_at
             FROM blueprints WHERE is_public = 1 ORDER BY ${orderBy}`;
```

And the same for the `mine` query.

- [ ] **Add `top` sort option**

```ts
const VALID_SORTS: Record<string, string> = {
  new:     'created_at DESC',
  popular: 'download_count DESC',
  top:     'rating_count DESC',
};
```

- [ ] **Add snapshot_url and rating_count to detail SELECT**

In `functions/api/blueprints/[id].ts`, add `snapshot_url, rating_count` to the SELECT. No parsing needed (both are raw values — TEXT and INTEGER).

- [ ] **Add user's existing vote to detail response**

In `onRequestGet`, after the blueprint row fetch, check if the authenticated user has voted:
```ts
let userRated = false;
if (userId) {
  const vote = await env.DB.prepare(
    'SELECT 1 FROM ratings WHERE blueprint_id = ? AND user_id = ?'
  ).bind(id, userId).first();
  userRated = !!vote;
}

return json({
  ...row,
  tags: safeParseJson(row.tags as string | null, []),
  blueprint_data: safeParseJson(row.blueprint_data as string | null, null),
  rotation_overrides: safeParseJson(row.rotation_overrides as string | null, null),
  user_rated: userRated,
});
```

- [ ] **Commit**

```bash
git add functions/api/blueprints.ts "functions/api/blueprints/[id].ts"
git commit -m "feat: include snapshot_url, rating_count, user_rated in API responses"
```

---

### Task 5: API client types and functions

**Files:**
- Modify: `src/lib/api.ts`

- [ ] **Add fields to BlueprintMeta**

```ts
export interface BlueprintMeta {
  id: string;
  title: string;
  username: string;
  is_public: 0 | 1;
  piece_count: number | null;
  file_size: number | null;
  tags: string[];
  download_count: number;
  rating_count: number;
  snapshot_url: string | null;
  created_at: string;
}
```

- [ ] **Add fields to BlueprintDetail**

```ts
export interface BlueprintDetail extends BlueprintMeta {
  user_id: string;
  blueprint_data: { ... } | null;
  rotation_overrides: Record<string, Record<number, number>> | null;
  user_rated: boolean;
}
```

- [ ] **Add uploadSnapshot function**

```ts
export async function uploadSnapshot(
  id: string,
  file: File,
  getToken: () => Promise<string | null>
): Promise<{ snapshot_url: string }> {
  const headers = await authHeaders(getToken);
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`/api/blueprints/${id}/snapshot`, {
    method: 'PUT',
    headers,
    body: form,
  });
  if (!res.ok) throw new Error(`Snapshot upload failed: ${res.status}`);
  return res.json() as Promise<{ snapshot_url: string }>;
}
```

- [ ] **Add rateBlueprint function**

```ts
export async function rateBlueprint(
  id: string,
  getToken: () => Promise<string | null>
): Promise<{ rated: boolean; rating_count: number }> {
  const headers = await authHeaders(getToken);
  const res = await fetch(`/api/blueprints/${id}/rate`, {
    method: 'POST',
    headers,
  });
  if (!res.ok) throw new Error(`Rate failed: ${res.status}`);
  return res.json() as Promise<{ rated: boolean; rating_count: number }>;
}
```

- [ ] **Add `top` to listBlueprints sort param type**

```ts
params: { sort?: 'new' | 'popular' | 'top'; tag?: string; mine?: boolean }
```

- [ ] **Commit**

```bash
git add src/lib/api.ts
git commit -m "feat: snapshot + rating API client functions"
```

---

### Task 6: BlueprintCard cover image

**Files:**
- Modify: `src/components/BlueprintCard.tsx`

- [ ] **Read current BlueprintCard to understand structure**

Check the existing component before editing — it renders title, author, piece count, tags, download count. Add `snapshot_url` and `rating_count` to its props/render.

- [ ] **Add snapshot cover image**

At the top of the card, before the title area, add:
```tsx
{blueprint.snapshot_url && (
  <div style={{
    width: '100%',
    aspectRatio: '16 / 9',
    overflow: 'hidden',
    borderRadius: '6px 6px 0 0',
    background: '#0a0a0f',
  }}>
    <img
      src={blueprint.snapshot_url}
      alt={blueprint.title}
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      loading="lazy"
    />
  </div>
)}
```

- [ ] **Add rating count display**

Next to the download count, add:
```tsx
<span>♥ {blueprint.rating_count}</span>
```

- [ ] **Commit**

```bash
git add src/components/BlueprintCard.tsx
git commit -m "feat: cover image and rating count on BlueprintCard"
```

---

### Task 7: Snapshot upload UI on detail page

**Files:**
- Modify: `src/pages/BlueprintDetailPage.tsx`

Owner-only. A file input button in the sidebar that triggers upload and updates the local state.

- [ ] **Add import**

```ts
import { uploadSnapshot } from '../lib/api';
```

- [ ] **Add snapshot state**

```ts
const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
```

Initialize from blueprint data in the fetch `.then()`:
```ts
setSnapshotUrl(bp.snapshot_url ?? null);
```

- [ ] **Add upload handler**

```ts
async function handleSnapshotUpload(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (!file || !id) return;
  try {
    const { snapshot_url } = await uploadSnapshot(id, file, getToken);
    setSnapshotUrl(snapshot_url);
  } catch (err) {
    console.error('Snapshot upload failed', err);
  }
}
```

- [ ] **Render upload button in sidebar (owner only)**

In the owner controls section, after the Edit/Delete buttons:
```tsx
{isOwner && (
  <label style={{
    display: 'block',
    textAlign: 'center',
    background: '#1e1e2e',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 4,
    color: '#aaa',
    fontSize: 12,
    padding: '6px 0',
    cursor: 'pointer',
  }}>
    📷 {snapshotUrl ? 'Replace Cover' : 'Add Cover Photo'}
    <input
      type="file"
      accept="image/jpeg,image/png,image/webp"
      style={{ display: 'none' }}
      onChange={handleSnapshotUpload}
    />
  </label>
)}
```

- [ ] **Show preview in sidebar if snapshot exists**

Above the title section:
```tsx
{snapshotUrl && (
  <img
    src={snapshotUrl}
    alt="Cover"
    style={{ width: '100%', borderRadius: 6, objectFit: 'cover', aspectRatio: '16/9' }}
  />
)}
```

- [ ] **Commit**

```bash
git add src/pages/BlueprintDetailPage.tsx
git commit -m "feat: snapshot upload UI on blueprint detail page"
```

---

### Task 8: Rating button on detail page

**Files:**
- Modify: `src/pages/BlueprintDetailPage.tsx`

- [ ] **Add import**

```ts
import { rateBlueprint } from '../lib/api';
```

- [ ] **Add rating state**

```ts
const [userRated, setUserRated] = useState(false);
const [ratingCount, setRatingCount] = useState(0);
```

Initialize in fetch `.then()`:
```ts
setUserRated(bp.user_rated ?? false);
setRatingCount(bp.rating_count ?? 0);
```

- [ ] **Add rate handler**

```ts
async function handleRate() {
  if (!id || !isSignedIn) return;
  try {
    const { rated, rating_count } = await rateBlueprint(id, getToken);
    setUserRated(rated);
    setRatingCount(rating_count);
  } catch (err) {
    console.error('Rate failed', err);
  }
}
```

- [ ] **Render rating button in sidebar**

After the download button:
```tsx
{isSignedIn ? (
  <button
    onClick={handleRate}
    style={{
      width: '100%',
      background: userRated ? 'rgba(200,50,50,0.2)' : 'transparent',
      border: `1px solid ${userRated ? 'rgba(200,50,50,0.5)' : 'rgba(255,255,255,0.15)'}`,
      borderRadius: 6,
      color: userRated ? '#e05555' : 'rgba(255,255,255,0.4)',
      padding: '9px 0',
      fontSize: 13,
      cursor: 'pointer',
    }}
  >
    {userRated ? '♥' : '♡'} {ratingCount} {userRated ? 'Liked' : 'Like'}
  </button>
) : null}
```

- [ ] **Commit**

```bash
git add src/pages/BlueprintDetailPage.tsx
git commit -m "feat: like/unlike button on blueprint detail page"
```

---

### Task 9: Gallery sort by top + rating display

**Files:**
- Modify: `src/pages/GalleryPage.tsx`

- [ ] **Add `top` to sort options**

In the sort UI (wherever `sort` state is controlled), add:
```tsx
<option value="top">Top Rated</option>
```

And update the type: `useState<'new' | 'popular' | 'top'>('new')`.

- [ ] **Show rating count on BlueprintCard in gallery**

The `BlueprintCard` already receives the full `BlueprintMeta` object — since we added `rating_count` to the type and render it on the card in Task 6, this works automatically.

- [ ] **Commit**

```bash
git add src/pages/GalleryPage.tsx
git commit -m "feat: top-rated sort option in gallery"
```

---

### Task 10: Apply remote migration + build

- [ ] **Apply to remote Cloudflare D1**

```bash
npx wrangler d1 execute dune-blueprints --remote --file=migrations/0003_snapshots_ratings.sql
```

- [ ] **Build**

```bash
npm run build
```

Expected: `✓ built in ~1s`

- [ ] **Manual test checklist**
  - Gallery: sort by Top Rated — cards with ratings sort to top
  - Blueprint detail: Like button toggles ♥/♡, count updates
  - Owner: cover photo upload → image appears on card and sidebar
  - Non-owner: no upload button visible
  - Gallery cards: cover image shows for blueprints with snapshots
  - Download still goes directly to R2 (unaffected by all changes)
