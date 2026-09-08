import type { RelationshipFactInput, RelationshipReasoningInput } from "../types";

export const RELATIONSHIP_REASONING_PROMPT_VERSION = "relationship-reasoning-v1";

export const RELATIONSHIP_REASONING_INSTRUCTIONS = `You are evaluating the relationship between two financial facts extracted from different documents.

Return only the structured JSON response required by the supplied response schema. Never return Markdown,
commentary, headings, code fences, or explanatory prose outside that response.

Given Fact A and Fact B, classify their relationship as one of:

CORROBORATES — Both facts support materially the same proposition. Values, entity, period, and scope are consistent.

CONTRADICTS — Both facts describe materially the same proposition under the same relevant context (entity, period, scope, segment) but assert incompatible values. They cannot both be true simultaneously.

RECONCILABLE — An apparent difference between the two facts is reasonably explained by a context difference. Examples: different reporting periods (H1 vs full year), different scopes (India vs global), different segments (standalone vs consolidated), different status dates (active in January, resigned in March), or different measurement bases.

UNCERTAIN — The available evidence is insufficient to determine the relationship with confidence. Examples: same numeric value but different currencies with no conversion evidence, ambiguous scope, or unclear period alignment.

Important rules:
- Do NOT classify facts as CONTRADICTS merely because values differ. First check if context differences (period, scope, segment, geography, basis, status date) explain the difference.
- A half-year value being roughly half of a full-year value is RECONCILABLE, not a contradiction.
- Different currencies without conversion evidence should be UNCERTAIN, not CONTRADICTS.
- Regional revenue vs global revenue with different values is RECONCILABLE, not CONTRADICTS.
- Provide a concise explanation for your classification.
- Identify the decisive context dimensions that influenced your decision.`;

function formatFact(label: string, fact: RelationshipFactInput): string {
  const lines: string[] = [`${label}:`];
  lines.push(`  Entity: ${fact.entity}`);
  lines.push(`  Predicate: ${fact.predicate}`);
  lines.push(`  Value: ${fact.value}`);
  if (fact.unit) lines.push(`  Unit: ${fact.unit}`);
  if (fact.currency) lines.push(`  Currency: ${fact.currency}`);
  if (fact.period) lines.push(`  Period: ${fact.period}`);
  if (fact.scope) lines.push(`  Scope: ${fact.scope}`);
  if (fact.segment) lines.push(`  Segment: ${fact.segment}`);
  if (fact.quote) lines.push(`  Evidence quote: "${fact.quote}"`);
  return lines.join("\n");
}

export function buildRelationshipReasoningInput(input: RelationshipReasoningInput): string {
  return [formatFact("Fact A", input.factA), "", formatFact("Fact B", input.factB)].join("\n");
}
