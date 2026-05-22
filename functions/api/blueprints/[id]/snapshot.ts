import type { EventContext } from '@cloudflare/workers-types';
import type { Env } from '../../../env';
import { verifyAuth } from '../../../_lib/auth';

type Ctx = EventContext<Env, 'id', Record<string, unknown>>;

const MAX_SIZE = 5 * 1024 * 1024;
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

  const cdnBase = (env as Record<string, string>).CDN_BASE ?? '';
  const snapshotUrl = cdnBase
    ? `${cdnBase}/snapshots/${id}`
    : `/api/blueprints/${id}/snapshot`;

  await env.DB.prepare('UPDATE blueprints SET snapshot_url = ? WHERE id = ?')
    .bind(snapshotUrl, id).run();

  return json({ snapshot_url: snapshotUrl });
}

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const { env, params } = ctx;
  const { id } = params;

  const obj = await env.BUCKET.get(`snapshots/${id}`);
  if (!obj) return new Response('Not found', { status: 404 });

  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType ?? 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
