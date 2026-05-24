import type { EventContext } from '@cloudflare/workers-types';
import type { Env } from '../../../env';
import { rewriteOg, resolveImage } from '../../_og';

type Ctx = EventContext<Env, 'id' | 'variantId', Record<string, unknown>>;

interface BpRow {
  title: string;
  username: string;
  piece_count: number;
  snapshot_url: string | null;
  is_public: number;
}

interface VariantRow {
  name: string;
  snapshot_url: string | null;
}

// Variant share URLs (`/blueprint/:id/v/:variantId`) get their own OG tags:
// title includes the variant name, image falls back to the blueprint's snapshot
// if the variant doesn't have its own.
export async function onRequest(ctx: Ctx): Promise<Response> {
  const { params, env, request } = ctx;
  const id = String(params.id);
  const variantId = String(params.variantId);

  const indexResp = await ctx.next();

  let bp: BpRow | null = null;
  let variant: VariantRow | null = null;
  try {
    bp = await env.DB.prepare(
      `SELECT title, username, piece_count, snapshot_url, is_public
       FROM blueprints WHERE id = ?`,
    ).bind(id).first<BpRow>();
    if (bp && bp.is_public) {
      variant = await env.DB.prepare(
        `SELECT name, snapshot_url FROM blueprint_variants
         WHERE id = ? AND blueprint_id = ?`,
      ).bind(variantId, id).first<VariantRow>();
    }
  } catch {
    return indexResp;
  }

  if (!bp || !bp.is_public || !variant) return indexResp;

  const origin = new URL(request.url).origin;
  return rewriteOg(indexResp, {
    origin,
    title: `${bp.title} — ${variant.name} — Dune Solido Market`,
    description: `Variant of ${bp.title} by ${bp.username} · ${bp.piece_count} pieces`,
    image: resolveImage(origin, variant.snapshot_url ?? bp.snapshot_url),
  });
}
