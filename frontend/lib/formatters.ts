export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatConfidence(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function humanize(value: string): string {
  return value
    .toLocaleLowerCase("en")
    .replaceAll("_", " ")
    .replace(/^./, (character) => character.toLocaleUpperCase("en"));
}

export function normalizedValue(fact: {
  normalizedNumber: string | null;
  normalizedText: string | null;
  normalizedDate: string | null;
  currency: string | null;
  unit: string | null;
}): string {
  if (fact.normalizedNumber !== null) {
    return [fact.currency, Number(fact.normalizedNumber).toLocaleString(), fact.unit]
      .filter(Boolean)
      .join(" ");
  }
  if (fact.normalizedDate) return new Date(fact.normalizedDate).toLocaleDateString();
  return fact.normalizedText ?? "Not normalized";
}

export function formatJson(value: unknown): string {
  if (value === null || value === undefined) return "Not provided";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}
