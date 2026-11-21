import type { NextRequest } from "next/server";
import { adminCookie } from "../../admin-auth";
import { cookieName, noStore } from "../../room-http";
import { canEnterLockedSite, isOpen } from "../../site-lock";

export const runtime = "nodejs";

/**
 * The public status is one boolean. Entry checks also honor the caller's admin or returning-room session so a waiting
 * browser can show the same screen that a fresh page request would show.
 */
export function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const siteOpen = isOpen();
  if (!query.has("entry")) return Response.json({ open: siteOpen }, { headers: noStore });
  const open = siteOpen || canEnterLockedSite(
    request.cookies.get(adminCookie)?.value, query.get("room") ?? undefined, request.cookies.get(cookieName)?.value,
  );
  return Response.json({ open, siteOpen }, { headers: noStore });
}
