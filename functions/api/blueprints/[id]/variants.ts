import type { EventContext } from '@cloudflare/workers-types';
import type { Env } from '../../../env';
import { verifyAuth } from '../../../_lib/auth';

type Ctx = EventContext<Env, 'id', Record<string, unknown>>;

interface VariantRow {
  id: string;
  blueprint_id: string;
  name: string;
  piece_overrides: string | null;
  snapshot_url: string | null;
  download_count: number;
  created_at: string;
}

// List all variants for a blueprint.
export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const { env, params, request } = ctx;
  const { id } = params;

  const bp = await env.DB.prepare(
    'SELECT user_id, is_public FROM blueprints WHERE id = ?'
  ).bind(id).first<{ user_id: string; is_public: number }>();
  if (!bp) return json({ error: 'Not found' }, 404);

  if (!bp.is_public) {
    const userId = await verifyAuth(request, env);
    if (bp.user_id !== userId) return json({ error: 'Not found' }, 404);
  }

  const rows = await env.DB.prepare(
    `SELECT id, name, piece_overrides, snapshot_url, download_count, created_at
     FROM blueprint_variants WHERE blueprint_id = ?
     ORDER BY created_at ASC`,
  ).bind(id).all<VariantRow>();

  const variants = (rows.results ?? []).map((r) => ({
    ...r,
    piece_overrides: r.piece_overrides ? safeParseJson(r.piece_overrides) : null,
  }));

  return json({ variants });
}

// Create a new variant (owner only).
export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const { request, env, params } = ctx;
  const { id } = params;

  const userId = await verifyAuth(request, env);
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  const bp = await env.DB.prepare('SELECT user_id FROM blueprints WHERE id = ?')
    .bind(id).first<{ user_id: string }>();
  if (!bp) return json({ error: 'Not found' }, 404);
  if (bp.user_id !== userId) return json({ error: 'Forbidden' }, 403);

  const body = await request.json<{
    name?: string;
    piece_overrides?: Record<string, string> | null;
  }>();

  const name = (body.name ?? '').trim();
  if (!name || name.length > 60) return json({ error: 'Name 1–60 chars' }, 400);
  if (body.piece_overrides != null && (typeof body.piece_overrides !== 'object' || Array.isArray(body.piece_overrides))) {
    return json({ error: 'piece_overrides must be an object' }, 400);
  }

  const variantId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO blueprint_variants (id, blueprint_id, name, piece_overrides)
     VALUES (?, ?, ?, ?)`,
  ).bind(
    variantId,
    id,
    name,
    body.piece_overrides ? JSON.stringify(body.piece_overrides) : null,
  ).run();

  const row = await env.DB.prepare(
    `SELECT id, name, piece_overrides, snapshot_url, download_count, created_at
     FROM blueprint_variants WHERE id = ?`,
  ).bind(variantId).first<VariantRow>();

  return json({
    variant: row ? { ...row, piece_overrides: row.piece_overrides ? safeParseJson(row.piece_overrides) : null } : null,
  });
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
