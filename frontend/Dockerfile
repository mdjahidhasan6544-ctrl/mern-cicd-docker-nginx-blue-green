# ─── Stage 1: Base ────────────────────────────────────────────────────────────
FROM node:22-alpine@sha256:968df39aedcea65eeb078fb336ed7191baf48f972b4479711397108be0966920 AS base
WORKDIR /app

# Container image metadata
LABEL org.opencontainers.image.title="mern-frontend" \
      org.opencontainers.image.description="MERN frontend service (Vite/React + Nginx)" \
      org.opencontainers.image.source="https://github.com/mdjahidhasan6544-ctrl/mern-cicd-docker-nginx-blue-green" \
      org.opencontainers.image.licenses="MIT"

# Upgrade all OS packages to latest patched versions to clear Trivy CVEs
# (libcrypto3, libssl3, libexpat, libpng, libxml2, musl, musl-utils,
#  nghttp2-libs, zlib). --no-cache avoids storing the apk index.
RUN apk upgrade --no-cache

RUN apk add --no-cache dumb-init

# ─── Stage 2: Dependencies ────────────────────────────────────────────────────
FROM base AS deps

COPY package.json package-lock.json ./
RUN npm install --ignore-scripts \
    && npm cache clean --force

# ─── Stage 3: Development ─────────────────────────────────────────────────────
FROM base AS development

COPY package.json package-lock.json ./
RUN npm install --ignore-scripts \
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
FROM nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10 AS production

# Upgrade all OS packages to latest patched versions to clear Trivy CVEs
RUN apk upgrade --no-cache

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Ensure the built-in nginx user owns the writable runtime directories
# so the process can run as non-root (hadolint DL3025 + runtime security).
RUN chown -R nginx:nginx /var/cache/nginx /var/log/nginx /usr/share/nginx/html

COPY nginx.conf /etc/nginx/conf.d/app.conf
COPY --from=builder /app/dist /usr/share/nginx/html

# Drop privileges — the official nginx:alpine image ships an `nginx` user
RUN chown -R nginx:nginx /usr/share/nginx/html
USER nginx

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
