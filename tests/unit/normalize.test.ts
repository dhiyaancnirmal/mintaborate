import { describe, expect, it } from "vitest";
import { normalizeDocsUrl, toMintlifyMarkdownUrl } from "@/lib/ingestion/normalize";

describe("normalizeDocsUrl", () => {
  it("adds https scheme and trims trailing slash", () => {
    expect(normalizeDocsUrl("docs.anthropic.com/")).toBe("https://docs.anthropic.com");
  });

  it("preserves paths while trimming terminal slash", () => {
    expect(normalizeDocsUrl("https://docs.cursor.com/en/docs/")).toBe(
      "https://docs.cursor.com/en/docs",
    );
  });
});

describe("toMintlifyMarkdownUrl", () => {
  it("appends .md for page URLs", () => {
    expect(toMintlifyMarkdownUrl("https://docs.example.com/quickstart")).toBe(
      "https://docs.example.com/quickstart.md",
    );
  });

  it("keeps markdown URLs unchanged", () => {
    expect(toMintlifyMarkdownUrl("https://docs.example.com/quickstart.md")).toBe(
      "https://docs.example.com/quickstart.md",
    );
  });
});
