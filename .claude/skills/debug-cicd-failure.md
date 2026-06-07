---
name: debug-cicd-failure
description: Diagnose failing GitHub Actions runs in this MERN repo. Use when a job in .github/workflows/cicd.yml fails or behaves unexpectedly.
---

# Debug a failing MERN CI/CD run

## Inputs needed
- Failing job name (`test`, `ci`, `build`, `deploy`, or `rollback`)
- The step name that failed
- The error message or last 30 lines of log
- (Optional) The commit SHA / branch

## Diagnostic flow

### 1. Identify job + step
Match the failing step to one of the 5 jobs. The job is the unit of `needs`, so an earlier job's failure will cascade.

### 2. Common failure points (in workflow order)

**`test` job**
- `npm ci` fails on lockfile drift → run `npm install` locally and commit `package-lock.json`
- `npm run lint` exit code != 0 → fix lint errors in `backend/src` or `frontend/src`
- `npm run format:check` → run `npm run format` in that subpackage
- `npm test` (vitest) → check coverage thresholds in `vitest.config.js`

**`ci` job**
- "Missing required secret" → set the secret in repo Settings → Secrets and variables → Actions
- SonarQube 401/403 → `SONAR_TOKEN` invalid or `SONAR_HOST_URL` unreachable
- OWASP dependency-check download is slow → first run can take 5+ min
- Trivy FS scan finds HIGH/CRITICAL → patch or add ignore with justification
- hadolint SARIF upload fails → check Dockerfile exists at that path

**`build` job**
- `docker/setup-buildx-action` → ensure runner is `ubuntu-latest`
- Docker Hub login 401 → rotate `DOCKERHUB_TOKEN`
- Image push fails on PR → `push: ${{ github.event_name != 'pull_request' }}` skips push on PRs (expected)
- Trivy image scan blocks build → base image has unpatched CVE; rebuild with `--build-arg BUILDKIT_INLINE_CACHE=1` or bump base image
- SBOM action (anchore/sbom-action@v0) → image must exist locally; if push was skipped (PR), use `syft` directly on Dockerfile

**`deploy` job**
- "Determine Target Environment" reads `/tmp/last_active_env` which is on the **runner**, not the EC2 → state is lost between runs. The first run will always default to `blue`.
- SSH "Permission denied (publickey)" → `AWS_SSH_PRIVATE_KEY` malformed; re-paste the key including `-----BEGIN OPENSSH PRIVATE KEY-----` header
- `scp` fails with "No such file or directory" → `./.deploy/.env` was not created; check the "Create Remote .env File" step
- Health check loop times out (5 min) → check `docker compose logs <svc>` on EC2, or look for port conflicts (`ss -tlnp | grep 5000`)
- `nginx -t` fails after sed substitution → the previous run's sed may have replaced both 8080→8081 lines; check the file manually on EC2
- `cosign sign` fails with OIDC error → `permissions: id-token: write` is set on this job (line 427), but the environment may be blocking OIDC
- `cosign verify` returns empty → image was never signed; check that the prior `Sign ... :stable` steps ran (they're gated on `steps.health.outcome == 'success'`)

**`rollback` job**
- `needs.deploy.result == 'failure'` is the gate → if the deploy step "succeeded" with health-check skipped, rollback won't trigger
- cosign verify fails → `:stable` image was never signed (e.g. deploy failed before signing)
- NGINX config missing → rollback bootstraps it, but the first run after a fresh EC2 may take longer

### 3. Local reproduction
```bash
# Reproduce the failing step in the matching subpackage
cd backend && npm ci && npm run lint && npm test
cd frontend && npm ci && npm run lint && npm test

# Reproduce a docker build
docker build -t test-fe ./frontend
docker build -t test-be ./backend

# Reproduce trivy locally
trivy fs --severity HIGH,CRITICAL .
```

### 4. State files on EC2
These are read by the workflow. Inspect them via `ssh ec2`:
- `/home/$USER/deploy/.active_env` — currently-serving color
- `/home/$USER/deploy/.target_env` — last deployed target
- `/home/$USER/deploy/.stable_tag` — last known-good image tag
- `/home/$USER/deploy/.health` — health-check result
- `/home/$USER/deploy/.env` — runtime env (do not commit)

If `.active_env` is corrupted, manually `echo blue > /home/$USER/deploy/.active_env` to reset.

### 5. Useful GitHub CLI queries (when gh is installed)
```bash
gh run list --workflow=cicd.yml --limit 5
gh run view <run-id> --log-failed
gh run view <run-id> --job <job-id>
```

### 6. When the MCP server is configured
After adding `.mcp.json` and a `GITHUB_PERSONAL_ACCESS_TOKEN` env var, the GitHub MCP server exposes:
- `list_workflow_runs` — recent runs of a workflow
- `get_job_logs` — full logs of a job (preferred over `gh run view --log-failed` for large logs)
- `actions_get_workflow_run` — metadata about a single run
- `get_workflow_run_logs` — zip of all logs for a run

## Output template
When reporting a fix, include:
1. **Job + step** that failed
2. **Root cause** (one sentence)
3. **Change applied** (file + diff)
4. **Verification** (how you re-ran the job or reproduced locally)
