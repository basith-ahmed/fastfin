import { Search } from "lucide-react";

import { inputClassName } from "@/components/common/form-controls";
import { humanize } from "@/lib/formatters";

const statuses = [
  "",
  "QUEUED",
  "PARSING",
  "EXTRACTING",
  "NORMALIZING",
  "RESOLVING_ENTITIES",
  "EMBEDDING",
  "MATCHING",
  "REASONING",
  "COMPLETED",
  "COMPLETED_WITH_ISSUES",
  "FAILED",
];

export function DocumentFilters({
  search,
  status,
  onSearchChange,
  onStatusChange,
}: {
  search: string;
  status: string;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <label className="relative flex-1">
        <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Filter this page by filename"
          className={`${inputClassName} w-full pl-9`}
        />
      </label>
      <select
        aria-label="Filter by status"
        value={status}
        onChange={(event) => onStatusChange(event.target.value)}
        className={`${inputClassName} sm:w-56`}
      >
        {statuses.map((value) => (
          <option key={value || "all"} value={value}>
            {value ? humanize(value) : "All statuses"}
          </option>
        ))}
      </select>
    </div>
  );
}
