import { createHash } from "node:crypto";

export interface RetrievalArtifact {
  artifactType: string;
  sourceUrl: string;
  content: string;
}

export interface CorpusChunk {
  sourceUrl: string;
  artifactType: string;
  text: string;
  snippetHash: string;
}

export interface ScoredChunk {
  chunk: CorpusChunk;
  score: number;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function chunkText(content: string, maxChunkLength = 1200): string[] {
  const paragraphs = content
    .split(/\n\s*\n/g)
    .map((part) => part.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (!current) {
      current = paragraph;
      continue;
    }

    if ((current + "\n\n" + paragraph).length > maxChunkLength) {
      chunks.push(current);
      current = paragraph;
      continue;
    }

    current = `${current}\n\n${paragraph}`;
  }

  if (current) {
    chunks.push(current);
  }

  if (chunks.length === 0 && content.trim().length > 0) {
    chunks.push(content.trim().slice(0, maxChunkLength));
  }

  return chunks;
}

function hashSnippet(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

export function buildCorpusChunks(artifacts: RetrievalArtifact[]): CorpusChunk[] {
  const chunks: CorpusChunk[] = [];

  for (const artifact of artifacts) {
    const artifactChunks = chunkText(artifact.content);

    for (const chunk of artifactChunks) {
      chunks.push({
        sourceUrl: artifact.sourceUrl,
        artifactType: artifact.artifactType,
        text: chunk,
        snippetHash: hashSnippet(chunk),
      });
    }
  }

  return chunks;
}

export function retrieveTopChunksWithScores(
  chunks: CorpusChunk[],
  query: string,
  topK = 8,
): ScoredChunk[] {
  const queryTokens = new Set(tokenize(query));

  const scored = chunks
    .map((chunk) => {
      const chunkTokens = tokenize(chunk.text);
      let overlap = 0;

      for (const token of chunkTokens) {
        if (queryTokens.has(token)) {
          overlap += 1;
        }
      }

      const normalizedScore = overlap / Math.max(1, Math.sqrt(chunkTokens.length));
      return {
        chunk,
        score: normalizedScore,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      const aTie = `${a.chunk.sourceUrl}::${a.chunk.snippetHash}`;
      const bTie = `${b.chunk.sourceUrl}::${b.chunk.snippetHash}`;
      return aTie.localeCompare(bTie);
    })
    .slice(0, topK);

  return scored;
}

export function retrieveTopChunks(chunks: CorpusChunk[], query: string, topK = 8): CorpusChunk[] {
  return retrieveTopChunksWithScores(chunks, query, topK).map((entry) => entry.chunk);
}
