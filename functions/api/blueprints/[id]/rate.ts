import type { EventContext } from '@cloudflare/workers-types';
import type { Env } from '../../../env';
import { verifyAuth } from '../../../_lib/auth';

type Ctx = EventContext<Env, 'id', Record<string, unknown>>;

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const { request, env, params } = ctx;
  const { id } = params;

  const userId = await verifyAuth(request, env);
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  const bp = await env.DB.prepare('SELECT user_id, is_public FROM blueprints WHERE id = ?')
    .bind(id).first<{ user_id: string; is_public: number }>();
  if (!bp) return json({ error: 'Not found' }, 404);
  if (!bp.is_public && bp.user_id !== userId) return json({ error: 'Not found' }, 404);

  const existing = await env.DB.prepare(
    'SELECT 1 FROM ratings WHERE blueprint_id = ? AND user_id = ?'
  ).bind(id, userId).first();

  let rated: boolean;
  if (existing) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM ratings WHERE blueprint_id = ? AND user_id = ?').bind(id, userId),
      env.DB.prepare('UPDATE blueprints SET rating_count = MAX(0, rating_count - 1) WHERE id = ?').bind(id),
    ]);
    rated = false;
  } else {
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
