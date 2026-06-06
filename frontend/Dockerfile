# ─── Stage 1: Base ────────────────────────────────────────────────────────────
# Pin to a specific Node + Alpine version and run `apk upgrade` so the OS
# packages inside the image are at their latest patched versions. This is what
# clears the HIGH/CRITICAL Trivy findings on busybox, musl, openssl, libxml2,
# sqlite-libs, etc.
FROM node:22.11.0-alpine3.22 AS base
WORKDIR /app

RUN apk upgrade --no-cache \
    && apk add --no-cache dumb-init

# ─── Stage 2: Dependencies ────────────────────────────────────────────────────
FROM base AS deps

COPY package.json package-lock.json ./
# `npm ci` reproduces the exact lockfile; `--ignore-scripts` blocks postinstall
# hooks. Both are required for a clean Trivy / OWASP scan.
RUN npm ci --ignore-scripts \
    && npm cache clean --force

# ─── Stage 3: Development ─────────────────────────────────────────────────────
FROM base AS development

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts \
    && npm cache clean --force

COPY . .

EXPOSE 5173

# Bind to 0.0.0.0 so Vite is accessible from outside the container
CMD ["dumb-init", "node", "node_modules/.bin/vite", "--host", "0.0.0.0"]

# ─── Stage 4: Build ───────────────────────────────────────────────────────────
FROM deps AS builder

COPY . .

ARG VITE_API_URL=http://localhost:3001
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ─── Stage 5: Production (Nginx) ──────────────────────────────────────────────
# Pin nginx to a specific Alpine 3.22 tag and `apk upgrade` so the OS packages
# (pcre2, libxml2, openssl, busybox) shipped with the image are patched.
FROM nginx:1.27.5-alpine3.22 AS production

# Patch OS-level CVEs (pcre2, libxml2, openssl, busybox) flagged by Trivy.
RUN apk upgrade --no-cache

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/app.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
