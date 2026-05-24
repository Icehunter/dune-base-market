import type { EventContext } from '@cloudflare/workers-types';
import type { Env } from '../env';

type Ctx = EventContext<Env, 'id', Record<string, unknown>>;

interface Row {
  title: string;
  username: string;
  piece_count: number;
  snapshot_url: string | null;
  is_public: number;
}

// Intercept /blueprint/:id so social crawlers (Discord, Twitter, Slack, etc.)
// see blueprint-specific OG/Twitter meta tags. The SPA HTML is otherwise unchanged,
// so normal browser navigation still mounts the React app as before.
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
  const title = `${row.title} — Dune Solido Market`;
  const description = `Blueprint by ${row.username} · ${row.piece_count} pieces`;
  const image = row.snapshot_url
    ? (row.snapshot_url.startsWith('http')
        ? row.snapshot_url
        : `${origin}${row.snapshot_url}`)
    : `${origin}/og-image.png`;

  const setContent = (val: string) => ({
    element(el: { setAttribute: (k: string, v: string) => void }) {
      el.setAttribute('content', val);
    },
  });

  return new HTMLRewriter()
    .on('title', {
      element(el) { el.setInnerContent(title); },
    })
    .on('meta[name="description"]', setContent(description))
    .on('meta[property="og:type"]', setContent('article'))
    .on('meta[property="og:title"]', setContent(title))
    .on('meta[property="og:description"]', setContent(description))
    .on('meta[property="og:image"]', setContent(image))
    .on('meta[name="twitter:title"]', setContent(title))
    .on('meta[name="twitter:description"]', setContent(description))
    .on('meta[name="twitter:image"]', setContent(image))
    .transform(indexResp);
}
