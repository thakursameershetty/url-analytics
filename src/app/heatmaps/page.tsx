import { Suspense } from 'react';
import HeatmapViewer from '@/components/HeatmapViewer';

export default function HeatmapsPage() {
  return (
    <Suspense>
      <HeatmapViewer />
    </Suspense>
  );
}
