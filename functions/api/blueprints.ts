import type { EventContext } from '@cloudflare/workers-types';
import type { Env } from '../env';
import { verifyAuth } from '../_lib/auth';

type Ctx = EventContext<Env, string, Record<string, unknown>>;

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const { request, env } = ctx;
  const url = new URL(request.url);
  const sort = url.searchParams.get('sort') ?? 'new';
  const tag = url.searchParams.get('tag');
  const mine = url.searchParams.get('mine') === 'true';

  const orderBy = sort === 'popular' ? 'download_count DESC' : 'created_at DESC';

  if (mine) {
    const userId = await verifyAuth(request, env);
    if (!userId) return json({ error: 'Unauthorized' }, 401);

    let query = `SELECT id, title, username, is_public, piece_count, file_size, tags, download_count, created_at
                 FROM blueprints WHERE user_id = ? ORDER BY ${orderBy}`;
    const params: unknown[] = [userId];

    if (tag) {
      query = `SELECT id, title, username, is_public, piece_count, file_size, tags, download_count, created_at
               FROM blueprints WHERE user_id = ? AND tags LIKE ? ORDER BY ${orderBy}`;
      params.push(`%"${tag}"%`);
    }

    const { results } = await env.DB.prepare(query).bind(...params).all();
    return json({ blueprints: results.map(deserialize) });
  }

  let query = `SELECT id, title, username, is_public, piece_count, file_size, tags, download_count, created_at
               FROM blueprints WHERE is_public = 1 ORDER BY ${orderBy}`;
  const params: unknown[] = [];

  if (tag) {
    query = `SELECT id, title, username, is_public, piece_count, file_size, tags, download_count, created_at
             FROM blueprints WHERE is_public = 1 AND tags LIKE ? ORDER BY ${orderBy}`;
    params.push(`%"${tag}"%`);
  }

  const { results } = await env.DB.prepare(query).bind(...params).all();
  return json({ blueprints: results.map(deserialize) });
}

function deserialize(row: Record<string, unknown>) {
  return { ...row, tags: row.tags ? JSON.parse(row.tags as string) : [] };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
