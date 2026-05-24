import type { EventContext } from '@cloudflare/workers-types';
import type { Env } from '../../../../../env';
import { verifyAuth } from '../../../../../_lib/auth';

type Ctx = EventContext<Env, 'id' | 'vid', Record<string, unknown>>;

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED  = new Set(['image/jpeg', 'image/png', 'image/webp']);

// Per-variant snapshot upload. R2 key: snapshots/<blueprintId>/v/<variantId>
// so the public snapshot endpoint for the blueprint stays untouched.
export async function onRequestPut(ctx: Ctx): Promise<Response> {
  const { request, env, params } = ctx;
  const { id, vid } = params;

  const userId = await verifyAuth(request, env);
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  const bp = await env.DB.prepare('SELECT user_id FROM blueprints WHERE id = ?')
    .bind(id).first<{ user_id: string }>();
  if (!bp) return json({ error: 'Not found' }, 404);
  if (bp.user_id !== userId) return json({ error: 'Forbidden' }, 403);

  const variant = await env.DB.prepare(
    'SELECT id FROM blueprint_variants WHERE id = ? AND blueprint_id = ?'
  ).bind(vid, id).first<{ id: string }>();
  if (!variant) return json({ error: 'Variant not found' }, 404);

  const form = await request.formData();
  const file = form.get('file') as File | null;
  if (!file) return json({ error: 'No file provided' }, 400);
  if (!ALLOWED.has(file.type)) return json({ error: 'Must be jpeg/png/webp' }, 400);
  if (file.size > MAX_SIZE) return json({ error: 'Max 5MB' }, 400);

  const r2Key = `snapshots/${id}/v/${vid}`;
  await env.SNAPSHOT_BUCKET.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  const cdnBase = (env as Record<string, string>).CDN_BASE ?? '';
  const snapshotUrl = cdnBase
    ? `${cdnBase}/${r2Key}`
    : `/api/blueprints/${id}/variants/${vid}/snapshot`;

  await env.DB.prepare(
    'UPDATE blueprint_variants SET snapshot_url = ? WHERE id = ? AND blueprint_id = ?'
  ).bind(snapshotUrl, vid, id).run();

  return json({ snapshot_url: snapshotUrl });
}

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const { env, params } = ctx;
  const { id, vid } = params;

  const obj = await env.SNAPSHOT_BUCKET.get(`snapshots/${id}/v/${vid}`);
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
