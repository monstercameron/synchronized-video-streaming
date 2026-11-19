import { cookies } from "next/headers";
import { AdminPanel, PasswordGate } from "../admin-ui";
import { adminCookie, validAdminToken } from "../admin-auth";

export const dynamic = "force-dynamic";

/** The management page: rooms and who is in them, and the lock. Shows the password form until signed in. */
export default async function AdminPage() {
  const signedIn = validAdminToken((await cookies()).get(adminCookie)?.value);
  return signedIn ? <AdminPanel /> : <PasswordGate mode="admin" />;
}
