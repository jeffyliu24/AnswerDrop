import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAnswerDropServer } from "../src/server/main.js";

test("HTTP flow: preview, review, publish, anonymous read, expiry limit, offline export", async () => {
  const directory = mkdtempSync(join(tmpdir(), "answerdrop-api-"));
  const token = "test-publisher-token-1234567890abcdef";
  const app = createAnswerDropServer({
    host: "127.0.0.1",
    port: 3000,
    baseUrl: "http://localhost:3000",
    dataDir: directory,
    publishToken: token,
  });
  await new Promise<void>((resolve) =>
    app.server.listen(0, "127.0.0.1", resolve),
  );
  const address = app.server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const body = { markdown: "# Hello\n\n192.168.1.20", maxViews: 1 };
  const post = (path: string, value: unknown, authorization = false) =>
    fetch(`${origin}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authorization ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(value),
    });
  try {
    const homepage = await fetch(origin);
    assert.equal(homepage.status, 200);
    assert.match(await homepage.text(), /Paste an answer here/);
    assert.equal((await fetch(`${origin}/app.js`)).status, 200);

    const preview = await post("/api/preview", body);
    assert.equal(preview.status, 200);
    assert.equal(
      ((await preview.json()) as { findings: unknown[] }).findings.length,
      1,
    );
    assert.equal((await post("/api/publish", body)).status, 401);
    const unreviewed = await post("/api/publish", body, true);
    assert.equal(unreviewed.status, 409);

    const published = await post(
      "/api/publish",
      { ...body, acknowledgeFindings: true },
      true,
    );
    assert.equal(published.status, 201);
    const { slug } = (await published.json()) as { slug: string };
    const reader = await fetch(`${origin}/s/${slug}`);
    assert.equal(reader.status, 200);
    assert.match(await reader.text(), /Hello/);
    assert.match(
      reader.headers.get("content-security-policy") ?? "",
      /default-src 'none'/,
    );
    assert.equal((await fetch(`${origin}/s/${slug}`)).status, 404);

    const ownerExport = await fetch(
      `${origin}/api/documents/${slug}/export.html`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    assert.equal(ownerExport.status, 200);
    assert.match(
      ownerExport.headers.get("content-disposition") ?? "",
      /attachment/,
    );
    assert.match(await ownerExport.text(), /<!doctype html>/);
    assert.equal(
      (await post(`/api/documents/${slug}/unpublish`, {}, true)).status,
      200,
    );

    const blocked = await post(
      "/api/publish",
      {
        markdown: "# Image\n\n![x](http://localhost/test.png)",
        localizeImages: true,
      },
      true,
    );
    assert.equal(blocked.status, 422);
  } finally {
    await new Promise<void>((resolve) => app.server.close(() => resolve()));
    app.database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
