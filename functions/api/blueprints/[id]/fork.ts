import type { EventContext } from '@cloudflare/workers-types';
import type { Env } from '../../../env';
import { verifyAuth } from '../../../_lib/auth';

type Ctx = EventContext<Env, 'id', Record<string, unknown>>;

interface SourceRow {
  title: string;
  r2_key: string;
  user_id: string;
  is_public: number;
  tags: string | null;
}

interface VariantRow {
  id: string;
  name: string;
  piece_overrides: string | null;
}

interface RawBlueprint {
  instances?: Array<{ building_type: string; [k: string]: unknown }>;
  placeables?: Array<{ building_type: string; [k: string]: unknown }>;
  [k: string]: unknown;
}

// Fork a blueprint (optionally a specific variant) into a new blueprint
// owned by the requesting user. Any variant overrides are baked into the
// stored JSON — the fork is a fully-independent copy with no back-link.
export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const { request, env, params } = ctx;
  const { id } = params;
  const url = new URL(request.url);
  const variantId = url.searchParams.get('v');

  const userId = await verifyAuth(request, env);
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  const source = await env.DB.prepare(
    'SELECT title, r2_key, user_id, is_public, tags FROM blueprints WHERE id = ?'
  ).bind(id).first<SourceRow>();
  if (!source) return json({ error: 'Not found' }, 404);
  if (!source.is_public && source.user_id !== userId) return json({ error: 'Not found' }, 404);

  let variant: VariantRow | null = null;
  if (variantId) {
    variant = await env.DB.prepare(
      'SELECT id, name, piece_overrides FROM blueprint_variants WHERE id = ? AND blueprint_id = ?'
    ).bind(variantId, id).first<VariantRow>();
    if (!variant) return json({ error: 'Variant not found' }, 404);
  }

  const object = await env.BUCKET.get(source.r2_key);
  if (!object) return json({ error: 'Source file not found' }, 404);

  let jsonText = await object.text();
  if (variant?.piece_overrides) {
    try {
      const overrides = JSON.parse(variant.piece_overrides) as Record<string, string>;
      if (overrides && typeof overrides === 'object' && !Array.isArray(overrides) && Object.keys(overrides).length > 0) {
        const raw = JSON.parse(jsonText) as RawBlueprint;
        const swap = (t: string) => overrides[t] ?? t;
        const transformed: RawBlueprint = {
          ...raw,
          instances:  (raw.instances  ?? []).map((r) => ({ ...r, building_type: swap(r.building_type) })),
          placeables: (raw.placeables ?? []).map((r) => ({ ...r, building_type: swap(r.building_type) })),
        };
        jsonText = JSON.stringify(transformed);
      }
    } catch { /* malformed overrides — keep raw */ }
  }

  let raw: RawBlueprint;
  try { raw = JSON.parse(jsonText) as RawBlueprint; }
  catch { return json({ error: 'Source JSON unparseable' }, 500); }

  const pieceCount = (raw.instances?.length ?? 0) + (raw.placeables?.length ?? 0);
  const fileSize = new Blob([jsonText]).size;

  const username = await fetchClerkUsername(userId, env.CLERK_SECRET_KEY);
  const newId = crypto.randomUUID();
  const r2Key = `blueprints/${newId}.json`;

  // Title: include variant name if forked from a variant, plus a (fork) marker
  // so the user can quickly distinguish their copy from the source.
  const baseTitle = variant ? `${source.title} — ${variant.name}` : source.title;
  const newTitle = `${baseTitle} (fork)`.slice(0, 80);

  await env.BUCKET.put(r2Key, jsonText, { httpMetadata: { contentType: 'application/json' } });

  await env.DB.prepare(
    `INSERT INTO blueprints (id, user_id, username, title, is_public, r2_key, piece_count, file_size, tags, blueprint_data, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    newId, userId, username, newTitle, 0 /* fork starts private */, r2Key,
    pieceCount, fileSize, source.tags ?? '[]', jsonText,
    new Date().toISOString(),
  ).run();

  return json({ id: newId }, 201);
}

async function fetchClerkUsername(userId: string, secretKey: string): Promise<string> {
  try {
    const res = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    if (!res.ok) return 'unknown';
    const user = await res.json<{ username?: string; first_name?: string; last_name?: string }>();
    return user.username ?? ([user.first_name, user.last_name].filter(Boolean).join(' ') || 'unknown');
  } catch {
    return 'unknown';
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
