import { createHash, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { pathToFileURL } from "node:url";
import { loadConfig, MAX_REQUEST_BYTES, type Config } from "../config.js";
import { readerCsp } from "../render/page.js";
import {
  FindingsRequireReview,
  AnswerDropService,
  type PublishInput,
} from "../service.js";
import { Database } from "../storage/database.js";

const staticFiles = {
  "/": {
    path: new URL("../../web/index.html", import.meta.url),
    type: "text/html; charset=utf-8",
  },
  "/app.js": {
    path: new URL("../../web/app.js", import.meta.url),
    type: "text/javascript; charset=utf-8",
  },
  "/style.css": {
    path: new URL("../../web/style.css", import.meta.url),
    type: "text/css; charset=utf-8",
  },
  "/reader.css": {
    path: new URL("../render/reader.css", import.meta.url),
    type: "text/css; charset=utf-8",
  },
};

function send(
  response: ServerResponse,
  status: number,
  body: string | Buffer,
  type = "text/plain; charset=utf-8",
  headers: Record<string, string> = {},
): void {
  response.writeHead(status, {
    "Content-Type": type,
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    ...headers,
  });
  response.end(body);
}

function json(response: ServerResponse, status: number, value: unknown): void {
  send(
    response,
    status,
    JSON.stringify(value),
    "application/json; charset=utf-8",
  );
}

async function readJson(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  const size = Number(request.headers["content-length"] ?? 0);
  if (size > MAX_REQUEST_BYTES) throw new Error("Request exceeds 600 KiB");
  const chunks: Buffer[] = [];
  let received = 0;
  for await (const chunk of request) {
    received += chunk.length;
    if (received > MAX_REQUEST_BYTES)
      throw new Error("Request exceeds 600 KiB");
    chunks.push(chunk);
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!value || Array.isArray(value) || typeof value !== "object")
    throw new Error("Expected a JSON object");
  return value as Record<string, unknown>;
}

function authorized(request: IncomingMessage, token: string): boolean {
  const supplied =
    request.headers.authorization?.match(/^Bearer (.+)$/)?.[1] ?? "";
  const a = createHash("sha256").update(supplied).digest();
  const b = createHash("sha256").update(token).digest();
  return Boolean(supplied) && timingSafeEqual(a, b);
}

class RateLimiter {
  private hits = new Map<
    string,
    { minute: number; preview: number; publish: number }
  >();
  allow(address: string, kind: "preview" | "publish"): boolean {
    const minute = Math.floor(Date.now() / 60_000);
    const current = this.hits.get(address);
    const entry =
      current?.minute === minute ? current : { minute, preview: 0, publish: 0 };
    entry[kind]++;
    this.hits.set(address, entry);
    if (this.hits.size > 10_000) this.hits.clear();
    return entry[kind] <= (kind === "preview" ? 120 : 20);
  }
}

export function createAnswerDropServer(config: Config = loadConfig()) {
  const database = new Database(config.dataDir);
  const token = database.publisherToken(config.publishToken);
  const service = new AnswerDropService(database, config.baseUrl);
  const limiter = new RateLimiter();
  const server = createServer(async (request, response) => {
    const method = request.method ?? "GET";
    try {
      const path = new URL(request.url ?? "/", "http://local").pathname;
      if (method === "GET" && path === "/api/health")
        return json(response, 200, { status: "ok" });

      if (method === "GET" && path in staticFiles) {
        const file = staticFiles[path as keyof typeof staticFiles];
        return send(response, 200, readFileSync(file.path), file.type, {
          "Content-Security-Policy":
            "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src data:; connect-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'",
        });
      }

      if (method === "POST" && path === "/api/preview") {
        if (
          !limiter.allow(request.socket.remoteAddress ?? "unknown", "preview")
        )
          return json(response, 429, { error: "Preview rate limit exceeded" });
        const input = await readJson(request);
        if (typeof input.markdown !== "string")
          throw new Error("markdown must be a string");
        return json(response, 200, service.previewMarkdown(input.markdown));
      }

      if (method === "POST" && path === "/api/publish") {
        if (!authorized(request, token))
          return json(response, 401, { error: "Publisher token required" });
        if (
          !limiter.allow(request.socket.remoteAddress ?? "unknown", "publish")
        )
          return json(response, 429, { error: "Publish rate limit exceeded" });
        const input = await readJson(request);
        if (typeof input.markdown !== "string")
          throw new Error("markdown must be a string");
        if (
          input.acknowledgeFindings !== undefined &&
          typeof input.acknowledgeFindings !== "boolean"
        )
          throw new Error("acknowledgeFindings must be a boolean");
        if (
          input.localizeImages !== undefined &&
          typeof input.localizeImages !== "boolean"
        )
          throw new Error("localizeImages must be a boolean");
        if (
          input.expiresIn !== undefined &&
          !["1h", "1d", "7d", "30d"].includes(String(input.expiresIn))
        )
          throw new Error("Invalid expiration option");
        const result = await service.publishMarkdown(
          input as unknown as PublishInput,
        );
        return json(response, 201, result);
      }

      const privateExport = path.match(
        /^\/api\/documents\/([A-Za-z0-9_-]{24})\/export\.html$/,
      );
      if (method === "GET" && privateExport) {
        if (!authorized(request, token))
          return json(response, 401, { error: "Publisher token required" });
        const document = database.getDocument(privateExport[1]);
        if (!document || !document.published)
          return json(response, 404, { error: "Document not found" });
        return send(
          response,
          200,
          service.readerHtml(document, true, true),
          "text/html; charset=utf-8",
          {
            "Content-Disposition": `attachment; filename="answerdrop-${document.slug}.html"`,
            "Content-Security-Policy": `${readerCsp()}; frame-ancestors 'none'`,
          },
        );
      }

      const unpublish = path.match(
        /^\/api\/documents\/([A-Za-z0-9_-]{24})\/unpublish$/,
      );
      if (method === "POST" && unpublish) {
        if (!authorized(request, token))
          return json(response, 401, { error: "Publisher token required" });
        const unpublished = service.unpublishDocument(unpublish[1]);
        return json(response, unpublished ? 200 : 404, { unpublished });
      }

      const asset = path.match(
        /^\/s\/([A-Za-z0-9_-]{24})\/assets\/([a-f0-9]{64})$/,
      );
      if (method === "GET" && asset) {
        const image = database.getAsset(asset[1], asset[2]);
        if (!image) return json(response, 404, { error: "Asset not found" });
        return send(response, 200, Buffer.from(image.bytes), image.mime, {
          "Content-Security-Policy":
            "default-src 'none'; frame-ancestors 'none'",
        });
      }

      const exportMatch = path.match(
        /^\/s\/([A-Za-z0-9_-]{24})\/export\.html$/,
      );
      if (method === "GET" && exportMatch) {
        const document = database.claimView(exportMatch[1]);
        if (!document)
          return json(response, 404, {
            error: "Document not found or no longer available",
          });
        return send(
          response,
          200,
          service.readerHtml(document, true),
          "text/html; charset=utf-8",
          {
            "Content-Disposition": `attachment; filename="answerdrop-${document.slug}.html"`,
            "Content-Security-Policy": `${readerCsp()}; frame-ancestors 'none'`,
          },
        );
      }

      const share = path.match(/^\/s\/([A-Za-z0-9_-]{24})$/);
      if (method === "GET" && share) {
        const document = database.claimView(share[1]);
        if (!document)
          return json(response, 404, {
            error: "Document not found or no longer available",
          });
        return send(
          response,
          200,
          service.readerHtml(document, false),
          "text/html; charset=utf-8",
          {
            "Content-Security-Policy": `${readerCsp()}; frame-ancestors 'none'`,
          },
        );
      }

      return json(response, 404, { error: "Not found" });
    } catch (error) {
      if (error instanceof FindingsRequireReview)
        return json(response, 409, {
          error: error.message,
          findings: error.findings,
        });
      const message =
        error instanceof Error ? error.message : "Unexpected error";
      const status = message.includes("exceeds 600 KiB")
        ? 413
        : error instanceof SyntaxError
          ? 400
          : error instanceof Error
            ? 422
            : 500;
      return json(response, status, { error: message });
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.maxRequestsPerSocket = 100;
  return { server, database, token };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const config = loadConfig();
  const app = createAnswerDropServer(config);
  app.server.listen(config.port, config.host, () => {
    console.log(`AnswerDrop listening on ${config.host}:${config.port}`);
    console.log(`Publisher token: ${app.token}`);
  });
}
