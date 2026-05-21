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

  return (
    <div style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, overflow: 'hidden' }}>
      {/* Thumbnail */}
      <Link
        to={`/blueprint/${blueprint.id}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 110,
          width: '100%',
          background: 'linear-gradient(135deg, #1a1a2e 0%, #2a2040 50%, #1a2a2e 100%)',
          color: 'rgba(200,168,75,0.25)',
          fontSize: 32,
          textDecoration: 'none',
        }}
      >
        ⬡
      </Link>

      {/* Body */}
      <div style={{ padding: '8px 12px' }}>
        <Link to={`/blueprint/${blueprint.id}`} style={{ textDecoration: 'none' }}>
          <p style={{ color: '#fff', fontWeight: 600, fontSize: 13, margin: 0 }}>
            {blueprint.title}
          </p>
        </Link>
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, margin: '2px 0 0' }}>
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
            ⬇ Download JSON
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
