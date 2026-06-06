# O Level Stars — MERN Stack with DevSecOps CI/CD

Full-stack learning platform with a React/Vite frontend, Express API, MongoDB Atlas database, and a production-grade blue/green deployment pipeline on AWS EC2.

---

## 📑 Table of Contents

1. [Architecture Overview](#-architecture-overview)
2. [Tech Stack](#-tech-stack)
3. [Local Development (Docker)](#-local-development-docker)
4. [Local Development (without Docker)](#-local-development-without-docker)
5. [Production Infrastructure Setup](#-production-infrastructure-setup)
   - [5.1 AWS Account & IAM](#51-aws-account--iam)
   - [5.2 Launch EC2 Instance](#52-launch-ec2-instance)
   - [5.3 Security Group](#53-security-group)
   - [5.4 EC2 Base Setup](#54-ec2-base-setup)
   - [5.5 Docker Installation](#55-docker-installation)
   - [5.6 NGINX Installation](#56-nginx-installation)
   - [5.7 Passwordless Sudo for the Pipeline](#57-passwordless-sudo-for-the-pipeline)
   - [5.8 MongoDB Atlas IP Allowlist](#58-mongodb-atlas-ip-allowlist)
6. [GitHub Configuration](#-github-configuration)
   - [6.1 Required Secrets](#61-required-secrets)
   - [6.2 Generate SSH Key Pair](#62-generate-ssh-key-pair)
7. [First Deploy & Verification](#-first-deploy--verification)
8. [Blue/Green Deployment](#-bluegreen-deployment)
9. [CI/CD Pipeline Stages](#-cicd-pipeline-stages)
10. [Operational Runbook](#-operational-runbook)
    - [Manual Rollback](#manual-rollback)
    - [Force a Specific Color](#force-a-specific-color)
    - [View Logs](#view-logs)
    - [Cleanup](#cleanup)
11. [Troubleshooting Matrix](#-troubleshooting-matrix)
12. [Security Best Practices](#-security-best-practices)
13. [Environment Variables Reference](#-environment-variables-reference)

---

## 🏗️ Architecture Overview

```
                              ┌──────────────────────┐
                              │   Internet / Users   │
                              └──────────┬───────────┘
                                         │ HTTP :80
                                         ▼
                              ┌──────────────────────┐
                              │   NGINX :80 (host)   │
                              │   /etc/nginx/sites-  │
                              │   available/mern-app │
                              └──────────┬───────────┘
                                         │
                  ┌──────────────────────┴──────────────────────┐
                  │  Active upstream (toggled by CI via sed)     │
                  └──────┬───────────────────────────────┬───────┘
                         │                               │
            ┌────────────▼────────────┐      ┌────────────▼────────────┐
            │  BLUE  (inactive after  │      │  GREEN (currently       │
            │  first deploy)          │      │  serving)               │
            │                         │      │                         │
            │  ┌─ frontend-blue :8080 │      │  ┌─ frontend-green :8081 │
            │  │   (NGINX inside)     │      │  │   (NGINX inside)      │
            │  └──────────┬───────────┘      │  └───────────┬───────────┘
            │             │                  │              │
            │  ┌─ backend-blue  :5000 │      │  ┌─ backend-green :5001 │
            │  │   (Node/Express)      │      │  │   (Node/Express)     │
            │  └──────────┬────────────┘      │  └───────────┬──────────┘
            └─────────────┼──────────────────┘─────────────────┼──────────
                          │                                    │
                          └─────────────┬──────────────────────┘
                                        │
                                        ▼
                              ┌──────────────────────┐
                              │   MongoDB Atlas      │
                              │   (cloud, IP-locked) │
                              └──────────────────────┘

   ┌─────────────────────────────────────────────────────────────────┐
   │  GitHub Actions  ──build──►  Docker Hub  ──pull──►  EC2         │
   │       (4 jobs: ci → build → deploy → rollback)                  │
   └─────────────────────────────────────────────────────────────────┘
```

**Key properties:**

- **Zero-downtime deploys:** new version is started in the idle color, health-checked, then NGINX flips traffic.
- **Instant rollback:** the previous color stays running until the next deploy — one `sed` + `nginx -s reload` reverts.
- **Promoted `:stable` tag** only exists after a successful deploy.

---

## 🧰 Tech Stack

| Layer        | Technology                                                |
|--------------|-----------------------------------------------------------|
| Frontend     | React 18, Vite, NGINX (inside container)                  |
| Backend      | Node.js 22, Express                                       |
| Database     | MongoDB Atlas                                             |
| CI/CD        | GitHub Actions (`ubuntu-latest` runners)                  |
| Security     | SonarQube (self-hosted), Trivy, OWASP Dependency-Check   |
| Image Reg.   | Docker Hub                                                |
| Hosting      | AWS EC2 (Ubuntu 22.04 LTS)                                |
| Reverse Proxy| NGINX (host) — blue/green switcher                        |

---

## 🚀 Local Development (Docker)

1. Copy the root env template:
   ```bash
   cp .env.example .env
   ```
2. Edit `.env` — set `MONGO_URI`, `JWT_SECRET`, and admin credentials.
3. Start everything:
   ```bash
   docker compose up --build
   ```
   - **Frontend** → http://localhost:5173
   - **Backend API** → http://localhost:3001

> ℹ️ The root `docker-compose.yml` is for **local dev only**. The pipeline uses
> `docker-compose.blue.yml` and `docker-compose.green.yml` for production.

---

## 🛠️ Local Development (without Docker)

```bash
# Backend
cd backend && npm install
cp .env.example .env       # configure MONGO_URI, JWT_SECRET, ADMIN_*
npm run dev                # → http://localhost:3001

# Frontend (separate terminal)
cd frontend && npm install
cp .env.example .env.local # set VITE_API_URL=http://localhost:3001
npm run dev                # → http://localhost:5173
```

---

## 🏭 Production Infrastructure Setup

> The pipeline does **not** install Docker, NGINX, or any system packages.
> Everything below is **operator-managed, one-time** work.

### 5.1 AWS Account & IAM

1. Sign in to AWS Console → **IAM** → **Users** → **Create user**.
2. Attach policies: `AmazonEC2ReadOnlyAccess` (or `AdministratorAccess` for first setup).
3. Create an **Access Key** (CLI type) — store `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` locally for CLI use.
4. (Recommended) Enable **MFA** on the root account and on the IAM user.

### 5.2 Launch EC2 Instance

| Setting              | Value                                                |
|----------------------|------------------------------------------------------|
| AMI                  | Ubuntu Server 22.04 LTS (x86_64)                     |
| Instance type        | `t3.small` (2 vCPU / 2 GB RAM) — minimum for MERN    |
| Key pair             | Create new → **save the `.pem` locally**             |
| Storage              | 20 GB gp3 (default is fine)                          |
| IAM role             | Attach a role with `AmazonEC2ContainerRegistryReadOnly` (optional) |

> 💡 The `t3.small` is sufficient for low traffic. Scale up to `t3.medium` for
> ~1000 concurrent users. The instance runs **both** blue and green containers
> simultaneously, so size for 2× peak memory.

**Tag the instance:** `Name=mern-prod`, `Environment=production`.

### 5.3 Security Group

Create a security group named `mern-prod-sg` with these **inbound** rules:

| Type        | Protocol | Port Range | Source           | Purpose                |
|-------------|----------|------------|------------------|------------------------|
| SSH         | TCP      | 22         | Your IP /32      | Admin & GitHub Actions |
| HTTP        | TCP      | 80         | `0.0.0.0/0`      | Public web traffic     |
| HTTPS       | TCP      | 443        | `0.0.0.0/0`      | TLS (when you add it)  |

> 🔒 **Do NOT** expose 5000/5001/8080/8081 publicly — NGINX proxies them on
> localhost only. Internal container ports stay firewalled.

### 5.4 EC2 Base Setup

SSH into the instance:
```bash
ssh -i ~/path/to/key.pem ubuntu@<EC2_PUBLIC_IP>
```

Run the bootstrap:
```bash
# Update OS
sudo apt update && sudo apt upgrade -y

# Set timezone (optional but recommended for log correlation)
sudo timedatectl set-timezone UTC

# Create deployment directory
mkdir -p /home/ubuntu/deploy
chmod 755 /home/ubuntu/deploy

# Set hostname (helps with log clarity)
sudo hostnamectl set-hostname mern-prod
```

### 5.5 Docker Installation

```bash
# Install Docker Engine + Compose plugin
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add ubuntu user to docker group (so sudo isn't required)
sudo usermod -aG docker ubuntu
newgrp docker

# Verify
docker --version
docker compose version
```

### 5.6 NGINX Installation

```bash
sudo apt install -y nginx

# Remove default site
sudo rm -f /etc/nginx/sites-enabled/default

# Create symlink for the MERN site (the file itself is bootstrapped by CI on first deploy)
sudo ln -s /etc/nginx/sites-available/mern-app /etc/nginx/sites-enabled/mern-app

# Allow NGINX through the firewall (if ufw is enabled)
sudo ufw allow 'Nginx Full'
sudo ufw allow OpenSSH
sudo ufw enable  # if not already enabled

# Verify NGINX is running (it will error on the missing file — that's expected on first boot)
sudo systemctl status nginx
```

> ℹ️ The `mern-app` site file does **not** exist yet. The GitHub Actions
> `deploy` job creates it on the first successful run (via `sudo tee`).

### 5.7 Passwordless Sudo for the Pipeline

The pipeline runs several `sudo` commands without a TTY. Add a dedicated
sudoers drop-in:

```bash
sudo visudo -f /etc/sudoers.d/github-actions
```

Paste (replace `ubuntu` if your `AWS_USER` is different):
```
ubuntu ALL=(ALL) NOPASSWD: /usr/sbin/nginx
ubuntu ALL=(ALL) NOPASSWD: /bin/sed -i * /etc/nginx/sites-available/mern-app
ubuntu ALL=(ALL) NOPASSWD: /bin/cp * /etc/nginx/sites-available/mern-app.bak
ubuntu ALL=(ALL) NOPASSWD: /bin/systemctl reload nginx
ubuntu ALL=(ALL) NOPASSWD: /usr/bin/tee /etc/nginx/sites-available/mern-app
ubuntu ALL=(ALL) NOPASSWD: /usr/bin/ln -sf /etc/nginx/sites-available/mern-app /etc/nginx/sites-enabled/mern-app
ubuntu ALL=(ALL) NOPASSWD: /bin/rm -f /etc/nginx/sites-enabled/mern-app
ubuntu ALL=(ALL) NOPASSWD: /bin/rm -f /etc/nginx/sites-enabled/default
ubuntu ALL=(ALL) NOPASSWD: /bin/chmod 644 /etc/nginx/sites-available/mern-app
```

Save, then:
```bash
sudo chmod 440 /etc/sudoers.d/github-actions
```

Validate:
```bash
sudo -n nginx -t   # should succeed with no password prompt
```

### 5.8 MongoDB Atlas IP Allowlist

1. Atlas → **Network Access** → **Add IP Address**.
2. Add the **EC2 instance's public IP** (or `0.0.0.0/0` for dev, **never** for prod).
3. Create a **database user** with read/write on the target database.
4. Copy the connection string — you'll use it as the `MONGODB_URI` secret.

> 🔒 Production: lock the Atlas user down to a specific database, and use
> Atlas's **IP Access List** with the **EC2 Elastic IP** (allocate one and
> attach it to the instance so the IP doesn't change on stop/start).

---

## 🔐 GitHub Configuration

### 6.1 Required Secrets

Go to: **Repo → Settings → Secrets and variables → Actions → New repository secret**

| Secret                 | Description                                          | Example                              |
|------------------------|------------------------------------------------------|--------------------------------------|
| `DOCKERHUB_USERNAME`   | Docker Hub login                                     | `myuser`                             |
| `DOCKERHUB_TOKEN`      | Docker Hub PAT (not password)                        | `dckr_pat_xxx...`                    |
| `DOCKER_IMAGE`         | Base image (workflow appends `-frontend`/`-backend`)  | `myuser/mern-app`                    |
| `AWS_HOST`             | EC2 public IP or DNS                                 | `54.123.45.67` or `ec2-...compute.amazonaws.com` |
| `AWS_USER`             | SSH username                                         | `ubuntu`                             |
| `AWS_SSH_PRIVATE_KEY`  | Full private key (BEGIN/END included)                | *(paste entire key)*                 |
| `MONGODB_URI`          | MongoDB Atlas connection string                      | `mongodb+srv://user:pass@cluster...` |
| `JWT_SECRET`           | JWT signing key (min 32 random chars)                | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `NODE_ENV`             | Node environment                                     | `production`                         |
| `SERVER_PORT`          | Backend port inside container                        | `5000`                               |
| `SONAR_HOST_URL`       | Self-hosted SonarQube                                | `https://sonar.mycompany.com`        |
| `SONAR_TOKEN`          | SonarQube auth token                                 | `sqp_xxx...`                         |
| `ADMIN_EMAIL`          | Bootstrap admin email                                | `admin@example.com`                  |
| `ADMIN_PASSWORD`       | Bootstrap admin password                             | *(strong password)*                  |

**Optional workflow permissions** (set at repo level under *Settings → Actions → General*):
- Workflow permissions: **Read and write permissions** (needed for some upload-artifact features)
- Allow GitHub Actions to create and approve pull requests: **off** (we don't use it)

### 6.2 Generate SSH Key Pair

The pipeline needs an SSH keypair. The **public** half lives on the EC2, the
**private** half is a GitHub secret.

**On your local machine:**
```bash
ssh-keygen -t ed25519 -C "github-actions@mern-prod" -f ~/.ssh/mern-prod-actions
```

**Copy the public key to EC2:**
```bash
ssh-copy-id -i ~/.ssh/mern-prod-actions.pub ubuntu@<EC2_PUBLIC_IP>
```

Verify passwordless login:
```bash
ssh -i ~/.ssh/mern-prod-actions ubuntu@<EC2_PUBLIC_IP> "docker --version"
```

**Set the GitHub secret:**
1. Open the **private** key:
   ```bash
   cat ~/.ssh/mern-prod-actions
   ```
2. Copy the entire output (including `-----BEGIN OPENSSH PRIVATE KEY-----` and
   `-----END OPENSSH PRIVATE KEY-----`).
3. Add a new secret named `AWS_SSH_PRIVATE_KEY` with that content.

> ⚠️ Never commit the private key. Never share it. Rotate immediately if leaked.

---

## ✅ First Deploy & Verification

1. **Pre-seed EC2 state** (optional but cleanest):
   ```bash
   echo "blue"   > /home/ubuntu/deploy/.active_env
   echo "stable" > /home/ubuntu/deploy/.stable_tag
   ```

2. **Push to `main`** (or run the workflow via **Actions → Run workflow**).

3. **Watch the pipeline:**
   - `ci` — secrets validated, SonarQube + OWASP + Trivy run
   - `build` — images pushed to Docker Hub as `latest` + `sha-<commit>`
   - `deploy` — green env comes up, health check passes, NGINX switches, `:stable` tag promoted

4. **Verify the site is live:**
   ```bash
   curl -I http://<EC2_PUBLIC_IP>/
   curl http://<EC2_PUBLIC_IP>/api/health
   ```

5. **Confirm blue/green is alternating:** run the workflow again — the next
   deploy should target blue, then green, alternating.

---

## 🔵🟢 Blue/Green Deployment

### How it works

| Step | What happens                                                                       |
|------|------------------------------------------------------------------------------------|
| 1    | Pipeline reads `/home/ubuntu/deploy/.active_env` to find the **currently serving** color |
| 2    | Pipeline targets the **other** color (idle) for the new deploy                     |
| 3    | New version's containers start on the idle ports (8081/5001 if target is green)   |
| 4    | Pipeline runs 30 health-check probes (5 min budget) on the new env                 |
| 5    | On pass: `sed` flips NGINX upstream to the new ports, `nginx -s reload`            |
| 6    | Old containers stay running — they become the rollback target                      |
| 7    | `:stable` Docker tag is promoted for the new image                                 |

### Port Map

| Env     | Frontend (host) | Frontend (container) | Backend (host) | Backend (container) |
|---------|-----------------|----------------------|----------------|---------------------|
| Blue    | 8080            | 80                   | 5000           | 5000                |
| Green   | 8081            | 80                   | 5001           | 5000                |

### Why this is safe

- The "old" environment is **never killed** during a successful deploy — only
  the NGINX upstream pointer changes.
- A failed health check triggers the `rollback` job, which restores the old env.
- The `:stable` tag is only moved after health passes — rollback always has a
  known-good image to revert to.

---

## ⚙️ CI/CD Pipeline Stages

The pipeline is defined in [`.github/workflows/cicd.yml`](.github/workflows/cicd.yml).

### Job 1 — `ci` (Static Analysis & Security Scans)
- Validates that all required secrets are set (fail-fast on missing).
- Generates `sonar-project.properties` dynamically if not committed.
- Runs **SonarQube** scan (self-hosted).
- Runs **OWASP Dependency-Check** (fails on CRITICAL).
- Runs **Trivy** filesystem scan (fails on HIGH/CRITICAL).
- Uploads Trivy report as artifact.

### Job 2 — `build` (Build & Push Docker Images)
- Sets up Docker Buildx with layer caching.
- Builds **frontend** and **backend** images in parallel.
- Tags each as `latest` and `sha-${GITHUB_SHA}`.
- Pushes to Docker Hub (skipped on PRs).
- Runs **Trivy** image scan (fails on HIGH/CRITICAL).

### Job 3 — `deploy` (Blue/Green to EC2)
1. Determines target env from `/home/ubuntu/deploy/.active_env`.
2. SSHs into EC2, copies `.env` and compose files.
3. Bootstraps `/etc/nginx/sites-available/mern-app` if missing.
4. Pulls new images and starts containers in the target env.
5. Runs 30 health-check probes (300s budget) on `/api/health` and `/`.
6. On pass: rewrites NGINX upstream ports, reloads NGINX, updates state.
7. Promotes `:stable` tag on Docker Hub.
8. Cleans up images older than 7 days.

### Job 4 — `rollback` (Automatic on Failure)
- Triggers **only** if `deploy` fails.
- Pulls the last `:stable` images.
- Restarts the previous working environment.
- Re-verifies health, then flips NGINX back.
- Updates state files so the next deploy targets the correct env.

---

## 📖 Operational Runbook

### Manual Rollback

If you need to revert outside the pipeline:
```bash
ssh ubuntu@<EC2_HOST>

cd /home/ubuntu/deploy
source .env

# Pull the last known-good tag
docker pull $FRONTEND_IMAGE:stable
docker pull $BACKEND_IMAGE:stable

# Bring up the *other* color with :stable
docker compose -f docker-compose.green.yml down
FRONTEND_IMAGE=$FRONTEND_IMAGE BACKEND_IMAGE=$BACKEND_IMAGE IMAGE_TAG=stable \
  docker compose -f docker-compose.green.yml up -d

# Verify health
curl http://localhost:5001/api/health

# Flip NGINX (green = 8081/5001)
sudo sed -i 's/127.0.0.1:8080/127.0.0.1:8081/' /etc/nginx/sites-available/mern-app
sudo sed -i 's/127.0.0.1:5000/127.0.0.1:5001/' /etc/nginx/sites-available/mern-app
sudo nginx -t && sudo nginx -s reload
```

### Force a Specific Color

```bash
ssh ubuntu@<EC2_HOST>
echo "blue" > /home/ubuntu/deploy/.active_env   # or "green"
# Next deploy will target the opposite color
```

### View Logs

```bash
# Live tail of the active env
docker compose -f /home/ubuntu/deploy/docker-compose.green.yml logs -f

# NGINX access/error
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# GitHub Actions
# → Repo → Actions → select run → expand failed step
```

### Cleanup

```bash
# Remove dangling images (keeps tagged ones)
docker image prune -f

# Remove all images older than 7 days
docker image prune -af --filter "until=168h"

# Remove stopped containers
docker container prune -f
```

The pipeline runs the 7-day prune automatically after each successful deploy.

---

## 🔧 Troubleshooting Matrix

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| `ci` job fails with "Missing required secret: X" | Secret not set in GitHub | Add it under Settings → Secrets |
| `build` job fails on Trivy image scan | Image has HIGH/CRITICAL CVE | Update base image or add to `.trivyignore`; investigate before ignoring |
| `deploy` step "Permission denied" on `sudo sed` | Passwordless sudo rules missing or wrong user | Re-check `/etc/sudoers.d/github-actions`; replace `ubuntu` with your `AWS_USER` |
| `deploy` step "Permission denied" on `docker` | User not in `docker` group | `sudo usermod -aG docker ubuntu && newgrp docker` |
| Health check fails repeatedly, exit 1 | Backend `/api/health` doesn't return expected body | Backend must return HTTP 200 with body containing `ok`/`healthy`/`success` |
| Health check fails on port 5001/8081 | Container didn't start (image pull error, env var missing) | SSH in: `docker logs mern-backend-green` |
| `nginx -t` fails after sed | `sed` produced malformed config | Restore from backup: `sudo cp /etc/nginx/sites-available/mern-app.bak /etc/nginx/sites-available/mern-app` |
| Rollback job triggers but fails too | No `:stable` tag exists (first deploy failed) | Manually re-run the build job; verify the `:stable` tag exists on Docker Hub |
| Site returns 502 Bad Gateway | NGINX can't reach the upstream port | Check the active color: `cat /home/ubuntu/deploy/.active_env`; check containers: `docker ps` |
| Containers running but site is slow | Instance under-provisioned (CPU/memory) | Scale to `t3.medium` or `t3.large`; check `htop` and `docker stats` |
| MongoDB connection error in backend logs | Atlas IP not allowlisted, or wrong URI | Atlas → Network Access → add EC2 Elastic IP; verify `MONGODB_URI` secret |
| SSH connection refused from GitHub Actions | Wrong host, port 22 closed in SG, or wrong key | Test manually: `ssh -i ~/.ssh/mern-prod-actions ubuntu@<EC2_IP>` |
| Deploy succeeds but `latest` is not the version you expect | Someone else pushed, or the workflow ran on a PR (no push) | Check the SHA in the workflow run summary; confirm the right branch triggered |
| `Cannot connect to Docker daemon` on EC2 | Docker service stopped | `sudo systemctl status docker && sudo systemctl start docker` |
| `trivy-action` step times out | Trivy DB download is slow on first run | Re-run the job (DB is cached after first download) |
| `OWASP Dependency-Check` step takes > 20 min | First run downloads the NVD CVE feed | Subsequent runs are faster; consider running on a self-hosted runner with persistent cache |

---

## 🛡️ Security Best Practices

This pipeline follows these DevSecOps practices:

1. **Secret hygiene**
   - All secrets stored only in GitHub Secrets — never in code, logs, or env files committed to git.
   - `.env` files on EC2 are `chmod 600` and only readable by the deploy user.
   - `sudo` invocations are limited to specific commands via `sudoers.d` drop-in.

2. **Image security**
   - Trivy scans on filesystem **and** final images — pipeline fails on HIGH/CRITICAL.
   - OWASP Dependency-Check for known CVEs in npm packages.
   - SonarQube for code quality and security hotspots.

3. **Network security**
   - Only ports 22, 80, 443 exposed publicly. Internal blue/green ports stay on localhost.
   - MongoDB Atlas IP allowlist locked to the EC2 Elastic IP.
   - NGINX ships with security headers (HSTS, X-Frame-Options, etc.).

4. **Deployment safety**
   - Blue/green ensures zero-downtime.
   - Health checks must pass before traffic shifts.
   - Automatic rollback on any failure.
   - Old environment kept running until next deploy.

5. **Least privilege**
   - SSH user has sudo access only for the specific commands the pipeline needs.
   - GitHub Actions uses the default `GITHUB_TOKEN` with minimal permissions.

6. **Auditability**
   - Every deploy produces a GitHub Actions summary with target env, image tag, and rollback status.
   - State files on EC2 (`.active_env`, `.stable_tag`) make the current state trivially inspectable.

7. **Recommended additions** (out of scope for this README, but worth considering)
   - **TLS termination at NGINX** with Let's Encrypt (`certbot --nginx`).
   - **Fail2ban** on SSH.
   - **CloudWatch agent** for centralized logs.
   - **EC2 Instance Connect** instead of long-lived SSH keys.
   - **GitHub branch protection** requiring CI to pass before merge.
   - **Dependabot** for automated dependency PRs.

---

## 🌐 Environment Variables Reference

### Local `.env.example` (committed)
See [`.env.example`](.env.example).

### GitHub Secrets (production)

See [section 6.1](#61-required-secrets) for the full table.

### Injected into EC2 at deploy time

These land in `/home/ubuntu/deploy/.env` (chmod 600) and are read by the
blue/green compose files:

```
ADMIN_EMAIL
ADMIN_PASSWORD
MONGODB_URI
JWT_SECRET
NODE_ENV
SERVER_PORT
DOCKER_IMAGE
IMAGE_TAG          # sha-${GITHUB_SHA} during deploy
FRONTEND_IMAGE     # ${DOCKER_IMAGE}-frontend
BACKEND_IMAGE      # ${DOCKER_IMAGE}-backend
```

> ⚠️ **Never commit `.env` files, real credentials, or API keys to version control.**
