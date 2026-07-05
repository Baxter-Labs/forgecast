import { Suspense } from 'react';
import { TimelineWorkspace } from '@/components/editor/TimelineWorkspace';

export const metadata = { title: 'Forgecast — Editor' };

export default function EditorPage() {
  return (
    <Suspense fallback={null}>
      <TimelineWorkspace />
    </Suspense>
  );
}
