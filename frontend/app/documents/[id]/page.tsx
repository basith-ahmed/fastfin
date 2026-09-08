import { Suspense } from "react";

import { LoadingState } from "@/components/common/data-states";
import { DocumentHeader } from "@/components/documents/document-header";
import { DocumentWorkspace } from "@/components/documents/document-workspace";

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="space-y-6">
      <DocumentHeader id={id} />
      <Suspense fallback={<LoadingState label="Loading document workspace" />}>
        <DocumentWorkspace id={id} />
      </Suspense>
    </div>
  );
}
