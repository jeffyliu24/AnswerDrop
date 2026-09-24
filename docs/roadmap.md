# Roadmap

## v0.1

- Paste or upload Markdown; preview and review privacy findings.
- Optional guarded image localization; publish a short link with optional expiry and view count.
- Read-only, self-contained reader and offline HTML export; CLI publish and preview.

## Later

- MCP server exposing `publish_markdown`, `preview_markdown`, `scan_markdown`, and `unpublish_document` through the existing service layer.
- PNG/PDF/raw Markdown outputs after the HTML path is mature.
- More scanner rules, user-defined rules, and tests against realistic false positives.
- Better image formats and an operator-configurable fetch policy after security review.
- Optional platform capture adapters. AI chat sites often virtualize conversation nodes, so saving only the current DOM can omit messages. Each adapter (ChatGPT, Claude, Gemini, DeepSeek, etc.) should produce a normalized conversation IR; that IR becomes AnswerDrop Markdown and then follows the same scan/localize/render/publish pipeline. No platform-specific DOM scraping ships in v0.1.

```text
Platform adapter -> normalized conversation IR -> Markdown
  -> privacy scan -> resource localization -> publish
```
