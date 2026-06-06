# ─── Stage 1: Base ────────────────────────────────────────────────────────────
FROM node:22-alpine AS base
WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# ─── Stage 2: Dependencies ────────────────────────────────────────────────────
FROM base AS deps

COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm install --omit=dev --ignore-scripts \
    && npm cache clean --force

# ─── Stage 3: Development ─────────────────────────────────────────────────────
FROM base AS development

COPY package.json package-lock.json ./
RUN npm install --ignore-scripts \
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
