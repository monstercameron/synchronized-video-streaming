# Running the screening room with Docker on a droplet

GitHub builds the image for you every time `main` changes and keeps it in the GitHub Container Registry. On the droplet you
only pull it and start it.

> **What has been run for real:** the [shared-droplet setup](#shared-droplet-nginx-and-other-sites-already-there) (the app container
> behind a droplet's own Nginx) is in use on a real droplet. The two-container setup in steps 2 and 3 (the app plus its own
> Nginx container, with HTTP/3) has not been run on a real server yet: treat a first run of it as a dry run.

```
git push  ->  GitHub Actions: typecheck, build the image  ->  ghcr.io/monstercameron/synchronized-video-streaming
droplet:   docker compose pull && docker compose up -d
```

What runs: the **app** container (Node 24 plus ffmpeg) and an **nginx** container in front of it, which serves the video
files straight from disk after the app has checked who may watch, and speaks HTTPS, HTTP/2 and HTTP/3.
Videos and the database live in a folder on the droplet (`/srv/screening`), not inside the image, so updates never touch them.

## 1. The image (automatic)

[`.github/workflows/docker.yml`](../.github/workflows/docker.yml) runs on every push to `main`: it type-checks, checks the
language files, builds the [`Dockerfile`](../Dockerfile) and publishes:

| Tag | Meaning |
| --- | --- |
| `latest` | the newest `main` |
| `sha-abc1234` | one exact commit (use it to roll back) |
| `latest-bun`, `sha-abc1234-bun`, `1.2.3-bun` | the same, built from `Dockerfile.bun` to run on Bun |
| `1.2.3` | a release, when you push a git tag such as `v1.2.3` |

Pull requests build the image but do not publish it. Only `linux/amd64` is built, which is what DigitalOcean droplets are.

**Make the image pullable.** A package from a new repository starts out private. Either open the package on GitHub
(your profile, Packages, `synchronized-video-streaming`, Package settings) and change its visibility to **Public**, or keep it
private and log in on the droplet with a token that has only the `read:packages` scope:

```bash
echo YOUR_TOKEN | docker login ghcr.io -u monstercameron --password-stdin
```

## 2. One-time droplet setup

On an Ubuntu droplet with Docker installed (`curl -fsSL https://get.docker.com | sudo sh`), and a domain whose `A` record
points at the droplet:

```bash
git clone https://github.com/monstercameron/synchronized-video-streaming.git /opt/screening
cd /opt/screening
cp deploy/docker/env.example .env      # then edit it: ADMIN_PASSWORD, DOMAIN, and optionally the quota and upload limit
sudo mkdir -p /srv/screening/media /var/www/certbot
sudo chown -R 1000:1000 /srv/screening  # the app runs as uid 1000 inside the container
docker compose up -d
```

Open `http://YOUR-DROPLET-IP` on a phone: the room should load over plain HTTP. Open the firewall for 80, 443/tcp and
443/udp (`sudo ufw allow 80,443/tcp && sudo ufw allow 443/udp`).

## 3. HTTPS

```bash
sudo apt install certbot
sudo certbot certonly --webroot -w /var/www/certbot -d YOUR.DOMAIN
sed -i 's/^NGINX_CONF=.*/NGINX_CONF=nginx-tls.conf/' .env
docker compose up -d                    # recreates nginx with the HTTPS config
```

Renewal: Certbot renews on its own timer; tell nginx to pick up the new certificate afterwards with

```bash
echo 'docker compose -f /opt/screening/compose.yaml exec -T nginx nginx -s reload' | sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

## 4. Videos

Put files in `/srv/screening/media` (for example `scp "My Movie.mp4" droplet:/srv/screening/media/`) or upload them as host in the
app, then tap **Rescan** in the Video tab. The image contains ffmpeg, so you can also prepare files on the droplet:

```bash
docker compose run --rm -v "$PWD/incoming:/incoming:ro" app npm run media:prepare -- "/incoming/My Movie.mkv" --hls
```

Preparing a long film uses much more memory than watching one does. If the container is killed, prepare the file on your own
computer and upload the result. Disk is the real limit on a small droplet: `MEDIA_QUOTA_GB` caps the media folder.

## 5. Updating and rolling back

```bash
cd /opt/screening
git pull                                 # only needed when compose.yaml or deploy/docker changed
docker compose pull && docker compose up -d
docker image prune -f                    # clear old images, which take disk space
```

To roll back, set `IMAGE=ghcr.io/monstercameron/synchronized-video-streaming:sha-<older commit>` in `.env` and run
`docker compose up -d`. Back up `/srv/screening/screening.sqlite` (rooms and viewers) if you care about it; it is small.

## Shared droplet (Nginx and other sites already there)

If the droplet already runs its own Nginx on ports 80 and 443 (for example with other sites in front of containers on
localhost ports), do **not** start the Nginx from `compose.yaml`: it would fight for those ports. Run only the app, and let
the host's Nginx be the front door, like your other sites. **Nothing is cloned or built on the droplet**: the image comes from
GitHub, and only two small files are downloaded.

Two images are published: `latest` runs on Node, `latest-bun` runs the same app on the Bun runtime (a standalone build started
with `bun server.js`; it is **not** a compiled single binary, because Next.js cannot be compiled into one, see
[the Bun notes](../notes/performance.md#bun-runtime---compile-and-aot-bytecode)). Pick one with `IMAGE` in `.env`.

```bash
sudo mkdir -p /opt/screening /srv/screening/media && cd /opt/screening
sudo chown -R 1000:1000 /srv/screening
RAW=https://raw.githubusercontent.com/monstercameron/synchronized-video-streaming/main
sudo curl -fsSLO $RAW/compose.shared-host.yaml
sudo curl -fsSL $RAW/deploy/docker/env.example -o .env
sudo nano .env       # ADMIN_PASSWORD (a long random one!), IMAGE, DATA_DIR, MEDIA_QUOTA_GB
sudo docker compose -f compose.shared-host.yaml pull
sudo docker compose -f compose.shared-host.yaml up -d      # the app listens on 127.0.0.1:8110 only

sudo curl -fsSL $RAW/deploy/docker/host-nginx-site.conf.example -o /etc/nginx/sites-available/screening
sudo sed -i 's/YOUR.DOMAIN/watch.example.com/' /etc/nginx/sites-available/screening   # your subdomain
sudo ln -s /etc/nginx/sites-available/screening /etc/nginx/sites-enabled/screening
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d watch.example.com               # HTTPS and the redirect
```

Point an `A` record for the subdomain at the droplet first. Updating is `docker compose -f compose.shared-host.yaml pull &&
docker compose -f compose.shared-host.yaml up -d`. The Nginx that ships with Ubuntu 24.04 has HTTP/2 but not HTTP/3.

## Troubleshooting

- `docker compose logs -f app` shows the app, `docker compose logs -f nginx` shows Nginx.
- **"permission denied" or the database cannot be created:** `/srv/screening` must be owned by uid 1000.
- **Videos do not play but the page loads:** check that `docker compose exec nginx ls /data/media` lists your files. The
  app and nginx share that folder.
- **No videos listed:** the app logs "Media library: N video(s)" at start-up; "ffprobe was not found" would mean a broken
  image, which should not happen because ffmpeg is installed in it.
- **Nginx will not start after switching to HTTPS:** the certificate is not at `/etc/letsencrypt/live/YOUR.DOMAIN/`;
  go back to `NGINX_CONF=nginx-http.conf`, fix the certificate, and switch again.
- **Memory:** the app container is capped at 512 MB (`mem_limit` in `compose.yaml`) and Node's heap at 160 MB; see the
  [performance notes](../notes/performance.md) before changing either.
