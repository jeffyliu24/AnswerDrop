# AnswerDrop v0.1.0 release notes

AnswerDrop turns AI-generated Markdown into a read-only share page. Authors can paste or upload Markdown, inspect rule-based privacy findings, redact or ignore them, optionally localize remote images, and publish an anonymous link. The same content can be downloaded as self-contained HTML. A small CLI supports preview and publish, and the app stores documents in SQLite.

## Included

- Technical Markdown rendering: tables, task lists, fenced code with copy buttons and lightweight highlighting, heading anchors and table of contents, and KaTeX-parsed MathML.
- Modular scanner rules for common tokens, paths, private IPv4 addresses, email addresses, secret assignments, and high-entropy candidates. Findings are advisory and require explicit review before publication.
- Guarded HTTP(S) image localization with DNS/IP checks, pinned connections, MIME/signature validation, byte and time limits, and no redirects.
- Random reader links, optional expiration and view limits, publisher-token authorization, and offline HTML export.
- Docker Compose, CLI, automated unit and HTTP integration tests, and CI.

## Known limits

- Single-user publisher model; no accounts, OAuth, collaboration, or dashboard.
- Scanner rules can miss secrets or flag harmless strings. Never treat a clean scan as a guarantee.
- Remote images that are not localized appear as placeholders. Localized formats are PNG, JPEG, GIF, and WebP; SVG is rejected.
- No Mermaid, PDF/PNG output, MCP server, or platform-specific AI chat capture in v0.1.
- Public deployments need an HTTPS reverse proxy and additional rate limiting. Backups contain plaintext Markdown and image bytes.
