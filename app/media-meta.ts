import { database } from "./db";
import type { MediaMeta } from "./room-shared";

// Looked-up details of each video, kept in the database and in memory.

const cache = new Map<string, MediaMeta | null>();

export function getMeta(mediaId: string): MediaMeta | null {
  if (cache.has(mediaId)) return cache.get(mediaId) ?? null;
  const row = database().prepare("SELECT data FROM media_meta WHERE media_id = ?").get(mediaId) as { data: string } | undefined;
  let meta: MediaMeta | null = null;
  try { meta = row ? JSON.parse(row.data) as MediaMeta : null; } catch { /* A damaged row counts as no details. */ }
  cache.set(mediaId, meta);
  return meta;
}

export function saveMeta(mediaId: string, meta: MediaMeta) {
  database().prepare(`
    INSERT INTO media_meta (media_id, data, fetched_at, model) VALUES (?, ?, ?, ?)
    ON CONFLICT(media_id) DO UPDATE SET data = excluded.data, fetched_at = excluded.fetched_at, model = excluded.model
  `).run(mediaId, JSON.stringify(meta), meta.fetchedAt, meta.model);
  cache.set(mediaId, meta);
}

export function clearMeta(mediaId: string) {
  database().prepare("DELETE FROM media_meta WHERE media_id = ?").run(mediaId);
  cache.set(mediaId, null);
}

