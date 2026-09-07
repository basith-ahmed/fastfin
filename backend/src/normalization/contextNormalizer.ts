import type { FactDraft } from "../ai/types";
import { formatIsoDate, normalizeExactDate, normalizePeriod, type NormalizedTime } from "./dateNormalizer";

export type NormalizedContext = {
  time: NormalizedTime;
  geography: string | null;
  scope: string | null;
  segment: string | null;
  basis: string | null;
  statusAsOf: string | null;
  extra: Record<string, never>;
};

function normalizeContextLabel(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en");
  return normalized.length > 0 ? normalized : null;
}

export function normalizeContext(context: FactDraft["context"]): NormalizedContext {
  const statusDate = normalizeExactDate(context.statusAsOf);
  return {
    time: normalizePeriod(context.time),
    geography: normalizeContextLabel(context.geography),
    scope: normalizeContextLabel(context.scope),
    segment: normalizeContextLabel(context.segment),
    basis: normalizeContextLabel(context.basis),
    statusAsOf: statusDate ? formatIsoDate(statusDate) : normalizeContextLabel(context.statusAsOf),
    extra: {},
  };
}
