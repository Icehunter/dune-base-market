// Shared OG-rewrite helper for /blueprint/:id and /blueprint/:id/v/:variantId.
// Builds variant-aware title/description/image and runs HTMLRewriter on the SPA
// index.html so social crawlers see the right preview.

export interface OgInputs {
  origin: string;
  title: string;
  description: string;
  image: string;
}

export function rewriteOg(html: Response, og: OgInputs): Response {
  const setContent = (val: string) => ({
    element(el: { setAttribute: (k: string, v: string) => void }) {
      el.setAttribute('content', val);
    },
  });

  return new HTMLRewriter()
    .on('title', {
      element(el) { el.setInnerContent(og.title); },
    })
    .on('meta[name="description"]', setContent(og.description))
    .on('meta[property="og:type"]', setContent('article'))
    .on('meta[property="og:title"]', setContent(og.title))
    .on('meta[property="og:description"]', setContent(og.description))
    .on('meta[property="og:image"]', setContent(og.image))
    .on('meta[name="twitter:title"]', setContent(og.title))
    .on('meta[name="twitter:description"]', setContent(og.description))
    .on('meta[name="twitter:image"]', setContent(og.image))
    .transform(html);
}

export function resolveImage(origin: string, snapshotUrl: string | null): string {
  if (!snapshotUrl) return `${origin}/og-image.png`;
  return snapshotUrl.startsWith('http') ? snapshotUrl : `${origin}${snapshotUrl}`;
}
