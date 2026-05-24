import type { EventContext } from '@cloudflare/workers-types';
import type { Env } from '../../../env';
import { verifyAuth } from '../../../_lib/auth';

type Ctx = EventContext<Env, 'id', Record<string, unknown>>;

// Toggle the rating for either the blueprint (no ?v) or a specific variant
// (?v=<vid>). Ratings are tracked separately so a user can like the original
// AND a Harkonnen variant independently. rating_count is mirrored on the row
// it targets (blueprints or blueprint_variants) for fast read access.
export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const { request, env, params } = ctx;
  const { id } = params;
  const url = new URL(request.url);
  const variantId = url.searchParams.get('v');

  const userId = await verifyAuth(request, env);
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  const bp = await env.DB.prepare('SELECT user_id, is_public FROM blueprints WHERE id = ?')
    .bind(id).first<{ user_id: string; is_public: number }>();
  if (!bp) return json({ error: 'Not found' }, 404);
  if (!bp.is_public && bp.user_id !== userId) return json({ error: 'Not found' }, 404);

  if (variantId) {
    const variant = await env.DB.prepare(
      'SELECT id FROM blueprint_variants WHERE id = ? AND blueprint_id = ?',
    ).bind(variantId, id).first<{ id: string }>();
    if (!variant) return json({ error: 'Variant not found' }, 404);
  }

  // SQLite NULL handling: comparisons against NULL fail, so blueprint-level
  // ratings need IS NULL while variant-level use the equality check.
  const existingQuery = variantId
    ? 'SELECT 1 FROM ratings WHERE blueprint_id = ? AND variant_id = ? AND user_id = ?'
    : 'SELECT 1 FROM ratings WHERE blueprint_id = ? AND variant_id IS NULL AND user_id = ?';
  const existingArgs = variantId ? [id, variantId, userId] : [id, userId];
  const existing = await env.DB.prepare(existingQuery).bind(...existingArgs).first();

  const deleteQuery = variantId
    ? 'DELETE FROM ratings WHERE blueprint_id = ? AND variant_id = ? AND user_id = ?'
    : 'DELETE FROM ratings WHERE blueprint_id = ? AND variant_id IS NULL AND user_id = ?';
  const deleteArgs = variantId ? [id, variantId, userId] : [id, userId];

  const decrementCounter = variantId
    ? env.DB.prepare('UPDATE blueprint_variants SET rating_count = MAX(0, rating_count - 1) WHERE id = ?').bind(variantId)
    : env.DB.prepare('UPDATE blueprints SET rating_count = MAX(0, rating_count - 1) WHERE id = ?').bind(id);
  const incrementCounter = variantId
    ? env.DB.prepare('UPDATE blueprint_variants SET rating_count = rating_count + 1 WHERE id = ?').bind(variantId)
    : env.DB.prepare('UPDATE blueprints SET rating_count = rating_count + 1 WHERE id = ?').bind(id);

  let rated: boolean;
  if (existing) {
    await env.DB.batch([
      env.DB.prepare(deleteQuery).bind(...deleteArgs),
      decrementCounter,
    ]);
    rated = false;
  } else {
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO ratings (blueprint_id, variant_id, user_id, created_at) VALUES (?, ?, ?, ?)',
      ).bind(id, variantId, userId, new Date().toISOString()),
      incrementCounter,
    ]);
    rated = true;
  }

  const updated = variantId
    ? await env.DB.prepare('SELECT rating_count FROM blueprint_variants WHERE id = ?')
        .bind(variantId).first<{ rating_count: number }>()
    : await env.DB.prepare('SELECT rating_count FROM blueprints WHERE id = ?')
        .bind(id).first<{ rating_count: number }>();

  return json({ rated, rating_count: updated?.rating_count ?? 0 });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
