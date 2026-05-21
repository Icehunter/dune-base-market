import { useState, useEffect, useCallback } from 'react';
import { useAuth, SignInButton } from '@clerk/react';
import BlueprintCard from '../components/BlueprintCard';
import UploadModal from '../components/UploadModal';
import { listBlueprints, deleteBlueprint } from '../lib/api';
import type { BlueprintMeta } from '../lib/api';

const TAGS = ['All', 'Foundation', 'Wall', 'Floor', 'Rooftop', 'Ramp', 'Stairs', 'Pillar', 'Door', 'Decoration'];

export default function GalleryPage() {
  const { isSignedIn, getToken } = useAuth();
  const [blueprints, setBlueprints] = useState<BlueprintMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'mine'>('all');
  const [sort, setSort] = useState<'new' | 'popular'>('new');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const fetchBlueprints = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listBlueprints(
        { sort, tag: activeTag ?? undefined, mine: activeTab === 'mine' },
        activeTab === 'mine' ? getToken : undefined
      );
      setBlueprints(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load blueprints');
    } finally {
      setLoading(false);
    }
  }, [sort, activeTag, activeTab, getToken]);

  useEffect(() => { fetchBlueprints(); }, [fetchBlueprints]);

  // Switch back to 'all' tab if user signs out
  useEffect(() => {
    if (!isSignedIn && activeTab === 'mine') setActiveTab('all');
  }, [isSignedIn, activeTab]);

  async function handleDelete(id: string) {
    try {
      await deleteBlueprint(id, getToken);
      setBlueprints((prev) => prev.filter((b) => b.id !== id));
    } catch (err) {
      console.error('Delete failed', err);
    }
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 48px' }}>
      {/* Hero band */}
      <div style={{ padding: '32px 0 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700, margin: 0 }}>Blueprint Gallery</h1>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, margin: '4px 0 0' }}>
              Browse community Dune bases · {blueprints.length} blueprints
            </p>
          </div>
          {isSignedIn ? (
            <button
              onClick={() => setUploadOpen(true)}
              style={{
                background: '#c8a84b',
                border: 'none',
                borderRadius: 6,
                color: '#000',
                fontWeight: 700,
                padding: '8px 18px',
                fontSize: 13,
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              Upload Blueprint
            </button>
          ) : (
            <SignInButton mode="modal">
              <button style={{
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 6,
                color: 'rgba(255,255,255,0.6)',
                padding: '8px 18px',
                fontSize: 13,
                cursor: 'pointer',
                flexShrink: 0,
              }}>
                Sign in to upload
              </button>
            </SignInButton>
          )}
        </div>

        {/* View tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 20 }}>
          <div style={{ display: 'flex', gap: 0, background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: 3 }}>
            <button
              onClick={() => setActiveTab('all')}
              style={{
                background: activeTab === 'all' ? '#1e1e2e' : 'transparent',
                border: 'none',
                borderRadius: 4,
                color: activeTab === 'all' ? '#fff' : 'rgba(255,255,255,0.4)',
                padding: '5px 14px',
                fontSize: 12,
                cursor: 'pointer',
                fontWeight: activeTab === 'all' ? 600 : 400,
              }}
            >
              All Blueprints
            </button>
            {isSignedIn && (
              <button
                onClick={() => setActiveTab('mine')}
                style={{
                  background: activeTab === 'mine' ? '#1e1e2e' : 'transparent',
                  border: 'none',
                  borderRadius: 4,
                  color: activeTab === 'mine' ? '#fff' : 'rgba(255,255,255,0.4)',
                  padding: '5px 14px',
                  fontSize: 12,
                  cursor: 'pointer',
                  fontWeight: activeTab === 'mine' ? 600 : 400,
                }}
              >
                My Blueprints
              </button>
            )}
          </div>

          {activeTab === 'all' && (
            <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
              {(['new', 'popular'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSort(s)}
                  style={{
                    background: sort === s ? 'rgba(200,168,75,0.15)' : 'transparent',
                    border: `1px solid ${sort === s ? 'rgba(200,168,75,0.4)' : 'rgba(255,255,255,0.1)'}`,
                    color: sort === s ? '#c8a84b' : 'rgba(255,255,255,0.4)',
                    borderRadius: 5,
                    padding: '4px 12px',
                    fontSize: 12,
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                  }}
                >
                  {s === 'new' ? 'New' : 'Popular'}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Tag filters */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
          {TAGS.map((tag) => {
            const isActive = (tag === 'All' && !activeTag) || tag === activeTag;
            return (
              <button
                key={tag}
                onClick={() => setActiveTag(tag === 'All' ? null : tag)}
                style={{
                  background: isActive ? 'rgba(200,168,75,0.12)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${isActive ? 'rgba(200,168,75,0.35)' : 'rgba(255,255,255,0.08)'}`,
                  color: isActive ? '#c8a84b' : 'rgba(255,255,255,0.45)',
                  borderRadius: 20,
                  padding: '3px 12px',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid */}
      <div style={{ marginTop: 24 }}>
        {loading && (
          <p style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', paddingTop: 48 }}>Loading...</p>
        )}
        {error && (
          <p style={{ color: '#e05555', textAlign: 'center', paddingTop: 48 }}>{error}</p>
        )}
        {!loading && !error && blueprints.length === 0 && (
          <p style={{ color: 'rgba(255,255,255,0.25)', textAlign: 'center', paddingTop: 48 }}>
            No blueprints found.
          </p>
        )}
        {!loading && !error && blueprints.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 16,
            }}
          >
            {blueprints.map((bp) => (
              <BlueprintCard
                key={bp.id}
                blueprint={bp}
                showVisibility={activeTab === 'mine'}
                onDelete={activeTab === 'mine' ? handleDelete : undefined}
              />
            ))}
          </div>
        )}
      </div>

      <UploadModal
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={(bp) => {
          setBlueprints((prev) => [bp, ...prev]);
          setUploadOpen(false);
        }}
      />
    </div>
  );
}
