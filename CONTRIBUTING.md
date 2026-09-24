# Contributing

Thanks for helping make AnswerDrop useful. Keep changes focused on the path from AI output to inspected, shareable Markdown.

## Development

Requires Node.js 26 and npm.

```sh
npm ci
npm run build
npm test
npm run lint
npm run typecheck
```

Use a disposable `ANSWERDROP_DATA_DIR` when testing locally. Do not commit credentials, real sensitive examples, database files, or local `.env` files. Add tests for scanner rules, rendering changes, access limits, and remote-fetch policy changes. Run formatting with `npm run format` before opening a pull request.

Please open an issue for substantial new features before implementing them. Report vulnerabilities through the private process in [SECURITY.md](SECURITY.md). Do not copy code from projects with incompatible licenses; the project is MIT licensed.
