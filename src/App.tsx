import { Routes, Route } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { Toast } from '@heroui/react';
import NavBar from './components/NavBar';

const GalleryPage = lazy(() => import('./pages/GalleryPage'));
const BlueprintDetailPage = lazy(() => import('./pages/BlueprintDetailPage'));
const DesignerPage = lazy(() => import('./pages/DesignerPage'));

export default function App() {
  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <NavBar />
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<GalleryPage />} />
          <Route path="/blueprint/:id" element={<BlueprintDetailPage />} />
          <Route path="/blueprint/:id/v/:variantId" element={<BlueprintDetailPage />} />
          <Route path="/designer" element={<DesignerPage />} />
        </Routes>
      </Suspense>
      {/* Single global toast outlet — all `toast.success(...)` / `toast.danger(...)`
          calls render through this provider. */}
      <Toast.Provider />
    </div>
  );
}
