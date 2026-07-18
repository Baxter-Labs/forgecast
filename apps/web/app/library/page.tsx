import { Suspense } from 'react';
import { LibraryWorkspace } from '@/components/library/LibraryWorkspace';

export const metadata = { title: 'Forgecast — Library' };

export default function LibraryPage() {
  return (
    <Suspense fallback={null}>
      <LibraryWorkspace />
    </Suspense>
  );
}
