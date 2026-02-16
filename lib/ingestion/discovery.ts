import { resolveUrl } from "@/lib/ingestion/normalize";

const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
const htmlHrefRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>/gi;

export function extractMarkdownLinks(markdown: string, baseUrl: string): string[] {
  const links = new Set<string>();

  for (const match of markdown.matchAll(markdownLinkRegex)) {
    const href = match[2]?.trim();
    if (!href || href.startsWith("#")) {
      continue;
    }

    const absolute = resolveUrl(baseUrl, href);

    try {
      const url = new URL(absolute);
      if (["http:", "https:"].includes(url.protocol)) {
        links.add(url.toString());
      }
    } catch {
      // Ignore malformed links.
    }
  }

  return [...links];
}

export function keepSameHost(urls: string[], baseUrl: string): string[] {
  const baseHost = new URL(baseUrl).host;

  return urls.filter((url) => {
    try {
      return new URL(url).host === baseHost;
    } catch {
      return false;
    }
  });
}

export function extractHtmlLinks(html: string, baseUrl: string): string[] {
  const links = new Set<string>();

  for (const match of html.matchAll(htmlHrefRegex)) {
    const href = match[1]?.trim();
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) {
      continue;
    }

    const absolute = resolveUrl(baseUrl, href);

    try {
      const url = new URL(absolute);
      if (["http:", "https:"].includes(url.protocol)) {
        links.add(url.toString());
      }
    } catch {
      // Ignore malformed links.
    }
  }

  return [...links];
}
