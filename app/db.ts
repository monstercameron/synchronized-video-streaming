import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";

const runtime = globalThis as typeof globalThis & { screeningDatabase?: DatabaseSync };

/** The single SQLite database, opened once per server process. */
export function database() {
  if (runtime.screeningDatabase) return runtime.screeningDatabase;

  const file = resolve(/* turbopackIgnore: true */ process.env.SCREENING_DB_PATH ?? ".data/screening.sqlite");
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  // Compiling a statement costs more than running it, and the same few statements run on every request and event. Keep the
  // compiled ones. (The limit stops queries built with a varying number of "?" from filling the cache.)
  const prepare = db.prepare.bind(db);
  const compiled = new Map<string, StatementSync>();
  db.prepare = (sql: string) => {
    let statement = compiled.get(sql);
    if (!statement) {
      if (compiled.size >= 120) compiled.clear();
      statement = prepare(sql);
      compiled.set(sql, statement);
    }
    return statement;
  };
  try {
    db.exec(`
      PRAGMA journal_mode = WAL;
      -- In WAL mode NORMAL cannot corrupt the database; at worst the last moments before a power cut are lost. It avoids a
      -- disk flush after every chat message and playback command.
      PRAGMA synchronous = NORMAL;
      PRAGMA journal_size_limit = 8388608;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 2500;
      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY, host_id TEXT NOT NULL,
        playing INTEGER NOT NULL DEFAULT 0, position REAL NOT NULL DEFAULT 0,
        anchor_at INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS members (
        id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id),
        session_hash TEXT NOT NULL, name TEXT NOT NULL,
        UNIQUE(room_id, session_hash)
      );
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL REFERENCES rooms(id),
        author_id TEXT NOT NULL REFERENCES members(id), text TEXT NOT NULL, sent_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS messages_room ON messages(room_id, id);
      CREATE TABLE IF NOT EXISTS media (
        id TEXT PRIMARY KEY, rel_path TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, title TEXT NOT NULL,
        duration REAL NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL,
        container TEXT NOT NULL, vcodec TEXT NOT NULL, acodec TEXT NOT NULL,
        size INTEGER NOT NULL, bitrate INTEGER NOT NULL,
        compat TEXT NOT NULL, note TEXT NOT NULL, faststart INTEGER NOT NULL,
        sig TEXT NOT NULL, captions TEXT NOT NULL, poster TEXT
      );
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS media_meta (
        media_id TEXT PRIMARY KEY, data TEXT NOT NULL, fetched_at INTEGER NOT NULL, model TEXT NOT NULL
      );
    `);
    const columns = db.prepare("PRAGMA table_info(rooms)").all() as { name: string }[];
    if (!columns.some(column => column.name === "media_id")) db.exec("ALTER TABLE rooms ADD COLUMN media_id TEXT");
    db.prepare("UPDATE rooms SET playing = 0, revision = revision + 1 WHERE playing = 1").run();
  } catch (error) {
    db.close();
    throw error;
  }
  runtime.screeningDatabase = db;
  return db;
}
