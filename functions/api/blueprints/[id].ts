import type { EventContext } from '@cloudflare/workers-types';
import type { Env } from '../../env';
import { verifyAuth } from '../../_lib/auth';

type Ctx = EventContext<Env, 'id', Record<string, unknown>>;

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const { request, env, params } = ctx;
  const { id } = params;
  const userId = await verifyAuth(request, env);

  const row = await env.DB.prepare(
    `SELECT id, title, username, user_id, is_public, piece_count, file_size,
            tags, download_count, created_at, blueprint_data
     FROM blueprints WHERE id = ?`
  ).bind(id).first<Record<string, unknown>>();

  if (!row) return json({ error: 'Not found' }, 404);

  // Private blueprint: only owner can view
  if (!row.is_public && row.user_id !== userId) {
    return json({ error: 'Not found' }, 404);
  }

  return json({
    ...row,
    tags: safeParseJson(row.tags as string | null, []),
    blueprint_data: safeParseJson(row.blueprint_data as string | null, null),
  });
}

export async function onRequestPatch(ctx: Ctx): Promise<Response> {
  const { request, env, params } = ctx;
  const { id } = params;
  const userId = await verifyAuth(request, env);
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  const row = await env.DB.prepare('SELECT user_id FROM blueprints WHERE id = ?')
    .bind(id).first<{ user_id: string }>();
  if (!row) return json({ error: 'Not found' }, 404);
  if (row.user_id !== userId) return json({ error: 'Forbidden' }, 403);

  const body = await request.json<{ title?: string; is_public?: boolean; tags?: string[] }>();
  const updates: string[] = [];
  const vals: unknown[] = [];

  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (!title || title.length > 80) return json({ error: 'Invalid title' }, 400);
    updates.push('title = ?');
    vals.push(title);
  }
  if (body.is_public !== undefined) {
    updates.push('is_public = ?');
    vals.push(body.is_public ? 1 : 0);
  }
  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags)) return json({ error: 'tags must be an array' }, 400);
    updates.push('tags = ?');
    vals.push(JSON.stringify(body.tags));
  }
  if (!updates.length) return json({ error: 'Nothing to update' }, 400);

  vals.push(id);
  await env.DB.prepare(`UPDATE blueprints SET ${updates.join(', ')} WHERE id = ?`).bind(...vals).run();
  return json({ success: true });
}

export async function onRequestDelete(ctx: Ctx): Promise<Response> {
  const { request, env, params } = ctx;
  const { id } = params;
  const userId = await verifyAuth(request, env);
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  const row = await env.DB.prepare('SELECT user_id, r2_key FROM blueprints WHERE id = ?')
    .bind(id).first<{ user_id: string; r2_key: string }>();
  if (!row) return json({ error: 'Not found' }, 404);
  if (row.user_id !== userId) return json({ error: 'Forbidden' }, 403);

  await env.BUCKET.delete(row.r2_key);
  await env.DB.prepare('DELETE FROM blueprints WHERE id = ?').bind(id).run();
  return json({ success: true });
}

function safeParseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
