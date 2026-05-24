import type { EventContext } from '@cloudflare/workers-types';
import type { Env } from '../env';
import { rewriteOg, resolveImage } from './_og';

type Ctx = EventContext<Env, 'id', Record<string, unknown>>;

interface Row {
  title: string;
  username: string;
  piece_count: number;
  snapshot_url: string | null;
  is_public: number;
}

// Intercept /blueprint/:id so social crawlers (Discord, Twitter, Slack, etc.)
// see blueprint-specific OG/Twitter meta tags.
export async function onRequest(ctx: Ctx): Promise<Response> {
  const { params, env, request } = ctx;
  const id = String(params.id);

  const indexResp = await ctx.next();

  let row: Row | null = null;
  try {
    row = await env.DB.prepare(
      `SELECT title, username, piece_count, snapshot_url, is_public
       FROM blueprints WHERE id = ?`,
    ).bind(id).first<Row>();
  } catch {
    return indexResp;
  }

  if (!row || !row.is_public) return indexResp;

  const origin = new URL(request.url).origin;
  return rewriteOg(indexResp, {
    origin,
    title: `${row.title} — Dune Solido Market`,
    description: `Blueprint by ${row.username} · ${row.piece_count} pieces`,
    image: resolveImage(origin, row.snapshot_url),
  });
}
