# AnswerDrop

Turn AI-generated Markdown into safe, beautiful, shareable pages.

Paste or publish an AI answer, inspect potential secrets, localize fragile images, and share a browser-readable link that does not depend on the original AI platform. AnswerDrop is self-hostable, open source, and designed for **network-resilient, self-contained reader pages**. Recipients need no account, app, GitHub access, or Markdown software.

> The privacy scanner reports **potential sensitive information**. It cannot guarantee detection of every secret. Review your document before sharing.

## Why AnswerDrop?

| Existing approach | Good at                     | Friction for an AI-generated technical answer              |
| ----------------- | --------------------------- | ---------------------------------------------------------- |
| Screenshot        | Preserving appearance       | Text and code are hard to copy or search.                  |
| AI share link     | Fast within one platform    | Access can depend on an account, platform, or network.     |
| Markdown file     | Portable source             | Recipient must download and render it.                     |
| Markdown editor   | Authoring and collaboration | More workflow than a read-only answer needs.               |
| Paste service     | Quick text sharing          | Often lacks technical rendering and prepublication review. |

AnswerDrop combines **privacy scan before publish**, **AI-output-friendly rendering**, **optional resource localization**, a **simple publish workflow**, **offline HTML export**, and a reader page with **zero third-party runtime dependencies**. The reader URL is a random bearer link. No reader login is required.

```text
AI answer / report
        ↓
   Markdown input
        ↓
  Privacy scanner
        ↓
Resource localizer
        ↓
   Safe renderer
        ↓
 ┌───────────────┐
 │ Shareable URL │
 │ Offline HTML  │
 └───────────────┘
```

## Quick start with Docker

```sh
git clone https://github.com/jeffyliu24/AnswerDrop.git answerdrop
cd answerdrop
docker compose up --build
```

Open <http://localhost:3000>. On first start, AnswerDrop creates a publisher token and prints it in `docker compose logs app`. Paste that token into the UI once per browser session. Paste Markdown or upload a `.md` file, review each finding using **Redact** or **Ignore**, and publish. Open the resulting `/s/<slug>` URL in another browser or private window; readers do not need the token.

Docker binds to `127.0.0.1:3000` and stores data in the `answerdrop-data` volume. For a public deployment, put it behind an HTTPS reverse proxy and set `ANSWERDROP_BASE_URL=https://your-domain.example`. Set `ANSWERDROP_PUBLISH_TOKEN` from a secret manager if you want to manage or rotate the publisher token yourself. The token must have at least 24 characters. Never put it in a URL.

## Local development and CLI

Requires Node.js 26 and npm.

```sh
npm ci
npm run build
npm start
```

The publisher token appears in the server log. A local install can use the token stored in `./data` automatically; to point the CLI at a Docker or remote server, set `ANSWERDROP_PUBLISH_TOKEN` and `ANSWERDROP_BASE_URL` in your shell.

```sh
npm link
answerdrop preview examples/ai-answer.md
answerdrop publish examples/quickstart-zh.md
answerdrop publish report.md --expire 7d --max-views 20 --localize
```

`preview` writes a private temporary HTML file and prints its path. Delete it when finished. `publish` prints finding categories and prompts before publishing if potential sensitive content is found. In a non-interactive script, review first and pass `--acknowledge` explicitly. `examples/quickstart-zh.md` is a ready-to-publish sample. `examples/ai-answer.md` contains deliberately fake scanner examples; its image URL is illustrative, so omit `--localize` or replace it with a reachable public image.

### Expiring links and view limits

Choose never, 1 hour, 1 day, 7 days, or 30 days in the UI. The CLI accepts `--expire 1h|1d|7d|30d`. UI view limits are 1, 10, or 100; the CLI accepts `--max-views N` from 1 to 10,000. Each anonymous page load or anonymous HTML export consumes one view. Asset requests do not consume views. The publisher's authenticated HTML download does not consume a view. Expiration does not retract copies that a recipient already saved.

### Rendering and images

The renderer supports headings and anchors, a table of contents, emphasis, lists and task lists, quotes, links, tables, fenced code with copy buttons and lightweight highlighting, and math parsed by KaTeX and emitted as browser-native MathML. Raw HTML is escaped; unsafe link and image schemes are not rendered. Mermaid and arbitrary HTML publishing are outside v0.1.

Optional image localization fetches at most 8 HTTP(S) PNG/JPEG/GIF/WebP images (2 MiB each, 8 MiB total), validates DNS/IP and content, hashes the bytes, and stores them in SQLite. Redirects, private or reserved IPs, SVG, nonstandard ports, and compressed responses are rejected. A failed localization stops publication so the author can correct the URL or uncheck localization. Without localization, external images become placeholders and do not load automatically in the reader. Offline HTML embeds localized images, CSS, and JavaScript; MathML needs no external font.

## Security and storage

Documents and images are stored in SQLite under `ANSWERDROP_DATA_DIR` (default `./data`). The server operator can read them. Publication requires a publisher token; readers need only an unguessable URL. The UI stores the publisher token in browser session storage. Built-in request/document/image limits and a small in-memory rate limit cover the single-instance MVP; a public instance should also use reverse-proxy rate limiting and TLS.

See [security model](docs/security.md) for the threat analysis and limitations. See [architecture](docs/architecture.md), [competitor analysis](docs/competitive-analysis.md), and [roadmap](docs/roadmap.md). MCP and AI chat capture adapters are planned, not included in v0.1.

## Development checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

CI runs the same checks. This project uses the MIT License; see [LICENSE](LICENSE). Contributions and security reports are welcome through [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).
