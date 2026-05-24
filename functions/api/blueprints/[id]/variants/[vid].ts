import type { EventContext } from '@cloudflare/workers-types';
import type { Env } from '../../../../env';
import { verifyAuth } from '../../../../_lib/auth';

type Ctx = EventContext<Env, 'id' | 'vid', Record<string, unknown>>;

interface VariantRow {
  id: string;
  blueprint_id: string;
  name: string;
  description: string | null;
  piece_overrides: string | null;
  snapshot_url: string | null;
  download_count: number;
  rating_count: number;
  created_at: string;
}

const DESCRIPTION_MAX = 280;

// Single variant — owner-only auth on writes; reads inherit blueprint visibility.
async function loadVariant(env: Env, id: string, vid: string): Promise<VariantRow | null> {
  return await env.DB.prepare(
    `SELECT id, blueprint_id, name, description, piece_overrides, snapshot_url, download_count, rating_count, created_at
     FROM blueprint_variants WHERE id = ? AND blueprint_id = ?`,
  ).bind(vid, id).first<VariantRow>();
}

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const { env, params, request } = ctx;
  const { id, vid } = params;

  const bp = await env.DB.prepare(
    'SELECT user_id, is_public FROM blueprints WHERE id = ?'
  ).bind(id).first<{ user_id: string; is_public: number }>();
  if (!bp) return json({ error: 'Not found' }, 404);
  if (!bp.is_public) {
    const userId = await verifyAuth(request, env);
    if (bp.user_id !== userId) return json({ error: 'Not found' }, 404);
  }

  const v = await loadVariant(env, String(id), String(vid));
  if (!v) return json({ error: 'Not found' }, 404);
  return json({ variant: { ...v, piece_overrides: v.piece_overrides ? safeParseJson(v.piece_overrides) : null } });
}

export async function onRequestPatch(ctx: Ctx): Promise<Response> {
  const { request, env, params } = ctx;
  const { id, vid } = params;

  const userId = await verifyAuth(request, env);
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  const bp = await env.DB.prepare('SELECT user_id FROM blueprints WHERE id = ?')
    .bind(id).first<{ user_id: string }>();
  if (!bp) return json({ error: 'Not found' }, 404);
  if (bp.user_id !== userId) return json({ error: 'Forbidden' }, 403);

  const body = await request.json<{
    name?: string;
    description?: string | null;
    piece_overrides?: Record<string, string> | null;
  }>();
  const updates: string[] = [];
  const vals: unknown[] = [];

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name || name.length > 60) return json({ error: 'Name 1–60 chars' }, 400);
    updates.push('name = ?');
    vals.push(name);
  }
  if ('description' in body) {
    const d = body.description != null ? String(body.description).trim() : null;
    if (d && d.length > DESCRIPTION_MAX) {
      return json({ error: `Description max ${DESCRIPTION_MAX} chars` }, 400);
    }
    updates.push('description = ?');
    vals.push(d && d.length > 0 ? d : null);
  }
  if ('piece_overrides' in body) {
    if (body.piece_overrides != null && (typeof body.piece_overrides !== 'object' || Array.isArray(body.piece_overrides))) {
      return json({ error: 'piece_overrides must be an object' }, 400);
    }
    updates.push('piece_overrides = ?');
    vals.push(body.piece_overrides != null ? JSON.stringify(body.piece_overrides) : null);
  }
  if (!updates.length) return json({ error: 'Nothing to update' }, 400);

  vals.push(vid, id);
  await env.DB.prepare(
    `UPDATE blueprint_variants SET ${updates.join(', ')} WHERE id = ? AND blueprint_id = ?`,
  ).bind(...vals).run();

  const v = await loadVariant(env, String(id), String(vid));
  return json({ variant: v ? { ...v, piece_overrides: v.piece_overrides ? safeParseJson(v.piece_overrides) : null } : null });
}

export async function onRequestDelete(ctx: Ctx): Promise<Response> {
  const { request, env, params } = ctx;
  const { id, vid } = params;

  const userId = await verifyAuth(request, env);
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  const bp = await env.DB.prepare('SELECT user_id FROM blueprints WHERE id = ?')
    .bind(id).first<{ user_id: string }>();
  if (!bp) return json({ error: 'Not found' }, 404);
  if (bp.user_id !== userId) return json({ error: 'Forbidden' }, 403);

  await env.DB.prepare(
    'DELETE FROM blueprint_variants WHERE id = ? AND blueprint_id = ?',
  ).bind(vid, id).run();

  return json({ success: true });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function safeParseJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return null; }
}
