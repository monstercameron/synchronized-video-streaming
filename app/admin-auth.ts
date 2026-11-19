import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
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
/** How long a sign-in lasts. */
const lifetime = 12 * 60 * 60 * 1000;

const digest = (value: string) => createHash("sha256").update(value).digest();

/** Compare without revealing, through timing, how much of a guess was right. */
export function passwordMatches(guess: unknown) {
  return typeof guess === "string" && timingSafeEqual(digest(guess), digest(adminPassword()));
}

// The sign-in cookie is "<expiry>.<signature>", signed with a key made from the password itself, so nothing is stored on the
// server and changing the password signs everybody out.
const sign = (expires: string) => createHmac("sha256", digest(`screening-admin|${adminPassword()}`)).update(expires).digest("base64url");

export function newAdminToken(now = Date.now()) {
  const expires = String(now + lifetime);
  return { value: `${expires}.${sign(expires)}`, maxAge: lifetime / 1000 };
}

export function validAdminToken(token: string | undefined, now = Date.now()) {
  if (!token) return false;
  const [expires, signature, ...rest] = token.split(".");
  if (!expires || !signature || rest.length || !/^\d{10,16}$/.test(expires) || Number(expires) < now) return false;
  const expected = sign(expires);
  return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
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
