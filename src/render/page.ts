import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Heading } from "./markdown.js";
import { escapeHtml } from "./markdown.js";

const readerCss = readFileSync(
  new URL("./reader.css", import.meta.url),
  "utf8",
);

const readerScript = `document.addEventListener('click',async(event)=>{const button=event.target.closest('.copy-code');if(!button)return;const code=button.closest('.code-block')?.querySelector('code')?.textContent??'';try{await navigator.clipboard.writeText(code);button.textContent='Copied';setTimeout(()=>button.textContent='Copy',1500)}catch{button.textContent='Select code';setTimeout(()=>button.textContent='Copy',1500)}});`;
const scriptHash = createHash("sha256").update(readerScript).digest("base64");

export function readerCsp(): string {
  return `default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; font-src data:; script-src 'sha256-${scriptHash}'; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'`;
}

export function renderReaderPage(
  title: string,
  body: string,
  headings: Heading[],
  offline = false,
): string {
  const toc =
    headings.length > 1
      ? `<nav class="toc" aria-label="Table of contents"><div class="toc-heading">On this page</div>${headings.map((heading) => `<a class="toc-level-${heading.level}" href="#${escapeHtml(heading.id)}">${escapeHtml(heading.text)}</a>`).join("")}</nav>`
      : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><meta http-equiv="Content-Security-Policy" content="${escapeHtml(readerCsp())}" /><meta name="color-scheme" content="light" /><title>${escapeHtml(title)} · AnswerDrop</title><style>${readerCss}</style></head>
<body><header class="reader-header">${offline ? '<span class="brand">AnswerDrop</span>' : '<a class="brand" href="/">AnswerDrop</a>'}<span class="reader-label">Shared document</span></header><div class="reading-layout">${toc}<main class="reader-main"><article class="prose">${body}</article><footer>Published with AnswerDrop · Readable without an account</footer></main></div><script>${readerScript}</script></body></html>`;
}
