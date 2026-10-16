import { Suspense } from 'react';
import Analytics, { AnalyticsSkeleton } from '@/components/Analytics';

export default function AnalyticsPage() {
  // Analytics reads ?links= and ?range= from the URL, so it renders inside Suspense.
  return (
    <Suspense fallback={<AnalyticsSkeleton />}>
      <Analytics />
    </Suspense>
  );
}
