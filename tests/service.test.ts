import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AnswerDropService, FindingsRequireReview } from "../src/service.js";
import { Database } from "../src/storage/database.js";

test("service requires explicit finding acknowledgement and enforces view limits", async () => {
  const directory = mkdtempSync(join(tmpdir(), "answerdrop-service-"));
  const db = new Database(directory);
  try {
    const service = new AnswerDropService(db, "http://localhost:3000");
    await assert.rejects(
      service.publishMarkdown({ markdown: "# Report\n\n192.168.1.9" }),
      FindingsRequireReview,
    );
    const published = await service.publishMarkdown({
      markdown: "# Report\n\n192.168.1.9",
      acknowledgeFindings: true,
      maxViews: 1,
    });
    assert.match(
      published.url,
      /^http:\/\/localhost:3000\/s\/[A-Za-z0-9_-]{24}$/,
    );
    const first = db.claimView(published.slug);
    assert.ok(first);
    assert.equal(first.current_views, 1);
    assert.equal(db.claimView(published.slug), null);
    assert.equal(service.unpublishDocument(published.slug), true);
    assert.equal(db.claimView(published.slug), null);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("localized image is stored by hash and embedded in offline export", async () => {
  const directory = mkdtempSync(join(tmpdir(), "answerdrop-image-"));
  const db = new Database(directory);
  try {
    const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
    const service = new AnswerDropService(
      db,
      "http://localhost:3000",
      async (url) => ({
        sourceUrl: url,
        hash: "a".repeat(64),
        mime: "image/png",
        bytes,
      }),
    );
    const published = await service.publishMarkdown({
      markdown: "# Example\n\n![Image](https://example.org/image.png)",
      localizeImages: true,
    });
    assert.equal(published.localizedImages, 1);
    assert.equal(
      db.getAsset(published.slug, "a".repeat(64))?.mime,
      "image/png",
    );
    const document = db.getDocument(published.slug);
    assert.ok(document);
    assert.match(service.readerHtml(document, false), /\/assets\/aaaa/);
    assert.match(service.readerHtml(document, true), /data:image\/png;base64,/);
    db.db
      .prepare("UPDATE documents SET expires_at = ? WHERE slug = ?")
      .run(Date.now() - 1, published.slug);
    assert.equal(db.claimView(published.slug), null);
    assert.equal(db.getAsset(published.slug, "a".repeat(64)), null);
    assert.match(
      service.readerHtml(document, true, true),
      /data:image\/png;base64,/,
    );
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
