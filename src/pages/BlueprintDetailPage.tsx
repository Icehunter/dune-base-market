import { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth, SignInButton } from '@clerk/react';
import { getBlueprint, downloadBlueprint, deleteBlueprint, updateBlueprint, saveRotationOverrides, uploadSnapshot, rateBlueprint, replaceBlueprintJson, getVariant, createVariant, updateVariant, deleteVariant, forkBlueprint } from '../lib/api';
import type { BlueprintDetail, BlueprintVariantSummary, BlueprintVariant } from '../lib/api';
import type { RawBlueprint, PlacedPiece } from '../stores/buildingStore';
import type { RotMap } from '../data/modelRegistry';
import { findEquivalents, getSetLabel, getShape } from '../data/pieceEquivalents';
import type { SceneCanvasHandle } from '../components/Scene';
import { ViewerHUD } from '../components/Scene';

const SceneCanvas = lazy(() =>
  import('../components/Scene').then((m) => ({ default: m.SceneCanvas }))
);

export default function BlueprintDetailPage() {
  const { id, variantId: variantIdFromUrl } = useParams<{ id: string; variantId?: string }>();
  const navigate = useNavigate();
  const { isSignedIn, userId, getToken } = useAuth();
  const [blueprint, setBlueprint] = useState<BlueprintDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editPublic, setEditPublic] = useState(true);
  const [editTags, setEditTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [locked, setLocked] = useState(false);
  const [selectedPiece, setSelectedPiece] = useState<PlacedPiece | null>(null);
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [userRated, setUserRated] = useState(false);
  const [ratingCount, setRatingCount] = useState(0);
  const [replacing, setReplacing] = useState(false);
  const [replaceError, setReplaceError] = useState<string | null>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [viewerMode, setViewerMode] = useState<'orbit' | 'fly'>('orbit');
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
  // Default: open on desktop, collapsed on mobile.
  const [infoOpen, setInfoOpen] = useState(() =>
    typeof window === 'undefined' ? true : window.innerWidth >= 768,
  );
  // devMapRef holds the live map — never triggers re-renders on its own.
  // devDisplayMap is a copy used only to re-render the HUD.
  const sceneRef  = useRef<SceneCanvasHandle | null>(null);
  const devMapRef = useRef<Partial<Record<string, RotMap>>>({});
  const [devDisplayMap, setDevDisplayMap] = useState<Partial<Record<string, RotMap>>>({});

  useEffect(() => {
    const onChange = () => setLocked(document.pointerLockElement !== null);
    document.addEventListener('pointerlockchange', onChange);
    return () => document.removeEventListener('pointerlockchange', onChange);
  }, []);

  useEffect(() => {
    if (!selectedPiece || !isEditMode) return;
    const DEV_CYCLE = [0, 7.5, 15, 22.5, 30, 37.5, 45, 52.5, 60, 67.5, 75, 82.5, 90, 97.5, 105, 112.5, 120, 127.5, 135, 142.5, 150, 157.5, 165, 172.5, 180, -172.5, -165, -157.5, -150, -142.5, -135, -127.5, -120, -112.5, -105, -97.5, -90, -82.5, -75, -67.5, -60, -52.5, -45, -37.5, -30, -22.5, -15, -7.5] as const;
    const onKeyDown = (e: KeyboardEvent) => {
      const { templateId, transform: { rotation } } = selectedPiece;
      const n = ((rotation % 360) + 360) % 360;
      const key = n > 180 ? n - 360 : n;

      // Backspace/Delete — clear override for this piece's stored rotation
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        const newTemplateMap = { ...devMapRef.current[templateId] };
        delete newTemplateMap[key];
        // Keep empty object rather than deleting the key — applyDevOverrides needs
        // to see the templateId to revert those pieces to their base rotation.
        const newMap = { ...devMapRef.current, [templateId]: newTemplateMap };
        devMapRef.current = newMap;
        sceneRef.current?.applyDevOverrides(devMapRef.current, devMapRef.current);
        setDevDisplayMap({ ...devMapRef.current });
        console.log('[DEV] reset override for', templateId, key, '→', devMapRef.current);
        return;
      }

      if (e.key !== 'r' && e.key !== 'R') return;
      e.preventDefault();
      const current = devMapRef.current[templateId]?.[key] ?? 0;
      const idx = DEV_CYCLE.indexOf(current as typeof DEV_CYCLE[number]);
      const step = e.shiftKey ? -1 : 1;
      const next = DEV_CYCLE[((idx + step) % DEV_CYCLE.length + DEV_CYCLE.length) % DEV_CYCLE.length];
      devMapRef.current = {
        ...devMapRef.current,
        [templateId]: { ...devMapRef.current[templateId], [key]: next },
      };
      sceneRef.current?.applyDevOverrides(devMapRef.current, devMapRef.current);
      setDevDisplayMap({ ...devMapRef.current });
      console.log('[DEV] ROTATION_BY_STORED override:', devMapRef.current);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selectedPiece, isEditMode]); // isEditMode gates the listener

  useEffect(() => {
    if (!id) return;
    // Only show spinner on first load; re-fetching for auth state doesn't flash the page.
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
      .catch(() => setError('Blueprint not found'))
      .finally(() => setLoading(false));
  }, [id, isSignedIn]); // isSignedIn: re-fetch once auth resolves so user_rated is correct

  const isOwnerForEffect = !!userId && !!blueprint && userId === blueprint.user_id;

  useEffect(() => {
    if (!isOwnerForEffect) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault();
        setIsEditMode(m => !m);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOwnerForEffect]);

  useEffect(() => {
    if (!isOwnerForEffect || !id || !isSignedIn) return;
    const timer = setTimeout(() => {
      const map = Object.keys(devMapRef.current).length > 0 ? devMapRef.current : null;
      saveRotationOverrides(id, map as Record<string, Record<number, number>> | null, getToken)
        .catch(console.error);
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
      else                          setVariantDirty(true);
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
    try { await downloadBlueprint(id, getToken, selectedVariantId ?? undefined); }
    catch (err) { console.error(err); }
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
    } catch (err) { console.error(err); }
  }

  async function handleSaveAsNewVariant() {
    if (!id) return;
    const name = window.prompt('Name this variant', '')?.trim();
    if (!name) return;
    try {
      const v = await createVariant(id, {
        name,
        piece_overrides: Object.keys(templateOverrides).length ? templateOverrides : null,
      }, getToken);
      setVariants((prev) => [...prev, { id: v.id, name: v.name, snapshot_url: v.snapshot_url, download_count: v.download_count, created_at: v.created_at }]);
      setSelectedVariantId(v.id);
      setVariantDirty(false);
      navigate(`/blueprint/${id}/v/${v.id}`, { replace: true });
    } catch (err) { console.error(err); }
  }

  async function handleSaveVariantChanges() {
    if (!id || !selectedVariantId) return;
    try {
      await updateVariant(id, selectedVariantId, {
        piece_overrides: Object.keys(templateOverrides).length ? templateOverrides : null,
      }, getToken);
      setVariantDirty(false);
    } catch (err) { console.error(err); }
  }

  async function handleRenameVariant() {
    if (!id || !selectedVariantId) return;
    const current = variants.find((v) => v.id === selectedVariantId);
    const name = window.prompt('Rename variant', current?.name ?? '')?.trim();
    if (!name) return;
    try {
      await updateVariant(id, selectedVariantId, { name }, getToken);
      setVariants((prev) => prev.map((v) => v.id === selectedVariantId ? { ...v, name } : v));
    } catch (err) { console.error(err); }
  }

  async function handleDeleteVariant() {
    if (!id || !selectedVariantId) return;
    const current = variants.find((v) => v.id === selectedVariantId);
    if (!confirm(`Delete variant "${current?.name}"?`)) return;
    try {
      await deleteVariant(id, selectedVariantId, getToken);
      setVariants((prev) => prev.filter((v) => v.id !== selectedVariantId));
      setSelectedVariantId(null);
      setTemplateOverrides({});
      setVariantDirty(false);
      navigate(`/blueprint/${id}`, { replace: true });
    } catch (err) { console.error(err); }
  }

  async function handleDelete() {
    if (!id || !confirm('Delete this blueprint?')) return;
    try {
      await deleteBlueprint(id, getToken);
      window.location.href = '/';
    } catch (err) { console.error(err); }
  }

  async function handleSaveEdit() {
    if (!id) return;
    try {
      await updateBlueprint(id, { title: editTitle, is_public: editPublic, tags: editTags }, getToken);
      setBlueprint((prev) => prev ? { ...prev, title: editTitle, is_public: editPublic ? 1 : 0, tags: editTags } : prev);
      setEditing(false);
    } catch (err) { console.error(err); }
  }

  // When a variant is selected, snapshots target that variant. Selecting Original
  // updates the blueprint cover. Cover URL state is refreshed so the sidebar img reloads.
  function applyUploadedSnapshotUrl(url: string) {
    if (selectedVariantId) {
      setVariants((prev) => prev.map((v) =>
        v.id === selectedVariantId ? { ...v, snapshot_url: url } : v,
      ));
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
    } catch (err) {
      console.error('Snapshot upload failed', err);
    }
  }

  async function handleSaveViewAsCover() {
    if (!id) return;
    try {
      const blob = await sceneRef.current!.captureScreenshot();
      const file = new File([blob], 'cover.jpg', { type: 'image/jpeg' });
      const { snapshot_url } = await uploadSnapshot(id, file, getToken, selectedVariantId ?? undefined);
      applyUploadedSnapshotUrl(snapshot_url);
    } catch (err) {
      console.error('Save view as cover failed', err);
    }
  }

  async function handleFork() {
    if (!id) return;
    try {
      const { id: newId } = await forkBlueprint(id, getToken, selectedVariantId ?? undefined);
      navigate(`/blueprint/${newId}`);
    } catch (err) {
      console.error('Fork failed', err);
    }
  }

  async function handleRate() {
    if (!id || !isSignedIn) return;
    try {
      const { rated, rating_count } = await rateBlueprint(id, getToken);
      setUserRated(rated);
      setRatingCount(rating_count);
    } catch (err) {
      console.error('Rate failed', err);
    }
  }

  async function handleReplaceJson(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !id) return;
    if (!file.name.endsWith('.json')) { setReplaceError('File must be a .json blueprint'); return; }
    if (file.size > 2 * 1024 * 1024) { setReplaceError('File too large (max 2MB)'); return; }
    try {
      const text = await file.text();
      JSON.parse(text);
    } catch {
      setReplaceError('Invalid JSON — could not parse blueprint');
      return;
    }
    setReplacing(true);
    setReplaceError(null);
    try {
      await replaceBlueprintJson(id, file, getToken);
      const bp = await getBlueprint(id, isSignedIn ? getToken : undefined);
      setBlueprint(bp);
    } catch (err) {
      setReplaceError(err instanceof Error ? err.message : 'Replace failed');
    } finally {
      setReplacing(false);
    }
  }

  if (loading) return (
    <div style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', paddingTop: 80 }}>Loading...</div>
  );
  if (error || !blueprint) return (
    <div style={{ color: '#e05555', textAlign: 'center', paddingTop: 80 }}>
      {error ?? 'Not found'} · <Link to="/" style={{ color: '#c8a84b' }}>Back to gallery</Link>
    </div>
  );

  const isOwner = !!userId && userId === blueprint.user_id;
  const pieceGroups = buildPieceBreakdown(blueprint);

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 52px)', overflow: 'hidden', position: 'relative' }}>
      {/* Piece variants drawer — overlays the right side when open */}
      <PieceVariantsDrawer
        open={pieceVariantsOpen}
        onClose={() => setPieceVariantsOpen(false)}
        raw={blueprint.blueprint_data as unknown as RawBlueprint | undefined}
        overrides={templateOverrides}
        onChange={setTemplateOverrides}
      />

      {/* 3D Viewer */}
      <div style={{ flex: 1, position: 'relative', background: '#000', overflow: 'hidden' }}>
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.2)' }}>
            No preview available
          </div>
        )}

        {/* Crosshair */}
        {locked && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none', color: 'rgba(255,255,255,0.7)',
            fontSize: 20, lineHeight: 1, userSelect: 'none',
          }}>+</div>
        )}

        <ViewerHUD
          mode={viewerMode}
          locked={locked}
          pieceSelected={!!selectedPiece}
          isOwner={isOwner}
          isEditMode={isEditMode}
        />

        {/* Edit mode toggle — owner only */}
        {isOwner && blueprint.blueprint_data && (
          <button
            onClick={() => setIsEditMode(m => !m)}
            style={{
              position: 'absolute', top: 12, right: 12,
              background: isEditMode ? 'rgba(200,168,75,0.2)' : 'rgba(0,0,0,0.5)',
              border: `1px solid ${isEditMode ? 'rgba(200,168,75,0.6)' : 'rgba(255,255,255,0.15)'}`,
              borderRadius: 6,
              color: isEditMode ? '#c8a84b' : 'rgba(255,255,255,0.5)',
              fontSize: 11,
              padding: '5px 10px',
              cursor: 'pointer',
              backdropFilter: 'blur(4px)',
            }}
          >
            {isEditMode ? '✓ Editing' : 'Edit Rotations'}
          </button>
        )}

        {/* Selected piece info */}
        {selectedPiece && (
          <div style={{
            position: 'absolute', bottom: 16, left: 16,
            background: 'rgba(20,20,28,0.92)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 8,
            padding: '10px 14px',
            color: '#fff',
            fontSize: 11,
            pointerEvents: 'none',
            userSelect: 'none',
            maxWidth: 320,
            lineHeight: 1.7,
          }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
              {selectedPiece.category}
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#ffd84a', wordBreak: 'break-all', marginBottom: 4 }}>
              {selectedPiece.templateId}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.6)' }}>
              <span style={{ color: '#fff' }}>Rotation:</span> {selectedPiece.transform.rotation}°
              &nbsp;&nbsp;
              <span style={{ color: '#fff' }}>Category:</span> {selectedPiece.category}
            </div>
            {isOwner && isEditMode && (() => {
              const n = ((selectedPiece.transform.rotation % 360) + 360) % 360;
              const key = n > 180 ? n - 360 : n;
              const devVal = devDisplayMap[selectedPiece.templateId]?.[key];
              return devVal !== undefined ? (
                <div style={{ color: '#7ec8e3', fontSize: 10 }}>
                  [override] {devVal > 0 ? '+' : ''}{devVal}° · R / Shift+R to cycle
                </div>
              ) : (
                <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10 }}>
                  R to add rotation fix
                </div>
              );
            })()}
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>
              x={selectedPiece.transform.position.x}&nbsp;
              y={selectedPiece.transform.position.y}&nbsp;
              z={selectedPiece.transform.position.z}
            </div>
            {selectedPiece.scale && (
              <div style={{ color: 'rgba(100,200,255,0.7)', fontSize: 10 }}>
                scale {selectedPiece.scale.x}×{selectedPiece.scale.y}×{selectedPiece.scale.z}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Slim re-open tab when the sidebar is closed. Vertically centered on the right
          edge so it never collides with the Edit Rotations / mode chips up top. */}
      {!infoOpen && (
        <button
          onClick={() => setInfoOpen(true)}
          aria-label="Show info"
          style={{
            position: 'absolute',
            top: '50%',
            right: 0,
            transform: 'translateY(-50%)',
            zIndex: 50,
            background: 'rgba(30,30,42,0.92)',
            border: '1px solid rgba(255,255,255,0.25)',
            borderRight: 'none',
            borderTopLeftRadius: 6,
            borderBottomLeftRadius: 6,
            color: '#fff',
            fontSize: 12,
            fontWeight: 600,
            padding: '12px 8px',
            cursor: 'pointer',
            backdropFilter: 'blur(6px)',
            boxShadow: '-2px 2px 6px rgba(0,0,0,0.4)',
            writingMode: 'vertical-rl',
          }}
        >
          ‹ Info
        </button>
      )}

      {/* Sidebar */}
      {infoOpen && (
      <div
        style={{
          width: 280,
          background: '#13131a',
          borderLeft: '1px solid rgba(255,255,255,0.07)',
          overflowY: 'auto',
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link to="/" style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textDecoration: 'none' }}>
            ← Back to gallery
          </Link>
          <button
            onClick={() => setInfoOpen(false)}
            aria-label="Hide info"
            style={{
              background: 'transparent', border: 'none',
              color: 'rgba(255,255,255,0.5)', fontSize: 18,
              cursor: 'pointer', padding: '0 4px', lineHeight: 1,
            }}
          >×</button>
        </div>

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
          onRename={handleRenameVariant}
          onDelete={handleDeleteVariant}
        />

        {(() => {
          const variantSnap = selectedVariantId
            ? variants.find((v) => v.id === selectedVariantId)?.snapshot_url ?? null
            : null;
          const url = variantSnap ?? snapshotUrl;
          return url ? (
            <img
              src={url}
              alt="Cover"
              style={{ width: '100%', borderRadius: 6, objectFit: 'cover', aspectRatio: '16/9' }}
            />
          ) : null;
        })()}

        {/* Title / edit mode */}
        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              maxLength={80}
              style={{
                background: '#0a0a0f', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 4, padding: '6px 8px', color: '#fff', fontSize: 13,
              }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
              <input type="checkbox" checked={editPublic} onChange={(e) => setEditPublic(e.target.checked)} />
              Public
            </label>
            <div>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 6px' }}>Tags</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                {['Foundation','Wall','Floor','Rooftop','Ramp','Stairs','Pillar','Door','Decoration'].map((tag) => {
                  const active = editTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      onClick={() => setEditTags(active ? editTags.filter(t => t !== tag) : [...editTags, tag])}
                      style={{
                        background: active ? 'rgba(200,168,75,0.2)' : 'rgba(255,255,255,0.05)',
                        border: `1px solid ${active ? 'rgba(200,168,75,0.5)' : 'rgba(255,255,255,0.1)'}`,
                        color: active ? '#c8a84b' : 'rgba(255,255,255,0.4)',
                        borderRadius: 12, padding: '2px 9px', fontSize: 10, cursor: 'pointer',
                      }}
                    >{tag}</button>
                  );
                })}
                {editTags.filter(t => !['Foundation','Wall','Floor','Rooftop','Ramp','Stairs','Pillar','Door','Decoration'].includes(t)).map((tag) => (
                  <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(200,168,75,0.2)', border: '1px solid rgba(200,168,75,0.5)', color: '#c8a84b', borderRadius: 12, padding: '2px 9px', fontSize: 10 }}>
                    {tag}
                    <button onClick={() => setEditTags(editTags.filter(t2 => t2 !== tag))} style={{ background: 'none', border: 'none', color: '#c8a84b', cursor: 'pointer', padding: 0, fontSize: 11, lineHeight: 1 }}>×</button>
                  </span>
                ))}
              </div>
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
                    e.preventDefault();
                    const t = tagInput.trim().replace(/,/g, '');
                    if (t && !editTags.includes(t)) setEditTags([...editTags, t]);
                    setTagInput('');
                  }
                }}
                placeholder="Type a tag, press Enter"
                style={{
                  width: '100%', background: '#0a0a0f', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 4, padding: '5px 8px', color: '#fff', fontSize: 11,
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={handleSaveEdit} style={{ flex: 1, background: '#c8a84b', border: 'none', borderRadius: 4, color: '#000', fontWeight: 700, fontSize: 12, padding: '5px 0', cursor: 'pointer' }}>Save</button>
              <button onClick={() => setEditing(false)} style={{ flex: 1, background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, color: 'rgba(255,255,255,0.5)', fontSize: 12, padding: '5px 0', cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        ) : (
          <div>
            <h1 style={{ color: '#fff', fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>{blueprint.title}</h1>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, margin: 0 }}>
              by {blueprint.username} · {new Date(blueprint.created_at).toLocaleDateString()}
            </p>
            <span style={{
              display: 'inline-block',
              marginTop: 6,
              background: blueprint.is_public ? '#1a2e1a' : '#2e1a1a',
              border: `1px solid ${blueprint.is_public ? '#2a4a2a' : '#4a2a2a'}`,
              color: blueprint.is_public ? '#5a9a5a' : '#9a5a5a',
              fontSize: 9,
              padding: '1px 5px',
              borderRadius: 3,
            }}>
              {blueprint.is_public ? 'public' : 'private'}
            </span>
          </div>
        )}

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            { label: 'Pieces', value: blueprint.piece_count ?? '—' },
            { label: 'Size', value: blueprint.file_size ? `${(blueprint.file_size / 1024).toFixed(1)}KB` : '—' },
            { label: 'Downloads', value: blueprint.download_count },
            { label: 'Tags', value: blueprint.tags.length || '—' },
          ].map(({ label, value }) => (
            <div
              key={label}
              style={{
                background: '#0a0a0f', border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 6, padding: '8px 10px', textAlign: 'center',
              }}
            >
              <div style={{ color: '#c8a84b', fontSize: 14, fontWeight: 700 }}>{value}</div>
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, marginTop: 2 }}>{label}</div>
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
          <button
            onClick={handleDownload}
            style={{
              width: '100%', background: '#c8a84b', border: 'none', borderRadius: 6,
              color: '#000', fontWeight: 700, padding: '9px 0', fontSize: 13, cursor: 'pointer',
            }}
          >
            ⬇ Download{Object.keys(templateOverrides).length > 0 ? ' (with swaps)' : ''}
          </button>
        ) : (
          <SignInButton mode="modal">
            <button style={{
              width: '100%', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 6, color: 'rgba(255,255,255,0.4)', padding: '9px 0', fontSize: 13, cursor: 'pointer',
            }}>
              🔒 Sign in to download
            </button>
          </SignInButton>
        )}

        {/* Fork — any signed-in user except the owner. Creates a private copy of the
            currently-selected variant (or Original) in their own account. */}
        {isSignedIn && !isOwner && (
          <button
            onClick={handleFork}
            style={{
              width: '100%', background: 'transparent',
              border: '1px solid rgba(255,255,255,0.18)', borderRadius: 6,
              color: 'rgba(255,255,255,0.7)', padding: '8px 0',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
            title="Make a private copy in your account"
          >
            ⑂ Fork{selectedVariantId ? ' this variant' : ''}
          </button>
        )}

        {/* Like button */}
        {isSignedIn && (
          <button
            onClick={handleRate}
            style={{
              width: '100%',
              background: userRated ? 'rgba(200,50,50,0.2)' : 'transparent',
              border: `1px solid ${userRated ? 'rgba(200,50,50,0.5)' : 'rgba(255,255,255,0.15)'}`,
              borderRadius: 6,
              color: userRated ? '#e05555' : 'rgba(255,255,255,0.4)',
              padding: '9px 0',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            {userRated ? '♥' : '♡'} {ratingCount} {userRated ? 'Liked' : 'Like'}
          </button>
        )}

        {/* Owner controls */}
        {isOwner && !editing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => setEditing(true)}
                style={{ flex: 1, background: '#1e1e2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#aaa', fontSize: 12, padding: '6px 0', cursor: 'pointer' }}
              >
                ✏ Edit
              </button>
              <button
                onClick={handleDelete}
                style={{ flex: 1, background: '#2e1a1a', border: '1px solid #4a2a2a', borderRadius: 4, color: '#9a5a5a', fontSize: 12, padding: '6px 0', cursor: 'pointer' }}
              >
                🗑 Delete
              </button>
              <label
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1e2e', border: '1px solid rgba(100,130,255,0.25)', borderRadius: 4, color: replacing ? 'rgba(100,130,255,0.4)' : 'rgba(100,130,255,0.7)', fontSize: 12, padding: '6px 0', cursor: replacing ? 'default' : 'pointer', textAlign: 'center' }}
              >
                {replacing ? '⏳' : '🔄'} Replace
                <input
                  ref={replaceInputRef}
                  type="file"
                  accept=".json"
                  style={{ display: 'none' }}
                  disabled={replacing}
                  onChange={handleReplaceJson}
                />
              </label>
            </div>
            {replaceError && (
              <p style={{ color: '#e05555', fontSize: 11, margin: 0 }}>{replaceError}</p>
            )}
            {isOwner && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button
                  onClick={handleSaveViewAsCover}
                  style={{
                    width: '100%',
                    background: '#1e1e2e',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 4,
                    color: '#aaa',
                    fontSize: 12,
                    padding: '6px 0',
                    cursor: 'pointer',
                  }}
                >
                  📷 Save View as Cover
                </button>
                <label style={{
                  display: 'block',
                  textAlign: 'center',
                  background: '#1e1e2e',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 4,
                  color: '#aaa',
                  fontSize: 12,
                  padding: '6px 0',
                  cursor: 'pointer',
                }}>
                  📁 Upload Cover File
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    style={{ display: 'none' }}
                    onChange={handleSnapshotUpload}
                  />
                </label>
              </div>
            )}
          </div>
        )}

        {/* Piece breakdown */}
        {pieceGroups.length > 0 && (
          <div>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 8px' }}>
              Piece Breakdown
            </p>
            {pieceGroups.map(({ category, count }) => (
              <div
                key={category}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '4px 0', fontSize: 11,
                }}
              >
                <span style={{ color: 'rgba(255,255,255,0.6)' }}>{category}</span>
                <span style={{ color: '#c8a84b', fontWeight: 600 }}>×{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      )}
    </div>
  );
}

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
  variants, selectedVariantId, dirty, isOwner, hasOverrides,
  onSelect, onSaveNew, onSaveChanges, onRename, onDelete,
}: VariantSwitcherProps) {
  // Hide entirely for non-owners with no variants to pick from.
  if (!isOwner && variants.length === 0) return null;

  return (
    <div style={{
      background: '#0a0a0f',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 6,
      padding: 10,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Variant
        </span>
        {dirty && (
          <span style={{ color: '#c8a84b', fontSize: 10, fontWeight: 700 }}>· unsaved</span>
        )}
      </div>

      <select
        value={selectedVariantId ?? ''}
        onChange={(e) => onSelect(e.target.value || null)}
        style={{
          width: '100%', background: '#13131a',
          border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4,
          color: '#fff', fontSize: 12, padding: '6px 8px',
        }}
      >
        <option value="">Original</option>
        {variants.map((v) => (
          <option key={v.id} value={v.id}>{v.name}</option>
        ))}
      </select>

      {isOwner && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {selectedVariantId && dirty && (
            <button
              onClick={onSaveChanges}
              style={btnPrimary}
            >Save changes</button>
          )}
          {hasOverrides && (
            <button
              onClick={onSaveNew}
              style={btnSecondary}
            >Save as new…</button>
          )}
          {selectedVariantId && (
            <>
              <button onClick={onRename} style={btnSecondary}>Rename</button>
              <button onClick={onDelete} style={btnDanger}>Delete</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const btnPrimary: React.CSSProperties = {
  background: '#c8a84b', border: 'none', borderRadius: 4,
  color: '#000', fontSize: 11, fontWeight: 700,
  padding: '4px 10px', cursor: 'pointer',
};
const btnSecondary: React.CSSProperties = {
  background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4,
  color: 'rgba(255,255,255,0.7)', fontSize: 11,
  padding: '4px 10px', cursor: 'pointer',
};
const btnDanger: React.CSSProperties = {
  background: 'transparent', border: '1px solid rgba(200,80,80,0.4)', borderRadius: 4,
  color: '#d97070', fontSize: 11,
  padding: '4px 10px', cursor: 'pointer',
};

interface PieceVariantsTriggerProps {
  raw: RawBlueprint | undefined;
  overrides: Record<string, string>;
  onOpen: () => void;
}

function PieceVariantsTrigger({ raw, overrides, onOpen }: PieceVariantsTriggerProps) {
  const swappableCount = useMemo(() => {
    const breakdown = buildTemplateBreakdown(raw, overrides);
    return breakdown.filter((r) => findEquivalents(r.originalTemplateId).length > 0).length;
  }, [raw, overrides]);

  if (swappableCount === 0) return null;
  const overrideCount = Object.keys(overrides).length;

  return (
    <button
      onClick={onOpen}
      style={{
        width: '100%',
        background: overrideCount > 0 ? 'rgba(200,168,75,0.12)' : '#0a0a0f',
        border: `1px solid ${overrideCount > 0 ? 'rgba(200,168,75,0.35)' : 'rgba(255,255,255,0.1)'}`,
        borderRadius: 6,
        color: overrideCount > 0 ? '#c8a84b' : 'rgba(255,255,255,0.7)',
        padding: '8px 10px',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        textAlign: 'left',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <span>
        Piece variants
        {overrideCount > 0 && (
          <span style={{ marginLeft: 6, fontWeight: 400 }}>· {overrideCount} swapped</span>
        )}
      </span>
      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 400 }}>
        {swappableCount} swappable ›
      </span>
    </button>
  );
}

interface PieceVariantsDrawerProps {
  open: boolean;
  onClose: () => void;
  raw: RawBlueprint | undefined;
  overrides: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}

function PieceVariantsDrawer({ open, onClose, raw, overrides, onChange }: PieceVariantsDrawerProps) {
  const breakdown = useMemo(() => buildTemplateBreakdown(raw, overrides), [raw, overrides]);
  const swappable = useMemo(
    () => breakdown.filter((row) => findEquivalents(row.originalTemplateId).length > 0),
    [breakdown],
  );
  const overrideCount = Object.keys(overrides).length;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0,
      width: 360, maxWidth: '100%',
      background: '#13131a',
      borderLeft: '1px solid rgba(255,255,255,0.08)',
      boxShadow: '-8px 0 24px rgba(0,0,0,0.4)',
      zIndex: 100,
      display: 'flex', flexDirection: 'column',
    }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
          <div>
            <div style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>Piece variants</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 2 }}>
              {swappable.length} piece types with alternates
              {overrideCount > 0 && ` · ${overrideCount} swapped`}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.6)',
              fontSize: 20, cursor: 'pointer', padding: '0 4px', lineHeight: 1,
            }}
            aria-label="Close"
          >×</button>
        </div>

        {overrideCount > 0 && (
          <div style={{ padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <button
              onClick={() => onChange({})}
              style={{
                background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 4, color: 'rgba(255,255,255,0.7)', fontSize: 11,
                padding: '5px 10px', cursor: 'pointer',
              }}
            >
              Reset all swaps
            </button>
          </div>
        )}

        <div style={{
          flex: 1, overflowY: 'auto', padding: 12,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {swappable.map((row) => {
            const equivalents = findEquivalents(row.originalTemplateId);
            const currentTemplate = overrides[row.originalTemplateId] ?? row.originalTemplateId;
            const isSwapped = currentTemplate !== row.originalTemplateId;
            return (
              <div key={row.originalTemplateId} style={{
                background: 'rgba(255,255,255,0.025)',
                border: `1px solid ${isSwapped ? 'rgba(200,168,75,0.5)' : 'rgba(255,255,255,0.06)'}`,
                borderRadius: 5, padding: '8px 10px',
              }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  marginBottom: 2,
                }}>
                  <span style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>
                    {getShape(row.originalTemplateId)}
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>
                    ×{row.count}
                  </span>
                </div>
                <div style={{
                  color: 'rgba(255,255,255,0.45)', fontSize: 10, marginBottom: 6,
                }}>
                  from {getSetLabel(row.originalTemplateId)}
                </div>
                <select
                  value={currentTemplate}
                  onChange={(e) => {
                    const v = e.target.value;
                    const next = { ...overrides };
                    if (v === row.originalTemplateId) delete next[row.originalTemplateId];
                    else next[row.originalTemplateId] = v;
                    onChange(next);
                  }}
                  style={{
                    width: '100%',
                    background: '#0a0a0f',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 4,
                    color: '#fff', fontSize: 11, padding: '5px 8px',
                  }}
                >
                  <option value={row.originalTemplateId}>
                    {getSetLabel(row.originalTemplateId)} (original)
                  </option>
                  {equivalents.map((eq) => (
                    <option key={eq.templateId} value={eq.templateId}>{eq.setLabel}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
    </div>
  );
}

interface TemplateBreakdownEntry {
  templateId: string;        // current (post-override) templateId in the displayed scene
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
    ...(raw.instances  ?? []).map((i) => i.building_type),
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
