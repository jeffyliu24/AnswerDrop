#!/usr/bin/env node
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { assertMarkdownSize, loadConfig } from "./config.js";
import { renderMarkdown } from "./render/markdown.js";
import { renderReaderPage } from "./render/page.js";
import { scanMarkdown } from "./security/index.js";
import { Database } from "./storage/database.js";

function usage(): never {
  console.error(
    "Usage: answerdrop preview <file.md> | publish <file.md> [--expire 1h|1d|7d|30d] [--max-views N] [--localize] [--acknowledge]",
  );
  process.exit(2);
}

function readMarkdown(file: string): string {
  if (!file.toLowerCase().endsWith(".md"))
    throw new Error("Expected a .md file");
  const markdown = readFileSync(resolve(file), "utf8");
  assertMarkdownSize(markdown);
  return markdown;
}

function scanSummary(markdown: string): ReturnType<typeof scanMarkdown> {
  const findings = scanMarkdown(markdown);
  console.log(
    `Scanning Markdown… ${findings.length} potential sensitive item(s) found.`,
  );
  for (const finding of findings)
    console.log(
      `  - ${finding.label} (line ${markdown.slice(0, finding.start).split("\n").length})`,
    );
  return findings;
}

async function main(): Promise<void> {
  const [command, file, ...args] = process.argv.slice(2);
  if (!command || !file || !["preview", "publish"].includes(command)) usage();
  const markdown = readMarkdown(file);
  const findings = scanSummary(markdown);

  if (command === "preview") {
    if (args.length) usage();
    const rendered = renderMarkdown(markdown);
    const directory = mkdtempSync(join(tmpdir(), "answerdrop-preview-"));
    const path = join(directory, "preview.html");
    const title =
      markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "AnswerDrop preview";
    writeFileSync(
      path,
      renderReaderPage(title, rendered.html, rendered.headings, true),
      { mode: 0o600 },
    );
    console.log(`Preview: ${path}`);
    console.log(
      "Remote images appear as placeholders. Delete the temporary preview when finished.",
    );
    return;
  }

  let expiresIn: string | undefined;
  let maxViews: number | undefined;
  let localizeImages = false;
  let acknowledge = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--expire") expiresIn = args[++index];
    else if (arg === "--max-views") maxViews = Number(args[++index]);
    else if (arg === "--localize") localizeImages = true;
    else if (arg === "--acknowledge") acknowledge = true;
    else usage();
  }
  if (expiresIn && !["1h", "1d", "7d", "30d"].includes(expiresIn)) usage();
  if (
    maxViews !== undefined &&
    (!Number.isInteger(maxViews) || maxViews < 1 || maxViews > 10000)
  )
    usage();
  if (findings.length && !acknowledge) {
    if (!process.stdin.isTTY)
      throw new Error(
        "Findings require review. Re-run interactively or pass --acknowledge after inspection.",
      );
    const reader = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const answer = await reader.question("Continue publishing? [y/N] ");
    reader.close();
    if (!/^y(?:es)?$/i.test(answer.trim())) {
      console.log("Publication cancelled.");
      return;
    }
    acknowledge = true;
  }
  const config = loadConfig();
  let token = config.publishToken;
  if (!token) {
    const database = new Database(config.dataDir);
    token = database.publisherToken();
    database.close();
  }
  const response = await fetch(`${config.baseUrl}/api/publish`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      markdown,
      acknowledgeFindings: acknowledge,
      localizeImages,
      expiresIn,
      maxViews,
    }),
  });
  const result = (await response.json()) as { url?: string; error?: string };
  if (!response.ok || !result.url)
    throw new Error(result.error ?? `Server returned ${response.status}`);
  console.log(`Published: ${result.url}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
