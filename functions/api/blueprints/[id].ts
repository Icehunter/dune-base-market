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
            tags, download_count, rating_count, snapshot_url, created_at, blueprint_data,
            rotation_overrides
     FROM blueprints WHERE id = ?`
  ).bind(id).first<Record<string, unknown>>();

  if (!row) return json({ error: 'Not found' }, 404);

  // Private blueprint: only owner can view
  if (!row.is_public && row.user_id !== userId) {
    return json({ error: 'Not found' }, 404);
  }

  let userRated = false;
  if (userId) {
    const vote = await env.DB.prepare(
      'SELECT 1 FROM ratings WHERE blueprint_id = ? AND user_id = ?'
    ).bind(id, userId).first();
    userRated = !!vote;
  }

  const variants = await env.DB.prepare(
    `SELECT id, name, snapshot_url, download_count, created_at
     FROM blueprint_variants WHERE blueprint_id = ?
     ORDER BY created_at ASC`,
  ).bind(id).all<{ id: string; name: string; snapshot_url: string | null; download_count: number; created_at: string }>();

  return json({
    ...row,
    tags: safeParseJson(row.tags as string | null, []),
    blueprint_data: safeParseJson(row.blueprint_data as string | null, null),
    rotation_overrides: safeParseJson(row.rotation_overrides as string | null, null),
    user_rated: userRated,
    variants: variants.results ?? [],
  });
}

export async function onRequestPatch(ctx: Ctx): Promise<Response> {
  const { request, env, params } = ctx;
  const { id } = params;
  const userId = await verifyAuth(request, env);
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  const row = await env.DB.prepare('SELECT user_id, r2_key FROM blueprints WHERE id = ?')
    .bind(id).first<{ user_id: string; r2_key: string }>();
  if (!row) return json({ error: 'Not found' }, 404);
  if (row.user_id !== userId) return json({ error: 'Forbidden' }, 403);

  // Multipart: replace blueprint JSON file
  const contentType = request.headers.get('Content-Type') ?? '';
  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return json({ error: 'Missing file' }, 400);
    if (file.size > 2 * 1024 * 1024) return json({ error: 'File too large (max 2MB)' }, 413);

    const jsonText = await file.text();
    let raw: { instances?: unknown[]; placeables?: unknown[] };
    try {
      raw = JSON.parse(jsonText);
    } catch {
      return json({ error: 'Invalid blueprint JSON' }, 400);
    }

    const pieceCount = (raw.instances?.length ?? 0) + (raw.placeables?.length ?? 0);
    await env.BUCKET.put(row.r2_key, jsonText, { httpMetadata: { contentType: 'application/json' } });
    await env.DB.prepare(
      'UPDATE blueprints SET blueprint_data = ?, piece_count = ?, file_size = ? WHERE id = ?'
    ).bind(jsonText, pieceCount, file.size, id).run();

    return json({ success: true, piece_count: pieceCount, file_size: file.size });
  }

  const body = await request.json<{
    title?: string;
    is_public?: boolean;
    tags?: string[];
    rotation_overrides?: Record<string, Record<number, number>> | null;
  }>();
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
  if ('rotation_overrides' in body) {
    updates.push('rotation_overrides = ?');
    vals.push(body.rotation_overrides != null ? JSON.stringify(body.rotation_overrides) : null);
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
