import { normalizeEntityName } from "../../src/services/entityResolver";

describe("Phase 7 entity name normalization", () => {
  it.each([
    ["  Acme   Technologies Pvt. Ltd. ", "acme technologies"],
    ["Acme Technologies Private Limited", "acme technologies"],
    ["ACME TECHNOLOGIES, INC.", "acme technologies"],
    ["Acme Technologies LLC", "acme technologies"],
    ["Acme Technologies Corp.", "acme technologies"],
    ["Acme Technologies Co.", "acme technologies"],
  ])("normalizes organization name %s", (raw, expected) => {
    expect(normalizeEntityName(raw, "ORGANIZATION")).toBe(expected);
  });

  it("does not strip organization suffix words from a person name", () => {
    expect(normalizeEntityName("John Co.", "PERSON")).toBe("john co");
  });

  it("retains significant tokens while removing punctuation", () => {
    expect(normalizeEntityName("Smith & Wesson Brands", "ORGANIZATION")).toBe(
      "smith wesson brands",
    );
  });
});
