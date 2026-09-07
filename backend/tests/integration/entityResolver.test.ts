import { randomUUID } from "node:crypto";

import { connectDatabase, disconnectDatabase, prisma } from "../../src/config/database";
import {
  findEntityCandidates,
  normalizeEntityName,
  resolveDocumentFactEntities,
  resolveEntity,
} from "../../src/services/entityResolver";

const testPrefix = "Phase 7 Test";
const documentPrefix = "phase-7-integration";

describe("Phase 7 deterministic entity resolution", () => {
  beforeAll(connectDatabase);

  beforeEach(async () => {
    await prisma.document.deleteMany({
      where: { originalFilename: { startsWith: documentPrefix } },
    });
    await prisma.entity.deleteMany({ where: { canonicalName: { startsWith: testPrefix } } });
  });

  afterEach(async () => {
    await prisma.document.deleteMany({
      where: { originalFilename: { startsWith: documentPrefix } },
    });
    await prisma.entity.deleteMany({ where: { canonicalName: { startsWith: testPrefix } } });
  });

  afterAll(disconnectDatabase);

  async function createEntity(
    canonicalName: string,
    entityType: "ORGANIZATION" | "PERSON" = "ORGANIZATION",
  ) {
    return prisma.entity.create({
      data: {
        canonicalName,
        normalizedName: normalizeEntityName(canonicalName, entityType),
        entityType,
        metadata: {},
      },
    });
  }

  it("resolves case and common legal-suffix variants to the same normalized entity", async () => {
    const first = await resolveEntity({
      subject: `${testPrefix} Acme Technologies Pvt. Ltd.`,
      entityType: "ORGANIZATION",
    });
    const second = await resolveEntity({
      subject: `${testPrefix.toLocaleUpperCase("en")} ACME TECHNOLOGIES PRIVATE LIMITED`,
      entityType: "ORGANIZATION",
    });

    expect(first.matchMethod).toBe("CREATED");
    expect(second).toMatchObject({
      matchMethod: "CANONICAL_EXACT",
      similarity: 1,
      aliasLearned: true,
    });
    expect(second.entity.id).toBe(first.entity.id);
    expect(await prisma.entity.count({ where: { normalizedName: first.entity.normalizedName } })).toBe(
      1,
    );
  });

  it("resolves a known alias before canonical or trigram matching", async () => {
    const entity = await createEntity(`${testPrefix} International Business Machines`);
    await prisma.entityAlias.create({
      data: {
        entityId: entity.id,
        alias: `${testPrefix} Big Blue`,
        normalizedAlias: normalizeEntityName(`${testPrefix} Big Blue`, "ORGANIZATION"),
        confidence: 0.99,
      },
    });

    const result = await resolveEntity({
      subject: `${testPrefix} Big Blue`,
      entityType: "ORGANIZATION",
    });

    expect(result.entity.id).toBe(entity.id);
    expect(result.matchMethod).toBe("ALIAS_EXACT");
    expect(result.aliasLearned).toBe(false);
  });

  it("auto-merges a type-compatible pg_trgm candidate at or above 0.85 and learns it", async () => {
    const entity = await createEntity(`${testPrefix} Globex Technologies`);

    const result = await resolveEntity({
      subject: `${testPrefix} Globex Technologie`,
      entityType: "ORGANIZATION",
    });

    expect(result.entity.id).toBe(entity.id);
    expect(result.matchMethod).toBe("TRIGRAM");
    expect(result.similarity).toBeGreaterThanOrEqual(0.85);
    expect(result.aliasLearned).toBe(true);
    const learnedAlias = await prisma.entityAlias.findUniqueOrThrow({
      where: {
        entityId_normalizedAlias: {
          entityId: entity.id,
          normalizedAlias: normalizeEntityName(
            `${testPrefix} Globex Technologie`,
            "ORGANIZATION",
          ),
        },
      },
    });
    expect(learnedAlias.confidence).toBeCloseTo(result.similarity);
    expect(
      await prisma.entityAlias.count({
        where: {
          entityId: entity.id,
          normalizedAlias: normalizeEntityName(
            `${testPrefix} Globex Technologie`,
            "ORGANIZATION",
          ),
        },
      }),
    ).toBe(1);
  });

  it("returns ranked candidates with aliases", async () => {
    const entity = await createEntity(`${testPrefix} Candidate Technologies`);
    await prisma.entityAlias.create({
      data: {
        entityId: entity.id,
        alias: `${testPrefix} Candidate Tech`,
        normalizedAlias: normalizeEntityName(`${testPrefix} Candidate Tech`, "ORGANIZATION"),
        confidence: 1,
      },
    });

    const candidates = await findEntityCandidates(
      normalizeEntityName(`${testPrefix} Candidate Technologie`, "ORGANIZATION"),
      "ORGANIZATION",
    );

    expect(candidates[0]).toMatchObject({ id: entity.id, aliases: [{ entityId: entity.id }] });
    expect(candidates[0]?.similarity).toBeGreaterThan(0);
  });

  it("creates a separate entity below the similarity threshold", async () => {
    const existing = await resolveEntity({
      subject: `${testPrefix} Northwind Analytics`,
      entityType: "ORGANIZATION",
    });
    const separate = await resolveEntity({
      subject: `${testPrefix} Contoso Logistics`,
      entityType: "ORGANIZATION",
    });

    expect(existing.matchMethod).toBe("CREATED");
    expect(separate.matchMethod).toBe("CREATED");
    expect(separate.entity.id).not.toBe(existing.entity.id);
  });

  it("never auto-merges the same text across incompatible entity types", async () => {
    const organization = await resolveEntity({
      subject: `${testPrefix} Apple`,
      entityType: "ORGANIZATION",
    });
    const person = await resolveEntity({
      subject: `${testPrefix} Apple`,
      entityType: "PERSON",
    });

    expect(organization.entity.id).not.toBe(person.entity.id);
    expect(person.matchMethod).toBe("CREATED");
    expect(person.entity.entityType).toBe("PERSON");
  });

  it("links unresolved document facts and reuses the entity on later facts", async () => {
    const documentId = randomUUID();
    const document = await prisma.document.create({
      data: {
        id: documentId,
        filename: `${documentId}.pdf`,
        originalFilename: `${documentPrefix}-${documentId}.pdf`,
        mimeType: "application/pdf",
        sha256: documentId.replaceAll("-", "").padEnd(64, "0"),
        filePath: `/tmp/${documentId}.pdf`,
        fileSizeBytes: 1n,
        chunks: {
          create: {
            chunkIndex: 0,
            pageStart: 1,
            pageEnd: 1,
            text: "Entity resolution test",
            tokenCount: 3,
            sha256: `${documentId}-chunk`,
            metadata: {},
          },
        },
      },
      include: { chunks: true },
    });
    const chunk = document.chunks[0];
    if (!chunk) {
      throw new Error("Expected a source chunk.");
    }
    const sharedFact = {
      documentId,
      chunkId: chunk.id,
      subjectType: "ORGANIZATION" as const,
      subjectNormalized: "phase 7 test document",
      predicateRaw: "revenue",
      predicateCanonical: "revenue",
      valueType: "MONEY" as const,
      normalizedNumber: 10,
      unit: "USD",
      currency: "USD",
      qualifiers: {},
      normalizedContext: {},
      confidence: 1,
      extractionMethod: "HYBRID" as const,
    };
    for (const [index, input] of [
      { subjectRaw: `${testPrefix} Document Corp.`, valueRaw: "$10", normalizedNumber: 10 },
      {
        subjectRaw: `${testPrefix} Document Corporation`,
        valueRaw: "$11",
        normalizedNumber: 11,
      },
    ].entries()) {
      await prisma.fact.create({
        data: {
          ...sharedFact,
          ...input,
          factSignature: randomUUID(),
          evidence: {
            create: {
              documentId,
              pageNumber: 1,
              quote: `${input.subjectRaw} reported ${input.valueRaw}.`,
              normalizedQuote: `${input.subjectRaw} reported ${input.valueRaw}.`,
              contextBefore: "",
              contextAfter: "",
              startChar: index * 50,
              endChar: index * 50 + 40,
              verificationMethod: "EXACT",
              verificationScore: 1,
            },
          },
        },
      });
    }

    const result = await resolveDocumentFactEntities(documentId);
    const facts = await prisma.fact.findMany({ where: { documentId }, orderBy: { valueRaw: "asc" } });

    expect(result).toEqual({ resolvedCount: 2, createdCount: 1, matchedCount: 1, issueCount: 0 });
    expect(facts[0]?.entityId).toEqual(expect.any(String));
    expect(facts[1]?.entityId).toBe(facts[0]?.entityId);
  });
});
