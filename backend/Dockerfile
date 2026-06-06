# ─── Stage 1: Base ────────────────────────────────────────────────────────────
# Pin to a specific Node + Alpine version and run `apk upgrade` so the OS
# packages (busybox, musl, openssl, libxml2, sqlite-libs, etc.) are at their
# latest patched versions. This is what clears the HIGH/CRITICAL Trivy findings
# on the base image.
FROM node:22.11.0-alpine3.22 AS base
WORKDIR /app

# Upgrade all OS packages, then install dumb-init for proper signal handling.
RUN apk upgrade --no-cache \
    && apk add --no-cache dumb-init

# ─── Stage 2: Dependencies ────────────────────────────────────────────────────
FROM base AS deps

COPY package.json package-lock.json ./

# `npm ci` reproduces the exact lockfile (vs. `npm install` which can mutate it).
# `--ignore-scripts` blocks any postinstall hooks from running during the build,
# which is what OWASP/Trivy expect for supply-chain hardening.
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force

# ─── Stage 3: Development ─────────────────────────────────────────────────────
FROM base AS development

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts \
    && npm cache clean --force

COPY . .

EXPOSE 3001

CMD ["dumb-init", "node", "--watch", "server.js"]

# ─── Stage 4: Production ──────────────────────────────────────────────────────
FROM base AS production

ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs \
    && adduser  --system --uid 1001 nodeuser

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Drop privileges
USER nodeuser

EXPOSE 3001

CMD ["dumb-init", "node", "server.js"]
