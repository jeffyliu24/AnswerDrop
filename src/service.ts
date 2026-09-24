import { assertMarkdownSize } from "./config.js";
import { renderMarkdown, type RenderResult } from "./render/markdown.js";
import { renderReaderPage } from "./render/page.js";
import { localizeImages, type LocalImage } from "./resources/localize.js";
import { scanMarkdown, type Finding } from "./security/index.js";
import { Database, type DocumentRecord } from "./storage/database.js";

export class FindingsRequireReview extends Error {
  constructor(readonly findings: Finding[]) {
    super(
      "Potential sensitive information detected. Review findings before publishing.",
    );
  }
}

export interface PublishInput {
  markdown: string;
  title?: string;
  acknowledgeFindings?: boolean;
  localizeImages?: boolean;
  expiresIn?: "1h" | "1d" | "7d" | "30d";
  maxViews?: 1 | 10 | 100 | number;
}

export interface PublishResult {
  id: string;
  slug: string;
  url: string;
  exportUrl: string;
  findings: Finding[];
  localizedImages: number;
  expiresAt: number | null;
  maxViews: number | null;
}

function titleFromMarkdown(markdown: string): string {
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return (heading || "Untitled answer").slice(0, 160);
}

function expiry(value?: PublishInput["expiresIn"]): number | undefined {
  if (!value) return undefined;
  const duration = {
    "1h": 3_600_000,
    "1d": 86_400_000,
    "7d": 604_800_000,
    "30d": 2_592_000_000,
  }[value];
  if (!duration) throw new Error("Invalid expiration option");
  return Date.now() + duration;
}

export class AnswerDropService {
  constructor(
    readonly database: Database,
    readonly baseUrl: string,
    readonly imageDownloader?: (url: string) => Promise<LocalImage>,
  ) {}

  scanMarkdown(markdown: string): Finding[] {
    assertMarkdownSize(markdown);
    return scanMarkdown(markdown);
  }

  previewMarkdown(markdown: string): RenderResult & { findings: Finding[] } {
    assertMarkdownSize(markdown);
    return { ...renderMarkdown(markdown), findings: scanMarkdown(markdown) };
  }

  async publishMarkdown(input: PublishInput): Promise<PublishResult> {
    assertMarkdownSize(input.markdown);
    const findings = scanMarkdown(input.markdown);
    if (findings.length && !input.acknowledgeFindings)
      throw new FindingsRequireReview(findings);
    if (
      input.title !== undefined &&
      (typeof input.title !== "string" || input.title.length > 160)
    )
      throw new Error("Title must be at most 160 characters");
    if (
      input.maxViews !== undefined &&
      (!Number.isInteger(input.maxViews) ||
        input.maxViews < 1 ||
        input.maxViews > 10000)
    )
      throw new Error("Maximum views must be between 1 and 10000");
    const rendered = renderMarkdown(input.markdown);
    const images = input.localizeImages
      ? await localizeImages(rendered.remoteImages, this.imageDownloader)
      : [];
    const imageMap = Object.fromEntries(
      images.map((image) => [image.sourceUrl, image.hash]),
    );
    const document = this.database.createDocument({
      title: input.title?.trim() || titleFromMarkdown(input.markdown),
      markdown: input.markdown,
      metadata: JSON.stringify({
        headings: rendered.headings,
        imageCount: images.length,
      }),
      imageMap,
      expiresAt: expiry(input.expiresIn),
      maxViews: input.maxViews,
      images,
    });
    return {
      id: document.id,
      slug: document.slug,
      url: `${this.baseUrl}/s/${document.slug}`,
      exportUrl: `${this.baseUrl}/s/${document.slug}/export.html`,
      findings,
      localizedImages: images.length,
      expiresAt: document.expires_at,
      maxViews: document.max_views,
    };
  }

  readerHtml(
    document: DocumentRecord,
    offline: boolean,
    owner = false,
  ): string {
    const storedMap = JSON.parse(document.image_map) as Record<string, string>;
    const imageMap: Record<string, string> = {};
    for (const [url, hash] of Object.entries(storedMap)) {
      if (offline) {
        const asset = owner
          ? this.database.getAssetForOwner(document.id, hash)
          : this.database.getAsset(document.slug, hash);
        if (asset)
          imageMap[url] =
            `data:${asset.mime};base64,${asset.bytes.toString("base64")}`;
      } else {
        imageMap[url] = `/s/${document.slug}/assets/${hash}`;
      }
    }
    const rendered = renderMarkdown(document.markdown, imageMap);
    return renderReaderPage(
      document.title,
      rendered.html,
      rendered.headings,
      offline,
    );
  }

  unpublishDocument(slug: string): boolean {
    return this.database.unpublish(slug);
  }
}
