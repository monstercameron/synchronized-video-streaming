#!/usr/bin/env node
// Checks the lock screen and the management API against a running server (one with a throwaway database):
//   ADMIN_PASSWORD=testpw node scripts/admin-check.mjs http://127.0.0.1:3200
// Start that server with the same ADMIN_PASSWORD, and with the lock on (the default).
const base = process.argv[2] ?? "http://127.0.0.1:3200";
const password = process.env.ADMIN_PASSWORD ?? "testpw";
let failures = 0, n = 0;
const check = (name, ok, detail = "") => { n++; if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + detail}`); };

// Every "person" gets its own address so the per-address limits do not interfere.
let counter = 0;
function person() {
  const ip = `10.9.${Math.floor(Math.random() * 200)}.${++counter}`;
  const jar = {};
  const cookie = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
  async function call(path, { method = "GET", body, raw } = {}) {
    const response = await fetch(base + path, {
      method,
      headers: { "X-Forwarded-For": ip, Origin: base, ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie() ? { Cookie: cookie() } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    for (const header of response.headers.getSetCookie?.() ?? []) {
      const [pair] = header.split(";");
      const [k, ...rest] = pair.split("=");
      if (/Max-Age=0/i.test(header)) delete jar[k]; else jar[k] = rest.join("=");
    }
    return raw ? response : { status: response.status, json: await response.json().catch(() => null) };
  }
  return { call, jar, ip };
}

// Room codes carry a tag so the script can be run again against the same server.
const tag = Array.from({ length: 5 }, () => "abcdefghjkmnpqrstuvwxyz"[Math.floor(Math.random() * 23)]).join("");
const guest = person();
const admin = person();
const other = person();

// Start from a locked site whatever state the server was left in (a fresh database is locked already).
{
  const setup = person();
  await setup.call("/api/admin/login", { method: "POST", body: { password } });
  await setup.call("/api/admin", { method: "POST", body: { type: "lock" } });
}

// --- the open/locked check for the lock screen ---
{
  const lockedCheck = await person().call("/api/open");
  const keys = Object.keys(lockedCheck.json ?? {});
  check("anyone can ask whether the site is open, and only that is answered", lockedCheck.status === 200 && lockedCheck.json?.open === false && keys.length === 1, JSON.stringify(lockedCheck));
}

// --- locked by default ---
let r = await guest.call("/api/rooms", { method: "POST", body: { name: "Guest", code: `lockedroom${tag}` } });
check("a guest cannot start a room while locked", r.status === 423, JSON.stringify(r));
// (The language is chosen first, so the page is asked for with a language already saved.)
const page = await (await fetch(base + "/", { headers: { Cookie: "screening-lang=en" } })).text();
check("the page shows the lock screen to a guest", page.includes("gate-card") && !page.includes("room-name") && page.includes("Admin password"), page.slice(0, 120));
r = await admin.call("/api/admin");
check("the admin API is refused without signing in", r.status === 401, JSON.stringify(r));
r = await admin.call("/api/admin", { method: "POST", body: { type: "open" } });
check("opening the site is refused without signing in", r.status === 401, JSON.stringify(r));

// --- password ---
r = await admin.call("/api/admin/login", { method: "POST", body: { password: "not it" } });
check("a wrong password is refused", r.status === 401, JSON.stringify(r));
r = await admin.call("/api/admin/login", { method: "POST", body: { password, open: true } });
check("the right password signs in and opens the site", r.status === 200 && r.json?.open === true, JSON.stringify(r));
check("the sign-in cookie is set", !!admin.jar["screening-admin"]);
r = await person().call("/api/open");
check("the open check says so once the site is open", r.status === 200 && r.json?.open === true, JSON.stringify(r));

// --- open: anyone can use it ---
const pageOpen = await (await fetch(base + "/", { headers: { Cookie: "screening-lang=en" } })).text();
check("the page shows the join form once open", !pageOpen.includes("gate-card") && pageOpen.includes("room-name"), "");
r = await guest.call("/api/rooms", { method: "POST", body: { name: "Guest", code: `movienight${tag}` } });
check("a guest can start a room once it is open", r.status === 201, JSON.stringify(r));
const roomId = r.json?.roomId;
r = await other.call("/api/rooms", { method: "POST", body: { name: "Other", roomId } });
check("another guest can join it", r.status === 201, JSON.stringify(r));

// --- a link to a room that is not open: the page says so up front, within the same limit as joining ---
{
  const visitor = person();
  const link = async id => (await (await fetch(`${base}/?room=${id}`, { headers: { Cookie: "screening-lang=en", "X-Forwarded-For": visitor.ip } })).text());
  check("a link to a room that is open does not say it is gone", /roomGone\W+false/.test(await link(roomId)));
  check("a link to a room that is not open says so", /roomGone\W+true/.test(await link(`nobody${tag}`)));
  const prober = person();
  const probe = async id => /roomGone\W+true/.test(await (await fetch(`${base}/?room=${id}`, { headers: { Cookie: "screening-lang=en", "X-Forwarded-For": prober.ip } })).text());
  const answers = [];
  for (let i = 0; i < 14; i++) answers.push(await probe(`probe${i}${tag}`));
  check("asking about many missing rooms is limited like joining is", answers.slice(0, 10).every(Boolean) && !answers[13], answers.join(","));
  r = await prober.call("/api/rooms", { method: "POST", body: { name: "Prober", roomId: `probe99${tag}` } });
  check("the same limit refuses a join from that address", r.status === 429, JSON.stringify(r));
}

// --- admin gating on files ---
r = await guest.call(`/api/rooms/${roomId}/library/upload?name=a.mp4`, { method: "PUT" });
check("a host who is not the admin cannot upload", r.status === 401 || r.status === 400 || r.status === 403, JSON.stringify(r));
r = await guest.call(`/api/rooms/${roomId}/library`);
check("the library reports admin=false to the host", r.status === 200 && r.json?.admin === false, JSON.stringify(r).slice(0, 200));
const adminRoom = await admin.call("/api/rooms", { method: "POST", body: { name: "Admin", code: `adminroom${tag}` } });
r = await admin.call(`/api/rooms/${adminRoom.json?.roomId}/library`);
check("the library reports admin=true to the signed-in admin", r.status === 200 && r.json?.admin === true, JSON.stringify(r).slice(0, 200));

// --- management ---
r = await admin.call("/api/admin");
const rooms = r.json?.rooms ?? [];
const mine = rooms.find(x => x.id === roomId);
check("the admin sees the rooms and who is in them", r.status === 200 && mine?.members.length === 2, JSON.stringify(r).slice(0, 300));

// An open event stream for "Other", to see the kick arrive.
const events = [];
const streamController = new AbortController();
const streamResponse = await fetch(`${base}/api/rooms/${roomId}/events?since=0`, { headers: { Cookie: other.jar["screening-session"] ? `screening-session=${other.jar["screening-session"]}` : "", "X-Forwarded-For": "10.9.9.9" }, signal: streamController.signal });
const reading = (async () => {
  try {
    const decoder = new TextDecoder();
    for await (const chunk of streamResponse.body) {
      for (const block of decoder.decode(chunk).split("\n\n")) { const m = /^event: (\w+)/m.exec(block); if (m) events.push(m[1]); }
    }
    events.push("(stream ended)");
  } catch { /* aborted */ }
})();
await new Promise(resolve => setTimeout(resolve, 400));
check("the live stream connected", events.includes("snapshot"), events.join(","));

const otherMember = mine?.members.find(m => m.name === "Other");
r = await admin.call("/api/admin", { method: "POST", body: { type: "kick", roomId, memberId: otherMember?.id } });
check("the admin can remove a person", r.status === 200 && !(r.json?.rooms.find(x => x.id === roomId)?.members.some(m => m.name === "Other")), JSON.stringify(r).slice(0, 300));
await new Promise(resolve => setTimeout(resolve, 400));
check("the removed person's stream is told, then ends", events.includes("kicked") && events.includes("(stream ended)"), events.join(","));
r = await other.call(`/api/rooms/${roomId}`);
check("the removed person is no longer in the room", r.status === 401, JSON.stringify(r));

r = await admin.call("/api/admin", { method: "POST", body: { type: "closeRoom", roomId } });
check("the admin can close a room", r.status === 200 && !r.json?.rooms.some(x => x.id === roomId), JSON.stringify(r).slice(0, 200));
r = await guest.call(`/api/rooms/${roomId}`);
check("the closed room is gone for its host", r.status === 401, JSON.stringify(r));

// --- leaving a room by choice ---
const A = person(), B = person(), C = person();
const made2 = await A.call("/api/rooms", { method: "POST", body: { name: "Anna", code: `leaving${tag}` } });
const rid = made2.json?.roomId;
await B.call("/api/rooms", { method: "POST", body: { name: "Ben", roomId: rid } });
await C.call("/api/rooms", { method: "POST", body: { name: "Cy", roomId: rid } });
const seen = [];
let leftData = "";
const abort2 = new AbortController();
const stream2 = await fetch(`${base}/api/rooms/${rid}/events?since=0`, { headers: { Cookie: `screening-session=${B.jar["screening-session"]}`, "X-Forwarded-For": "10.9.8.8" }, signal: abort2.signal });
const reading2 = (async () => {
  try {
    const decoder = new TextDecoder();
    for await (const chunk of stream2.body) {
      for (const piece of decoder.decode(chunk).split("\n\n")) { const m = /^event: (\w+)/m.exec(piece); if (m) { seen.push(m[1]); if (m[1] === "left") leftData = /^data: (.*)$/m.exec(piece)?.[1] ?? ""; } }
    }
    seen.push("(ended)");
  } catch { /* aborted */ }
})();
await new Promise(resolve => setTimeout(resolve, 300));
r = await B.call(`/api/rooms/${rid}`, { method: "POST", body: { type: "leave" } });
check("a person can leave a room, and is told the room is still there", r.status === 200 && r.json?.closed === false, JSON.stringify(r));
await new Promise(resolve => setTimeout(resolve, 300));
check("the person who left is told, then their stream ends", seen.includes("left") && !seen.includes("kicked") && seen.includes("(ended)"), seen.join(","));
check("the left event says the room is still open for others", leftData === JSON.stringify({ last: false }), leftData);
r = await B.call(`/api/rooms/${rid}`);
check("they are no longer in the room", r.status === 401, JSON.stringify(r));
r = await admin.call("/api/admin/login", { method: "POST", body: { password } });
let list = (await admin.call("/api/admin")).json?.rooms.find(x => x.id === rid);
check("the others are still in it", list?.members.length === 2, JSON.stringify(list));
r = await A.call(`/api/rooms/${rid}`, { method: "POST", body: { type: "leave" } });
list = (await admin.call("/api/admin")).json?.rooms.find(x => x.id === rid);
check("when the host leaves, the next person becomes host", r.status === 200 && r.json?.closed === false && list?.members.length === 1 && list.members[0].host === true && list.members[0].name === "Cy", JSON.stringify(list));
r = await C.call(`/api/rooms/${rid}`, { method: "POST", body: { type: "leave" } });
list = (await admin.call("/api/admin")).json?.rooms.find(x => x.id === rid);
check("when the last person leaves, the room is gone, and they are told so", r.status === 200 && r.json?.closed === true && !list, JSON.stringify(list));
abort2.abort(); await reading2;

// --- a pending "Ask host to play" must not outlive the person who asked ---
{
  const host = person(), viewer = person(), watcher = person();
  const asked = await host.call("/api/rooms", { method: "POST", body: { name: "Hosty", code: `asking${tag}` } });
  const askRoom = asked.json?.roomId;
  await viewer.call("/api/rooms", { method: "POST", body: { name: "Viola", roomId: askRoom } });
  await watcher.call("/api/rooms", { method: "POST", body: { name: "Wanda", roomId: askRoom } });
  await viewer.call(`/api/rooms/${askRoom}`, { method: "POST", body: { type: "nudge" } });
  let hostView = (await host.call(`/api/rooms/${askRoom}`)).json;
  check("a viewer's request to play shows the host who asked", hostView?.wantPlay?.names?.includes("Viola"), JSON.stringify(hostView?.wantPlay));
  await viewer.call(`/api/rooms/${askRoom}`, { method: "POST", body: { type: "leave" } });
  hostView = (await host.call(`/api/rooms/${askRoom}`)).json;
  const watcherView = (await watcher.call(`/api/rooms/${askRoom}`)).json;
  check("when that viewer leaves, the request disappears for everyone", !hostView?.wantPlay && !watcherView?.wantPlay, JSON.stringify([hostView?.wantPlay, watcherView?.wantPlay]));
  await viewer.call("/api/rooms", { method: "POST", body: { name: "Viola2", roomId: askRoom } });
  await viewer.call(`/api/rooms/${askRoom}`, { method: "POST", body: { type: "nudge" } });
  const viola2 = (await admin.call("/api/admin/login", { method: "POST", body: { password } }), (await admin.call("/api/admin")).json.rooms.find(x => x.id === askRoom)?.members.find(m => m.name === "Viola2"));
  await admin.call("/api/admin", { method: "POST", body: { type: "kick", roomId: askRoom, memberId: viola2?.id } });
  hostView = (await host.call(`/api/rooms/${askRoom}`)).json;
  check("when that viewer is removed, the request disappears too", !hostView?.wantPlay, JSON.stringify(hostView?.wantPlay));
  await admin.call("/api/admin", { method: "POST", body: { type: "closeRoom", roomId: askRoom } });
}

// --- locking again ---
r = await admin.call("/api/admin", { method: "POST", body: { type: "lock" } });
check("the admin can lock the site", r.status === 200 && r.json?.open === false, JSON.stringify(r).slice(0, 200));
r = await person().call("/api/rooms", { method: "POST", body: { name: "Late", code: `toolate${tag}` } });
check("a new guest is refused again", r.status === 423, JSON.stringify(r));
r = await guest.call("/api/rooms", { method: "POST", body: { name: "Guest", code: `stillhere${tag}` } });
check("a guest without a room is refused again", r.status === 423, JSON.stringify(r));
// Someone already in a room can still come back to it.
const returning = person();
await admin.call("/api/admin", { method: "POST", body: { type: "open" } });
const made = await returning.call("/api/rooms", { method: "POST", body: { name: "Back", code: `returning${tag}` } });
await admin.call("/api/admin", { method: "POST", body: { type: "lock" } });
r = await returning.call("/api/rooms", { method: "POST", body: { name: "Back", roomId: made.json.roomId } });
check("someone already in a room can still return to it while locked", r.status === 201, JSON.stringify(r));

// --- sign out, rate limit ---
r = await admin.call("/api/admin/logout", { method: "POST", body: {} });
r = await admin.call("/api/admin");
check("signing out ends the admin session", r.status === 401, JSON.stringify(r));
const brute = person();
let codes = [];
for (let i = 0; i < 8; i++) codes.push((await brute.call("/api/admin/login", { method: "POST", body: { password: "nope" + i } })).status);
check("wrong passwords are limited per address", codes.includes(429) && codes.slice(0, 5).every(code => code === 401), codes.join(","));
r = await brute.call("/api/admin/login", { method: "POST", body: { password } });
check("while limited, even the right password waits", r.status === 429, JSON.stringify(r));

streamController.abort();
await reading;
console.log(`\n${n - failures}/${n} passed`);
process.exit(failures ? 1 : 0);
