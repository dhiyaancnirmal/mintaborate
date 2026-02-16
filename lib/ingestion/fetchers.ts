import pLimit from "p-limit";
import { createHash } from "node:crypto";
import { extractHtmlLinks, extractMarkdownLinks, keepSameHost } from "@/lib/ingestion/discovery";
import { normalizeDocsUrl, toMintlifyMarkdownUrl } from "@/lib/ingestion/normalize";

export type ArtifactType = "llms_full" | "llms" | "skill" | "page_md" | "html_fallback";

export interface IngestionArtifact {
  artifactType: ArtifactType;
  sourceUrl: string;
  content: string;
  contentHash: string;
  metadata?: Record<string, unknown>;
}

export interface IngestionResult {
  normalizedDocsUrl: string;
  artifacts: IngestionArtifact[];
  llmsText?: string;
  llmsFullText?: string;
  skillText?: string;
  discoveredPages: string[];
}

async function fetchText(url: string, timeoutMs: number): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "mintaborate/0.1 (+https://github.com/dhiyaan/mintaborate)",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function ingestDocumentation(
  docsUrl: string,
  options?: {
    timeoutMs?: number;
    pageFetchLimit?: number;
    pageFetchConcurrency?: number;
  },
): Promise<IngestionResult> {
  const normalizedDocsUrl = normalizeDocsUrl(docsUrl);
  const timeoutMs = options?.timeoutMs ?? 20_000;
  const pageFetchLimit = options?.pageFetchLimit ?? 24;
  const pageFetchConcurrency = options?.pageFetchConcurrency ?? 5;

  const root = normalizedDocsUrl;
  const artifacts: IngestionArtifact[] = [];

  const llmsFullUrl = `${root}/llms-full.txt`;
  const llmsUrl = `${root}/llms.txt`;
  const skillUrl = `${root}/skill.md`;
  const wellKnownSkillUrl = `${root}/.well-known/skills/default/skill.md`;

  const [llmsFullText, llmsText, skillText, fallbackSkillText] = await Promise.all([
    fetchText(llmsFullUrl, timeoutMs),
    fetchText(llmsUrl, timeoutMs),
    fetchText(skillUrl, timeoutMs),
    fetchText(wellKnownSkillUrl, timeoutMs),
  ]);

  if (llmsFullText) {
    artifacts.push({
      artifactType: "llms_full",
      sourceUrl: llmsFullUrl,
      content: llmsFullText,
      contentHash: hashContent(llmsFullText),
    });
  }

  if (llmsText) {
    artifacts.push({
      artifactType: "llms",
      sourceUrl: llmsUrl,
      content: llmsText,
      contentHash: hashContent(llmsText),
    });
  }

  const mergedSkillText = skillText ?? fallbackSkillText;
  if (mergedSkillText) {
    artifacts.push({
      artifactType: "skill",
      sourceUrl: skillText ? skillUrl : wellKnownSkillUrl,
      content: mergedSkillText,
      contentHash: hashContent(mergedSkillText),
    });
  }

  const discoveredFromLlms = llmsText ? extractMarkdownLinks(llmsText, root) : [];
  const discoveredFromFull = llmsFullText ? extractMarkdownLinks(llmsFullText, root) : [];

  let discoveredPages = keepSameHost([...discoveredFromLlms, ...discoveredFromFull], root).slice(
    0,
    pageFetchLimit,
  );

  let rootHtmlForDiscovery: string | null = null;
  if (discoveredPages.length === 0) {
    rootHtmlForDiscovery = await fetchText(root, timeoutMs);
    if (rootHtmlForDiscovery) {
      const discoveredFromHtml = extractHtmlLinks(rootHtmlForDiscovery, root);
      discoveredPages = keepSameHost(discoveredFromHtml, root).slice(0, pageFetchLimit);
    }
  }

  const limiter = pLimit(pageFetchConcurrency);

  const pageArtifacts = await Promise.all(
    discoveredPages.map((url) =>
      limiter(async () => {
        const markdownUrl = toMintlifyMarkdownUrl(url);
        const markdown = await fetchText(markdownUrl, timeoutMs);
        if (markdown) {
          return {
            artifactType: "page_md" as const,
            sourceUrl: markdownUrl,
            content: markdown,
            contentHash: hashContent(markdown),
            metadata: {
              originalUrl: url,
            },
          };
        }

        const html = await fetchText(url, timeoutMs);
        if (!html) {
          return null;
        }

        return {
          artifactType: "html_fallback" as const,
          sourceUrl: url,
          content: html,
          contentHash: hashContent(html),
          metadata: {
            originalUrl: url,
            fallback: "page_html",
          },
        };
      }),
    ),
  );

  for (const artifact of pageArtifacts) {
    if (artifact) {
      artifacts.push(artifact);
    }
  }

  const hasPageArtifacts = pageArtifacts.some((artifact) => artifact !== null);
  if (!hasPageArtifacts && rootHtmlForDiscovery) {
    artifacts.push({
      artifactType: "html_fallback",
      sourceUrl: root,
      content: rootHtmlForDiscovery,
      contentHash: hashContent(rootHtmlForDiscovery),
      metadata: {
        fallback: "root_html_discovery",
      },
    });
  }

  if (artifacts.length === 0) {
    const htmlFallback = rootHtmlForDiscovery ?? await fetchText(root, timeoutMs);
    if (htmlFallback) {
      artifacts.push({
        artifactType: "html_fallback",
        sourceUrl: root,
        content: htmlFallback,
        contentHash: hashContent(htmlFallback),
      });
    }
  }

  return {
    normalizedDocsUrl,
    artifacts,
    llmsText: llmsText ?? undefined,
    llmsFullText: llmsFullText ?? undefined,
    skillText: mergedSkillText ?? undefined,
    discoveredPages,
  };
}
