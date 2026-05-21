import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth, SignInButton } from '@clerk/react';
import { getBlueprint, downloadBlueprint, deleteBlueprint, updateBlueprint } from '../lib/api';
import type { BlueprintDetail } from '../lib/api';
import type { RawBlueprint, PlacedPiece } from '../stores/buildingStore';
import type { RotMap } from '../data/modelRegistry';
import type { SceneCanvasHandle } from '../components/Scene';

const SceneCanvas = lazy(() =>
  import('../components/Scene').then((m) => ({ default: m.SceneCanvas }))
);

export default function BlueprintDetailPage() {
  const { id } = useParams<{ id: string }>();
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
    if (!selectedPiece) return;
    const DEV_CYCLE = [0, 7.5, 15, 22.5, 30, 37.5, 45, 52.5, 60, 67.5, 75, 82.5, 90, 97.5, 105, 112.5, 120, 127.5, 135, 142.5, 150, 157.5, 165, 172.5, 180, -172.5, -165, -157.5, -150, -142.5, -135, -127.5, -120, -112.5, -105, -97.5, -90, -82.5, -75, -67.5, -60, -52.5, -45, -37.5, -30, -22.5, -15, -7.5] as const;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'r' && e.key !== 'R') return;
      e.preventDefault();
      const { templateId, transform: { rotation } } = selectedPiece;
      const n = ((rotation % 360) + 360) % 360;
      const key = n > 180 ? n - 360 : n;
      const current = devMapRef.current[templateId]?.[key] ?? 0;
      const idx = DEV_CYCLE.indexOf(current as typeof DEV_CYCLE[number]);
      const next = DEV_CYCLE[(idx + 1) % DEV_CYCLE.length];
      devMapRef.current = {
        ...devMapRef.current,
        [templateId]: { ...devMapRef.current[templateId], [key]: next },
      };
      sceneRef.current?.applyDevOverrides(devMapRef.current);
      setDevDisplayMap({ ...devMapRef.current });
      console.log('[DEV] ROTATION_BY_STORED override:', devMapRef.current);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selectedPiece]); // no devMapRef dep — handler always reads from the ref directly

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getBlueprint(id)
      .then((bp) => {
        setBlueprint(bp);
        setEditTitle(bp.title);
        setEditPublic(!!bp.is_public);
        setEditTags(bp.tags ?? []);
      })
      .catch(() => setError('Blueprint not found'))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleDownload() {
    if (!id) return;
    try { await downloadBlueprint(id, getToken); } catch (err) { console.error(err); }
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
    <div style={{ display: 'flex', height: 'calc(100vh - 52px)', overflow: 'hidden' }}>
      {/* 3D Viewer */}
      <div style={{ flex: 1, position: 'relative', background: '#000', overflow: 'hidden' }}>
        {blueprint.blueprint_data ? (
          <Suspense fallback={null}>
            <SceneCanvas
              ref={sceneRef}
              onSelectPiece={setSelectedPiece}
              initialDistanceScale={1}
              initialBlueprint={blueprint.blueprint_data as unknown as RawBlueprint}
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

        {/* Click-to-enter overlay */}
        {!locked && blueprint.blueprint_data && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(0,0,0,0.75)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 16,
            padding: '28px 44px',
            textAlign: 'center',
            color: '#fff',
            pointerEvents: 'none',
            backdropFilter: 'blur(4px)',
          }}>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>
              Click to enter the base
            </div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)', lineHeight: 2 }}>
              <span style={{ color: '#fff', fontWeight: 600 }}>WASD</span> — fly forward/back/left/right
              <br />
              <span style={{ color: '#fff', fontWeight: 600 }}>Space</span> — fly up&nbsp;&nbsp;
              <span style={{ color: '#fff', fontWeight: 600 }}>Shift</span> — fly down
              <br />
              <span style={{ color: '#fff', fontWeight: 600 }}>Esc</span> — release mouse
            </div>
          </div>
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
            {(() => {
              const n = ((selectedPiece.transform.rotation % 360) + 360) % 360;
              const key = n > 180 ? n - 360 : n;
              const devVal = devDisplayMap[selectedPiece.templateId]?.[key];
              return devVal !== undefined ? (
                <div style={{ color: '#7ec8e3', fontSize: 10 }}>
                  [DEV] override: {devVal > 0 ? '+' : ''}{devVal}° &nbsp;press R to cycle
                </div>
              ) : (
                <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10 }}>
                  press R to add rotation override
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

      {/* Sidebar */}
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
        <Link to="/" style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textDecoration: 'none' }}>
          ← Back to gallery
        </Link>

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

        {/* Download */}
        {isSignedIn ? (
          <button
            onClick={handleDownload}
            style={{
              width: '100%', background: '#c8a84b', border: 'none', borderRadius: 6,
              color: '#000', fontWeight: 700, padding: '9px 0', fontSize: 13, cursor: 'pointer',
            }}
          >
            ⬇ Download JSON
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

        {/* Owner controls */}
        {isOwner && !editing && (
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
    </div>
  );
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
