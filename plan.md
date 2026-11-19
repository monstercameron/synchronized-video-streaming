# Synchronized Video Streaming Website

## Goal and first release

Build a private, browser-based screening room on the existing DigitalOcean Ubuntu Droplet. A host selects a prepared video and controls playback. Viewers join through an invitation and watch the same video at approximately the same position, with the subtitle track assigned to their viewer profile.

Start with one room, one host, and a capacity test for 8 simultaneous viewers. Android Chrome is the launch target. Test iPhone Safari and Windows Chrome and Edge as secondary targets. This plan assumes prerecorded videos, per-viewer subtitle assignment, and ordinary watch-party synchronization. Confirm the actual peak audience, required sync tolerance, Droplet specs, domain, and available test phones before committing to a launch target. If viewers will be in the same physical room with multiple speakers, validate audible echo separately and agree on a tighter target if needed.

## What people do

- **Host:** Import a prepared video and subtitle files, create a room, assign a track or “Off” to each viewer, and issue viewer invitations. See who's connected, ready, or buffering. Select, play, pause, and seek the video. Changing a viewer's assigned track takes effect without restarting playback.
- **Viewer:** Open an invitation in a regular browser, wait for the video to load, then tap to enable playback and sound. See a clear waiting, buffering, or reconnecting state when appropriate. Control local mute and subtitle visibility while the host controls the shared timeline. Late joiners enter at the current room position.

## Recommended tools and architecture

Use the latest patched Next.js 16 release on Node.js 24 LTS for the first build. Build and run the production bundle on Linux matching the Droplet's CPU architecture. [Next.js support policy](https://nextjs.org/support-policy), [Node.js releases](https://nodejs.org/en/about/previous-releases).

| Component | Tool and role |
| --- | --- |
| Web app | **Next.js App Router and TypeScript.** Render the host and viewer pages with Next.js. Use a client component for the video element, event subscription, and playback corrections. Use Node.js Route Handlers for room commands, viewer status, clock samples, media authorization, and subtitles. |
| Room updates | **Server-Sent Events (SSE) and HTTP.** A same-origin browser `EventSource` receives room and viewer-specific updates. Host commands and viewer status use short HTTP POST requests. Clock sampling uses a small uncached GET request. |
| Video player | **HTML video, hls.js, and native Safari HLS.** Use hls.js on Android Chrome and Windows Chrome and Edge when supported. On iPhone Safari, use the native HLS player with inline playback. |
| Media preparation | **FFmpeg and ffprobe.** Encode and package HLS and convert subtitles on a workstation. Validate codecs, durations, and renditions before uploading finished files to the Droplet. |
| Persistence | **SQLite with better-sqlite3.** Store sessions, invitations, the media catalog, subtitle assignments, and room state in one persistent database. Commit each room change before publishing it. |
| Host login | **Better Auth.** Use its Next.js integration and SQLite database for the host. Provision the host account locally and disable public signup. Viewers redeem per-viewer invitations for separate room sessions. |
| Delivery | **Nginx, Certbot, and systemd.** Nginx handles HTTPS and serves authorized HLS files through an internal redirect. Certbot manages certificate renewal. systemd runs one Next.js server bound to loopback. |
| Test automation | **Playwright.** Use separate browser contexts to exercise host and viewer sessions. Use physical Android phones and an iPhone for media, touch, and background recovery checks. |

Framework and transport references. [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers), [Next.js self-hosting and streaming](https://nextjs.org/docs/app/guides/self-hosting#streaming-and-suspense), [EventSource standard](https://html.spec.whatwg.org/multipage/server-sent-events.html).

Player and deployment references. [hls.js compatibility](https://github.com/video-dev/hls.js#compatibility), [Apple HLS authoring specification](https://developer.apple.com/streaming/hls-authoring-specification-for-apple-devices.html), [Nginx internal locations](https://nginx.org/en/docs/http/ngx_http_core_module.html#internal), [Certbot for Nginx](https://certbot.eff.org/instructions?ws=nginx&os=snap).

Database, login, and testing references. [better-sqlite3](https://github.com/WiseLibs/better-sqlite3), [Next.js native package support](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages), [Better Auth for Next.js](https://better-auth.com/docs/integrations/next), [Better Auth SQLite](https://better-auth.com/docs/adapters/sqlite), [Playwright browser support](https://playwright.dev/docs/browsers).

### How it fits together

- The browser opens one authenticated SSE stream for the room. The app subscribes it and sends a complete snapshot on connect or reconnect. Keep the subscriber registry in the single Node.js process and store authoritative state in SQLite. After a restart, restore the last committed playback anchor as a paused position and wait for the host to resume.
- Send SSE heartbeats about every 15 seconds, set an upstream idle timeout longer than the heartbeat, disable buffering and compression for the event route, and verify that events flush individually through Nginx. Clean up subscribers when connections close and disconnect viewers whose access is revoked. If the app later runs multiple processes, move room broadcasts to shared pub/sub before adding replicas. [EventSource authoring notes](https://html.spec.whatwg.org/multipage/server-sent-events.html#authoring-notes), [Nginx proxy buffering](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_buffering).
- Next.js authorizes media requests by room and asset. It then returns an `X-Accel-Redirect` header so Nginx reads and sends the file. Keep the HLS playlists, their relative segment URLs, and private subtitle requests on the same origin as the web app.
- Start with prepackaged video and files on the Droplet. If ongoing encoding and delivery become the bottleneck, compare a managed HLS service such as Mux against self-hosted delivery. The Next.js room timeline and per-viewer subtitle rules work independently of where the video files are served. [Mux video encoding and delivery](https://www.mux.com/docs/pricing/video).

## Video and client-specific subtitles

1. Prepare standard HLS video-on-demand packages with H.264 video, AAC-LC stereo audio, fMP4 segments, and 480p and 720p renditions. Start with approximately six-second segments and aligned keyframes and segment boundaries. Validate both renditions share the same media timeline. Use a master playlist for adaptive quality and version each published package so a room always refers to a stable asset.
2. Convert SRT inputs to UTF-8 WebVTT and validate cue timing against that asset's playback timeline. Track records include asset, label, language, and file reference. A room stores one assignment per viewer and video. Use an external HTML text track so subtitles follow the local video's position through seek and buffering. Keep personalized tracks out of the shared HLS playlist.
3. Issue a separate expiring, revocable invite for each viewer. Redeem it for a secure session cookie and remove the invite from the address bar. Use the viewer session to choose the subtitle file server-side. Expose a same-origin subtitle endpoint that returns only that viewer's assigned track and uses `Cache-Control: private, no-store`. When the assignment changes, tell the affected viewer to refresh its track and remove stale cues. Check room membership and active asset on playlist and segment requests, including direct requests to child playlists and initialization files.

Media references. [FFmpeg HLS muxer](https://ffmpeg.org/ffmpeg-formats.html#hls-2), [HTML video and text tracks](https://html.spec.whatwg.org/multipage/media.html).

## Playback synchronization

- **Authoritative timeline.** Each room update carries the asset ID, revision, playback state, anchor position in seconds, and server timestamp when the anchor takes effect. When playing, the target position is the anchor plus elapsed server time, clamped to the video duration. When paused, the anchor stays fixed. Clients ignore older revisions. Each new connection receives the full current state, including any pending transition.
- **Clock and commands.** Estimate server time from several short, uncached HTTP round trips to the clock endpoint. Use the browser's monotonic clock for elapsed time and favor lower-latency samples. Refresh the estimate periodically and on reconnect. Schedule play roughly a second ahead so ready browsers can start together. Include the effective timestamp in pause and seek updates. Apply overdue updates immediately at the calculated target position. If the host issues another command before a transition takes effect, the newer revision supersedes it and the current active state remains available until the new transition.
- **Device recovery.** Mount the same inline player before the viewer taps. Call `play()` from the tap handler when the media is ready and show a clear tap-to-resume control if the browser rejects a later play request. Reconcile after metadata loads, a seek completes, buffering clears, or the phone returns to the foreground. Let EventSource reconnect and wait for the fresh room snapshot before applying updates. Refresh the clock estimate after the app has been in the background. A stalled viewer catches up independently.
- **Drift correction.** As starting settings, ignore drift under 250 ms, try a temporary 0.95–1.05× playback rate for moderate drift, and seek for drift above 750 ms or persistent errors. Reset the rate to 1× once aligned, paused, or seeking. Use seeks on devices where rate changes are ineffective. Skip repeated corrections while a seek is in flight or the player is stalled. Measure and tune these thresholds on real phones.

Browser behavior references. [WebKit inline video and playback policies](https://webkit.org/blog/6784/new-video-policies-for-ios/), [HTML media timeline and playback rate](https://html.spec.whatwg.org/multipage/media.html).

## Droplet deployment and capacity

- Check Ubuntu release, vCPU, RAM, free disk, current network usage, and included transfer. Point a domain at the Droplet. Set up HTTPS with automatic renewal. Build the standalone Next.js bundle on matching Linux or in Linux CI, include its static assets, and run it on loopback under a dedicated systemd account. Store data and media outside the versioned release directory.
- Transfer packaged media into a staging directory, validate it, then publish it atomically. Keep media outside the public web root and disable directory listing. Protect the host account, check host permissions and request origin for room commands, and validate room membership before opening an event stream or authorizing media. Keep invite secrets out of logs. Back up SQLite and the media catalog and document how to restore them. [Next.js standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output#automatically-copying-traced-files).
- At **2.5 Mb/s total per viewer**, eight viewers average **20 Mb/s** and use about **9 GB (8.4 GiB) per hour** combined, before protocol overhead, retries, or buffering bursts. Measure peak throughput, CPU, memory, errors, and actual transfer during a test session. Scale from the measured concurrency and transfer allowance. If storage or egress becomes the bottleneck, evaluate object storage or a CDN that supports private media delivery, and keep personalized subtitles on the app origin. DigitalOcean Spaces presigned requests bypass its CDN cache. [DigitalOcean bandwidth billing](https://docs.digitalocean.com/platform/billing/bandwidth/), [Spaces CDN behavior](https://docs.digitalocean.com/products/spaces/how-to/enable-cdn/).

## Implementation plan

Work through the milestones in order. Each milestone ends with a check that the next one depends on.

### 1. Scaffold the app and prepare a test video

- [ ] Initialize a Next.js App Router project with TypeScript and a committed dependency lockfile. Create the host dashboard and mobile-first viewer page. Keep the media and database directories configurable and outside the public web root.
- [ ] Add a repeatable FFmpeg packaging command and a validation step. Prepare a short timecoded video at 480p and 720p, with two clearly distinguishable WebVTT tracks. Add a local command to register a finished media package in the catalog.
- **Done when** the app builds for production and the test package has a playable master playlist, aligned variants, and two tracks that match the video timeline.

### 2. Add access control and prove Android playback

- [ ] Add migrations for the media catalog, tracks, rooms, viewers, invitations, sessions, subtitle assignments, and room playback state. Set up the host login and an invite redemption screen with an explicit join action. Bind every viewer session to one room and one viewer profile.
- [ ] Add authenticated HLS and subtitle routes. Use the viewer session to resolve the assigned track. Return only its cues and keep its response out of caches. Add a staging HTTPS endpoint on the Droplet with Nginx so the Android check uses the production-style delivery path.
- [ ] Wire the viewer's inline video player, tap-to-start behavior, local mute, and subtitle toggle. Show waiting, buffering, and playback error states.
- **Done when** two Android phones play the same test video over HTTPS and show different tracks at the same timestamp. An unauthenticated browser cannot fetch a playlist or segment. Copying a subtitle URL into the other viewer's session never reveals the first viewer's cues.

### 3. Implement the room clock and host controls

- [ ] Add the server-side room state machine. Keep one committed revision per update and one pending transition when needed. Make repeated host commands safe to retry, and ignore stale snapshots or transitions on the viewer.
- [ ] Add a room event stream, a clock probe, and host commands for load, play, pause, and seek. Send the full room state on every connect. Keep viewer-only updates scoped to that session. Report viewer readiness and buffering to the host.
- [ ] Add the viewer sync loop. Estimate server time, apply commands at their effective timestamps, and correct playback drift. Reconcile after seeks, stalls, reconnects, and returning to the foreground. Use an immediate user gesture to recover when a browser blocks playback.
- **Done when** play, pause, seek, and a video change propagate to both Android phones. A third browser can join mid-video and catch up. Rapid host commands converge on the latest room state, subtitle reassignment works during play, and restarting the service restores the room in a paused state.

### 4. Test secondary platforms and failure cases

- [ ] Use Playwright with separate host and viewer sessions to test invitations, subtitle isolation, revocation, late join, and reconnect. Include direct requests for HLS variants, initialization files, and segments.
- [ ] Test on physical Android phones, iPhone Safari, and Windows Chrome and Edge. Cover Wi-Fi and cellular, phone lock and unlock, stalled playback, and changing video and subtitles mid-session. Record the browser and OS versions alongside results.
- **Done when** the Android flow passes end to end. Record iPhone and Windows results separately and mark any device-specific limitations in the release notes.

### 5. Deploy and run the Droplet pilot

- [ ] Confirm the Droplet's architecture, free disk, memory, transfer allowance, domain, and SSH access. Publish the standalone Linux build behind Nginx and systemd. Keep database and media across releases. Verify certificate renewal, service restart, and a database restore before launch.
- [ ] Run a 30-minute session with eight concurrent viewers, including at least two physical Android phones and one cellular connection. Use the timecoded clip and synchronized telemetry to measure pairwise playback skew. Record usage, stalls, reconnects, CPU, memory, peak outbound throughput, and transfer.
- **Done when** foreground viewers ready to play stay within **500 ms of one another at the 95th percentile** during steady playback. After seek, reconnect, or a stall, a viewer should return within 500 ms of the room within **5 seconds of becoming ready**. Track startup and stalled time separately. Confirm the tested workload fits the Droplet's measured capacity before expanding attendance.

## Inputs needed for deployment

Local development can begin with the test video. Before staging or launch, confirm the Droplet and domain, the highest expected viewer count, and the video and subtitle files for the first session. Confirm whether viewers will share a physical space. If several devices will play audio in the same room, test audible echo with that setup before accepting the default 500 ms target.
