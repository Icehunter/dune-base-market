import { useAuth, SignInButton, SignUpButton, UserButton } from '@clerk/react';
import { Link } from 'react-router-dom';

export default function NavBar() {
  const { isSignedIn } = useAuth();

  return (
    <nav
      style={{
        background: '#13131a',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        padding: '0 24px',
        height: 52,
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}
    >
      <Link
        to="/"
        style={{ color: '#c8a84b', fontWeight: 700, fontSize: 15, letterSpacing: 2, textDecoration: 'none' }}
      >
        ⬡ Solido Market
      </Link>

      <Link
        to="/"
        style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, textDecoration: 'none' }}
      >
        Blueprints
      </Link>

      <div style={{ flex: 1 }} />

      {isSignedIn ? (
        <UserButton />
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <SignInButton mode="modal">
            <button style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 6,
              color: 'rgba(255,255,255,0.7)',
              padding: '5px 14px',
              fontSize: 12,
              cursor: 'pointer',
            }}>
              Sign In
            </button>
          </SignInButton>
          <SignUpButton mode="modal">
            <button style={{
              background: '#c8a84b',
              border: 'none',
              borderRadius: 6,
              color: '#000',
              padding: '5px 14px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}>
              Sign Up
            </button>
          </SignUpButton>
        </div>
      )}
    </nav>
  );
}
