# Deploying GymStreak to AWS EC2 (cheap single-instance setup)

One small EC2 instance runs the whole stack via Docker Compose: Postgres,
Redis, Django (gunicorn), a Celery worker, Next.js, and Caddy as the single
public entrypoint. GitHub Actions builds both app images on push to `main`,
pushes them to GHCR (GitHub's free container registry), and tells the server
to pull + restart. You only ever visit one URL — Caddy serves the frontend
and transparently proxies `/api`, `/admin`, `/static` to the backend behind
it, so the backend is never exposed on its own port.

**Cost**: on a new AWS account, this runs at **$0/month for the first 12
months** (EC2 t3.micro + EBS free tier). After that, roughly **$9-10/month**
(≈$7.50 for the instance, ≈$1.60 for a 20GB disk). GHCR and Actions minutes
are free for this usage level; email (Resend) has a free tier too.

---

## 1. Launch the EC2 instance

In the AWS Console → EC2 → **Launch instance**:

- **Name**: `gymstreak`
- **AMI**: Ubuntu Server 22.04 LTS (HVM), SSD Volume Type — x86_64 (this
  matters: GitHub's runners build x86_64 images, so the server needs to
  match; don't pick an ARM/Graviton `t4g` type unless you also switch to
  multi-arch builds)
- **Instance type**: `t3.micro` (free-tier eligible; use `t2.micro` if
  that's what your account's free tier covers instead — check the "Free
  tier eligible" badge next to each type)
- **Key pair**: create a new one, download the `.pem` file, keep it safe —
  you can't re-download it later
- **Network settings** → Edit:
  - Allow SSH (22) from **My IP** only (not "Anywhere" — you don't want the
    whole internet SSH-brute-forcing your box)
  - Allow HTTP (80) from **Anywhere**
  - Allow HTTPS (443) from **Anywhere** (only matters once you add a
    domain, but fine to open now)
  - Nothing else needs to be open — Postgres/Redis/Django/Next.js are never
    published to the host, only reachable inside Docker's internal network
- **Storage**: bump to **20 GiB** gp3 (still inside the free-tier 30GB
  allowance)

Launch it, wait for it to reach "Running", and note its **Public IPv4
address**.

## 2. Allocate an Elastic IP (so the address doesn't change on reboot)

EC2 → **Elastic IPs** → Allocate → then **Associate** it with the instance
you just launched. It's free as long as it stays attached to a running
instance. Use this IP everywhere below instead of the instance's normal
public IP (which changes if the instance ever stops/restarts).

## 3. SSH in and bootstrap the server

```bash
chmod 400 ~/Downloads/gymstreak.pem
ssh -i ~/Downloads/gymstreak.pem ubuntu@<your-elastic-ip>
```

Install Docker (includes the `docker compose` plugin):

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
exit   # log back in so the group change takes effect
ssh -i ~/Downloads/gymstreak.pem ubuntu@<your-elastic-ip>
```

Add swap — a 1GB instance running six containers has no slack, and without
swap a memory spike (e.g. during `collectstatic` on first boot) can get a
container OOM-killed instead of just slowing down:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Create the deploy directory and a real `.env` (this is the *only* file that
lives solely on the server — never committed, never copied by CI):

```bash
mkdir -p ~/gymstreak && cd ~/gymstreak
nano .env   # paste the contents of .env.prod.example from the repo, filled in for real
```

Fill in at minimum: `IMAGE_API` / `IMAGE_WEB` (lowercase
`ghcr.io/<your-github-username>/<repo-name>-api`/`-web`, tag `:latest`),
a generated `DJANGO_SECRET_KEY`, a strong `POSTGRES_PASSWORD`,
`DJANGO_ALLOWED_HOSTS` (your Elastic IP), `FRONTEND_URL` and
`CORS_ALLOWED_ORIGINS` (`http://<your-elastic-ip>`), and Resend credentials
if you want invite/OTP emails to actually send (see `.env.prod.example` for
the full list and generation commands).

## 4. Make the GHCR images pullable

The first push from CI (step 6 below) creates two GHCR packages named
`<repo>-api` and `<repo>-web` under your GitHub account. By default they're
private, which means the server needs to authenticate to pull them. The
simplest fix — do this once, right after the first CI run:

GitHub → your profile → **Packages** → open each of the two new packages →
**Package settings** → **Change visibility** → **Public**.

(If you'd rather keep them private: on the server run
`docker login ghcr.io -u <username> -p <a GitHub PAT with read:packages>`
instead — a bit more to manage, so public is the easier default for a
project like this with no sensitive code in the image itself.)

## 5. Add GitHub repo secrets and variables

Repo → **Settings** → **Secrets and variables** → **Actions**:

**Secrets** (tab: Secrets):
| Name | Value |
|---|---|
| `EC2_HOST` | your Elastic IP |
| `EC2_USER` | `ubuntu` |
| `EC2_SSH_KEY` | the full contents of the `.pem` file you downloaded in step 1 |

**Variables** (tab: Variables):
| Name | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `http://<your-elastic-ip>` (or `https://yourdomain.com` once you add one — see below) |

`NEXT_PUBLIC_API_URL` gets baked into the frontend's JS at build time, so it
has to be set here (where the image is built), not just in the server's
`.env`. It must match whatever address the browser will actually use, since
Caddy proxies `/api/*` on that same origin to Django.

## 6. Deploy

Push to `main` (or run the workflow manually from the Actions tab). Watch it
in the **Actions** tab — it builds both images, pushes them to GHCR, copies
`docker-compose.prod.yml` and `Caddyfile` to the server, then pulls and
restarts.

First run takes a few minutes (installing images, running migrations,
`collectstatic`). After that, visit `http://<your-elastic-ip>` — you should
see the landing page, and `/admin` should reach the Django admin.

If something looks wrong, SSH in and check:

```bash
cd ~/gymstreak
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f web
docker compose -f docker-compose.prod.yml logs -f caddy
```

## 7. Create a platform admin (optional)

Either set `DJANGO_SUPERUSER_EMAIL`/`DJANGO_SUPERUSER_PASSWORD` in `.env`
before the first deploy (bootstrapped automatically on boot), or run it
manually any time:

```bash
cd ~/gymstreak
docker compose -f docker-compose.prod.yml exec web python manage.py createsuperuser
```

## 8. Adding a real domain + HTTPS later (optional, trivial)

1. Point the domain's DNS **A record** at your Elastic IP.
2. On the server, edit `~/gymstreak/Caddyfile`: replace `:80` with your
   domain (e.g. `gymstreak.example.com {`), and uncomment the `email`
   block at the top with your real email. Run
   `docker compose -f docker-compose.prod.yml restart caddy` — Caddy
   automatically provisions and renews a Let's Encrypt certificate, no
   other setup needed.
3. Update the `NEXT_PUBLIC_API_URL` GitHub variable and `.env`'s
   `DJANGO_ALLOWED_HOSTS`/`FRONTEND_URL`/`CORS_ALLOWED_ORIGINS` to the new
   `https://` domain, flip `SECURE_SSL_REDIRECT`/`SESSION_COOKIE_SECURE`/
   `CSRF_COOKIE_SECURE` to `True` and `SECURE_HSTS_SECONDS` to something
   like `31536000`, then push to redeploy (or just restart the `web`
   service after editing `.env` directly on the server).

## Day-2 notes

- **Backups**: `docker compose -f docker-compose.prod.yml exec db pg_dump -U gymstreak gymstreak > backup.sql` — there's no automated backup here; for a real deployment, cron this to S3 or switch `db` to RDS later.
- **Logs**: `docker compose -f docker-compose.prod.yml logs -f <service>`.
- **Rolling back**: every image is also tagged with the git SHA (not just
  `latest`) — set `IMAGE_API`/`IMAGE_WEB` in `.env` to a specific `:<sha>`
  tag and re-run `docker compose -f docker-compose.prod.yml up -d` to pin
  a previous build.
- **Rebuild-avoidance**: `celery_beat` is intentionally left out of
  `docker-compose.prod.yml` since nothing is scheduled today
  (`CELERY_BEAT_SCHEDULE = {}`) — add it back the same way it's defined in
  the dev `docker-compose.yml` if you introduce a periodic task.
