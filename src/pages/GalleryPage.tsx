import { useState, useEffect, useCallback } from 'react';
import { useAuth, SignInButton } from '@clerk/react';
import { Icon } from '@iconify/react';
import BlueprintCard from '../components/BlueprintCard';
import UploadModal from '../components/UploadModal';
import { listBlueprints, deleteBlueprint } from '../lib/api';
import type { BlueprintMeta } from '../lib/api';

const TAGS = ['All', 'Foundation', 'Wall', 'Floor', 'Rooftop', 'Ramp', 'Stairs', 'Pillar', 'Door', 'Decoration'];

const SORTS: { id: 'new' | 'popular' | 'top'; label: string; icon: string }[] = [
  { id: 'new',     label: 'New',       icon: 'lucide:sparkles' },
  { id: 'popular', label: 'Popular',   icon: 'lucide:trending-up' },
  { id: 'top',     label: 'Top Rated', icon: 'lucide:heart' },
];

export default function GalleryPage() {
  const { isSignedIn, getToken } = useAuth();
  const [blueprints, setBlueprints] = useState<BlueprintMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'mine'>('all');
  const [sort, setSort] = useState<'new' | 'popular' | 'top'>('new');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const fetchBlueprints = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listBlueprints(
        { sort, tag: activeTag ?? undefined, mine: activeTab === 'mine' },
        activeTab === 'mine' ? getToken : undefined,
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
    <div className="mx-auto max-w-[1100px] px-6 pb-12">
      {/* Hero band */}
      <div className="border-b border-white/10 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="m-0 text-2xl font-bold text-white">Dune Solido Market</h1>
            <p className="m-0 mt-1 text-sm text-white/45">
              Browse &amp; share Dune base blueprints · {blueprints.length} designs
            </p>
          </div>
          {isSignedIn ? (
            <button
              onClick={() => setUploadOpen(true)}
              className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[2px] border border-[#c8a84b] bg-[#c8a84b] px-4 py-2 text-sm font-bold text-black transition-colors hover:bg-[#d4b659]"
            >
              <Icon icon="lucide:upload" width={14} height={14} />
              Upload Blueprint
            </button>
          ) : (
            <SignInButton mode="modal">
              <button className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[2px] border border-white/20 bg-transparent px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/5 hover:text-white">
                <Icon icon="lucide:lock" width={14} height={14} />
                Sign in to upload
              </button>
            </SignInButton>
          )}
        </div>

        {/* View tabs + sort */}
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <div className="inline-flex gap-0 rounded-[2px] bg-white/5 p-0.5">
            <button
              onClick={() => setActiveTab('all')}
              className={`cursor-pointer rounded-[2px] border-none px-3.5 py-1 text-xs transition-colors ${
                activeTab === 'all'
                  ? 'bg-[#1e1e2e] font-semibold text-white'
                  : 'bg-transparent text-white/45 hover:text-white/70'
              }`}
            >
              All Blueprints
            </button>
            {isSignedIn && (
              <button
                onClick={() => setActiveTab('mine')}
                className={`cursor-pointer rounded-[2px] border-none px-3.5 py-1 text-xs transition-colors ${
                  activeTab === 'mine'
                    ? 'bg-[#1e1e2e] font-semibold text-white'
                    : 'bg-transparent text-white/45 hover:text-white/70'
                }`}
              >
                My Blueprints
              </button>
            )}
          </div>

          {activeTab === 'all' && (
            <div className="ml-auto flex gap-1.5">
              {SORTS.map(({ id, label, icon }) => (
                <button
                  key={id}
                  onClick={() => setSort(id)}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-[2px] border px-3 py-1 text-xs transition-colors ${
                    sort === id
                      ? 'border-[rgba(200,168,75,0.4)] bg-[rgba(200,168,75,0.15)] text-[#c8a84b]'
                      : 'border-white/10 bg-transparent text-white/45 hover:border-white/20 hover:text-white/70'
                  }`}
                >
                  <Icon icon={icon} width={12} height={12} />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Tag filters */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {TAGS.map((tag) => {
            const isActive = (tag === 'All' && !activeTag) || tag === activeTag;
            return (
              <button
                key={tag}
                onClick={() => setActiveTag(tag === 'All' ? null : tag)}
                className={`cursor-pointer rounded-full border px-3 py-0.5 text-[11px] transition-colors ${
                  isActive
                    ? 'border-[rgba(200,168,75,0.4)] bg-[rgba(200,168,75,0.12)] text-[#c8a84b]'
                    : 'border-white/10 bg-white/[0.03] text-white/45 hover:border-white/20 hover:text-white/70'
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid */}
      <div className="mt-6">
        {loading && (
          <div className="flex flex-col items-center gap-2 pt-12 text-white/35">
            <Icon icon="lucide:loader-2" width={20} height={20} className="animate-spin" />
            <p className="m-0 text-sm">Loading…</p>
          </div>
        )}
        {error && (
          <div className="flex flex-col items-center gap-2 pt-12 text-[#e05555]">
            <Icon icon="lucide:triangle-alert" width={20} height={20} />
            <p className="m-0 text-sm">{error}</p>
          </div>
        )}
        {!loading && !error && blueprints.length === 0 && (
          <div className="flex flex-col items-center gap-2 pt-12 text-white/30">
            <Icon icon="lucide:inbox" width={28} height={28} />
            <p className="m-0 text-sm">No blueprints found.</p>
          </div>
        )}
        {!loading && !error && blueprints.length > 0 && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
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
