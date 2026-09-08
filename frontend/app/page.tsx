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
        eyebrow="Overview"
        title="Evidence-grounded financial intelligence"
        description="Upload reports, inspect extracted facts, and understand how claims agree or differ across documents."
        action={
          <Button asChild>
            <a href="#upload">
              <FileText /> Upload PDF
            </a>
          </Button>
        }
      />
      <SummaryMetrics />
      <section
        aria-label="Recent documents and PDF upload"
        className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,.75fr)]"
      >
        <RecentDocuments />
        <UploadPanel />
      </section>
    </div>
  );
}
