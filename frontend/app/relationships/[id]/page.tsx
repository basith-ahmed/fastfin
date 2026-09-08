import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { RelationshipComparison } from "@/components/knowledge/relationship-comparison";
import { RelationshipHeader } from "@/components/knowledge/relationship-header";
import { Button } from "@/components/ui/button";

export default async function RelationshipPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/knowledge">
          <ArrowLeft /> Back to knowledge
        </Link>
      </Button>
      <RelationshipHeader id={id} />
      <RelationshipComparison id={id} />
    </div>
  );
}
