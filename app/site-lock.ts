import { database } from "./db";

/**
 * Whether the site is open to other people. It starts locked: only someone who knows the admin password can get in, and
 * signing in on the lock screen opens it for everybody else. The admin can lock it again from the management page.
 * The choice is kept in the database, so a restart does not change it. SCREENING_LOCK=off removes the lock altogether
 * (for example on your own computer).
 */
const runtime = globalThis as typeof globalThis & { screeningOpen?: boolean };

export const lockEnabled = () => process.env.SCREENING_LOCK !== "off";

export function isOpen() {
  if (!lockEnabled()) return true;
  if (runtime.screeningOpen === undefined) {
    const row = database().prepare("SELECT value FROM settings WHERE key = 'open'").get() as { value: string } | undefined;
    runtime.screeningOpen = row?.value === "1";
  }
  return runtime.screeningOpen;
}

export function setOpen(open: boolean) {
  database().prepare("INSERT INTO settings (key, value) VALUES ('open', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(open ? "1" : "0");
  runtime.screeningOpen = open;
}
