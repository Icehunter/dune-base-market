import { useAuth } from '@clerk/react';
import { Link } from 'react-router-dom';
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
    <div style={{
      background: '#13131a',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 8,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
    }}>
      {/* Cover / placeholder — always 16:9 */}
      <Link
        to={`/blueprint/${blueprint.id}`}
        style={{
          display: 'block',
          width: '100%',
          aspectRatio: '16 / 9',
          overflow: 'hidden',
          borderRadius: '6px 6px 0 0',
          background: '#0a0a0f',
          flexShrink: 0,
          textDecoration: 'none',
        }}
      >
        {blueprint.snapshot_url ? (
          <img
            src={blueprint.snapshot_url}
            alt={blueprint.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            loading="lazy"
          />
        ) : (
          <div style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #1a1a2e 0%, #2a2040 50%, #1a2a2e 100%)',
            color: 'rgba(200,168,75,0.25)',
            fontSize: 32,
          }}>
            ⬡
          </div>
        )}
      </Link>

      {/* Body — flex: 1 so all cards have the same overall height regardless of
          title wrapping. The footer sits at the bottom of every card. */}
      <div style={{ padding: '8px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Link to={`/blueprint/${blueprint.id}`} style={{ textDecoration: 'none' }}>
          <p style={{ color: '#fff', fontWeight: 600, fontSize: 13, margin: 0 }}>
            {blueprint.title}
          </p>
        </Link>
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, margin: 0 }}>
          by {blueprint.username}
          {showVisibility && (
            <span style={{
              marginLeft: 6,
              background: blueprint.is_public ? '#1a2e1a' : '#2e1a1a',
              border: `1px solid ${blueprint.is_public ? '#2a4a2a' : '#4a2a2a'}`,
              color: blueprint.is_public ? '#5a9a5a' : '#9a5a5a',
              fontSize: 9,
              padding: '1px 5px',
              borderRadius: 3,
            }}>
              {blueprint.is_public ? 'public' : 'private'}
            </span>
          )}
        </p>

        {/* Metrics row — pushes the footer down via the flex:1 body */}
        <div style={{
          marginTop: 'auto',
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          color: 'rgba(255,255,255,0.5)',
          fontSize: 10,
        }}>
          <span title="Total downloads (Original + variants)">⬇ {totalDownloads}</span>
          {variantCount > 0 && (
            <span
              title={`${variantCount} variant${variantCount === 1 ? '' : 's'}`}
              style={{
                background: 'rgba(200,168,75,0.12)',
                border: '1px solid rgba(200,168,75,0.35)',
                color: '#c8a84b',
                padding: '1px 6px',
                borderRadius: 3,
                fontWeight: 600,
              }}
            >
              {variantCount} variant{variantCount === 1 ? '' : 's'}
            </span>
          )}
          <span>♥ {blueprint.rating_count ?? 0}</span>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: '6px 12px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <Link
          to={`/blueprint/${blueprint.id}`}
          style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textDecoration: 'none' }}
        >
          👁 View
        </Link>
        <div style={{ flex: 1 }} />

        {onDelete && (
          <button
            onClick={() => onDelete(blueprint.id)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(180,80,80,0.8)',
              fontSize: 11,
              padding: '2px 6px',
              cursor: 'pointer',
            }}
          >
            🗑
          </button>
        )}

        {isSignedIn ? (
          <button
            onClick={handleDownload}
            style={{
              background: '#c8a84b',
              border: 'none',
              borderRadius: 4,
              color: '#000',
              fontWeight: 700,
              fontSize: 11,
              padding: '3px 10px',
              cursor: 'pointer',
            }}
          >
            ⬇ Download
          </button>
        ) : (
          <button
            disabled
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 4,
              color: 'rgba(255,255,255,0.3)',
              fontSize: 11,
              padding: '3px 10px',
              cursor: 'default',
            }}
          >
            🔒 Sign in to download
          </button>
        )}
      </div>
    </div>
  );
}
