const MONTHS = new Map<string, number>([
  ["january", 1],
  ["february", 2],
  ["march", 3],
  ["april", 4],
  ["may", 5],
  ["june", 6],
  ["july", 7],
  ["august", 8],
  ["september", 9],
  ["october", 10],
  ["november", 11],
  ["december", 12],
]);

export type TimeKind =
  | "EXACT_DATE"
  | "DATE_RANGE"
  | "AS_OF"
  | "CALENDAR_YEAR"
  | "FISCAL_YEAR"
  | "QUARTER"
  | "HALF_YEAR"
  | "MONTH"
  | "UNKNOWN";

export type NormalizedTime = {
  kind: TimeKind;
  label: string | null;
  start: string | null;
  end: string | null;
};

function dateAtUtcMidnight(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date
    : null;
}

function yearFromFiscalSuffix(rawYear: string): number {
  const year = Number(rawYear);
  if (rawYear.length === 4) {
    return year;
  }
  return year <= 69 ? 2000 + year : 1900 + year;
}

export function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function normalizeExactDate(value: string | null): Date | null {
  if (value === null) {
    return null;
  }

  const candidate = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/u.exec(candidate);
  if (match) {
    return dateAtUtcMidnight(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  match = /^(\d{1,2})\s+([\p{L}]+)\s+(\d{4})$/iu.exec(candidate);
  if (match) {
    const month = MONTHS.get(match[2]?.toLocaleLowerCase("en") ?? "");
    return month === undefined
      ? null
      : dateAtUtcMidnight(Number(match[3]), month, Number(match[1]));
  }

  match = /^([\p{L}]+)\s+(\d{1,2}),?\s+(\d{4})$/iu.exec(candidate);
  if (match) {
    const month = MONTHS.get(match[1]?.toLocaleLowerCase("en") ?? "");
    return month === undefined
      ? null
      : dateAtUtcMidnight(Number(match[3]), month, Number(match[2]));
  }

  return null;
}

function emptyTime(kind: TimeKind, label: string | null): NormalizedTime {
  return { kind, label, start: null, end: null };
}

export function normalizePeriod(value: string | null): NormalizedTime {
  if (value === null || value.trim().length === 0) {
    return emptyTime("UNKNOWN", null);
  }

  const candidate = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  const exactDate = normalizeExactDate(candidate);
  if (exactDate) {
    const label = formatIsoDate(exactDate);
    return { kind: "EXACT_DATE", label, start: label, end: label };
  }

  const asOf = /^as\s+of\s+(.+)$/iu.exec(candidate);
  if (asOf?.[1]) {
    const date = normalizeExactDate(asOf[1]);
    const label = date ? formatIsoDate(date) : asOf[1];
    return { kind: "AS_OF", label, start: null, end: date ? label : null };
  }

  const quarter = /^Q([1-4])\s*(?:FY|fiscal\s+year\s*)?(\d{2}|\d{4})$/iu.exec(candidate);
  if (quarter?.[1] && quarter[2]) {
    return emptyTime("QUARTER", `Q${quarter[1]} FY${yearFromFiscalSuffix(quarter[2])}`);
  }

  const halfYear = /^H([12])\s*(?:FY|fiscal\s+year\s*)?(\d{2}|\d{4})$/iu.exec(candidate);
  if (halfYear?.[1] && halfYear[2]) {
    return emptyTime("HALF_YEAR", `H${halfYear[1]} FY${yearFromFiscalSuffix(halfYear[2])}`);
  }

  const fiscalYear = /^(?:FY\s*|fiscal\s+year\s*)(\d{2}|\d{4})$/iu.exec(candidate);
  if (fiscalYear?.[1]) {
    return emptyTime("FISCAL_YEAR", `FY${yearFromFiscalSuffix(fiscalYear[1])}`);
  }

  const calendarYear = /^(?:calendar\s+year\s+)?(\d{4})$/iu.exec(candidate);
  if (calendarYear?.[1]) {
    return emptyTime("CALENDAR_YEAR", calendarYear[1]);
  }

  const month = /^([\p{L}]+)\s+(\d{4})$/iu.exec(candidate);
  if (month?.[1] && month[2] && MONTHS.has(month[1].toLocaleLowerCase("en"))) {
    const monthName = month[1].toLocaleLowerCase("en");
    const label = `${monthName[0]?.toLocaleUpperCase("en")}${monthName.slice(1)} ${month[2]}`;
    return emptyTime("MONTH", label);
  }

  return emptyTime("UNKNOWN", candidate);
}
