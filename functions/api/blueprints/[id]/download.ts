import type { EventContext } from '@cloudflare/workers-types';
import type { Env } from '../../../env';
import { verifyAuth } from '../../../_lib/auth';

type Ctx = EventContext<Env, 'id', Record<string, unknown>>;

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const { request, env, params } = ctx;
  const { id } = params;

  const userId = await verifyAuth(request, env);
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  const row = await env.DB.prepare(
    'SELECT title, r2_key, user_id, is_public FROM blueprints WHERE id = ?'
  ).bind(id).first<{ title: string; r2_key: string; user_id: string; is_public: number }>();

  if (!row) return json({ error: 'Not found' }, 404);
  if (!row.is_public && row.user_id !== userId) return json({ error: 'Not found' }, 404);

  const object = await env.BUCKET.get(row.r2_key);
  if (!object) return json({ error: 'File not found' }, 404);

  // Increment download_count asynchronously — don't block the response
  ctx.waitUntil(
    env.DB.prepare('UPDATE blueprints SET download_count = download_count + 1 WHERE id = ?')
      .bind(id).run()
  );

  const filename = `${row.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
  return new Response(object.body, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
