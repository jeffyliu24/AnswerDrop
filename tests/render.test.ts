import assert from "node:assert/strict";
import test from "node:test";
import { renderMarkdown } from "../src/render/markdown.js";
import { renderReaderPage } from "../src/render/page.js";

test("renderer supports technical Markdown and keeps raw HTML inert", () => {
  const markdown = `# Report

## Findings

| Item | Value |
| --- | --- |
| one | **two** |

- [x] Checked
- [ ] Pending

> A quote.

\`\`\`python
print("hello")
\`\`\`

Inline math $x^2$.

<script>alert(1)</script>

[unsafe](javascript:alert(1))

![Remote](https://example.org/image.png)
`;
  const result = renderMarkdown(markdown);
  assert.equal(result.headings.length, 2);
  assert.match(result.html, /<table>/);
  assert.match(result.html, /type="checkbox" disabled checked/);
  assert.match(result.html, /class="copy-code"/);
  assert.match(result.html, /<math/);
  assert.match(result.html, /&lt;script&gt;/);
  assert.doesNotMatch(result.html, /<script>alert/);
  assert.doesNotMatch(result.html, /href="javascript:/);
  assert.doesNotMatch(result.html, /<img src="https:\/\//);
  assert.deepEqual(result.remoteImages, ["https://example.org/image.png"]);
  const page = renderReaderPage("Report", result.html, result.headings);
  assert.doesNotMatch(page, /https:\/\/(?:cdn|fonts|jsdelivr)/);
  assert.match(page, /Content-Security-Policy/);
});

test("heading anchors are unique and localized images replace external requests", () => {
  const result = renderMarkdown(
    "# Hello\n## Hello\n## Hello\n\n![Alt](https://example.org/a.png)",
    {
      "https://example.org/a.png":
        "/s/abcdefghijklmnopqrstuvwx/assets/" + "a".repeat(64),
    },
  );
  assert.deepEqual(
    result.headings.map((heading) => heading.id),
    ["hello", "hello-2", "hello-3"],
  );
  assert.match(
    result.html,
    /<img src="\/s\/abcdefghijklmnopqrstuvwx\/assets\//,
  );
  assert.doesNotMatch(result.html, /src="https:\/\/example.org/);
});

test("math output escapes HTML-like input and rejects unsafe links", () => {
  const result = renderMarkdown(
    String.raw`$\text{<script>alert(1)</script>}$ $\href{javascript:alert(1)}{click}$`,
  );
  assert.match(result.html, /<math/);
  assert.doesNotMatch(result.html, /<script>/);
  assert.doesNotMatch(result.html, /href="javascript:/);
});
