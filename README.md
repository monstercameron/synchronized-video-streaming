# Screening room

A private place to watch a video together: everyone's picture stays in step, with chat, @-mentions, scrolling emoji
reactions, subtitles, per-person quality, English and Spanish, and a layout made for phones. Next.js 16 (App Router),
Server-Sent Events, HLS and MP4 streaming, and the built-in `node:sqlite` database. Needs **Node 24 or newer**.

```bash
npm install
npm run build && npm run start -- --hostname 0.0.0.0 --port 3000   # then open http://<this computer>:3000
```

Putting it on a server (Nginx, HTTPS, systemd, limits, disk quota): see [deploy/README.md](deploy/README.md).
Handy scripts: `npm run typecheck`, `npm run i18n:check` (English and Spanish texts match), `npm run media:prepare -- <file>`
(make a video browser-ready), `npm run load:test` (see below).

---

# Performance notes

These are measurements, not promises. They were taken on one Windows 11 ARM64 laptop with the load generator running on the
same machine, so absolute numbers on a droplet will differ and the CPU figures carry about ±0.5 s of run-to-run noise.
Compare the numbers to each other, not to a server.

## The load test

`npm run load:test -- <port> <seconds> [rooms] [viewers per room]` (the file is `scripts/load-test.mjs`).
Used here: **5 rooms × 20 viewers = 100 live connections for 25 seconds**. In that time the hosts play and pause every
second, viewers chat about once a second and react about five times a second per room, and about 30 video range requests a
second are made. That is roughly **17,000 events delivered, 840 commands and 690 media requests**, far busier than a real
watch party. Server CPU is the process's CPU seconds during the run; memory is its working set.

## Server CPU and memory

| Version | CPU seconds (25 s run) | Peak memory |
| --- | --- | --- |
| Before this work | 6.61 | 186 MB |
| After the code changes | 5.61 | 187 MB |
| + `--max-old-space-size=160 --max-semi-space-size=2` | 5.86 (a second run: 6.92) | 117 MB (a second run: 109 MB) |
| + `--max-semi-space-size=1` | 6.23 | 114 MB |
| + `--max-old-space-size=128 --max-semi-space-size=1` | 6.31 | 114 MB |

**Reading it:** the code changes took about 15% off the CPU (a bit more than the noise). The memory flags took about 38% off
the peak for roughly 5 to 10% more CPU, because a small young generation makes the garbage collector run more often. The
deployed service uses the 160 MB / 2 MB combination.

**Where the CPU goes now.** A CPU profile of the optimised server under the same load showed the app's own code at only
**1.3%** of the busy time. The rest is Next.js's per-request machinery and writing to sockets. So further gains come from
doing less work *in Node* (static files, compression, video bytes), not from tuning the app code.

### What was changed for CPU

- **Shared work per event.** A play, pause or new member used to be worked out separately for every viewer (several database
  queries and hashing each time). It is now worked out once per change (`sharedState` in `app/room-store.ts`). The parts of
  it that did not change are the very same objects as last time, so comparing two states is a few reference checks.
- **Update messages made once.** The "what changed" message for viewers who are in step is built once and handed to all of
  them (cached on the state it follows). Chat and reaction messages are turned into bytes once, not once per viewer.
  Only a viewer with something of their own to show (someone asking the host to play) gets an individual message.
- **Prepared statements are kept.** SQLite compiles a statement far slower than it runs it, and the same few statements
  ran on every request. `app/db.ts` keeps the compiled ones.
- **No disk flush after every write.** `PRAGMA synchronous = NORMAL` (safe in WAL mode; at worst the last moments before a
  power cut are lost) instead of a flush for every chat message and playback command.
- **Things read on every request are kept in memory** and dropped at exactly the moments they can change: the room's row,
  its member list, which member a session belongs to, the video catalog and what is derived from it, and the real path of
  the media folder. This matters most for HLS, where every segment request is checked.
- **One keep-alive timer** for all open streams instead of one per viewer.
- **Nginx does what it is better at** (see `deploy/`): it serves the app's JavaScript and CSS straight from disk with a year's
  caching, compresses responses (so `COMPRESS=off` stops Node doing it a second time), and sends the video bytes.

### What was changed for memory

- **Nothing in memory grows without limit.** A sweeper (once a minute, `sweep` in `app/room-store.ts`) forgets reaction
  rate counters, "asked to play" requests and pauses for rooms nobody is connected to, and what a person reported about
  their device ten minutes after they leave. The caches above have size limits as a safety net.
- **Node flags and service limits** in `deploy/screening.service`: `--max-old-space-size=160 --max-semi-space-size=2`, and
  systemd `MemoryHigh=320M` / `MemoryMax=420M` so a fault cannot take the whole droplet.
- **No per-viewer copy of the room.** Each connection remembers only a reference to the last shared state it sent.

## Bun: runtime, `--compile` and AOT bytecode

The question was whether running the server on [Bun](https://bun.sh) would help, either as the runtime or as a compiled
single-file executable, with or without ahead-of-time bytecode (`--bytecode`). Bun 1.4.4 (native Windows ARM64, a portable
download that was deleted afterwards) was tried against the same standalone build of the app under Node 26.

### Bun as the runtime: it works, with trade-offs

Built with the opt-in standalone output (`NEXT_STANDALONE=1 NEXT_DIST_DIR=.next-standalone npm run build`, then the
static files copied in) and started with `bun server.js` instead of `node server.js`. `node:sqlite`, the live event streams,
the command routes and the media routes all ran; the load test completed with no errors and the same number of events.
Uploads, the library scan's `ffprobe` spawning and long-running connection drops were **not** exercised.

| | Node 26 | Bun 1.4.4 |
| --- | --- | --- |
| Time until the port accepts connections (median of 5 starts) | 296 ms | 202 ms |
| Time until the home page is served (median of 5) | 474 ms | 403 ms |
| CPU seconds in the 25 s load test (two runs) | 5.81 and 6.25 | 6.58 and 6.14 |
| Peak memory in the load test (two runs) | 183 and 167 MB | 140 and 134 MB |

**Reading it:** Bun starts about 30% faster and uses about 20% less memory out of the box, with CPU that is the same within
the noise (about 5% higher on average). But plain Node with the memory flags above reaches 109 to 117 MB, which is below
Bun's 134 to 140 MB, so Bun's memory advantage disappears once Node is tuned.

(An earlier start-up reading of 4 seconds for Node and 121 seconds for Bun was a measurement artifact of launching a program
for the first time on this machine, not the app. It did not repeat in five timed starts.)

### `bun build --compile`: could not be made to work

Compiling means embedding the program in one executable. It failed in four ways, in order:

1. **Plain compile** of the standalone `server.js`: the bundler cannot resolve `./dev/next-dev-server`,
   `./router-utils/setup-dev-bundler`, `../../lib/upgrade/nudge` and `@opentelemetry/api`. Next's standalone output leaves
   out its development files on purpose, and the bundler follows every `require` whether it is used or not.
2. **With those four stubbed** (they are dev-only or optional): it then cannot resolve `react-dom/server*` and
   `react-server-dom-webpack/client`, which Next maps to its own bundled copies by a build-time alias that Bun's bundler does
   not apply.
3. **With `--packages external`** (embed only the entry file and load `next` from disk): this does compile, to a
   **95.6 MB** executable, and **95.9 MB** with `--bytecode`, but the executable cannot start:
   `Cannot find package 'next' from 'B:\~BUN\root\screening-compiled.exe'`. It looks for packages relative to its own
   embedded root, not the folder it sits in, and setting `NODE_PATH` did not change that.
4. **Bundling from the project root** (so the full `node_modules` is available) failed on the same `react-dom/server`.

So there is **no working compiled build, and therefore no benchmark of one**. For the AOT case there is also nothing to
gain even if it ran: in the only variant that compiles, `--bytecode` precompiles just the tiny entry file, and all of
Next.js's own code is still loaded from disk, so start-up would be unchanged. (Both sizes are almost entirely the embedded
Bun runtime.) Next.js is simply not built to be bundled into a single file; the supported ways to get a small self-contained
deploy are the `standalone` output and, if wanted, a container.

### Recommendation

**Stay on Node 24+ for the droplet.** It is the runtime Next.js 16 supports, it needs `node:sqlite` (which Bun happens to
provide, but that is a moving target), and tuned Node already uses less memory than Bun. Bun is a reasonable thing to try if
start-up time ever matters (`bun server.js` from the standalone build); if you do, re-run `npm run load:test`, and also test
what the load test does not cover (large uploads, many dropped connections, `ffprobe` spawning) before relying on it.

## Re-running the numbers

```bash
# a test server with its own database and a small media folder
SCREENING_DB_PATH=/tmp/load.sqlite MEDIA_DIR=/tmp/loadmedia PORT=3200 node node_modules/next/dist/bin/next start
# in another terminal, while watching that process's CPU time and memory
npm run load:test -- 3200 25 5 20
```

The opt-in standalone build (`NEXT_STANDALONE=1 NEXT_DIST_DIR=.next-standalone npm run build`) writes to its own folder and
does not touch the normal `.next` build.
