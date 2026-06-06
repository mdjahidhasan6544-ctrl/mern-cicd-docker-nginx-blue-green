# CLAUDE.md — Project Guide for AI Assistants

> Context for Claude (or any AI coding assistant) working on this repository.
> Read this first before making changes.

---

## 📦 Project Overview

**MERN stack** application (MongoDB + Express + React/Vite + Node.js) with a
fully automated **DevSecOps CI/CD pipeline**.

- **Frontend:** React / Vite (Dockerized, served via internal NGINX)
- **Backend:** Node.js + Express (Dockerized)
- **Database:** MongoDB Atlas (cloud-hosted)
- **Image Registry:** Docker Hub
- **Hosting:** AWS EC2 (Ubuntu)
- **Reverse Proxy / Blue-Green switcher:** NGINX on the same EC2
- **CI/CD:** GitHub Actions (self-hosted runner not required — uses `ubuntu-latest`)

---

## 🗂️ Repository Layout

```
.
├── .github/
│   └── workflows/
│       └── cicd.yml            # ← Main CI/CD pipeline (4 jobs: ci, build, deploy, rollback)
├── backend/                    # Node.js + Express API
│   ├── Dockerfile
│   ├── package.json
│   └── src/                    # API routes, controllers, models
├── frontend/                   # React / Vite SPA
│   ├── Dockerfile
│   ├── nginx.conf              # Internal NGINX (inside frontend container)
│   ├── package.json
│   └── src/
├── docker-compose.blue.yml     # Blue env — ports 8080 (FE) / 5000 (BE)
├── docker-compose.green.yml    # Green env — ports 8081 (FE) / 5001 (BE)
├── sonar-project.properties.example  # Reference SonarQube config
└── CLAUDE.md                   # ← this file
```

The workflow uses **`${{ github.workspace }}`** as the working root, so
`./backend` and `./frontend` are the canonical paths the pipeline expects.

---

## 🚀 The CI/CD Pipeline (`.github/workflows/cicd.yml`)

### Triggers
- Push to `main` or `develop`
- Pull request targeting `main`
- Manual `workflow_dispatch`

### Jobs (in order)

| # | Job          | Purpose                                                                                  |
|---|--------------|------------------------------------------------------------------------------------------|
| 1 | `ci`         | SonarQube scan, OWASP dependency check, Trivy filesystem scan (fail on HIGH/CRITICAL)    |
| 2 | `build`      | Build & push Docker images (`latest` + `sha-${GITHUB_SHA}`), then Trivy image scan       |
| 3 | `deploy`     | SSH to EC2, deploy the **target** env (blue or green), health check, NGINX switch, promote `stable` tag |
| 4 | `rollback`   | Runs only on deploy failure — pulls `:stable` images, restores the previous working env |

### Blue/Green Strategy
- **Blue** listens on `127.0.0.1:8080` (frontend) and `127.0.0.1:5000` (backend)
- **Green** listens on `127.0.0.1:8081` (frontend) and `127.0.0.1:5001` (backend)
- The host NGINX (`/etc/nginx/sites-available/mern-app`) has two `upstream` blocks
  whose ports are rewritten in-place by `sed` to flip the active color
- The deploy job **alternates** target env per run (state tracked in
  `/home/$USER/deploy/.active_env` on the EC2)

### Image Tagging Strategy
| Tag            | When set                                              |
|----------------|-------------------------------------------------------|
| `latest`       | Every push (overwritten)                              |
| `sha-${SHA}`   | Every push (immutable per commit)                     |
| `stable`       | **Only after** successful deploy + health check       |

### Secrets Required (set in GitHub → Settings → Secrets and variables → Actions)
- `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`
- `DOCKER_IMAGE` (e.g. `myuser/mern-app` — workflow appends `-frontend`/`-backend`)
- `AWS_HOST`, `AWS_USER`, `AWS_SSH_PRIVATE_KEY`
- `MONGODB_URI`, `JWT_SECRET`, `NODE_ENV`, `SERVER_PORT`
- `SONAR_HOST_URL`, `SONAR_TOKEN`
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`

The `ci` job **fail-fasts** with a clear error if any required secret is missing.

---

## 🖥️ EC2 Runtime Contract

The pipeline assumes the EC2 has **only** what's listed below. It does **not**
install Docker, NGINX, or anything else.

### Filesystem
- `/home/$USER/deploy/` — holds compose files, `.env`, and state files
- `/etc/nginx/sites-available/mern-app` — site config (workflow bootstraps on first run)
- `/etc/nginx/sites-enabled/mern-app` — symlink (operator must create manually)
- `/etc/nginx/sites-enabled/default` — must NOT exist (operator must remove)

### State Files in `/home/$USER/deploy/`
| File              | Contents                                     |
|-------------------|----------------------------------------------|
| `.env`            | Injected secrets (`chmod 600`)               |
| `.active_env`     | `blue` or `green` — currently serving        |
| `.stable_tag`     | Last successful image tag (e.g. `sha-abc123` or `stable`) |
| `.target_env`     | Last deploy target                           |
| `.health`         | Marker written on health check pass          |

For a clean first deploy, pre-seed:
```bash
echo "blue"   > /home/ubuntu/deploy/.active_env
echo "stable" > /home/ubuntu/deploy/.stable_tag
```

### Required Passwordless Sudo Commands
The workflow's `sudo` invocations **must** succeed without a password. Add to
`/etc/sudoers.d/github-actions`:
```
<AWS_USER> ALL=(ALL) NOPASSWD: /usr/sbin/nginx
<AWS_USER> ALL=(ALL) NOPASSWD: /bin/sed -i * /etc/nginx/sites-available/mern-app
<AWS_USER> ALL=(ALL) NOPASSWD: /bin/cp * /etc/nginx/sites-available/mern-app.bak
<AWS_USER> ALL=(ALL) NOPASSWD: /bin/systemctl reload nginx
<AWS_USER> ALL=(ALL) NOPASSWD: /usr/bin/tee /etc/nginx/sites-available/mern-app
<AWS_USER> ALL=(ALL) NOPASSWD: /usr/bin/ln -sf /etc/nginx/sites-available/mern-app /etc/nginx/sites-enabled/mern-app
<AWS_USER> ALL=(ALL) NOPASSWD: /bin/rm -f /etc/nginx/sites-enabled/mern-app
<AWS_USER> ALL=(ALL) NOPASSWD: /bin/rm -f /etc/nginx/sites-enabled/default
<AWS_USER> ALL=(ALL) NOPASSWD: /bin/chmod 644 /etc/nginx/sites-available/mern-app
```

### Health Check Contract
The pipeline calls `GET /api/health` on the **target** env's backend port.
The backend **must** return:
- HTTP `200`
- A response body containing `ok`, `healthy`, or `success` (case-insensitive)

If either is missing, health check fails and rollback triggers.

---

## 🛠️ Conventions for AI Assistants

### When modifying the workflow
- The pipeline is the **single source of truth** for the deploy process. Avoid
  duplicating logic into shell scripts outside the workflow unless asked.
- Preserve the four-job structure (`ci`, `build`, `deploy`, `rollback`).
- Never echo secrets to logs. Use `::add-mask::` or rely on GitHub's auto-masking
  of `${{ secrets.* }}` references.
- New SSH steps must continue to use `appleboy/ssh-action@v1` and reuse
  `webfactory/ssh-agent@v0.9.0` for key handling.
- Blue/green port mapping is **load-bearing**. If you change `docker-compose.{blue,green}.yml`
  port mappings, update the `sed` substitutions in the `deploy` and `rollback` jobs
  in lockstep.
- Self-bootstrap logic for the NGINX config is in two places (deploy + rollback).
  Keep them in sync.

### When modifying `docker-compose.{blue,green}.yml`
- The **only difference** between the two files is the host port mapping
  (blue: 5000/8080, green: 5001/8081) and the network name.
- Container-internal ports (`5000` and `80`) must stay the same — that's what
  the Dockerfiles expose.
- Environment variables come from `/home/$USER/deploy/.env` via `${VAR}` substitution.

### When modifying Dockerfiles
- The workflow builds from `./frontend/Dockerfile` and `./backend/Dockerfile`.
  Keep these paths stable.
- `provenance: false` is set in the build action — don't re-enable SBOM/provenance
  without considering image tag implications.

### When adding a new secret
1. Add it to the `validate-secrets` step in the `ci` job (so missing-secret failures are loud).
2. Reference it only via `${{ secrets.NEW_SECRET }}`.
3. If it's injected into the EC2 `.env`, also append it to the `Create Remote .env File` step.

### When adding a new deployment stage
- Update both `deploy` and `rollback` jobs in lockstep.
- Health check URLs must reflect the **target env's** port, not a fixed port.

---

## 🧪 Local Development (outside the pipeline)

The `docker-compose.yml` at the repo root (not the blue/green ones) is the
**local dev** composition. It binds directly to localhost without NGINX.
Use it with:
```bash
docker compose up --build
```

Do **not** use the blue/green compose files locally — they expect a `.env` file
in `/home/$USER/deploy/` that only exists on the EC2.

---

## 🚫 Things to Avoid

- ❌ Adding AWS Load Balancer / S3 / external state — pipeline is intentionally
  GitHub + EC2 + Docker Hub only.
- ❌ Reinstalling Docker or NGINX from the workflow — EC2 is operator-managed.
- ❌ Creating a "setup" or "bootstrap" job that runs once and is then skipped —
  the workflow is fully re-runnable on every push.
- ❌ Echoing `${{ secrets.* }}` values, even to log groups — GitHub masks them
  but it's still bad practice.
- ❌ Changing the blue/green port mapping without updating the NGINX `sed` substitutions.

---

## 📞 Quick Reference

| Want to…                          | Look in                                                              |
|-----------------------------------|----------------------------------------------------------------------|
| Change image name                 | `env:` block at top of `cicd.yml` + `DOCKER_IMAGE` secret            |
| Change ports                      | `docker-compose.{blue,green}.yml` + `sed` lines in deploy/rollback  |
| Add a new env var to backend      | `Create Remote .env File` step in `deploy` job                       |
| Tweak health check                | `Health Check on Target Environment` step                            |
| Force a specific color next run   | `echo green > /home/$USER/deploy/.active_env` on EC2                 |
| Manually re-promote a tag         | `docker tag` + `docker push` for `:stable` on EC2                    |
