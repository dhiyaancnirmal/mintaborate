export function normalizeDocsUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Docs URL is required.");
  }

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withScheme);

  parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  parsed.hash = "";

  return parsed.toString().replace(/\/$/, "");
}

export function resolveUrl(baseUrl: string, maybeRelative: string): string {
  try {
    return new URL(maybeRelative, baseUrl).toString();
  } catch {
    return maybeRelative;
  }
}

export function toMintlifyMarkdownUrl(url: string): string {
  if (url.endsWith(".md") || url.endsWith(".txt")) {
    return url;
  }

  const parsed = new URL(url);
  if (parsed.pathname.endsWith("/")) {
    parsed.pathname = `${parsed.pathname.slice(0, -1)}.md`;
  } else {
    parsed.pathname = `${parsed.pathname}.md`;
  }

  return parsed.toString();
}
