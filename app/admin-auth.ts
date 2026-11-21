import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { database } from "./db";
import { clientKey } from "./room-guard";
import { RoomError } from "./room-store";

/**
 * The admin password. Set ADMIN_PASSWORD in the server's settings. If it is not set the password is "password", which is only
 * fine on your own computer: anyone who knows it can open the site, upload videos, and close rooms.
 */
export function adminPassword() {
  return process.env.ADMIN_PASSWORD || "password";
}

export const usingDefaultPassword = () => !process.env.ADMIN_PASSWORD;

export const adminCookie = "screening-admin";
export function adminCookieOptions(request: NextRequest) {
  return {
    path: "/", httpOnly: true, sameSite: "lax" as const,
    secure: request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto")?.split(",")[0].trim() === "https",
  };
}
/** How long a sign-in lasts. */
const lifetime = 12 * 60 * 60 * 1000;

const digest = (value: string) => createHash("sha256").update(value).digest();

/** Compare without revealing, through timing, how much of a guess was right. */
export function passwordMatches(guess: unknown) {
  return typeof guess === "string" && timingSafeEqual(digest(guess), digest(adminPassword()));
}

// A random ID keeps separate sign-ins distinct. The password still controls which signatures are valid.
const sign = (value: string) => createHmac("sha256", digest(`screening-admin|${adminPassword()}`)).update(value).digest("base64url");

export function newAdminToken(now = Date.now()) {
  const value = `${now + lifetime}.${randomBytes(16).toString("base64url")}`;
  return { value: `${value}.${sign(value)}`, maxAge: lifetime / 1000 };
}

function signedExpiry(token: string, now: number) {
  const [expires, idOrSignature, signature, ...rest] = token.split(".");
  if (!/^\d{10,16}$/.test(expires) || !idOrSignature || rest.length || Number(expires) <= now) return undefined;
  // Older cookies have no ID. Let them expire normally and allow them to be revoked as well.
  if (signature !== undefined && !/^[\w-]{22}$/.test(idOrSignature)) return undefined;
  const proof = signature ?? idOrSignature;
  if (!/^[\w-]{43}$/.test(proof)) return undefined;
  const expected = sign(signature === undefined ? expires : `${expires}.${idOrSignature}`);
  return timingSafeEqual(Buffer.from(proof), Buffer.from(expected)) ? Number(expires) : undefined;
}

export function validAdminToken(token: string | undefined, now = Date.now()) {
  return !!token && signedExpiry(token, now) !== undefined &&
    !database().prepare("SELECT 1 FROM revoked_admin_sessions WHERE token_hash = ?").get(digest(token).toString("hex"));
}

export function revokeAdminToken(token: string | undefined) {
  if (!token) return;
  const now = Date.now();
  const expiry = signedExpiry(token, now);
  if (expiry === undefined) return;
  const db = database();
  db.prepare("DELETE FROM revoked_admin_sessions WHERE expires_at <= ?").run(now);
  db.prepare("INSERT OR IGNORE INTO revoked_admin_sessions (token_hash, expires_at) VALUES (?, ?)").run(digest(token).toString("hex"), expiry);
}

export const isAdmin = (request: NextRequest) => validAdminToken(request.cookies.get(adminCookie)?.value);

/** Refuse unless the request carries a valid admin sign-in. */
export function assertAdmin(request: NextRequest) {
  if (!isAdmin(request)) throw new RoomError(401, "err.admin.required");
}

// Wrong passwords are limited per address, the same way wrong room codes are: a handful a minute.
const window = 60_000;
const allowed = 6;
const runtime = globalThis as typeof globalThis & { screeningAdminMisses?: Map<string, number[]> };
const misses = runtime.screeningAdminMisses ??= new Map<string, number[]>();

function recent(key: string, now = Date.now()) {
  const list = (misses.get(key) ?? []).filter(at => now - at < window);
  if (list.length) misses.set(key, list);
  else misses.delete(key);
  return list;
}

export function assertCanTryPassword(request: NextRequest) {
  if (recent(clientKey(request)).length >= allowed) throw new RoomError(429, "err.admin.tooMany");
}

export function recordWrongPassword(request: NextRequest) {
  const key = clientKey(request);
  const now = Date.now();
  misses.set(key, [...recent(key, now), now]);
  if (misses.size > 2000) for (const other of misses.keys()) recent(other, now);
}

export function forgetWrongPasswords(request: NextRequest) {
  misses.delete(clientKey(request));
}

let warned = false;
/** Say so in the server log, once, when the default password is in use. */
export function warnIfDefaultPassword() {
  if (warned || !usingDefaultPassword()) return;
  warned = true;
  console.warn("ADMIN_PASSWORD is not set: the admin password is \"password\". Set ADMIN_PASSWORD before putting this on the internet.");
}
