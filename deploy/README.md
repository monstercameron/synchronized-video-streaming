# Running the screening room on a DigitalOcean droplet

These files are written for a plain Ubuntu droplet. They have **not been run on a real droplet yet**, so treat the first deploy as a dry run and read each step before pasting it.

Prefer containers? [DOCKER.md](DOCKER.md) runs the same setup from a prebuilt image on GitHub Container Registry.

## What you need

- A droplet (Ubuntu 22.04 or 24.04) and a domain name pointing at it (an `A` record to the droplet IP).
- Node.js **24 or newer** (the app uses the built-in `node:sqlite`).
- Nginx, Certbot and FFmpeg: `sudo apt install nginx ffmpeg snapd` then `sudo snap install --classic certbot`.

## How video reaches viewers

```
phone -> Nginx (HTTPS) -> app (checks room membership) -> "X-Accel-Redirect" -> Nginx sends the file
```

The app never carries the video bytes in production. It only decides who may watch, then tells Nginx to
send the file from `/var/lib/screening/media`. Nginx handles seeking (HTTP Range) and sends files with the
kernel's `sendfile`, so one small droplet can feed several viewers. Nothing in the media folder is
reachable without a valid room session.

## One-time setup

```bash
# 1. A service user and its folders. Data lives outside the release so deploys never touch it.
sudo useradd --system --home /var/lib/screening --shell /usr/sbin/nologin screening
sudo mkdir -p /var/lib/screening/media /opt/screening
sudo chown -R screening:screening /var/lib/screening

# 2. Settings.
sudo cp deploy/screening.env.example /etc/screening.env
sudo chown root:screening /etc/screening.env && sudo chmod 640 /etc/screening.env

# 3. Nginx, in two steps (HTTP first so Certbot can get the certificate, then HTTPS with HTTP/2 and HTTP/3).
sudo cp deploy/screening-http.conf.example /etc/nginx/conf.d/screening-http.conf
sudo mkdir -p /etc/nginx/snippets
sudo cp deploy/screening-locations.conf.example /etc/nginx/snippets/screening-locations.conf
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/screening
sudo sed -i "s/YOUR.DOMAIN/your.real.domain/" /etc/nginx/sites-available/screening
sudo ln -s /etc/nginx/sites-available/screening /etc/nginx/sites-enabled/screening
sudo nginx -t && sudo systemctl reload nginx
sudo certbot certonly --nginx -d your.real.domain
sudo cp deploy/nginx-tls.conf.example /etc/nginx/sites-available/screening
sudo sed -i "s/YOUR.DOMAIN/your.real.domain/g" /etc/nginx/sites-available/screening
sudo nginx -t && sudo systemctl reload nginx

# 3b. Kernel settings for streaming (BBR congestion control and friends).
sudo cp deploy/sysctl-screening.conf.example /etc/sysctl.d/90-screening.conf && sudo sysctl --system

# 4. Firewall.
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw allow 443/udp && sudo ufw enable   # 443/udp is HTTP/3
```

## Deploying a release

Build on a machine with the same OS and CPU type as the droplet (or on the droplet itself), then:

```bash
npm ci && npm run build
sudo rsync -a --delete --exclude .data ./ /opt/screening/current/
sudo chown -R screening:screening /opt/screening
sudo cp deploy/screening.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now screening
journalctl -u screening -f        # watch it start; you should see "Media library: N video(s)"
```

## Getting videos onto the droplet

Any of these. The host's **Video** tab finds them after a tap on **Rescan**.

1. **Upload in the app.** Host opens the Video tab, taps **Upload video**. Works for MP4, WebM, MKV, MOV, plus
   `.srt`/`.vtt` subtitles and a poster image. Limited by `MAX_UPLOAD_GB` and your connection.
2. **Copy files over SSH:** `scp "Movie.mp4" you@droplet:/tmp/` then
   `sudo mv /tmp/Movie.mp4 /var/lib/screening/media/ && sudo chown screening: /var/lib/screening/media/Movie.mp4`.
3. **Prepare on your own computer first** (best for big or awkward files, see below), then use 1 or 2.

Subtitles: name them after the video, `Movie.mp4` + `Movie.en.srt` + `Movie.es.vtt` (the part before the
extension is the language). A poster is `Movie.jpg`. For HLS folders use any `.vtt` files in the folder and `poster.jpg`.

## Making a video browser-ready

Browsers play **H.264 video + AAC audio in an MP4** everywhere. Anything else may not play on every
device. The library shows a badge on each video: *Plays everywhere*, *Some browsers* or *Needs conversion*.

```bash
npm run media:prepare -- "Movie.mkv"                 # MP4: copies video/audio when it can, converts only what it must
npm run media:prepare -- "Movie.mkv" --hls           # adaptive ladder (1080p / 720p / 480p) in a folder
npm run media:prepare -- "Movie.mkv" --max-height 1080 --crf 21   # shrink a 4K file
npm run media:prepare -- "Movie.mkv" --dry-run       # show the ffmpeg commands without running them
```

Run it on your own computer where possible. Re-encoding is heavy and a small droplet will crawl.
Copying (the common case for MKV with H.264) takes seconds.

## Bandwidth: the real limit

Each viewer downloads the whole video at its bitrate. The Video tab shows the bitrate and the total for
the people currently in the room.

| Typical quality   | Per viewer | Per viewer-hour | 8 viewers, 2 hours |
| ----------------- | ---------- | --------------- | ------------------ |
| 720p              | 3 Mb/s     | 1.4 GB          | 22 GB              |
| 1080p             | 8 Mb/s     | 3.6 GB          | 58 GB              |
| 1080p high bitrate | 15 Mb/s   | 6.8 GB          | 108 GB             |
| 4K                | 25 Mb/s    | 11.3 GB         | 180 GB             |

Compare the 8-viewer total with your droplet's monthly transfer allowance (Droplet page, Networking), and
make sure its network speed covers the room's combined Mb/s. If a file's bitrate is higher than your
viewers' connections, use `--max-height 1080` or the `--hls` ladder so they can step down.

## Backups

The database holds rooms and chat, and the videos are the large part. Back up
`/var/lib/screening` (for example a DigitalOcean snapshot, or `rsync` to another machine). The SQLite
file can be copied while the service runs: `sqlite3 /var/lib/screening/screening.sqlite ".backup /tmp/screening.bak"` (needs `sudo apt install sqlite3`).

## Troubleshooting

- **Video shows "could not load"**: open the browser's network tab. A 404 on `/api/rooms/.../media/...`
  means the file was removed or renamed since the last Rescan; a 401 means the session expired (reload).
- **Seeking is slow or playback starts late**: the MP4's index is at the end of the file. The library says so;
  run `npm run media:prepare -- "file.mp4"` to fix it without re-encoding.
- **Updates in the room arrive in bursts**: Nginx is buffering the event stream. Check the
  `proxy_buffering off` location for `/events` in the Nginx file is being used (`nginx -T | grep events`).
- **Upload fails at a certain size**: raise both `client_max_body_size` (Nginx) and `MAX_UPLOAD_GB`.

## Network transport: what is used and why

| Job | Transport | Why |
| --- | --- | --- |
| Room updates (play, pause, chat, reactions) | One streaming HTTP response per viewer (Server-Sent Events) | Rides on the same HTTP/2 or HTTP/3 connection as the page and the video. A WebSocket would need a second connection and its own TLS handshake, and nginx cannot carry WebSockets over HTTP/2. |
| Commands (press play, send chat) | A small POST on that same connection | A few dozen bytes of body. Headers are compressed away after the first request. |
| Video | Plain HTTP Range requests (MP4) or HLS segments, sent by nginx with `sendfile` | The browser handles buffering and seeking. The app does not touch the bytes. |
| Clock sync | Two or three tiny GETs when connecting, then two every minute | Cheap, and the shortest round trip is the one trusted. |

Per-event cost: after connecting, a `state` event contains only the fields that changed (usually the playback
position and a clock reading, about 120 bytes) instead of the member list and the video record again (about 1 KB).
Connecting takes one request, not two. A connection that goes quiet for 35 seconds, or that was quiet when the phone
woke up, is replaced immediately.

**WebTransport and WebSocket are deliberately not used.** WebTransport is not available on every phone browser yet, and
nginx cannot proxy it. If this ever needs sub-10 ms interactive traffic (it does not: a pause that arrives 50 ms late is
corrected by the sync loop), that is the point to reconsider.

HTTP/3 needs nginx 1.25+ built with QUIC. Ubuntu 22.04/24.04 ship older versions, so install from nginx.org:
```bash
curl -fsSL https://nginx.org/keys/nginx_signing.key | sudo gpg --dearmor -o /usr/share/keyrings/nginx.gpg
echo "deb [signed-by=/usr/share/keyrings/nginx.gpg] http://nginx.org/packages/mainline/ubuntu $(lsb_release -cs) nginx" | sudo tee /etc/apt/sources.list.d/nginx.list
sudo apt update && sudo apt install nginx
```
The nginx.org package keeps its sites in `/etc/nginx/conf.d/` and has no `sites-available`: put the server file there as
`screening.conf` instead. Without HTTP/3 everything still works over HTTP/2; delete the lines marked "HTTP/3" in the config.

## Video details from the web (optional)

The host can tap **Find details** (in the Video tab, or in the sheet that opens from the video's title) to have a
language model search the web and fill in the real title, synopsis, cast, rating and sources. Everyone then sees them in
the details sheet, and the video's title in the top bar becomes the found one.

Set these in `/etc/screening.env` (see the example file) and restart the service:

| Setting | Meaning |
| --- | --- |
| `METADATA_API_KEY` | The provider key. Without it the button explains that the feature is off. |
| `METADATA_MODEL` | Model name. Defaults to `gpt-6-luna`. |
| `METADATA_API_BASE` | An OpenAI-compatible endpoint that supports the **Responses API** with its `web_search` tool. Defaults to `https://api.openai.com/v1`. |

Only the file name, length and picture size leave the server, and only when the host taps the button. The answer is
checked and shortened before it is saved (in the database, table `media_meta`), and is only ever shown as plain text.

## Disk space

The media folder is capped at **4 GB in total** (`MEDIA_QUOTA_GB`). Everything in it counts: videos, adaptive
folders, subtitles and posters. The host sees a usage bar in the Video tab; an upload that would not fit is refused
before it starts (and stopped if it grows past what it announced). Each video has a **Delete** button (tap twice) that
removes it with its subtitles and poster, or its whole adaptive folder, and frees the space at once. The video that is
playing cannot be deleted. An adaptive ladder is several times larger than the single file, so with a 4 GB cap prefer
one or the other for long videos.

## Languages

The site is in **English and Spanish**. A first-time visitor is asked which language to use before anything else
(both languages shown at once, their phone's language pre-selected). The choice is kept in a cookie
(`screening-lang`), so the server renders the right language straight away next time. It can be changed at any
time from the join screen or from the video details sheet (tap the title).

All text lives in two files: `app/i18n/en.ts` (the list of keys) and `app/i18n/es.ts`. The compiler refuses a key
that is in one but not the other, and `npm run i18n:check` also verifies that placeholders like `{name}` match and
that every singular `.one` text has its `.other`. The server never sends sentences to the page; it sends a message
code (and values), and the page turns it into the viewer's language. Subtitle language names, dates, times and
numbers (decimal comma in Spanish) come from the browser's own locale data. When the host looks up video details on
the web, the synopsis is requested in the host's language.

To add a language: add its code to `Lang` in `app/i18n/core.ts`, copy `es.ts` to a new file and translate it, and
register it in `catalogs` and `languages`.
