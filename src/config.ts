import { resolve } from "node:path";

export const MAX_MARKDOWN_BYTES = 512 * 1024;
export const MAX_REQUEST_BYTES = 600 * 1024;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_TOTAL_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGES = 8;
export const IMAGE_TIMEOUT_MS = 8_000;

export interface Config {
  host: string;
  port: number;
  baseUrl: string;
  dataDir: string;
  publishToken?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be 1–65535");
  const host = env.HOST ?? "0.0.0.0";
  const baseUrl = (
    env.ANSWERDROP_BASE_URL ?? `http://localhost:${port}`
  ).replace(/\/$/, "");
  const parsed = new URL(baseUrl);
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("ANSWERDROP_BASE_URL must be an http(s) origin");
  }
  return {
    host,
    port,
    baseUrl,
    dataDir: resolve(env.ANSWERDROP_DATA_DIR ?? "./data"),
    publishToken: env.ANSWERDROP_PUBLISH_TOKEN,
  };
}

export function assertMarkdownSize(markdown: string): void {
  if (!markdown.trim()) throw new Error("Markdown cannot be empty");
  if (Buffer.byteLength(markdown, "utf8") > MAX_MARKDOWN_BYTES) {
    throw new Error("Markdown exceeds the 512 KiB limit");
  }
}
