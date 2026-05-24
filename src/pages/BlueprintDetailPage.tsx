import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth, SignInButton } from "@clerk/react";
import { Select, ListBox, Skeleton, toast } from "@heroui/react";
import { Icon } from "@iconify/react";
import { ConfirmDialog } from "../components/dialogs/ConfirmDialog";
import { VariantEditDialog } from "../components/dialogs/VariantEditDialog";

// Lazy chunks: the piece variants drawer brings in pieceEquivalents (which
// pulls the 8k-line piece registry); the shortcuts dialog is rarely opened.
// Both load on first interaction rather than with the page chunk.
const PieceVariantsDrawer = lazy(() => import("../components/PieceVariantsDrawer"));
const ShortcutsDialog = lazy(() =>
  import("../components/dialogs/ShortcutsDialog").then((m) => ({ default: m.ShortcutsDialog })),
);
import {
  getBlueprint,
  downloadBlueprint,
  deleteBlueprint,
  updateBlueprint,
  saveRotationOverrides,
  uploadSnapshot,
  rateBlueprint,
  replaceBlueprintJson,
  getVariant,
  createVariant,
  updateVariant,
  deleteVariant,
  forkBlueprint,
} from "../lib/api";
import type { BlueprintDetail, BlueprintVariantSummary, BlueprintVariant } from "../lib/api";
import type { RawBlueprint, PlacedPiece } from "../stores/buildingStore";
import type { RotMap } from "../data/modelRegistry";
// findEquivalents pulls in the 8k-line pieceRegistry.generated chunk; load it
// only when the page needs the swappable count (lazy via dynamic import).
import type { SceneCanvasHandle } from "../components/Scene/SceneCanvas";
import { ViewerHUD } from "../components/Scene/ViewerHUD";

const SceneCanvas = lazy(() => import("../components/Scene/SceneCanvas").then((m) => ({ default: m.SceneCanvas })));

export default function BlueprintDetailPage() {
  const { id, variantId: variantIdFromUrl } = useParams<{ id: string; variantId?: string }>();
  const navigate = useNavigate();
  const { isSignedIn, userId, getToken } = useAuth();
  const [blueprint, setBlueprint] = useState<BlueprintDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editPublic, setEditPublic] = useState(true);
  const [editTags, setEditTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [locked, setLocked] = useState(false);
  const [selectedPiece, setSelectedPiece] = useState<PlacedPiece | null>(null);
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [userRated, setUserRated] = useState(false);
  const [ratingCount, setRatingCount] = useState(0);
  const [replacing, setReplacing] = useState(false);
  const [replaceError, setReplaceError] = useState<string | null>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const snapshotInputRef = useRef<HTMLInputElement>(null);
  const [viewerMode, setViewerMode] = useState<"orbit" | "fly">("orbit");
  const [isEditMode, setIsEditMode] = useState(false);
  // Template overrides (originalTemplateId → replacementTemplateId). Applied to the
  // live scene via imperative swaps; persisted per-variant on the server.
  const [templateOverrides, setTemplateOverrides] = useState<Record<string, string>>({});
  // null = "Original" (no variant); otherwise the variant id currently displayed.
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [variants, setVariants] = useState<BlueprintVariantSummary[]>([]);
  // Has the current set of overrides drifted from the variant's saved state?
  const [variantDirty, setVariantDirty] = useState(false);
  // Set true by handleSelectVariant so the next override-effect run skips dirty-marking.
  const suppressDirtyRef = useRef(false);
  const [pieceVariantsOpen, setPieceVariantsOpen] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  // Dialog state for the prompt/confirm modals that replaced window.prompt/confirm.
  const [saveVariantOpen, setSaveVariantOpen] = useState(false);
  const [renameVariantOpen, setRenameVariantOpen] = useState(false);
  const [deleteVariantOpen, setDeleteVariantOpen] = useState(false);
  const [deleteBlueprintOpen, setDeleteBlueprintOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // Default: open on desktop, collapsed on mobile.
  const [infoOpen, setInfoOpen] = useState(() => (typeof window === "undefined" ? true : window.innerWidth >= 768));
  // devMapRef holds the live map — never triggers re-renders on its own.
  // devDisplayMap is a copy used only to re-render the HUD.
  const sceneRef = useRef<SceneCanvasHandle | null>(null);
  const devMapRef = useRef<Partial<Record<string, RotMap>>>({});
  const [devDisplayMap, setDevDisplayMap] = useState<Partial<Record<string, RotMap>>>({});

  useEffect(() => {
    const onChange = () => setLocked(document.pointerLockElement !== null);
    document.addEventListener("pointerlockchange", onChange);
    return () => document.removeEventListener("pointerlockchange", onChange);
  }, []);

  useEffect(() => {
    if (!selectedPiece || !isEditMode) return;
    const DEV_CYCLE = [
      0, 7.5, 15, 22.5, 30, 37.5, 45, 52.5, 60, 67.5, 75, 82.5, 90, 97.5, 105, 112.5, 120, 127.5, 135, 142.5, 150,
      157.5, 165, 172.5, 180, -172.5, -165, -157.5, -150, -142.5, -135, -127.5, -120, -112.5, -105, -97.5, -90, -82.5,
      -75, -67.5, -60, -52.5, -45, -37.5, -30, -22.5, -15, -7.5,
    ] as const;
    const onKeyDown = (e: KeyboardEvent) => {
      const {
        templateId,
        transform: { rotation },
      } = selectedPiece;
      const n = ((rotation % 360) + 360) % 360;
      const key = n > 180 ? n - 360 : n;

      // Backspace/Delete — clear override for this piece's stored rotation
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        const newTemplateMap = { ...devMapRef.current[templateId] };
        delete newTemplateMap[key];
        // Keep empty object rather than deleting the key — applyDevOverrides needs
        // to see the templateId to revert those pieces to their base rotation.
        const newMap = { ...devMapRef.current, [templateId]: newTemplateMap };
        devMapRef.current = newMap;
        sceneRef.current?.applyDevOverrides(devMapRef.current, devMapRef.current);
        setDevDisplayMap({ ...devMapRef.current });
        console.log("[DEV] reset override for", templateId, key, "→", devMapRef.current);
        return;
      }

      if (e.key !== "r" && e.key !== "R") return;
      e.preventDefault();
      const current = devMapRef.current[templateId]?.[key] ?? 0;
      const idx = DEV_CYCLE.indexOf(current as (typeof DEV_CYCLE)[number]);
      const step = e.shiftKey ? -1 : 1;
      const next = DEV_CYCLE[(((idx + step) % DEV_CYCLE.length) + DEV_CYCLE.length) % DEV_CYCLE.length];
      devMapRef.current = {
        ...devMapRef.current,
        [templateId]: { ...devMapRef.current[templateId], [key]: next },
      };
      sceneRef.current?.applyDevOverrides(devMapRef.current, devMapRef.current);
      setDevDisplayMap({ ...devMapRef.current });
      console.log("[DEV] ROTATION_BY_STORED override:", devMapRef.current);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedPiece, isEditMode]); // isEditMode gates the listener

  useEffect(() => {
    if (!id) return;
    // Only show spinner on first load; re-fetching for auth state doesn't flash the page.
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    if (!blueprint) setLoading(true);
    getBlueprint(id, isSignedIn ? getToken : undefined)
      .then((bp) => {
        setBlueprint(bp);
        setEditTitle(bp.title);
        setEditPublic(!!bp.is_public);
        setEditTags(bp.tags ?? []);
        setSnapshotUrl(bp.snapshot_url ?? null);
        setUserRated(bp.user_rated ?? false);
        setRatingCount(bp.rating_count ?? 0);
        setVariants(bp.variants ?? []);
        if (bp.rotation_overrides) {
          devMapRef.current = bp.rotation_overrides as Partial<Record<string, RotMap>>;
          setDevDisplayMap({ ...bp.rotation_overrides });
        }
      })
      .catch(() => setError("Blueprint not found"))
      .finally(() => setLoading(false));
    // `blueprint` and `getToken` intentionally excluded — including blueprint
    // would loop after each fetch; getToken changes per render but is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isSignedIn]); // isSignedIn: re-fetch once auth resolves so user_rated is correct

  const isOwnerForEffect = !!userId && !!blueprint && userId === blueprint.user_id;

  useEffect(() => {
    if (!isOwnerForEffect) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "r") {
        e.preventDefault();
        setIsEditMode((m) => !m);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOwnerForEffect]);

  useEffect(() => {
    if (!isOwnerForEffect || !id || !isSignedIn) return;
    const timer = setTimeout(() => {
      const map = Object.keys(devMapRef.current).length > 0 ? devMapRef.current : null;
      saveRotationOverrides(id, map as Record<string, Record<number, number>> | null, getToken).catch(console.error);
    }, 1500);
    return () => clearTimeout(timer);
  }, [devDisplayMap, isOwnerForEffect, id, isSignedIn, getToken]);

  // Apply template-override changes to the live scene imperatively (no React reload,
  // no camera reset). Also gates on sceneReady so persisted overrides hydrated from
  // the API are applied once the initial placement finishes.
  const prevOverridesRef = useRef<Record<string, string>>({});
  useEffect(() => {
    if (!sceneReady) return;
    const handle = sceneRef.current;
    if (!handle) return;
    const prev = prevOverridesRef.current;
    const next = templateOverrides;
    const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
    const swaps: Promise<void>[] = [];
    for (const origId of keys) {
      const prevTarget = prev[origId] ?? origId;
      const nextTarget = next[origId] ?? origId;
      if (prevTarget !== nextTarget) {
        swaps.push(handle.swapTemplate(origId, nextTarget));
      }
    }
    prevOverridesRef.current = { ...next };
    if (swaps.length > 0) {
      if (suppressDirtyRef.current) suppressDirtyRef.current = false;
      else setVariantDirty(true);
    }

    // After swaps resolve, if a piece is selected, sync its templateId so subsequent
    // rotation overrides (R / Shift+R) target the *currently displayed* template.
    Promise.all(swaps).then(() => {
      setSelectedPiece((prev) => {
        if (!prev) return prev;
        const cur = sceneRef.current?.getCurrentTemplateId(prev.id);
        if (!cur || cur === prev.templateId) return prev;
        return { ...prev, templateId: cur };
      });
    });
  }, [templateOverrides, sceneReady]);

  async function handleDownload() {
    if (!id) return;
    try {
      await downloadBlueprint(id, getToken, selectedVariantId ?? undefined);
      toast.success("Blueprint downloaded");
    } catch (err) {
      console.error(err);
      toast.danger("Download failed");
    }
  }

  // Auto-select the variant from the URL once the scene is ready. Only runs when
  // the URL variant param differs from the currently-selected one, so navigating
  // back/forward between variants applies the right state.
  useEffect(() => {
    if (!sceneReady || !id) return;
    if (variantIdFromUrl === selectedVariantId) return;
    handleSelectVariant(variantIdFromUrl ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variantIdFromUrl, sceneReady, id]);

  // Variant selection — fetches overrides for the picked variant and applies via
  // imperative swap. Selecting "Original" (null) clears all overrides.
  async function handleSelectVariant(variantId: string | null) {
    if (!id || variantId === selectedVariantId) return;
    if (variantId === null) {
      suppressDirtyRef.current = true;
      setTemplateOverrides({});
      setSelectedVariantId(null);
      setVariantDirty(false);
      // Keep URL clean — drop /v/:variantId when reverting to Original.
      navigate(`/blueprint/${id}`, { replace: true });
      return;
    }
    try {
      const v: BlueprintVariant = await getVariant(id, variantId, getToken);
      suppressDirtyRef.current = true;
      setTemplateOverrides(v.piece_overrides ?? {});
      setSelectedVariantId(variantId);
      setVariantDirty(false);
      navigate(`/blueprint/${id}/v/${variantId}`, { replace: true });
    } catch (err) {
      console.error(err);
    }
  }

  function handleSaveAsNewVariant() {
    setSaveVariantOpen(true);
  }
  async function confirmSaveAsNewVariant({ name, description }: { name: string; description: string }) {
    if (!id) return;
    try {
      const v = await createVariant(
        id,
        {
          name,
          description: description || null,
          piece_overrides: Object.keys(templateOverrides).length ? templateOverrides : null,
        },
        getToken,
      );
      setVariants((prev) => [
        ...prev,
        {
          id: v.id,
          name: v.name,
          description: v.description ?? null,
          snapshot_url: v.snapshot_url,
          download_count: v.download_count,
          rating_count: v.rating_count ?? 0,
          user_rated: false,
          created_at: v.created_at,
        },
      ]);
      setSelectedVariantId(v.id);
      setVariantDirty(false);
      navigate(`/blueprint/${id}/v/${v.id}`, { replace: true });
      toast.success(`Variant "${v.name}" saved`);
    } catch (err) {
      console.error(err);
      toast.danger("Could not save variant");
    }
  }

  async function handleSaveVariantChanges() {
    if (!id || !selectedVariantId) return;
    try {
      await updateVariant(
        id,
        selectedVariantId,
        {
          piece_overrides: Object.keys(templateOverrides).length ? templateOverrides : null,
        },
        getToken,
      );
      setVariantDirty(false);
      toast.success("Variant changes saved");
    } catch (err) {
      console.error(err);
      toast.danger("Could not save changes");
    }
  }

  function handleEditVariant() {
    if (!selectedVariantId) return;
    setRenameVariantOpen(true);
  }
  async function confirmEditVariant({ name, description }: { name: string; description: string }) {
    if (!id || !selectedVariantId) return;
    try {
      await updateVariant(id, selectedVariantId, { name, description: description || null }, getToken);
      setVariants((prev) =>
        prev.map((v) =>
          v.id === selectedVariantId ? { ...v, name, description: description || null } : v,
        ),
      );
      toast.success("Variant updated");
    } catch (err) {
      console.error(err);
      toast.danger("Update failed");
    }
  }

  function handleDeleteVariant() {
    if (!selectedVariantId) return;
    setDeleteVariantOpen(true);
  }
  async function confirmDeleteVariant() {
    if (!id || !selectedVariantId) return;
    try {
      await deleteVariant(id, selectedVariantId, getToken);
      setVariants((prev) => prev.filter((v) => v.id !== selectedVariantId));
      setSelectedVariantId(null);
      setTemplateOverrides({});
      setVariantDirty(false);
      navigate(`/blueprint/${id}`, { replace: true });
      toast.success("Variant deleted");
    } catch (err) {
      console.error(err);
      toast.danger("Delete failed");
    }
  }

  function handleDelete() {
    setDeleteBlueprintOpen(true);
  }
  async function confirmDelete() {
    if (!id) return;
    try {
      await deleteBlueprint(id, getToken);
      toast.success("Blueprint deleted");
      window.location.href = "/";
    } catch (err) {
      console.error(err);
      toast.danger("Delete failed");
    }
  }

  async function handleSaveEdit() {
    if (!id) return;
    try {
      await updateBlueprint(id, { title: editTitle, is_public: editPublic, tags: editTags }, getToken);
      setBlueprint((prev) =>
        prev ? { ...prev, title: editTitle, is_public: editPublic ? 1 : 0, tags: editTags } : prev,
      );
      setEditing(false);
      toast.success("Blueprint updated");
    } catch (err) {
      console.error(err);
      toast.danger("Could not save changes");
    }
  }

  // When a variant is selected, snapshots target that variant. Selecting Original
  // updates the blueprint cover. Cover URL state is refreshed so the sidebar img reloads.
  function applyUploadedSnapshotUrl(url: string) {
    if (selectedVariantId) {
      setVariants((prev) => prev.map((v) => (v.id === selectedVariantId ? { ...v, snapshot_url: url } : v)));
    } else {
      setSnapshotUrl(`${url}?t=${Date.now()}`);
    }
  }

  async function handleSnapshotUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    try {
      const { snapshot_url } = await uploadSnapshot(id, file, getToken, selectedVariantId ?? undefined);
      applyUploadedSnapshotUrl(snapshot_url);
      toast.success("Cover image updated");
    } catch (err) {
      console.error("Snapshot upload failed", err);
      toast.danger("Cover upload failed");
    }
  }

  async function handleSaveViewAsCover() {
    if (!id) return;
    try {
      const blob = await sceneRef.current!.captureScreenshot();
      const file = new File([blob], "cover.jpg", { type: "image/jpeg" });
      const { snapshot_url } = await uploadSnapshot(id, file, getToken, selectedVariantId ?? undefined);
      applyUploadedSnapshotUrl(snapshot_url);
      toast.success("Cover saved from current view");
    } catch (err) {
      console.error("Save view as cover failed", err);
      toast.danger("Could not save cover");
    }
  }

  // Latest committed overrides — read by hover-preview end handlers so they
  // restore against the most recent state, including a freshly-committed swap.
  const overridesRef = useRef(templateOverrides);
  useEffect(() => { overridesRef.current = templateOverrides; }, [templateOverrides]);

  // Latest hover intent — when the user moves between options, the hover-end
  // handler defers a tick and only restores if no newer hover-start has taken
  // over. Avoids flicker-back-to-original between adjacent options.
  const previewTargetRef = useRef<{ orig: string; target: string } | null>(null);

  function handlePreview(originalId: string, targetId: string) {
    previewTargetRef.current = { orig: originalId, target: targetId };
    void sceneRef.current?.swapTemplate(originalId, targetId);
  }
  function handlePreviewEnd(originalId: string) {
    // Defer so a sibling option's hover-start (fired in the same tick) can claim
    // the ref first; if it did, we skip the restore and let that swap stand.
    requestAnimationFrame(() => {
      const latest = previewTargetRef.current;
      if (latest && latest.orig === originalId) {
        const committed = overridesRef.current[originalId] ?? originalId;
        void sceneRef.current?.swapTemplate(originalId, committed);
        previewTargetRef.current = null;
      }
    });
  }

  async function handleFork() {
    if (!id) return;
    const isRemix = !!selectedVariantId;
    try {
      const { id: newId } = await forkBlueprint(id, getToken, selectedVariantId ?? undefined);
      toast.success(isRemix ? "Remix created in your account" : "Blueprint forked to your account");
      navigate(`/blueprint/${newId}`);
    } catch (err) {
      console.error("Fork failed", err);
      toast.danger(isRemix ? "Remix failed" : "Fork failed");
    }
  }

  async function handleRate() {
    if (!id || !isSignedIn) return;
    try {
      const { rated, rating_count } = await rateBlueprint(id, getToken, selectedVariantId ?? undefined);
      if (selectedVariantId) {
        setVariants((prev) =>
          prev.map((v) =>
            v.id === selectedVariantId ? { ...v, rating_count, user_rated: rated } : v,
          ),
        );
      } else {
        setUserRated(rated);
        setRatingCount(rating_count);
      }
    } catch (err) {
      console.error("Rate failed", err);
    }
  }

  async function handleReplaceJson(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !id) return;
    if (!file.name.endsWith(".json")) {
      setReplaceError("File must be a .json blueprint");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setReplaceError("File too large (max 2MB)");
      return;
    }
    try {
      const text = await file.text();
      JSON.parse(text);
    } catch {
      setReplaceError("Invalid JSON — could not parse blueprint");
      return;
    }
    setReplacing(true);
    setReplaceError(null);
    try {
      await replaceBlueprintJson(id, file, getToken);
      const bp = await getBlueprint(id, isSignedIn ? getToken : undefined);
      setBlueprint(bp);
      toast.success("Blueprint JSON replaced");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Replace failed";
      setReplaceError(msg);
      toast.danger(msg);
    } finally {
      setReplacing(false);
    }
  }

  if (loading)
    return (
      // Match the real detail layout so the page doesn't reflow when content arrives.
      <div className="flex h-[calc(100vh-52px)] overflow-hidden">
        <div className="flex flex-1 items-center justify-center bg-black">
          <Skeleton className="h-2/3 w-2/3 rounded-[2px]" />
        </div>
        <div className="flex w-[320px] shrink-0 flex-col gap-4 border-l border-white/10 bg-[#13131a] p-5">
          <Skeleton className="h-4 w-1/2 rounded-[2px]" />
          <Skeleton className="aspect-[16/9] w-full rounded-[2px]" />
          <Skeleton className="h-5 w-3/4 rounded-[2px]" />
          <Skeleton className="h-3 w-2/3 rounded-[2px]" />
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-[2px]" />
            ))}
          </div>
          <Skeleton className="h-10 w-full rounded-[2px]" />
          <Skeleton className="h-10 w-full rounded-[2px]" />
        </div>
      </div>
    );
  if (error || !blueprint)
    return (
      <div className="flex flex-col items-center gap-2 pt-20 text-[#e05555]">
        <Icon icon="lucide:triangle-alert" width={22} height={22} />
        <p className="m-0 text-sm">{error ?? "Blueprint not found"}</p>
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-[#c8a84b] no-underline hover:underline">
          <Icon icon="lucide:arrow-left" width={14} height={14} />
          Back to gallery
        </Link>
      </div>
    );

  const isOwner = !!userId && userId === blueprint.user_id;
  const pieceGroups = buildPieceBreakdown(blueprint);

  return (
    <div className="relative flex h-[calc(100vh-52px)] overflow-hidden">
      {/* Lazy-loaded overlays: drawer + shortcuts dialog. Nothing to render while
          loading — Suspense fallback is null since neither is visible until the
          user opens it. */}
      <Suspense fallback={null}>
        <PieceVariantsDrawer
          open={pieceVariantsOpen}
          onClose={() => setPieceVariantsOpen(false)}
          raw={blueprint.blueprint_data as unknown as RawBlueprint | undefined}
          overrides={templateOverrides}
          onChange={setTemplateOverrides}
          onPreview={handlePreview}
          onPreviewEnd={handlePreviewEnd}
          btnGhost={btnGhost}
        />
      </Suspense>

      {/* Variant editor — used for both "Save as new" and "Edit" (name + description). */}
      <VariantEditDialog
        isOpen={saveVariantOpen}
        onClose={() => setSaveVariantOpen(false)}
        title="Save as new variant"
        confirmLabel="Save variant"
        onConfirm={confirmSaveAsNewVariant}
      />
      <VariantEditDialog
        isOpen={renameVariantOpen}
        onClose={() => setRenameVariantOpen(false)}
        title="Edit variant"
        defaultName={variants.find((v) => v.id === selectedVariantId)?.name ?? ""}
        defaultDescription={variants.find((v) => v.id === selectedVariantId)?.description ?? ""}
        confirmLabel="Save"
        onConfirm={confirmEditVariant}
      />
      <ConfirmDialog
        isOpen={deleteVariantOpen}
        onClose={() => setDeleteVariantOpen(false)}
        title="Delete variant?"
        message={`"${variants.find((v) => v.id === selectedVariantId)?.name ?? "This variant"}" will be removed. This cannot be undone.`}
        confirmLabel="Delete variant"
        destructive
        onConfirm={confirmDeleteVariant}
      />
      <ConfirmDialog
        isOpen={deleteBlueprintOpen}
        onClose={() => setDeleteBlueprintOpen(false)}
        title="Delete blueprint?"
        message="This will permanently delete the blueprint, all variants, and its cover image. This cannot be undone."
        confirmLabel="Delete blueprint"
        destructive
        onConfirm={confirmDelete}
      />
      <Suspense fallback={null}>
        <ShortcutsDialog
          isOpen={shortcutsOpen}
          onClose={() => setShortcutsOpen(false)}
          showOwnerShortcuts={isOwner}
        />
      </Suspense>

      {/* 3D Viewer */}
      <div className="relative flex-1 overflow-hidden bg-black">
        {blueprint.blueprint_data ? (
          <Suspense fallback={null}>
            <SceneCanvas
              ref={sceneRef}
              onSelectPiece={setSelectedPiece}
              onModeChange={setViewerMode}
              onReady={() => setSceneReady(true)}
              initialDistanceScale={1}
              initialBlueprint={blueprint.blueprint_data as unknown as RawBlueprint}
              userRotationOverrides={devDisplayMap}
            />
          </Suspense>
        ) : (
          <div className="flex h-full items-center justify-center gap-2 text-white/25">
            <Icon icon="lucide:image-off" width={20} height={20} />
            <span className="text-sm">No preview available</span>
          </div>
        )}

        {/* Crosshair — only visible while pointer is locked in fly mode */}
        {locked && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 select-none text-white/70">
            <Icon icon="lucide:crosshair" width={20} height={20} />
          </div>
        )}

        <ViewerHUD
          mode={viewerMode}
          locked={locked}
          pieceSelected={!!selectedPiece}
          isOwner={isOwner}
          isEditMode={isEditMode}
          rightOffset={infoOpen ? 320 + 16 : 16}
        />

        {/* Keyboard shortcuts opener — bottom-left of the viewer */}
        <button
          onClick={() => setShortcutsOpen(true)}
          aria-label="Show keyboard shortcuts"
          title="Keyboard shortcuts"
          className={`${btnBase} absolute bottom-3 left-3 z-10 h-8 w-8 justify-center bg-black/55 border-white/15 text-white/55 backdrop-blur hover:bg-black/70 hover:text-white/85`}
        >
          <Icon icon="lucide:keyboard" width={14} height={14} />
        </button>

        {/* Edit mode toggle — owner only. Tracks the sidebar's right edge so it never gets covered. */}
        {isOwner && blueprint.blueprint_data && (
          <button
            onClick={() => setIsEditMode((m) => !m)}
            style={{ right: infoOpen ? 320 + 12 : 12, transition: "right 200ms ease-out" }}
            className={`${btnBase} absolute top-3 z-10 w-auto py-1.5 backdrop-blur ${
              isEditMode
                ? "bg-[rgba(200,168,75,0.2)] border-[rgba(200,168,75,0.55)] text-[#c8a84b]"
                : "bg-black/55 border-white/15 text-white/55 hover:bg-black/70 hover:text-white/80"
            }`}
          >
            <Icon icon={isEditMode ? "lucide:check" : "lucide:rotate-3d"} width={14} height={14} />
            {isEditMode ? "Editing" : "Edit Rotations"}
          </button>
        )}

        {/* Selected piece info */}
        {selectedPiece && (
          <div
            style={{ transition: "left 200ms ease-out" }}
            className="pointer-events-none absolute bottom-4 left-4 flex max-w-[320px] select-none flex-col gap-1 rounded-[2px] border border-white/15 bg-[rgba(20,20,28,0.92)] px-3.5 py-2.5 text-[11px] text-white backdrop-blur"
          >
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-white/40">
              <Icon icon="lucide:box-select" width={11} height={11} />
              {selectedPiece.category}
            </div>
            <div className="break-all text-xs font-semibold text-[#ffd84a]">
              {selectedPiece.templateId}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-white/55">
              <span className="inline-flex items-center gap-1">
                <Icon icon="lucide:rotate-cw" width={10} height={10} />
                {selectedPiece.transform.rotation}°
              </span>
              <span className="inline-flex items-center gap-1">
                <Icon icon="lucide:move-3d" width={10} height={10} />
                {selectedPiece.transform.position.x}, {selectedPiece.transform.position.y}, {selectedPiece.transform.position.z}
              </span>
              {selectedPiece.scale && (
                <span className="inline-flex items-center gap-1 text-[rgba(100,200,255,0.7)]">
                  <Icon icon="lucide:scaling" width={10} height={10} />
                  {selectedPiece.scale.x}×{selectedPiece.scale.y}×{selectedPiece.scale.z}
                </span>
              )}
            </div>
            {isOwner &&
              isEditMode &&
              (() => {
                const n = ((selectedPiece.transform.rotation % 360) + 360) % 360;
                const key = n > 180 ? n - 360 : n;
                const devVal = devDisplayMap[selectedPiece.templateId]?.[key];
                return devVal !== undefined ? (
                  <div className="inline-flex items-center gap-1 text-[10px] text-[#7ec8e3]">
                    <Icon icon="lucide:wand" width={10} height={10} />
                    override {devVal > 0 ? "+" : ""}
                    {devVal}° · R / Shift+R to cycle
                  </div>
                ) : (
                  <div className="text-[10px] text-white/30">R to add a rotation fix</div>
                );
              })()}
          </div>
        )}
      </div>

      {/* Slim re-open tab when the sidebar is closed. Vertically centered on the right
          edge so it never collides with the Edit Rotations / mode chips up top. */}
      {!infoOpen && (
        <button
          onClick={() => setInfoOpen(true)}
          aria-label="Show info"
          className={`${btnBase} absolute right-0 top-1/2 z-50 -translate-y-1/2 rounded-r-none border-r-0 bg-[#1e1e2e] border-white/20 text-white/85 px-2 py-3 backdrop-blur hover:bg-[#26263a]`}
        >
          <Icon icon="lucide:panel-right-open" width={18} height={18} />
        </button>
      )}

      {/* Sidebar — absolutely positioned + translateX so it slides cleanly off
          the right edge instead of shrinking. Full-width on mobile, fixed 320px
          on sm+ so it overlays only a portion of the viewer on desktop. */}
      <div
        className={`absolute right-0 top-0 bottom-0 z-40 flex w-full sm:w-[320px] shrink-0 flex-col border-l border-white/10 bg-[#13131a] transition-transform duration-200 ease-out ${
          infoOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Sticky header — Back-to-gallery + collapse, persistent above scroll. */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#13131a]/95 px-5 py-3 backdrop-blur">
          <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-white/60 no-underline hover:text-white">
            <Icon icon="lucide:arrow-left" width={14} height={14} />
            Back to gallery
          </Link>
          <button
            onClick={() => setInfoOpen(false)}
            aria-label="Collapse info panel"
            title="Collapse panel"
            className="inline-flex h-7 w-7 cursor-pointer items-center justify-center border-none bg-transparent text-white/55 hover:text-white"
          >
            <Icon icon="lucide:panel-right-close" width={18} height={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">

          {/* Variant switcher — always shown; owners can save / rename / delete variants */}
          <VariantSwitcher
            variants={variants}
            selectedVariantId={selectedVariantId}
            dirty={variantDirty}
            isOwner={isOwner}
            hasOverrides={Object.keys(templateOverrides).length > 0}
            onSelect={handleSelectVariant}
            onSaveNew={handleSaveAsNewVariant}
            onSaveChanges={handleSaveVariantChanges}
            onRename={handleEditVariant}
            onDelete={handleDeleteVariant}
          />

          {(() => {
            const variantSnap = selectedVariantId
              ? (variants.find((v) => v.id === selectedVariantId)?.snapshot_url ?? null)
              : null;
            const url = variantSnap ?? snapshotUrl;
            return url ? (
              <img
                src={url}
                alt="Cover"
                style={{ width: "100%", borderRadius: 6, objectFit: "cover", aspectRatio: "16/9" }}
              />
            ) : null;
          })()}

          {/* Title / edit mode */}
          {editing ? (
            <div className="flex flex-col gap-2">
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                maxLength={80}
                className="rounded-[2px] border border-white/15 bg-black/30 px-2 py-1.5 text-sm text-white outline-none focus:border-accent"
              />
              <label className="inline-flex items-center gap-2 text-xs text-white/60">
                <input
                  type="checkbox"
                  checked={editPublic}
                  onChange={(e) => setEditPublic(e.target.checked)}
                  className="accent-[#c8a84b]"
                />
                Public
              </label>
              <div>
                <p className="m-0 mb-1.5 text-[10px] uppercase tracking-wide text-white/40">Tags</p>
                <div className="mb-1.5 flex flex-wrap gap-1">
                  {STANDARD_TAGS.map((tag) => {
                    const active = editTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        onClick={() => setEditTags(active ? editTags.filter((t) => t !== tag) : [...editTags, tag])}
                        className={
                          active
                            ? "cursor-pointer rounded-full border border-[rgba(200,168,75,0.5)] bg-[rgba(200,168,75,0.18)] px-2.5 py-0.5 text-[10px] text-[#c8a84b]"
                            : "cursor-pointer rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] text-white/45 hover:border-white/20 hover:text-white/70"
                        }
                      >
                        {tag}
                      </button>
                    );
                  })}
                  {editTags
                    .filter((t) => !(STANDARD_TAGS as readonly string[]).includes(t))
                    .map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded-full border border-[rgba(200,168,75,0.5)] bg-[rgba(200,168,75,0.2)] px-2.5 py-0.5 text-[10px] text-[#c8a84b]"
                      >
                        {tag}
                        <button
                          onClick={() => setEditTags(editTags.filter((t2) => t2 !== tag))}
                          aria-label={`Remove tag ${tag}`}
                          className="inline-flex cursor-pointer items-center border-none bg-transparent p-0 text-[#c8a84b] hover:text-white"
                        >
                          <Icon icon="lucide:x" width={11} height={11} />
                        </button>
                      </span>
                    ))}
                </div>
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.key === "Enter" || e.key === ",") && tagInput.trim()) {
                      e.preventDefault();
                      const t = tagInput.trim().replace(/,/g, "");
                      if (t && !editTags.includes(t)) setEditTags([...editTags, t]);
                      setTagInput("");
                    }
                  }}
                  placeholder="Type a tag, press Enter"
                  className="box-border w-full rounded-[2px] border border-white/10 bg-black/30 px-2 py-1 text-xs text-white outline-none placeholder:text-white/30 focus:border-accent"
                />
              </div>
              <div className="flex gap-1.5">
                <button onClick={handleSaveEdit} className={`${btnGold} flex-1 text-xs py-1.5`}>
                  <Icon icon="lucide:check" width={14} height={14} />
                  Save
                </button>
                <button onClick={() => setEditing(false)} className={`${btnGhost} flex-1 text-xs py-1.5`}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <h1 className="m-0 text-base font-bold text-white">{blueprint.title}</h1>
              <p className="m-0 flex items-center gap-1.5 text-xs text-white/45">
                <Icon icon="lucide:user" width={12} height={12} />
                {blueprint.username}
                <span className="text-white/25">·</span>
                <Icon icon="lucide:calendar" width={12} height={12} />
                {new Date(blueprint.created_at).toLocaleDateString()}
              </p>
              <span
                className={`mt-1 inline-flex w-fit items-center gap-1 rounded-[2px] border px-1.5 py-0.5 text-[10px] ${
                  blueprint.is_public
                    ? "border-[#2a4a2a] bg-[#1a2e1a] text-[#5a9a5a]"
                    : "border-[#4a2a2a] bg-[#2e1a1a] text-[#9a5a5a]"
                }`}
              >
                <Icon icon={blueprint.is_public ? "lucide:globe" : "lucide:lock"} width={10} height={10} />
                {blueprint.is_public ? "public" : "private"}
              </span>
            </div>
          )}

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Pieces", value: blueprint.piece_count ?? "—", icon: "lucide:box" },
              {
                label: "Size",
                value: blueprint.file_size ? `${(blueprint.file_size / 1024).toFixed(1)}KB` : "—",
                icon: "lucide:hard-drive",
              },
              { label: "Downloads", value: blueprint.download_count, icon: "lucide:download" },
              { label: "Tags", value: blueprint.tags.length || "—", icon: "lucide:tags" },
            ].map(({ label, value, icon }) => (
              <div
                key={label}
                className="flex flex-col items-center justify-center gap-1 rounded-[2px] border border-white/10 bg-black/25 px-2.5 py-2 text-center"
              >
                <Icon icon={icon} width={14} height={14} className="text-white/35" />
                <div className="text-base font-bold leading-none text-[#c8a84b]">{value}</div>
                <div className="text-[10px] uppercase tracking-wide text-white/35">{label}</div>
              </div>
            ))}
          </div>

          {/* Piece variants — opens a drawer overlaying the right side */}
          <PieceVariantsTrigger
            raw={blueprint.blueprint_data as unknown as RawBlueprint | undefined}
            overrides={templateOverrides}
            onOpen={() => setPieceVariantsOpen(true)}
          />

          {/* Download */}
          {isSignedIn ? (
            <button onClick={handleDownload} className={btnGold}>
              <Icon icon="lucide:download" width={16} height={16} />
              Download{Object.keys(templateOverrides).length > 0 ? " (with swaps)" : ""}
            </button>
          ) : (
            <SignInButton mode="modal">
              <button className={btnGhost}>
                <Icon icon="lucide:lock" width={14} height={14} />
                Sign in to download
              </button>
            </SignInButton>
          )}

          {/* Fork / Remix — any signed-in user can fork another user's blueprint;
              owner can also "Remix" their own variant into a standalone blueprint.
              Variant selected → Remix (with the variant baked in). No variant
              → Fork (only non-owners; an owner forking their own original is a no-op). */}
          {isSignedIn && (selectedVariantId || !isOwner) && (
            <button
              onClick={handleFork}
              className={btnGhost}
              aria-label={selectedVariantId ? "Remix this variant into a new blueprint" : "Make a private copy in your account"}
            >
              <Icon icon={selectedVariantId ? "lucide:layers" : "lucide:git-fork"} width={14} height={14} />
              {selectedVariantId ? "Remix this variant" : "Fork"}
            </button>
          )}

          {/* Like button — rates the selected variant when one's chosen,
              otherwise the blueprint itself. Display state derives from the
              current selection so switching variants reflects per-variant likes. */}
          {isSignedIn && (() => {
            const sel = selectedVariantId
              ? variants.find((v) => v.id === selectedVariantId)
              : null;
            const liked = sel ? !!sel.user_rated : userRated;
            const count = sel ? sel.rating_count : ratingCount;
            return (
              <button onClick={handleRate} className={liked ? btnLiked : btnGhost}>
                <Icon icon="lucide:heart" width={14} height={14} className={liked ? "fill-current" : ""} />
                {count} {liked ? "Liked" : "Like"}
                {sel && <span className="ml-1 opacity-60">· this variant</span>}
              </button>
            );
          })()}

          {/* Owner controls */}
          {isOwner && !editing && (
            <div className="flex flex-col gap-1.5">
              <div className="flex gap-1.5">
                <button onClick={() => setEditing(true)} className={`${btnDark} flex-1`}>
                  <Icon icon="lucide:pencil" width={14} height={14} />
                  Edit
                </button>
                <button onClick={handleDelete} className={`${btnDanger} flex-1`}>
                  <Icon icon="lucide:trash-2" width={14} height={14} />
                  Delete
                </button>
                <button
                  className={`${btnBlue} flex-1 disabled:opacity-50`}
                  disabled={replacing}
                  onClick={() => replaceInputRef.current?.click()}
                >
                  <Icon icon={replacing ? "lucide:loader-2" : "lucide:refresh-cw"} width={14} height={14} className={replacing ? "animate-spin" : ""} />
                  Replace
                </button>
                <input
                  ref={replaceInputRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  disabled={replacing}
                  onChange={handleReplaceJson}
                />
              </div>
              {replaceError && <p className="m-0 text-xs text-red-400">{replaceError}</p>}
              <div className="flex flex-col gap-1.5">
                <button onClick={handleSaveViewAsCover} className={btnDark}>
                  <Icon icon="lucide:camera" width={14} height={14} />
                  Save View as Cover
                </button>
                <button onClick={() => snapshotInputRef.current?.click()} className={btnDark}>
                  <Icon icon="lucide:image-up" width={14} height={14} />
                  Upload Cover File
                </button>
                <input
                  ref={snapshotInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleSnapshotUpload}
                />
              </div>
            </div>
          )}

          {/* Piece breakdown */}
          {pieceGroups.length > 0 && (
            <div className="flex flex-col">
              <p className="m-0 mb-2 text-[10px] uppercase tracking-wide text-white/40">
                Piece Breakdown
              </p>
              {pieceGroups.map(({ category, count }) => (
                <div
                  key={category}
                  className="flex items-center justify-between border-b border-white/5 py-1 text-[11px] last:border-b-0"
                >
                  <span className="inline-flex items-center gap-1.5 text-white/60">
                    <Icon icon={categoryIcon(category)} width={11} height={11} className="text-white/35" />
                    {category}
                  </span>
                  <span className="font-semibold text-[#c8a84b]">×{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Categories surfaced as one-click chips in the edit-tags row. Anything else the
// user types becomes a free-form tag chip with a remove button.
const STANDARD_TAGS = [
  "Foundation", "Wall", "Floor", "Rooftop", "Ramp", "Stairs", "Pillar", "Door", "Decoration",
] as const satisfies readonly string[];

// Button class presets — keep the dune look (1px borders, near-square corners,
// distinct intent per action) while still composable via Tailwind className.
const btnBase =
  "inline-flex items-center justify-center gap-1.5 cursor-pointer select-none " +
  "rounded-[2px] border px-3 py-2 text-xs font-semibold leading-none transition-colors " +
  "disabled:cursor-default disabled:opacity-50";

const btnGold = `${btnBase} w-full bg-[#c8a84b] border-[#c8a84b] text-black text-sm py-2.5 hover:bg-[#d4b659]`;
const btnGhost = `${btnBase} w-full bg-transparent border-white/15 text-white/70 hover:bg-white/5 hover:text-white`;
const btnDark = `${btnBase} w-full bg-[#1e1e2e] border-white/10 text-white/80 hover:bg-[#26263a]`;
const btnDanger = `${btnBase} bg-[#2e1a1a] border-[#4a2a2a] text-[#d97070] hover:bg-[#3a2222]`;
const btnBlue = `${btnBase} bg-[#1a1e2e] border-[rgba(100,130,255,0.25)] text-[rgba(100,130,255,0.75)] hover:bg-[#22263a]`;
const btnLiked = `${btnBase} w-full bg-[rgba(200,50,50,0.18)] border-[rgba(200,50,50,0.45)] text-[#e05555] hover:bg-[rgba(200,50,50,0.28)]`;

interface VariantSwitcherProps {
  variants: BlueprintVariantSummary[];
  selectedVariantId: string | null;
  dirty: boolean;
  isOwner: boolean;
  hasOverrides: boolean;
  onSelect: (variantId: string | null) => void;
  onSaveNew: () => void;
  onSaveChanges: () => void;
  onRename: () => void;
  onDelete: () => void;
}

function VariantSwitcher({
  variants,
  selectedVariantId,
  dirty,
  isOwner,
  hasOverrides,
  onSelect,
  onSaveNew,
  onSaveChanges,
  onRename,
  onDelete,
}: VariantSwitcherProps) {
  // Hide entirely for non-owners with no variants to pick from.
  if (!isOwner && variants.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-white/10 bg-black/30 p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-white/40">
        <span>Variant</span>
        {dirty && <span className="font-bold text-accent normal-case tracking-normal">· unsaved</span>}
      </div>

      <Select
        className="w-full"
        selectedKey={selectedVariantId ?? "original"}
        onSelectionChange={(key) => onSelect(key === "original" ? null : String(key))}
        aria-label="Variant"
      >
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            <ListBox.Item id="original" textValue="Original">
              Original
              <ListBox.ItemIndicator />
            </ListBox.Item>
            {variants.map((v) => (
              <ListBox.Item key={v.id} id={v.id} textValue={v.name}>
                {v.name}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>

      {/* Selected variant's description as a short blurb under the picker. */}
      {(() => {
        const sel = selectedVariantId
          ? variants.find((v) => v.id === selectedVariantId)
          : null;
        if (!sel?.description) return null;
        return (
          <p className="m-0 text-[11px] leading-snug text-white/55">{sel.description}</p>
        );
      })()}

      {isOwner && (
        // Tight icon+label cluster — buttons share the available width and
        // never wrap to a second row inside the 320px sidebar.
        <div className="grid grid-cols-[repeat(auto-fit,minmax(0,1fr))] gap-1.5">
          {selectedVariantId && dirty && (
            <button onClick={onSaveChanges} className={`${btnGold} px-2 py-1.5 text-xs`}>
              <Icon icon="lucide:save" width={12} height={12} />
              Save
            </button>
          )}
          {hasOverrides && (
            <button onClick={onSaveNew} className={`${btnGhost} px-2 py-1.5 text-xs`}>
              <Icon icon="lucide:plus" width={12} height={12} />
              New
            </button>
          )}
          {selectedVariantId && (
            <>
              <button onClick={onRename} className={`${btnGhost} px-2 py-1.5 text-xs`}>
                <Icon icon="lucide:pencil" width={12} height={12} />
                Edit
              </button>
              <button onClick={onDelete} className={`${btnDanger} px-2 py-1.5 text-xs`}>
                <Icon icon="lucide:trash-2" width={12} height={12} />
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

interface PieceVariantsTriggerProps {
  raw: RawBlueprint | undefined;
  overrides: Record<string, string>;
  onOpen: () => void;
}

function PieceVariantsTrigger({ raw, overrides, onOpen }: PieceVariantsTriggerProps) {
  // null while loading the lazy pieceEquivalents chunk; once known, the count
  // either renders the trigger or hides it (when no swappable pieces exist).
  const [swappableCount, setSwappableCount] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    void import("../data/pieceEquivalents").then(({ findEquivalents }) => {
      if (cancelled) return;
      const breakdown = buildTemplateBreakdown(raw, overrides);
      const count = breakdown.filter((r) => findEquivalents(r.originalTemplateId).length > 0).length;
      setSwappableCount(count);
    });
    return () => { cancelled = true; };
  }, [raw, overrides]);

  if (swappableCount === null || swappableCount === 0) return null;
  const overrideCount = Object.keys(overrides).length;

  // Two-line layout — primary label + swapped count on the first line, swappable
  // count + chevron on the second. Gold when active so the swapped state pops.
  const active = overrideCount > 0;
  return (
    <button
      onClick={onOpen}
      className={`${btnBase} w-full flex-col items-stretch gap-1 px-3 py-2 ${
        active
          ? "bg-[#c8a84b] border-[#c8a84b] text-black hover:bg-[#d4b659]"
          : "bg-[#1e1e2e] border-white/10 text-white/80 hover:bg-[#26263a]"
      }`}
    >
      <span className="flex items-center justify-between text-sm font-semibold">
        <span className="inline-flex items-center gap-1.5">
          <Icon icon="lucide:layers" width={14} height={14} />
          Piece variants
        </span>
        {active && <span className="font-normal opacity-80">· {overrideCount} swapped</span>}
      </span>
      <span className={`flex items-center justify-between text-[11px] ${active ? "opacity-80" : "opacity-60"}`}>
        <span>{swappableCount} swappable</span>
        <Icon icon="lucide:chevron-right" width={12} height={12} />
      </span>
    </button>
  );
}


interface TemplateBreakdownEntry {
  templateId: string; // current (post-override) templateId in the displayed scene
  originalTemplateId: string; // pre-override templateId — key for overrides map
  count: number;
}

function buildTemplateBreakdown(
  raw: RawBlueprint | undefined,
  overrides: Record<string, string>,
): TemplateBreakdownEntry[] {
  if (!raw) return [];
  const counts: Record<string, number> = {};
  const all = [
    ...(raw.instances ?? []).map((i) => i.building_type),
    ...(raw.placeables ?? []).map((p) => p.building_type),
  ];
  for (const t of all) counts[t] = (counts[t] ?? 0) + 1;
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([originalTemplateId, count]) => ({
      originalTemplateId,
      templateId: overrides[originalTemplateId] ?? originalTemplateId,
      count,
    }));
}

function buildPieceBreakdown(bp: BlueprintDetail): { category: string; count: number }[] {
  if (!bp.blueprint_data) return [];
  const counts: Record<string, number> = {};
  const allTypes = [
    ...(bp.blueprint_data.instances ?? []).map((i) => i.building_type),
    ...(bp.blueprint_data.placeables ?? []).map((p) => p.building_type),
  ];
  for (const t of allTypes) {
    const cat = categoryFromType(t);
    counts[cat] = (counts[cat] ?? 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => ({ category, count }));
}

function categoryFromType(id: string): string {
  const l = id.toLowerCase();
  if (l.includes("foundation")) return "Foundation";
  if (l.includes("wall")) return "Wall";
  if (l.includes("floor")) return "Floor";
  if (l.includes("roof") || l.includes("rooftop")) return "Rooftop";
  if (l.includes("ramp")) return "Ramp";
  if (l.includes("stair")) return "Stairs";
  if (l.includes("pillar") || l.includes("column")) return "Pillar";
  if (l.includes("door") || l.includes("window")) return "Door";
  return "Decoration";
}

// Visual cue for the piece-breakdown rows. Closest Lucide icon for each category.
function categoryIcon(category: string): string {
  switch (category) {
    case "Foundation": return "lucide:square";
    case "Wall":       return "lucide:rectangle-vertical";
    case "Floor":      return "lucide:layout-grid";
    case "Rooftop":    return "lucide:triangle";
    case "Ramp":       return "lucide:trending-up";
    case "Stairs":     return "lucide:stairs";
    case "Pillar":     return "lucide:columns-3";
    case "Door":       return "lucide:door-open";
    default:           return "lucide:shapes";
  }
}
