# Dune Solido Market — project notes for Claude

Cloudflare Pages app (React 19 + Vite + Tailwind v4 + HeroUI v3) for browsing,
sharing, and remixing Dune base blueprints, with a Babylon.js 3D viewer.

## Stack & conventions

- **React 19** with React Router v7 (`/`, `/blueprint/:id`, `/blueprint/:id/v/:variantId`).
- **Cloudflare Pages Functions** in `functions/` for the API + per-route OG injection.
- **D1** for blueprints/variants/ratings; **R2** for blueprint JSON and snapshots.
- **Clerk** for auth (`@clerk/react` + `@clerk/backend`; dark theme via `@clerk/themes`).
- **Babylon.js v9** for the 3D viewer; `PieceManager` owns GLB loading + placement.
- **Tailwind v4** with HeroUI v3 styles imported in `src/index.css`. No dedicated
  Tailwind config — defaults + a small CSS variable layer in `index.css`.
- **HeroUI v3** used for `Drawer`, `Modal`, `Select` + `ListBox`, `Button`,
  `Toast`, `Skeleton`. Other components are inline `<button>`/`<div>` styled
  with the shared `btnBase` / `btnGold` / `btnGhost` / `btnDark` / `btnDanger` /
  `btnBlue` / `btnLiked` class presets at the bottom of
  `src/pages/BlueprintDetailPage.tsx`.
- **Iconify (Lucide)** via `@iconify/react` — never bundle icon sets; use
  string ids like `lucide:pencil`.
- **Theme tokens** in `src/index.css` override HeroUI: `--radius: 0.125rem` (2px)
  and `--accent` set to dune gold (oklch ≈ `#c8a84b`). `<html class="dark"
  data-theme="dark">` is set in `index.html` so the dark theme is on globally.
- **Toasts** via `Toast.Provider` mounted in `App.tsx`; call `toast.success` /
  `toast.danger` from `@heroui/react` at every action site.
- **No `window.prompt` / `window.confirm`** — use `PromptDialog` /
  `ConfirmDialog` from `src/components/dialogs/`. Inputs clear on close.

## Detail page architecture

`src/pages/BlueprintDetailPage.tsx` is the largest file and worth knowing:

- Sidebar is **absolute-positioned**, `translate-x-full` when closed (slide
  animation, full-width on mobile via `w-full sm:w-[320px]`). Sticky header
  inside for back-to-gallery + collapse.
- Edit Rotations button + ViewerHUD shift horizontally via inline `right`
  + `transition: right 200ms` so they track the sidebar's edge.
- Piece variants live in a HeroUI `Drawer` with `transparent` backdrop;
  per-piece `Select` rows.
- Variant switcher (top of sidebar) is a HeroUI `Select` + a row of compact
  custom buttons (Save / New / Rename / Delete) using `btn*` presets.
- Imperative swap path: `SceneCanvasHandle.swapTemplate(originalId, newId)`
  reuses placement metadata so swaps don't rebuild the scene or reset the
  camera. `PieceManager.PlacedMesh` carries both `templateId` (current) and
  `originalTemplateId` (stable from the source JSON).

## Variants + URL

- `/blueprint/:id/v/:variantId` is a first-class route. The page auto-selects
  the variant after `sceneReady`, navigates with `replace: true` on switch so
  back/forward steps through variants.
- The OG-rewrite function at `functions/blueprint/[id]/v/[variantId].ts`
  injects variant-aware title/description/image. The base
  `functions/blueprint/[id].ts` does the same for non-variant URLs.
- Downloads accept `?v=<vid>`; the server applies the variant's piece
  overrides to the R2 JSON before serving and bumps the variant's counter.

## Forks

- `POST /api/blueprints/:id/fork[?v=<vid>]` — any signed-in user can fork.
- The fork bakes the variant overrides into the new R2 JSON and starts
  **private**. Title is `{source}{ — variant?} (fork)`.

## Local dev

- `npm run dev:local` runs Vite + `wrangler pages dev` together. Wrangler
  uses `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite`; there
  can be **two local sqlite files** that fall out of sync — if a migration
  appears applied (`wrangler d1 migrations apply --local`) but the column
  isn't visible in the running app, apply schema changes to the second
  sqlite file by hand.
- Local D1 seeds and sample blueprints live under `src/data/db-snapshots/`.

## Patterns to keep using

- **Don't reach for HeroUI `Button` when an inline `<button className={btnX}>`
  would match the dune look better.** HeroUI Buttons override too much
  baseline styling to match an architectural aesthetic. We use HeroUI Button
  only inside HeroUI compound components (`Drawer.Footer`, `Modal.Footer`).
- **Class presets, not new components.** The `btnBase` + variant classes
  give us 6 distinct intents without a wrapper component.
- **Imperative scene mutations.** Anything that would otherwise reset the
  camera (variant swap, rotation override, piece replacement) should go
  through `SceneCanvasHandle` imperative methods, not through props that
  re-trigger `loadFromRaw` in the store.
- **Toasts for every action.** Success and failure. Use `toast.danger`
  (not `toast.error` — Clerk uses different naming).

## Files worth knowing

- `src/pages/BlueprintDetailPage.tsx` — the heaviest page (~1500 lines).
- `src/components/Scene/SceneCanvas.tsx` — Babylon scene setup, imperative API.
- `src/engine/PieceManager.ts` — GLB loading, `placePiece`, `swapTemplate`.
- `src/data/modelRegistry.ts` — `ROTATION_BY_STORED` table of rotation fixes.
- `src/data/pieceEquivalents.ts` — cross-faction piece-shape lookup.
- `functions/api/blueprints/` — CRUD endpoints + variants subtree.
- `migrations/` — D1 schema, latest is `0004_blueprint_variants.sql`.
