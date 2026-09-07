import type { FactDraft } from "../ai/types";
import { normalizeExactDate } from "./dateNormalizer";

const MAGNITUDES: Readonly<Record<string, number>> = {
  hundred: 100,
  thousand: 1_000,
  k: 1_000,
  lakh: 100_000,
  lac: 100_000,
  million: 1_000_000,
  m: 1_000_000,
  crore: 10_000_000,
  cr: 10_000_000,
  billion: 1_000_000_000,
  bn: 1_000_000_000,
  b: 1_000_000_000,
  trillion: 1_000_000_000_000,
  tn: 1_000_000_000_000,
};

const CURRENCY_CODES = ["USD", "EUR", "GBP", "INR"] as const;
const CURRENCY_SYMBOLS: Readonly<Record<string, (typeof CURRENCY_CODES)[number]>> = {
  "$": "USD",
  "€": "EUR",
  "£": "GBP",
  "₹": "INR",
};

export type NormalizedValue = {
  normalizedText: string | null;
  normalizedNumber: number | null;
  normalizedDate: Date | null;
  unit: string | null;
  currency: string | null;
};

export function normalizeComparableText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en");
}

export function parseNumber(value: string): number | null {
  const candidate = value.normalize("NFKC");
  const match = /[-+]?(?:\d{1,3}(?:[,\s]\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)/u.exec(candidate);
  if (!match) {
    return null;
  }

  const parsed = Number(match[0].replace(/[\s,]/gu, ""));
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const isParenthesized = candidate.trim().startsWith("(") && candidate.trim().endsWith(")");
  return isParenthesized ? -Math.abs(parsed) : parsed;
}

function magnitudeFor(value: string): number {
  const words = value.normalize("NFKC").toLocaleLowerCase("en").match(/[\p{L}]+/gu) ?? [];
  for (const word of words) {
    const magnitude = MAGNITUDES[word];
    if (magnitude !== undefined) {
      return magnitude;
    }
  }
  return 1;
}

function currencyFor(value: string): string | null {
  const upper = value.normalize("NFKC").toLocaleUpperCase("en");
  for (const code of CURRENCY_CODES) {
    if (new RegExp(`(?:^|[^A-Z])${code}(?:$|[^A-Z])`, "u").test(upper)) {
      return code;
    }
  }
  for (const [symbol, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (value.includes(symbol)) {
      return code;
    }
  }
  return null;
}

function scaledNumber(value: string): number | null {
  const number = parseNumber(value);
  return number === null ? null : number * magnitudeFor(value);
}

export function normalizeValue(value: FactDraft["value"]): NormalizedValue {
  const empty: NormalizedValue = {
    normalizedText: null,
    normalizedNumber: null,
    normalizedDate: null,
    unit: null,
    currency: null,
  };

  if (/^[-+]?\d+(?:\.\d+)?\s*x$/iu.test(value.raw.trim())) {
    return { ...empty, normalizedNumber: parseNumber(value.raw), unit: "ratio_x" };
  }

  switch (value.type) {
    case "MONEY": {
      const currency = currencyFor(value.raw);
      return {
        ...empty,
        normalizedNumber: scaledNumber(value.raw),
        unit: currency,
        currency,
      };
    }
    case "PERCENTAGE":
      return { ...empty, normalizedNumber: parseNumber(value.raw), unit: "percent" };
    case "NUMBER":
    case "QUANTITY":
      return { ...empty, normalizedNumber: scaledNumber(value.raw) };
    case "DATE": {
      const normalizedDate = normalizeExactDate(value.raw);
      return {
        ...empty,
        normalizedDate,
        normalizedText: normalizedDate === null ? normalizeComparableText(value.raw) : null,
      };
    }
    case "BOOLEAN": {
      const comparable = normalizeComparableText(value.raw);
      const normalizedText = ["true", "yes"].includes(comparable)
        ? "true"
        : ["false", "no"].includes(comparable)
          ? "false"
          : comparable;
      return { ...empty, normalizedText };
    }
    default:
      return { ...empty, normalizedText: normalizeComparableText(value.raw) };
  }
}
