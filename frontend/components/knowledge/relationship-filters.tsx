import { cn } from "@/lib/utils";
import type { RelationshipType } from "@/types";

const filters: { label: string; value: RelationshipType | "" }[] = [
  { label: "All", value: "" },
  { label: "Corroborations", value: "CORROBORATES" },
  { label: "Contradictions", value: "CONTRADICTS" },
  { label: "Reconciled", value: "RECONCILABLE" },
  { label: "Uncertain", value: "UNCERTAIN" },
];

export function RelationshipFilters({
  value,
  onChange,
}: {
  value: RelationshipType | "";
  onChange: (value: RelationshipType | "") => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 border-b pb-3">
      {filters.map((filter) => (
        <button
          key={filter.label}
          onClick={() => onChange(filter.value)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm font-medium",
            value === filter.value
              ? "bg-slate-900 text-white"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}
