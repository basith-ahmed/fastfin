import { hashTextSha256 } from "../utils/hash";
import type { AssembledPage } from "./textAssembler";

export const DEFAULT_TARGET_TOKENS = 1_200;
export const DEFAULT_OVERLAP_TOKENS = 150;

export type ChunkOptions = {
  targetTokens?: number;
  overlapTokens?: number;
};

export type GeneratedChunk = {
  chunkIndex: number;
  pageStart: number;
  pageEnd: number;
  text: string;
  tokenCount: number;
  sha256: string;
  metadata: {
    pageNumbers: number[];
    overlapFromPrevious: boolean;
    estimatedTokens: number;
  };
};

type TextBlock = {
  pageNumber: number;
  text: string;
};

/**
 * A language-independent approximation suitable for chunk sizing: one token is
 * estimated as four characters. Exact provider tokenization happens at the AI
 * boundary in later phases.
 */
export function estimateTokens(text: string): number {
  return text.length === 0 ? 0 : Math.max(1, Math.ceil(text.length / 4));
}

function splitAtWordBoundaries(text: string, maximumTokens: number): string[] {
  const maximumCharacters = Math.max(4, maximumTokens * 4);
  const words = text.split(/\s+/).filter(Boolean);
  const parts: string[] = [];
  let current = "";

  for (const word of words) {
    if (word.length > maximumCharacters) {
      if (current) {
        parts.push(current);
        current = "";
      }
      for (let offset = 0; offset < word.length; offset += maximumCharacters) {
        parts.push(word.slice(offset, offset + maximumCharacters));
      }
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maximumCharacters && current) {
      parts.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

function splitOversizedParagraph(text: string, maximumTokens: number): string[] {
  if (estimateTokens(text) <= maximumTokens) {
    return [text];
  }

  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length <= 1) {
    return splitAtWordBoundaries(text, maximumTokens);
  }

  const parts: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (estimateTokens(sentence) > maximumTokens) {
      if (current) {
        parts.push(current);
        current = "";
      }
      parts.push(...splitAtWordBoundaries(sentence, maximumTokens));
      continue;
    }

    const candidate = current ? `${current} ${sentence}` : sentence;
    if (estimateTokens(candidate) > maximumTokens && current) {
      parts.push(current);
      current = sentence;
    } else {
      current = candidate;
    }
  }

  if (current) {
    parts.push(current);
  }
  return parts;
}

function blocksFromPages(
  pages: AssembledPage[],
  targetTokens: number,
  overlapTokens: number,
): TextBlock[] {
  const maximumContentTokens = Math.max(1, targetTokens - overlapTokens - 8);
  return pages.flatMap((page) =>
    page.text
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .flatMap((paragraph) => splitOversizedParagraph(paragraph, maximumContentTokens))
      .map((text) => ({ pageNumber: page.pageNumber, text })),
  );
}

function renderBlocks(blocks: TextBlock[]): string {
  const sections: string[] = [];
  let currentPage: number | undefined;

  for (const block of blocks) {
    if (currentPage !== block.pageNumber) {
      sections.push(`[PAGE ${block.pageNumber}]`);
      currentPage = block.pageNumber;
    }
    sections.push(block.text);
  }

  return sections.join("\n\n");
}

function tailWithinTokenBudget(text: string, tokenBudget: number): string {
  const maximumCharacters = tokenBudget * 4;
  if (text.length <= maximumCharacters) {
    return text;
  }

  const tail = text.slice(-maximumCharacters);
  const firstSpace = tail.indexOf(" ");
  return firstSpace >= 0 ? tail.slice(firstSpace + 1) : tail;
}

function selectOverlap(blocks: TextBlock[], overlapTokens: number): TextBlock[] {
  if (overlapTokens <= 0) {
    return [];
  }

  const selected: TextBlock[] = [];
  let remainingTokens = overlapTokens;
  for (let index = blocks.length - 1; index >= 0 && remainingTokens > 0; index -= 1) {
    const block = blocks[index];
    if (!block) {
      continue;
    }
    const blockTokens = estimateTokens(block.text);
    if (blockTokens <= remainingTokens) {
      selected.unshift(block);
      remainingTokens -= blockTokens;
    } else {
      const tail = tailWithinTokenBudget(block.text, remainingTokens);
      if (tail) {
        selected.unshift({ pageNumber: block.pageNumber, text: tail });
      }
      remainingTokens = 0;
    }
  }
  return selected;
}

function materializeChunk(
  blocks: TextBlock[],
  chunkIndex: number,
  overlapFromPrevious: boolean,
): GeneratedChunk {
  const text = renderBlocks(blocks);
  const pageNumbers = [...new Set(blocks.map((block) => block.pageNumber))];
  const estimatedTokens = estimateTokens(text);
  const firstPage = pageNumbers[0];
  const lastPage = pageNumbers.at(-1);

  if (firstPage === undefined || lastPage === undefined) {
    throw new Error("Cannot materialize an empty chunk.");
  }

  return {
    chunkIndex,
    pageStart: firstPage,
    pageEnd: lastPage,
    text,
    tokenCount: estimatedTokens,
    sha256: hashTextSha256(text),
    metadata: { pageNumbers, overlapFromPrevious, estimatedTokens },
  };
}

export function chunkDocument(pages: AssembledPage[], options: ChunkOptions = {}): GeneratedChunk[] {
  const targetTokens = options.targetTokens ?? DEFAULT_TARGET_TOKENS;
  const overlapTokens = options.overlapTokens ?? DEFAULT_OVERLAP_TOKENS;
  if (targetTokens <= 0 || overlapTokens < 0 || overlapTokens >= targetTokens) {
    throw new Error("Chunk token settings require targetTokens > overlapTokens >= 0.");
  }

  const sourceBlocks = blocksFromPages(pages, targetTokens, overlapTokens);
  const chunks: GeneratedChunk[] = [];
  let current: TextBlock[] = [];
  let overlapsPrevious = false;
  let freshBlocks = 0;
  let sourceIndex = 0;

  while (sourceIndex < sourceBlocks.length) {
    const sourceBlock = sourceBlocks[sourceIndex];
    if (!sourceBlock) {
      break;
    }
    const candidate = [...current, sourceBlock];

    if (current.length > 0 && estimateTokens(renderBlocks(candidate)) > targetTokens) {
      if (freshBlocks === 0) {
        current = [];
        overlapsPrevious = false;
        continue;
      }

      const completed = materializeChunk(current, chunks.length, overlapsPrevious);
      chunks.push(completed);
      current = selectOverlap(current, overlapTokens);
      overlapsPrevious = current.length > 0;
      freshBlocks = 0;
      continue;
    }

    current = candidate;
    freshBlocks += 1;
    sourceIndex += 1;
  }

  if (freshBlocks > 0) {
    chunks.push(materializeChunk(current, chunks.length, overlapsPrevious));
  }

  return chunks;
}
