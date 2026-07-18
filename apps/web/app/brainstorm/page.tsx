import { Suspense } from 'react';
import { BrainstormWorkspace } from '@/components/brainstorm/BrainstormWorkspace';

export const metadata = { title: 'Forgecast — Brainstorm' };

export default function BrainstormPage() {
  return (
    <Suspense fallback={null}>
      <BrainstormWorkspace />
    </Suspense>
  );
}
