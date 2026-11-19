import { noStore } from "../../room-http";
import { isOpen } from "../../site-lock";

export const runtime = "nodejs";

/**
 * Whether the site is open to guests right now, and nothing else. The lock screen asks this every few seconds so a friend
 * waiting there is let in as soon as the admin opens the site. It needs no sign-in and answers one boolean to anyone.
 */
export function GET() {
  return Response.json({ open: isOpen() }, { headers: noStore });
}
