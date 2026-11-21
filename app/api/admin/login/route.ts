import { NextResponse, type NextRequest } from "next/server";
import { adminCookie, adminCookieOptions, assertCanTryPassword, forgetWrongPasswords, newAdminToken, passwordMatches, recordWrongPassword, usingDefaultPassword, warnIfDefaultPassword } from "../../../admin-auth";
import { noStore, readBody, roomResponse } from "../../../room-http";
import { RoomError } from "../../../room-store";
import { isOpen, setOpen } from "../../../site-lock";

export const runtime = "nodejs";

/**
 * Sign in as the admin ({ password }). With { open: true } (what the lock screen sends) the site is also opened for everybody
 * else, which is the point of signing in there. Wrong passwords are limited per address.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await readBody(request);
    assertCanTryPassword(request);
    if (!passwordMatches(body.password)) {
      recordWrongPassword(request);
      throw new RoomError(401, "err.admin.wrong");
    }
    forgetWrongPasswords(request);
    warnIfDefaultPassword();
    if (body.open === true) setOpen(true);
    const token = newAdminToken();
    const response = NextResponse.json({ ok: true, open: isOpen(), defaultPassword: usingDefaultPassword() }, { headers: noStore });
    response.cookies.set(adminCookie, token.value, { ...adminCookieOptions(request), maxAge: token.maxAge });
    return response;
  } catch (error) {
    return roomResponse(error);
  }
}
