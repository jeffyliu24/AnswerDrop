import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { LocalImage } from "../resources/localize.js";

export interface DocumentRecord {
  id: string;
  slug: string;
  title: string;
  markdown: string;
  metadata: string;
  image_map: string;
  created_at: number;
  updated_at: number;
  expires_at: number | null;
  max_views: number | null;
  current_views: number;
  published: number;
}

export interface NewDocument {
  title: string;
  markdown: string;
  metadata: string;
  imageMap: Record<string, string>;
  expiresAt?: number;
  maxViews?: number;
  images: LocalImage[];
}

export class Database {
  readonly db: DatabaseSync;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(join(dataDir, "answerdrop.db"));
    this.db.exec(
      "PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;",
    );
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        markdown TEXT NOT NULL,
        metadata TEXT NOT NULL,
        image_map TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        expires_at INTEGER,
        max_views INTEGER,
        current_views INTEGER NOT NULL DEFAULT 0,
        published INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS assets (hash TEXT PRIMARY KEY, mime TEXT NOT NULL, bytes BLOB NOT NULL);
      CREATE TABLE IF NOT EXISTS document_assets (
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        hash TEXT NOT NULL REFERENCES assets(hash),
        PRIMARY KEY (document_id, hash)
      );
      CREATE INDEX IF NOT EXISTS idx_documents_slug ON documents(slug);
    `);
  }

  close(): void {
    this.db.close();
  }

  publisherToken(override?: string): string {
    if (override) {
      if (override.length < 24)
        throw new Error(
          "ANSWERDROP_PUBLISH_TOKEN must be at least 24 characters",
        );
      return override;
    }
    const row = this.db
      .prepare("SELECT value FROM metadata WHERE key = ?")
      .get("publisher_token") as { value: string } | undefined;
    if (row) return row.value;
    const token = randomBytes(32).toString("base64url");
    this.db
      .prepare("INSERT INTO metadata (key, value) VALUES (?, ?)")
      .run("publisher_token", token);
    return token;
  }

  createDocument(input: NewDocument): DocumentRecord {
    const id = randomUUID();
    const slug = randomBytes(18).toString("base64url");
    const now = Date.now();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          `INSERT INTO documents (id, slug, title, markdown, metadata, image_map, created_at, updated_at, expires_at, max_views, current_views, published)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)`,
        )
        .run(
          id,
          slug,
          input.title,
          input.markdown,
          input.metadata,
          JSON.stringify(input.imageMap),
          now,
          now,
          input.expiresAt ?? null,
          input.maxViews ?? null,
        );
      for (const image of input.images) {
        this.db
          .prepare(
            "INSERT OR IGNORE INTO assets (hash, mime, bytes) VALUES (?, ?, ?)",
          )
          .run(image.hash, image.mime, image.bytes);
        this.db
          .prepare(
            "INSERT OR IGNORE INTO document_assets (document_id, hash) VALUES (?, ?)",
          )
          .run(id, image.hash);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.db
      .prepare("SELECT * FROM documents WHERE id = ?")
      .get(id) as unknown as DocumentRecord;
  }

  claimView(slug: string): DocumentRecord | null {
    const row = this.db
      .prepare(
        `UPDATE documents SET current_views = current_views + 1
      WHERE slug = ? AND published = 1 AND (expires_at IS NULL OR expires_at > ?)
      AND (max_views IS NULL OR current_views < max_views) RETURNING *`,
      )
      .get(slug, Date.now()) as unknown as DocumentRecord | undefined;
    return row ?? null;
  }

  getAsset(slug: string, hash: string): { mime: string; bytes: Buffer } | null {
    const row = this.db
      .prepare(
        `SELECT a.mime, a.bytes FROM assets a
      JOIN document_assets da ON da.hash = a.hash JOIN documents d ON d.id = da.document_id
      WHERE d.slug = ? AND a.hash = ? AND d.published = 1 AND (d.expires_at IS NULL OR d.expires_at > ?)`,
      )
      .get(slug, hash, Date.now()) as
      | { mime: string; bytes: Buffer }
      | undefined;
    return row ?? null;
  }

  getAssetForOwner(
    documentId: string,
    hash: string,
  ): { mime: string; bytes: Buffer } | null {
    const row = this.db
      .prepare(
        `SELECT a.mime, a.bytes FROM assets a
        JOIN document_assets da ON da.hash = a.hash
        WHERE da.document_id = ? AND a.hash = ?`,
      )
      .get(documentId, hash) as { mime: string; bytes: Buffer } | undefined;
    return row ?? null;
  }

  getDocument(slug: string): DocumentRecord | null {
    return (
      (this.db
        .prepare("SELECT * FROM documents WHERE slug = ?")
        .get(slug) as unknown as DocumentRecord | undefined) ?? null
    );
  }

  unpublish(slug: string): boolean {
    return (
      this.db
        .prepare(
          "UPDATE documents SET published = 0, updated_at = ? WHERE slug = ? AND published = 1",
        )
        .run(Date.now(), slug).changes > 0
    );
  }
}
