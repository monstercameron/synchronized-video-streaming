// Load test for the server: ROOMS rooms x PER viewers, each viewer holding a live event stream, while the hosts play/pause, viewers chat and
// react, and media is requested. Prints what the clients saw; the caller measures the server's CPU and memory around it.
//   node scripts/load-test.mjs <port> <seconds> [rooms=5] [per=20]
// Point it at a TEST server (it creates rooms and members), ideally started with its own SCREENING_DB_PATH and a MEDIA_DIR that
// holds at least one small video. Measure the server process's CPU time and memory around the run (see README.md).
const port = process.argv[2] ?? "3200", seconds = Number(process.argv[3] ?? 25), ROOMS = Number(process.argv[4] ?? 5), PER = Number(process.argv[5] ?? 20);
const base = `http://127.0.0.1:${port}`;
let ipCounter = 0;
const ip = () => `10.${Math.floor(ipCounter / 60000) % 250}.${Math.floor(ipCounter / 250) % 250}.${(ipCounter++ % 250) + 1}`;
const json = (cookie, extra = {}) => ({ "Content-Type": "application/json", Origin: base, "X-Forwarded-For": ip(), ...(cookie ? { Cookie: cookie } : {}), ...extra });

async function join(name, body) {
  const r = await fetch(base + "/api/rooms", { method: "POST", headers: json(), body: JSON.stringify({ name, ...body }) });
  if (!r.ok) throw new Error("join failed " + r.status + " " + await r.text());
  return { cookie: r.headers.get("set-cookie").split(";")[0], id: (await r.json()).roomId };
}

const stats = { events: 0, bytes: 0, snapshots: 0, states: 0, chats: 0, reactions: 0, commands: 0, commandErrors: 0, media: 0, mediaBytes: 0, mediaErrors: 0 };
const stop = new AbortController();
const rooms = [];

for (let r = 0; r < ROOMS; r++) {
  const host = await join("Host" + r, { code: "load" + r + Date.now().toString(36).slice(-4) });
  const members = [host];
  for (let i = 1; i < PER; i++) members.push(await join("V" + r + "_" + i, { roomId: host.id }));
  rooms.push({ id: host.id, host, members });
}

// Every viewer holds a live stream and just reads it.
async function listen(room, member) {
  try {
    const res = await fetch(`${base}/api/rooms/${room.id}/events?since=0`, { headers: { Cookie: member.cookie, "X-Forwarded-For": ip() }, signal: stop.signal });
    const decoder = new TextDecoder(); let buffer = "";
    for await (const chunk of res.body) {
      stats.bytes += chunk.length;
      buffer += decoder.decode(chunk, { stream: true });
      let i;
      while ((i = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, i); buffer = buffer.slice(i + 2);
        const m = /^event: (\w+)/m.exec(block); if (!m) continue;
        stats.events++;
        if (m[1] === "snapshot") stats.snapshots++; else if (m[1] === "state") stats.states++; else if (m[1] === "chat") stats.chats++; else stats.reactions++;
      }
    }
  } catch { /* aborted at the end */ }
}
for (const room of rooms) for (const member of room.members) void listen(room, member);
await new Promise(r => setTimeout(r, 2500)); // let every stream connect

const command = async (room, member, body) => {
  stats.commands++;
  const r = await fetch(`${base}/api/rooms/${room.id}`, { method: "POST", headers: json(member.cookie), body: JSON.stringify(body) }).catch(() => ({ ok: false }));
  if (!r.ok && r.status !== 204) stats.commandErrors++;
};
const mediaProbe = async (room, member) => {
  const media = (await (await fetch(`${base}/api/rooms/${room.id}`, { headers: { Cookie: member.cookie } })).json()).media;
  return media && `${base}/api/rooms/${room.id}/media/${media.id}/file?v=${media.version}`;
};
const urls = [];
for (const room of rooms) urls.push(await mediaProbe(room, room.members[1]));

const end = Date.now() + seconds * 1000;
const timers = [];
// Hosts: play, then pause, once a second per room.
rooms.forEach((room, index) => { let playing = false; timers.push(setInterval(() => { playing = !playing; void command(room, room.host, { type: playing ? "play" : "pause" }); }, 1000 + index * 37)); });
// Viewers: chat about once a second per room, react about 5 times a second per room, some health reports.
rooms.forEach((room, index) => {
  timers.push(setInterval(() => void command(room, room.members[1 + Math.floor(Math.random() * (PER - 1))], { type: "chat", text: "message " + Math.random().toString(36).slice(2, 10) }), 1000));
  timers.push(setInterval(() => void command(room, room.members[1 + Math.floor(Math.random() * (PER - 1))], { type: "react", emoji: "🔥" }), 200));
});
// Media: about 30 range requests a second overall, like a few viewers pulling segments.
timers.push(setInterval(async () => {
  const room = rooms[Math.floor(Math.random() * rooms.length)];
  const url = urls[rooms.indexOf(room)]; if (!url) return;
  const start = Math.floor(Math.random() * 500000);
  try {
    const r = await fetch(url, { headers: { Cookie: room.members[2].cookie, Range: `bytes=${start}-${start + 65535}` } });
    stats.media++; stats.mediaBytes += (await r.arrayBuffer()).byteLength; if (r.status >= 400) stats.mediaErrors++;
  } catch { stats.mediaErrors++; }
}, 33));

await new Promise(r => setTimeout(r, end - Date.now()));
timers.forEach(clearInterval);
await new Promise(r => setTimeout(r, 800));
stop.abort();
console.log(JSON.stringify({ viewers: ROOMS * PER, seconds, ...stats, mediaMB: Math.round(stats.mediaBytes / 1e5) / 10, streamKB: Math.round(stats.bytes / 1024) }));
process.exit(0);
