import { cookies } from "next/headers";
import { PasswordGate } from "./admin-ui";
import { adminCookie, validAdminToken } from "./admin-auth";
import { ScreeningRoom } from "./screening-room";
import { cookieName } from "./room-http";
import { isMemberOf, sessionToken } from "./room-store";
import { normalizeRoomId } from "./room-shared";
import { isOpen } from "./site-lock";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ room?: string | string[] }> }) {
  const { room } = await searchParams;
  const initialRoom = typeof room === "string" ? normalizeRoomId(room) || undefined : undefined;
  // Locked: the lock screen, unless this is the admin or someone who is already in the room they are returning to.
  if (!isOpen()) {
    const jar = await cookies();
    const admin = validAdminToken(jar.get(adminCookie)?.value);
    const returning = !!initialRoom && isMemberOf(initialRoom, sessionToken(jar.get(cookieName)?.value));
    if (!admin && !returning) return <PasswordGate mode="lock" />;
  }
  return <ScreeningRoom initialRoom={initialRoom} />;
}
