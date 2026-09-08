export const validFactDraft = {
  subject: { text: "Acme Corporation", type: "ORGANIZATION" as const },
  predicate: { raw: "reported revenue", canonical: "revenue" },
  value: { raw: "$20 million", type: "MONEY" as const },
  qualifiers: [
    { name: "audited", value: true },
    { name: "sourceNote", value: null },
  ],
  context: {
    time: "2025",
    geography: null,
    scope: "consolidated",
    segment: null,
    basis: "GAAP",
    statusAsOf: null,
  },
  evidence: [{ pageNumber: 2, quote: "Acme Corporation reported revenue of $20 million in 2025." }],
  confidence: 0.92,
};
