import type { EventContext } from '@cloudflare/workers-types';
import type { Env } from '../../../env';
import { verifyAuth } from '../../../_lib/auth';

type Ctx = EventContext<Env, 'id', Record<string, unknown>>;

interface BlueprintRow {
  title: string;
  r2_key: string;
  user_id: string;
  is_public: number;
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

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const { request, env, params } = ctx;
  const { id } = params;
  const url = new URL(request.url);
  const variantId = url.searchParams.get('v');

  const userId = await verifyAuth(request, env);
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  const row = await env.DB.prepare(
    'SELECT title, r2_key, user_id, is_public FROM blueprints WHERE id = ?'
  ).bind(id).first<BlueprintRow>();

  if (!row) return json({ error: 'Not found' }, 404);
  if (!row.is_public && row.user_id !== userId) return json({ error: 'Not found' }, 404);

  // Resolve overrides + the filename suffix from the chosen variant (if any).
  let variant: VariantRow | null = null;
  if (variantId) {
    variant = await env.DB.prepare(
      'SELECT id, name, piece_overrides FROM blueprint_variants WHERE id = ? AND blueprint_id = ?'
    ).bind(variantId, id).first<VariantRow>();
    if (!variant) return json({ error: 'Variant not found' }, 404);
  }

  const object = await env.BUCKET.get(row.r2_key);
  if (!object) return json({ error: 'File not found' }, 404);

  // Per-variant download counter if a variant was requested, otherwise the blueprint's.
  ctx.waitUntil(
    variant
      ? env.DB.prepare('UPDATE blueprint_variants SET download_count = download_count + 1 WHERE id = ?')
          .bind(variant.id).run()
      : env.DB.prepare('UPDATE blueprints SET download_count = download_count + 1 WHERE id = ?')
          .bind(id).run(),
  );

  const safeTitle = row.title.replace(/[^a-zA-Z0-9_-]/g, '_') || 'blueprint';
  const variantSuffix = variant ? `_${variant.name.replace(/[^a-zA-Z0-9_-]/g, '_')}` : '';
  const filename = `${safeTitle}${variantSuffix}.json`;

  // Parse + apply overrides only when we actually have any.
  let overrides: Record<string, string> | null = null;
  if (variant?.piece_overrides) {
    try {
      const parsed = JSON.parse(variant.piece_overrides);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        overrides = parsed as Record<string, string>;
      }
    } catch { /* malformed JSON — serve raw */ }
  }

  if (!overrides || Object.keys(overrides).length === 0) {
    return new Response(object.body, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '\\"')}"`,
      },
    });
  }

  const text = await object.text();
  let raw: RawBlueprint;
  try {
    raw = JSON.parse(text) as RawBlueprint;
  } catch {
    return new Response(text, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '\\"')}"`,
      },
    });
  }

  const swap = (t: string) => overrides[t] ?? t;
  const transformed: RawBlueprint = {
    ...raw,
    instances:  (raw.instances  ?? []).map((r) => ({ ...r, building_type: swap(r.building_type) })),
    placeables: (raw.placeables ?? []).map((r) => ({ ...r, building_type: swap(r.building_type) })),
  };

  return new Response(JSON.stringify(transformed), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '\\"')}"`,
    },
  });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
