import type { EventContext } from '@cloudflare/workers-types';
import type { Env } from '../env';
import { verifyAuth } from '../_lib/auth';

type Ctx = EventContext<Env, string, Record<string, unknown>>;

const VALID_SORTS: Record<string, string> = {
  new:     'created_at DESC',
  popular: 'download_count DESC',
  top:     'rating_count DESC',
};

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const { request, env } = ctx;
  const url = new URL(request.url);
  const sort = url.searchParams.get('sort') ?? 'new';
  const tag = url.searchParams.get('tag');
  const mine = url.searchParams.get('mine') === 'true';

  if (tag && !/^[a-zA-Z0-9_-]+$/.test(tag)) {
    return json({ error: 'Invalid tag' }, 400);
  }

  const orderBy = VALID_SORTS[sort] ?? 'created_at DESC';

  if (mine) {
    const userId = await verifyAuth(request, env);
    if (!userId) return json({ error: 'Unauthorized' }, 401);

    let query = `SELECT id, title, username, is_public, piece_count, file_size, tags, download_count, rating_count, snapshot_url, created_at
                 FROM blueprints WHERE user_id = ? ORDER BY ${orderBy}`;
    const params: unknown[] = [userId];

    if (tag) {
      query = `SELECT id, title, username, is_public, piece_count, file_size, tags, download_count, rating_count, snapshot_url, created_at
               FROM blueprints WHERE user_id = ? AND tags LIKE ? ORDER BY ${orderBy}`;
      params.push(`%"${tag}"%`);
    }

    const { results } = await env.DB.prepare(query).bind(...params).all();
    return json({ blueprints: results.map(deserialize) });
  }

  let query = `SELECT id, title, username, is_public, piece_count, file_size, tags, download_count, rating_count, snapshot_url, created_at
               FROM blueprints WHERE is_public = 1 ORDER BY ${orderBy}`;
  const params: unknown[] = [];

  if (tag) {
    query = `SELECT id, title, username, is_public, piece_count, file_size, tags, download_count, rating_count, snapshot_url, created_at
             FROM blueprints WHERE is_public = 1 AND tags LIKE ? ORDER BY ${orderBy}`;
    params.push(`%"${tag}"%`);
  }

  const { results } = await env.DB.prepare(query).bind(...params).all();
  return json({ blueprints: results.map(deserialize) });
}

function deserialize(row: Record<string, unknown>) {
  let tags: unknown[] = [];
  if (row.tags) {
    try {
      tags = JSON.parse(row.tags as string);
    } catch {
      tags = [];
    }
  }
  return { ...row, tags };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface RawBlueprint {
  instances: { building_type: string }[];
  placeables: { building_type: string }[];
}

export function extractBlueprintTags(jsonText: string): string[] {
  const raw: RawBlueprint = JSON.parse(jsonText); // throws on invalid JSON
  const allTypes = [
    ...(raw.instances ?? []).map((i) => i.building_type),
    ...(raw.placeables ?? []).map((p) => p.building_type),
  ];
  const categories = new Set(allTypes.map(categoryFromType).filter(Boolean));
  return [...categories];
}

function tagsFromRaw(raw: RawBlueprint): string[] {
  const allTypes = [
    ...(raw.instances ?? []).map((i) => i.building_type),
    ...(raw.placeables ?? []).map((p) => p.building_type),
  ];
  return [...new Set(allTypes.map(categoryFromType).filter(Boolean))];
}

function categoryFromType(id: string): string {
  const l = id.toLowerCase();
  if (l.includes('foundation')) return 'Foundation';
  if (l.includes('wall'))       return 'Wall';
  if (l.includes('floor'))      return 'Floor';
  if (l.includes('roof') || l.includes('rooftop')) return 'Rooftop';
  if (l.includes('ramp'))       return 'Ramp';
  if (l.includes('stair'))      return 'Stairs';
  if (l.includes('pillar') || l.includes('column')) return 'Pillar';
  if (l.includes('door') || l.includes('window'))   return 'Door';
  return 'Decoration';
}

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const { request, env } = ctx;
  const userId = await verifyAuth(request, env);
  if (!userId) return json({ error: 'Unauthorized' }, 401);

  const formData = await request.formData();
  const title = (formData.get('title') as string | null)?.trim();
  const isPublic = formData.get('is_public') !== 'false';
  const file = formData.get('file') as File | null;

  if (!title || title.length > 80) return json({ error: 'Invalid title' }, 400);
  if (!file) return json({ error: 'Missing file' }, 400);
  if (file.size > 2 * 1024 * 1024) return json({ error: 'File too large (max 2MB)' }, 413);

  const jsonText = await file.text();
  let raw: RawBlueprint;
  let tags: string[];
  try {
    raw = JSON.parse(jsonText);
    tags = tagsFromRaw(raw);
  } catch {
    return json({ error: 'Invalid blueprint JSON' }, 400);
  }

  const pieceCount = (raw.instances?.length ?? 0) + (raw.placeables?.length ?? 0);

  const id = crypto.randomUUID();
  const r2Key = `blueprints/${id}.json`;
  await env.BUCKET.put(r2Key, jsonText, { httpMetadata: { contentType: 'application/json' } });

  const username = await fetchClerkUsername(userId, env.CLERK_SECRET_KEY);

  await env.DB.prepare(
    `INSERT INTO blueprints (id, user_id, username, title, is_public, r2_key, piece_count, file_size, tags, blueprint_data, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, userId, username, title, isPublic ? 1 : 0, r2Key,
    pieceCount, file.size, JSON.stringify(tags), jsonText,
    new Date().toISOString()
  ).run();

  return json({ id }, 201);
}

async function fetchClerkUsername(userId: string, secretKey: string): Promise<string> {
  try {
    const res = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    if (!res.ok) return 'unknown';
    const user = await res.json<{ username?: string; first_name?: string; last_name?: string }>();
    return user.username ?? ([user.first_name, user.last_name].filter(Boolean).join(' ') || 'unknown');
  } catch {
    return 'unknown';
  }
}
