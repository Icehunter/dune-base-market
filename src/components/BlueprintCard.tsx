import { useAuth } from '@clerk/react';
import { Link } from 'react-router-dom';
import { Icon } from '@iconify/react';
import type { BlueprintMeta } from '../lib/api';
import { downloadBlueprint } from '../lib/api';

interface Props {
  blueprint: BlueprintMeta;
  showVisibility?: boolean;
  onDelete?: (id: string) => void;
}

export default function BlueprintCard({ blueprint, showVisibility, onDelete }: Props) {
  const { isSignedIn, getToken } = useAuth();

  async function handleDownload(e: React.MouseEvent) {
    e.preventDefault();
    try {
      await downloadBlueprint(blueprint.id, getToken);
    } catch (err) {
      console.error('Download failed', err);
    }
  }

  // Older API responses may not yet include these — fall back so this component
  // still works against an un-migrated server.
  const totalDownloads = blueprint.total_downloads ?? blueprint.download_count ?? 0;
  const variantCount   = blueprint.variant_count ?? 0;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[2px] border border-white/10 bg-[#13131a]">
      {/* Cover / placeholder — always 16:9 */}
      <Link
        to={`/blueprint/${blueprint.id}`}
        className="block w-full shrink-0 overflow-hidden bg-[#0a0a0f] no-underline"
        style={{ aspectRatio: '16 / 9' }}
      >
        {blueprint.snapshot_url ? (
          <img
            src={blueprint.snapshot_url}
            alt={blueprint.title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#1a1a2e] via-[#2a2040] to-[#1a2a2e] text-[#c8a84b]/25">
            <Icon icon="lucide:hexagon" width={36} height={36} />
          </div>
        )}
      </Link>

      {/* Body — flex:1 so all cards have equal overall height regardless of title wrapping */}
      <div className="flex flex-1 flex-col gap-1 px-3 py-2.5">
        <Link to={`/blueprint/${blueprint.id}`} className="no-underline">
          <p className="m-0 text-sm font-semibold text-white line-clamp-2">{blueprint.title}</p>
        </Link>
        <p className="m-0 flex items-center gap-1.5 text-[11px] text-white/45">
          <Icon icon="lucide:user" width={11} height={11} />
          {blueprint.username}
          {showVisibility && (
            <span
              className={`ml-1 inline-flex items-center gap-1 rounded-[2px] border px-1.5 py-0.5 text-[9px] ${
                blueprint.is_public
                  ? 'border-[#2a4a2a] bg-[#1a2e1a] text-[#5a9a5a]'
                  : 'border-[#4a2a2a] bg-[#2e1a1a] text-[#9a5a5a]'
              }`}
            >
              <Icon icon={blueprint.is_public ? 'lucide:globe' : 'lucide:lock'} width={9} height={9} />
              {blueprint.is_public ? 'public' : 'private'}
            </span>
          )}
        </p>

        {/* Metrics row — pushes the footer down via the flex:1 body */}
        <div className="mt-auto flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-white/55">
          <span className="inline-flex items-center gap-1" title="Total downloads (Original + variants)">
            <Icon icon="lucide:download" width={11} height={11} />
            {totalDownloads}
          </span>
          {variantCount > 0 && (
            <span
              title={`${variantCount} variant${variantCount === 1 ? '' : 's'}`}
              className="inline-flex items-center gap-1 rounded-[2px] border border-[rgba(200,168,75,0.35)] bg-[rgba(200,168,75,0.12)] px-1.5 py-0.5 text-[10px] font-semibold text-[#c8a84b]"
            >
              <Icon icon="lucide:layers" width={10} height={10} />
              {variantCount}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Icon icon="lucide:heart" width={11} height={11} />
            {blueprint.rating_count ?? 0}
          </span>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 border-t border-white/10 px-3 py-1.5">
        <Link
          to={`/blueprint/${blueprint.id}`}
          className="inline-flex items-center gap-1 text-[11px] text-white/45 no-underline hover:text-white/70"
        >
          <Icon icon="lucide:eye" width={12} height={12} />
          View
        </Link>
        <div className="flex-1" />

        {onDelete && (
          <button
            onClick={() => onDelete(blueprint.id)}
            aria-label="Delete blueprint"
            className="inline-flex cursor-pointer items-center justify-center border-none bg-transparent p-1 text-[#b85050] hover:text-[#d97070]"
          >
            <Icon icon="lucide:trash-2" width={12} height={12} />
          </button>
        )}

        {isSignedIn ? (
          <button
            onClick={handleDownload}
            className="inline-flex cursor-pointer items-center gap-1 rounded-[2px] border border-[#c8a84b] bg-[#c8a84b] px-2.5 py-1 text-[11px] font-bold text-black transition-colors hover:bg-[#d4b659]"
          >
            <Icon icon="lucide:download" width={11} height={11} />
            Download
          </button>
        ) : (
          <button
            disabled
            className="inline-flex cursor-default items-center gap-1 rounded-[2px] border border-white/10 bg-transparent px-2.5 py-1 text-[11px] text-white/30"
          >
            <Icon icon="lucide:lock" width={11} height={11} />
            Sign in
          </button>
        )}
      </div>
    </div>
  );
}
