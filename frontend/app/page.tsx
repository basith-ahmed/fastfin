import { FileText } from "lucide-react";

import { RecentDocuments } from "@/components/dashboard/recent-documents";
import { SummaryMetrics } from "@/components/dashboard/summary-metrics";
import { UploadPanel } from "@/components/dashboard/upload-panel";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Overview"
        action={<Button asChild><a href="#upload"><FileText /> Upload PDF</a></Button>}
      />
      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Summary</h2>
        <SummaryMetrics />
      </section>
      <section aria-label="Recent documents and PDF upload" className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,.6fr)]">
        <RecentDocuments />
        <UploadPanel />
      </section>
    </div>
  );
}
