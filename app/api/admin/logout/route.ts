import { NextResponse, type NextRequest } from "next/server";
import { adminCookie, adminCookieOptions, revokeAdminToken } from "../../../admin-auth";
import { assertSameOrigin, noStore, roomResponse } from "../../../room-http";

export const runtime = "nodejs";

/** Sign out. The site stays open or locked as it was. */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    revokeAdminToken(request.cookies.get(adminCookie)?.value);
    const response = NextResponse.json({ ok: true }, { headers: noStore });
    response.cookies.set(adminCookie, "", { ...adminCookieOptions(request), maxAge: 0 });
    return response;
  } catch (error) {
    return roomResponse(error);
  }
}
