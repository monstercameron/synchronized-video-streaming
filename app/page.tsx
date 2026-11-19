import { cookies, headers } from "next/headers";
import { PasswordGate } from "./admin-ui";
import { adminCookie, validAdminToken } from "./admin-auth";
import { ScreeningRoom } from "./screening-room";
import { cookieName } from "./room-http";
import { isMemberOf, sessionToken } from "./room-store";
import { isRoomId, normalizeRoomId } from "./room-shared";
import { roomLinkGone } from "./room-guard";
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
    if (!admin && !returning) return <PasswordGate mode="lock" room={initialRoom} />;
  }
  // A link to a room that has closed is said so right away. (A link that is not even shaped like a room is told apart on the page.)
  const gone = !!initialRoom && isRoomId(initialRoom) && roomLinkGone(await headers(), initialRoom);
  return <ScreeningRoom initialRoom={initialRoom} roomGone={gone} />;
}
