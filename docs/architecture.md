# Architecture

AnswerDrop v0.1 is one Node.js/TypeScript process. It serves a small browser UI, a JSON API, immutable reader pages, and content-addressed image assets. SQLite holds documents and localized image bytes. The reader needs no account or external runtime service.

```text
Markdown input (browser or CLI)
  -> size validation -> rule-based privacy scan -> safe Markdown render
  -> optional guarded image localization -> SQLite publication
  -> /s/:slug reader or self-contained HTML export
```

## Boundaries

- `src/security`: independent scanner rules. Findings retain source offsets so the UI can review, redact, or ignore them. The server scans again when publishing and requires explicit acknowledgement if findings remain.
- `src/render`: Markdown parsing and HTML generation. Raw HTML is disabled. Links and image sources are checked before rendering. CSS and copy-button JavaScript are shipped locally.
- `src/resources`: remote image extraction and a guarded downloader. It resolves and pins a public IP, rejects redirects, checks MIME and magic bytes, limits bytes and time, then stores content by SHA-256. Failed images remain visible as non-loading placeholders.
- `src/storage`: SQLite schema and atomic view-count claims. Slugs are random bearer capabilities; records are not enumerable through the API.
- `src/service`: `scanMarkdown`, `previewMarkdown`, `publishMarkdown`, and `unpublishDocument` form the future MCP boundary.
- `src/server`: HTTP transport, publish-token authorization, limits, and static delivery. The UI and CLI use the same service behavior.

## Publication and access

The server creates a random publisher token at first start, stores it in SQLite, and prints it in the console. `ANSWERDROP_PUBLISH_TOKEN` can override it. Publication and unpublishing require `Authorization: Bearer <token>`. Reader URLs carry a separate random slug and need no login. A reverse proxy should expose the reader paths and protect the token; TLS is the operator's responsibility.

`expires_at` and `max_views` are optional. A page request atomically claims one view; when the limit is reached, later page requests return 404. Anonymous HTML export also claims a view. Asset requests require an existing, unexpired slug but do not claim an extra view, so images on the last permitted page can load. An authenticated publisher export does not claim a view.

## Offline export

The HTML export inlines CSS, code-copy behavior, and localized images as data URLs. External image URLs are never fetched by a reader page. External links remain clickable, and may require network access when followed. KaTeX parses math to native MathML, so no math font assets are needed.

## Scope

v0.1 is single-user and Markdown-only. There is no HTML publication, account system, browser extension, chat-site scraping, or general-purpose editor. The browser UI is intentionally a single paste/review/share flow. A future MCP server can call the service layer without duplicating security checks.
