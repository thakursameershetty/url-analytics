import { Suspense } from 'react';
import LinksHome from '@/components/LinksHome';

export default function Home() {
  return (
    <Suspense>
      <LinksHome />
    </Suspense>
  );
}
