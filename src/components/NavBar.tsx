import { useAuth, SignInButton, SignUpButton, UserButton } from '@clerk/react';
import { Link } from 'react-router-dom';
import { Icon } from '@iconify/react';

export default function NavBar() {
  const { isSignedIn } = useAuth();

  return (
    <nav className="sticky top-0 z-[100] flex h-[52px] items-center gap-6 border-b border-white/10 bg-[#13131a] px-6">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-[15px] font-bold tracking-[0.15em] text-[#c8a84b] no-underline"
      >
        <Icon icon="lucide:hexagon" width={18} height={18} />
        SOLIDO MARKET
      </Link>

      <Link to="/" className="text-sm text-white/60 no-underline hover:text-white">
        Blueprints
      </Link>

      <div className="flex-1" />

      {isSignedIn ? (
        <UserButton />
      ) : (
        <div className="flex gap-2">
          <SignInButton mode="modal">
            <button className="cursor-pointer rounded-[2px] border border-white/20 bg-transparent px-3.5 py-1.5 text-xs text-white/70 transition-colors hover:bg-white/5 hover:text-white">
              Sign In
            </button>
          </SignInButton>
          <SignUpButton mode="modal">
            <button className="cursor-pointer rounded-[2px] border border-[#c8a84b] bg-[#c8a84b] px-3.5 py-1.5 text-xs font-bold text-black transition-colors hover:bg-[#d4b659]">
              Sign Up
            </button>
          </SignUpButton>
        </div>
      )}
    </nav>
  );
}
