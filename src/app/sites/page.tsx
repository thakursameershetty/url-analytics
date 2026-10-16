import { Suspense } from 'react';
import SitesManager from '@/components/SitesManager';

export default function SitesPage() {
  return (
    <Suspense>
      <SitesManager />
    </Suspense>
  );
}
