import MarkdownIt from "markdown-it";
import katex from "katex";

export interface Heading {
  level: number;
  text: string;
  id: string;
}

export interface RenderResult {
  html: string;
  headings: Heading[];
  remoteImages: string[];
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ] ?? char,
  );
}

function safeLink(value: string): boolean {
  if (value.startsWith("#")) return true;
  try {
    const url = new URL(value);
    return (
      ["https:", "http:", "mailto:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function safeImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function highlightCode(code: string, language: string): string {
  const lang = language.toLowerCase();
  if (
    !/^(?:bash|sh|shell|python|py|javascript|js|typescript|ts|json)$/.test(lang)
  )
    return escapeHtml(code);
  const pattern =
    /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|#[^\n]*|\/\/[^\n]*|\b(?:const|let|var|function|return|import|from|export|async|await|if|else|for|while|def|class|print|True|False|None|echo|set|cd|python|npm|docker|true|false|null)\b|\b\d+(?:\.\d+)?\b)/g;
  let result = "";
  let cursor = 0;
  for (const match of code.matchAll(pattern)) {
    const start = match.index;
    result += escapeHtml(code.slice(cursor, start));
    const token = match[0];
    const kind = /^["']/.test(token)
      ? "string"
      : /^(?:#|\/\/)/.test(token)
        ? "comment"
        : /^\d/.test(token)
          ? "number"
          : "keyword";
    result += `<span class="tok-${kind}">${escapeHtml(token)}</span>`;
    cursor = start + token.length;
  }
  return result + escapeHtml(code.slice(cursor));
}

function addMath(md: MarkdownIt): void {
  md.inline.ruler.before(
    "emphasis",
    "math_inline",
    (state: any, silent: boolean) => {
      if (state.src[state.pos] !== "$" || state.src[state.pos + 1] === "$")
        return false;
      const end = state.src.indexOf("$", state.pos + 1);
      if (end < 0 || end === state.pos + 1 || state.src[end - 1] === "\\")
        return false;
      if (!silent) {
        const token = state.push("math_inline", "span", 0);
        token.content = state.src.slice(state.pos + 1, end);
      }
      state.pos = end + 1;
      return true;
    },
  );
  md.block.ruler.before(
    "fence",
    "math_block",
    (state: any, startLine: number, endLine: number, silent: boolean) => {
      const start = state.bMarks[startLine] + state.tShift[startLine];
      const first = state.eMarks[startLine];
      if (state.src.slice(start, first).trim() !== "$$") return false;
      let next = startLine + 1;
      while (
        next < endLine &&
        state.src
          .slice(state.bMarks[next] + state.tShift[next], state.eMarks[next])
          .trim() !== "$$"
      )
        next++;
      if (next >= endLine) return false;
      if (!silent) {
        const token = state.push("math_block", "div", 0);
        token.content = state.getLines(startLine + 1, next, 0, true);
        state.line = next + 1;
      }
      return true;
    },
  );
  md.renderer.rules.math_inline = (tokens: any[], index: number) =>
    katex.renderToString(tokens[index].content, {
      throwOnError: false,
      trust: false,
      output: "mathml",
    });
  md.renderer.rules.math_block = (tokens: any[], index: number) =>
    `<div class="math-block">${katex.renderToString(tokens[index].content, { displayMode: true, throwOnError: false, trust: false, output: "mathml" })}</div>`;
}

function addTaskLists(md: MarkdownIt): void {
  md.core.ruler.push("answerdrop_task_lists", (state: any) => {
    for (let index = 0; index < state.tokens.length; index++) {
      const inline = state.tokens[index];
      if (inline.type !== "inline" || !/^\[[ xX]\]\s/.test(inline.content))
        continue;
      const parent = state.tokens[index - 1];
      if (
        !parent ||
        parent.type !== "paragraph_open" ||
        state.tokens[index - 2]?.type !== "list_item_open"
      )
        continue;
      const checked = /^\[[xX]\]/.test(inline.content);
      const first = inline.children?.[0];
      if (
        !first ||
        first.type !== "text" ||
        !/^\[[ xX]\]\s/.test(first.content)
      )
        continue;
      first.content = first.content.replace(/^\[[ xX]\]\s/, "");
      const checkbox = new state.Token("task_checkbox", "input", 0);
      checkbox.meta = { checked };
      inline.children.unshift(checkbox);
      state.tokens[index - 2].attrJoin("class", "task-item");
    }
  });
  md.renderer.rules.task_checkbox = (tokens: any[], index: number) =>
    `<input type="checkbox" disabled${tokens[index].meta.checked ? " checked" : ""} aria-label="Task" /> `;
}

function createParser(imageMap: Record<string, string>): MarkdownIt {
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: false,
    breaks: false,
    maxNesting: 20,
  });
  addMath(md);
  addTaskLists(md);
  md.renderer.rules.fence = (tokens: any[], index: number) => {
    const token = tokens[index];
    const language = token.info.trim().split(/\s+/)[0].toLowerCase();
    const label = escapeHtml(language || "text");
    return `<div class="code-block"><div class="code-toolbar"><span>${label}</span><button type="button" class="copy-code" aria-label="Copy code">Copy</button></div><pre><code>${highlightCode(token.content, language)}</code></pre></div>`;
  };
  md.renderer.rules.code_block = (tokens: any[], index: number) =>
    `<div class="code-block"><div class="code-toolbar"><span>text</span><button type="button" class="copy-code" aria-label="Copy code">Copy</button></div><pre><code>${escapeHtml(tokens[index].content)}</code></pre></div>`;
  const defaultLinkOpen = md.renderer.rules.link_open;
  md.renderer.rules.link_open = (
    tokens: any[],
    index: number,
    options: any,
    env: any,
    self: any,
  ) => {
    const token = tokens[index];
    const href = token.attrGet("href") ?? "";
    if (!safeLink(href)) {
      token.attrSet("href", "#");
    } else if (/^https?:/i.test(href)) {
      token.attrSet("target", "_blank");
      token.attrSet("rel", "noopener noreferrer");
    }
    return defaultLinkOpen
      ? defaultLinkOpen(tokens, index, options, env, self)
      : self.renderToken(tokens, index, options);
  };
  md.renderer.rules.image = (tokens: any[], index: number) => {
    const token = tokens[index];
    const original = token.attrGet("src") ?? "";
    const alt = escapeHtml(token.content || "Image");
    const local = imageMap[original];
    if (
      local &&
      (local.startsWith("/s/") ||
        /^data:image\/(?:png|jpeg|gif|webp);base64,/.test(local))
    ) {
      return `<figure class="document-image"><img src="${escapeHtml(local)}" alt="${alt}" loading="lazy" /><figcaption>${alt}</figcaption></figure>`;
    }
    if (safeImageUrl(original)) {
      return `<span class="image-placeholder">Image not localized: ${alt} <a href="${escapeHtml(original)}" target="_blank" rel="noopener noreferrer">Open externally</a></span>`;
    }
    return `<span class="image-placeholder">Image unavailable: ${alt}</span>`;
  };
  return md;
}

function collectImages(tokens: any[], images: Set<string>): void {
  for (const token of tokens) {
    if (token.type === "image") {
      const src = token.attrGet("src");
      if (src && safeImageUrl(src)) images.add(src);
    }
    if (token.children) collectImages(token.children, images);
  }
}

function plainText(token: any): string {
  if (!token.children) return token.content ?? "";
  return token.children
    .map((child: any) =>
      child.type === "text" || child.type === "code_inline"
        ? child.content
        : child.type === "image"
          ? child.content
          : "",
    )
    .join("");
}

export function renderMarkdown(
  markdown: string,
  imageMap: Record<string, string> = {},
): RenderResult {
  const md = createParser(imageMap);
  const tokens = md.parse(markdown, {});
  const headings: Heading[] = [];
  const used = new Map<string, number>();
  for (let index = 0; index < tokens.length - 1; index++) {
    const token = tokens[index];
    if (token.type !== "heading_open") continue;
    const text = plainText(tokens[index + 1]).trim();
    const base =
      text
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^\p{L}\p{N}\s-]/gu, "")
        .trim()
        .replace(/\s+/g, "-") || "section";
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    const id = count ? `${base}-${count + 1}` : base;
    token.attrSet("id", id);
    headings.push({ level: Number(token.tag.slice(1)), text, id });
  }
  const images = new Set<string>();
  collectImages(tokens, images);
  return {
    html: md.renderer.render(tokens, md.options, {}),
    headings,
    remoteImages: [...images],
  };
}

export { escapeHtml };
