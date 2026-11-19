import { ScreeningRoom } from "./screening-room";
import { normalizeRoomId } from "./room-shared";

export default async function Home({ searchParams }: { searchParams: Promise<{ room?: string | string[] }> }) {
  const { room } = await searchParams;
  return <ScreeningRoom initialRoom={typeof room === "string" ? normalizeRoomId(room) || undefined : undefined} />;
}
