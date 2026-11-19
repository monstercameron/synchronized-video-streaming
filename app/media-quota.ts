import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { mediaRoot } from "./media-library";

/**
 * A cap on the total size of the media folder, because the server has little disk. Everything in the folder counts
 * (videos, adaptive folders, subtitles, posters). Set MEDIA_QUOTA_GB to change it; the default is 4.
 */
export const quotaBytes = () => {
  const gigabytes = Number(process.env.MEDIA_QUOTA_GB ?? 4);
  return Math.max(0, Number.isFinite(gigabytes) ? gigabytes : 4) * 1e9; // Decimal gigabytes, the same unit the screen shows.
};

async function folderSize(dir: string, skip: (name: string) => boolean): Promise<number> {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (skip(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) total += await folderSize(path, () => false);
    else if (entry.isFile()) total += (await stat(path).catch(() => undefined))?.size ?? 0;
  }
  return total;
}

let cached: { at: number; bytes: number } | undefined;

/** Bytes used by finished files in the media folder. Cheap to call often: the answer is reused for a few seconds. */
export async function usedBytes(fresh = false) {
  if (!fresh && cached && Date.now() - cached.at < 5000) return cached.bytes;
  // Uploads in progress live in ".incoming" and are counted through their reservation instead, not twice.
  const bytes = await folderSize(mediaRoot(), name => name === ".incoming");
  cached = { at: Date.now(), bytes };
  return bytes;
}

export function usageChanged() {
  cached = undefined;
}

// Space promised to uploads that are still arriving, so two at once cannot both squeeze into the last gigabyte.
const reservations = new Map<symbol, number>();
const reserved = () => [...reservations.values()].reduce((sum, bytes) => sum + bytes, 0);

export async function storage() {
  const used = await usedBytes();
  const quota = quotaBytes();
  const pending = reserved();
  return { used, quota, pending, free: Math.max(0, quota - used - pending) };
}

/**
 * Claim room for an upload. `declared` is the size the browser announced (0 if unknown). The returned handle's `grow`
 * records bytes as they arrive and returns false once the folder would pass its cap; `release` must always be called at the end.
 */
export async function reserveSpace(declared: number) {
  // Everything after the one await is synchronous, so two uploads cannot both see the same free space.
  const used = await usedBytes();
  const free = Math.max(0, quotaBytes() - used - reserved());
  if (declared > free) return { ok: false as const, free };
  const id = Symbol("upload");
  reservations.set(id, declared);
  let received = 0;
  return {
    ok: true as const,
    free,
    grow(bytes: number) {
      received += bytes;
      // Past what was announced, the extra still has to fit.
      reservations.set(id, Math.max(declared, received));
      return received <= free;
    },
    release() {
      reservations.delete(id);
      usageChanged();
    },
  };
}
