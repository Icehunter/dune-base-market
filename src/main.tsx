import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ClerkProvider } from '@clerk/react';
import { dark } from '@clerk/themes';
import './index.css';
import App from './App.tsx';

// Match Clerk's surfaces (sign-in/up modals, UserButton popover, account
// settings modal) to the dune dark theme + 2px-radius / gold accent system.
// Element class overrides force the surrounding modal scrim and root box dark
// because Clerk's default `dark` theme leaves the modal page background light.
// Customising colorText / colorTextSecondary broke Clerk's internal color-mix
// calculations (popover action button labels rendered transparent). Keep the
// variables list to just brand colour + radius, and let `dark` handle text.
const clerkAppearance = {
  baseTheme: dark,
  variables: {
    colorPrimary: '#c8a84b',
    colorDanger: '#e05555',
    borderRadius: '2px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  elements: {
    formButtonPrimary:
      'bg-[#c8a84b] hover:bg-[#d4b659] text-black font-bold shadow-none normal-case tracking-normal',
    footerActionLink: 'text-[#c8a84b] hover:text-[#d4b659]',
  },
} as const;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider
      publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
      afterSignOutUrl="/"
      appearance={clerkAppearance}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ClerkProvider>
  </StrictMode>
);
